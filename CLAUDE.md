# Trade Patterns

## Konventionen

- Kommunikation auf Deutsch, Code und Commits auf Englisch
- Commit-Messages: Conventional Commits Format

## Wichtig

- `.env` im Projekt-Root mit `DATABASE_URL` wird benötigt (nicht im Repo)
- DB-Schema-Änderungen: `npx drizzle-kit push` aus `packages/shared` ausführen

## Architektur-Entscheidungen

- Jedes Pattern bekommt eigene DB-Tabellen, eigene Types und eigenes Modul
- Detektoren leben in `packages/shared/src/patterns/` (wiederverwendbar)
- Kein generisches Pattern-System, kein JSONB – alles explizit und typisiert
- Price Points in eigener Tabelle pro Pattern (nicht als JSONB im Event)

## Workers

- **backtester**: CLI-Tool für historische Pattern-Analyse mit Binance REST API (1s-Klines)
  - Cached Daten als CSV unter `workers/backtester/data/` (gitignored)
  - Ergebnisse in `backtest_*`-Tabellen
  - Usage: `npx tsx workers/backtester/src/index.ts --from YYYY-MM-DD --to YYYY-MM-DD [--symbol BTCUSDT] [--dry-run]`

## Offene Entscheidungen

- Charts-Library für Dashboard noch nicht gewählt
