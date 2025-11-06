// API Route: GET /api/tasks
// Fetches all tasks from Notion database

import { NextResponse } from 'next/server';
// import { fetchTasksFromNotion } from '@/lib/notion';
import { mockTasks } from '@/lib/mock-data';

export async function GET() {
  try {
    // TODO: Replace with actual Notion API call
    // const tasks = await fetchTasksFromNotion();
    
    // For now, return mock data
    const tasks = mockTasks;
    
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
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // TODO: Validate with Zod schema
    // TODO: Call createTaskInNotion(body)
    
    return NextResponse.json(
      { message: 'Task creation not yet implemented', success: false },
      { status: 501 }
    );
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: 'Failed to create task', success: false },
      { status: 500 }
    );
  }
}
