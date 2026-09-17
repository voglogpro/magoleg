import { useCallback, useEffect, useRef, useState } from 'react';

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

export function CdekPvzPicker({ apiKey, city, onChoose }: { apiKey: string; city: string; onChoose: (choice: PvzChoice) => void }) {
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

  // Ключ не задан — остаётся ручной ввод кода ПВЗ в поле ниже, заказ оформляется как прежде.
  if (!apiKey) return null;

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
