import { NextResponse } from 'next/server';
export const runtime = 'nodejs';

export async function GET() {
  const key = process.env.NOTION_API_KEY || '';
  const db = process.env.NOTION_DATABASE_ID || '';
  return NextResponse.json({
    ok: !!key && !!db,
    apiKeyLength: key.length,
    dbIdLength: db.length,
    apiKeyStartsWith: key.slice(0, 4),
    apiKeyContainsWhitespace: /\s/.test(key),
    dbIdContainsWhitespace: /\s/.test(db),
  });
}
