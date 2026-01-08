// Simple health check endpoint that doesn't consume Gemini quota
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'Health check - no AI calls made'
  });
}
