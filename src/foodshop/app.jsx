/* app.jsx — foodshop: wired to real API */

const { useState, useCallback, useRef, useEffect } = React;

// ── accent palette (design tokens only — no data) ──────────────────────────
const ACCENTS = {
  garden:   { a: "#3aa86c", bright: "#46c47f", ink: "#07150d", soft: "rgba(58,168,108,.14)", glow: "rgba(70,196,127,.40)" },
  tomato:   { a: "#d9663f", bright: "#ef7a4e", ink: "#1f0d06", soft: "rgba(217,102,63,.15)",  glow: "rgba(239,122,78,.40)" },
  bluebell: { a: "#2f74d6", bright: "#4d8df0", ink: "#030b1a", soft: "rgba(47,116,214,.15)",  glow: "rgba(77,141,240,.40)" },
  plum:     { a: "#8a5fd6", bright: "#a079ef", ink: "#130822", soft: "rgba(138,95,214,.15)",  glow: "rgba(160,121,239,.40)" },
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "garden",
  "warmth": 1,
  "receiptFoot": "estimate · final price confirmed at checkout",
  "showSavings": true
}/*EDITMODE-END*/;

// ── API helpers ────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // ── core state (driven by /api/status polling) ─────────────────────────
  const [runStatus,    setRunStatus]    = useState("idle");
  const [authStatus,   setAuthStatus]   = useState("unknown");
  const [showAuth,     setShowAuth]     = useState(false);
  const [lastRunAt,    setLastRunAt]    = useState(null);
  const [pendingItems, setPendingItems] = useState([]);
  const [activeItem,   setActiveItem]   = useState(null);
  const [results,      setResults]      = useState({});  // item -> {status, product_name, price, ...}
  const [error,        setError]        = useState(null);

  // ── basket state (driven by /api/basket polling) ───────────────────────
  const [basket,  setBasket]  = useState([]);
  const [savings, setSavings] = useState(0);  // real Nectar/offers figure from groc

  const isRunning = runStatus === "running";

  // ── poll /api/status ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const s = await apiFetch("/api/status");
        if (cancelled) return;
        setRunStatus(s.run_status);
        setAuthStatus(s.auth_status);
        setLastRunAt(s.last_run_at ? s.last_run_at * 1000 : null);  // unix → ms
        setActiveItem(s.active || null);
        setError(s.error);
        setPendingItems(s.pending_items || []);
        // array → name-keyed map so parts.jsx stateFor/resultFor work unchanged
        const map = {};
        for (const r of s.results || []) map[r.item] = r;
        setResults(map);
      } catch { /* network blip — keep last state */ }
    }
    poll();
    const id = setInterval(poll, isRunning ? 2000 : 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isRunning]);

  // ── poll /api/basket ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchBasket() {
      try {
        const b = await apiFetch("/api/basket");
        if (cancelled) return;
        setBasket(b.items || []);
        setSavings(b.savings || 0);  // real figure; 0 hides the Nectar line
      } catch {}
    }
    fetchBasket();
    const id = setInterval(fetchBasket, isRunning ? 5000 : 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isRunning]);

  // ── apply accent + warmth css vars ────────────────────────────────────
  useEffect(() => {
    const ac = ACCENTS[t.accent] || ACCENTS.garden;
    const r = document.documentElement.style;
    r.setProperty("--accent",        ac.a);
    r.setProperty("--accent-bright", ac.bright);
    r.setProperty("--accent-ink",    ac.ink);
    r.setProperty("--accent-soft",   ac.soft);
    r.setProperty("--accent-glow",   ac.glow);
  }, [t.accent]);

  useEffect(() => {
    document.documentElement.style.setProperty("--warmth", t.warmth);
  }, [t.warmth]);

  // ── actions ────────────────────────────────────────────────────────────
  async function runShop() {
    if (isRunning) return;
    try {
      await apiFetch("/api/shop", { method: "POST" });
      setRunStatus("running");
    } catch (e) {
      setError(String(e));
    }
  }

  // ── derived values for child components ────────────────────────────────
  const stateFor = (item) => {
    if (results[item]) return results[item].status;   // added / not_found / failed
    if (activeItem === item) return "processing";
    return "pending";
  };
  const resultFor = (item) => results[item] || null;

  const total            = basket.reduce((s, i) => s + i.price * i.quantity, 0);
  const effectiveSavings = t.showSavings ? savings : 0;
  const processed        = Object.keys(results).length;

  const statusObj = {
    run_status:    runStatus,
    auth_status:   authStatus,
    last_run_at:   lastRunAt,
    pending_count: pendingItems.length,
    total:         pendingItems.length,
    active:        activeItem,
    error,
  };

  const needsAuth = authStatus === "unauthenticated" || authStatus === "awaiting_sms";

  useEffect(() => {
    if (needsAuth) setShowAuth(true);
  }, [authStatus]);

  // ── Mealie import state ────────────────────────────────────────────────────
  const [undoBatch, setUndoBatch] = useState(null);

  // check for an existing last-import on mount (e.g. after page refresh)
  useEffect(() => {
    apiFetch("/api/mealie/last-import")
      .then((b) => { if (b) setUndoBatch(b); })
      .catch(() => {});
  }, []);

  function handleImported(result) {
    // result = {batch_id, added, count}
    setUndoBatch({ ...result, items: result.added, recipes: [] });
  }

  return (
    <div className="app">
      <div className="shell">
        <Header authStatus={authStatus} onAccount={() => setShowAuth(true)} />
        <RunBar status={statusObj} total={total} processed={processed} onSend={runShop} />

        {/* Undo banner — shown immediately after a Mealie import */}
        {undoBatch && (
          <UndoBanner
            batch={undoBatch}
            onUndo={() => setUndoBatch(null)}
            onDismiss={() => setUndoBatch(null)}
          />
        )}

        {/* Mealie meal plan panel — collapsible, sits above the grid */}
        <MealiePanel onImported={handleImported} />

        <div className="grid">
          <ShoppingList
            items={pendingItems}
            stateFor={stateFor}
            resultFor={resultFor}
            activeItem={activeItem}
          />
          <Basket
            items={basket}
            savings={effectiveSavings}
            receiptFoot={isRunning ? "live · updating as items are added" : t.receiptFoot}
          />
        </div>
      </div>

      {showAuth && (
        <AuthFlow
          authStatus={authStatus}
          onAuthenticated={() => { setShowAuth(false); setAuthStatus("authenticated"); }}
          onClose={() => setShowAuth(false)}
        />
      )}

      <TweaksPanel
        tweaks={t}
        setTweak={setTweak}
        accents={Object.fromEntries(Object.keys(ACCENTS).map((k) => [k, ACCENTS[k].bright]))}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
