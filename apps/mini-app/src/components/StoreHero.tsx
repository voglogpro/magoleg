import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { gsap } from 'gsap';
import './store-hero.css';

/** HyperFrames motion rules adapted to an interactive React surface.
 * The seekable, finite timeline only owns a decorative light. Never hide LCP content.
 */
export function createHeroTimeline(light: HTMLElement) {
  const timeline = gsap.timeline({ paused: true });
  timeline.fromTo(light, { xPercent: -120, opacity: 0 },
    { xPercent: 420, opacity: 0.22, duration: 1.8, ease: 'power2.inOut' }, 0);
  timeline.to(light, { opacity: 0, duration: 0.35, ease: 'power1.out' }, 1.45);
  return timeline;
}

export function StoreHero({ onCatalog }: { onCatalog: () => void }) {
  const light = useRef<HTMLDivElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!light.current) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const timeline = createHeroTimeline(light.current!);
      // Website playback adapter. In a HyperFrames composition the same timeline is seek-driven.
      timeline.play(0);
      const button = action.current;
      const reaction = button ? gsap.timeline({ paused: true })
        .fromTo(button, { scale: 1 }, { scale: 0.97, duration: 0.1, ease: 'none' })
        .to(button, { scale: 1, duration: 0.4, ease: 'back.out(1.4)' }) : null;
      const press = () => reaction?.restart();
      button?.addEventListener('pointerdown', press);
      return () => { button?.removeEventListener('pointerdown', press); timeline.kill(); reaction?.kill(); };
    });
    return () => media.revert();
  }, []);

  return <section className="sf-hero" aria-labelledby="sf-hero-title">
    <img className="sf-hero-photo" src="/products/mobile-hero-v1.jpg" width="1448" height="1086" alt="Электросамокат с оранжевой подсветкой. Иллюстрация магазина." fetchPriority="high" draggable={false} />
    <div className="sf-hero-shade" aria-hidden="true" />
    <div className="sf-hero-light-track" aria-hidden="true"><div ref={light} className="sf-hero-light" /></div>
    <div className="sf-hero-copy">
      <p className="sf-hero-location">Доставка по всей России</p>
      <h1 id="sf-hero-title">Магазин <span>электротранспорта</span></h1>
      <p className="sf-hero-description">Самокаты, скутеры и велосипеды<br />для города и работы.</p>
      <div className="sf-hero-actions"><button ref={action} className="sf-hero-cta" onClick={onCatalog}>Смотреть каталог <ArrowRight size={18} aria-hidden="true" /></button></div>
    </div>
  </section>;
}
