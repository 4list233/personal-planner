// API Route: GET/PUT/DELETE /api/tasks/[id]
// Handles individual task operations

import { NextRequest, NextResponse } from 'next/server';
import { updateTaskInNotion, deleteTaskInNotion } from '@/lib/notion';
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    
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
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

    const { id } = await context.params;
    const updates = await request.json();
    const updatedTask = await updateTaskInNotion(id, updates);
    return NextResponse.json({ task: updatedTask, success: true });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: (error as any)?.message || 'Failed to update task', success: false },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

    const { id } = await context.params;
    await deleteTaskInNotion(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json(
      { error: (error as any)?.message || 'Failed to delete task', success: false },
      { status: 500 }
    );
  }
}
