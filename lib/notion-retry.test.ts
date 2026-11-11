import { describe, expect, it, vi } from 'vitest';
import { withNotionRetry } from './notion-retry';

const sleep = () => Promise.resolve();

describe('withNotionRetry', () => {
  it('retries rate limits and conflicts, then succeeds', async () => {
    const work = vi
      .fn()
      .mockRejectedValueOnce({ code: 'rate_limited' })
      .mockRejectedValueOnce({ code: 'conflict_error' })
      .mockResolvedValue('ok');
    await expect(withNotionRetry(work, sleep)).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('honours Retry-After and caps the wait', async () => {
    const waits: number[] = [];
    const headers = { get: () => '60' };
    const work = vi.fn().mockRejectedValueOnce({ status: 429, headers }).mockResolvedValue('ok');
    await withNotionRetry(work, async (ms) => void waits.push(ms));
    expect(waits).toEqual([5000]);
  });

  it('gives up after four attempts and does not retry other errors', async () => {
    const limited = vi.fn().mockRejectedValue({ code: 'rate_limited' });
    await expect(withNotionRetry(limited, sleep)).rejects.toEqual({ code: 'rate_limited' });
    expect(limited).toHaveBeenCalledTimes(4);

    const invalid = vi.fn().mockRejectedValue({ code: 'validation_error' });
    await expect(withNotionRetry(invalid, sleep)).rejects.toEqual({ code: 'validation_error' });
    expect(invalid).toHaveBeenCalledTimes(1);
  });

  it('can leave conflicts to the caller, still retrying rate limits', async () => {
    const conflict = Object.assign(new Error('conflict'), { code: 'conflict_error', status: 409 });
    let calls = 0;
    await expect(
      withNotionRetry(async () => {
        calls += 1;
        throw conflict;
      }, async () => undefined, false)
    ).rejects.toBe(conflict);
    expect(calls).toBe(1);
  });
});
