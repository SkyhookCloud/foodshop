"""
Interactive Sainsbury's login via pexpect.

Flow:
  1. start_login(email, password) — spawns groc login with --password CLI arg,
     waits to see if SMS 2FA is needed.
     Returns "authenticated" or "awaiting_sms".
  2. complete_sms(code) — sends SMS code to the waiting process.
     Returns "authenticated" or "error".

The live process is kept in _proc between steps 1 and 2.
"""
import logging
import threading
import pexpect
from app.config import settings
from app.state import AuthStatus, state

log = logging.getLogger(__name__)

_proc: pexpect.spawn | None = None
_lock = threading.Lock()

_SMS_PATTERNS = ["(?i)verification code", "(?i)one.time", "(?i)sms", "(?i)otp", "(?i)code sent"]
_SUCCESS_PATTERNS = ["(?i)logged in", "(?i)success", "(?i)welcome", "(?i)signed in"]
_FAIL_PATTERNS = ["(?i)invalid", "(?i)incorrect", "(?i)failed", "(?i)error"]


def check_auth() -> AuthStatus:
    """Check whether a groc session exists on the filesystem."""
    import os
    config_dir = settings.groc_config_dir
    if os.path.isdir(config_dir) and any(
        entry.is_file() for entry in os.scandir(config_dir)
    ):
        return AuthStatus.AUTHENTICATED
    return AuthStatus.UNAUTHENTICATED


def start_login(email: str, password: str) -> str:
    """
    Start the login flow. Passes email + password as CLI args, then waits
    to see whether Sainsbury's asks for an SMS code.
    Returns "authenticated", "awaiting_sms", or "error".
    """
    global _proc
    with _lock:
        try:
            _proc = pexpect.spawn(
                "npm",
                args=["run", "groc", "--", "--provider", "sainsburys", "login",
                      "--email", email, "--password", password],
                cwd=settings.groc_dir,
                encoding="utf-8",
                timeout=120,
            )
        except pexpect.ExceptionPexpect:
            log.error("Failed to spawn groc login process")
            state.auth_status = AuthStatus.UNAUTHENTICATED
            return "error"

        try:
            # Wait to see whether Sainsbury's asks for SMS or goes straight to success
            patterns = _SMS_PATTERNS + _SUCCESS_PATTERNS + [pexpect.EOF, pexpect.TIMEOUT]
            idx = _proc.expect([p for p in patterns], timeout=90)
            n_sms = len(_SMS_PATTERNS)
            n_success = len(_SUCCESS_PATTERNS)

            if idx < n_sms:
                state.auth_status = AuthStatus.AWAITING_SMS
                return "awaiting_sms"
            elif idx < n_sms + n_success:
                state.auth_status = AuthStatus.AUTHENTICATED
                return "authenticated"
            else:
                output = _proc.before or ""
                log.error("Unexpected login response: %s", output)
                try:
                    with open("/tmp/groc_login_output.txt", "w") as f:
                        f.write(output)
                except Exception:
                    pass
                state.auth_status = AuthStatus.UNAUTHENTICATED
                return "error"
        except pexpect.ExceptionPexpect:
            log.error("groc login process failed while waiting for response")
            state.auth_status = AuthStatus.UNAUTHENTICATED
            return "error"


def complete_sms(code: str) -> str:
    """
    Send the SMS verification code to the waiting login process.
    Returns "authenticated" or "error".
    """
    global _proc
    with _lock:
        if _proc is None or not _proc.isalive():
            state.auth_status = AuthStatus.UNAUTHENTICATED
            return "error"

        _proc.sendline(code)
        patterns = _SUCCESS_PATTERNS + _FAIL_PATTERNS + [pexpect.EOF, pexpect.TIMEOUT]
        idx = _proc.expect(patterns, timeout=60)
        n_success = len(_SUCCESS_PATTERNS)

        n_fail = len(_FAIL_PATTERNS)
        eof_idx = n_success + n_fail

        if idx < n_success:
            state.auth_status = AuthStatus.AUTHENTICATED
            _proc = None
            return "authenticated"
        elif idx == eof_idx and _proc.exitstatus == 0:
            # groc exited cleanly — session was saved even if success string was missed
            state.auth_status = AuthStatus.AUTHENTICATED
            _proc = None
            return "authenticated"
        else:
            log.error("SMS verification failed: %s", _proc.before)
            state.auth_status = AuthStatus.UNAUTHENTICATED
            _proc = None
            return "error"
