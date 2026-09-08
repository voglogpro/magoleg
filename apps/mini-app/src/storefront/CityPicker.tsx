import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MapPin, X } from 'lucide-react';
import { popularCities, type CityChoice } from './types';

export function CityDatalist({ id = 'sf-cities' }: { id?: string }) {
  return <datalist id={id}>{popularCities.map(city => <option value={city} key={city} />)}</datalist>;
}

/** The shop ships nationwide, so the destination is asked once and then remembered. */
export function CityPicker({ city, onChoose, onClose }: {
  city: CityChoice; onChoose: (name: string) => void; onClose: () => void;
}) {
  const [value, setValue] = useState(city.name);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    input.current?.focus();
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
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKey); previousFocus?.focus(); };
  }, [onClose]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = value.trim();
    if (name.length >= 2) onChoose(name);
  };

  return <div className="sf-city-backdrop" role="presentation" onClick={onClose}>
    <div className="sf-city-dialog" role="dialog" aria-modal="true" aria-labelledby="sf-city-title" ref={dialog} onClick={event => event.stopPropagation()}>
      <button className="sf-icon-button sf-city-close" onClick={onClose} aria-label="Закрыть выбор города"><X size={20} /></button>
      <span className="sf-city-dialog__icon" aria-hidden="true"><MapPin size={24} /></span>
      <h2 id="sf-city-title">Ваш город</h2>
      <p>Подставим его в заявку — доставляем по всей России от 3 дней. Позже город можно изменить.</p>
      <div className="sf-city-options">
        {popularCities.map(name => <button key={name} type="button" onClick={() => onChoose(name)}>{name}</button>)}
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
  return <div className="sf-city-bar">
    <MapPin size={16} aria-hidden="true" />
    {city.name
      ? <p>Доставка в город <strong>{city.name}</strong></p>
      : <p>Город доставки не выбран</p>}
    <button className="sf-text-button" type="button" onClick={onOpen}>{city.name ? 'Изменить' : 'Указать город'}</button>
  </div>;
}
