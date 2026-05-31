import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import auth_manager, ha_client, import_tracker, mealie_client
from app.config import settings
from app.orchestrator import get_basket, run_shopping_session
from app.state import state

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger(__name__)

UI_DIR = Path(__file__).parent.parent / "foodshop"


@asynccontextmanager
async def lifespan(app: FastAPI):
    state.auth_status = auth_manager.check_auth()
    try:
        state.pending_items = ha_client.get_todo_items()
    except Exception:
        pass
    yield


app = FastAPI(title="foodshop", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Existing HA-facing endpoint (unchanged — keep HA rest_command working)
# ---------------------------------------------------------------------------

@app.post("/shop", status_code=202)
async def shop(background_tasks: BackgroundTasks, x_api_secret: str = Header(None)):
    if x_api_secret != settings.api_secret:
        raise HTTPException(status_code=403, detail="Invalid API secret")
    if state.run_status == "running":
        raise HTTPException(status_code=409, detail="A run is already in progress")
    background_tasks.add_task(run_shopping_session)
    return {"status": "started"}


@app.get("/health")
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# API endpoints consumed by the UI
# ---------------------------------------------------------------------------

@app.get("/api/status")
async def api_status():
    """Current run state + last results. Poll this from the UI."""
    return state.as_dict()


@app.get("/api/list")
async def api_list():
    """Live HA todo items."""
    try:
        items = ha_client.get_todo_items()
    except Exception as e:
        log.exception(e)
        raise HTTPException(status_code=502, detail="HA list unavailable")
    return {"items": items}


@app.get("/api/basket")
async def api_basket():
    """
    Current Sainsbury's basket fetched live from groc.
    Returns {items, savings}. Category included if groc surfaces it.
    """
    return get_basket()


# ---------------------------------------------------------------------------
# Mealie integration
# ---------------------------------------------------------------------------

def _require_mealie():
    if not settings.mealie_url or not settings.mealie_token:
        raise HTTPException(status_code=503, detail="Mealie not configured (MEALIE_URL / MEALIE_TOKEN)")


@app.get("/api/mealie/plan")
async def mealie_plan(days: int = 7):
    """
    Meal plan for the next `days` days.
    Returns [{date, entry_type, recipe_slug, recipe_name, recipe_image}].
    """
    _require_mealie()
    try:
        return {"entries": mealie_client.get_meal_plan(days)}
    except Exception as e:
        log.exception(e)
        raise HTTPException(status_code=502, detail="Could not fetch meal plan")


class MealieImportRequest(BaseModel):
    slugs: list[str]       # recipe slugs to import
    servings_scale: float = 1.0  # multiply quantities (future use)


@app.post("/api/mealie/import")
async def mealie_import(body: MealieImportRequest):
    """
    Fetch ingredients for each selected recipe slug and add them to the HA
    shopping list. Returns a batch record with items added + batch ID.
    """
    _require_mealie()
    if not body.slugs:
        raise HTTPException(status_code=400, detail="No recipes selected")

    all_items: list[str] = []
    recipe_names: list[str] = []

    for slug in body.slugs:
        try:
            items = mealie_client.get_recipe_ingredients(slug)
            all_items.extend(items)
            recipe_names.append(slug)
        except Exception as e:
            log.exception(e)
            raise HTTPException(status_code=502, detail=f"Could not fetch recipe {slug}")

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique_items = [i for i in all_items if not (i.lower() in seen or seen.add(i.lower()))]

    try:
        ha_client.add_items(unique_items)
    except Exception as e:
        log.exception(e)
        raise HTTPException(status_code=502, detail="Could not add items to HA")

    try:
        state.pending_items = ha_client.get_todo_items()
    except Exception:
        pass

    batch_id = import_tracker.record(recipes=recipe_names, items=unique_items)
    return {"batch_id": batch_id, "added": unique_items, "count": len(unique_items)}


@app.get("/api/mealie/last-import")
async def mealie_last_import():
    """Return the most recent import batch (for the undo banner), or null."""
    return import_tracker.last()


@app.post("/api/mealie/undo")
async def mealie_undo():
    """Remove the most recently imported items from the HA shopping list."""
    batch = import_tracker.pop_last()
    if not batch:
        raise HTTPException(status_code=404, detail="No import to undo")
    try:
        ha_client.remove_items(batch["items"])
    except Exception as e:
        # Put the batch back so the user can retry
        import_tracker.record(recipes=batch["recipes"], items=batch["items"])
        log.exception(e)
        raise HTTPException(status_code=502, detail="Could not remove items from HA")
    return {"undone": batch["items"], "count": len(batch["items"])}


class LoginRequest(BaseModel):
    email: str
    password: str


class SmsRequest(BaseModel):
    code: str


@app.post("/api/auth/login")
async def api_auth_login(body: LoginRequest):
    """
    Step 1 of the login flow. Provide email + password.
    Returns {"result": "authenticated"} or {"result": "awaiting_sms"} or {"result": "error"}.
    """
    result = auth_manager.start_login(body.email, body.password)
    return {"result": result, "auth_status": state.auth_status}


@app.post("/api/auth/sms")
async def api_auth_sms(body: SmsRequest):
    """
    Step 2. Provide the SMS verification code.
    Returns {"result": "authenticated"} or {"result": "error"}.
    """
    result = auth_manager.complete_sms(body.code)
    return {"result": result, "auth_status": state.auth_status}


@app.post("/api/shop", status_code=202)
async def api_shop(background_tasks: BackgroundTasks):
    """UI-facing trigger (no API secret required — UI is local-only)."""
    if state.run_status == "running":
        raise HTTPException(status_code=409, detail="A run is already in progress")
    background_tasks.add_task(run_shopping_session)
    return {"status": "started"}


# ---------------------------------------------------------------------------
# Serve the React SPA — must come last so API routes take priority
# ---------------------------------------------------------------------------

if UI_DIR.exists():
    app.mount("/", StaticFiles(directory=UI_DIR, html=True), name="ui")

    @app.get("/")
    async def root():
        return FileResponse(UI_DIR / "index.html")
