import { useCallback, useEffect, useRef, useState } from 'react';
import { getCdekPoints, type CdekPoint } from './api';
import './cdek-picker.css';

/** Официальный виджет СДЭК: карта открывается прямо на сайте, покупатель никуда не уходит. */
const WIDGET_SRC = 'https://cdn.jsdelivr.net/npm/@cdek-it/widget@3/dist/cdek-widget.umd.js';
const CONTAINER_ID = 'sf-cdek-map';

export type PvzChoice = { code: string; address: string; city: string };

type CdekOffice = { code?: string; name?: string; address?: string; city?: string; location?: { city?: string; address?: string } };
type CdekWidget = { new(options: Record<string, unknown>): { destroy?: () => void } };

declare global {
  interface Window { CDEKWidget?: CdekWidget }
}

let widgetScript: Promise<void> | null = null;

function loadWidget(): Promise<void> {
  if (window.CDEKWidget) return Promise.resolve();
  if (widgetScript) return widgetScript;
  widgetScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = WIDGET_SRC;
    script.async = true;
    script.onload = () => (window.CDEKWidget ? resolve() : reject(new Error('widget missing')));
    script.onerror = () => { widgetScript = null; reject(new Error('widget offline')); };
    document.head.appendChild(script);
  });
  return widgetScript;
}

/** Приводит ответ виджета к паре «код — адрес», понятной складу и покупателю. */
export function describeOffice(office: CdekOffice): PvzChoice {
  const city = (office.city || office.location?.city || '').trim();
  const address = (office.address || office.location?.address || office.name || '').trim();
  const code = (office.code || '').trim();
  return { code, city, address: [code, address].filter(Boolean).join(', ') };
}

/** Поиск пунктов СДЭК на Яндекс.Картах: работает без ключей и без договора на API. */
export function cdekMapLink(city: string): string {
  return `https://yandex.ru/maps/?text=${encodeURIComponent(`СДЭК пункт выдачи ${city}`.trim())}`;
}

export function CdekPvzPicker({ apiKey, pointsEnabled = false, city, onChoose }: {
  apiKey: string; pointsEnabled?: boolean; city: string; onChoose: (choice: PvzChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const instance = useRef<{ destroy?: () => void } | null>(null);
  const choose = useRef(onChoose);
  choose.current = onChoose;

  const mount = useCallback(async () => {
    if (!apiKey) return;
    try {
      await loadWidget();
      if (!window.CDEKWidget || instance.current) return;
      instance.current = new window.CDEKWidget({
        root: CONTAINER_ID,
        apiKey,
        defaultLocation: city || 'Краснодар',
        hideDeliveryOptions: { door: true },
        popup: false,
        onChoose: (...args: unknown[]) => {
          const office = args.find(value => value && typeof value === 'object' && 'code' in (value as object)) as CdekOffice | undefined;
          if (!office) return;
          choose.current(describeOffice(office));
          setOpen(false);
        },
        onError: () => setFailed(true),
      });
    } catch {
      setFailed(true);
    }
  }, [apiKey, city]);

  useEffect(() => {
    if (!open) return;
    void mount();
    return () => { instance.current?.destroy?.(); instance.current = null; };
  }, [open, mount]);

  // Ключа виджета нет: показываем список из API СДЭК, а без ключей API — ссылку на карту.
  if (!apiKey) return pointsEnabled
    ? <CdekPvzList city={city} onChoose={onChoose} />
    : <CdekMapHint city={city} />;

  return <div className="sf-cdek-picker">
    <button type="button" className="sf-button sf-button--secondary sf-cdek-picker__toggle"
      aria-expanded={open} onClick={() => { setFailed(false); setOpen(value => !value); }}>
      {open ? 'Скрыть карту пунктов выдачи' : 'Выбрать пункт выдачи на карте'}
    </button>
    {open && !failed && <div id={CONTAINER_ID} className="sf-cdek-picker__map" role="application"
      aria-label="Карта пунктов выдачи СДЭК" />}
    {open && failed && <p className="sf-field-help" role="status">
      Карта СДЭК сейчас недоступна. Укажите код или адрес пункта выдачи в поле ниже — заказ оформится обычным способом.
    </p>}
  </div>;
}

/** Ни виджета, ни ключей API: не рисуем кнопку, которая ничего не покажет. */
function CdekMapHint({ city }: { city: string }) {
  const town = city.trim();
  return <div className="sf-cdek-picker sf-cdek-hint">
    <a className="sf-button sf-button--secondary sf-cdek-picker__toggle" href={cdekMapLink(town)}
      target="_blank" rel="noopener noreferrer">
      {town ? `Посмотреть пункты СДЭК в городе ${town}` : 'Посмотреть пункты СДЭК на карте'}
    </a>
    <p className="sf-cdek-list__note">Поле можно оставить пустым: если пункт не выбран, магазин предложит ближайший при подтверждении заказа.</p>
  </div>;
}

/** Список ПВЗ без ключа виджета: данные приходят с нашего сервера, карта не нужна. */
function CdekPvzList({ city, onChoose }: { city: string; onChoose: (choice: PvzChoice) => void }) {
  // idle — кнопка свёрнута, open — показан список, gone — СДЭК недоступен, остаётся ручное поле.
  const [state, setState] = useState<'idle' | 'loading' | 'open' | 'gone'>('idle');
  const [points, setPoints] = useState<CdekPoint[]>([]);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const base = useRef<CdekPoint[]>([]);
  const town = city.trim();

  useEffect(() => { setState('idle'); setSearch(''); setNote(''); setPoints([]); base.current = []; }, [town]);

  // Запрос уходит только по нажатию: пока покупатель не попросил список, сеть не трогаем.
  const load = useCallback(async () => {
    setState('loading');
    const answer = await getCdekPoints(town);
    if (!answer.available || !answer.points.length) { setState('gone'); return; }
    base.current = answer.points;
    setPoints(answer.points);
    setNote('');
    setState('open');
  }, [town]);

  // Поиск по улице уходит на сервер с задержкой, чтобы не слать запрос на каждую букву.
  useEffect(() => {
    if (state !== 'open') return;
    const needle = search.trim();
    if (!needle) { setPoints(base.current); setNote(''); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void getCdekPoints(town, needle, controller.signal).then(answer => {
        if (controller.signal.aborted) return;
        setPoints(answer.points);
        setNote(answer.points.length ? '' : answer.reason);
      }).catch(() => undefined);
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [state, town, search]);

  if (!town || state === 'gone') return null;

  return <div className="sf-cdek-picker sf-cdek-list">
    <button type="button" className="sf-button sf-button--secondary sf-cdek-picker__toggle"
      aria-expanded={state === 'open'} disabled={state === 'loading'}
      onClick={() => (state === 'open' ? setState('idle') : void load())}>
      {state === 'open' ? 'Скрыть пункты выдачи' : `Показать пункты выдачи в городе ${town}`}
    </button>
    {state === 'open' && <div className="sf-cdek-list__panel">
      <input className="sf-cdek-list__search" type="search" value={search} placeholder="Поиск по улице или коду"
        aria-label="Поиск пункта выдачи" onChange={event => setSearch(event.target.value)} />
      <ul className="sf-cdek-list__items">
        {points.map(point => <li key={point.code} className="sf-cdek-point">
          <p className="sf-cdek-point__address">
            <span className="sf-cdek-point__code">{point.code}</span> {point.address}
          </p>
          <p className="sf-cdek-point__meta">
            {[point.work_time, point.nearest_station || point.note].filter(Boolean).join(' · ')}
          </p>
          <button type="button" className="sf-cdek-point__pick" onClick={() => {
            onChoose({ code: point.code, city: point.city || town, address: `${point.code}, ${point.address}` });
            setSearch('');
            setState('idle');
          }}>Выбрать</button>
        </li>)}
      </ul>
      {note && <p className="sf-cdek-list__note" role="status">{note}</p>}
    </div>}
  </div>;
}
