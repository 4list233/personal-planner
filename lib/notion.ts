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
 */
export async function fetchTasksFromNotion(): Promise<Task[]> {
  const notion = getNotionClient();
  
  if (!notion) {
    console.warn('Notion not configured - using mock data');
    return [];
  }
  
  try {
    // Use search API instead of databases.query for SDK v5.x
    const response = await notion.client.search({
      filter: {
        property: 'object',
        value: 'page',
      },
      sort: {
        direction: 'descending',
        timestamp: 'last_edited_time',
      },
    });
    
    // Filter to only pages from our database
    const pages = response.results.filter((page: any) => 
      page.parent?.type === 'database_id' && 
      page.parent?.database_id === notion.databaseId
    );
    
    return pages.map(notionPageToTask);
  } catch (error) {
    console.error('Error fetching tasks from Notion:', error);
    return [];
  }
}

/**
 * Create a new task in Notion
 */
export async function createTaskInNotion(task: Omit<Task, 'id'>): Promise<Task> {
  const notion = getNotionClient();
  
  if (!notion) {
    throw new Error('Notion not configured');
  }
  
  try {
    const response = await notion.client.pages.create({
      parent: { database_id: notion.databaseId },
      properties: taskToNotionProperties(task),
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
  const properties = page.properties;
  
  // Parse todos from rich text or relation field
  let todos: TodoItem[] = [];
  if (properties.Todos?.rich_text) {
    // If stored as comma-separated text
    const todosText = properties.Todos.rich_text[0]?.plain_text || '';
    todos = todosText.split('\n').filter(Boolean).map((text: string, index: number) => ({
      id: `${page.id}-todo-${index}`,
      text: text.replace(/^[\-\*✓]\s*/, ''),
      completed: text.startsWith('✓'),
    }));
  }
  
  return {
    id: page.id,
    title: properties.Name?.title[0]?.plain_text || 'Untitled',
    dueDate: properties['Due Date']?.date?.start,
    dateCreated: page.created_time,
    status: (properties.Status?.select?.name as TaskStatus) || 'To Do',
    weekday: properties.Weekdays?.select?.name as Weekday,
    daysUntilDue: calculateDaysUntilDue(properties['Due Date']?.date?.start),
    todoItems: todos,
  };
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
