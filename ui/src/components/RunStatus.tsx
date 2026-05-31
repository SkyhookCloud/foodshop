/**
 * RunStatus
 * ---------
 * Shows the current state of a shopping run and a trigger button.
 *
 * DESIGN NOTES for Claude Design:
 * - "running" state should have a progress indicator (spinner or animated bar).
 * - "complete" shows a success state with last_run_at timestamp.
 * - "error" shows the error message with a retry option.
 * - The "Send to Sainsbury's" button is the primary CTA — make it prominent.
 * - Disable the button while running or while not authenticated.
 */

import type { AppStatus } from "../types";
import { api } from "../api";

interface Props {
  status: AppStatus;
  onRunStarted: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  idle: "Ready",
  running: "Adding to basket…",
  complete: "Done",
  error: "Something went wrong",
};

export function RunStatus({ status, onRunStarted }: Props) {
  const isAuthenticated = status.auth_status === "authenticated";
  const isRunning = status.run_status === "running";

  async function handleSend() {
    try {
      await api.shop();
      onRunStarted();
    } catch {
      // error will surface on next status poll
    }
  }

  function formatTime(ts: number | null) {
    if (!ts) return null;
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    }).format(new Date(ts * 1000));
  }

  return (
    <div className="run-status">
      {/* DESIGN: style this label differently per run_status value */}
      <span className="run-status__label" data-status={status.run_status}>
        {STATUS_LABEL[status.run_status] ?? status.run_status}
      </span>

      {status.run_status === "error" && status.error && (
        <p className="run-status__error">{status.error}</p>
      )}

      {status.last_run_at && !isRunning && (
        <p className="run-status__timestamp">Last run: {formatTime(status.last_run_at)}</p>
      )}

      <button
        onClick={handleSend}
        disabled={isRunning || !isAuthenticated}
        className="run-status__button"
      >
        {isRunning ? "Running…" : "Send to Sainsbury's"}
      </button>
    </div>
  );
}
