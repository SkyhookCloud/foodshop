/* auth.jsx — light receipt-paper auth modal (credentials → SMS) */

function AuthFlow({ authStatus, onAuthenticated, onClose }) {
  const [step, setStep] = React.useState(authStatus === "awaiting_sms" ? "sms" : "credentials");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  async function submitCreds(e) {
    e.preventDefault();
    setError(null);
    if (!password) { setError("Enter your password to continue."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.result === "authenticated") {
        onAuthenticated();
      } else if (data.result === "awaiting_sms") {
        setStep("sms");
      } else {
        setError("Sign-in failed. Check your email and password.");
      }
    } catch {
      setError("Could not reach foodshop — is the server running?");
    } finally {
      setLoading(false);
    }
  }

  async function submitSms(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.result === "authenticated") {
        onAuthenticated();
      } else {
        setError("That code doesn't look right. Check the text and try again.");
      }
    } catch {
      setError("Could not reach foodshop — is the server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className="auth" role="dialog" aria-modal="true">
        <div className="auth__top">
          <div className="auth__lock"><Ico.lock /></div>
          <div>
            <div className="auth__brand-name">Sainsbury's session</div>
            <div className="auth__brand-sub">foodshop needs to sign in on your behalf</div>
          </div>
        </div>

        <div className="auth__body">
          {step === "credentials" ? (
            <form onSubmit={submitCreds}>
              <div className="auth__step">Step 1 of 2</div>
              <h2 className="auth__title">Welcome back</h2>
              <p className="auth__desc">Your session expired — this happens every few weeks. Sign in once and foodshop keeps shopping.</p>

              <div className="field">
                <label className="field__label">Email</label>
                <input className="field__input" type="email" value={email}
                  autoComplete="email" required onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label className="field__label">Password</label>
                <input className="field__input" type="password" value={password} placeholder="••••••••••"
                  autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
              </div>

              {error && <div className="auth__err">{error}</div>}

              <button className="auth__btn" type="submit" disabled={loading}>
                {loading ? <><span className="spin" /> Signing in…</> : <>Continue</>}
              </button>
            </form>
          ) : (
            <form onSubmit={submitSms}>
              <div className="auth__step">Step 2 of 2</div>
              <h2 className="auth__title">Enter your code</h2>
              <p className="auth__desc">Sainsbury's texted a 6-digit code to your registered mobile number.</p>

              <div className="field">
                <label className="field__label">Verification code</label>
                <input className="field__input field__input--otp" type="text" inputMode="numeric"
                  maxLength={6} value={code} placeholder="······"
                  autoComplete="one-time-code" autoFocus
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              </div>

              {error && <div className="auth__err">{error}</div>}

              <button className="auth__btn" type="submit" disabled={loading}>
                {loading ? <><span className="spin" /> Verifying…</> : <>Verify &amp; connect</>}
              </button>

              <button type="button" className="auth__back" onClick={() => { setStep("credentials"); setError(null); }}>← Back to sign in</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AuthFlow });
