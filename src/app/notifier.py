import httpx
import logging
from app.config import settings

log = logging.getLogger(__name__)


def send(title: str, message: str) -> None:
    try:
        with httpx.Client() as client:
            client.post(
                f"{settings.ha_url}/api/services/notify/{settings.ha_notify_service}",
                headers={"Authorization": f"Bearer {settings.ha_token}"},
                json={"title": title, "message": message},
                timeout=10,
            )
    except Exception as e:
        log.error("HA notification failed: %s", e)
