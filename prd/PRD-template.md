# PRD: GabboTV

## 1. Objetivo

Application to report on a TV or monitor screen market alerts with professional broadcast services standards (e.g. Bloomberg or MSNBC)

## 2. Contexto técnico

- **Stack:** TypeScript, Cloudflare Pages Functions, Node.js, UptimeRobot
- **Repo/proyecto:** https://github.com/gaaguile/GabboTV.git
- **Integraciones externas:** Re-use any API code from C:\Users\Gabo\OneDrive\Repo\Screener_DJIA
- **Almacenamiento:** local storage/ KV / D1 / any available in Cloudflare base tier
- **Constraints de seguridad:** [ej. secrets nunca en el cliente, HMAC en webhooks, no exponer puertos]
- **Convenciones del proyecto:** read ticker companies, or any data from file "ticker-alerts.ts"
- **Broadcast type graphics App:** CasparCG or SPX Broadcast or SPX Graphics (Solo or Production)


## 3. Requisitos funcionales

- [ ] Check for percentage change threshold (compared to previous close) defined in const ALERT_THRESHOLD in ticker-alerts.ts
- [ ] Check for Oversold threshold for Full Stochastic (14,3,3) in daily calculation as defined in const STOCHASTIC_THRESHOLD in ticker-alerts.ts

## 4. Requisitos no funcionales (si aplica)

- **Performance:** update each 5 minutes
- **Manejo de errores:** any necessary since it's going to use Yahoo API
- **Compatibilidad:** Windows11, CLoudflare workers and storage or any other API needed.

## 5. Fuera de alcance

- start from scratch but you can re-use code from a similar app already described

## 6. Criterios de éxito / Definición de "listo"


- [ ] excellent visual presentation at a professional broadcast level.

## 7. Datos de ejemplo / casos de prueba (opcional)

![alt text](image.png)

### Prompt sugerido para pegar junto con este PRD:

> Before writing any code, propose an implementation plan based on this PRD (files to create/modify, key architecture decisions). Wait for my confirmation before touching any code.
