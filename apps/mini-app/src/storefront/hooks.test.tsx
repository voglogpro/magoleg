import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccount } from './hooks';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const profile = { name: 'Анна', contact: '+79001234567', city: 'Краснодар' };

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); localStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe('account session restore', () => {
  it('remembers on this device that the shopper is signed in', async () => {
    // Тело Response читается один раз: каждому заходу нужен свой ответ.
    vi.mocked(fetch).mockImplementation(async () => json({ account: profile, csrfToken: 'token' }));
    const first = renderHook(() => useAccount());
    // Первый заход: о входе ещё ничего не известно, поэтому форма входа уместна.
    expect(first.result.current.restoring).toBe(false);
    await waitFor(() => expect(first.result.current.account).toEqual(profile));
    expect(localStorage.getItem('gpartner.signed-in.v1')).toBe('1');

    const second = renderHook(() => useAccount());
    expect(second.result.current.restoring).toBe(true);
    await waitFor(() => expect(second.result.current.restoring).toBe(false));
    expect(second.result.current.csrfToken).toBe('token');
  });

  it('forgets the sign-in only when the server says the visitor is signed out', async () => {
    localStorage.setItem('gpartner.signed-in.v1', '1');
    vi.mocked(fetch).mockImplementation(async () => json({ account: null }));
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.account).toBeNull();
    expect(localStorage.getItem('gpartner.signed-in.v1')).toBeNull();
  });

  it('keeps the sign-in through a failed request: a dropped connection is not a logout', async () => {
    localStorage.setItem('gpartner.signed-in.v1', '1');
    vi.mocked(fetch).mockRejectedValue(new Error('Сеть недоступна'));
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(localStorage.getItem('gpartner.signed-in.v1')).toBe('1');
  });
});
