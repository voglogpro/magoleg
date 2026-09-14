import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Analytics, COUNTER, trackGoal } from './Analytics';

afterEach(() => { cleanup(); localStorage.clear(); delete window.ym; delete window.dataLayer; });
it('waits for permission, masks forms, disables replay in the account, and allows withdrawal', () => {
  localStorage.clear(); const ym = vi.fn<(...args: unknown[]) => void>(); window.ym = ym;
  const view = render(<><form><input aria-label="Private email" defaultValue="secret@example.com" /></form><Analytics path="home" /></>);
  expect(window.ym).not.toHaveBeenCalled();
  expect(document.querySelector('script[data-gpartner-metrika]')).toBeNull();
  fireEvent.click(screen.getByText('Разрешить'));
  expect(window.ym).toHaveBeenCalledWith(COUNTER, 'init', expect.objectContaining({ defer: true, webvisor: true, ecommerce: 'dataLayer' }));
  expect(screen.getByLabelText('Private email')).toHaveClass('ym-disable-keys');
  expect(JSON.stringify(ym.mock.calls)).not.toContain('secret@example.com');
  view.rerender(<Analytics path="profile" showSettings />);
  expect(window.ym).toHaveBeenCalledWith(COUNTER, 'init', expect.objectContaining({ webvisor: false, clickmap: false, trackLinks: false }));
  fireEvent.click(screen.getByText('Настройки аналитики'));
  fireEvent.click(screen.getByText('Без аналитики'));
  expect(window.ym).toHaveBeenLastCalledWith(COUNTER, 'destruct');
  const count = ym.mock.calls.length;
  trackGoal('add_to_cart');
  expect(ym.mock.calls).toHaveLength(count);
});
