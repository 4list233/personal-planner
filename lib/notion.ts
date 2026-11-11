// Notion API integration. @notionhq/client v5 speaks to data sources
// (API version 2025-09-03) and no longer exposes databases.query.
import {
  APIResponseError,
  Client,
  isFullDatabase,
  isFullDataSource,
  isFullPage,
} from '@notionhq/client';
import type { QueryDataSourceParameters } from '@notionhq/client';
import { withNotionRetry } from './notion-retry';
import {
  formatTodosText,
  richTextRequest,
  rowVisibleToUser,
  stageFromStatus,
  taskFromNotionPage,
  userEmailQueryFilter,
} from './planner';
import { applyStepOp, type StepOp } from './steps';
import type { Task } from './types';
import { isDone } from './views';

export class TaskNotFoundError extends Error {
  constructor() {
    super('Task not found');
  }
}

export class ArchiveNotAllowedError extends Error {
  constructor() {
    super('Only a finished task can be archived');
  }
}

// Status and Stage define whether a task is finished. Dropping either one to
// tolerate an old schema would leave a task half complete with no error.
const NEVER_SKIP_PROPERTIES = new Set(['Status', 'Stage']);

type NotionContext = {
  client: Client;
  configuredId: string;
  dataSourceId: string;
  databaseId?: string;
};

let cached: { key: string; ctx: NotionContext } | null = null;

function notionIds(): { key: string; databaseId: string; dataSourceId: string } | null {
  const key = (process.env.NOTION_API_KEY || '').trim();
  const databaseId = (process.env.NOTION_DATABASE_ID || '').trim();
  const dataSourceId = (process.env.NOTION_DATA_SOURCE_ID || '').trim();
  const configured =
    key &&
    databaseId &&
    key !== 'placeholder_key' &&
    databaseId !== 'placeholder_id';
  if (!configured) return null;
  if (/\s/.test(key)) {
    throw new Error(
      'NOTION_API_KEY appears invalid (contains whitespace). Ensure it is the exact integration token starting with "ntn_".'
    );
  }
  if (!key.startsWith('ntn_')) {
    console.warn('NOTION_API_KEY does not start with "ntn_". Verify the correct token is set.');
  }
  return { key, databaseId, dataSourceId };
}

function sameId(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a.replace(/-/g, '').toLowerCase() === b.replace(/-/g, '').toLowerCase();
}

function pageBelongs(page: { parent?: any }, ctx: NotionContext): boolean {
  const parent = page.parent || {};
  const candidates = [parent.data_source_id, parent.database_id];
  const wanted = [ctx.dataSourceId, ctx.databaseId, ctx.configuredId];
  return candidates.some((id) => wanted.some((want) => sameId(id, want)));
}

async function resolveNotion(): Promise<NotionContext | null> {
  const ids = notionIds();
  if (!ids) return null;
  const cacheKey = `${ids.databaseId}:${ids.dataSourceId}`;
  if (cached?.key === cacheKey) return cached.ctx;

  const client = new Client({ auth: ids.key });
  let dataSourceId = ids.dataSourceId && ids.dataSourceId !== 'placeholder_id' ? ids.dataSourceId : '';
  let databaseId: string | undefined;

  if (!dataSourceId) {
    try {
      const dataSource = await client.dataSources.retrieve({ data_source_id: ids.databaseId });
      if (!isFullDataSource(dataSource)) {
        throw new Error('Notion data source response was incomplete');
      }
      dataSourceId = dataSource.id;
      databaseId = (dataSource.parent as { database_id?: string } | undefined)?.database_id;
    } catch (error) {
      if (error instanceof Error && error.message === 'Notion data source response was incomplete') {
        throw error;
      }
      const database = await client.databases.retrieve({ database_id: ids.databaseId });
      if (!isFullDatabase(database) || database.data_sources.length === 0) {
        throw new Error(
          'Notion database has no data source. NOTION_DATABASE_ID should be the database id or the data source id.'
        );
      }
      dataSourceId = database.data_sources[0].id;
      databaseId = database.id;
    }
  }

  const ctx: NotionContext = {
    client,
    configuredId: ids.databaseId,
    dataSourceId,
    databaseId,
  };
  cached = { key: cacheKey, ctx };
  return ctx;
}

function missingPropertyName(error: unknown): string | null {
  if (!APIResponseError.isAPIResponseError(error)) return null;
  if (error.code !== 'validation_error') return null;
  const match = error.message.match(/^(.+?) is not a property that exists/);
  return match ? match[1].trim() : null;
}

function taskToNotionProperties(task: Partial<Task>): Record<string, any> {
  const properties: Record<string, any> = {};

  if (task.title !== undefined) {
    properties.Name = {
      title: [{ text: { content: task.title.slice(0, 2000) } }],
    };
  }

  if ('dueDate' in task && task.dueDate !== undefined) {
    properties['Due Date'] = {
      date: task.dueDate ? { start: task.dueDate } : null,
    };
  }

  if ('plannedDay' in task && task.plannedDay !== undefined) {
    properties['Planned Day'] = {
      date: task.plannedDay ? { start: task.plannedDay } : null,
    };
  }

  if (task.status !== undefined) {
    properties.Status = { select: { name: task.status } };
  }

  if ('stage' in task && task.stage !== undefined) {
    properties.Stage = { select: task.stage ? { name: task.stage } : null };
  }

  if ('priority' in task && task.priority !== undefined) {
    properties.Priority = { select: task.priority ? { name: task.priority } : null };
  }

  if ('project' in task && task.project !== undefined) {
    properties.Project = { select: task.project ? { name: task.project } : null };
  }

  if ('bucket' in task && task.bucket !== undefined) {
    properties.Bucket = { select: task.bucket ? { name: task.bucket } : null };
  }

  if (task.weekday !== undefined) {
    properties.Weekdays = {
      select: task.weekday ? { name: task.weekday } : null,
    };
  }

  if (task.todosText !== undefined) {
    properties.Todos = { rich_text: richTextRequest(task.todosText) };
  } else if (task.todoItems !== undefined) {
    properties.Todos = { rich_text: richTextRequest(formatTodosText(task.todoItems)) };
  }

  if (task.commentsText !== undefined) {
    properties.Comments = { rich_text: richTextRequest(task.commentsText) };
  } else if (task.comments !== undefined) {
    properties.Comments = { rich_text: richTextRequest(task.comments.join('\n')) };
  }

  if ('nextAction' in task && task.nextAction !== undefined) {
    properties['Next Action'] = { rich_text: richTextRequest(task.nextAction || '') };
  }

  if ('sourceText' in task && task.sourceText !== undefined) {
    properties.Source = { rich_text: richTextRequest(task.sourceText || '') };
  }

  if ('waitingOn' in task && task.waitingOn !== undefined) {
    properties['Waiting On'] = { rich_text: richTextRequest(task.waitingOn || '') };
  }

  if (task.people !== undefined) {
    properties.People = { multi_select: task.people.map((name) => ({ name })) };
  }

  if (task.important !== undefined) {
    properties.Important = { checkbox: !!task.important };
  }

  if (task.urgent !== undefined) {
    properties.Urgent = { checkbox: !!task.urgent };
  }

  return properties;
}

async function createPage(ctx: NotionContext, properties: Record<string, any>) {
  let pending = { ...properties };
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await withNotionRetry(() =>
        ctx.client.pages.create({
          parent: { data_source_id: ctx.dataSourceId },
          properties: pending,
        } as any)
      );
    } catch (error) {
      const missing = missingPropertyName(error);
      if (!missing || !(missing in pending)) throw error;
      console.warn(`Skipping missing Notion property "${missing}"`);
      delete pending[missing];
      pending = { ...pending };
    }
  }
  throw new Error('Failed to create Notion page');
}

async function updatePageProperties(
  client: Client,
  pageId: string,
  properties: Record<string, any>,
  retryConflicts = true
) {
  let pending = { ...properties };
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await withNotionRetry(
        () =>
          client.pages.update({
            page_id: pageId,
            properties: pending,
          } as any),
        undefined,
        retryConflicts
      );
    } catch (error) {
      const missing = missingPropertyName(error);
      if (!missing || !(missing in pending) || NEVER_SKIP_PROPERTIES.has(missing)) throw error;
      console.warn(`Skipping missing Notion property "${missing}"`);
      delete pending[missing];
      pending = { ...pending };
    }
  }
  throw new Error('Failed to update Notion page properties');
}

async function queryDataSourcePages(
  ctx: NotionContext,
  filter: QueryDataSourceParameters['filter'] | undefined
) {
  const pages: any[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  while (hasMore) {
    const response = await withNotionRetry(() =>
      ctx.client.dataSources.query({
        data_source_id: ctx.dataSourceId,
        page_size: 100,
        start_cursor: cursor,
        filter,
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
        result_type: 'page',
      })
    );
    for (const result of response.results) {
      if (isFullPage(result) && !result.archived && !result.in_trash) pages.push(result);
    }
    hasMore = response.has_more;
    cursor = response.next_cursor || undefined;
  }
  return pages;
}

async function restQuery(url: string, version: string, body: Record<string, unknown>) {
  const token = (process.env.NOTION_API_KEY || '').trim();
  const pages: any[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  while (hasMore) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': version,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, page_size: 100, start_cursor: cursor }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Notion query failed: ${response.status} ${text.slice(0, 300)}`);
    }
    const json = await response.json();
    for (const page of json.results || []) {
      if (page?.object === 'page' && !page.archived && !page.in_trash) pages.push(page);
    }
    hasMore = json.has_more === true;
    cursor = json.next_cursor || undefined;
  }
  return pages;
}

async function searchPages(ctx: NotionContext) {
  const pages: any[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  while (hasMore) {
    const response = await ctx.client.search({
      filter: { property: 'object', value: 'page' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 100,
      start_cursor: cursor,
    });
    for (const result of response.results) {
      if (!isFullPage(result) || result.archived || result.in_trash) continue;
      if (!pageBelongs(result, ctx)) continue;
      pages.push(result);
    }
    hasMore = response.has_more;
    cursor = response.next_cursor || undefined;
  }
  return pages;
}

async function queryWithFallbacks(
  ctx: NotionContext,
  filter: QueryDataSourceParameters['filter'] | undefined
) {
  const body: Record<string, unknown> = {
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    result_type: 'page',
  };
  if (filter) body.filter = filter;

  try {
    return await restQuery(
      `https://api.notion.com/v1/data_sources/${ctx.dataSourceId}/query`,
      '2025-09-03',
      body
    );
  } catch (error) {
    console.warn('REST data_sources query failed:', error);
  }

  if (ctx.databaseId || ctx.configuredId) {
    const legacyId = ctx.databaseId || ctx.configuredId;
    try {
      return await restQuery(`https://api.notion.com/v1/databases/${legacyId}/query`, '2022-06-28', {
        filter: filter,
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      });
    } catch (error) {
      console.warn('Legacy databases query failed:', error);
    }
  }

  try {
    return await searchPages(ctx);
  } catch (error) {
    console.error('Error fetching tasks from Notion:', error);
    throw error;
  }
}

function visibleTasks(pages: any[], userEmail?: string): Task[] {
  return pages
    .map((page) => taskFromNotionPage(page))
    .filter((task) => rowVisibleToUser(task.userEmail, userEmail));
}

/**
 * Fetch tasks from the planner data source.
 * When userEmail is the owner, rows with an empty User Email are included.
 */
export async function fetchTasksFromNotion(userEmail?: string): Promise<Task[]> {
  const ctx = await resolveNotion();
  if (!ctx) {
    console.warn('Notion not configured - returning empty task list');
    return [];
  }

  const filter = userEmailQueryFilter(userEmail) as QueryDataSourceParameters['filter'] | undefined;
  try {
    const pages = await queryDataSourcePages(ctx, filter);
    return visibleTasks(pages, userEmail);
  } catch (error) {
    console.warn('dataSources.query failed, attempting fallbacks:', error);
    const pages = await queryWithFallbacks(ctx, filter);
    return visibleTasks(pages, userEmail);
  }
}

async function ownedPage(ctx: NotionContext, taskId: string, userEmail?: string) {
  const page = await withNotionRetry(() => ctx.client.pages.retrieve({ page_id: taskId }));
  if (!isFullPage(page) || page.archived || page.in_trash || !pageBelongs(page, ctx)) {
    throw new TaskNotFoundError();
  }
  const task = taskFromNotionPage(page);
  if (!rowVisibleToUser(task.userEmail, userEmail)) throw new TaskNotFoundError();
  return task;
}

export async function fetchTaskFromNotion(taskId: string, userEmail?: string): Promise<Task> {
  const ctx = await resolveNotion();
  if (!ctx) throw new Error('Notion not configured');
  return ownedPage(ctx, taskId, userEmail);
}

/**
 * Create a new task in Notion.
 * userEmail and userId are written onto the row, same as before.
 */
export async function createTaskInNotion(
  task: Omit<Task, 'id'>,
  userEmail?: string,
  userId?: string
): Promise<Task> {
  const ctx = await resolveNotion();
  if (!ctx) throw new Error('Notion not configured');

  const staged: Omit<Task, 'id'> = task.stage
    ? task
    : { ...task, stage: stageFromStatus(task.status) ?? undefined };

  const properties = taskToNotionProperties(staged);
  if (userEmail) {
    properties['User Email'] = { email: userEmail };
  }
  if (userId) {
    properties['User ID'] = { rich_text: richTextRequest(userId) };
  }

  const page = await createPage(ctx, properties);
  if (!isFullPage(page)) {
    throw new Error('Notion returned a partial page');
  }
  return taskFromNotionPage(page);
}

export async function updateTaskInNotion(
  taskId: string,
  updates: Partial<Task>,
  { retryConflicts = true }: { retryConflicts?: boolean } = {}
): Promise<Task> {
  const ctx = await resolveNotion();
  if (!ctx) throw new Error('Notion not configured');

  const page = await updatePageProperties(ctx.client, taskId, taskToNotionProperties(updates), retryConflicts);
  const full = isFullPage(page)
    ? page
    : await withNotionRetry(() => ctx.client.pages.retrieve({ page_id: taskId }));
  if (!isFullPage(full)) throw new Error('Notion returned a partial page');
  return taskFromNotionPage(full);
}

/** A signed-in user's edit: the row must be theirs, and Archive needs a finished task. */
export async function updateTaskForUser(
  taskId: string,
  updates: Partial<Task>,
  userEmail: string
): Promise<Task> {
  const ctx = await resolveNotion();
  if (!ctx) throw new Error('Notion not configured');
  const current = await ownedPage(ctx, taskId, userEmail);
  if (updates.status === 'Archived' && !isDone(current)) throw new ArchiveNotAllowedError();
  return updateTaskInNotion(taskId, updates);
}

export async function applyStepOpForUser(taskId: string, op: StepOp, userEmail: string): Promise<Task> {
  const ctx = await resolveNotion();
  if (!ctx) throw new Error('Notion not configured');
  // A conflict means someone else wrote this row between the read and the
  // write, so redo the step on a fresh read rather than resend the old text.
  return withNotionRetry(async () => {
    const current = await ownedPage(ctx, taskId, userEmail);
    const todosText = applyStepOp(current.todosText ?? '', op);
    return updateTaskInNotion(taskId, { todosText }, { retryConflicts: false });
  });
}

export async function syncToNotion(tasks: Task[]): Promise<void> {
  void tasks;
  throw new Error('Notion sync not yet configured');
}
