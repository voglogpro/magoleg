import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CityBar, CityPicker } from './CityPicker';

afterEach(cleanup);

describe('выбор города', () => {
  it('сохраняет город с первого нажатия и не требует второго касания', () => {
    const onChoose = vi.fn();
    render(<CityPicker city={{ name: '', asked: false }} onChoose={onChoose} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Краснодар/ }));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('Краснодар');
  });

  it('показывает срок доставки прямо на кнопке города', () => {
    render(<CityPicker city={{ name: '', asked: false }} onChoose={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Москва/ })).toHaveTextContent('3–5 дн.');
    expect(screen.getByRole('button', { name: /Новосибирск/ })).toHaveTextContent('7–11 дн.');
  });

  it('не уводит страницу вниз: прокрутка блокируется и возвращается на прежнее место', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    Object.defineProperty(window, 'scrollY', { value: 640, configurable: true });
    const view = render(<CityPicker city={{ name: '', asked: false }} onChoose={vi.fn()} onClose={vi.fn()} />);
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-640px');
    view.unmount();
    expect(document.body.style.position).toBe('');
    expect(document.body.style.top).toBe('');
    expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'instant' });
    vi.unstubAllGlobals();
  });

  it('в строке города показывает срок только для известного направления', () => {
    const { rerender } = render(<CityBar city={{ name: 'Казань', asked: true }} onOpen={vi.fn()} />);
    expect(screen.getByText('4–7 дн.')).toBeInTheDocument();
    rerender(<CityBar city={{ name: 'Новая Деревня', asked: true }} onOpen={vi.fn()} />);
    expect(screen.queryByText(/дн\./)).toBeNull();
  });
});
