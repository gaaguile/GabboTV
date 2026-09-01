// All 34 tickers (4 broad market indices + 30 DJIA)
export const ALL_TICKERS: string[] = [
    "IVV",
    "IYW",
    "DIA",
    "WQTM",
    "USDCLP=X", // Broad market indices
    "AAPL",
    "AMGN",
    "AXP",
    "BA",
    "CAT",
    "CRM",
    "CSCO",
    "CVX",
    "DIS",
    "GS",
    "HD",
    "HON",
    "IBM",
    "JNJ",
    "JPM",
    "KO",
    "MCD",
    "MMM",
    "MRK",
    "MSFT",
    "NKE",
    "NVDA",
    "PG",
    "SHW",
    "TRV",
    "UNH",
    "V",
    "WMT",
    "AMZN",
    "GOOGL",
];

export const ETF_ALERT_TICKERS = new Set(["IVV", "IYW", "DIA", "WQTM", "USDCLP=X"]);

export const MARKET_SNAPSHOT_SYMBOLS: Array<{ label: string; ticker: string }> = [
    { label: "ES", ticker: "ES=F" },
    { label: "NQ", ticker: "NQ=F" },
    { label: "WTI", ticker: "CL=F" },
    { label: "GC", ticker: "GC=F" },
    { label: "USDCLP", ticker: "USDCLP=X" },
    { label: "HG", ticker: "HG=F" },
];

export const ALERT_THRESHOLD = 2.99; // percentage change threshold (compared to previous close)
export const STOCHASTIC_THRESHOLD = 20; // Oversold threshold for Full Stochastic (14,3,3)

// US Stock Market Holidays 2024-2026 (dates when market is closed)
export const US_MARKET_HOLIDAYS: string[] = [
    // 2024
    "2024-01-15", // MLK Jr Day
    "2024-02-19", // Presidents Day
    "2024-03-29", // Good Friday
    "2024-05-27", // Memorial Day
    "2024-06-19", // Juneteenth
    "2024-07-04", // Independence Day
    "2024-09-02", // Labor Day
    "2024-11-28", // Thanksgiving
    "2024-12-25", // Christmas
    // 2025
    "2025-01-20", // MLK Jr Day
    "2025-02-17", // Presidents Day
    "2025-04-18", // Good Friday
    "2025-05-26", // Memorial Day
    "2025-06-19", // Juneteenth
    "2025-07-04", // Independence Day
    "2025-09-01", // Labor Day
    "2025-11-27", // Thanksgiving
    "2025-12-25", // Christmas
    // 2026
    "2026-01-19", // MLK Jr Day
    "2026-02-16", // Presidents Day
    "2026-04-10", // Good Friday
    "2026-05-25", // Memorial Day
    "2026-06-19", // Juneteenth
    "2026-07-04", // Independence Day
    "2026-09-07", // Labor Day
    "2026-11-26", // Thanksgiving
    "2026-12-25", // Christmas
];