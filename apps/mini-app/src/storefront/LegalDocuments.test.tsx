import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LegalDocument, legalTopics } from './LegalDocuments';
import { consentText, offerText, privacyText, seller, sellerLine } from './legal-texts';
import { defaultSettings, type ShopSettings } from './types';

afterEach(cleanup);
const withSettings = (patch: Partial<ShopSettings> = {}) => ({ ...defaultSettings, ...patch });

describe('утверждённые документы магазина', () => {
  it('публикует оферту без пометки «базовый проект» и с реквизитами ИП', () => {
    render(<LegalDocument topic="offer" settings={withSettings()} />);
    expect(screen.queryByText('Базовый проект документа')).toBeNull();
    expect(screen.getByText('4. Доставка и передача товара')).toBeInTheDocument();
    expect(screen.getByText(`ОГРНИП: ${seller.ogrnip}`)).toBeInTheDocument();
    expect(screen.getByText(/Стоимость доставки не входит в цену товара/)).toBeInTheDocument();
  });

  it('публикует политику и согласие целиком', () => {
    render(<LegalDocument topic="privacy" settings={withSettings()} />);
    expect(screen.getByText('5. Условия, способы и сроки обработки')).toBeInTheDocument();
    cleanup();
    render(<LegalDocument topic="consent" settings={withSettings()} />);
    expect(screen.getByText('7. Порядок отзыва Согласия')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(seller.email))).toBeInTheDocument();
  });

  it('оставляет обмен и возврат черновиком, пока владелец не опубликовал редакцию', () => {
    render(<LegalDocument topic="returns" settings={withSettings()} />);
    expect(screen.getByText('Базовый проект документа')).toBeInTheDocument();
    expect(legalTopics.returns.title).toBe('Обмен и возврат товара');
  });

  it('текст из CRM перекрывает встроенную редакцию целиком', () => {
    render(<LegalDocument topic="offer" settings={withSettings({ offer_document: 'Новая редакция оферты.' })} />);
    expect(screen.getByText('Новая редакция оферты.')).toBeInTheDocument();
    expect(screen.queryByText('1. Общие положения и правовая основа')).toBeNull();
  });

  it('строка подвала несёт ИНН, ОГРНИП и расчётный счёт продавца', () => {
    expect(sellerLine).toContain('231518680513');
    expect(sellerLine).toContain('326237500411962');
    expect(sellerLine).toContain('40802810700010063233');
    expect(sellerLine).toContain('АО «ТБанк»');
  });

  it('во всех редакциях нет артефактов вставки и слипшихся ссылок', () => {
    for (const text of [offerText, privacyText, consentText]) {
      const flat = JSON.stringify(text);
      expect(flat).not.toMatch(/\[\d+(,\s*\d+)*\]/);
      expect(flat).not.toMatch(/g-partner\.ru[а-яё]/i);
      expect(text.sections.length).toBeGreaterThan(4);
    }
  });
});
