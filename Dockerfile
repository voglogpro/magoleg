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

# Корневые сертификаты, которых нет в системе (например, корень Минцифры для Т-Банка).
COPY certs/ ./certs/
RUN set -eu; \
    for file in ./certs/*.pem ./certs/*.crt; do \
        [ -e "$file" ] || continue; \
        name=$(basename "$file"); \
        cp "$file" "/usr/local/share/ca-certificates/${name%.pem}.crt"; \
    done; \
    if command -v update-ca-certificates >/dev/null 2>&1; then update-ca-certificates || true; fi

COPY main.py index.py seo_pages.py store_api.py customer_crm.py docs/catalog-kugoo-current.json docs/catalog-kugoo-bikes-2026.json ./
COPY scripts/ ./scripts/
COPY --from=frontend /build/dist /opt/magoleg/public

RUN useradd --system --uid 10001 --create-home gpartner && mkdir -p /app/data && chown gpartner:gpartner /app/data

EXPOSE 8000

CMD ["python", "/opt/magoleg/runtime/scripts/container_start.py"]
