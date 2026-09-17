import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CdekPvzPicker, describeOffice } from './CdekPvzPicker';

describe('CDEK pickup point picker', () => {
  it('keeps the manual field alone until the shop configures a widget key', () => {
    const { container } = render(<CdekPvzPicker apiKey="" city="Сочи" onChoose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the map when the key is configured', () => {
    render(<CdekPvzPicker apiKey="test-key" city="Сочи" onChoose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Выбрать пункт выдачи на карте' })).toBeTruthy();
  });

  it('turns an office into the code and address the order needs', () => {
    expect(describeOffice({ code: 'SCH1', address: 'ул. Тестовая, 3', city: 'Сочи' }))
      .toEqual({ code: 'SCH1', city: 'Сочи', address: 'SCH1, ул. Тестовая, 3' });
    expect(describeOffice({ code: 'MSK7', location: { city: 'Москва', address: 'ул. Первая, 1' } }))
      .toEqual({ code: 'MSK7', city: 'Москва', address: 'MSK7, ул. Первая, 1' });
  });
});
