# foodshop — Setup

foodshop is a Docker service that reads your Home Assistant (HA) shopping list and adds each item to a Sainsbury's basket via `uk-grocery-cli`. A browser UI provides a live view of the list and basket, handles Sainsbury's re-authentication, and optionally pulls meal plan ingredients from a Mealie instance.

## Prerequisites

- Docker and Docker Compose on the NAS
- Home Assistant instance accessible on the LAN
- A Sainsbury's account
- A long-lived HA API token (see below)
- Mobile app notification service name from HA (e.g. `mobile_app_your_phone`)

## Home Assistant — Shopping List

The service reads from the HA built-in shopping list, which creates a `todo.shopping_list` entity.

- Settings > Devices & Services > Add Integration > Shopping List

Once added, the entity appears in your HA sidebar and is editable from the HA mobile app.

## Configuration

Copy `.env.example` to `.env` and fill in each value:

```bash
cp .env.example .env
```

```env
# Home Assistant
HA_URL=http://homeassistant.local:8123
HA_TOKEN=<long-lived access token from HA profile page>
HA_TODO_ENTITY=todo.shopping_list
HA_NOTIFY_SERVICE=mobile_app_your_phone

# Security — generate with: python3 -c "import secrets; print(secrets.token_hex(32))"
API_SECRET=<random hex string>

# Mealie (optional — leave blank to disable the meal plan panel)
MEALIE_URL=http://mealie.local:9000
MEALIE_TOKEN=<mealie api token>
```

**HA token:** Profile (bottom-left avatar in HA) > Security > Long-Lived Access Tokens > Create token.

**API_SECRET:** A random string shared between HA and foodshop to authenticate the trigger call. Generate one with the command shown above and copy the same value into `ha/secrets.yaml`.

**HA_NOTIFY_SERVICE:** The entity ID suffix of your mobile app notification service. In HA, go to Developer Tools > Services, search for `notify`, and find the one matching your phone.

## Docker — Build and Run

```bash
docker compose build && docker compose up -d
```

The build clones `uk-grocery-cli` from GitHub and installs its Node.js dependencies, so first build takes a few minutes. Subsequent builds are fast if the Dockerfile hasn't changed.

Verify it's running. The health endpoint is reachable directly on the container network regardless of whether Caddy is set up yet:

```bash
docker exec foodshop curl -s http://localhost:8000/health
# {"status":"ok"}
```

With Caddy configured the UI is at `https://foodshop.yourdomain.com`. Without Caddy (or for testing), uncomment the `ports` line in `docker-compose.yml` and access it at `http://<NAS-IP>:8000`.

## Sainsbury's — First Login

The Sainsbury's session is not configured during the build. After the container starts, run the interactive login:

```bash
docker exec -it foodshop npm run groc -- login --email you@example.com
```

This prompts for your password, then sends an SMS verification code to your registered mobile number. Enter the code when prompted. The session is saved to a named Docker volume (`groc-session`) and survives container restarts.

You can verify the session at any time:

```bash
docker exec -it foodshop npm run groc -- status
```

Sainsbury's sessions last days to weeks. When the session expires, the UI shows an authentication overlay — enter your email, password, and SMS code there to renew it without touching the terminal.

## Home Assistant — Integration

Three snippets in `ha/` need to be added to your HA configuration.

**`ha/secrets.yaml` — add to your HA `secrets.yaml`:**

```yaml
shopping_api_secret: <same value as API_SECRET in .env>
```

**`ha/rest_command.yaml` — add to `configuration.yaml` under `rest_command:`:**

```yaml
rest_command:
  trigger_shopping:
    url: "http://<NAS-IP>:8000/shop"
    method: POST
    headers:
      X-API-Secret: !secret shopping_api_secret
      Content-Type: "application/json"
    timeout: 30
```

Replace `<NAS-IP>` with the LAN IP address of the NAS running Docker. The timeout is intentionally short — the endpoint returns `202 Accepted` immediately and results arrive via push notification.

**Dashboard button — create the helper, then add the automation:**

- Settings > Helpers > Add Helper > Button
- Name it `Send to Sainsbury's` — this creates `input_button.send_to_sainsburys`
- Add the entity as a Button card on your dashboard

Then add the automation from `ha/automation.yaml` to your automations:

```yaml
- alias: "Send shopping list to Sainsbury's"
  triggers:
    - trigger: state
      entity_id: input_button.send_to_sainsburys
  actions:
    - action: rest_command.trigger_shopping
```

Restart HA after editing `configuration.yaml`.

## Mealie — Meal Plan Integration (Optional)

If `MEALIE_URL` and `MEALIE_TOKEN` are set in `.env`, the UI shows a collapsible meal plan panel above the shopping list. From there you can select recipes from the coming week's plan and add their ingredients directly to the HA shopping list, with a one-click undo.

To get a Mealie API token:

- Mealie > Profile (top-right) > API Tokens > Create token

The `MEALIE_URL` should be the base URL of your Mealie container, e.g. `http://mealie.local:9000`. If left blank the meal plan panel is hidden and the Mealie API routes return 503 without error.

## Caddy Reverse Proxy

foodshop is designed to sit behind a Caddy reverse proxy that handles TLS termination at the network edge. The `docker-compose.yml` joins the `caddy-proxy` external Docker network, which is how Caddy discovers and reaches the container without needing a bound host port.

### Network setup

The `caddy-proxy` network must already exist before starting foodshop:

```bash
docker network create caddy-proxy
```

If your Caddy instance was set up with this network already, skip this — it will already exist.

With the network in place, the port binding in `docker-compose.yml` is commented out. Caddy reaches the container using `foodshop:8000` as the upstream, where `foodshop` resolves as DNS within the shared network.

### Caddyfile entry

Add the snippet from `caddy/foodshop.caddyfile` to your Caddyfile. If you're using a real domain, Caddy handles TLS automatically via Let's Encrypt:

```
foodshop.yourdomain.com {
    reverse_proxy foodshop:8000
}
```

For a local domain with a self-signed certificate issued by Caddy's internal CA:

```
foodshop.home {
    tls internal
    reverse_proxy foodshop:8000
}
```

Reload Caddy after adding the entry:

```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### HA rest_command URL

With Caddy in place, update the URL in `ha/rest_command.yaml` to use the Caddy-served address rather than the direct NAS IP and port:

```yaml
rest_command:
  trigger_shopping:
    url: "https://foodshop.yourdomain.com/shop"
    method: POST
    headers:
      X-API-Secret: !secret shopping_api_secret
      Content-Type: "application/json"
    timeout: 30
```

The `/shop` endpoint requires the `X-API-Secret` header, so it's safe to expose through Caddy. The UI and all `/api/*` routes have no authentication of their own — if the Caddy hostname is accessible outside your LAN, add a `basicauth` block to the Caddyfile entry to restrict access.

### Direct access for groc login

The first-time Sainsbury's login via `docker exec` does not go through Caddy and works regardless of the proxy configuration. Subsequent re-authentications via the UI go through Caddy like any other request.

## Verification

Once everything is configured:

1. Add two or three items to the HA shopping list via the sidebar or mobile app
2. Press the "Send to Sainsbury's" button on the dashboard
3. Open the UI (`https://foodshop.yourdomain.com` via Caddy, or `http://<NAS-IP>:8000` if accessing directly) — the items appear in the shopping list panel with live status as they're added
4. Wait for the push notification on your phone confirming which items were added and any that weren't found
5. Check the Sainsbury's basket at sainsburys.co.uk to confirm the items are there

If items aren't found, the push notification lists them separately. Adjust the wording in the HA shopping list to match how Sainsbury's labels the product (e.g. "semi-skimmed milk" rather than "milk").

> The `data/` directory is used by the Mealie import tracker to persist undo history across restarts. This is not currently volume-mounted in `docker-compose.yml` — if you want undo to survive a container restart, add `./data:/app/data` to the volumes section.
