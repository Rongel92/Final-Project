#!/bin/sh
set -e

echo "[entrypoint] Applying database migrations..."
node_modules/.bin/prisma migrate deploy

echo "[entrypoint] Starting Laptop Resale server on port ${PORT:-8080}..."
exec node dist/src/index.js
