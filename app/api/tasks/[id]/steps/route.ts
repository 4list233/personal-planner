// API Route: POST /api/tasks/[id]/steps
// Applies one checklist edit to the Todos text as it is in Notion right now, so
// lines the planner bot added since this page loaded are not overwritten.

import { NextRequest, NextResponse } from 'next/server';
import { TaskNotFoundError, applyStepOpForUser } from '@/lib/notion';
import { requireUserEmail } from '@/lib/api-auth';
import { StepConflictError } from '@/lib/steps';
import { parseStepOp } from '@/lib/task-patch';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUserEmail(request);
    if ('response' in auth) return auth.response;
    const parsed = parseStepOp(await request.json());
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, success: false }, { status: 400 });
    }
    const { id } = await context.params;
    const task = await applyStepOpForUser(id, parsed.value, auth.email);
    return NextResponse.json({ task, success: true });
  } catch (error) {
    console.error('Failed to update steps', error);
    const message = error instanceof Error ? error.message : 'Failed to update steps';
    const status =
      error instanceof TaskNotFoundError ? 404 : error instanceof StepConflictError ? 409 : 500;
    return NextResponse.json({ error: message, success: false }, { status });
  }
}
