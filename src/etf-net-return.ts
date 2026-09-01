// Weekly cumulative total-return series (dividend-adjusted, USD + CLP-adjusted),
// ported from Dashboard's functions/api/ivv-weekly-net-return.js.
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

async function fetchYahooWeeklyChart(
    symbol: string,
    period1: number,
    includeDividends: boolean,
): Promise<{ timestamps: number[]; closes: number[]; dividends: Record<string, { date: number; amount: number }> } | null> {
    const period2 = Math.floor(Date.now() / 1000);
    const events = includeDividends ? "&events=div" : "";
    const url =
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
        `?period1=${period1}&period2=${period2}&interval=1wk${events}`;

    const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GabboTV/1.0)" },
    });
    if (!response.ok) return null;

    const json = (await response.json()) as Record<string, unknown>;
    const node = ((json?.chart as Record<string, unknown>)?.result as unknown[])?.[0] as
        | Record<string, unknown>
        | undefined;
    if (!node) return null;

    const timestamps = (node.timestamp as number[]) || [];
    const closes =
        (((node.indicators as Record<string, unknown>)?.quote as unknown[])?.[0] as Record<string, number[]>)
            ?.close || [];
    const dividends =
        ((node.events as Record<string, unknown>)?.dividends as Record<string, { date: number; amount: number }>) ||
        {};

    return { timestamps, closes, dividends };
}

// Fetches weekly net total-return since `sinceIso` for `symbol`, dividend-adjusted (net of
// 15% withholding), plus a USDCLP=X FX-adjusted parallel series.
export async function fetchWeeklyNetReturn(symbol: string, sinceIso: string): Promise<NetReturnSeries | null> {
    const period1 = Math.floor(new Date(sinceIso).getTime() / 1000);

    const [chart, fxChart] = await Promise.all([
        fetchYahooWeeklyChart(symbol, period1, true),
        fetchYahooWeeklyChart("USDCLP=X", period1, false),
    ]);
    if (!chart) return null;

    const points = chart.timestamps
        .map((ts, i) => ({ ts, close: chart.closes[i] }))
        .filter((p): p is { ts: number; close: number } => typeof p.close === "number")
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
        pointsClp.push({
            date: curr.date.toISOString().slice(0, 10),
            indexValue: indexValueClp,
            cumulativeReturnPct: (indexValueClp / 100 - 1) * 100,
            close: curr.close * fxRate,
            netDividend: netDividend * fxRate,
            fxRate,
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
