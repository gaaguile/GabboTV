import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const chartPath = join(rootDir, "data", "etf-charts.json");
const outputDir = join(rootDir, "data", "returns");
const headers = ["Date", "IVV", "IYW", "IVV (CLP adjusted)", "IYW (CLP adjusted)", "USDCLP"];

const chartData = JSON.parse(readFileSync(chartPath, "utf8"));
const charts = chartData.charts ?? {};

function getSeries(symbol) {
    const chart = charts[symbol];
    if (!chart?.pointsUsd?.length || !chart?.pointsClp?.length) {
        throw new Error(`Missing chart series for ${symbol}`);
    }

    const clpByDate = new Map(chart.pointsClp.map((point) => [point.date.slice(0, 10), point]));
    return chart.pointsUsd
        .map((point) => {
            const date = point.date.slice(0, 10);
            const clpPoint = clpByDate.get(date);
            if (!clpPoint || !Number.isFinite(clpPoint.fxRate)) return null;
            return {
                date,
                usd: Number(point.indexValue),
                clp: Number(clpPoint.indexValue),
                fx: Number(clpPoint.fxRate),
            };
        })
        .filter((point) => point && Number.isFinite(point.usd) && Number.isFinite(point.clp) && Number.isFinite(point.fx));
}

const ivv = getSeries("IVV");
const iyw = getSeries("IYW");
const iywByDate = new Map(iyw.map((point) => [point.date, point]));
const aligned = ivv
    .map((ivvPoint) => {
        const iywPoint = iywByDate.get(ivvPoint.date);
        return iywPoint ? { date: ivvPoint.date, ivv: ivvPoint, iyw: iywPoint } : null;
    })
    .filter(Boolean);

function percentChange(current, previous) {
    return ((current / previous) - 1) * 100;
}

function formatValue(value) {
    return Number.isFinite(value) ? value.toFixed(6) : "";
}

function csvEscape(value) {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
    return [headers, ...rows]
        .map((row) => row.map(csvEscape).join(","))
        .join("\n") + "\n";
}

function yamlQuote(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

function toYaml(rows) {
    return rows.map((row) => headers.map((header, index) => `${header}: ${yamlQuote(row[index])}`).join("\n")).join("\n---\n") + "\n";
}

function toCson(rows) {
    return `[\n${rows
        .map((row) => `  { ${headers.map((header, index) => `"${header}": ${JSON.stringify(row[index])}`).join(", ")} }`)
        .join(",\n")}\n]\n`;
}

function xmlEscape(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function toXml(rows) {
    const records = rows.map((row) => `  <return>\n${headers.map((header, index) => `    <value name="${xmlEscape(header)}">${xmlEscape(row[index])}</value>`).join("\n")}\n  </return>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<returns>\n${records}\n</returns>\n`;
}

function buildReturnRow(current, previous) {
    return [
        current.date,
        formatValue(percentChange(current.ivv.usd, previous.ivv.usd)),
        formatValue(percentChange(current.iyw.usd, previous.iyw.usd)),
        formatValue(percentChange(current.ivv.clp, previous.ivv.clp)),
        formatValue(percentChange(current.iyw.clp, previous.iyw.clp)),
        formatValue(percentChange(current.ivv.fx, previous.ivv.fx)),
    ];
}

const weeklyRows = aligned.slice(1).map((point, index) => buildReturnRow(point, aligned[index]));

const monthEndPoints = [];
for (const point of aligned) {
    const month = point.date.slice(0, 7);
    if (monthEndPoints.at(-1)?.date.slice(0, 7) === month) {
        monthEndPoints[monthEndPoints.length - 1] = point;
    } else {
        monthEndPoints.push(point);
    }
}

const monthlyRows = monthEndPoints.map((point, index) => {
    const previous = index === 0 ? aligned[0] : monthEndPoints[index - 1];
    return buildReturnRow(point, previous);
});

async function fetchDailyHistory(symbol, period1) {
    const period2 = Math.floor(Date.now() / 1000);
    const url =
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
        `?period1=${period1}&period2=${period2}&interval=1d&events=div`;
    const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GabboTV/1.0)" },
    });
    if (!response.ok) throw new Error(`Yahoo request failed for ${symbol}: ${response.status}`);

    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    if (!result) throw new Error(`Yahoo returned no daily history for ${symbol}`);
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const points = (result.timestamp ?? [])
        .map((timestamp, index) => ({
            timestamp: Number(timestamp),
            date: new Date(Number(timestamp) * 1000).toISOString().slice(0, 10),
            close: Number(closes[index]),
        }))
        .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.close) && point.close > 0)
        .sort((a, b) => a.timestamp - b.timestamp);
    const dividends = Object.values(result.events?.dividends ?? {})
        .map((dividend) => ({ timestamp: Number(dividend.date), amount: Number(dividend.amount) }))
        .filter((dividend) => Number.isFinite(dividend.timestamp) && Number.isFinite(dividend.amount));

    return { points, dividends };
}

async function appendLatestMonthlyPoint() {
    const anchor = aligned.at(-1);
    const period1 = Math.floor(Date.parse(`${anchor.date}T00:00:00Z`) / 1000) - 7 * 24 * 60 * 60;
    const [ivvHistory, iywHistory, fxHistory] = await Promise.all([
        fetchDailyHistory("IVV", period1),
        fetchDailyHistory("IYW", period1),
        fetchDailyHistory("USDCLP=X", period1),
    ]);

    const ivvByDate = new Map(ivvHistory.points.map((point) => [point.date, point]));
    const iywByDate = new Map(iywHistory.points.map((point) => [point.date, point]));
    const fxByDate = new Map(fxHistory.points.map((point) => [point.date, point]));
    const latestDate = [...ivvByDate.keys()]
        .filter((date) => date > anchor.date && iywByDate.has(date) && fxByDate.has(date))
        .sort()
        .at(-1);
    if (!latestDate) {
        console.warn(`No newer common daily bars than ${anchor.date}; monthly export ends at the chart data date.`);
        return;
    }

    function totalReturnFactor(history) {
        const anchorIndex = history.points.findIndex((point) => point.date === anchor.date);
        if (anchorIndex < 0) throw new Error(`Missing ${history === ivvHistory ? "IVV" : "IYW"} anchor close for ${anchor.date}`);
        let factor = 1;
        for (let index = anchorIndex + 1; index < history.points.length; index++) {
            const previous = history.points[index - 1];
            const current = history.points[index];
            if (current.date > latestDate) break;
            const dividend = history.dividends
                .filter((event) => event.timestamp > previous.timestamp && event.timestamp <= current.timestamp)
                .reduce((sum, event) => sum + event.amount, 0) * 0.85;
            factor *= (current.close + dividend) / previous.close;
        }
        return factor;
    }

    const fxPoint = fxByDate.get(latestDate);
    const updatedPoint = {
        date: latestDate,
        ivv: {
            usd: anchor.ivv.usd * totalReturnFactor(ivvHistory),
            clp: 0,
            fx: fxPoint.close,
        },
        iyw: {
            usd: anchor.iyw.usd * totalReturnFactor(iywHistory),
            clp: 0,
            fx: fxPoint.close,
        },
    };
    const fxRelative = fxPoint.close / anchor.ivv.fx;
    updatedPoint.ivv.clp = anchor.ivv.clp * (updatedPoint.ivv.usd / anchor.ivv.usd) * fxRelative;
    updatedPoint.iyw.clp = anchor.iyw.clp * (updatedPoint.iyw.usd / anchor.iyw.usd) * fxRelative;

    const currentMonthIndex = monthEndPoints.findIndex((point) => point.date.slice(0, 7) === latestDate.slice(0, 7));
    if (currentMonthIndex >= 0) monthEndPoints[currentMonthIndex] = updatedPoint;
    else monthEndPoints.push(updatedPoint);

    monthlyRows.splice(0, monthlyRows.length, ...monthEndPoints.map((point, index) => {
        const previous = index === 0 ? aligned[0] : monthEndPoints[index - 1];
        return buildReturnRow(point, previous);
    }));
}

try {
    await appendLatestMonthlyPoint();
} catch (error) {
    console.warn("Could not add the latest daily point to monthly returns:", error.message);
}

function writePeriodFiles(period, rows) {
    const periodDir = join(outputDir, period);
    mkdirSync(periodDir, { recursive: true });
    writeFileSync(join(periodDir, `${period}.csv`), toCsv(rows), "utf8");
    writeFileSync(join(periodDir, `${period}.yaml`), toYaml(rows), "utf8");
    writeFileSync(join(periodDir, `${period}.cson`), toCson(rows), "utf8");
    writeFileSync(join(periodDir, `${period}.xml`), toXml(rows), "utf8");
}

mkdirSync(outputDir, { recursive: true });
for (const period of ["weekly", "monthly"]) {
    const legacyPath = join(outputDir, `${period}.csv`);
    try {
        unlinkSync(legacyPath);
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
}
writePeriodFiles("weekly", weeklyRows);
writePeriodFiles("monthly", monthlyRows);

console.log(`Wrote ${weeklyRows.length} weekly rows and ${monthlyRows.length} monthly rows to ${outputDir}/{weekly,monthly}`);