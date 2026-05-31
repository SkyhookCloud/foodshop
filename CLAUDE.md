# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A home NAS Docker service that reads a shopping list from Home Assistant, adds items to a Sainsbury's basket via `uk-grocery-cli`, and provides a browser UI. Mealie (recipe manager) integration allows importing meal plan ingredients directly onto the HA shopping list.

## Commands

**Run locally (backend only):**
```bash
pip install -r src/requirements.txt
uvicorn app.main:app --reload  # run from src/
```

**Build and run in Docker (production):**
```bash
cp .env.example .env   # fill in values first
docker compose build
docker compose up -d
```

**First-time Sainsbury's login (run after container starts):**
```bash
docker exec -it foodshop npm run groc -- login --email you@example.com
```

**Check groc session is still valid:**
```bash
docker exec -it foodshop npm run groc -- status
```

There are no automated tests. No linting config is set up.

## Architecture

### Data flow

```
Home Assistant todo entity
    ↓  GET /api/services/todo/get_items
src/app/ha_client.py
    ↓
src/app/orchestrator.py  →  uk-grocery-cli (npm run groc -- search / add)
    ↓                            ↓
src/app/state.py          Sainsbury's website (via groc)
    ↓
src/app/notifier.py  →  HA push notification
```

```
Mealie container
    ↓  GET /api/groups/mealplans  →  GET /api/recipes/{slug}
src/app/mealie_client.py
    ↓
src/app/ha_client.py  →  POST /api/services/todo/add_item  (each ingredient)
src/app/import_tracker.py  →  data/import_history.json  (for undo)
```

### Backend (`src/app/`)

| File | Role |
|---|---|
| `main.py` | FastAPI app. All routes. Serves `src/foodshop/` as static files at `/`. |
| `state.py` | In-memory `AppState` singleton. Thread-safe. Tracks run status, active item, per-item results, auth status. Polled by the UI via `GET /api/status`. |
| `orchestrator.py` | Runs a shopping session: reads HA list → loops items → calls groc → updates state → notifies HA. Also `get_basket()` for the live basket endpoint. |
| `auth_manager.py` | Interactive Sainsbury's login via `pexpect`. Two-step: `start_login(email, password)` → `complete_sms(code)`. Holds the live subprocess between calls. |
| `ha_client.py` | HA REST API wrapper: `get_todo_items()`, `add_items()`, `remove_items()`. |
| `mealie_client.py` | Mealie REST API: `get_meal_plan(days)`, `get_recipe_ingredients(slug)`. Formats ingredient dicts to plain strings. |
| `import_tracker.py` | Persists Mealie import batches to `data/import_history.json`. `record()` / `last()` / `pop_last()` (undo removes the top batch). |
| `notifier.py` | Sends results to HA via `POST /api/services/notify/{service}`. |
| `config.py` | `pydantic-settings` — reads all env vars. `mealie_url` and `mealie_token` are optional; Mealie routes return 503 if absent. |

### Routes

| Method | Path | Notes |
|---|---|---|
| `POST` | `/shop` | HA-facing trigger. Requires `X-API-Secret` header. |
| `GET` | `/api/status` | Polled by UI every 2s (running) / 30s (idle). Returns `AppState.as_dict()`. |
| `GET` | `/api/basket` | Live groc basket. Returns `{items, savings}`. |
| `POST` | `/api/shop` | UI-facing trigger. No secret required (local-only). |
| `POST` | `/api/auth/login` | Step 1: email + password → starts pexpect session. |
| `POST` | `/api/auth/sms` | Step 2: SMS code → completes pexpect session. |
| `GET` | `/api/mealie/plan` | Meal plan for next N days. |
| `POST` | `/api/mealie/import` | Imports ingredients from selected recipe slugs to HA list. |
| `POST` | `/api/mealie/undo` | Removes last import batch from HA list. |

### UI (`src/foodshop/`)

Plain JSX loaded via CDN Babel — no build step. Files are served as static assets by FastAPI.

- `app.jsx` — root component. Owns all state. Polls `/api/status` and `/api/basket`. Composes all panels.
- `parts.jsx` — `Header`, `RunBar`, `ShoppingList`, `Basket`. Pure presentation.
- `auth.jsx` — two-step login modal. Calls `/api/auth/login` then `/api/auth/sms`.
- `mealie.jsx` — `MealiePanel` (collapsible, recipe checkboxes) + `UndoBanner` (auto-dismisses after 60s).
- `tweaks-panel.jsx` — live design tweaks (accent colour, warmth, receipt footer). Persisted in the `/*EDITMODE-BEGIN*/` block in `app.jsx`.
- `styles.css` — all styling. Uses CSS custom properties for theming.

Components are shared between files via `Object.assign(window, { ComponentName })` at the end of each file. Load order in `index.html` matters.

The `ui/` directory contains an unused Vite/TypeScript scaffold — ignore it.

### Docker

Single stage. Base image `node:20-slim` (for groc) + Python installed via apt. `uk-grocery-cli` is cloned from GitHub and `npm install`ed at build time.

Two persistent volumes:
- `groc-session` → `/home/appuser/.config` — Sainsbury's session cookies survive restarts
- `./data` is used by `import_tracker.py` for `import_history.json` — mount this if you need undo to survive restarts (not currently in `docker-compose.yml`)

### groc (uk-grocery-cli)

All groc calls go through `orchestrator._groc(*args)` which runs:
```
npm run groc -- --provider sainsburys <args>
```
from `/opt/uk-grocery-cli` as a subprocess. Auth errors are detected by scanning stdout+stderr for known strings. Session state lives in `/home/appuser/.config/uk-grocery-cli/` (the named volume).

### HA integration

`ha/` contains config snippets to paste into Home Assistant:
- `rest_command.yaml` — `trigger_shopping` REST command that calls `POST /shop`
- `automation.yaml` — triggers on `input_button.send_to_sainsburys` button press
- `secrets.yaml` — reminder to add `shopping_api_secret`

The HA shopping list integration must be enabled (Settings → Devices & Services → Add Integration → Shopping List) to create the `todo.shopping_list` entity.
