import { ArrowUpRight } from 'lucide-react';

/** Artwork is decorative; promises and destinations remain accessible, selectable HTML. */
export function ShopBenefits() {
  const benefits = [
    { id: 'delivery', title: 'Быстрая доставка', lines: ['От 3-х дней', 'по всей России'], href: '#delivery', action: 'Сроки до вашего города' },
    { id: 'warranty', title: 'Гарантия', lines: ['12 месяцев', 'на все товары'], href: '#warranty', action: 'Условия гарантии' },
    { id: 'supply', title: 'Прямые поставки', lines: ['Без посредников', 'и переплат'], href: '#supply', action: 'О наших поставках' },
  ];
  return <section className="sf-shop-benefits" aria-label="Преимущества магазина">
    {benefits.map(benefit => <a className={`sf-benefit sf-benefit--${benefit.id}`} key={benefit.id} href={benefit.href}>
      <span className="sf-benefit-art" aria-hidden="true" />
      <div className="sf-benefit-copy"><h2>{benefit.title}</h2><p>{benefit.lines.map(line => <span key={line}>{line}</span>)}</p><span className="sf-benefit-link">{benefit.action}<ArrowUpRight size={16} aria-hidden="true" /></span></div>
    </a>)}
  </section>;
}
