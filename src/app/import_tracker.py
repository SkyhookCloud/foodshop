"""
Tracks Mealie import batches for undo.

Persisted to data/import_history.json (volume-mounted in Docker) so the
last import survives a container restart. Only the most recent batch is
ever needed for undo; we keep the last 5 for debugging.
"""

import json
import time
import uuid
from pathlib import Path
from typing import Optional

_HISTORY_FILE = Path("/app/data/import_history.json")
_MAX_BATCHES = 5


def _load() -> list[dict]:
    try:
        return json.loads(_HISTORY_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _save(batches: list[dict]) -> None:
    _HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    _HISTORY_FILE.write_text(json.dumps(batches, indent=2))


def record(recipes: list[str], items: list[str]) -> str:
    """Save a new import batch. Returns the batch ID."""
    batch_id = str(uuid.uuid4())
    batches = _load()
    batches.append({
        "id": batch_id,
        "imported_at": time.time(),
        "recipes": recipes,
        "items": items,
    })
    _save(batches[-_MAX_BATCHES:])
    return batch_id


def last() -> Optional[dict]:
    """Return the most recent batch, or None."""
    batches = _load()
    return batches[-1] if batches else None


def pop_last() -> Optional[dict]:
    """Remove and return the most recent batch (for undo)."""
    batches = _load()
    if not batches:
        return None
    batch = batches.pop()
    _save(batches)
    return batch
