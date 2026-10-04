import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function unauthorized() {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Senior Trading Analyst"' },
  });
}

export function middleware(request: NextRequest) {
  const username = process.env.APP_ACCESS_USER?.trim();
  const password = process.env.APP_ACCESS_PASSWORD?.trim();

  // Keep the autonomous monitor on its dedicated Bearer-token boundary.
  if (request.nextUrl.pathname.startsWith('/api/monitor/')) {
    return NextResponse.next();
  }

  if (!username || !password) return NextResponse.next();

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Basic ')) return unauthorized();

  try {
    const encoded = authorization.slice('Basic '.length);
    const decoded = atob(encoded);
    const separator = decoded.indexOf(':');
    if (separator < 0) return unauthorized();
    const suppliedUser = decoded.slice(0, separator);
    const suppliedPassword = decoded.slice(separator + 1);

    if (suppliedUser !== username || suppliedPassword !== password) return unauthorized();
    return NextResponse.next();
  } catch {
    return unauthorized();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
