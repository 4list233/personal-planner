// API Route: GET/PUT/DELETE /api/tasks/[id]
// Handles individual task operations

import { NextResponse } from 'next/server';
// import { updateTaskInNotion, deleteTaskInNotion } from '@/lib/notion';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // TODO: Fetch single task from Notion
    
    return NextResponse.json(
      { message: 'Single task fetch not yet implemented', success: false },
      { status: 501 }
    );
  } catch (error) {
    console.error('Error fetching task:', error);
    return NextResponse.json(
      { error: 'Failed to fetch task', success: false },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const updates = await request.json();
    
    // TODO: Update task in Notion
    // const updatedTask = await updateTaskInNotion(id, updates);
    
    return NextResponse.json(
      { message: 'Task update not yet implemented', success: false },
      { status: 501 }
    );
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: 'Failed to update task', success: false },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // TODO: Delete (archive) task in Notion
    // await deleteTaskInNotion(id);
    
    return NextResponse.json(
      { message: 'Task deletion not yet implemented', success: false },
      { status: 501 }
    );
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json(
      { error: 'Failed to delete task', success: false },
      { status: 500 }
    );
  }
}
