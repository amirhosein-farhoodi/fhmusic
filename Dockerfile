# Backend only (the music engine + WebSocket server). The web app is deployed separately (Netlify).
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1 HOST=0.0.0.0

# Dependencies first, so code changes don't reinstall numpy/scipy.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-install-project

COPY src ./src
RUN uv sync --locked --no-dev

# Railway injects PORT; server.py reads it.
CMD ["uv", "run", "--no-sync", "fhmusic"]
