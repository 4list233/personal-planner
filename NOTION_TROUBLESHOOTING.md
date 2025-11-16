# Notion Integration Troubleshooting & Implementation Guide

## Current State Analysis

### ✅ What's Working
- Environment variables are configured (`.env.local`)
- Notion client library is installed
- Notion helper functions exist (`lib/notion.ts`)
- App successfully reads from Notion on initial page load

### ❌ What's NOT Working
- **New tasks created locally are NOT synced to Notion**
- Tasks are only stored in Zustand (client-side state)
- API routes exist but are not implemented (return 501)
- No real-time sync between local state and Notion

## Root Cause

The app has a **one-way sync**: Notion → App (on load only)
It's missing: App → Notion (when creating/updating/deleting tasks)

## Architecture Issue

```
Current Flow:
[Notion DB] --read--> [App State (Zustand)] --X NO SYNC X--> [Notion DB]
                              ↓
                      [User creates task]
                              ↓
                   [Task only in memory]
                   [Lost on page refresh]
```

## Troubleshooting Steps

### Step 1: Verify Notion Connection
Run this test to confirm Notion is accessible:

```bash
# Create a test file
npm run test:notion
```

### Step 2: Check Database Schema
Ensure your Notion database has these properties:
- **Name** (Title) - Required
- **Status** (Select) - Options: Reminders, Long Term Deadlines, To Do, Doing Today, Doing Tomorrow, Archived
- **Due Date** (Date)
- **Weekdays** (Select) - Options: No Weekdays, Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday
- **Todos** (Rich Text) - Optional

### Step 3: Test API Endpoints
```bash
# Test reading tasks
curl http://localhost:3000/api/tasks

# Test creating a task (currently returns 501)
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Task","status":"To Do","dueDate":"2025-11-08"}'
```

## Solution: Implement Two-Way Sync

### Option A: Server-Side API Approach (Recommended)
**Pros:** Secure, scalable, proper error handling
**Cons:** More code, requires API routes

```
[User Action] → [Zustand Store] → [API Route] → [Notion DB]
                      ↓                              ↓
              [Optimistic Update]          [Confirmation]
```

### Option B: Direct Client-Side Approach
**Pros:** Simpler, fewer files
**Cons:** Exposes API keys, less secure

```
[User Action] → [Zustand Store + Notion Helper] → [Notion DB]
```

### Option C: Hybrid Approach (Best for MVP)
**Pros:** Quick to implement, good UX
**Cons:** Can have sync conflicts

```
[User Action] → [Zustand Store (immediate)] 
                      ↓
              [Background Sync to Notion]
                      ↓
              [Periodic Refresh from Notion]
```

## Recommended Implementation Plan

### Phase 1: Enable Basic Sync (Quick Fix)
1. Update `addTask` in store to call Notion API
2. Update `updateTask` in store to call Notion API
3. Update `deleteTask` in store to call Notion API

### Phase 2: Implement API Routes (Production Ready)
1. Complete `POST /api/tasks` endpoint
2. Complete `PUT /api/tasks/[id]` endpoint
3. Complete `DELETE /api/tasks/[id]` endpoint
4. Add error handling and validation

### Phase 3: Advanced Features
1. Real-time sync with webhooks
2. Offline support with sync queue
3. Conflict resolution
4. Background sync worker

## Quick Test Script

Create a simple test to verify Notion connectivity:

```typescript
// scripts/test-notion.ts
import { fetchTasksFromNotion, createTaskInNotion } from './lib/notion';

async function testNotion() {
  console.log('🔍 Testing Notion connection...');
  
  try {
    // Test reading
    const tasks = await fetchTasksFromNotion();
    console.log('✅ Read test passed:', tasks.length, 'tasks found');
    
    // Test writing
    const newTask = await createTaskInNotion({
      title: 'Test Task from Script',
      status: 'To Do',
      dateCreated: new Date().toISOString(),
      dueDate: new Date().toISOString().split('T')[0],
      weekday: 'No Weekdays',
    });
    console.log('✅ Write test passed: Created task', newTask.id);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testNotion();
```

## Next Steps

Choose your approach and I can help implement:
1. **Quick Fix**: Direct Notion sync in store (15 minutes)
2. **API Routes**: Proper server-side implementation (30 minutes)
3. **Testing**: Create diagnostic tools first (10 minutes)

Which would you like to proceed with?
