
import type { JWTPayload } from 'jose';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

const secretKey = process.env.AUTH_SECRET;
if (!secretKey) {
  throw new Error('AUTH_SECRET environment variable is not set');
}
const key = new TextEncoder().encode(secretKey);

export interface UserSessionPayload extends JWTPayload {
  userId: string; // GitHub user ID
  name: string; // GitHub login (username)
  email: string; // GitHub primary verified email
  accessToken: string; // GitHub Personal Access Token
}

export async function encrypt(payload: UserSessionPayload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h') // Token valid for 1 hour
    .sign(key);
}

export async function decrypt(input: string): Promise<UserSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(input, key, {
      algorithms: ['HS256'],
    });
    return payload as UserSessionPayload;
  } catch (e) {
    console.error('JWT verification failed:', e);
    return null;
  }
}

export async function createSession(sessionData: UserSessionPayload) {
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
  const session = await encrypt(sessionData);

  cookies().set('session', session, { expires, httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/' });
}

export async function getSession(): Promise<UserSessionPayload | null> {
  const cookie = cookies().get('session')?.value;
  if (!cookie) return null;
  const decryptedSession = await decrypt(cookie);
  // Ensure the decrypted session conforms to UserSessionPayload, especially the 'user' object structure.
  // For this PAT-based auth, the top-level payload IS the user session data.
  if (decryptedSession && decryptedSession.userId && decryptedSession.accessToken) {
    return decryptedSession;
  }
  return null;
}

export async function deleteSession() {
  cookies().delete('session');
}

export async function updateSession(request: NextRequest): Promise<NextResponse | undefined> {
    const sessionCookieValue = request.cookies.get('session')?.value;
    if (!sessionCookieValue) return;
  
    const parsed = await decrypt(sessionCookieValue);
    if (parsed) {
        // Re-encrypt to reset expiration, effectively "touching" the session
        const newEncryptedSession = await encrypt(parsed);
        
        // Create a new response to set the cookie, copying relevant request properties if needed
        const response = NextResponse.next({
            request: { // This ensures request headers are copied to the new response if needed
                headers: request.headers,
            },
        });
        
        response.cookies.set({
            name: 'session',
            value: newEncryptedSession,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
            path: '/',
        });
        return response; // Return the response with the updated cookie
    }
    // If session couldn't be parsed, return undefined. Middleware will handle creating a basic response.
    return;
}

// Helper for API routes or server components that need the raw request
export async function getSessionFromRequest(req: NextRequest): Promise<UserSessionPayload | null> {
  const cookie = req.cookies.get('session')?.value;
  if (!cookie) return null;
  const decryptedSession = await decrypt(cookie);
   if (decryptedSession && decryptedSession.userId && decryptedSession.accessToken) {
    return decryptedSession;
  }
  return null;
}

