# Security Review — foodshop (OWASP-aligned)

Review date: 2026-05-31

---

## Methodology

Each finding is mapped to the [OWASP Top 10 (2021)](https://owasp.org/www-project-top-ten/)
category it most closely aligns with, plus severity (Critical / High / Medium / Low)
and a `[FIXED]` marker where the code has already been remediated.

---

## A01 — Broken Access Control

### A01.1 `/api/shop` has no authentication — HIGH

**File:** `src/app/main.py:203-209`

```python
@app.post("/api/shop", status_code=202)
async def api_shop(background_tasks: BackgroundTasks):
    """UI-facing trigger (no API secret required — UI is local-only)."""
```

The `/shop` endpoint (line 38) requires `X-API-Secret`; `/api/shop` does
not. The comment asserts "local-only" as a defence, but this is topology-
based, not access-control-based. Any host on the Docker network can POST
to this endpoint and trigger a shopping run.

**Fix:** Apply the same `X-API-Secret` header check as `/shop`, or gate on
`Origin`/`Referer` matching the container's own hostname.

---

### A01.2 No CORS middleware configured — MEDIUM

**File:** `src/app/main.py`

No `CORSMiddleware` is registered. FastAPI serves the SPA static files
from the same origin, but Docker networking means the effective "origin"
boundary is the bridge network, not localhost. Other containers on the
same bridge can script cross-origin POSTs to:

- `/api/auth/login`
- `/api/auth/sms`
- `/api/shop`
- `/api/mealie/import`
- `/api/mealie/undo`

**Fix:** Add `CORSMiddleware` with an explicit `allow_origins` list.

---

### A01.3 `/api/status` exposes internal state unauthenticated — LOW

**File:** `src/app/main.py:57-60`

```python
@app.get("/api/status")
async def api_status():
    return state.as_dict()
```

Returns `auth_status`, `pending_items`, `results`, and `error` to any
caller. An attacker can map the shopping list contents, see when a run is
in flight, and observe auth state transitions — all without credentials.

**Fix:** This may be by design (UI needs it), but consider whether the
endpoint needs to be this verbose for unauthenticated callers.

---

## A02 — Cryptographic Failures

### A02.1 No TLS in the application — HIGH

**File:** `src/app/main.py`, `docker-compose.yml`

The app listens on plain HTTP on port 8000. The docker-compose comments
reference a Caddy reverse proxy for TLS termination, but the port binding
is commented out and Caddy is not declared as a dependency. If the port is
uncommented for debugging or LAN access, credentials and HA tokens
transmit in cleartext.

**Fix:** Either enforce TLS at the uvicorn level, or declare Caddy as a
docker-compose service dependency with a healthcheck gating foodshop's
startup.

---

### A02.2 Secrets stored in plaintext `.env` — MEDIUM

**Files:** `docker-compose.yml:13`, `src/app/config.py:15`

```yaml
env_file: .env
```

```python
model_config = {"env_file": ".env"}
```

`ha_token` (long-lived HA bearer token), `api_secret`, `mealie_token`, and
Sainsbury's credentials coexist in a single plaintext file in the project
root. No `.gitignore` entry was observed. A single `git add .` or
`docker-compose.yml` exposure leaks all secrets.

**Fix:** Add `.env` to `.gitignore`. Consider Docker secrets or a
`.env.local` convention. The `ha_token` in particular should be scoped — a
dedicated "foodshop" user with limited HA permissions rather than an
admin-level long-lived token.

---

## A03 — Injection

### A03.1 Shell injection via `start_login()` email — CRITICAL `[FIXED]`

**File:** `src/app/auth_manager.py:48-50`

```python
_proc = pexpect.spawn(
    ["npm", "run", "groc", "--", "--provider", "sainsburys", "login",
     "--email", email, "--password", password],
```

Originally passed a format string to `/bin/sh -c`. Now passes a list,
which bypasses the shell entirely. **Resolved.**

---

### A03.2 Password visible in process list — MEDIUM

**File:** `src/app/auth_manager.py:50`

```python
"--password", password,
```

Passing credentials as CLI arguments makes them visible in `/proc/<pid>/cmdline`
and `ps aux` output to any user on the host (or in the container with
`--pid=host`). This is an OWASP A03 concern (parameter injection
surface) and an A02 concern (credential exposure in process metadata).

**Fix:** If groc supports reading the password from stdin or an
environment variable, prefer that. At minimum, clear the `_proc`
reference promptly and avoid logging around the spawn call.

---

### A03.3 Credentials leaked in Docker logs on spawn failure — HIGH `[FIXED]`

**File:** `src/app/auth_manager.py:48-55`

When `pexpect.spawn` fails (e.g., npm not found, broken path), it raises
`pexpect.ExceptionPexpect` with the full command string — including
`--password <cleartext>` — in the exception message. FastAPI's default
exception handler logs the full traceback to stdout, which Docker
captures. An operator running `docker logs foodshop` would see:

```
pexpect.exceptions.ExceptionPexpect: The command was not found or was not
executable: npm run groc -- --provider sainsburys login --email user@example.com --password hunter2
```

**Fix:** Wrapped `pexpect.spawn` in `try/except pexpect.ExceptionPexpect`
and log a sanitised message (`"Failed to spawn groc login process"`)
without the command arguments. Same guard added around `_proc.expect`.
**Resolved.**

---

### A03.4 Unvalidated user input sent to subprocess stdin — LOW

**File:** `src/app/auth_manager.py:85`

```python
_proc.sendline(code)
```

The `code` field from `SmsRequest` is passed directly to the pexpect child
process stdin. While this is not shell-evaluated, no validation is done on
the content (e.g., length, character set). Malformed input could confuse
the groc CLI parser.

**Fix:** Validate `code` against a reasonable pattern (digits only,
bounded length) in the Pydantic model.

---

## A04 — Insecure Design

### A04.1 `check_auth()` relies on filesystem presence — MEDIUM

**File:** `src/app/auth_manager.py:29-37`

```python
def check_auth() -> AuthStatus:
    config_dir = settings.groc_config_dir
    if os.path.isdir(config_dir) and any(
        entry.is_file() for entry in os.scandir(config_dir)
    ):
        return AuthStatus.AUTHENTICATED
    return AuthStatus.UNAUTHENTICATED
```

"Any file exists → authenticated" is a binary proxy for session validity.
If an attacker gains write access to the groc-session volume (e.g., from
another compromised container on the same Docker volume), they can drop an
empty file and the app will report `AUTHENTICATED`. A shopping run would
then fail at the first groc call (caught by `_is_auth_error` in the
orchestrator), but the state misrepresentation could confuse users and
mask real auth failures.

**Fix:** Use a canary check — attempt a lightweight groc operation and
validate the response — or at minimum check for specific known session
files rather than `any(entry.is_file())`.

---

## A05 — Security Misconfiguration

### A05.1 No rate limiting — MEDIUM

**File:** `src/app/main.py`

No rate limiting middleware (e.g., slowapi) is configured. The auth
endpoints are exposed to brute force:

| Endpoint | Attack |
|---|---|
| `POST /api/auth/login` | Email/password spray |
| `POST /api/auth/sms` | SMS code enumeration |
| `POST /api/shop` | Resource exhaustion (spam runs) |

**Fix:** Add slowapi or a similar middleware with stricter limits on
auth endpoints (e.g., 5 req/min per source IP for `/api/auth/sms`).

---

### A05.2 No security headers — MEDIUM

**File:** `src/app/main.py`

Missing: `Strict-Transport-Security`, `X-Content-Type-Options`,
`X-Frame-Options`, `Content-Security-Policy`, `Referrer-Policy`.

**Fix:** Add a middleware that sets baseline security headers. FastAPI
does not do this by default.

---

### A05.3 Verbose error detail in HA notification — LOW

**File:** `src/app/orchestrator.py:33-35`

```python
except Exception as e:
    state.finish(error=str(e))
    notifier.send(..., message=f"Could not read shopping list: {e}")
```

The HA notification includes the raw exception string. If HA's notify
service logs or displays this to a shared household channel, internal
error details (connection refused, DNS failure, timeout targets) may
leak to non-admin users.

**Fix:** Log the exception server-side; send a generic message to HA.

---

## A06 — Vulnerable and Outdated Components

### A06.1 Unpinned dependency in Dockerfile — LOW

**File:** `Dockerfile:10`

```dockerfile
RUN git clone --depth 1 https://github.com/abracadabra50/uk-grocery-cli .
```

No branch, tag, or commit SHA is pinned. Every `docker compose build`
pulls whatever is on the default branch. A compromised or broken upstream
commit ships directly into the image. Builds are not reproducible.

**Fix:** Pin a specific commit SHA or tag.

---

### A06.2 No dependency scanning — LOW

No `requirements.txt` was reviewed in this pass, but there is no lockfile
(`pip freeze` output) and no Dependabot/Snyk/Trivy integration. Python
dependencies are unpinned beyond whatever `requirements.txt` specifies.

**Fix:** Generate a lockfile and add a CI step or pre-build hook that runs
`pip-audit` or Trivy against the image.

---

## A07 — Identification and Authentication Failures

### A07.1 Token comparison uses string equality — LOW

**File:** `src/app/main.py:40`

```python
if x_api_secret != settings.api_secret:
```

Timing-safe comparison (`hmac.compare_digest` or `secrets.compare_digest`)
should be used for secret-bearing comparisons. In practice, the latency
difference is negligible over HTTP, but it is a best-practice flag.

**Fix:** `if not secrets.compare_digest(x_api_secret or "", settings.api_secret):`

---

### A07.2 `check_auth()` is not called per-request — LOW

**File:** `src/app/main.py:22-23`

```python
async def lifespan(app: FastAPI):
    state.auth_status = auth_manager.check_auth()
```

Auth status is set once at startup and never rechecked. A session expiry
mid-uptime is only detected during a shopping run (via `_is_auth_error`).
The UI may show "Connected" for hours after the session actually expires.

**Fix:** Add a periodic background task that re-runs `check_auth()` and
updates `state.auth_status`.

---

## A08 — Software and Data Integrity Failures

### A08.1 CDN-sourced JS dependencies with no SRI — MEDIUM

**File:** `src/foodshop/` (referenced in CLAUDE.md)

React and Babel are loaded from CDN at runtime in the browser. Without
Subresource Integrity (SRI) hashes on the `<script>` tags, a compromised
CDN (or MITM on the LAN) can inject arbitrary JavaScript into the UI.
This code executes in the context of the foodshop SPA with access to all
API endpoints.

**Fix:** Add `integrity="sha384-..."` attributes to all CDN `<script>`
tags.

---

## A09 — Security Logging and Monitoring Failures

### A09.1 No structured logging — LOW

**File:** `src/app/main.py:15`

```python
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
```

Plain-text logging to stdout. No structured fields (request ID, source IP,
endpoint). No log levels differentiate auth failures from grocery
not-found events. Difficult to alert on in production.

**Fix:** Use `python-json-logger` for structured JSON logs. Log auth
events at WARNING level.

---

### A09.2 No audit trail for destructive actions — LOW

**File:** `src/app/main.py:153-165`

`POST /api/mealie/undo` removes items from the HA shopping list with no
audit log beyond the generic `logging.info`. If someone (or something)
repeatedly calls undo, there is no record of who triggered it or when
previous undos occurred beyond the single `import_history.json` entry.

**Fix:** Log undo operations with a correlation ID and the batch metadata.

---

## A10 — Server-Side Request Forgery (SSRF)

### A10.1 HA and Mealie URLs are user-configurable — LOW

**File:** `src/app/config.py:5-13`

```python
ha_url: str
mealie_url: str | None = None
```

If an attacker can modify `.env` (e.g., via another compromised container
with volume access), they can redirect `ha_url` to an attacker-controlled
server. The HA long-lived token would then be sent to that server on every
API call. This is a post-exploitation persistence vector rather than a
primary vulnerability.

**Fix:** Validate URL schemes (HTTPS only for non-local URLs). Restrict
the `.env` file permissions to `600` and the container user.

---

## Summary

| # | Finding | Category | Severity | Status |
|---|---------|----------|----------|--------|
| 1 | `/api/shop` unauthenticated | A01 | High | Open |
| 2 | No TLS in application | A02 | High | Open |
| 3 | No CORS middleware | A01 | Medium | Open |
| 4 | Password visible in `/proc` | A03/A02 | Medium | Open |
| 5 | Secrets in plaintext `.env` | A02 | Medium | Open |
| 6 | `check_auth()` filesystem-only check | A04 | Medium | Open |
| 7 | No rate limiting on auth endpoints | A05 | Medium | Open |
| 8 | No security headers | A05 | Medium | Open |
| 9 | CDN scripts without SRI | A08 | Medium | Open |
| 10 | Credentials leaked in Docker logs on spawn failure | A03 | High | **Fixed** |
| 11 | Shell injection via `start_login()` | A03 | Critical | **Fixed** |
| 12 | Global `_proc` race condition | A04 | Medium | **Fixed** |
| 13 | Error messages leak exception details | A05 | Medium | **Fixed** |
| 14 | Verbose HA notification error text | A05 | Low | Open |
| 15 | Unvalidated SMS code to subprocess | A03 | Low | Open |
| 16 | `/api/status` exposes state unauthenticated | A01 | Low | Open |
| 17 | No timing-safe API secret comparison | A07 | Low | Open |
| 18 | Auth status never rechecked after startup | A07 | Low | Open |
| 19 | Unpinned git clone in Dockerfile | A06 | Low | Open |
| 20 | No dependency scanning | A06 | Low | Open |
| 21 | No structured logging | A09 | Low | Open |
| 22 | No audit trail for undo | A09 | Low | Open |
| 23 | Configurable URLs could enable SSRF | A10 | Low | Open |
