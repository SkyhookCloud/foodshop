from dataclasses import dataclass, field
from enum import Enum
from threading import Lock
from typing import Optional


class RunStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    COMPLETE = "complete"
    ERROR = "error"


class AuthStatus(str, Enum):
    UNKNOWN = "unknown"
    AUTHENTICATED = "authenticated"
    UNAUTHENTICATED = "unauthenticated"
    AWAITING_SMS = "awaiting_sms"


@dataclass
class ItemResult:
    item: str
    status: str  # "added" | "not_found" | "failed"
    product_name: Optional[str] = None
    price: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None  # populated if groc returns it; null otherwise


@dataclass
class AppState:
    run_status: RunStatus = RunStatus.IDLE
    auth_status: AuthStatus = AuthStatus.UNKNOWN
    last_run_at: Optional[float] = None
    pending_items: list[str] = field(default_factory=list)
    active_item: Optional[str] = None   # item currently being searched/added
    results: list[ItemResult] = field(default_factory=list)
    error: Optional[str] = None
    _lock: Lock = field(default_factory=Lock, repr=False)

    def reset_run(self) -> None:
        with self._lock:
            self.run_status = RunStatus.RUNNING
            self.active_item = None
            self.results = []
            self.error = None

    def set_active(self, item: str) -> None:
        with self._lock:
            self.active_item = item

    def set_result(self, result: ItemResult) -> None:
        with self._lock:
            self.results.append(result)
            self.active_item = None

    def finish(self, error: Optional[str] = None) -> None:
        import time
        with self._lock:
            self.last_run_at = time.time()
            self.active_item = None
            self.error = error
            self.run_status = RunStatus.ERROR if error else RunStatus.COMPLETE

    def as_dict(self) -> dict:
        with self._lock:
            return {
                "run_status": self.run_status,
                "auth_status": self.auth_status,
                "last_run_at": self.last_run_at,
                "pending_items": self.pending_items,
                "active": self.active_item,
                "results": [vars(r) for r in self.results],
                "error": self.error,
            }


state = AppState()
