# Complete Notion Integration Setup Guide

## Step 1: Create a Notion Integration

1. **Go to Notion Integrations Page**
   - Visit: https://www.notion.so/my-integrations
   - Click "New integration" (or "+ Create new integration")

2. **Configure the Integration**
   - **Name**: `Personal Planner` (or any name you prefer)
   - **Associated workspace**: Select your workspace
   - **Type**: Internal integration
   - **Capabilities** (ensure these are enabled):
     - ✅ Read content
     - ✅ Update content
     - ✅ Insert content
   - Click "Submit" or "Save"

3. **Copy the API Key**
   - After creating, you'll see "Internal Integration Secret"
   - Click "Show" then "Copy"
   - It looks like: `secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx` or `ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **Save this somewhere secure - you'll need it!**

## Step 2: Create Your Tasks Database

1. **Create a New Database in Notion**
   - Open Notion
   - Create a new page or use an existing workspace
   - Type `/database` and select "Table - Full page"
   - Name it: `Tasks` or `Personal Planner Tasks`

2. **Set Up Database Properties**
   You need these EXACT property names (case-sensitive):

   | Property Name | Type | Options/Config |
   |--------------|------|----------------|
   | **Name** | Title | (default, auto-created) |
   | **Status** | Select | Add these options: `Reminders`, `Long Term Deadlines`, `To Do`, `Doing Today`, `Doing Tomorrow`, `Archived` |
   | **Due Date** | Date | (no time needed, just date) |
   | **Weekdays** | Select | Add these options: `No Weekdays`, `Sunday`, `Monday`, `Tuesday`, `Wednesday`, `Thursday`, `Friday`, `Saturday` |
   | **Todos** | Text | (optional, for subtasks) |

   **How to add properties:**
   - Click the "+" button in the table header
   - Select the property type
   - Name it exactly as shown above
   - For Select properties, add all the options listed

3. **Add Some Sample Tasks** (Optional)
   - Add 2-3 test tasks with different statuses
   - This helps verify the integration is working

## Step 3: Get Your Database ID

**Method A: From the URL (Easiest)**
1. Open your Tasks database in Notion (full page view)
2. Look at the URL in your browser:
   ```
   https://www.notion.so/[workspace]/[DATABASE_ID]?v=...
   ```
3. The DATABASE_ID is the 32-character string after your workspace name
4. It looks like: `2a3d1ec644e880d7865cdd240c52d760`
5. Copy this ID

**Method B: From Share Menu**
1. Click "Share" in top-right of your database
2. Click "Copy link"
3. The URL will look like:
   ```
   https://www.notion.so/DATABASE_ID?v=...
   ```
4. Extract the 32-character hex string (letters and numbers only)

## Step 4: Connect Integration to Database

**This is the CRITICAL step many people miss!**

1. **Open your Tasks database**
2. **Click the "•••" menu** (three dots) in the top-right corner
3. **Scroll down and select "Connections"** or **"+ Add connections"**
4. **Search for your integration name** (e.g., "Personal Planner")
5. **Click to connect it**
6. You should see your integration listed under "Connected to"

**⚠️ If you skip this step, you'll get "object_not_found" or "unauthorized" errors!**

## Step 5: Update Your .env.local File

1. **Open your project in VS Code**
2. **Open or create `.env.local` file** in the root directory
3. **Add your credentials:**
   ```bash
   # Notion Integration
   NOTION_API_KEY=secret_YOUR_ACTUAL_API_KEY_HERE
   NOTION_DATABASE_ID=YOUR_32_CHARACTER_DATABASE_ID_HERE
   ```

4. **Example (with fake values):**
   ```bash
   # Notion Integration
   NOTION_API_KEY=secret_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
   NOTION_DATABASE_ID=2a3d1ec644e880d7865cdd240c52d760
   ```

5. **Save the file**

## Step 6: Restart Your Dev Server

```bash
# Stop the current server (Ctrl+C in terminal)
# Then restart:
npm run dev
```

**Important:** Environment variables are only loaded when the server starts!

## Step 7: Test the Connection

Run the test script:
```bash
npm run test:notion
```

**Expected output if successful:**
```
✅ Environment variables configured
✅ Successfully fetched X tasks
✅ Successfully created test task
✅ All tests passed! Notion integration is working.
```

**Common errors and fixes:**

### Error: "object_not_found"
- ❌ **Problem**: Integration not connected to database
- ✅ **Fix**: Go back to Step 4 and connect the integration

### Error: "unauthorized" 
- ❌ **Problem**: Wrong API key or key not valid
- ✅ **Fix**: Generate a new API key in Step 1

### Error: "validation_error"
- ❌ **Problem**: Database properties don't match
- ✅ **Fix**: Check property names in Step 2 (case-sensitive!)

### Error: "Notion not configured"
- ❌ **Problem**: .env.local not loaded
- ✅ **Fix**: Restart dev server (Step 6)

## Step 8: Verify in Browser

1. **Open your app**: http://localhost:3000
2. **Check the console** (F12 → Console tab):
   - You should see: `✅ Loaded tasks from Notion: X`
   - If you see: `📝 Using mock data` → Integration not working

3. **Try creating a task**:
   - Click "New" button
   - Fill in details
   - Click "Add Task"
   - Check your Notion database - it should appear there!

## Checklist

Before asking for help, verify:
- [ ] Created Notion integration at https://www.notion.so/my-integrations
- [ ] Copied the API key (starts with `secret_` or `ntn_`)
- [ ] Created a database with EXACT property names
- [ ] **CONNECTED the integration to the database** (Step 4)
- [ ] Copied the database ID from the URL
- [ ] Updated `.env.local` with both values
- [ ] Restarted the dev server
- [ ] Ran `npm run test:notion` successfully

## Quick Reference: Property Names

Copy/paste these exact names when creating properties:
```
Name          (Title)
Status        (Select)
Due Date      (Date)
Weekdays      (Select)
Todos         (Text)
```

## Status Options
```
Reminders
Long Term Deadlines
To Do
Doing Today
Doing Tomorrow
Archived
```

## Weekday Options
```
No Weekdays
Sunday
Monday
Tuesday
Wednesday
Thursday
Friday
Saturday
```

## Need Help?

If you're still having issues after following all steps:
1. Run `npm run test:notion` and share the output
2. Check browser console for errors
3. Verify the database ID is 32 characters (no dashes or extra text)
4. Double-check Step 4 - the integration MUST be connected!

---

**Pro Tip**: Create a sample task manually in Notion first, then check if it appears in your app. This confirms the read connection works before testing writes.
