import { NextResponse } from 'next/server';
import { Client } from '@notionhq/client';

export const runtime = 'nodejs';

export async function GET() {
  const HAS_KEY = !!process.env.NOTION_API_KEY && process.env.NOTION_API_KEY !== 'placeholder_key';
  const HAS_DB = !!process.env.NOTION_DATABASE_ID && process.env.NOTION_DATABASE_ID !== 'placeholder_id';

  if (!HAS_KEY || !HAS_DB) {
    return NextResponse.json({
      ok: false,
      reason: 'env-missing',
      HAS_KEY,
      HAS_DB,
      DATABASE_ID: (process.env.NOTION_DATABASE_ID || '').slice(0, 6) + '…',
    }, { status: 500 });
  }

  const client = new Client({ auth: process.env.NOTION_API_KEY });
  const databaseId = process.env.NOTION_DATABASE_ID as string;

  try {
    const search = await client.search({
      filter: { property: 'object', value: 'page' },
      page_size: 5,
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
    });

    const inDb = search.results.filter((p: any) => p.parent?.type === 'database_id' && p.parent.database_id === databaseId);

    return NextResponse.json({ ok: true, pagesFound: inDb.length });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 500 });
  }
}
