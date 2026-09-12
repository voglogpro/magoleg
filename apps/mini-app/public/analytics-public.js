/* Read-only catalogue/guide pages honour the same explicit choice as the storefront. */
(() => {
  try { if (localStorage.getItem('gpartner.analytics-consent.v1') !== 'yes') return; } catch { return; }
  const counter = 112522333;
  window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
  window.ym.l = window.ym.l || Date.now();
  const script = document.createElement('script');
  script.async = true; script.src = 'https://mc.yandex.ru/metrika/tag.js?id=' + counter;
  document.head.appendChild(script);
  const url = location.origin + location.pathname;
  window.ym(counter, 'init', { defer: true, ssr: true, webvisor: true, clickmap: true, trackLinks: true, accurateTrackBounce: true, url, referrer: document.referrer ? new URL(document.referrer).origin : '' });
  window.ym(counter, 'hit', url, { title: document.title });
  window.addEventListener('storage', event => { if (event.key === 'gpartner.analytics-consent.v1' && event.newValue !== 'yes') window.ym(counter, 'destruct'); });
})();
