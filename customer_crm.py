"""Customer-owned cart/preferences and owner-only CRM. No third-party PII export."""
import asyncio
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone

from aiohttp import ClientError, ClientSession, ClientTimeout, web
from store_api import STORE_KEY, now_iso, read_json, require, text_value

COUNTER = 112522333
CONSENT_VERSION = "email-offers-2026-09-12"


async def start(app):
    with app[STORE_KEY].connect() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS customer_preferences (
                customer_id TEXT PRIMARY KEY, email TEXT NOT NULL DEFAULT '',
                marketing INTEGER NOT NULL DEFAULT 0, consent_at TEXT NOT NULL DEFAULT '',
                consent_version TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS customer_carts (
                customer_id TEXT PRIMARY KEY, items TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS customer_consent_log (
                id INTEGER PRIMARY KEY, customer_id TEXT NOT NULL, email TEXT NOT NULL,
                accepted INTEGER NOT NULL, version TEXT NOT NULL, created_at TEXT NOT NULL);
        """)


def preferences(db, customer):
    row = db.execute("SELECT email,marketing,consent_at,consent_version FROM customer_preferences WHERE customer_id=?", (customer['id'],)).fetchone()
    if row:
        return {**dict(row), 'marketing': bool(row['marketing'])}
    contact = customer['contact']
    return {'email': contact if valid_email(contact) else '', 'marketing': False, 'consent_at': '', 'consent_version': ''}


def valid_email(value):
    return bool(re.fullmatch(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}", value)) and len(value) <= 254


async def account_preferences(request):
    store = request.app[STORE_KEY]
    customer = store.account(request)
    if request.method == 'POST':
        store.rate_limit(request, 'customer-preferences', 30, 600, identity=customer['id'])
        data = await read_json(request)
        require(set(data) == {'email', 'marketing'}, 'Нужны email и настройка рассылки.')
        email = text_value(data['email'], 'Email', 254).strip().lower()
        require(not email or valid_email(email), 'Укажите корректный email.')
        require(isinstance(data['marketing'], bool), 'Некорректная настройка рассылки.')
        require(not data['marketing'] or bool(email), 'Для подписки нужен email.')
        with store.connect() as db:
            previous = preferences(db, customer)
            stamp = now_iso()
            changed = email != previous['email'] or data['marketing'] != previous['marketing']
            consent_at = stamp if changed else previous['consent_at']
            db.execute('INSERT OR REPLACE INTO customer_preferences VALUES(?,?,?,?,?,?)',
                       (customer['id'], email, int(data['marketing']), consent_at, CONSENT_VERSION, stamp))
            if changed:
                db.execute('INSERT INTO customer_consent_log(customer_id,email,accepted,version,created_at) VALUES(?,?,?,?,?)',
                           (customer['id'], email, int(data['marketing']), CONSENT_VERSION, stamp))
    with store.connect() as db:
        return web.json_response(preferences(db, customer))


async def account_cart(request):
    store = request.app[STORE_KEY]
    customer = store.account(request)
    if request.method == 'POST':
        store.rate_limit(request, 'customer-cart', 240, 600, identity=customer['id'])
        data = await read_json(request)
        require(set(data) == {'items'} and isinstance(data['items'], list) and len(data['items']) <= 50, 'В корзине не более 50 моделей.')
        items, seen = [], set()
        for item in data['items']:
            require(isinstance(item, dict) and set(item) == {'product_id', 'quantity'}, 'Некорректная позиция корзины.')
            product_id, quantity = item['product_id'], item['quantity']
            require(isinstance(product_id, str) and bool(re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', product_id)), 'Некорректный товар.')
            require(type(quantity) is int and 1 <= quantity <= 20 and product_id not in seen, 'Количество от 1 до 20, без повторов.')
            seen.add(product_id)
            items.append({'product_id': product_id, 'quantity': quantity})
        with store.connect() as db:
            # Missing/unpublished products are not accepted as newly supplied catalogue data.
            for item in items:
                require(db.execute('SELECT 1 FROM products WHERE id=? AND published=1', (item['product_id'],)).fetchone() is not None, 'Товар больше не доступен. Обновите каталог.', 409)
            db.execute('INSERT OR REPLACE INTO customer_carts VALUES(?,?,?)', (customer['id'], json.dumps(items), now_iso()))
    with store.connect() as db:
        row = db.execute('SELECT items,updated_at FROM customer_carts WHERE customer_id=?', (customer['id'],)).fetchone()
        return web.json_response({'items': json.loads(row['items']) if row else [], 'saved': row is not None, 'updated_at': row['updated_at'] if row else ''})


async def customers(request):
    store = request.app[STORE_KEY]
    q = request.query.get('q', '').strip()[:100]
    page = request.query.get('page', '1')
    require(page.isdigit() and 1 <= int(page) <= 100000, 'Некорректная страница.')
    params = []
    where = ''
    if q:
        where = ' WHERE instr(casefold(c.name || " " || c.contact || " " || c.city || " " || coalesce(p.email,"")), casefold(?)) > 0'
        params.append(q)
    joins = ' FROM customers c LEFT JOIN customer_preferences p ON p.customer_id=c.id LEFT JOIN customer_carts b ON b.customer_id=c.id'
    with store.connect() as db:
        db.create_function('casefold', 1, lambda value: str(value).casefold())
        total = db.execute('SELECT count(*)' + joins + where, params).fetchone()[0]
        rows = db.execute('SELECT c.id,c.name,c.contact,c.city,c.created_at,b.items,b.updated_at AS cart_updated_at' + joins + where + ' ORDER BY c.created_at DESC,c.id LIMIT 25 OFFSET ?', (*params, (int(page)-1)*25)).fetchall()
        output = []
        for row in rows:
            cart = []
            for item in json.loads(row['items'] or '[]'):
                product = db.execute('SELECT data,published FROM products WHERE id=?', (item['product_id'],)).fetchone()
                data = json.loads(product['data']) if product else {}
                cart.append({**item, 'name': data.get('name', 'Товар удалён'), 'price': data.get('price'), 'image_url': data.get('image_url', ''), 'available': bool(product and product['published'])})
            count = db.execute('SELECT count(*) FROM inquiries WHERE customer_id=?', (row['id'],)).fetchone()[0]
            output.append({key: row[key] for key in ('id', 'name', 'contact', 'city', 'created_at', 'cart_updated_at')} | preferences(db, row) | {'cart': cart, 'inquiry_count': count})
    return web.json_response({'customers': output, 'total': total, 'page': int(page), 'pages': (total+24)//25})


async def analytics(request):
    store = request.app[STORE_KEY]
    days = request.query.get('days', '7')
    require(days in ('7', '30', '90'), 'Выберите 7, 30 или 90 дней.')
    with store.connect() as db:
        local = {'customers': db.execute('SELECT count(*) FROM customers').fetchone()[0],
                 'carts': db.execute("SELECT count(*) FROM customer_carts WHERE items != '[]'").fetchone()[0],
                 'subscribers': db.execute('SELECT count(*) FROM customer_preferences WHERE marketing=1').fetchone()[0]}
    token = os.getenv('YANDEX_METRIKA_TOKEN', '').strip()
    common = {'counter': COUNTER, 'days': int(days), 'local': local}
    if not token:
        return web.json_response({**common, 'connected': False, 'message': 'Счётчик подключён к витрине. Для отчётов в CRM задайте YANDEX_METRIKA_TOKEN на сервере BotHost с правом чтения счётчика 112522333.'})
    cached = getattr(store, '_metrika_cache', {}).get(days)
    if cached and time.monotonic() - cached[0] < 300:
        return web.json_response({**common, **cached[1]})
    store.rate_limit(request, 'metrika-reports', 20, 600)
    date2 = datetime.now(timezone.utc).date()
    params = {'ids': str(COUNTER), 'date1': str(date2-timedelta(days=int(days)-1)), 'date2': str(date2), 'limit': '10'}
    try:
        async with ClientSession(timeout=ClientTimeout(total=15), headers={'Authorization': f'OAuth {token}'}) as session:
            async def report(metrics, dimensions=None):
                query = {**params, 'metrics': metrics}
                if dimensions:
                    query.update(dimensions=dimensions, sort='-' + metrics.split(',')[0])
                async with session.get('https://api-metrika.yandex.net/stat/v1/data', params=query, allow_redirects=False) as response:
                    if response.status != 200:
                        raise ValueError('report unavailable')
                    data = await response.json()
                    return {'totals': data.get('totals', []), 'data': data.get('data', []), 'sampled': data.get('sampled', False)}
            totals, sources, pages = await asyncio.gather(report('ym:s:visits,ym:s:users,ym:s:pageviews,ym:s:bounceRate'), report('ym:s:visits', 'ym:s:trafficSource'), report('ym:pv:pageviews', 'ym:pv:URL'))
        result = {'connected': True, 'totals': totals, 'sources': sources, 'pages': pages, 'updated_at': now_iso()}
        store._metrika_cache = {**getattr(store, '_metrika_cache', {}), days: (time.monotonic(), result)}
        return web.json_response({**common, **result})
    except (ClientError, asyncio.TimeoutError, ValueError, KeyError, TypeError):
        # Never echo upstream response bodies, URLs containing secrets, or the OAuth token.
        return web.json_response({**common, 'connected': False, 'message': 'Не удалось получить отчёт Яндекса. Проверьте токен и доступ к счётчику; повторите позже.'})


def setup(app):
    app.on_startup.append(start)
    app.router.add_get('/api/account/preferences', account_preferences)
    app.router.add_post('/api/account/preferences', account_preferences)
    app.router.add_get('/api/account/cart', account_cart)
    app.router.add_post('/api/account/cart', account_cart)
    app.router.add_get('/api/admin/customers', customers)
    app.router.add_get('/api/admin/analytics', analytics)
