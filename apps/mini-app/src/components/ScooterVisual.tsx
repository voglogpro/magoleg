import type { CSSProperties } from 'react';
import type { Product } from '../types';

export function ScooterVisual({ product, compact = false, priority = false }: { product: Product; compact?: boolean; priority?: boolean }) {
  const style = { '--vehicle': product.color, '--vehicle-soft': product.colorSoft } as CSSProperties;

  return (
    <div className={`scooter-visual scooter-visual--photo ${compact ? 'scooter-visual--compact' : ''}`} data-product={product.id} style={style}>
      <img
        src={product.image}
        alt={product.imageAlt}
        loading={priority || !compact ? 'eager' : 'lazy'}
        decoding="async"
      />
      <div className="visual-caption"><span>G-PARTNER SELECT</span><b>{product.name.toUpperCase()}</b></div>
    </div>
  );
}
