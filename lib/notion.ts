// This file contains Notion API integration helpers
import { Client } from '@notionhq/client';
import { Task, TaskStatus, Weekday, TodoItem } from './types';

// Lazy initialization - check each time
function getNotionClient() {
  const RAW_KEY = (process.env.NOTION_API_KEY || '').trim();
  const RAW_DB = (process.env.NOTION_DATABASE_ID || '').trim();

  const isConfigured = RAW_KEY && RAW_DB &&
    RAW_KEY !== 'placeholder_key' &&
    RAW_DB !== 'placeholder_id';

  if (!isConfigured) {
    return null;
  }

  // Basic validation to avoid invalid Authorization header values on Vercel
  if (/\s/.test(RAW_KEY)) {
    throw new Error('NOTION_API_KEY appears invalid (contains whitespace). Ensure it is the exact integration token starting with "ntn_".');
  }
  if (!RAW_KEY.startsWith('ntn_')) {
    // Not fatal, but warn for visibility
    console.warn('NOTION_API_KEY does not start with "ntn_". Verify the correct token is set.');
  }

  return {
    client: new Client({ auth: RAW_KEY }),
    databaseId: RAW_DB,
  };
}

/**
 * Fetch all tasks from Notion database
 * @param userEmail - Optional email to filter tasks by user
 */
export async function fetchTasksFromNotion(userEmail?: string): Promise<Task[]> {
  const notion = getNotionClient();

  if (!notion) {
    console.warn('Notion not configured - returning empty task list');
    return [];
  }

  // Build filter for user email if provided
  const filter = userEmail ? {
    property: 'User Email',
    email: {
      equals: userEmail,
    },
  } : undefined;

  // Prefer database query for complete results with pagination
  try {
    const tasks: Task[] = [];
    let hasMore = true;
    let startCursor: string | undefined = undefined;

    while (hasMore) {
      // @ts-ignore types sometimes lag; runtime supports databases.query
      const resp: any = await notion.client.databases.query({
        database_id: notion.databaseId,
        page_size: 100,
        start_cursor: startCursor,
        filter: filter,
        sorts: [
          { timestamp: 'last_edited_time', direction: 'descending' as const },
        ],
      });

      const pageResults: any[] = resp.results || [];
      for (const page of pageResults) {
        tasks.push(notionPageToTask(page));
      }

      hasMore = resp.has_more === true;
      startCursor = resp.next_cursor || undefined;
    }

    return tasks;
  } catch (err) {
    console.warn('databases.query failed, attempting REST fallback:', err);
    // Fallback 1: call REST API directly to query the database (avoids SDK quirk)
    try {
      const tasks: Task[] = [];
      let startCursor: string | undefined = undefined;
      let hasMore = true;

      const token = (process.env.NOTION_API_KEY || '').trim();
      const dbid = notion.databaseId;

      while (hasMore) {
        const res = await fetch(`https://api.notion.com/v1/databases/${dbid}/query`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            page_size: 100, 
            start_cursor: startCursor,
            filter: filter,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`REST databases.query failed: ${res.status} ${res.statusText} - ${text}`);
        }
        const json: any = await res.json();
        const results: any[] = json.results || [];
        for (const page of results) {
          tasks.push(notionPageToTask(page));
        }
        hasMore = json.has_more === true;
        startCursor = json.next_cursor || undefined;
      }

      return tasks;
    } catch (restErr) {
      console.warn('REST databases.query failed, falling back to search():', restErr);
    }

    // Fallback 2: search API with pagination and filter by parent database id
    try {
      const tasks: Task[] = [];
      let startCursor: string | undefined = undefined;
      let hasMore = true;

      while (hasMore) {
        const response: any = await notion.client.search({
          filter: { property: 'object', value: 'page' },
          sort: { direction: 'descending', timestamp: 'last_edited_time' },
          page_size: 100,
          start_cursor: startCursor,
        } as any);
        const pages = (response.results as any[]).filter(
          (page: any) =>
            page.parent?.type === 'database_id' &&
            page.parent?.database_id === notion.databaseId
        );
        for (const page of pages) tasks.push(notionPageToTask(page));
        hasMore = response.has_more === true;
        startCursor = response.next_cursor || undefined;
      }
      return tasks;
    } catch (error) {
      console.error('Error fetching tasks from Notion:', error);
      return [];
    }
  }
}

/**
 * Create a new task in Notion
 * @param task - Task data to create
 * @param userEmail - Optional user email to associate with task
 * @param userId - Optional user ID to associate with task
 */
export async function createTaskInNotion(
  task: Omit<Task, 'id'>, 
  userEmail?: string, 
  userId?: string
): Promise<Task> {
  const notion = getNotionClient();
  
  if (!notion) {
    throw new Error('Notion not configured');
  }
  
  try {
    const properties = taskToNotionProperties(task);
    
    // Add user email and ID if provided
    if (userEmail) {
      properties['User Email'] = {
        email: userEmail,
      };
    }
    
    if (userId) {
      properties['User ID'] = {
        rich_text: [{ text: { content: userId } }],
      };
    }
    
    const response = await notion.client.pages.create({
      parent: { database_id: notion.databaseId },
      properties: properties,
    });
    
    return notionPageToTask(response);
  } catch (error) {
    console.error('Error creating task in Notion:', error);
    throw error;
  }
}

/**
 * Update an existing task in Notion
 */
export async function updateTaskInNotion(
  taskId: string,
  updates: Partial<Task>
): Promise<Task> {
  const notion = getNotionClient();
  
  if (!notion) {
    throw new Error('Notion not configured');
  }
  
  try {
    const response = await notion.client.pages.update({
      page_id: taskId,
      properties: taskToNotionProperties(updates),
    });
    
    return notionPageToTask(response);
  } catch (error) {
    console.error('Error updating task in Notion:', error);
    throw error;
  }
}

/**
 * Delete a task from Notion (archive it)
 */
export async function deleteTaskInNotion(taskId: string): Promise<void> {
  const notion = getNotionClient();
  
  if (!notion) {
    throw new Error('Notion not configured');
  }
  
  try {
    await notion.client.pages.update({
      page_id: taskId,
      archived: true,
    });
  } catch (error) {
    console.error('Error deleting task in Notion:', error);
    throw error;
  }
}

/**
 * Convert Notion page to Task object
 */
function notionPageToTask(page: any): Task {
  const props = page.properties || {};

  // Heuristics to find common fields even if property names differ
  const titleProp = findFirstPropOfType(props, 'title');
  const statusProp = props['Status'] || findFirstPropOfType(props, 'select');
  const dueProp = props['Due Date'] || props['Due'] || findFirstPropOfType(props, 'date');
  const weekdayProp = props['Weekdays'] || props['Weekday'] || undefined;
  const todosProp = props['Todos'] || props['To-dos'] || findFirstPropOfType(props, 'rich_text');

  // Parse todos from first rich_text block as newline-separated list if present
  let todos: TodoItem[] = [];
  const todosText = todosProp?.rich_text?.[0]?.plain_text || '';
  if (todosText) {
    todos = todosText
      .split('\n')
      .filter(Boolean)
      .map((text: string, index: number) => ({
        id: `${page.id}-todo-${index}`,
        text: text.replace(/^[\-\*✓]\s*/, ''),
        completed: text.trim().startsWith('✓'),
      }));
  }

  const title = titleProp?.title?.[0]?.plain_text || 'Untitled';
  const dueDate = dueProp?.date?.start as string | undefined;
  const status = (statusProp?.select?.name as TaskStatus) || 'To Do';
  const weekday = (weekdayProp?.select?.name as Weekday) || 'No Weekdays';

  return {
    id: page.id,
    title,
    dueDate,
    dateCreated: page.created_time,
    status,
    weekday,
    daysUntilDue: calculateDaysUntilDue(dueDate),
    todoItems: todos,
  };
}

function findFirstPropOfType(properties: any, type: 'title' | 'select' | 'date' | 'rich_text') {
  for (const key of Object.keys(properties)) {
    const p = properties[key];
    if (p?.type === type) return p;
  }
  return undefined;
}

/**
 * Convert Task object to Notion properties
 */
function taskToNotionProperties(task: Partial<Task>) {
  const properties: any = {};
  
  if (task.title !== undefined) {
    properties.Name = {
      title: [{ text: { content: task.title } }],
    };
  }
  
  if (task.dueDate !== undefined) {
    properties['Due Date'] = {
      date: task.dueDate ? { start: task.dueDate } : null,
    };
  }
  
  if (task.status !== undefined) {
    properties.Status = {
      select: { name: task.status },
    };
  }
  
  if (task.weekday !== undefined) {
    properties.Weekdays = {
      select: task.weekday ? { name: task.weekday } : null,
    };
  }
  
  if (task.todoItems !== undefined) {
    // Store todos as newline-separated text
    const todosText = task.todoItems.map(t => `${t.completed ? '✓' : '-'} ${t.text}`).join('\n');
    properties.Todos = {
      rich_text: [{ text: { content: todosText } }],
    };
  }
  
  return properties;
}

/**
 * Calculate days until due date
 */
function calculateDaysUntilDue(dueDate?: string): number | undefined {
  if (!dueDate) return undefined;
  
  const now = new Date();
  const due = new Date(dueDate);
  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Sync local changes to Notion (for optimistic updates)
 */
export async function syncToNotion(tasks: Task[]): Promise<void> {
  // TODO: Implement batch sync logic
  throw new Error('Notion sync not yet configured');
}
