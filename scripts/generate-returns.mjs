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