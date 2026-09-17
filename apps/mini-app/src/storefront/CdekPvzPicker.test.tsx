import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CdekPvzPicker, describeOffice } from './CdekPvzPicker';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Подменяет серверный прокси СДЭК: компонент не должен ходить в сеть из теста. */
function stubPoints(answer: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(answer), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const office = { code: 'SCH1', name: 'Сочи-1', address: 'ул. Тестовая, 3', city: 'Сочи', work_time: 'Пн-Пт 10:00-19:00' };

describe('CDEK pickup point picker', () => {
  it('keeps the manual field alone when CDEK is not configured', async () => {
    const fetchMock = stubPoints({ points: [], available: false, reason: 'Список пунктов выдачи пока не подключён.' });
    const { container } = render(<CdekPvzPicker apiKey="" city="Сочи" onChoose={vi.fn()} />);
    // Пока покупатель не нажал кнопку, запросов нет: форма заказа не ходит в сеть сама.
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Показать пункты выдачи в городе Сочи' }));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('offers the map when the key is configured', () => {
    render(<CdekPvzPicker apiKey="test-key" city="Сочи" onChoose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Выбрать пункт выдачи на карте' })).toBeTruthy();
  });

  it('lists the pickup points from the server proxy and reports the choice', async () => {
    stubPoints({ points: [office], available: true, reason: '' });
    const onChoose = vi.fn();
    render(<CdekPvzPicker apiKey="" city="Сочи" onChoose={onChoose} />);
    const toggle = await screen.findByRole('button', { name: 'Показать пункты выдачи в городе Сочи' });
    fireEvent.click(toggle);
    expect(await screen.findByText(/ул\. Тестовая, 3/)).toBeTruthy();
    expect(screen.getByText(/Пн-Пт 10:00-19:00/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать' }));
    expect(onChoose).toHaveBeenCalledWith({ code: 'SCH1', city: 'Сочи', address: 'SCH1, ул. Тестовая, 3' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Выбрать' })).toBeNull());
  });

  it('turns an office into the code and address the order needs', () => {
    expect(describeOffice({ code: 'SCH1', address: 'ул. Тестовая, 3', city: 'Сочи' }))
      .toEqual({ code: 'SCH1', city: 'Сочи', address: 'SCH1, ул. Тестовая, 3' });
    expect(describeOffice({ code: 'MSK7', location: { city: 'Москва', address: 'ул. Первая, 1' } }))
      .toEqual({ code: 'MSK7', city: 'Москва', address: 'MSK7, ул. Первая, 1' });
  });
});
