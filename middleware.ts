import { NextRequest, NextResponse } from 'next/server';
import { verifyJwt, SESSION_COOKIE_NAME } from './src/lib/jwt';
import { isRouteAllowedForRole, getRoleDefaultRoute } from './src/lib/rbac';

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api routes (/api/*)
     * - static files (_next/static, _next/image, favicon.ico, etc.)
     * - public files (sw.js, manifest.json, etc.)
     */
    '/dashboard/:path*',
    '/leads/:path*',
    '/quotes/:path*',
    '/orders/:path*',
    '/inventory/:path*',
    '/dispatch/:path*',
    '/service/:path*',
    '/analytics/:path*',
    '/settings/:path*',
    '/schedule/:path*',
    '/purchasing/:path*',
    '/accounts/:path*',
    '/tech/:path*',
  ],
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Extract session token from cookie
  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    // Unauthenticated: redirect to /login with redirect parameter
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Verify JWT signature & expiration
  const payload = verifyJwt(sessionCookie);
  if (!payload) {
    // Invalid or expired token: clear cookie and redirect to login
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // 3. Enforce Role-Based Access Control (Spec 2.6 & D13)
  const isAllowed = isRouteAllowedForRole(payload.role, pathname);
  if (!isAllowed) {
    // Role not authorized for this section
    // Redirect to the default landing route for their role
    const defaultRoute = getRoleDefaultRoute(payload.role);
    const redirectUrl = new URL(defaultRoute, req.url);
    return NextResponse.redirect(redirectUrl);
  }

  // 4. Pass authenticated user information via downstream request headers
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-user-id', payload.userId);
  requestHeaders.set('x-user-email', payload.email);
  requestHeaders.set('x-user-name', payload.name);
  requestHeaders.set('x-user-role', payload.role);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}
