/**
 * App
 * ---
 * Root component. Owns all data fetching and passes props down.
 *
 * DESIGN NOTES for Claude Design:
 * - Layout: header + two-column main (ShoppingListPanel left, BasketPanel right).
 * - On mobile, stack vertically with ShoppingListPanel first.
 * - The AuthFlow overlay appears on top of everything when auth is required.
 * - RunStatus sits in the header or as a sticky bar — your call.
 * - Polling interval: 2s while running, 30s while idle.
 * - The app has no page routing — it's a single view.
 */

import { useState, useCallback } from "react";
import type { AppStatus, Basket } from "./types";
import { api } from "./api";
import { usePolling } from "./hooks/usePolling";
import { AuthFlow } from "./components/AuthFlow";
import { RunStatus } from "./components/RunStatus";
import { ShoppingListPanel } from "./components/ShoppingListPanel";
import { BasketPanel } from "./components/BasketPanel";

const EMPTY_STATUS: AppStatus = {
  run_status: "idle",
  auth_status: "unknown",
  last_run_at: null,
  pending_items: [],
  results: [],
  error: null,
};

export default function App() {
  const [status, setStatus] = useState<AppStatus>(EMPTY_STATUS);
  const [basket, setBasket] = useState<Basket>({ items: [] });

  const isRunning = status.run_status === "running";
  const needsAuth =
    status.auth_status === "unauthenticated" || status.auth_status === "awaiting_sms";

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.status();
      setStatus(s);
    } catch {
      // network blip — keep showing last known state
    }
  }, []);

  const refreshBasket = useCallback(async () => {
    try {
      const b = await api.basket();
      setBasket(b);
    } catch {
      // basket fetch failure is non-fatal
    }
  }, []);

  // Poll status frequently while running, slower when idle
  usePolling(refreshStatus, isRunning ? 2000 : 30000);

  // Refresh basket after each completed run
  usePolling(refreshBasket, 60000, !isRunning);

  function handleAuthenticated() {
    refreshStatus();
    refreshBasket();
  }

  return (
    <div className="app">
      {/* DESIGN: style the header — app name, auth indicator, run status */}
      <header className="app-header">
        <h1 className="app-title">foodshop</h1>
        <RunStatus status={status} onRunStarted={refreshStatus} />
      </header>

      <main className="app-main">
        <ShoppingListPanel
          items={status.pending_items}
          results={status.results}
          isRunning={isRunning}
        />
        <BasketPanel items={basket.items} />
      </main>

      {/* Overlay — rendered above everything when auth is needed */}
      {needsAuth && (
        <div className="auth-overlay">
          <AuthFlow authStatus={status.auth_status} onAuthenticated={handleAuthenticated} />
        </div>
      )}
    </div>
  );
}
