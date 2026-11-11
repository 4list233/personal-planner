// Notion allows about three requests a second and answers 429 past that.

// Vercel functions time out, so a request cannot wait out a long throttle.
const MAX_ATTEMPTS = 4;
const MAX_WAIT_MS = 5000;
const BASE_WAIT_MS = 400;

interface NotionErrorLike {
  code?: string;
  status?: number;
  headers?: unknown;
}

const isRateLimited = (error: NotionErrorLike) => error?.code === 'rate_limited' || error?.status === 429;

// Two writers racing on a page. The planner bot makes this a normal case.
const isConflict = (error: NotionErrorLike) => error?.code === 'conflict_error' || error?.status === 409;

function retryAfterMs(error: NotionErrorLike): number | null {
  const headers = error?.headers as { get?: (name: string) => string | null } | undefined;
  const value = Number(headers?.get?.('retry-after'));
  return Number.isFinite(value) && value > 0 ? value * 1000 : null;
}

export async function withNotionRetry<T>(
  work: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  // Off when the request carries text built from an earlier read: resending it
  // after a conflict would overwrite whatever caused the conflict.
  retryConflicts = true
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      const notionError = error as NotionErrorLike;
      const retryable = isRateLimited(notionError) || (retryConflicts && isConflict(notionError));
      if (attempt >= MAX_ATTEMPTS || !retryable) throw error;
      await sleep(Math.min(retryAfterMs(notionError) ?? BASE_WAIT_MS * 2 ** (attempt - 1), MAX_WAIT_MS));
    }
  }
}
