import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'unknown';
  const msg = process.env.VERCEL_GIT_COMMIT_MESSAGE || '';
  const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || '';
  const ts = new Date().toISOString();
  return NextResponse.json({ sha, msg, branch, ts });
}
