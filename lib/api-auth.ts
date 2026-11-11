import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';

/** The signed-in user's email, or the response to return instead. */
export async function requireUserEmail(
  request: NextRequest
): Promise<{ email: string } | { response: NextResponse }> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return { response: NextResponse.json({ error: 'Unauthorized', success: false }, { status: 401 }) };
  }
  const user = await verifyIdToken(header.substring(7));
  if (!user.email) {
    return { response: NextResponse.json({ error: 'User email not found', success: false }, { status: 400 }) };
  }
  return { email: user.email };
}
