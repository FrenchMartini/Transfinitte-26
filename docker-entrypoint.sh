#!/bin/bash
set -e

echo "----------------------------------------------------------"
echo "   D-ORBIT — Planetary Flight Control System    "
echo "----------------------------------------------------------"

# Check if simulation execution is requested or if simulation.json is missing
if [ "${RUN_SIMULATION}" = "true" ] || [ "${RUN_SIMULATION}" = "1" ] || [ ! -f "/app/results/simulation.json" ]; then
    echo ">> [1/2] Running full D-Orbit 9,566-year N-body simulation..."
    python backend/py/simulate.py
    echo ">> [1/2] Simulation completed successfully!"
else
    echo ">> [1/2] Using verified pre-computed simulation dataset in /app/results"
fi

# Ensure results directory exists
mkdir -p /app/results

# If a custom port is set in $PORT, update nginx configuration
if [ -n "$PORT" ] && [ "$PORT" != "80" ]; then
    sed -i "s/listen 80;/listen $PORT;/g" /etc/nginx/conf.d/default.conf
    echo ">> Configured Nginx to listen on port $PORT"
else
    echo ">> Configured Nginx to listen on port 80"
fi

# If custom command was passed to docker run (e.g. pytest, bash, python script), execute it
if [ "$#" -gt 0 ] && [ "$1" != "nginx" ]; then
    exec "$@"
fi

echo ">> [2/2] Starting D-Orbit Web Interface on port ${PORT:-80}..."
echo ">> Dashboard is available at http://localhost:${PORT:-80}/"
exec nginx -g "daemon off;"
