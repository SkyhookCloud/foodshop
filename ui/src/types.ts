// ---------------------------------------------------------------------------
// Data contracts — kept in sync with app/state.py
// Claude Design: do not change these types; style the components that use them
// ---------------------------------------------------------------------------

export type RunStatus = "idle" | "running" | "complete" | "error";
export type AuthStatus = "unknown" | "authenticated" | "unauthenticated" | "awaiting_sms";

export interface ItemResult {
  item: string;          // original name from HA shopping list
  status: "added" | "not_found" | "failed";
  product_name: string | null;
  price: number | null;  // GBP
  unit: string | null;
  category: string | null; // null if Sainsbury's doesn't return it
}

export interface AppStatus {
  run_status: RunStatus;
  auth_status: AuthStatus;
  last_run_at: number | null; // unix timestamp
  pending_items: string[];
  results: ItemResult[];
  error: string | null;
}

export interface TodoList {
  items: string[];
}

/** Single item in the live Sainsbury's basket */
export interface BasketItem {
  id: string;
  name: string;
  price: number;         // unit price GBP
  quantity: number;
  unit: string | null;
  category: string | null;
}

export interface Basket {
  items: BasketItem[];
}

// ---------------------------------------------------------------------------
// Derived / computed types used by UI components
// ---------------------------------------------------------------------------

/** Items grouped by category for the cost breakdown panel */
export interface CategoryGroup {
  category: string;
  items: BasketItem[];
  subtotal: number;
}
