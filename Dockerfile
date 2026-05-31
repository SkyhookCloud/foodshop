# Single stage — no build step needed (CD UI ships as plain JSX + CDN React)
FROM node:20-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git xvfb xauth \
    && rm -rf /var/lib/apt/lists/*

# Install uk-grocery-cli and Playwright browser
WORKDIR /opt/uk-grocery-cli
RUN git clone --depth 1 https://github.com/abracadabra50/uk-grocery-cli . \
    && npm install \
    && npx playwright install --with-deps chromium

# Install Python app
WORKDIR /app
COPY src/requirements.txt .
RUN python3 -m venv /venv \
    && /venv/bin/pip install --no-cache-dir -r requirements.txt

COPY src/ .

RUN useradd -m appuser \
    && mkdir -p /home/appuser/.sainsburys \
    && chown -R appuser /app /opt/uk-grocery-cli /venv /home/appuser/.sainsburys

USER appuser

EXPOSE 8000
CMD xvfb-run -a /venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 || /venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
