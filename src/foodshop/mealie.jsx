/* mealie.jsx — meal plan panel + undo banner
   DESIGN NOTES for Claude Design:
   - MealiePanel sits above the two-column grid, collapsed by default.
   - When expanded it shows a horizontal scroll of day cards.
   - Each day card lists the meals planned; each meal has a checkbox.
   - The "Add to list" button counts selected ingredients and shows the number.
   - After import the panel collapses and an UndoBanner appears below the RunBar.
   - UndoBanner is transient (auto-dismisses after 60s) with an explicit undo button.
   - Entry types: "breakfast", "lunch", "dinner", "side", "snack" — icon or label each.
   - recipe_image URL is provided; show as a small thumbnail (40×40, rounded).
*/

const { useState, useEffect, useCallback, useRef } = React;

// ── helpers ─────────────────────────────────────────────────────────────────

const ENTRY_LABEL = {
  breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner",
  side: "Side", snack: "Snack", dessert: "Dessert",
};

function groupByDate(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date).push(e);
  }
  return Array.from(map.entries()).map(([date, meals]) => ({ date, meals }));
}

function fmtDate(iso) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .format(new Date(iso));
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ── UndoBanner ───────────────────────────────────────────────────────────────
// DESIGN: a slim, dismissible bar between RunBar and the grid. Not alarming.
function UndoBanner({ batch, onUndo, onDismiss }) {
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState(null);

  // auto-dismiss after 60s
  useEffect(() => {
    const id = setTimeout(onDismiss, 60_000);
    return () => clearTimeout(id);
  }, [onDismiss]);

  async function handleUndo() {
    setUndoing(true);
    setError(null);
    try {
      await apiFetch("/api/mealie/undo", { method: "POST" });
      onUndo();
    } catch {
      setError("Couldn't remove items — try again.");
      setUndoing(false);
    }
  }

  const recipes = batch.recipes?.join(", ") || "recipe";

  return (
    <div className="undo-banner">
      <span className="undo-banner__msg">
        Added <b>{batch.count ?? batch.items?.length ?? "?"}</b> ingredients from <b>{recipes}</b> to your list.
      </span>
      {error && <span className="undo-banner__err">{error}</span>}
      <button className="undo-banner__btn" onClick={handleUndo} disabled={undoing}>
        {undoing ? "Removing…" : "Undo"}
      </button>
      <button className="undo-banner__close" onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  );
}

// ── MealiePanel ───────────────────────────────────────────────────────────────
function MealiePanel({ onImported }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState(new Set()); // recipe slugs
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/mealie/plan?days=${days}`);
      setEntries(data.entries || []);
      setSelected(new Set()); // reset selection on refresh
    } catch (e) {
      setError(e.message === "503" ? "Mealie not configured — add MEALIE_URL and MEALIE_TOKEN to .env" : "Could not reach Mealie.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  // fetch on open
  useEffect(() => { if (open) fetchPlan(); }, [open, fetchPlan]);

  function toggle(slug) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(entries.map((e) => e.recipe_slug)));
  }

  function selectNone() { setSelected(new Set()); }

  async function handleImport() {
    if (!selected.size) return;
    setImporting(true);
    setError(null);
    try {
      const result = await apiFetch("/api/mealie/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs: Array.from(selected) }),
      });
      setOpen(false);
      setSelected(new Set());
      onImported(result);
    } catch {
      setError("Import failed — check HA connection and try again.");
    } finally {
      setImporting(false);
    }
  }

  const days_opts = [3, 5, 7, 14];
  const groups = groupByDate(entries);
  // unique slugs for selection counting
  const uniqueSlugs = [...new Set(entries.map((e) => e.recipe_slug))];
  const selectedCount = [...selected].filter((s) => uniqueSlugs.includes(s)).length;

  return (
    <div className="mealie" data-open={open}>
      {/* ── collapsed trigger ── */}
      <button className="mealie__trigger" onClick={() => setOpen((v) => !v)}>
        {/* DESIGN: add a fork/meal icon here */}
        <span className="mealie__trigger-label">
          {open ? "Close meal plan" : "Add from meal plan"}
        </span>
        <span className="mealie__trigger-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {/* ── expanded panel ── */}
      {open && (
        <div className="mealie__panel">
          <div className="mealie__toolbar">
            <div className="mealie__day-picker">
              {days_opts.map((d) => (
                <button key={d} className="mealie__day-btn" data-active={days === d}
                  onClick={() => setDays(d)}>{d}d</button>
              ))}
            </div>
            <div className="mealie__sel-btns">
              <button className="mealie__sel-btn" onClick={selectAll}>All</button>
              <button className="mealie__sel-btn" onClick={selectNone}>None</button>
            </div>
          </div>

          {loading && <div className="mealie__loading">Loading meal plan…</div>}
          {error && <div className="mealie__error">{error}</div>}

          {!loading && !error && entries.length === 0 && (
            <div className="mealie__empty">No meals planned for the next {days} days.</div>
          )}

          {!loading && groups.length > 0 && (
            <div className="mealie__days">
              {groups.map(({ date, meals }) => (
                <div className="mealie__day" key={date}>
                  <div className="mealie__date">{fmtDate(date)}</div>
                  {meals.map((meal) => (
                    <label key={`${meal.recipe_slug}-${meal.entry_type}`} className="mealie__meal"
                      data-checked={selected.has(meal.recipe_slug)}>
                      <input
                        type="checkbox"
                        className="mealie__check"
                        checked={selected.has(meal.recipe_slug)}
                        onChange={() => toggle(meal.recipe_slug)}
                      />
                      {meal.recipe_image && (
                        <img className="mealie__thumb" src={meal.recipe_image}
                          alt="" width={40} height={40}
                          onError={(e) => { e.currentTarget.style.display = "none"; }} />
                      )}
                      <div className="mealie__meal-body">
                        <span className="mealie__meal-name">{meal.recipe_name}</span>
                        <span className="mealie__meal-type">
                          {ENTRY_LABEL[meal.entry_type] ?? meal.entry_type}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}

          {error && <p className="mealie__err">{error}</p>}

          <div className="mealie__footer">
            <button className="mealie__import-btn"
              disabled={!selectedCount || importing}
              onClick={handleImport}>
              {importing
                ? "Adding…"
                : selectedCount
                  ? `Add ingredients from ${selectedCount} recipe${selectedCount > 1 ? "s" : ""}`
                  : "Select recipes above"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { MealiePanel, UndoBanner });
