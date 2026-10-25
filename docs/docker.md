# OrbitShift Docker Deployment Guide

This guide describes how to run and deploy the **OrbitShift (`octo`)** multi-physics simulation and 3D web mission control using Docker and Docker Compose.

---

## 1. Quick Start

### Option A: Using Docker Compose (Recommended)

1. **Start the Web Interface immediately (using pre-computed verified simulation data):**
   ```bash
   docker compose up -d
   ```
   Open your browser to:
   ```text
   http://localhost:8080/
   ```

2. **Run the 9,566-Year Simulation on startup and serve fresh results:**
   ```bash
   RUN_SIMULATION=true docker compose up -d
   ```
   This executes the complete secular spiral + ballistic coast trajectory simulation (`py/simulate.py`), writes the updated dataset to `./results`, and boots the Nginx web server.

3. **Stop the container:**
   ```bash
   docker compose down
   ```

---

### Option B: Using Standalone Docker CLI

1. **Build the production image:**
   ```bash
   docker build -t orbitshift:latest .
   ```

2. **Run the Web Server (instant launch):**
   ```bash
   docker run -d \
     --name orbitshift \
     -p 8080:80 \
     -v $(pwd)/results:/app/results \
     orbitshift:latest
   ```

3. **Run the Simulation once and start the web:**
   ```bash
   docker run -d \
     --name orbitshift \
     -p 8080:80 \
     -e RUN_SIMULATION=true \
     -v $(pwd)/results:/app/results \
     orbitshift:latest
   ```
   You can inspect logs in real time while the simulation runs:
   ```bash
   docker logs -f orbitshift
   ```

4. **Run the Simulation standalone without starting the web server:**
   ```bash
   docker run --rm \
     -v $(pwd)/results:/app/results \
     orbitshift:latest \
     python py/simulate.py
   ```

5. **Run the Python test suite in Docker:**
   ```bash
   docker run --rm orbitshift:latest pytest
   ```

---

## 2. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `RUN_SIMULATION` | `false` | When set to `true` or `1`, executes `py/simulate.py` on container boot before starting the web server. |
| `PORT` | `80` | Internal port for Nginx web server inside the container. |

---

## 3. Architecture Overview

The container uses a high-performance **multi-stage build**:
- **Stage 1 (Frontend Builder):** Uses `node:22-alpine` with `pnpm` to compile the React 19 + Three.js + React Three Fiber 3D dashboard into an optimized static bundle in `/var/www/html`.
- **Stage 2 (Runtime Environment):** Uses `python:3.11-slim-bookworm` with `nginx`. It packages the Python 3.11 core, C-compiled REBOUND IAS15 integrators, and PyArrow telemetry pipelines alongside Nginx.
- **Dynamic Results Endpoint:** Nginx serves `/results/` directly mapped to `/app/results/`, ensuring that whenever `simulate.py` executes, fresh trajectory data is instantly available to the frontend without rebuilding the container.
