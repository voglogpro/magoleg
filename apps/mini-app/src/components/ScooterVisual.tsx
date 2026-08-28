import type { CSSProperties } from 'react';
import type { Product } from '../types';

type Props = {
  product: Product;
  compact?: boolean;
};

export function ScooterVisual({ product, compact = false }: Props) {
  const cargo = product.visualVariant === 'cargo';
  const mini = product.visualVariant === 'compact';

  return (
    <div
      className={`scooter-visual ${compact ? 'scooter-visual--compact' : ''}`}
      style={{ '--vehicle': product.color, '--vehicle-soft': product.colorSoft } as CSSProperties}
      aria-label={`Демонстрационный силуэт ${product.name}`}
      role="img"
    >
      <span className="visual-label">ДЕМО-ВИЗУАЛ</span>
      <svg viewBox="0 0 360 230" aria-hidden="true">
        <path className="ground" d="M35 199H325" />
        <circle className="wheel" cx={mini ? 105 : 92} cy="177" r={mini ? 31 : 38} />
        <circle className="wheel" cx={mini ? 268 : 276} cy="177" r={mini ? 31 : 38} />
        <circle className="hub" cx={mini ? 105 : 92} cy="177" r="9" />
        <circle className="hub" cx={mini ? 268 : 276} cy="177" r="9" />
        <path
          className="frame-fill"
          d={
            cargo
              ? 'M72 145 L102 95 L236 95 L279 163 L255 170 L220 123 L123 123 L105 164 Z'
              : mini
                ? 'M93 150 L130 103 L222 103 L273 160 L250 169 L209 128 L145 128 L118 169 Z'
                : 'M70 143 L111 91 L230 92 L283 160 L259 169 L216 120 L131 120 L107 168 Z'
          }
        />
        <path className="frame-line" d="M107 166 L158 99 L223 166 M158 99 L91 176 M223 166 L275 176" />
        <path className="fork" d="M232 95 L276 177 M231 95 L246 55" />
        <path className="handle" d="M226 54 H270 M249 54 L243 44" />
        <path className="seat-post" d="M153 100 L148 71" />
        <rect className="seat" x="125" y="62" width={cargo ? 81 : 57} height="15" rx="7" />
        <rect className="battery" x={cargo ? 130 : 139} y="112" width={cargo ? 84 : 64} height="42" rx="8" />
        {cargo && <path className="rack" d="M62 88 H126 V104 H55 M61 88 L71 68 H118 L127 88" />}
        <circle className="lamp" cx="255" cy="59" r="8" />
      </svg>
      <span className="visual-code">{product.id.toUpperCase()}</span>
    </div>
  );
}
