import json
import logging
import subprocess
from app import ha_client, notifier
from app.config import settings
from app.state import AuthStatus, ItemResult, state

log = logging.getLogger(__name__)

_AUTH_ERRORS = ("not logged in", "unauthorised", "unauthorized", "401", "login required", "please log in")


def _groc(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["npm", "run", "--silent", "groc", "--", "--provider", "sainsburys", *args],
        cwd=settings.groc_dir,
        capture_output=True,
        text=True,
        timeout=30,
    )


def _is_auth_error(proc: subprocess.CompletedProcess) -> bool:
    combined = (proc.stdout + proc.stderr).lower()
    matched = any(kw in combined for kw in _AUTH_ERRORS)
    if matched:
        log.error("Auth error detected. stdout=%r stderr=%r", proc.stdout[:500], proc.stderr[:500])
    return matched


def run_shopping_session() -> None:
    state.reset_run()

    try:
        items = ha_client.get_todo_items()
    except Exception as e:
        state.finish(error=str(e))
        notifier.send(title="Sainsbury's — HA error", message=f"Could not read shopping list: {e}")
        return

    state.pending_items = items

    if not items:
        state.finish()
        notifier.send(title="Sainsbury's", message="Shopping list is empty, nothing to do.")
        return

    for item in items:
        state.set_active(item)
        result = _process_item(item)
        if result is None:
            # auth error — already notified
            state.finish(error="Session expired during run")
            return
        state.set_result(result)

    added = [r for r in state.results if r.status == "added"]
    not_found = [r for r in state.results if r.status == "not_found"]
    failed = [r for r in state.results if r.status == "failed"]

    parts = []
    if added:
        parts.append(f"Added: {', '.join(r.product_name or r.item for r in added)}")
    if not_found:
        parts.append(f"Not found: {', '.join(r.item for r in not_found)}")
    if failed:
        parts.append(f"Failed: {', '.join(r.item for r in failed)}")

    state.finish()
    notifier.send(
        title="Sainsbury's run complete",
        message=" | ".join(parts) or "Nothing to report.",
    )


def _process_item(item: str) -> ItemResult | None:
    """Returns None only on auth error (aborts the whole run)."""
    try:
        proc = _groc("search", item, "--json")

        if _is_auth_error(proc):
            state.auth_status = AuthStatus.UNAUTHENTICATED
            notifier.send(
                title="Sainsbury's session expired",
                message="Open the foodshop app to log in again.",
            )
            return None

        data = json.loads(proc.stdout.strip() or "{}")
        results = data.get("products", []) if isinstance(data, dict) else data
        if not results:
            return ItemResult(item=item, status="not_found")

        best = results[0]
        product_id = str(best["product_uid"])

        add_proc = _groc("add", product_id, "--qty", "1")

        if _is_auth_error(add_proc):
            state.auth_status = AuthStatus.UNAUTHENTICATED
            notifier.send(
                title="Sainsbury's session expired",
                message="Open the foodshop app to log in again.",
            )
            return None

        if add_proc.returncode != 0:
            log.warning("groc add failed for %s: %s", item, add_proc.stderr.strip())
            return ItemResult(item=item, status="failed")

        return ItemResult(
            item=item,
            status="added",
            product_name=best.get("name"),
            price=best.get("retail_price", {}).get("price"),
            unit=best.get("unit_price", {}).get("measure"),
        )

    except subprocess.TimeoutExpired:
        log.warning("Timeout processing: %s", item)
        return ItemResult(item=item, status="failed")
    except json.JSONDecodeError:
        log.warning("Bad JSON from groc search for: %s", item)
        return ItemResult(item=item, status="failed")
    except Exception as e:
        log.exception("Unexpected error for %s: %s", item, e)
        return ItemResult(item=item, status="failed")


def get_basket() -> dict:
    """
    Fetch the current Sainsbury's basket.
    Returns {"items": [...], "savings": float}.

    groc may return either a bare array or an object with an "items" key plus
    top-level savings fields (nectarSavings, totalSavings, savingsTotal, savings).
    We try every plausible key before falling back to summing per-item "saving" fields.
    """
    proc = _groc("basket", "--json")
    if _is_auth_error(proc):
        state.auth_status = AuthStatus.UNAUTHENTICATED
        return {"items": [], "savings": 0.0}
    if proc.returncode != 0 or not proc.stdout.strip():
        return {"items": [], "savings": 0.0}
    try:
        raw = json.loads(proc.stdout.strip())
    except json.JSONDecodeError:
        return {"items": [], "savings": 0.0}

    if isinstance(raw, list):
        items = raw
        top_savings = None
    else:
        items = raw.get("items", [])
        top_savings = (
            raw.get("nectarSavings")
            or raw.get("totalSavings")
            or raw.get("savingsTotal")
            or raw.get("savings")
        )

    savings = float(top_savings or sum(i.get("saving", 0) or 0 for i in items))
    return {"items": items, "savings": round(savings, 2)}
