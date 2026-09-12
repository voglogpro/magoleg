import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AnalyticsPanel } from './CustomerPanels';

afterEach(cleanup);
const report = (totals: number[]) => ({ totals, data: [], sampled: false });
const stats = {
  connected: true, counter: 112522333, local: { customers: 3, carts: 1, subscribers: 0 },
  totals: report([100, 80, 240, 15, 125]), engaged: report([25, 20]),
  daily: { ...report([]), data: [{ dimensions: [{ name: '2026-09-12' }], metrics: [100, 80, 240] }] },
};

it('shows visits, duration, share, daily rows and changes the period', async () => {
  const request = vi.fn().mockResolvedValue(stats);
  render(<AnalyticsPanel request={request} />);
  expect(await screen.findByText('2 мин 5 с')).toBeInTheDocument();
  expect(screen.getByText('Доля от всех визитов, %').parentElement).toHaveTextContent('25');
  expect(screen.getByText('Визиты дольше 60 секунд').parentElement).toHaveTextContent('25');
  expect(within(screen.getByRole('table')).getByText('2026-09-12')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '30' } });
  await waitFor(() => expect(request).toHaveBeenCalledWith('/analytics?days=30', expect.anything()));
  await screen.findByText('2 мин 5 с');
});

it('handles no visits and does not disguise missing authorization as zero traffic', async () => {
  const request = vi.fn().mockResolvedValue({ ...stats, totals: report([0, 0, 0, 0, 0]), engaged: report([0, 0]), daily: report([]) });
  const view = render(<AnalyticsPanel request={request} />);
  await screen.findByText('0 мин 0 с');
  expect(screen.getByText('Доля от всех визитов, %').parentElement).toHaveTextContent('0');
  expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
  view.unmount();
  request.mockResolvedValue({ ...stats, connected: false, message: 'Для отчётов нужен токен.' });
  render(<AnalyticsPanel request={request} />);
  expect(await screen.findByText('Для отчётов нужен токен.')).toBeInTheDocument();
  expect(screen.queryByText('Визиты дольше 60 секунд')).not.toBeInTheDocument();
});
