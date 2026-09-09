import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { MapPin, Truck, X } from 'lucide-react';
import { deliveryCities, findDeliveryZone, zoneTerm } from './delivery-zones';
import { popularCities, type CityChoice } from './types';

/** Подсказки берутся из базы доставки: подставленный город сразу получает срок. */
export function CityDatalist({ id = 'sf-cities' }: { id?: string }) {
  return <datalist id={id}>{deliveryCities.map(city => <option value={city} key={city} />)}</datalist>;
}

/**
 * Город спрашивается один раз и запоминается. Одно нажатие по названию сразу сохраняет выбор:
 * поле ввода не получает фокус на сенсорном экране, иначе клавиатура поднимает лист из-под
 * пальца и первое касание уходит впустую. Прокрутка страницы фиксируется и возвращается на
 * прежнее место, поэтому после выбора покупатель остаётся там, где читал.
 */
export function CityPicker({ city, onChoose, onClose }: {
  city: CityChoice; onChoose: (name: string) => void; onClose: () => void;
}) {
  const [value, setValue] = useState(city.name);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = document.body;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previous = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width };
    const offset = window.scrollY;
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${offset}px`;
    body.style.width = '100%';
    const precise = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
    (precise ? input.current : dialog.current)?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button, input') ?? [])];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      body.style.overflow = previous.overflow; body.style.position = previous.position;
      body.style.top = previous.top; body.style.width = previous.width;
      window.scrollTo({ top: offset, behavior: 'instant' });
      window.removeEventListener('keydown', onKey);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [onClose]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = value.trim();
    if (name.length >= 2) onChoose(name);
  };

  return <div className="sf-city-backdrop" role="presentation" onClick={onClose}>
    <div className="sf-city-dialog" role="dialog" aria-modal="true" aria-labelledby="sf-city-title" tabIndex={-1} ref={dialog} onClick={event => event.stopPropagation()}>
      <button className="sf-icon-button sf-city-close" onClick={onClose} aria-label="Закрыть выбор города"><X size={20} /></button>
      <span className="sf-city-dialog__icon" aria-hidden="true"><MapPin size={24} /></span>
      <h2 id="sf-city-title">Ваш город</h2>
      <p>Нажмите город — сразу покажем срок доставки и подставим его в заявку. Позже город можно изменить.</p>
      <div className="sf-city-options">
        {popularCities.map((name, index) => {
          const zone = findDeliveryZone(name);
          return <button key={name} type="button" style={{ '--sf-step': index } as CSSProperties} onClick={() => onChoose(name)}>
            <span>{name}</span>{zone && <em>{zoneTerm(zone)}</em>}
          </button>;
        })}
      </div>
      <form className="sf-city-form" onSubmit={submit}>
        <label>
          <span className="sf-sr-only">Другой город</span>
          <input ref={input} name="city" list="sf-cities" placeholder="Другой город" maxLength={80} value={value} onChange={event => setValue(event.target.value)} />
        </label>
        <button className="sf-button" type="submit" disabled={value.trim().length < 2}>Сохранить</button>
      </form>
      <CityDatalist />
      <button className="sf-text-button sf-city-skip" type="button" onClick={onClose}>Выбрать позже</button>
    </div>
  </div>;
}

export function CityBar({ city, onOpen }: { city: CityChoice; onOpen: () => void }) {
  const zone = city.name ? findDeliveryZone(city.name) : null;
  return <div className="sf-city-bar">
    <MapPin size={16} aria-hidden="true" />
    {city.name
      ? <p>Доставка в город <strong>{city.name}</strong></p>
      : <p>Город доставки не выбран</p>}
    {zone && <p className="sf-city-bar__term"><Truck size={14} aria-hidden="true" />{zoneTerm(zone)}</p>}
    <button className="sf-text-button" type="button" onClick={onOpen}>{city.name ? 'Изменить' : 'Указать город'}</button>
  </div>;
}
