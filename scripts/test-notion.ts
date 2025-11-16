/**
 * Notion Connection Test Script
 * Run with: npm run test:notion
 */

import dotenv from 'dotenv';
import { fetchTasksFromNotion, createTaskInNotion } from '../lib/notion';

// Load environment variables FIRST
dotenv.config({ path: '.env.local' });

const NOTION_API_KEY = process.env.NOTION_API_KEY || '';
const DATABASE_ID = process.env.NOTION_DATABASE_ID || '';

async function testNotionConnection() {
  console.log('🔍 Testing Notion Integration...\n');
  
  // Test 1: Check environment variables
  console.log('1️⃣ Checking environment variables...');
  const hasApiKey = NOTION_API_KEY && NOTION_API_KEY !== 'placeholder_key';
  const hasDbId = DATABASE_ID && DATABASE_ID !== 'placeholder_id';
  
  if (!hasApiKey) {
    console.error('❌ NOTION_API_KEY not configured');
    console.error(`   Found: "${NOTION_API_KEY}"`);
    return;
  }
  if (!hasDbId) {
    console.error('❌ NOTION_DATABASE_ID not configured');
    console.error(`   Found: "${DATABASE_ID}"`);
    return;
  }
  console.log('✅ Environment variables configured');
  console.log(`   API Key: ${NOTION_API_KEY.substring(0, 10)}...`);
  console.log(`   Database ID: ${DATABASE_ID}\n`);
  
  // Test 2: Fetch existing tasks
  console.log('2️⃣ Fetching tasks from Notion...');
  try {
    const tasks = await fetchTasksFromNotion();
    console.log(`✅ Successfully fetched ${tasks.length} tasks`);
    if (tasks.length > 0) {
      console.log('   Sample task:', tasks[0].title);
      console.log('   Sample task ID:', tasks[0].id);
    }
    console.log('');
  } catch (error: any) {
    console.error('❌ Failed to fetch tasks');
    console.error('   Error:', error.message);
    console.error('   Code:', error.code);
    if (error.code === 'object_not_found') {
      console.error('   → Database ID is invalid or integration not connected');
    } else if (error.code === 'unauthorized') {
      console.error('   → API key is invalid');
    }
    return;
  }
  
  // Test 3: Create a test task
  console.log('3️⃣ Creating a test task...');
  try {
    const testTask = await createTaskInNotion({
      title: `🧪 Test Task (${new Date().toLocaleTimeString()})`,
      status: 'To Do',
      dateCreated: new Date().toISOString(),
      dueDate: new Date().toISOString().split('T')[0],
      weekday: 'No Weekdays',
      daysUntilDue: 0,
      todoItems: [],
    });
    
    console.log('✅ Successfully created test task');
    console.log('   Task ID:', testTask.id);
    console.log('   Task Title:', testTask.title);
    console.log('   Check your Notion database!\n');
  } catch (error: any) {
    console.error('❌ Failed to create task');
    console.error('   Error:', error.message);
    console.error('   Code:', error.code);
    if (error.code === 'validation_error') {
      console.error('   → Database schema might be incorrect');
      console.error('   → Check that all required properties exist:');
      console.error('     - Name (Title)');
      console.error('     - Status (Select)');
      console.error('     - Due Date (Date)');
      console.error('     - Weekdays (Select)');
    }
    console.error('\n   Full error:', error);
    return;
  }
  
  console.log('✅ All tests passed! Notion integration is working.\n');
  console.log('📋 Next steps:');
  console.log('   1. Check your Notion database for the test task');
  console.log('   2. Implement real-time sync in the app');
  console.log('   3. Update API routes to use Notion functions\n');
}

// Run the test
testNotionConnection().catch(console.error);
