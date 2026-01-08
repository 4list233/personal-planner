'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInWithPopup
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  // canonical method names
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  // aliases used by UI (for backward compatibility)
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!auth) {
      setError(new Error('Firebase auth not initialized'));
      setLoading(false);
      return;
    }

    try {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          setUser(user);
          setLoading(false);
        },
        (err) => {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      );
      return unsubscribe;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase auth not initialized');
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase auth not initialized');
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const signInWithGoogle = async () => {
    if (!auth || !googleProvider) throw new Error('Firebase auth not initialized');
    await signInWithPopup(auth, googleProvider);
  };

  const signOut = async () => {
    if (!auth) throw new Error('Firebase auth not initialized');
    await firebaseSignOut(auth);
  };

  const getIdToken = async (): Promise<string> => {
    if (!user) {
      throw new Error('No user logged in');
    }
    return user.getIdToken();
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    // provide aliases matching the login page
    signInWithEmail: signIn,
    signUpWithEmail: signUp,
    signInWithGoogle,
    signOut,
    getIdToken,
  };

  if (error) {
    return (
      <div style={{ 
        padding: '2rem', 
        maxWidth: '600px', 
        margin: '2rem auto',
        backgroundColor: '#fee',
        border: '1px solid #c33',
        borderRadius: '8px'
      }}>
        <h2 style={{ color: '#c33', marginTop: 0 }}>⚠️ Configuration Error</h2>
        <p><strong>Firebase authentication could not initialize.</strong></p>
        <p style={{ fontSize: '14px', color: '#666' }}>{error.message}</p>
        <details style={{ marginTop: '1rem', fontSize: '14px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Troubleshooting</summary>
          <ul style={{ marginTop: '0.5rem' }}>
            <li>Ensure Firebase environment variables are set in your deployment platform</li>
            <li>Check that <code>www.forestli.me</code> is added to Firebase authorized domains</li>
            <li>Verify all NEXT_PUBLIC_FIREBASE_* variables are correct</li>
            <li>Try clearing your browser cache and reloading</li>
          </ul>
        </details>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
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
