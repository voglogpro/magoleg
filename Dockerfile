FROM node:20-bookworm-slim AS frontend

WORKDIR /build

COPY apps/mini-app/package.json apps/mini-app/package-lock.json ./
RUN npm install --ignore-scripts --no-audit --no-fund

COPY apps/mini-app/ ./
RUN npm run build

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STATIC_DIR=/opt/magoleg/public

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py index.py ./
COPY --from=frontend /build/dist /opt/magoleg/public

EXPOSE 8000

CMD ["python", "main.py"]
