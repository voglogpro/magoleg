import { CloudRain, Dumbbell, Feather, Package, Sparkles, Sprout, Users, type LucideIcon } from 'lucide-react';
import { catalogHref } from './domain';
import type { SmartPick } from './types';

/** Each pick gets a drawn icon of its own: a tile names an audience, not one model in stock. */
const pickIcons: Record<string, LucideIcon> = {
  'tag-waterproof': CloudRain, 'tag-heavy-rider': Dumbbell, 'tag-two-up': Users,
  'tag-courier': Package, 'tag-women': Feather, 'tag-beginner': Sprout, 'tag-teen': Sprout,
};

/** A pick is a plain catalogue link, so the shopper can narrow it further with the usual filters. */
export function PickCards({ picks, layout }: { picks: SmartPick[]; layout: 'row' | 'grid' }) {
  return <div className={`sf-pick-rail sf-pick-rail--${layout}`}>
    <div className="sf-pick-track">{picks.map(pick => {
      const Icon = pickIcons[pick.id] ?? Sparkles;
      return <a className="sf-pick-card" href={catalogHref(pick.filters)} key={pick.id}>
        <span className="sf-pick-art" aria-hidden="true"><span><Icon size={18} strokeWidth={1.8} /></span></span>
        <strong>{pick.label}</strong>
      </a>;
    })}</div>
  </div>;
}
