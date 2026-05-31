"""
Mealie API client.

Endpoints used:
  GET /api/households/mealplans?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&perPage=50
  GET /api/recipes/{slug}

Ingredient shape (recipeIngredient[]):
  {
    "referenceId": "uuid",
    "quantity": 2.0,
    "unit":  {"name": "cups", "abbreviation": "c"},
    "food":  {"name": "flour"},
    "note":  "sifted",
    "originalText": "2 cups flour, sifted",
    "disableAmount": false
  }
"""

import logging
from datetime import date, timedelta

import httpx

from app.config import settings

log = logging.getLogger(__name__)


def _base() -> str:
    return settings.mealie_url.rstrip("/")


def _headers() -> dict:
    return {"Authorization": f"Bearer {settings.mealie_token}"}


def get_meal_plan(days: int = 7) -> list[dict]:
    """
    Return meal plan entries for today + `days` days ahead.
    Each entry: {date, entry_type, recipe_slug, recipe_name, recipe_image}.
    Entries without a recipe are filtered out.
    """
    start = date.today()
    end = start + timedelta(days=days - 1)

    with httpx.Client() as client:
        resp = client.get(
            f"{_base()}/api/households/mealplans",
            headers=_headers(),
            params={"start_date": start.isoformat(), "end_date": end.isoformat(), "perPage": 50},
            timeout=10,
        )
        resp.raise_for_status()

    entries = []
    for item in resp.json().get("items", []):
        recipe = item.get("recipe")
        if not recipe:
            continue
        entries.append({
            "date": item["date"],
            "entry_type": item.get("entryType", "dinner"),
            "recipe_slug": recipe["slug"],
            "recipe_name": recipe["name"],
            "recipe_image": f"{_base()}/api/media/recipes/{recipe['id']}/images/min-original.webp",
        })

    return entries


def get_recipe_ingredients(slug: str) -> list[str]:
    """
    Fetch a recipe and return its ingredients formatted as plain strings,
    ready to be added to an HA shopping list.
    """
    with httpx.Client() as client:
        resp = client.get(
            f"{_base()}/api/recipes/{slug}",
            headers=_headers(),
            timeout=10,
        )
        resp.raise_for_status()

    recipe = resp.json()
    result = []
    for ing in recipe.get("recipeIngredient", []):
        text = _format(ing)
        if text:
            result.append(text)
    return result


def _format(ing: dict) -> str | None:
    """
    Convert one Mealie ingredient object to a plain text shopping string.
    Returns None for blank/unresolvable entries.
    """
    if ing.get("disableAmount") or not ing.get("food"):
        # fall back to freetext fields
        return (ing.get("originalText") or ing.get("note") or "").strip() or None

    parts: list[str] = []

    qty = ing.get("quantity")
    if qty and qty > 0:
        parts.append(str(int(qty)) if qty == int(qty) else f"{qty:g}")

    unit = ing.get("unit") or {}
    unit_str = unit.get("abbreviation") or unit.get("name", "")
    if unit_str:
        parts.append(unit_str)

    food = ing.get("food") or {}
    food_name = food.get("name", "")
    if food_name:
        parts.append(food_name)

    text = " ".join(p for p in parts if p).strip()
    if ing.get("note"):
        text += f" ({ing['note']})"

    return text or (ing.get("originalText", "").strip() or None)
