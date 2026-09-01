import { writeFileSync, mkdirSync, renameSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
    ALL_TICKERS,
    MARKET_SNAPSHOT_SYMBOLS,
    ALERT_THRESHOLD,
    STOCHASTIC_THRESHOLD,
    US_MARKET_HOLIDAYS,
} from "../ticker-alerts.js";
import { getETDateTimeParts, isMarketOpen } from "./market-hours.js";
import { calculateStochastic } from "./stochastic.js";
import { fetchTickerHistory } from "./yahoo.js";
import { loadAlertState, saveAlertState, alreadyFiredToday, markFiredToday, appendAlertHistory } from "./alert-state.js";
import { fetchWeeklyNetReturn } from "./etf-net-return.js";
import type { AlertEvent, AlertType, Snapshot, TickerHistory, TickerReading } from "./types.js";

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_DIR = join(ROOT_DIR, "data");
const SNAPSHOT_PATH = join(DATA_DIR, "snapshot.json");
const STATE_PATH = join(DATA_DIR, "alert-state.json");
const HISTORY_PATH = join(DATA_DIR, "alert-history.csv");
const ETF_CHARTS_PATH = join(DATA_DIR, "etf-charts.json");

// Chart scenes cover these tickers, since 2010 (the "since 2023" scenes filter this client-side).
const ETF_CHART_TICKERS = ["IVV", "IYW"];
const ETF_CHARTS_SINCE = "2010-01-01T00:00:00Z";

// All-time-high breakout tolerance: treat "within 0.1% of ATH" as a breakout too.
const ATH_TOLERANCE = 0.001;

async function main(): Promise<void> {
    const nowET = getETDateTimeParts();
    const marketStatus = isMarketOpen(US_MARKET_HOLIDAYS, nowET);
    const todayStr = nowET.dateStr;

    // Stochastic only applies to the 34 DJIA/ETF tickers; ATH + % change apply to
    // that same set plus the 6 market-snapshot symbols (union avoids double fetches
    // for symbols like USDCLP=X that appear in both lists).
    const mainTickerSet = new Set(ALL_TICKERS);
    const uniqueTickers = Array.from(new Set([...ALL_TICKERS, ...MARKET_SNAPSHOT_SYMBOLS.map((s) => s.ticker)]));

    const fetchResults = await Promise.allSettled(uniqueTickers.map((ticker) => fetchTickerHistory(ticker)));
    const historyByTicker = new Map<string, TickerHistory | null>();
    uniqueTickers.forEach((ticker, i) => {
        const result = fetchResults[i];
        historyByTicker.set(ticker, result.status === "fulfilled" ? result.value : null);
    });

    const state = loadAlertState(STATE_PATH);
    const newAlerts: AlertEvent[] = [];

    const buildReading = (ticker: string, label?: string): TickerReading => {
        const history = historyByTicker.get(ticker);
        const checkStochastic = mainTickerSet.has(ticker);

        if (!history) {
            return {
                ticker,
                label,
                dataAvailable: false,
                isAlertPriceChange: false,
                isAlertStochastic: false,
                isAlertAllTimeHigh: false,
            };
        }

        const percentChange = ((history.currentPrice - history.previousClose) / history.previousClose) * 100;
        const stochastic = checkStochastic ? calculateStochastic(history.highs, history.lows, history.closes) : null;
        const isAlertPriceChange = Math.abs(percentChange) >= ALERT_THRESHOLD;
        const isAlertStochastic = stochastic !== null && stochastic.K <= STOCHASTIC_THRESHOLD;
        const isAlertAllTimeHigh = history.currentPrice >= history.allTimeHigh * (1 - ATH_TOLERANCE);

        maybeFireAlert(ticker, "price_change", isAlertPriceChange, {
            currentPrice: history.currentPrice,
            previousClose: history.previousClose,
            percentChange,
        });
        maybeFireAlert(ticker, "stochastic", isAlertStochastic, {
            stochasticK: stochastic?.K,
            stochasticD: stochastic?.D,
        });
        maybeFireAlert(ticker, "all_time_high", isAlertAllTimeHigh, {
            currentPrice: history.currentPrice,
            allTimeHigh: history.allTimeHigh,
            percentChange,
        });

        return {
            ticker,
            label,
            dataAvailable: true,
            currentPrice: history.currentPrice,
            previousClose: history.previousClose,
            percentChange,
            stochasticK: stochastic?.K,
            stochasticD: stochastic?.D,
            allTimeHigh: history.allTimeHigh,
            isAlertPriceChange,
            isAlertStochastic,
            isAlertAllTimeHigh,
        };
    };

    function maybeFireAlert(
        ticker: string,
        type: AlertType,
        isActive: boolean,
        values: Omit<AlertEvent, "timestamp" | "ticker" | "type">,
    ): void {
        if (!marketStatus.isOpen || !isActive || alreadyFiredToday(state, ticker, type, todayStr)) return;

        newAlerts.push({ timestamp: new Date().toISOString(), ticker, type, ...values });
        markFiredToday(state, ticker, type, todayStr);
    }

    const tickers = ALL_TICKERS.map((ticker) => buildReading(ticker));
    const marketSnapshot = MARKET_SNAPSHOT_SYMBOLS.map(({ label, ticker }) => buildReading(ticker, label));

    const snapshot: Snapshot = {
        generatedAt: new Date().toISOString(),
        marketStatus: { isOpen: marketStatus.isOpen, reason: marketStatus.reason },
        tickers,
        marketSnapshot,
        newAlerts,
    };

    saveAlertState(STATE_PATH, state);
    appendAlertHistory(HISTORY_PATH, newAlerts);
    writeSnapshotAtomic(snapshot);
    await refreshEtfChartsIfStale(todayStr);

    console.log(
        `[GabboTV] ${snapshot.generatedAt} marketOpen=${marketStatus.isOpen} tickers=${tickers.length} ` +
        `newAlerts=${newAlerts.length}`,
    );
}

function writeSnapshotAtomic(snapshot: Snapshot): void {
    mkdirSync(DATA_DIR, { recursive: true });
    const tmpPath = `${SNAPSHOT_PATH}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), "utf8");
    renameSync(tmpPath, SNAPSHOT_PATH);
}

// Weekly data barely moves intraday, so only refetch once per trading day instead of every 5 min.
async function refreshEtfChartsIfStale(todayStr: string): Promise<void> {
    if (existsSync(ETF_CHARTS_PATH)) {
        try {
            const existing = JSON.parse(readFileSync(ETF_CHARTS_PATH, "utf8")) as { generatedAtDate?: string };
            if (existing.generatedAtDate === todayStr) return;
        } catch {
            // Fall through and regenerate on a parse failure.
        }
    }

    const results = await Promise.allSettled(ETF_CHART_TICKERS.map((symbol) => fetchWeeklyNetReturn(symbol, ETF_CHARTS_SINCE)));
    const charts: Record<string, unknown> = {};
    ETF_CHART_TICKERS.forEach((symbol, i) => {
        const result = results[i];
        if (result.status === "fulfilled" && result.value) charts[symbol] = result.value;
    });

    const payload = { generatedAtDate: todayStr, generatedAt: new Date().toISOString(), charts };
    const tmpPath = `${ETF_CHARTS_PATH}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(payload, null, 2), "utf8");
    renameSync(tmpPath, ETF_CHARTS_PATH);
}

main().catch((error) => {
    console.error("[GabboTV] Fatal error:", error);
    process.exitCode = 1;
});
