
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getSessionFromRequest, updateSession, UserSessionPayload } from '@/lib/auth'; 

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const session = await getSessionFromRequest(request);

  const isAuthPage = pathname.startsWith('/login'); // API routes for auth are not typically protected by this middleware directly

  if (isAuthPage) {
    if (session) {
      if (pathname.startsWith('/login')) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect_to', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // If session exists, attempt to update it (refresh expiration)
  // updateSession now returns a NextResponse or undefined.
  const responseWithUpdatedSession = await updateSession(request);
  return responseWithUpdatedSession || NextResponse.next({ request }); // Ensure request headers are passed if NextResponse.next() is called
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images (public images folder)
     * - api/genkit (Genkit API routes)
     */
    '/((?!_next/static|_next/image|favicon.ico|images|api/genkit).*)',
  ],
};
