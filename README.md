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
US market hours/holidays and skips firing new alerts when the market is closed). Launching
through `scripts/run-alert-check-hidden.vbs` (via `wscript.exe`) avoids the console window
that popping up `node.exe` directly would cause:

```powershell
schtasks /Create /SC MINUTE /MO 5 /TN "Gabriel TEKKEN TV Market Alerts" `
  /TR "wscript.exe \"C:\Users\Gabo\OneDrive\Repo\GabboTV\scripts\run-alert-check-hidden.vbs\"" `
  /ST 00:00
```

Run `npm run build` again any time you change `ticker-alerts.ts` or the `src/` files.

If a task was already created pointing at `node.exe` directly, update it in place instead of
recreating it:

```powershell
schtasks /Change /TN "Gabriel TEKKEN TV Market Alerts" `
  /TR "wscript.exe \"C:\Users\Gabo\OneDrive\Repo\GabboTV\scripts\run-alert-check-hidden.vbs\""
```

## Broadcast template (CasparCG / SPX)

`template/` holds the on-air graphic: a dark, Bloomberg/MSNBC-style dashboard board (two-column
ticker grid + market-snapshot strip + market-open badge) that polls `data/snapshot.json` every
5 seconds and highlights any row with an active alert (P = price threshold, S = stochastic
oversold, A = all-time high).

CasparCG's HTML producer needs a URL (not a `file://` path), so a small local server exposes
`template/` and `data/`:

```powershell
npm run serve
```

Keep this running continuously and hidden — it's separate from the 5-minute alert-check task
above, which only updates `data/snapshot.json`. Task Scheduler kills tasks after 3 days by
default, so this one needs an unlimited execution time limit; that setting isn't exposed by
`schtasks.exe`, so create it with PowerShell's `ScheduledTasks` module instead:

```powershell
$action = New-ScheduledTaskAction -Execute "wscript.exe" `
  -Argument '"C:\Users\Gabo\OneDrive\Repo\GabboTV\scripts\run-serve-hidden.vbs"'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "GabboTV Template Server" -Action $action -Trigger $trigger `
  -Settings $settings -Description "Local HTTP server for the CasparCG/SPX template"
```

Then, in the CasparCG AMCP console, add it as an HTML layer:

```
PLAY 1-1 "http://localhost:8080/index.html"
```

For SPX Graphics, add the same URL as an HTML/web source layer.

