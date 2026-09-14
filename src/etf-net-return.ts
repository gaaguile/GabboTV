import { fetchIntradayQuote } from "./yahoo.js";

export interface NetReturnPoint {
    date: string;
    indexValue: number;
    cumulativeReturnPct: number;
    close: number;
    netDividend: number;
    fxRate?: number;
}

export interface NetReturnSeries {
    symbol: string;
    startDate: string;
    endDate: string;
    pointsUsd: NetReturnPoint[];
    pointsClp: NetReturnPoint[];
}

const TAX_WITHHOLDING_RATE = 0.15;

function isFiniteFxRate(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeChartSeries(
    timestamps: unknown,
    closes: unknown,
): { timestamps: number[]; closes: number[] } {
    const ts = Array.isArray(timestamps) ? timestamps : [];
    const prices = Array.isArray(closes) ? closes : [];
    const pairs = ts
        .map((timestamp, index) => ({ ts: Number(timestamp), close: Number(prices[index]) }))
        .filter((pair) => Number.isFinite(pair.ts) && Number.isFinite(pair.close) && pair.close > 0)
        .sort((a, b) => a.ts - b.ts);

    return {
        timestamps: pairs.map((pair) => pair.ts),
        closes: pairs.map((pair) => pair.close),
    };
}

async function fetchYahooChart(
    symbol: string,
    period1: number,
    interval: "5m" | "1wk",
    includeDividends = false,
): Promise<{ timestamps: number[]; closes: number[]; dividends: Record<string, { date: number; amount: number }> } | null> {
    const period2 = Math.floor(Date.now() / 1000);
    const events = includeDividends ? "&events=div" : "";
    const url =
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
        `?period1=${period1}&period2=${period2}&interval=${interval}${events}`;

    try {
        const response = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; GabboTV/1.0)" },
        });
        if (!response.ok) return null;

        const json = (await response.json()) as Record<string, unknown>;
        const node = ((json?.chart as Record<string, unknown>)?.result as unknown[])?.[0] as
            | Record<string, unknown>
            | undefined;
        if (!node) return null;

        const quote = (((node.indicators as Record<string, unknown>)?.quote as unknown[])?.[0] as Record<string, unknown>) ?? {};
        const timestamps = Array.isArray(node.timestamp) ? node.timestamp : [];
        const closes = Array.isArray(quote.close) ? quote.close : [];
        const dividends =
            ((node.events as Record<string, unknown>)?.dividends as Record<string, { date: number; amount: number }>) ||
            {};

        return {
            timestamps: normalizeChartSeries(timestamps, closes).timestamps,
            closes: normalizeChartSeries(timestamps, closes).closes,
            dividends,
        };
    } catch {
        return null;
    }
}

function buildWeeklySeries(
    symbol: string,
    chart: { timestamps: number[]; closes: number[]; dividends: Record<string, { date: number; amount: number }> },
    fxChart: { timestamps: number[]; closes: number[] } | null,
    sinceIso: string,
    liveFxRate?: number,
): NetReturnSeries | null {
    const points = chart.timestamps
        .map((ts, i) => ({ ts, close: chart.closes[i] }))
        .filter((p): p is { ts: number; close: number } => Number.isFinite(p.close) && p.close > 0)
        .map((p) => ({ ...p, date: new Date(p.ts * 1000) }))
        .filter((p) => p.date >= new Date(sinceIso));

    if (points.length < 2) return null;

    const dividends = Object.values(chart.dividends || {})
        .map((d) => ({ ts: Number(d.date), amount: Number(d.amount) || 0 }))
        .filter((d) => Number.isFinite(d.ts) && Number.isFinite(d.amount))
        .sort((a, b) => a.ts - b.ts);

    const rawFxPoints = (fxChart?.timestamps || [])
        .map((ts, i) => ({ ts, close: fxChart!.closes[i] }))
        .filter((p) => isFiniteFxRate(p.close))
        .sort((a, b) => a.ts - b.ts);

    const inRangeFxPoints = rawFxPoints.filter((p) => p.close >= 100 && p.close <= 2000);
    const fxPoints = inRangeFxPoints.reduce<typeof inRangeFxPoints>((acc, point) => {
        if (acc.length === 0) {
            acc.push(point);
            return acc;
        }
        const ratio = point.close / acc[acc.length - 1].close;
        if (ratio >= 0.67 && ratio <= 1.5) acc.push(point);
        return acc;
    }, []);

    const getFxRateAtTs = (ts: number): number => {
        if (fxPoints.length === 0) return 1;
        let rate = fxPoints[0].close;
        for (const p of fxPoints) {
            if (p.ts <= ts) rate = p.close;
            else break;
        }
        return rate;
    };

    let indexValue = 100;
    let indexValueClp = 100;
    const fxStart = getFxRateAtTs(points[0].ts);

    const pointsUsd: NetReturnPoint[] = [
        { date: points[0].date.toISOString().slice(0, 10), indexValue, cumulativeReturnPct: 0, close: points[0].close, netDividend: 0 },
    ];
    const pointsClp: NetReturnPoint[] = [
        {
            date: points[0].date.toISOString().slice(0, 10),
            indexValue: indexValueClp,
            cumulativeReturnPct: 0,
            close: points[0].close * fxStart,
            netDividend: 0,
            fxRate: fxStart,
        },
    ];

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const grossDividend = dividends.filter((d) => d.ts > prev.ts && d.ts <= curr.ts).reduce((sum, d) => sum + d.amount, 0);
        const netDividend = grossDividend * (1 - TAX_WITHHOLDING_RATE);
        const weeklyReturn = prev.close > 0 ? (curr.close + netDividend) / prev.close - 1 : 0;
        indexValue *= 1 + weeklyReturn;

        const fxRate = getFxRateAtTs(curr.ts);
        const fxRelative = fxStart > 0 ? fxRate / fxStart : 1;
        indexValueClp = indexValue * fxRelative;

        pointsUsd.push({
            date: curr.date.toISOString().slice(0, 10),
            indexValue,
            cumulativeReturnPct: (indexValue / 100 - 1) * 100,
            close: curr.close,
            netDividend,
        });

        const finalFxRate = i === points.length - 1 && Number.isFinite(liveFxRate) ? liveFxRate! : fxRate;
        const finalClose = curr.close * finalFxRate;
        const finalNetDividend = netDividend * finalFxRate;
        const finalIndexValueClp = indexValue * (finalFxRate / fxStart || 1);

        pointsClp.push({
            date: curr.date.toISOString().slice(0, 10),
            indexValue: finalIndexValueClp,
            cumulativeReturnPct: (finalIndexValueClp / 100 - 1) * 100,
            close: finalClose,
            netDividend: finalNetDividend,
            fxRate: finalFxRate,
        });
    }

    return {
        symbol,
        startDate: pointsUsd[0].date,
        endDate: pointsUsd[pointsUsd.length - 1].date,
        pointsUsd,
        pointsClp,
    };
}

function buildIntradaySeries(
    symbol: string,
    intradayChart: { timestamps: number[]; closes: number[] },
    intradayFxChart: { timestamps: number[]; closes: number[] } | null,
    sinceIso: string,
    liveFxRate?: number,
): NetReturnSeries | null {
    const sinceTs = Math.floor(new Date(sinceIso).getTime() / 1000);
    const points = intradayChart.timestamps
        .map((ts, i) => ({ ts, close: intradayChart.closes[i] }))
        .filter((p): p is { ts: number; close: number } => Number.isFinite(p.close) && p.close > 0)
        .sort((a, b) => a.ts - b.ts)
        .filter((p) => p.ts >= sinceTs);

    if (points.length < 2) return null;

    // Use the most recent trading-window in the data instead of a local midnight cutoff.
    // Yahoo's FX timestamps are based on exchange time, and local day boundaries can
    // select stale prior-day bars as the anchor, which causes the last point to snap back
    // to an old rate after briefly showing the current value.
    const anchorPoints = points.slice(-Math.min(points.length, 96));

    if (anchorPoints.length < 2) return null;

    const rawFxPoints = (intradayFxChart?.timestamps || [])
        .map((ts, i) => ({ ts, close: intradayFxChart!.closes[i] }))
        .filter((p) => isFiniteFxRate(p.close))
        .sort((a, b) => a.ts - b.ts);

    const getFxRateAtTs = (ts: number): number => {
        if (rawFxPoints.length === 0) return 1;
        let rate = rawFxPoints[0].close;
        for (const p of rawFxPoints) {
            if (p.ts <= ts) rate = p.close;
            else break;
        }
        return rate;
    };

    const baseUsdClose = anchorPoints[0].close;
    const baseFxRate = getFxRateAtTs(anchorPoints[0].ts);
    const finalFxRate = Number.isFinite(liveFxRate) ? liveFxRate! : rawFxPoints.at(-1)?.close ?? baseFxRate;

    const pointsUsd: NetReturnPoint[] = anchorPoints.map(({ ts, close }) => {
        const indexValue = baseUsdClose > 0 ? (close / baseUsdClose) * 100 : 100;
        return {
            date: new Date(ts * 1000).toISOString(),
            indexValue,
            cumulativeReturnPct: (indexValue / 100 - 1) * 100,
            close,
            netDividend: 0,
        };
    });

    const pointsClp: NetReturnPoint[] = anchorPoints.map(({ ts, close }, idx) => {
        const fxRate = idx === anchorPoints.length - 1 ? finalFxRate : getFxRateAtTs(ts);
        const clpClose = close * fxRate;
        const indexValue = baseUsdClose > 0 && baseFxRate > 0 ? (clpClose / (baseUsdClose * baseFxRate)) * 100 : 100;

        return {
            date: new Date(ts * 1000).toISOString(),
            indexValue,
            cumulativeReturnPct: (indexValue / 100 - 1) * 100,
            close: clpClose,
            netDividend: 0,
            fxRate,
        };
    });

    return {
        symbol,
        startDate: pointsUsd[0].date,
        endDate: pointsUsd[pointsUsd.length - 1].date,
        pointsUsd,
        pointsClp,
    };
}

export async function fetchWeeklyNetReturn(symbol: string, sinceIso: string): Promise<NetReturnSeries | null> {
    const sinceTs = Math.floor(new Date(sinceIso).getTime() / 1000);
    const intradayPeriod1 = Math.max(sinceTs, Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60);
    const liveFxQuote = await fetchIntradayQuote("USDCLP=X");

    const [intradayChart, intradayFxChart, weeklyChart, weeklyFxChart] = await Promise.all([
        fetchYahooChart(symbol, intradayPeriod1, "5m"),
        fetchYahooChart("USDCLP=X", intradayPeriod1, "5m"),
        fetchYahooChart(symbol, sinceTs, "1wk", true),
        fetchYahooChart("USDCLP=X", sinceTs, "1wk"),
    ]);

    const intradaySeries = intradayChart && intradayFxChart
        ? buildIntradaySeries(symbol, intradayChart, intradayFxChart, sinceIso, liveFxQuote?.currentPrice)
        : null;
    if (intradaySeries) return intradaySeries;

    if (!weeklyChart) return null;
    return buildWeeklySeries(symbol, weeklyChart, weeklyFxChart ?? null, sinceIso, liveFxQuote?.currentPrice);
}
