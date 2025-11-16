// Client-side Firebase configuration (browser only)
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { Auth, getAuth, GoogleAuthProvider } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';

type FirebaseConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

const firebaseConfig: FirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function assertFirebaseConfig(cfg: FirebaseConfig) {
  const missing: string[] = [];
  if (!cfg.apiKey) missing.push('NEXT_PUBLIC_FIREBASE_API_KEY');
  if (!cfg.authDomain) missing.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
  if (!cfg.projectId) missing.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  if (!cfg.appId) missing.push('NEXT_PUBLIC_FIREBASE_APP_ID');

  if (missing.length) {
    const msg = `Firebase config missing env vars: ${missing.join(', ')}. Ensure .env.local is populated and the dev server restarted.`;
    if (typeof window !== 'undefined') {
      // In the browser, throw to make the error visible in UI/network tab
      // This directly surfaces the root cause of auth/api-key-not-valid
      throw new Error(msg);
    } else {
      console.warn(msg);
    }
  }
}

// Initialize Firebase only in browser (prevents SSR/build errors)
let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let googleProvider: GoogleAuthProvider | undefined;

if (typeof window !== 'undefined') {
  // Validate before init (helps avoid confusing auth/api-key-not-valid)
  assertFirebaseConfig(firebaseConfig);
  
  // Initialize Firebase (singleton pattern)
  app = getApps().length === 0 ? initializeApp(firebaseConfig as Required<FirebaseConfig>) : getApp();
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
  
  // Configure Google provider
  googleProvider.setCustomParameters({
    prompt: 'select_account'
  });
}

// Export with non-null assertion since these are only used in client components
export { auth as auth, db as db, googleProvider as googleProvider };
