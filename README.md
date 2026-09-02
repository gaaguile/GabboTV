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
  /TR 'wscript.exe "C:\Users\Gabo\OneDrive\Repo\GabboTV\scripts\run-alert-check-hidden.vbs"' `
  /ST 00:00
```

Run `npm run build` again any time you change `ticker-alerts.ts` or the `src/` files.

If a task was already created pointing at `node.exe` directly, update it in place instead of
recreating it:

```powershell
schtasks /Change /TN "Gabriel TEKKEN TV Market Alerts" `
  /TR 'wscript.exe "C:\Users\Gabo\OneDrive\Repo\GabboTV\scripts\run-alert-check-hidden.vbs"'
```

## Broadcast template (CasparCG / SPX)

`template/` holds the on-air graphic: a dark, Bloomberg/MSNBC-style dashboard board (three-column
ticker grid + market-snapshot strip + market-open badge), built for a 2560x1080 canvas, that polls
`data/snapshot.json` every 5 seconds and highlights any row with an active alert (P = price
threshold, S = stochastic oversold, A = all-time high).

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

### Secondary monitor at 2560x1080

2560x1080 isn't one of CasparCG's built-in broadcast video-modes, so define it as a custom mode
in `casparcg.config` (tested against CasparCG Server 2.5.0's actual schema — there is no
`<fullscreen>` element; true fullscreen is `windowed=false`, but its display-index detection
proved unreliable on Windows in testing, see below):

```xml
<configuration>
  <video-modes>
    <video-mode>
      <id>2560x1080p60</id>
      <width>2560</width>
      <height>1080</height>
      <time-scale>60000</time-scale>
      <duration>1000</duration>
      <cadence>800</cadence>
    </video-mode>
  </video-modes>
  <channels>
    <channel>
      <video-mode>2560x1080p60</video-mode>
      <consumers>
        <screen>
          <device>1</device>
          <windowed>true</windowed>
          <borderless>true</borderless>
          <always-on-top>true</always-on-top>
          <x>1920</x>
          <y>-104</y>
          <width>2560</width>
          <height>1080</height>
          <vsync>true</vsync>
        </screen>
      </consumers>
    </channel>
  </channels>
</configuration>
```

`<device>1 [1..]</device>`'s screen-index-based fullscreen mode (`windowed=false`) logged
`Could not find display settings for screen-index: 0` on this setup and never actually showed
anything, even though the channel/consumer reported successful init. The reliable fix: keep
`windowed=true` + `borderless=true` + `always-on-top=true`, and set `x`/`y`/`width`/`height` to
the secondary monitor's **exact virtual desktop coordinates** (not just its resolution) — this
renders a borderless window that's visually identical to fullscreen. Get those coordinates with:

```powershell
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Screen]::AllScreens | Select-Object DeviceName, Primary, `
  @{N='X';E={$_.Bounds.X}}, @{N='Y';E={$_.Bounds.Y}}, @{N='W';E={$_.Bounds.Width}}, @{N='H';E={$_.Bounds.Height}}
```

Monitors aren't always top-aligned in the virtual desktop (a negative `Y` like above is normal
if your monitors have different heights/mounting), so use the reported `X`/`Y` as-is.

**Known flakiness:** CasparCG's HTML/CEF module intermittently fails to initialize on launch
(`[error] [html] Failed to initialize CEF` in the console, with `PLAY` then returning
`404 PLAY FAILED`). This isn't a config problem — it happened on some launches and not others
with an identical config. If you see that error, just close CasparCG and relaunch; watch the
console for `Initialized html module.` appearing with **no** preceding CEF error before sending
`PLAY`.

Element names can otherwise vary slightly between CasparCG Server versions — check the XSD/sample
config shipped with your install if this doesn't validate. Restart CasparCG Server after editing,
then run the `PLAY` command above.