# ==============================================================================
# OrbitShift (octo) — Multi-Stage Production Dockerfile
# Stage 1: Build the React + Three.js frontend bundle
# Stage 2: Python 3.11 Simulation environment + Nginx web server
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Frontend Build
# ------------------------------------------------------------------------------
FROM node:22-alpine AS web-builder

WORKDIR /app

# Enable Corepack and prepare pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy reports and results required by frontend build and type definitions
COPY reports/ ./reports/
COPY results/ ./results/

WORKDIR /app/web

# Cache package dependencies
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy web source files and configurations
COPY web/ ./

# Build production static bundle
RUN pnpm run build

# ------------------------------------------------------------------------------
# Stage 2: Runtime Environment (Python 3.11 + Nginx)
# ------------------------------------------------------------------------------
FROM python:3.11-slim-bookworm AS runtime

LABEL maintainer="Black Ant Robotics / TRANSFINITTE 2026 Team"
LABEL description="OrbitShift (octo) Multi-Physics Simulation Core & 3D Mission Control"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=80 \
    RUN_SIMULATION=false

# Install Nginx, C compiler (required for rebound build), and utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    build-essential \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy python project specification and install dependencies
COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip setuptools && \
    pip install --no-cache-dir -e .

# Copy Python simulation core, configuration, and tools
COPY octo/ ./octo/
COPY config/ ./config/
COPY py/ ./py/
COPY tools/ ./tools/
COPY results/ ./results/
COPY reports/ ./reports/

# Copy compiled frontend from Stage 1 into Nginx web root
COPY --from=web-builder /app/web/dist /var/www/html

# Configure Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default

# Entrypoint script
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port (default 80)
EXPOSE 80

# Healthcheck to verify web server is responsive
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-80}/healthz || exit 1

ENTRYPOINT ["/entrypoint.sh"]
