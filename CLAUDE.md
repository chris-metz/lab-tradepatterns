# Trade Patterns

## Konventionen

- Kommunikation auf Deutsch, Code und Commits auf Englisch
- Commit-Messages: Conventional Commits Format

## Wichtig

- `.env` im Projekt-Root mit `DATABASE_URL` wird benötigt (nicht im Repo)
- DB-Schema-Änderungen: `npx drizzle-kit push` aus `packages/shared` ausführen

## Architektur-Entscheidungen

- Jedes Pattern bekommt eigene DB-Tabelle (`backtest_{name}_runs`), eigene Types und eigenes Modul
- Detektoren leben in `packages/shared/src/patterns/` (wiederverwendbar)
- Kein generisches Pattern-System, kein JSONB – alles explizit und typisiert
- DB speichert nur aggregierte Ergebnisse pro Parameterkombination (avg recovery, win rates), keine Einzelevents

## Workers

- **backtester**: CLI-Tool für historische Pattern-Analyse mit Binance REST API (1s-Klines)
  - Cached Daten als CSV unter `workers/backtester/data/` (gitignored)
  - Ergebnisse in `backtest_*`-Tabellen
  - Usage: `npx tsx workers/backtester/src/index.ts --from YYYY-MM-DD --to YYYY-MM-DD [--symbol BTCUSDT] [--pattern rapid-drop] [--no-persist] [--dry-run]`
  - Pattern-agnostisch: `--pattern` wählt das Pattern-Modul (default: `rapid-drop`)
  - Neue Patterns: Modul in `workers/backtester/src/patterns/` + Eintrag in Registry

## Offene Entscheidungen

- Charts-Library für Dashboard noch nicht gewählt
