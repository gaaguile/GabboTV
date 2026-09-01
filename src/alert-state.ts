import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AlertEvent, AlertType } from "./types.js";

// Per-ticker/condition date of last firing, so each alert fires at most once per trading day.
type AlertState = Record<string, Partial<Record<AlertType, string>>>;

export function loadAlertState(statePath: string): AlertState {
    if (!existsSync(statePath)) return {};
    try {
        return JSON.parse(readFileSync(statePath, "utf8")) as AlertState;
    } catch (error) {
        console.error(`[alert-state] Failed to read ${statePath}, starting fresh:`, error);
        return {};
    }
}

export function saveAlertState(statePath: string, state: AlertState): void {
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

export function alreadyFiredToday(state: AlertState, ticker: string, type: AlertType, todayStr: string): boolean {
    return state[ticker]?.[type] === todayStr;
}

export function markFiredToday(state: AlertState, ticker: string, type: AlertType, todayStr: string): void {
    state[ticker] = { ...state[ticker], [type]: todayStr };
}

const CSV_HEADER = "timestamp,ticker,type,currentPrice,previousClose,percentChange,stochasticK,stochasticD,allTimeHigh\n";

export function appendAlertHistory(historyPath: string, events: AlertEvent[]): void {
    if (events.length === 0) return;

    mkdirSync(dirname(historyPath), { recursive: true });
    if (!existsSync(historyPath)) {
        writeFileSync(historyPath, CSV_HEADER, "utf8");
    }

    const rows = events
        .map((e) =>
            [
                e.timestamp,
                e.ticker,
                e.type,
                e.currentPrice ?? "",
                e.previousClose ?? "",
                e.percentChange?.toFixed(4) ?? "",
                e.stochasticK?.toFixed(2) ?? "",
                e.stochasticD?.toFixed(2) ?? "",
                e.allTimeHigh ?? "",
            ].join(","),
        )
        .join("\n");

    appendFileSync(historyPath, rows + "\n", "utf8");
}
