// API Route: GET /api/tasks
// Fetches all tasks from Notion database (filtered by authenticated user)

import { NextRequest, NextResponse } from 'next/server';
import { fetchTasksFromNotion, createTaskInNotion } from '@/lib/notion';
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

    // Minimal shape; in a full implementation, validate with Zod
    const newTask = await createTaskInNotion({
      title: (body.title as string) || 'New Task',
      dueDate:
        (body.dueDate as string | undefined) || now.toISOString().split('T')[0],
      dateCreated: now.toISOString(),
      status: (body.status as any) || 'To Do',
      weekday: (body.weekday as any) || 'No Weekdays',
      daysUntilDue: 0,
      todoItems: Array.isArray(body.todoItems) ? body.todoItems : [],
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
