# Firebase Integration Implementation Guide

This document outlines the code changes needed to integrate Firebase Authentication and user-based task filtering.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (Client)                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Firebase Auth (Email/Password, Google, etc.)           │ │
│  │ - Sign in/Sign up                                      │ │
│  │ - Get ID token                                         │ │
│  └────────────────────────────────────────────────────────┘ │
│                            ↓                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Next.js App (Protected Routes)                         │ │
│  │ - Pass ID token to API                                 │ │
│  │ - Display user-specific tasks                          │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                             ↓ API Request with token
┌─────────────────────────────────────────────────────────────┐
│                    Next.js API Routes (Server)               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Firebase Admin SDK - Verify ID token                   │ │
│  │ Extract user email/uid                                 │ │
│  └────────────────────────────────────────────────────────┘ │
│                            ↓                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Notion API - Filter by user email                      │ │
│  │ Add user email/ID to new tasks                         │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
personal-planner/
├── lib/
│   ├── firebase.ts              # NEW - Firebase client config
│   ├── firebase-admin.ts        # NEW - Firebase admin SDK
│   ├── auth-context.tsx         # NEW - Auth state management
│   └── notion.ts                # MODIFY - Add user filtering
├── app/
│   ├── login/
│   │   └── page.tsx             # NEW - Login/signup page
│   ├── api/
│   │   ├── auth/
│   │   │   └── verify/route.ts  # NEW - Verify auth token
│   │   └── tasks/
│   │       └── route.ts         # MODIFY - Add auth + user filtering
│   ├── layout.tsx               # MODIFY - Wrap with AuthProvider
│   └── page.tsx                 # MODIFY - Add auth guard
└── components/
    ├── LoginForm.tsx            # NEW - Email/password form
    ├── GoogleSignInButton.tsx   # NEW - Google OAuth button
    └── UserMenu.tsx             # NEW - User profile dropdown
```

## Implementation Steps

### Step 1: Install Dependencies

```bash
npm install firebase firebase-admin
```

### Step 2: Create Firebase Client Configuration

**File:** `lib/firebase.ts`
```typescript
// Client-side Firebase configuration (browser only)
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase (singleton pattern)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Configure Google provider
googleProvider.setCustomParameters({
  prompt: 'select_account'
});
```

### Step 3: Create Firebase Admin SDK

**File:** `lib/firebase-admin.ts`
```typescript
// Server-side Firebase Admin SDK (Node.js only)
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

let adminApp: App;

function getAdminApp() {
  if (getApps().length === 0) {
    // Initialize with service account credentials
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
      throw new Error('Firebase Admin credentials not configured');
    }

    adminApp = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
  } else {
    adminApp = getApps()[0];
  }

  return adminApp;
}

// Verify Firebase ID token and return user info
export async function verifyIdToken(idToken: string) {
  try {
    const app = getAdminApp();
    const auth = getAuth(app);
    const decodedToken = await auth.verifyIdToken(idToken);
    
    return {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      emailVerified: decodedToken.email_verified || false,
    };
  } catch (error) {
    console.error('Error verifying ID token:', error);
    throw new Error('Invalid authentication token');
  }
}

// Get user by email
export async function getUserByEmail(email: string) {
  try {
    const app = getAdminApp();
    const auth = getAuth(app);
    return await auth.getUserByEmail(email);
  } catch (error) {
    return null;
  }
}
```

### Step 4: Create Authentication Context

**File:** `lib/auth-context.tsx`
```typescript
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpWithEmail = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const getIdToken = async () => {
    if (!user) return null;
    return await user.getIdToken();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signOut,
        resetPassword,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

### Step 5: Create Login Page

**File:** `app/login/page.tsx`
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Mail, Lock, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
  const router = useRouter();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      await signInWithGoogle();
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Personal Planner
          </h1>
          <p className="text-gray-600">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-3 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-3 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or continue with</span>
          </div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full bg-white border border-gray-300 text-gray-700 py-2 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google
        </button>

        <p className="mt-6 text-center text-sm text-gray-600">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
}
```

### Step 6: Update Notion Helper (Add User Filtering)

**File:** `lib/notion.ts` - Add these modifications:

```typescript
// Add userEmail parameter to fetchTasksFromNotion
export async function fetchTasksFromNotion(userEmail?: string): Promise<Task[]> {
  const notion = getNotionClient();

  if (!notion) {
    console.warn('Notion not configured - returning empty task list');
    return [];
  }

  // Use REST API directly for reliable database querying
  try {
    const tasks: Task[] = [];
    let startCursor: string | undefined = undefined;
    let hasMore = true;

    const token = (process.env.NOTION_API_KEY || '').trim();
    const dbid = notion.databaseId;

    while (hasMore) {
      const body: any = { 
        page_size: 100, 
        start_cursor: startCursor,
        sorts: [
          { timestamp: 'last_edited_time', direction: 'descending' as const },
        ],
      };

      // Add filter if userEmail is provided
      if (userEmail) {
        body.filter = {
          property: 'User Email',
          email: {
            equals: userEmail,
          },
        };
      }

      const res = await fetch(`https://api.notion.com/v1/databases/${dbid}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
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
  } catch (error) {
    console.error('Error fetching tasks from Notion:', error);
    return [];
  }
}

// Add userEmail and userId parameters to createTaskInNotion
export async function createTaskInNotion(
  task: Omit<Task, 'id'>,
  userEmail?: string,
  userId?: string
): Promise<Task> {
  const notion = getNotionClient();

  if (!notion) {
    throw new Error('Notion not configured');
  }

  const properties: any = {
    Name: { title: [{ text: { content: task.title } }] },
    Status: { select: { name: task.status } },
    'Due Date': task.dueDate
      ? { date: { start: task.dueDate } }
      : { date: null },
    Weekdays: { select: { name: task.weekday } },
  };

  // Add user email if provided
  if (userEmail) {
    properties['User Email'] = { email: userEmail };
  }

  // Add user ID if provided
  if (userId) {
    properties['User ID'] = { rich_text: [{ text: { content: userId } }] };
  }

  // ... rest of the function
}
```

### Step 7: Update API Route with Authentication

**File:** `app/api/tasks/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { fetchTasksFromNotion, createTaskInNotion } from '@/lib/notion';
import { verifyIdToken } from '@/lib/firebase-admin';

// Helper to get auth token from request
function getAuthToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const token = getAuthToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyIdToken(token);
    if (!user.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 });
    }

    // Fetch tasks filtered by user email
    const tasks = await fetchTasksFromNotion(user.email);
    return NextResponse.json({ tasks });
  } catch (error: any) {
    console.error('Error in GET /api/tasks:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const token = getAuthToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyIdToken(token);
    if (!user.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 });
    }

    const body = await request.json();
    const task = await createTaskInNotion(body, user.email, user.uid);
    
    return NextResponse.json({ task });
  } catch (error: any) {
    console.error('Error in POST /api/tasks:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create task' },
      { status: 500 }
    );
  }
}
```

### Step 8: Update Layout to Include AuthProvider

**File:** `app/layout.tsx`

```typescript
import { AuthProvider } from '@/lib/auth-context';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

### Step 9: Add Auth Guard to Main Page

**File:** `app/page.tsx` - Add at the beginning:

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // ... rest of your existing page component
}
```

### Step 10: Update Store to Include Auth Token

**File:** `lib/store.ts` - Modify API calls:

```typescript
// Add this helper at the top
let getAuthTokenFn: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(fn: () => Promise<string | null>) {
  getAuthTokenFn = fn;
}

// Update fetch calls to include auth header
const loadTasks = async () => {
  const token = getAuthTokenFn ? await getAuthTokenFn() : null;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch('/api/tasks', { headers });
  // ... rest of the code
};
```

Then in `app/page.tsx`, set the token getter:

```typescript
import { setAuthTokenGetter } from '@/lib/store';

// Inside component
const { getIdToken } = useAuth();

useEffect(() => {
  setAuthTokenGetter(getIdToken);
}, [getIdToken]);
```

## Testing Checklist

- [ ] User can sign up with email/password
- [ ] User can sign in with email/password
- [ ] User can sign in with Google
- [ ] User can sign out
- [ ] Tasks are filtered by logged-in user
- [ ] New tasks have user email in Notion
- [ ] Different users see different tasks
- [ ] Protected routes redirect to login when not authenticated

## Deployment Notes

When deploying to Vercel:
1. Add all environment variables to Vercel project settings
2. Ensure FIREBASE_PRIVATE_KEY has proper line breaks (`\n`)
3. Add your deployment URL to Firebase authorized domains
4. Test authentication flow in production

