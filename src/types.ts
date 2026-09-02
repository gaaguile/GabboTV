export type AlertType = "price_change" | "stochastic" | "all_time_high";

export interface TickerHistory {
    currentPrice: number;
    previousClose: number;
    highs: number[];
    lows: number[];
    closes: number[];
    allTimeHigh: number;
}

export interface TickerReading {
    ticker: string;
    label?: string;
    dataAvailable: boolean;
    currentPrice?: number;
    previousClose?: number;
    percentChange?: number;
    stochasticK?: number;
    stochasticD?: number;
    allTimeHigh?: number;
    isAlertPriceChange: boolean;
    isAlertStochastic: boolean;
    isAlertAllTimeHigh: boolean;
}

export interface AlertEvent {
    timestamp: string;
    ticker: string;
    type: AlertType;
    currentPrice?: number;
    previousClose?: number;
    percentChange?: number;
    stochasticK?: number;
    stochasticD?: number;
    allTimeHigh?: number;
}

export interface Snapshot {
    generatedAt: string;
    marketStatus: { isOpen: boolean; phase: "MARKET_OPEN" | "FUTURES_OPEN" | "MARKET_CLOSED"; reason?: string };
    tickers: TickerReading[];
    marketSnapshot: TickerReading[];
    newAlerts: AlertEvent[];
}
