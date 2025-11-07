// API Route: GET /api/tasks
// Fetches all tasks from Notion database

import { NextRequest, NextResponse } from 'next/server';
import { fetchTasksFromNotion, createTaskInNotion } from '@/lib/notion';

export async function GET() {
  try {
    const tasks = await fetchTasksFromNotion();
    return NextResponse.json({ tasks, success: true });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks', success: false },
      { status: 500 }
    );
  }
}

// POST /api/tasks
// Creates a new task in Notion database
export async function POST(request: NextRequest) {
  try {
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
    });

    return NextResponse.json({ task: newTask, success: true });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: 'Failed to create task', success: false },
      { status: 500 }
    );
  }
}
