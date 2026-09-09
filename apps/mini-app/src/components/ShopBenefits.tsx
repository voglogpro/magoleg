import { ShieldCheck, Truck, PackageCheck } from 'lucide-react';

/** Compact benefits below the hero; the whole cell remains an accessible link. */
export function ShopBenefits() {
  const benefits = [
    { id: 'delivery', title: 'Быстрая доставка', lines: ['От 3-х дней', 'по всей России'], href: '#delivery' },
    { id: 'warranty', title: 'Гарантия', lines: ['12 месяцев', 'на все товары'], href: '#warranty' },
    { id: 'supply', title: 'Прямые поставки', lines: ['Без посредников', 'и переплат'], href: '#supply' },
  ];
  return <section className="sf-shop-benefits" aria-label="Преимущества магазина">
    {benefits.map(benefit => <a className={`sf-benefit sf-benefit--${benefit.id}`} key={benefit.id} href={benefit.href}>
      <span className="sf-benefit-icon" aria-hidden="true">{benefit.id === 'delivery' ? <Truck size={20} strokeWidth={1.5} /> : benefit.id === 'warranty' ? <ShieldCheck size={20} strokeWidth={1.5} /> : <PackageCheck size={20} strokeWidth={1.5} />}</span>
      <div className="sf-benefit-copy"><h2>{benefit.title}</h2><p>{benefit.lines.join(' ')}</p></div>
    </a>)}
  </section>;
}
