import { NextResponse } from 'next/server';

// Prevent search engine indexing of the demo.
export function GET() {
  return new NextResponse('User-agent: *\nDisallow: /', {
    headers: { 'content-type': 'text/plain' },
  });
}
