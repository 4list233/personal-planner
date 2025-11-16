# Deployment Guide - forestli.me

This guide will help you deploy your personal planner to **forestli.me** using Vercel with Notion database integration.

---

## Prerequisites

✅ Domain: forestli.me (registered on Namecheap)  
✅ GitHub repository connected  
✅ Notion account with your planner database  

---

## Step 1: Set Up Notion Integration

**Why this is needed:** Your web app needs permission to read and write to your Notion database. Think of this as creating a "key" that lets your forestli.me website talk to Notion on your behalf.

---

### 1.1 Create Notion Integration (3 minutes)

**What you're doing:** Creating an API key that allows your app to access Notion.

**Detailed Steps:**

1. **Open Notion Integrations page**
   - Go to: https://www.notion.so/my-integrations
   - You may need to log in to Notion first

2. **Start creating a new integration**
   - Look for the blue **"+ New integration"** button (usually top right)
   - Click it to open the integration creation form

3. **Name your integration**
   - In the "Name" field, type: `Forest Planner`
   - This is just a label for you to identify this integration later
   - You can name it anything, but "Forest Planner" makes sense for your planner app

4. **Select your workspace**
   - If you have multiple Notion workspaces, pick the one that contains your planner database
   - Usually this is your personal workspace

5. **Set capabilities (Important!)**
   - You'll see three checkboxes for permissions:
     - ✅ **Read content** - Allows app to view your tasks
     - ✅ **Update content** - Allows app to edit existing tasks
     - ✅ **Insert content** - Allows app to create new tasks
   - **Check all three boxes** so your app can fully manage tasks

6. **Submit the integration**
   - Click the **"Submit"** button at the bottom
   - Notion will generate your integration

7. **⚠️ CRITICAL: Copy the Secret Token**
   - After submitting, you'll see a secret token that looks like:
     ```
     secret_abcd1234XYZ...more characters...
     ```
   - Click **"Show"** then **"Copy"** to copy it
   - **Paste it somewhere safe** (like a notes app or password manager)
   - You'll need this token in Step 2.3 when deploying to Vercel
   - ⚠️ **Don't share this token publicly** - it's like a password to your Notion data

---

### 1.2 Connect Integration to Your Database (2 minutes)

**What you're doing:** Giving the integration permission to access your specific planner database. Even though you created the integration, you still need to explicitly connect it to the database you want it to use.

**Detailed Steps:**

1. **Open your Notion database**
   - Go to Notion and navigate to your "⏳ Assessment & Deadlines" database
   - This is the database with your Board View, Weekdays View, and Calendar View

2. **Open the database menu**
   - Look in the **top-right corner** of your database page
   - Click the **"..." (three dots)** button
   - A dropdown menu will appear

3. **Find the connections option**
   - Scroll down in the menu until you see **"Connections"** or **"+ Add connections"**
   - Click on **"+ Add connections"**

4. **Search for your integration**
   - A search box will appear
   - Type: `Forest Planner` (or whatever you named it in Step 1.1)
   - You should see your integration appear in the list

5. **Connect it**
   - Click on **"Forest Planner"** to select it
   - Click **"Confirm"** in the dialog box
   - You should see a confirmation that the integration is now connected

**How to verify it worked:**
- You should now see "Forest Planner" listed under the database's connections
- If you go back to the "..." menu, you'll see it listed under "Connections"

---

### 1.3 Get Your Database ID (1 minute)

**What you're doing:** Finding the unique identifier for your Notion database. Every Notion page and database has a unique ID that looks like a long random string of letters and numbers.

**Detailed Steps:**

1. **Look at your browser's address bar** while viewing your database
   - Make sure you're on the database page (you should see your tasks/board view)
   - The URL will look something like this:
   
   ```
   https://www.notion.so/yourworkspace/abc123def456ghi789jkl?v=somethingelse
                                       ^^^^^^^^^^^^^^^^^
                                       This is your Database ID!
   ```

2. **Copy the Database ID**
   - The Database ID is the **32-character string** between your workspace name and the `?v=` part
   - It looks like: `abc123def456ghi789jkl` (mix of letters and numbers)
   - **Select and copy this entire string**

**Examples of what to copy:**

✅ **Correct Database ID format:**
```
1234567890abcdef1234567890abcdef
```
or with dashes (both work):
```
12345678-90ab-cdef-1234-567890abcdef
```

❌ **Don't include:**
- The `https://www.notion.so/` part
- The `?v=...` part at the end
- Your workspace name

**Pro tip:** 
- If your URL has dashes in the ID, you can include them or remove them - both work
- Copy it to your notes along with the secret token from Step 1.1
- You'll need this in Step 2.3 when setting up Vercel

**Example with real-looking URL:**
```
https://www.notion.so/myworkspace/abc123def456?v=789xyz
                                  ^^^^^^^^^^^^
                            Copy this part only!
```

---

**✅ Checkpoint:** Before moving to Step 2, make sure you have:
- [ ] Secret token saved (starts with `secret_...`)
- [ ] Database ID copied (32 characters, letters and numbers)
- [ ] Integration connected to your database (visible in database settings)

---

## Step 2: Deploy to Vercel

### 2.1 Connect GitHub to Vercel
1. Go to https://vercel.com
2. Sign up/login with GitHub
3. Click **"Add New..."** → **"Project"**
4. Import your GitHub repository: `personal-planner`

### 2.2 Configure Build Settings
Vercel will auto-detect Next.js. Verify these settings:
- **Framework Preset:** Next.js
- **Build Command:** `npm run build`
- **Install Command:** `npm install --legacy-peer-deps`
- **Output Directory:** `.next` (default)

### 2.3 Add Environment Variables
Before deploying, add these environment variables:

| Name | Value |
|------|-------|
| `NOTION_API_KEY` | Your integration secret (from Step 1.1) |
| `NOTION_DATABASE_ID` | Your database ID (from Step 1.3) |

Click **"Deploy"** - this will take 2-3 minutes.

---

## Step 3: Connect Your Custom Domain

### 3.1 Add Domain in Vercel
1. Go to your project in Vercel
2. Click **"Settings"** → **"Domains"**
3. Add domain: `forestli.me`
4. Also add: `www.forestli.me`

### 3.2 Update DNS Settings in Namecheap
1. Log into Namecheap
2. Go to **Domain List** → Click **"Manage"** next to forestli.me
3. Go to **"Advanced DNS"** tab
4. Add these records:

**For forestli.me:**
| Type | Host | Value | TTL |
|------|------|-------|-----|
| A Record | @ | 76.76.21.21 | Automatic |
| CNAME Record | www | cname.vercel-dns.com | Automatic |

**Alternative (if using Vercel DNS):**
Vercel will give you specific nameservers - update Namecheap to use those instead.

5. Click **"Save All Changes"**
6. Wait 5-60 minutes for DNS propagation

### 3.3 Verify SSL Certificate
Vercel automatically provisions SSL certificates. Once DNS is set up:
- Your site will be live at `https://forestli.me` 🎉

---

## Step 4: Update Code to Use Notion API

The code already has Notion integration set up in `lib/notion.ts`. Once deployed with environment variables, it will automatically connect to your Notion database.

To switch from mock data to real Notion data:

### 4.1 Update API Routes (Already Done!)
The API routes in `app/api/tasks/` are ready to use Notion.

### 4.2 Test the Integration
After deployment:
1. Visit `https://forestli.me`
2. Try creating/editing tasks
3. Check your Notion database - changes should sync!

---

## Step 5: Continuous Deployment

Now whenever you push to GitHub:
1. `git add .`
2. `git commit -m "Your changes"`
3. `git push origin main`

Vercel will automatically:
- Build your app
- Run tests
- Deploy to `forestli.me`
- Usually takes 1-2 minutes

---

## Environment Variables Reference

Create a `.env.local` file for local development:
```bash
NOTION_API_KEY=secret_your_token_here
NOTION_DATABASE_ID=your_database_id_here
```

**⚠️ Never commit `.env.local` to GitHub!** (it's already in `.gitignore`)

---

## Troubleshooting

### Domain not loading?
- Check DNS propagation: https://dnschecker.org/
- Wait up to 24 hours (usually 5-60 minutes)
- Verify DNS records in Namecheap match Vercel's requirements

### Notion connection not working?
- Verify the integration has access to your database
- Check that environment variables are set in Vercel
- Look at Vercel logs: **Deployments → [Latest] → Functions**

### Build failing?
- Check Vercel build logs
- Ensure `--legacy-peer-deps` is in install command
- Verify all dependencies are in package.json

---

## Quick Deploy Checklist

- [ ] Created Notion integration and copied token
- [ ] Connected integration to Notion database  
- [ ] Got database ID from Notion URL
- [ ] Signed up for Vercel
- [ ] Imported GitHub repo to Vercel
- [ ] Added environment variables in Vercel
- [ ] Deployed project
- [ ] Added forestli.me to Vercel domains
- [ ] Updated Namecheap DNS settings
- [ ] Waited for DNS propagation
- [ ] Visited https://forestli.me 🎉

---

## Support Resources

- Vercel Docs: https://vercel.com/docs
- Notion API: https://developers.notion.com/
- DNS Help: https://www.namecheap.com/support/knowledgebase/category/10166/dns-domain-name-system/

Need help? Check the logs in:
- **Vercel:** Project → Deployments → [Latest] → Build/Function Logs
- **Browser:** Open DevTools → Console tab
