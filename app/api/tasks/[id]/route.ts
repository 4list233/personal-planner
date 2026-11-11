// API Route: GET/PUT /api/tasks/[id]
// There is deliberately no DELETE. Nothing on this site may remove a Notion page.

import { NextRequest, NextResponse } from 'next/server';
import { ArchiveNotAllowedError, TaskNotFoundError, fetchTaskFromNotion, updateTaskForUser } from '@/lib/notion';
import { requireUserEmail } from '@/lib/api-auth';
import { parseTaskPatch } from '@/lib/task-patch';

// Ensure Node.js runtime for Notion SDK compatibility on Vercel
export const runtime = 'nodejs';

function errorResponse(error: unknown, fallback: string) {
  console.error(fallback, error);
  const message = error instanceof Error ? error.message : fallback;
  const status =
    error instanceof TaskNotFoundError ? 404 : error instanceof ArchiveNotAllowedError ? 409 : 500;
  return NextResponse.json({ error: message, success: false }, { status });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUserEmail(request);
    if ('response' in auth) return auth.response;
    const { id } = await context.params;
    const task = await fetchTaskFromNotion(id, auth.email);
    return NextResponse.json({ task, success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to fetch task');
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUserEmail(request);
    if ('response' in auth) return auth.response;
    const parsed = parseTaskPatch(await request.json());
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, success: false }, { status: 400 });
    }
    const { id } = await context.params;
    const task = await updateTaskForUser(id, parsed.value, auth.email);
    return NextResponse.json({ task, success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to update task');
  }
}
