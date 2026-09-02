// ET market-hours/trading-day checks, reused for both dashboard status and alert gating.

export interface ETDateTimeParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    dayOfWeek: number;
    dateStr: string;
}

export function getETDateTimeParts(now: Date = new Date()): ETDateTimeParts {
    const etFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });

    const parts = etFormatter.formatToParts(now);
    const year = parseInt(parts.find((p) => p.type === "year")?.value || "0");
    const month = parseInt(parts.find((p) => p.type === "month")?.value || "0");
    const day = parseInt(parts.find((p) => p.type === "day")?.value || "0");
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0");
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0");
    const second = parseInt(parts.find((p) => p.type === "second")?.value || "0");

    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const etDate = new Date(`${dateStr}T00:00:00`);

    return { year, month, day, hour, minute, second, dayOfWeek: etDate.getDay(), dateStr };
}

export function isTradingDayInET(dateObj: ETDateTimeParts, holidays: string[]): boolean {
    return dateObj.dayOfWeek !== 0 && dateObj.dayOfWeek !== 6 && !holidays.includes(dateObj.dateStr);
}

export function isMarketOpen(
    holidays: string[],
    dateObj: ETDateTimeParts = getETDateTimeParts(),
): { isOpen: boolean; reason?: string } {
    if (dateObj.dayOfWeek === 0 || dateObj.dayOfWeek === 6) {
        return { isOpen: false, reason: "Market closed on weekends" };
    }

    if (holidays.includes(dateObj.dateStr)) {
        return { isOpen: false, reason: "US market holiday" };
    }

    const timeInMinutes = dateObj.hour * 60 + dateObj.minute;
    const marketOpenTime = 9 * 60 + 30; // 9:30 AM ET
    const marketCloseTime = 16 * 60; // 4:00 PM ET

    if (timeInMinutes < marketOpenTime) {
        return { isOpen: false, reason: "Market not yet open (opens at 9:30 AM ET)" };
    }

    if (timeInMinutes >= marketCloseTime) {
        return { isOpen: false, reason: "Market closed (closes at 4:00 PM ET)" };
    }

    return { isOpen: true };
}

export type MarketPhase = "MARKET_OPEN" | "FUTURES_OPEN" | "MARKET_CLOSED";

// Approximate CME equity index futures (Globex) hours: Sun 6pm ET - Fri 5pm ET, with a daily
// maintenance break 5-6pm ET Mon-Thu. US market holidays aren't modeled here (futures often
// keep near-normal hours on cash-market holidays).
function isFuturesMarketOpen(dateObj: ETDateTimeParts): boolean {
    const timeInMinutes = dateObj.hour * 60 + dateObj.minute;
    const dailyCloseStart = 17 * 60; // 5:00 PM ET
    const dailyReopens = 18 * 60; // 6:00 PM ET

    if (dateObj.dayOfWeek === 6) return false; // Saturday: closed all day
    if (dateObj.dayOfWeek === 0) return timeInMinutes >= dailyReopens; // Sunday: opens 6pm
    if (dateObj.dayOfWeek === 5) return timeInMinutes < dailyCloseStart; // Friday: closes 5pm

    // Mon-Thu: open all day except the 5-6pm daily maintenance break
    return timeInMinutes < dailyCloseStart || timeInMinutes >= dailyReopens;
}

export function getMarketPhase(
    holidays: string[],
    dateObj: ETDateTimeParts = getETDateTimeParts(),
): { phase: MarketPhase; reason?: string } {
    const cash = isMarketOpen(holidays, dateObj);
    if (cash.isOpen) return { phase: "MARKET_OPEN" };
    if (isFuturesMarketOpen(dateObj)) return { phase: "FUTURES_OPEN", reason: cash.reason };
    return { phase: "MARKET_CLOSED", reason: cash.reason };
}
