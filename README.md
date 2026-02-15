# Trade Patterns

Analyse von Trading-Patterns im Kryptomarkt. Erkennt Preisbewegungen in Echtzeit (z.B. schnelle Drops bei Bitcoin) und zeichnet das Verhalten danach auf.

## Struktur

- **apps/web** – Next.js Dashboard zur Visualisierung
- **workers/price-monitor** – Hintergrund-Prozess für Binance-WebSocket und Pattern-Erkennung
- **packages/shared** – Geteilte TypeScript-Types und Utilities

## Setup

```bash
npm install
```

## Entwicklung

```bash
# Dashboard starten
npm run dev -w apps/web

# Price Monitor starten (mit Hot-Reload)
npm run dev -w workers/price-monitor
```

## Dienste

Der Price Monitor läuft als systemd User-Service:

```bash
# Status prüfen
systemctl --user status tradepatterns-monitor

# Logs verfolgen
journalctl --user -u tradepatterns-monitor -f

# Nach Änderungen am Worker neu starten
systemctl --user restart tradepatterns-monitor
```

## Tech-Stack

- TypeScript
- Next.js (App Router)
- Binance WebSocket API
- PostgreSQL + Drizzle ORM
