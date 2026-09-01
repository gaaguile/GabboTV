// Full Stochastic (14,3,3) computed from daily OHLC bars.
export function calculateStochastic(
    highs: number[],
    lows: number[],
    closes: number[],
): { K: number; D: number } | null {
    if (highs.length < 14 || lows.length < 14 || closes.length < 14) {
        return null;
    }

    const last14Highs = highs.slice(-14);
    const last14Lows = lows.slice(-14);

    const high14 = Math.max(...last14Highs);
    const low14 = Math.min(...last14Lows);

    const kValues: number[] = [];
    for (let i = Math.max(0, closes.length - 3); i < closes.length; i++) {
        const close = closes[i];
        const range = high14 - low14;
        const k = range === 0 ? 50 : ((close - low14) / range) * 100;
        kValues.push(k);
    }

    const K = kValues[kValues.length - 1];
    const D = kValues.reduce((a, b) => a + b, 0) / kValues.length;

    return { K, D };
}
