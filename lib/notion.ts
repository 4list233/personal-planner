// Notion API integration. @notionhq/client v5 speaks to data sources
// (API version 2025-09-03) and no longer exposes databases.query.
import {
  APIResponseError,
  Client,
  isFullBlock,
  isFullDatabase,
  isFullDataSource,
  isFullPage,
} from '@notionhq/client';
import type { BlockObjectRequest, QueryDataSourceParameters } from '@notionhq/client';
import {
  checklistFromSources,
  formatTodosText,
  parseTodosText,
  richTextRequest,
  rowVisibleToUser,
  stageFromStatus,
  taskFromNotionPage,
  userEmailQueryFilter,
} from './planner';
import type { Task, TodoItem } from './types';

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

  if (task.todoItems !== undefined) {
    properties.Todos = { rich_text: richTextRequest(formatTodosText(task.todoItems)) };
  }

  if (task.comments !== undefined) {
    const commentsText = task.comments.join('\n');
    properties.Comments = { rich_text: richTextRequest(commentsText) };
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

  if (task.important !== undefined) {
    properties.Important = { checkbox: !!task.important };
  }

  if (task.urgent !== undefined) {
    properties.Urgent = { checkbox: !!task.urgent };
  }

  return properties;
}

function todoBlocks(items: TodoItem[]): BlockObjectRequest[] {
  return items.map((item) => ({
    type: 'to_do',
    to_do: {
      rich_text: richTextRequest(item.text || ' '),
      checked: item.completed,
    },
  }));
}

async function createPage(
  ctx: NotionContext,
  properties: Record<string, any>,
  children?: BlockObjectRequest[]
) {
  let pending = { ...properties };
  let withChildren = children;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await ctx.client.pages.create({
        parent: { data_source_id: ctx.dataSourceId },
        properties: pending,
        children: withChildren && withChildren.length > 0 ? withChildren : undefined,
      } as any);
    } catch (error) {
      const missing = missingPropertyName(error);
      if (missing && missing in pending) {
        console.warn(`Skipping missing Notion property "${missing}"`);
        delete pending[missing];
        pending = { ...pending };
        continue;
      }
      if (withChildren && withChildren.length > 0) {
        console.warn('Notion rejected checklist blocks on create; saving the Todos property only');
        withChildren = undefined;
        continue;
      }
      throw error;
    }
  }
  throw new Error('Failed to create Notion page');
}

async function updatePageProperties(client: Client, pageId: string, properties: Record<string, any>) {
  let pending = { ...properties };
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await client.pages.update({
        page_id: pageId,
        properties: pending,
      } as any);
    } catch (error) {
      const missing = missingPropertyName(error);
      if (!missing || !(missing in pending)) throw error;
      console.warn(`Skipping missing Notion property "${missing}"`);
      delete pending[missing];
      pending = { ...pending };
    }
  }
  throw new Error('Failed to update Notion page properties');
}

async function listTodoBlocks(client: Client, pageId: string) {
  const todos: Array<{ id: string; to_do: { rich_text: Array<{ plain_text?: string }>; checked?: boolean } }> = [];
  let cursor: string | undefined;
  let hasMore = true;
  while (hasMore) {
    const response = await client.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const block of response.results) {
      if (!isFullBlock(block) || block.archived || block.in_trash || block.type !== 'to_do') continue;
      todos.push(block);
    }
    hasMore = response.has_more;
    cursor = response.next_cursor || undefined;
  }
  return todos;
}

function blockToTodo(block: { id: string; to_do: { rich_text: Array<{ plain_text?: string }>; checked?: boolean } }): TodoItem {
  const text = (block.to_do.rich_text || []).map((part) => part.plain_text || '').join('');
  return { id: block.id, text, completed: block.to_do.checked === true };
}

async function syncTodoBlocks(client: Client, pageId: string, items: TodoItem[]) {
  const existing = await listTodoBlocks(client, pageId);
  const shared = Math.min(existing.length, items.length);
  for (let index = 0; index < shared; index++) {
    const block = existing[index];
    const item = items[index];
    const current = (block.to_do.rich_text || []).map((part) => part.plain_text || '').join('');
    if (current === item.text && block.to_do.checked === !!item.completed) continue;
    await client.blocks.update({
      block_id: block.id,
      to_do: {
        rich_text: richTextRequest(item.text || ' '),
        checked: !!item.completed,
      },
    });
  }

  if (items.length > existing.length) {
    const children = todoBlocks(items.slice(existing.length));
    for (let index = 0; index < children.length; index += 100) {
      await client.blocks.children.append({
        block_id: pageId,
        children: children.slice(index, index + 100),
      });
    }
  }

  // blocks.delete archives the block in trash. Other page content is left alone.
  for (const block of existing.slice(items.length)) {
    await client.blocks.delete({ block_id: block.id });
  }
}

async function queryDataSourcePages(
  ctx: NotionContext,
  filter: QueryDataSourceParameters['filter'] | undefined
) {
  const pages: any[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  while (hasMore) {
    const response = await ctx.client.dataSources.query({
      data_source_id: ctx.dataSourceId,
      page_size: 100,
      start_cursor: cursor,
      filter,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      result_type: 'page',
    });
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

export async function fetchTaskFromNotion(taskId: string, userEmail?: string): Promise<Task> {
  const ctx = await resolveNotion();
  if (!ctx) throw new Error('Notion not configured');

  const page = await ctx.client.pages.retrieve({ page_id: taskId });
  if (!isFullPage(page) || page.archived || page.in_trash || !pageBelongs(page, ctx)) {
    throw new Error('Task not found');
  }

  const task = taskFromNotionPage(page);
  if (!rowVisibleToUser(task.userEmail, userEmail)) {
    throw new Error('Task not found');
  }

  const blocks = await listTodoBlocks(ctx.client, page.id);
  task.todoItems = checklistFromSources(
    blocks.map(blockToTodo),
    task.todoItems || parseTodosText('')
  );
  return task;
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

  const page = await createPage(ctx, properties, todoBlocks(task.todoItems || []));
  if (!isFullPage(page)) {
    throw new Error('Notion returned a partial page');
  }
  const created = taskFromNotionPage(page);
  if (task.todoItems && task.todoItems.length > 0) {
    created.todoItems = checklistFromSources(task.todoItems, created.todoItems || []);
  }
  return created;
}

export async function updateTaskInNotion(taskId: string, updates: Partial<Task>): Promise<Task> {
  const ctx = await resolveNotion();
  if (!ctx) throw new Error('Notion not configured');

  const page = await updatePageProperties(ctx.client, taskId, taskToNotionProperties(updates));
  const full = isFullPage(page) ? page : await ctx.client.pages.retrieve({ page_id: taskId });
  if (!isFullPage(full)) throw new Error('Notion returned a partial page');

  const task = taskFromNotionPage(full);
  if (updates.todoItems && updates.syncChecklist !== false) {
    await syncTodoBlocks(ctx.client, taskId, updates.todoItems);
    const blocks = await listTodoBlocks(ctx.client, taskId);
    task.todoItems = checklistFromSources(blocks.map(blockToTodo), updates.todoItems);
  }
  task.syncChecklist = undefined;
  return task;
}

/** Archive a task. Notion keeps the page in trash; this never permanently deletes it. */
export async function deleteTaskInNotion(taskId: string): Promise<void> {
  const ctx = await resolveNotion();
  if (!ctx) throw new Error('Notion not configured');

  await ctx.client.pages.update({
    page_id: taskId,
    archived: true,
  });
}

export async function syncToNotion(tasks: Task[]): Promise<void> {
  void tasks;
  throw new Error('Notion sync not yet configured');
}
