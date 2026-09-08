import type { TickerHistory } from "./types.js";

// Fetches full available daily history in one call: covers current price, previous
// close, the last 14 bars needed for Stochastic(14,3,3), and the all-time high.
export async function fetchTickerHistory(ticker: string): Promise<TickerHistory | null> {
    try {
        const TO_TS = Math.floor(Date.now() / 1000);
        const yahooUrl =
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
            `?interval=1d&period1=0&period2=${TO_TS}&events=none`;

        const response = await fetch(yahooUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; GabboTV/1.0)" },
        });

        if (!response.ok) return null;

        const json = (await response.json()) as Record<string, unknown>;
        const result = ((json?.chart as Record<string, unknown>)?.result as unknown[])?.[0] as
            | Record<string, unknown>
            | undefined;

        if (!result) return null;

        const q = ((result.indicators as Record<string, unknown>)?.quote as unknown[])?.[0] as
            | Record<string, Array<number | null>>
            | undefined;

        if (!q?.close || !q?.high || !q?.low) return null;

        const highs = q.high.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
        const lows = q.low.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
        const closes = q.close.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);

        if (closes.length < 2 || highs.length === 0 || lows.length === 0) return null;

        const currentPrice = closes[closes.length - 1];
        const previousClose = closes[closes.length - 2];
        const allTimeHigh = Math.max(...highs);

        if (!currentPrice || !previousClose || currentPrice <= 0 || previousClose <= 0) return null;

        return { currentPrice, previousClose, highs, lows, closes, allTimeHigh };
    } catch (error) {
        console.error(`[yahoo] Failed to fetch ${ticker}:`, error);
        return null;
    }
}

export async function fetchIntradayQuote(
    ticker: string,
): Promise<{ currentPrice: number; previousClose: number } | null> {
    try {
        const toTs = Math.floor(Date.now() / 1000);
        const fromTs = toTs - 5 * 24 * 60 * 60;
        const yahooUrl =
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
            `?interval=5m&period1=${fromTs}&period2=${toTs}&events=none`;

        const response = await fetch(yahooUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; GabboTV/1.0)" },
        });
        if (!response.ok) return null;

        const json = (await response.json()) as Record<string, unknown>;
        const result = ((json?.chart as Record<string, unknown>)?.result as unknown[])?.[0] as
            | Record<string, unknown>
            | undefined;
        if (!result) return null;

        const meta = (result.meta as Record<string, unknown>) ?? {};
        const quote = ((result.indicators as Record<string, unknown>)?.quote as unknown[])?.[0] as
            | Record<string, Array<number | null>>
            | undefined;
        const closes = quote?.close ?? [];
        const currentPrice = [...closes].reverse().find(
            (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
        );
        const previousClose = [meta.chartPreviousClose, meta.previousClose].find(
            (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
        );

        if (!currentPrice || !previousClose) return null;
        return { currentPrice, previousClose };
    } catch (error) {
        console.error(`[yahoo] Failed to fetch intraday ${ticker}:`, error);
        return null;
    }
}
