import httpx
from app.config import settings


def _headers() -> dict:
    return {"Authorization": f"Bearer {settings.ha_token}"}


def get_todo_items() -> list[str]:
    with httpx.Client() as client:
        resp = client.post(
            f"{settings.ha_url}/api/services/todo/get_items",
            headers=_headers(),
            params={"return_response": "true"},
            json={"entity_id": settings.ha_todo_entity},
            timeout=10,
        )
        resp.raise_for_status()
    data = resp.json()
    items = data.get("service_response", data).get(settings.ha_todo_entity, {}).get("items", [])
    return [i["summary"] for i in items if i.get("status") == "needs_action"]


def add_items(summaries: list[str]) -> None:
    """Add items to the HA shopping list one at a time (HA doesn't batch-add)."""
    with httpx.Client() as client:
        for summary in summaries:
            client.post(
                f"{settings.ha_url}/api/services/todo/add_item",
                headers=_headers(),
                json={"entity_id": settings.ha_todo_entity, "item": summary},
                timeout=10,
            ).raise_for_status()


def remove_items(summaries: list[str]) -> None:
    """Remove items from the HA shopping list by summary text."""
    if not summaries:
        return
    with httpx.Client() as client:
        client.post(
            f"{settings.ha_url}/api/services/todo/remove_item",
            headers=_headers(),
            json={"entity_id": settings.ha_todo_entity, "item": summaries},
            timeout=10,
        ).raise_for_status()
