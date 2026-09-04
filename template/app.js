// Polls the local data feed written by dist/src/index.js and renders the broadcast board.
const REFRESH_MS = 5000;
const DATA_URL = "/data/snapshot.json";

const NAME_MAP = {
  AAPL: "Apple", AMGN: "Amgen", AXP: "American Express", BA: "Boeing", CAT: "Caterpillar",
  CRM: "Salesforce", CSCO: "Cisco", CVX: "Chevron", DIS: "Disney", GS: "Goldman Sachs",
  HD: "Home Depot", HON: "Honeywell", IBM: "IBM", JNJ: "Johnson & Johnson", JPM: "JPMorgan Chase",
  KO: "Coca-Cola", MCD: "McDonald's", MMM: "3M", MRK: "Merck", MSFT: "Microsoft", NKE: "Nike",
  NVDA: "Nvidia", PG: "Procter & Gamble", SHW: "Sherwin-Williams", TRV: "Travelers", UNH: "UnitedHealth",
  V: "Visa", WMT: "Walmart", AMZN: "Amazon", GOOGL: "Alphabet", IVV: "S&P 500 ETF", IYW: "Tech ETF",
  DIA: "Dow Jones ETF", WQTM: "WisdomTree ETF", "USDCLP=X": "USD/CLP",
};

function fmtPrice(v) {
  return v == null ? "--" : v.toFixed(2);
}

function fmtPct(v) {
  return v == null ? "--" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function pctClass(v) {
  return v == null ? "" : v >= 0 ? "pos" : "neg";
}

function hasActiveAlert(t) {
  return Boolean(t.isAlertPriceChange || t.isAlertStochastic || t.isAlertAllTimeHigh);
}

function flagBadges(t) {
  const badges = [];
  if (t.isAlertPriceChange) badges.push('<span class="flag-badge price" title="Price threshold">P</span>');
  if (t.isAlertStochastic) badges.push('<span class="flag-badge stoch" title="Stochastic oversold">S</span>');
  if (t.isAlertAllTimeHigh) badges.push('<span class="flag-badge ath" title="All-time high">A</span>');
  return badges.join("");
}

function tickerRow(t) {
  const name = NAME_MAP[t.ticker] ?? "";
  return `<tr class="${hasActiveAlert(t) ? "is-alert" : ""}">
    <td class="ticker-cell">${t.ticker}<div class="ticker-name">${name}</div></td>
    <td>${fmtPrice(t.currentPrice)}</td>
    <td class="${pctClass(t.percentChange)}">${fmtPct(t.percentChange)}</td>
    <td>${t.stochasticK != null ? t.stochasticK.toFixed(1) : "--"}</td>
    <td>${t.stochasticD != null ? t.stochasticD.toFixed(1) : "--"}</td>
    <td>${flagBadges(t)}</td>
  </tr>`;
}

function boardTable(rows) {
  return `<table class="board-table">
    <thead><tr><th>Ticker</th><th>Price</th><th>Chg %</th><th>K</th><th>D</th><th></th></tr></thead>
    <tbody>${rows.map(tickerRow).join("")}</tbody>
  </table>`;
}

function renderBoard(tickers) {
  const colCount = 3;
  const perCol = Math.ceil(tickers.length / colCount);
  for (let i = 0; i < colCount; i++) {
    const col = tickers.slice(i * perCol, (i + 1) * perCol);
    document.getElementById(`board-col-${i + 1}`).innerHTML = boardTable(col);
  }
}

function renderSnapshotStrip(items) {
  document.getElementById("snapshot-strip").innerHTML = items
    .map(
      (t) => `<div class="snapshot-item ${hasActiveAlert(t) ? "is-alert" : ""}">
        <div class="label">${t.label ?? t.ticker}</div>
        <div class="price">${fmtPrice(t.currentPrice)}</div>
        <div class="chg ${pctClass(t.percentChange)}">${fmtPct(t.percentChange)}</div>
      </div>`,
    )
    .join("");
}

const PHASE_LABELS = {
  MARKET_OPEN: { text: "MARKET OPEN", cssClass: "badge--open" },
  FUTURES_OPEN: { text: "FUTURES OPEN", cssClass: "badge--futures" },
  MARKET_CLOSED: { text: "MARKET CLOSED", cssClass: "badge--closed" },
};

function renderStatus(snapshot) {
  const phase = PHASE_LABELS[snapshot.marketStatus?.phase] ?? PHASE_LABELS.MARKET_CLOSED;
  const badge = document.getElementById("market-badge");
  badge.textContent = phase.text;
  badge.className = `badge ${phase.cssClass}`;

  document.getElementById("updated-at").textContent =
    `UPDATED ${new Date(snapshot.generatedAt).toLocaleTimeString("en-US", { hour12: false })}`;

  const activeAlerts = [...snapshot.tickers, ...snapshot.marketSnapshot].filter(hasActiveAlert).length;
  document.getElementById("alert-count").textContent =
    `${activeAlerts} ACTIVE ALERT${activeAlerts === 1 ? "" : "S"}`;
}

async function refresh() {
  try {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const snapshot = await res.json();
    renderStatus(snapshot);
    renderSnapshotStrip(snapshot.marketSnapshot);
    renderBoard(snapshot.tickers);
  } catch (error) {
    console.error("[GabboTV] refresh failed", error);
  }
}

refresh();
setInterval(refresh, REFRESH_MS);

// ── Scene cycling: market board, then 4 ETF weekly-net-return charts ────────

const ETF_CHARTS_URL = "/data/etf-charts.json";
const CHART_REFRESH_MS = 5 * 60 * 1000;

const SCENES = [
  { type: "market", durationMs: 60000 },
  { type: "chart", symbol: "IVV", sinceYear: 2010, durationMs: 15000 },
  { type: "chart", symbol: "IVV", sinceYear: 2023, durationMs: 15000 },
  { type: "chart", symbol: "IYW", sinceYear: 2010, durationMs: 15000 },
  { type: "chart", symbol: "IYW", sinceYear: 2023, durationMs: 15000 },
];

let etfCharts = {};
let chartInstance = null;
let sceneIndex = 0;

async function refreshEtfCharts() {
  try {
    const res = await fetch(`${ETF_CHARTS_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const payload = await res.json();
    etfCharts = payload.charts ?? {};
  } catch (error) {
    console.error("[GabboTV] ETF chart refresh failed", error);
  }
}

function filterSince(points, sinceYear) {
  const cutoff = new Date(`${sinceYear}-01-01T00:00:00Z`).getTime();
  return (points ?? []).filter((p) => new Date(p.date).getTime() >= cutoff);
}

// Filters to the window, then rebases so the window's first point reads 0% (using the
// underlying compounding indexValue, not the original since-2010 cumulativeReturnPct).
function rebaseSince(points, sinceYear) {
  const filtered = filterSince(points, sinceYear);
  if (filtered.length === 0) return [];
  const baseIndexValue = filtered[0].indexValue;
  return filtered.map((p) => [new Date(p.date).getTime(), (p.indexValue / baseIndexValue - 1) * 100]);
}

// % distance from the latest indexValue to its all-time high, over the FULL history (not the
// since-year window), since the all-time high should reflect the true historical peak.
function pctToAllTimeHigh(points) {
  if (!points || points.length === 0) return null;
  const maxIndexValue = Math.max(...points.map((p) => p.indexValue));
  const lastIndexValue = points[points.length - 1].indexValue;
  return (lastIndexValue / maxIndexValue - 1) * 100;
}

// Attaches a "last value" + "distance to all-time-high" data label pair to the final point only.
function withLastPointLabels(seriesData, athPct) {
  if (seriesData.length === 0) return seriesData;
  const [x, y] = seriesData[seriesData.length - 1];
  const athText = athPct == null ? "ATH n/a" : `ATH ${athPct >= 0 ? "+" : ""}${athPct.toFixed(1)}%`;
  const lastPoint = {
    x,
    y,
    dataLabels: [
      {
        enabled: true,
        format: `${y >= 0 ? "+" : ""}{y:.1f}%`,
        align: "left",
        x: 8,
        y: -4,
        style: { fontWeight: "700", textOutline: "none" },
      },
      {
        enabled: true,
        format: athText,
        align: "left",
        x: 8,
        y: 12,
        style: { fontSize: "11px", fontWeight: "600", color: "#8a90a3", textOutline: "none" },
      },
    ],
  };
  return [...seriesData.slice(0, -1), lastPoint];
}

function renderChartScene(symbol, sinceYear) {
  const chart = etfCharts[symbol];
  document.getElementById("chart-title").textContent =
    `${symbol} \u2014 WEEKLY NET RETURN SINCE ${sinceYear}`;

  if (!chart) return;

  const usd = withLastPointLabels(rebaseSince(chart.pointsUsd, sinceYear), pctToAllTimeHigh(chart.pointsUsd));
  const clp = withLastPointLabels(rebaseSince(chart.pointsClp, sinceYear), pctToAllTimeHigh(chart.pointsClp));

  // Destroy the previous chart before re-rendering, otherwise Highcharts can carry over
  // the old y-axis extremes instead of auto-scaling to the newly filtered data range.
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  chartInstance = Highcharts.stockChart("chart-container", {
    chart: { backgroundColor: "transparent" },
    rangeSelector: { enabled: false },
    navigator: { enabled: false },
    scrollbar: { enabled: false },
    credits: { enabled: false },
    title: { text: null },
    legend: {
      enabled: true,
      itemStyle: { color: "#f5f6fa" },
      itemHoverStyle: { color: "#d4af37" },
    },
    xAxis: {
      lineColor: "rgba(148, 163, 184, 0.32)",
      tickColor: "rgba(148, 163, 184, 0.32)",
      labels: { style: { color: "#8a90a3" } },
    },
    yAxis: {
      title: { text: "Cumulative return (%)", style: { color: "#8a90a3" } },
      labels: { format: "{value}%", style: { color: "#8a90a3" } },
      gridLineColor: "rgba(148, 163, 184, 0.12)",
    },
    tooltip: {
      valueDecimals: 2,
      valueSuffix: "%",
      backgroundColor: "rgba(11, 16, 32, 0.96)",
      borderColor: "rgba(212, 175, 55, 0.4)",
      style: { color: "#f5f6fa" },
    },
    plotOptions: { series: { turboThreshold: 0, dataLabels: { enabled: false } } },
    series: [
      { name: `${symbol} (USD)`, data: usd, color: "#1fbf5c", dataLabels: { style: { color: "#1fbf5c" } } },
      { name: `${symbol} (CLP-adjusted)`, data: clp, color: "#d4af37", dataLabels: { style: { color: "#d4af37" } } },
    ],
  });
}

function showScene(scene) {
  document.getElementById("scene-market").hidden = scene.type !== "market";
  document.getElementById("scene-chart").hidden = scene.type !== "chart";
  if (scene.type === "chart") renderChartScene(scene.symbol, scene.sinceYear);
}

function advanceScene() {
  const scene = SCENES[sceneIndex];
  showScene(scene);
  sceneIndex = (sceneIndex + 1) % SCENES.length;
  setTimeout(advanceScene, scene.durationMs);
}

refreshEtfCharts();
setInterval(refreshEtfCharts, CHART_REFRESH_MS);
advanceScene();
