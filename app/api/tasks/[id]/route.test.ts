import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const updateTaskForUser = vi.fn();

vi.mock('@/lib/firebase-admin', () => ({
  verifyIdToken: vi.fn(async () => ({ email: 'owner@example.com', uid: 'u' })),
}));

vi.mock('@/lib/notion', () => {
  class TaskNotFoundError extends Error {}
  class ArchiveNotAllowedError extends Error {}
  return {
    TaskNotFoundError,
    ArchiveNotAllowedError,
    fetchTaskFromNotion: vi.fn(),
    updateTaskForUser: (...args: unknown[]) => updateTaskForUser(...args),
  };
});

import * as route from './route';
import { ArchiveNotAllowedError, TaskNotFoundError } from '@/lib/notion';

function put(body: unknown, headers: Record<string, string> = { authorization: 'Bearer t' }) {
  const request = new NextRequest('http://x/api/tasks/a', { method: 'PUT', body: JSON.stringify(body), headers });
  return route.PUT(request, { params: Promise.resolve({ id: 'a' }) });
}

beforeEach(() => updateTaskForUser.mockReset());

describe('/api/tasks/[id]', () => {
  it('has no way to delete a page', () => {
    expect('DELETE' in route).toBe(false);
  });

  it('requires a signed-in user', async () => {
    expect((await put({ title: 'x' }, {})).status).toBe(401);
    expect(updateTaskForUser).not.toHaveBeenCalled();
  });

  it('saves a valid edit for that user', async () => {
    updateTaskForUser.mockResolvedValue({ id: 'a' });
    const res = await put({ stage: 'Done', status: 'Done' });
    expect(res.status).toBe(200);
    expect(updateTaskForUser).toHaveBeenCalledWith('a', { stage: 'Done', status: 'Done' }, 'owner@example.com');
  });

  it('rejects a request aimed at trashing the page', async () => {
    expect((await put({ archived: true })).status).toBe(400);
    expect(updateTaskForUser).not.toHaveBeenCalled();
  });

  it('answers 404 for someone else’s row and 409 for archiving an open task', async () => {
    updateTaskForUser.mockRejectedValueOnce(new TaskNotFoundError());
    expect((await put({ title: 'x' })).status).toBe(404);
    updateTaskForUser.mockRejectedValueOnce(new ArchiveNotAllowedError());
    expect((await put({ status: 'Archived' })).status).toBe(409);
  });
});
