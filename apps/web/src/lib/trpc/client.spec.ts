import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from './client';

const jsonHeaders = { 'content-type': 'application/json' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('fetchWithRetry (story 11-5 — at-most-once mutations)', () => {
  it('does NOT retry a mutation (POST) on a 5xx — sends it at most once', async () => {
    const fail = new Response('err', { status: 503, headers: jsonHeaders });
    const fetchMock = vi.fn().mockResolvedValue(fail);
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('http://api/trpc', { method: 'POST' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(503);
  });

  it('does NOT retry a mutation (POST) on a connection error — throws after one attempt', async () => {
    const connErr = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNRESET' },
    });
    const fetchMock = vi.fn().mockRejectedValue(connErr);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWithRetry('http://api/trpc', { method: 'POST' })).rejects.toThrow(
      'fetch failed'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a query (GET) on a 5xx, then returns the eventual success', async () => {
    vi.useFakeTimers();
    const fail = new Response('err', { status: 503, headers: jsonHeaders });
    const ok = new Response('{}', { status: 200, headers: jsonHeaders });
    const fetchMock = vi.fn().mockResolvedValueOnce(fail).mockResolvedValueOnce(ok);
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchWithRetry('http://api/trpc', { method: 'GET' });
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it('treats a missing method as a query (GET) and retries', async () => {
    vi.useFakeTimers();
    const fail = new Response('err', { status: 500, headers: jsonHeaders });
    const ok = new Response('{}', { status: 200, headers: jsonHeaders });
    const fetchMock = vi.fn().mockResolvedValueOnce(fail).mockResolvedValueOnce(ok);
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchWithRetry('http://api/trpc');
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });
});
