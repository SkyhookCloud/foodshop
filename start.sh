#!/bin/sh
if xvfb-run -a echo ok >/dev/null 2>&1; then
    exec xvfb-run -a /venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
else
    echo "xvfb-run unavailable, starting without display" >&2
    exec /venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
fi
