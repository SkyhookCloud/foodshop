/**
 * ShoppingListPanel
 * -----------------
 * Left panel. Shows the live HA todo list with per-item run status overlaid.
 *
 * DESIGN NOTES for Claude Design:
 * - Each item has one of four states: pending / added / not_found / failed.
 * - "pending" = on the HA list but not yet sent to Sainsbury's this run.
 * - Use colour + icon to distinguish states at a glance (green tick, amber warning, red X).
 * - The list should feel like a checklist, not a data table.
 * - Items are plain strings from HA — no editing in this panel.
 */

import type { ItemResult } from "../types";

interface Props {
  items: string[];
  results: ItemResult[];
  isRunning: boolean;
}

type ItemState = "pending" | "added" | "not_found" | "failed" | "processing";

function getItemState(item: string, results: ItemResult[], isRunning: boolean): ItemState {
  const result = results.find((r) => r.item === item);
  if (result) return result.status as ItemState;
  if (isRunning) {
    // The item currently being processed is the first one with no result yet
    const processedItems = new Set(results.map((r) => r.item));
    const remaining = [];
    for (const i of results.map((r) => r.item)) void i; // ensure order preserved
    if (!processedItems.has(item)) return "pending";
  }
  return "pending";
}

const STATE_LABEL: Record<ItemState, string> = {
  pending: "Pending",
  added: "Added",
  not_found: "Not found",
  failed: "Failed",
  processing: "Adding…",
};

export function ShoppingListPanel({ items, results, isRunning }: Props) {
  if (items.length === 0) {
    return (
      <div className="shopping-list shopping-list--empty">
        <p className="shopping-list__empty-message">
          Your HA shopping list is empty. Add items in Home Assistant and they'll appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="shopping-list">
      <div className="shopping-list__header">
        <h2 className="shopping-list__title">Shopping list</h2>
        <span className="shopping-list__count">{items.length} items</span>
      </div>

      <ul className="shopping-list__items">
        {items.map((item) => {
          const itemState = getItemState(item, results, isRunning);
          const result = results.find((r) => r.item === item);

          return (
            <li key={item} className="shopping-list__item" data-state={itemState}>
              {/* DESIGN: replace this span with an icon component */}
              <span className="shopping-list__item-icon" aria-hidden="true" />

              <div className="shopping-list__item-body">
                <span className="shopping-list__item-name">{item}</span>
                {result?.product_name && result.product_name !== item && (
                  <span className="shopping-list__item-matched">→ {result.product_name}</span>
                )}
              </div>

              <span className="shopping-list__item-state">{STATE_LABEL[itemState]}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
