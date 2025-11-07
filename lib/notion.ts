// This file contains Notion API integration helpers
import { Client } from '@notionhq/client';
import { Task, TaskStatus, Weekday, TodoItem } from './types';

// Initialize Notion client only if credentials are provided
const NOTION_API_KEY = process.env.NOTION_API_KEY || '';
const DATABASE_ID = process.env.NOTION_DATABASE_ID || '';

const isNotionConfigured = NOTION_API_KEY && DATABASE_ID && 
  NOTION_API_KEY !== 'placeholder_key' && 
  DATABASE_ID !== 'placeholder_id';

export const notion = isNotionConfigured ? new Client({
  auth: NOTION_API_KEY,
}) : null;

/**
 * Fetch all tasks from Notion database
 */
export async function fetchTasksFromNotion(): Promise<Task[]> {
  if (!isNotionConfigured || !notion) {
    console.warn('Notion not configured - using mock data');
    return [];
  }
  
  try {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      sorts: [
        {
          property: 'Due Date',
          direction: 'ascending',
        },
      ],
    });
    
    return response.results.map(notionPageToTask);
  } catch (error) {
    console.error('Error fetching tasks from Notion:', error);
    return [];
  }
}

/**
 * Create a new task in Notion
 */
export async function createTaskInNotion(task: Omit<Task, 'id'>): Promise<Task> {
  if (!isNotionConfigured || !notion) {
    throw new Error('Notion not configured');
  }
  
  try {
    const response = await notion.pages.create({
      parent: { database_id: DATABASE_ID },
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
  if (!isNotionConfigured || !notion) {
    throw new Error('Notion not configured');
  }
  
  try {
    const response = await notion.pages.update({
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
  if (!isNotionConfigured || !notion) {
    throw new Error('Notion not configured');
  }
  
  try {
    await notion.pages.update({
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
    todos = todosText.split('\n').filter(Boolean).map((text, index) => ({
      id: `${page.id}-todo-${index}`,
      text: text.replace(/^[\-\*]\s*/, ''),
      completed: false,
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
    todos,
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
  
  if (task.todos !== undefined) {
    // Store todos as newline-separated text
    const todosText = task.todos.map(t => `${t.completed ? '✓' : '-'} ${t.text}`).join('\n');
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
