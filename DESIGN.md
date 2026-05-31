# foodshop — Design Handoff

This document is for Claude Design. All logic and data fetching is complete.
Your job is visual design, layout, and UX polish.

## Tech stack

- React 18, TypeScript, Vite
- **No CSS framework is installed.** Add Tailwind, CSS modules, or plain CSS — your choice.
- Class names in components use BEM-style strings (e.g. `basket__total-bar`). You can keep these or swap to a different approach.

## Component inventory

| Component | File | Purpose |
|---|---|---|
| `App` | `src/App.tsx` | Root layout, data polling |
| `AuthFlow` | `src/components/AuthFlow.tsx` | Login modal — two-step: credentials → SMS code |
| `RunStatus` | `src/components/RunStatus.tsx` | Current run state + "Send to Sainsbury's" button |
| `ShoppingListPanel` | `src/components/ShoppingListPanel.tsx` | HA todo list with per-item run state |
| `BasketPanel` | `src/components/BasketPanel.tsx` | Live Sainsbury's basket with cost breakdown |

## Layout sketch

```
┌──────────────────────────────────────────────────────┐
│  header: app title        [run status] [send button] │
├─────────────────────────┬────────────────────────────┤
│  Shopping list          │  Basket                    │
│                         │                            │
│  ✓ Milk                 │  Dairy                     │
│    → Sainsbury's Semi…  │    Sainsbury's Semi 2L     │
│  ✓ Eggs                 │    £1.65          £1.65    │
│  ? Sriracha             │                            │
│  · Bread (pending)      │  Bakery                    │
│                         │    Thick sliced white      │
│                         │    800g         £1.10      │
│                         │                            │
│                         │  ────────────────────────  │
│                         │  Estimated total    £2.75  │
└─────────────────────────┴────────────────────────────┘
```

Mobile: stack vertically, shopping list first.

## Per-item states (ShoppingListPanel)

| `data-state` value | Meaning | Suggested treatment |
|---|---|---|
| `pending` | Not yet processed | Neutral |
| `added` | In the Sainsbury's basket | Green / tick |
| `not_found` | Search returned no results | Amber / warning |
| `failed` | groc error during add | Red / X |

## RunStatus states

| `data-status` value | Meaning |
|---|---|
| `idle` | No run in progress |
| `running` | Currently adding items — show a spinner |
| `complete` | Last run finished successfully |
| `error` | Last run failed — show `status.error` string |

## AuthFlow

- Appears as an overlay when `auth_status` is `unauthenticated` or `awaiting_sms`.
- Step 1: email + password form.
- Step 2: SMS code input (single field, numeric).
- On success the overlay disappears automatically.
- Keep it calm, not alarming — session expiry is routine.

## Data shapes

See `src/types.ts` for the full TypeScript interfaces.
Key fields for display:

**ItemResult** (from a shopping run):
- `item` — original HA list name (e.g. "milk")
- `product_name` — what Sainsbury's matched (e.g. "Sainsbury's Semi-Skimmed Milk 2L")
- `price` — GBP float or null
- `status` — added / not_found / failed

**BasketItem** (live from Sainsbury's):
- `name`, `price`, `quantity`, `unit`, `category`
- Category may be null — group these as "Uncategorised"

## Prices

Always format as GBP: `£X.XX`. Use `Intl.NumberFormat` (already used in `BasketPanel`).

## What not to change

- `src/types.ts` — data contracts, keep in sync with backend
- `src/api.ts` — API calls, endpoints are fixed
- `src/hooks/usePolling.ts` — polling logic
- The polling intervals in `App.tsx` (2s running / 30s idle)
- Any component logic (state, event handlers, async calls)

## Running locally

```bash
# Terminal 1 — backend
cd /mnt/c/DevOps/home/foodshop
python3 -m uvicorn app.main:app --reload

# Terminal 2 — frontend dev server (proxies /api to backend)
cd ui
npm install
npm run dev
```

Open http://localhost:5173
