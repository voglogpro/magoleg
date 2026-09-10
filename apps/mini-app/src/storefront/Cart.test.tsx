import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Cart } from './Cart';
import { defaultSettings, type Product } from './types';

afterEach(cleanup);
const product: Product = { id: 'model', name: 'Модель', description: '', category: 'kick-scooter', license: 'unknown', license_verified: false, price: 32900, stock_status: 'in-stock', range_km: 25, speed_kmh: null, power_w: 350, weight_kg: null, cargo_l: null, payload_kg: null, drive: 'unknown', image_url: '', images: [], featured: false, published: true, tags: [], badge: '', updated_at: '' };
const props = { items: [{ product_id: 'model', quantity: 1 }], products: [product], settings: defaultSettings, city: 'Москва', onCity: vi.fn(), onRetry: vi.fn(), onQuantity: vi.fn(), onRemove: vi.fn(), children: <div>Форма заявки</div> };

describe('корзина по референсу использует реальные условия магазина', () => {
  it('ведёт к контактам при закрытом приёме заявок и называет оплату по СБП', () => {
    render(<Cart {...props} />);
    expect(screen.getByRole('link', { name: 'Связаться с магазином' })).toHaveAttribute('href', '#contact');
    expect(screen.queryByText('Бесплатно')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Кредит и рассрочка' })).toBeNull();
    // Оферта включает доставку в цену товара, поэтому отдельной суммы за неё нет.
    expect(screen.getByText('Включена в цену товара')).toBeInTheDocument();
    expect(screen.getByText('СБП после подтверждения')).toBeInTheDocument();
    expect(screen.getByText(/Доставка СДЭК до пункта выдачи уже включена/)).toBeInTheDocument();
  });
  it('показывает рассрочку и срок доставки только из настроек', () => {
    render(<Cart {...props} settings={{ ...defaultSettings, payment_installment: 'on', delivery_schedule: 'Москва;4;6;от 900 ₽' }} />);
    expect(screen.getByRole('link', { name: 'Кредит и рассрочка' })).toHaveAttribute('href', '#payment');
    // Строка магазина задаёт срок, но не стоимость: её покупателю уже включили в цену.
    expect(screen.getByText('Ориентировочно: 4–6 дн.')).toBeInTheDocument();
    expect(screen.queryByText('от 900 ₽')).toBeNull();
  });
  it('блокирует оформление исчезнувшей модели, сохраняя возможность удалить её', () => {
    const remove = vi.fn();
    render(<Cart {...props} products={[]} settings={{ ...defaultSettings, inquiries_enabled: true }} onRemove={remove} />);
    expect(screen.getByRole('button', { name: 'Перейти к оформлению' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Удалить недоступный товар' }));
    expect(remove).toHaveBeenCalledWith('model');
    expect(screen.getByText(/Это не полная сумма заявки/)).toBeInTheDocument();
  });
  it('передаёт выбор города и ограничивает количество двадцатью', () => {
    const city = vi.fn();
    render(<Cart {...props} onCity={city} items={[{ product_id: 'model', quantity: 20 }]} />);
    expect(screen.getByRole('button', { name: 'Увеличить количество Модель' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Москва.*Адрес/ }));
    expect(city).toHaveBeenCalledOnce();
  });
});
