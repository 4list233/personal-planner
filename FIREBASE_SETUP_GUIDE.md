# Firebase Setup Guide

## Overview
This guide will help you set up Firebase Authentication and Firestore to enable multi-user support for your personal planner application.

## Prerequisites
- Google/Firebase account
- Notion workspace with admin access

---

## Part 1: Firebase Console Setup

### Step 1: Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or **"Create a project"**
3. Enter project name: `personal-planner` (or your preferred name)
4. Enable Google Analytics (optional but recommended)
5. Click **"Create project"**

### Step 2: Enable Authentication
1. In Firebase Console, click **"Authentication"** in the left sidebar
2. Click **"Get started"**
3. Go to **"Sign-in method"** tab
4. Enable the following providers:
   - ✅ **Email/Password** - Click "Enable" toggle, then "Save"
   - ✅ **Google** - Click "Enable" toggle, add support email, then "Save"
   - (Optional) GitHub, Microsoft, Apple, etc.

### Step 3: Create Firestore Database
1. Click **"Firestore Database"** in the left sidebar
2. Click **"Create database"**
3. Choose **"Start in production mode"** (we'll set rules later)
4. Select your preferred location (choose closest to your users)
5. Click **"Enable"**

### Step 4: Set Firestore Security Rules
1. In Firestore Database, go to **"Rules"** tab
2. Replace with the following rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User profiles - users can only read/write their own profile
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // User settings and preferences
    match /users/{userId}/settings/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Task metadata - links Notion task IDs to Firebase users
    match /taskOwnership/{taskId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        (!exists(/databases/$(database)/documents/taskOwnership/$(taskId)) ||
         resource.data.userId == request.auth.uid);
    }
  }
}
```

3. Click **"Publish"**

### Step 5: Register Web App
1. In Project Overview, click the **Web icon** (</>)
2. Enter app nickname: `personal-planner-web`
3. ✅ Check **"Also set up Firebase Hosting"** (optional)
4. Click **"Register app"**
5. **Copy the Firebase configuration object** - you'll need this later

Example configuration:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "personal-planner-xxxxx.firebaseapp.com",
  projectId: "personal-planner-xxxxx",
  storageBucket: "personal-planner-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

### Step 6: Get Service Account Key (for server-side operations)
1. Go to **Project Settings** (gear icon) > **Service accounts**
2. Click **"Generate new private key"**
3. Click **"Generate key"** - a JSON file will download
4. **Keep this file secure** - it contains admin credentials

---

## Part 2: Notion Database Setup

### Step 1: Add User Email Column
1. Open your Notion database (the one linked to NOTION_DATABASE_ID)
2. Click **"+ New property"** (or click any column header)
3. Create a new property:
   - **Property name:** `User Email`
   - **Property type:** `Email`
4. Click outside to save

### Step 2: Add User ID Column
1. Click **"+ New property"** again
2. Create another property:
   - **Property name:** `User ID`
   - **Property type:** `Text`
3. Click outside to save

### Step 3: Update Integration Permissions (if needed)
1. Go to your Notion integration page: https://www.notion.so/my-integrations
2. Find your integration (the one with your NOTION_API_KEY)
3. Ensure it has **"Read content"**, **"Update content"**, and **"Insert content"** permissions
4. Verify your database is still shared with the integration:
   - Open your database page in Notion
   - Click **"Share"** (top right)
   - Ensure your integration is listed under "Connections"

---

## Part 3: Environment Variables Setup

Add the following to your `.env.local` file:

```bash
# Existing Notion variables
NOTION_API_KEY=ntn_your_integration_token_here
NOTION_DATABASE_ID=your_database_id_here

# Existing Gemini variable
GEMINI_API_KEY=your_gemini_api_key_here

# Firebase Client Config (for browser)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=personal-planner-xxxxx.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=personal-planner-xxxxx
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=personal-planner-xxxxx.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef123456

# Firebase Admin SDK (for server-side)
FIREBASE_PROJECT_ID=personal-planner-xxxxx
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@personal-planner-xxxxx.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourPrivateKeyHere\n-----END PRIVATE KEY-----\n"
```

**Note:** Replace all placeholder values with your actual Firebase configuration values.

---

## Part 4: Install Dependencies

Run the following command to install Firebase SDK:

```bash
npm install firebase firebase-admin
```

---

## Part 5: Testing the Setup

After implementing the code changes (see FIREBASE_INTEGRATION.md), you can test:

1. **Authentication Test:**
   ```bash
   npm run dev
   ```
   - Visit http://localhost:3000
   - You should see a login screen
   - Try signing up with email/password
   - Try signing in with Google

2. **Database Test:**
   - After logging in, create a task
   - Check Notion - the task should have your email in "User Email" column
   - Check Firebase Console > Firestore - you should see a document in `taskOwnership` collection

3. **Multi-user Test:**
   - Log out and create a second account
   - Create tasks with the second account
   - Verify each user only sees their own tasks

---

## Security Checklist

- [ ] Firebase authentication is enabled
- [ ] Firestore security rules are published
- [ ] `.env.local` is in `.gitignore` (never commit credentials)
- [ ] Service account key JSON is stored securely (not in git)
- [ ] NEXT_PUBLIC_ variables only contain non-sensitive config
- [ ] Private key in .env.local has proper line breaks (`\n`)
- [ ] Notion integration permissions are correct
- [ ] User Email and User ID columns exist in Notion database

---

## Troubleshooting

### Firebase Auth Issues
- **Error: "Invalid API key"** → Check NEXT_PUBLIC_FIREBASE_API_KEY
- **Error: "Auth domain not whitelisted"** → Add your domain in Firebase Console > Authentication > Settings > Authorized domains

### Firestore Permission Issues
- **Error: "Missing or insufficient permissions"** → Check Firestore security rules
- **Error: "PERMISSION_DENIED"** → Ensure user is authenticated

### Notion Integration Issues
- **Missing "User Email" property** → Add the Email property to your database
- **Error: "Property not found"** → Check exact property name spelling in code vs Notion

### Environment Variable Issues
- **Error: "Firebase config is invalid"** → Check all NEXT_PUBLIC_ variables are set
- **Private key error** → Ensure FIREBASE_PRIVATE_KEY has `\n` for line breaks
- **Values undefined** → Restart dev server after adding new variables

---

## Next Steps

After completing this setup:
1. See `FIREBASE_INTEGRATION.md` for code implementation details
2. Test authentication flow thoroughly
3. Verify task filtering by user works correctly
4. Deploy to Vercel with all environment variables configured

