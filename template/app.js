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
  const mid = Math.ceil(tickers.length / 2);
  document.getElementById("board-col-1").innerHTML = boardTable(tickers.slice(0, mid));
  document.getElementById("board-col-2").innerHTML = boardTable(tickers.slice(mid));
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

function renderStatus(snapshot) {
  const isOpen = Boolean(snapshot.marketStatus?.isOpen);
  const badge = document.getElementById("market-badge");
  badge.textContent = isOpen ? "MARKET OPEN" : "MARKET CLOSED";
  badge.className = `badge ${isOpen ? "badge--open" : "badge--closed"}`;

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
