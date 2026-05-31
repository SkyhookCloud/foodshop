/**
 * AuthFlow
 * --------
 * Shown when auth_status is "unauthenticated" or "awaiting_sms".
 * Two-step: email+password → SMS code.
 *
 * DESIGN NOTES for Claude Design:
 * - This is a modal/overlay component. Style as a centered card or bottom sheet.
 * - The two steps (credentials / SMS code) are in-place transitions — no page navigation.
 * - The SMS step should feel urgent but calm (not alarming).
 * - Error messages are plain strings from the API — style them inline below the submit button.
 */

import { useState } from "react";
import type { AuthStatus } from "../types";
import { api } from "../api";

interface Props {
  authStatus: AuthStatus;
  onAuthenticated: () => void;
}

export function AuthFlow({ authStatus, onAuthenticated }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [step, setStep] = useState<"credentials" | "sms">(
    authStatus === "awaiting_sms" ? "sms" : "credentials"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      if (res.result === "authenticated") {
        onAuthenticated();
      } else if (res.result === "awaiting_sms") {
        setStep("sms");
      } else {
        setError("Login failed. Check your email and password.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSms(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.smsCode(smsCode);
      if (res.result === "authenticated") {
        onAuthenticated();
      } else {
        setError("Invalid code. Please try again.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  // DESIGN: wrap this in whatever modal/overlay structure you prefer
  return (
    <div className="auth-flow">
      {step === "credentials" ? (
        <form onSubmit={handleCredentials} className="auth-form">
          <h2 className="auth-title">Sign in to Sainsbury's</h2>
          <p className="auth-subtitle">Your session has expired.</p>

          <label className="auth-label">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="auth-input"
            />
          </label>

          <label className="auth-label">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="auth-input"
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSms} className="auth-form">
          <h2 className="auth-title">Enter verification code</h2>
          <p className="auth-subtitle">
            Sainsbury's has sent a code to your registered mobile number.
          </p>

          <label className="auth-label">
            Verification code
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={smsCode}
              onChange={(e) => setSmsCode(e.target.value)}
              required
              autoComplete="one-time-code"
              className="auth-input auth-input--otp"
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? "Verifying…" : "Verify"}
          </button>
        </form>
      )}
    </div>
  );
}
