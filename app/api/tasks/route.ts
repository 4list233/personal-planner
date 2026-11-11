// API Route: GET /api/tasks
// Fetches all tasks from Notion database (filtered by authenticated user)

import { cleanPeople } from '@/lib/task-patch';
import { NextRequest, NextResponse } from 'next/server';
import { fetchTasksFromNotion, createTaskInNotion } from '@/lib/notion';
import { stageFromStatus } from '@/lib/planner';
import { verifyIdToken } from '@/lib/firebase-admin';

// Ensure Node.js runtime for Notion SDK compatibility on Vercel
export const runtime = 'nodejs';

// Helper to get auth token from request
function getAuthToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const debug = url.searchParams.get('debug') === '1';
  
  try {
    // Verify authentication
    const token = getAuthToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized', success: false }, { status: 401 });
    }

    const user = await verifyIdToken(token);
    if (!user.email) {
      return NextResponse.json({ error: 'User email not found', success: false }, { status: 400 });
    }

    // Fetch tasks filtered by user email
    const tasks = await fetchTasksFromNotion(user.email);
    
    if (!debug) {
      return NextResponse.json({ tasks, success: true });
    }

    // For debug mode, also include raw property keys & counts for first 5 pages
    const rawSummary = tasks.slice(0, 5).map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate, status: t.status, weekday: t.weekday }));
    return NextResponse.json({ tasks, success: true, debug: { count: tasks.length, sample: rawSummary, userEmail: user.email } });
  } catch (error: any) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch tasks', success: false },
      { status: 500 }
    );
  }
}

// POST /api/tasks
// Creates a new task in Notion database (with user linking)
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const token = getAuthToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized', success: false }, { status: 401 });
    }

    const user = await verifyIdToken(token);
    if (!user.email) {
      return NextResponse.json({ error: 'User email not found', success: false }, { status: 400 });
    }

    const HAS_KEY = !!process.env.NOTION_API_KEY && process.env.NOTION_API_KEY !== 'placeholder_key';
    const HAS_DB = !!process.env.NOTION_DATABASE_ID && process.env.NOTION_DATABASE_ID !== 'placeholder_id';
    if (!HAS_KEY || !HAS_DB) {
      const msg = 'Notion not configured on server. Ensure NOTION_API_KEY and NOTION_DATABASE_ID are set and restart.';
      // Include minimal debug info in development only, masking secrets
      const debug = process.env.NODE_ENV !== 'production' ? {
        HAS_KEY,
        HAS_DB,
        DATABASE_ID: (process.env.NOTION_DATABASE_ID || '').slice(0, 6) + '…',
      } : undefined;
      return NextResponse.json({ error: msg, success: false, debug }, { status: 500 });
    }

    const body = await request.json();
    const now = new Date();

    // Rows with an empty User Email are included for the planner owner.
    // Rows tagged with someone else's email stay hidden. New rows still
    // record this user's email and id.

    const status = (body.status as any) || 'To Do';
    const stage = body.stage || stageFromStatus(status) || undefined;

    // Minimal shape; in a full implementation, validate with Zod
    const newTask = await createTaskInNotion({
      title: (body.title as string) || 'New Task',
      // No default: a made-up due date turns every undated task overdue tomorrow.
      dueDate: (body.dueDate as string | undefined) || undefined,
      plannedDay: (body.plannedDay as string | undefined) || undefined,
      dateCreated: now.toISOString(),
      status,
      stage,
      priority: body.priority || undefined,
      project: body.project || undefined,
      bucket: body.bucket || undefined,
      weekday: (body.weekday as any) || 'No Weekdays',
      daysUntilDue: 0,
      todoItems: Array.isArray(body.todoItems) ? body.todoItems : [],
      comments: Array.isArray(body.comments) ? body.comments : [],
      todosText: typeof body.todosText === 'string' ? body.todosText : undefined,
      commentsText: typeof body.commentsText === 'string' ? body.commentsText : undefined,
      nextAction: typeof body.nextAction === 'string' ? body.nextAction : undefined,
      sourceText: typeof body.sourceText === 'string' ? body.sourceText : undefined,
      waitingOn: typeof body.waitingOn === 'string' ? body.waitingOn : undefined,
      people: Array.isArray(body.people) ? cleanPeople(body.people) : undefined,
      important: typeof body.important === 'boolean' ? body.important : false,
      urgent: typeof body.urgent === 'boolean' ? body.urgent : false,
    }, user.email, user.uid); // Pass user email and ID

    return NextResponse.json({ task: newTask, success: true });
  } catch (error) {
    console.error('Error creating task:', error);
    const message = (error as any)?.message || 'Failed to create task';
    const code = (error as any)?.code;
    return NextResponse.json(
      { error: message, code, success: false },
      { status: 500 }
    );
  }
}
