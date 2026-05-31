/* parts.jsx — presentational components for foodshop
   Exported to window for use by app.jsx (separate Babel scope). */

/* ---------- tiny inline icons ---------- */
const Ico = {
  basket: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 8h14l-1.2 9.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z"/>
      <path d="M9 8 12 3l3 5"/>
      <path d="M10 12v3M14 12v3"/>
    </svg>
  ),
  check: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m5 12.5 4.2 4.2L19 7"/>
    </svg>
  ),
  warn: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 8.5v4.5M12 16.5h.01"/>
      <path d="M10.3 4.2 3 17a2 2 0 0 0 1.7 3h14.6a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/>
    </svg>
  ),
  x: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M7 7l10 10M17 7 7 17"/>
    </svg>
  ),
  dot: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/>
    </svg>
  ),
  arrow: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 12h15M13 6l6 6-6 6"/>
    </svg>
  ),
  matchArrow: (p) => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12h12M12 7l5 5-5 5"/>
    </svg>
  ),
  lock: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/>
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>
      <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  ),
  list: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M8 7h11M8 12h11M8 17h11"/>
      <path d="M4 7h.01M4 12h.01M4 17h.01"/>
    </svg>
  ),
};

const gbp = (n) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

/* ============================================================
   HEADER
   ============================================================ */
function Header({ authStatus, onAccount }) {
  const authed = authStatus === "authenticated";
  return (
    <header className="hdr">
      <div className="hdr__brand">
        <div className="hdr__mark">
          <Ico.basket stroke="#08160e" />
        </div>
        <div>
          <div className="hdr__name">food<b>shop</b></div>
          <div className="hdr__sub">home assistant · sainsbury's</div>
        </div>
      </div>

      <button className="acct" onClick={onAccount} title="Account & session">
        <span className={"acct__dot" + (authed ? "" : " acct__dot--out")} />
        <span>{authed ? "Connected" : "Signed out"}</span>
        <span className="acct__face">R</span>
      </button>
    </header>
  );
}

/* ============================================================
   RUN BAR
   ============================================================ */
const RUN_COPY = {
  idle:     "Ready when you are",
  running:  "Adding to your basket",
  complete: "Basket updated",
  error:    "Something went wrong",
};

function RunBar({ status, total, processed, onSend }) {
  const authed = status.auth_status === "authenticated";
  const running = status.run_status === "running";
  const fmtTime = (ts) =>
    ts ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(new Date(ts)) : null;

  let meta = null;
  if (status.run_status === "complete" && status.last_run_at) {
    meta = <span className="runbar__meta">Last run <b>{fmtTime(status.last_run_at)}</b> · {gbp(total)} in basket</span>;
  } else if (status.run_status === "idle") {
    meta = <span className="runbar__meta">{status.pending_count} items on your list</span>;
  } else if (running) {
    meta = <span className="runbar__meta"><b>{status.active || "searching"}</b> →</span>;
  } else if (status.run_status === "error") {
    meta = <span className="runbar__err">{status.error}</span>;
  }

  return (
    <div className="runbar">
      <div className="runbar__status">
        <span className="runbar__pip" data-status={status.run_status} />
        <span className="runbar__text">
          <span className="runbar__label">{RUN_COPY[status.run_status]}</span>
          {meta}
        </span>
      </div>

      {running && (
        <span className="runbar__count">{processed} / {status.total} done</span>
      )}

      <button className="cta" onClick={onSend} disabled={running || !authed}>
        {running ? (
          <><span className="spin" /> Running…</>
        ) : !authed ? (
          <><Ico.lock width="17" height="17" /> Sign in to send</>
        ) : (
          <>Send to Sainsbury's <Ico.arrow className="cta__arrow" /></>
        )}
      </button>
    </div>
  );
}

/* ============================================================
   SHOPPING LIST PANEL
   ============================================================ */
const STATE_TAG = {
  pending: "Pending", processing: "Adding…", added: "Added",
  not_found: "Not found", failed: "Failed",
};

function ListRow({ item, state, result, active }) {
  const TickIco =
    state === "added" ? Ico.check :
    state === "not_found" ? Ico.warn :
    state === "failed" ? Ico.x :
    state === "processing" ? Ico.dot : Ico.dot;

  const showMatch = state === "added" || state === "not_found" || state === "failed";

  return (
    <div className="list__row" data-state={state} data-active={active}>
      <span className="tick">
        {state === "processing" ? <span className="spin" style={{ width: 14, height: 14 }} /> : <TickIco />}
      </span>

      <div className="list__body">
        <div className="list__name">{item}</div>
        <div className={"match" + (showMatch ? " match--show" : "")}>
          <div className="match__inner">
            {state === "added" && result && (
              <div className="match__line">
                <Ico.matchArrow className="match__arrow" />
                <span className="match__prod">{result.product_name}</span>
                <span className="match__price">{gbp(result.price)}</span>
              </div>
            )}
            {state === "not_found" && (
              <div className="match__warn"><Ico.matchArrow /> No match at Sainsbury's — <b>skipped</b></div>
            )}
            {state === "failed" && (
              <div className="match__fail"><Ico.matchArrow /> {result?.reason || "Couldn't add to basket"}</div>
            )}
          </div>
        </div>
      </div>

      <span className="tag">{STATE_TAG[state]}</span>
    </div>
  );
}

function ShoppingList({ items, stateFor, resultFor, activeItem }) {
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">Shopping list</h2>
        <span className="panel__count">{items.length} items · from HA</span>
      </div>
      {items.length === 0 ? (
        <div className="empty">
          <div className="empty__ico"><Ico.list /></div>
          <p>Your Home Assistant list is empty. Add items there and they'll appear here.</p>
        </div>
      ) : (
        <div className="list">
          {items.map((it) => (
            <ListRow
              key={it}
              item={it}
              state={stateFor(it)}
              result={resultFor(it)}
              active={activeItem === it}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================
   BASKET PANEL — live receipt
   ============================================================ */
function Basket({ items, savings, receiptFoot }) {
  const groups = React.useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const k = it.category || "Uncategorised";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return Array.from(map.entries()).map(([category, its]) => ({
      category, items: its,
      subtotal: its.reduce((s, i) => s + i.price * i.quantity, 0),
    }));
  }, [items]);

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const pounds = gbp(total);
  const [whole, pence] = pounds.replace("£", "").split(".");

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">Basket</h2>
        <span className="panel__count">{items.length} added</span>
        <a className="panel__link" href="#" onClick={(e) => e.preventDefault()}>View on Sainsbury's ↗</a>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty__ico"><Ico.basket /></div>
          <p>Your Sainsbury's basket is empty. Send your list to start matching products.</p>
        </div>
      ) : (
        <div className="basket">
          <div className="basket__scroll">
            {groups.map((g) => (
              <div className="cat" key={g.category}>
                <div className="cat__head">
                  <span className="cat__name">{g.category}</span>
                  <span className="cat__sub">{gbp(g.subtotal)}</span>
                </div>
                {g.items.map((it) => (
                  <div className="bitem" key={it.id}>
                    <div>
                      <div className="bitem__name">{it.name}</div>
                      <div className="bitem__meta">
                        {it.quantity > 1 ? `${it.quantity} × ` : ""}{it.unit || "each"}
                      </div>
                    </div>
                    <div className="bitem__price">{gbp(it.price * it.quantity)}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="total">
            <div className="total__rows">
              <div className="total__row"><span>{items.length} items added</span><span>{gbp(total + (savings || 0))}</span></div>
              {savings ? (
                <div className="total__row"><span>Nectar &amp; offers</span><span>−{gbp(savings)}</span></div>
              ) : null}
            </div>
            <div className="total__grand">
              <span className="total__label">Estimated total</span>
              <span className="total__amount">£{whole}<span className="p">.{pence}</span></span>
            </div>
            <div className="total__foot">{receiptFoot}</div>
          </div>
        </div>
      )}
    </section>
  );
}

Object.assign(window, { Ico, gbp, Header, RunBar, ShoppingList, Basket });
