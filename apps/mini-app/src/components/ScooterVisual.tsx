import type { CSSProperties } from 'react';
import type { Product } from '../types';

export function ScooterVisual({ product, compact = false }: { product: Product; compact?: boolean }) {
  const cargo = product.visualVariant === 'cargo';
  const mini = product.visualVariant === 'compact';
  const style = { '--vehicle': product.color } as CSSProperties;

  return (
    <div className={`scooter-visual ${compact ? 'scooter-visual--compact' : ''}`} style={style} aria-label={`Изображение ${product.name} будет добавлено`}>
      <svg viewBox="0 0 420 250" role="img" aria-hidden="true">
        <g className="vehicle-shadow"><ellipse cx="218" cy="218" rx={mini ? 132 : 156} ry="8" /></g>
        <g className="wheels">
          <circle cx={mini ? 115 : 92} cy="190" r={mini ? 35 : 42} />
          <circle cx={mini ? 307 : 325} cy="190" r={mini ? 35 : 42} />
          <circle cx={mini ? 115 : 92} cy="190" r={mini ? 23 : 28} />
          <circle cx={mini ? 307 : 325} cy="190" r={mini ? 23 : 28} />
        </g>
        <path className="frame" d={mini ? 'M116 180 L177 124 L269 127 L307 181 L178 181 Z' : 'M93 180 L166 117 L279 119 L325 181 L176 181 Z'} />
        <path className="body" d={mini ? 'M145 160 Q158 116 196 111 H269 L293 169 H166 Q145 169 145 160Z' : 'M125 157 Q141 110 188 101 H282 L309 169 H151 Q125 169 125 157Z'} />
        <path className="floor" d={mini ? 'M152 167 H280 L269 180 H143Z' : 'M130 167 H300 L288 181 H120Z'} />
        <path className="fork" d={mini ? 'M275 125 L307 190' : 'M289 116 L325 190'} />
        <path className="stem" d={mini ? 'M274 126 L259 52' : 'M289 117 L274 39'} />
        <path className="handle" d={mini ? 'M245 51 H286' : 'M255 38 H301'} />
        <path className="seat-post" d="M184 107 L174 72" />
        <path className="seat" d="M155 70 Q176 61 204 70" />
        {cargo && <g className="cargo-rack"><path d="M111 111 H46 V149 H131" /><rect x="42" y="82" width="88" height="66" rx="3" /></g>}
        <rect className="battery" x={mini ? 203 : 210} y={mini ? 126 : 117} width={mini ? 42 : 50} height="35" rx="4" />
        <circle className="lamp" cx={mini ? 265 : 280} cy={mini ? 68 : 55} r="6" />
      </svg>
      <div className="visual-caption"><span>IMAGE PENDING</span><b>{product.name.toUpperCase()}</b></div>
    </div>
  );
}
