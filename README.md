# GabboTV

Local market-alert data feed for broadcast graphics (CasparCG / SPX Graphics).

## What it does

Every run, `src/index.ts`:
1. Fetches daily OHLC history from Yahoo Finance for the 34 tickers + 6 market-snapshot symbols defined in [ticker-alerts.ts](ticker-alerts.ts).
2. Computes % change vs previous close, Full Stochastic (14,3,3), and all-time-high status.
3. Writes `data/snapshot.json` (atomic write) — point your CasparCG/SPX template's data source at this file.
4. Fires at most one alert per ticker/condition per trading day (price threshold, stochastic oversold, ATH breakout), logged to `data/alert-history.csv`. De-dupe state lives in `data/alert-state.json`.

## Setup

```powershell
npm install
npm run build
```

## Run once

```powershell
npm start
```

## Schedule every 5 minutes (Windows Task Scheduler)

Create a scheduled task that runs, every 5 minutes, all day (the script itself checks
US market hours/holidays and skips firing new alerts when the market is closed):

```powershell
schtasks /Create /SC MINUTE /MO 5 /TN "GabboTV Market Alerts" `
  /TR "node C:\Users\Gabo\OneDrive\Repo\GabboTV\dist\src\index.js" `
  /ST 00:00
```

Run `npm run build` again any time you change `ticker-alerts.ts` or the `src/` files.
