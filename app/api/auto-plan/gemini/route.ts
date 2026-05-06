import { NextRequest, NextResponse } from 'next/server';
import { getGeminiFallbackClient } from '@/lib/gemini-fallback';
import { verifyIdToken } from '@/lib/firebase-admin';
import { buildBacklogPrompt, parseBacklogResponse } from '@/lib/auto-plan-gemini';
import type { GeminiBacklogPayload } from '@/lib/auto-plan';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized - missing token' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    const user = await verifyIdToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized - invalid token' }, { status: 401 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured on server' },
        { status: 500 }
      );
    }

    const payload = (await request.json()) as GeminiBacklogPayload;
    if (!payload || !Array.isArray(payload.backlogTasks)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const client = getGeminiFallbackClient({ requireMultiModal: false });
    const prompt = buildBacklogPrompt(payload);
    const result = await client.generateContent(prompt, { multiModal: false });

    const parsed = parseBacklogResponse(result.text);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Failed to parse model response', raw: result.text },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Auto-plan Gemini error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
