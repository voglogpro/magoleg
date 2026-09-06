FROM node:24-bookworm-slim AS frontend

WORKDIR /build

COPY apps/mini-app/package.json apps/mini-app/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY apps/mini-app/ ./
RUN npm run build

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STATIC_DIR=/opt/magoleg/public \
    DATA_DIR=/app/data \
    COOKIE_SECURE=true

WORKDIR /opt/magoleg/runtime

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py index.py store_api.py ./
COPY scripts/ ./scripts/
COPY --from=frontend /build/dist /opt/magoleg/public

RUN useradd --system --uid 10001 --create-home gpartner && mkdir -p /app/data && chown gpartner:gpartner /app/data

EXPOSE 8000

CMD ["python", "/opt/magoleg/runtime/scripts/container_start.py"]
