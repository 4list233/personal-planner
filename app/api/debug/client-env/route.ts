// Diagnostic endpoint to check if client env vars are available
export const dynamic = 'force-dynamic';

export async function GET() {
  const envVars = {
    hasFirebaseApiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    hasFirebaseAuthDomain: !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    hasFirebaseProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    hasFirebaseAppId: !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    // Show first 4 chars for verification (not security risk)
    apiKeyPrefix: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.substring(0, 4) || 'missing',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'missing',
  };

  return Response.json(envVars);
}
