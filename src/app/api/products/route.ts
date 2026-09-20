import { NextResponse } from 'next/server';
import { listProducts } from '@/lib/products/repository';

export const dynamic = 'force-dynamic';

/**
 * GET /api/products — returns the catalog.
 *
 * Note: the API surface intentionally exposes no upload endpoints.
 * Any POST/PUT/PATCH/DELETE returns 405 with a message that reminds
 * integrators that the try-on system does not accept camera data.
 */
export async function GET() {
  const products = listProducts();
  return NextResponse.json(
    { products },
    {
      headers: {
        'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    },
  );
}

function rejectUpload(): NextResponse {
  return NextResponse.json(
    {
      error: 'method_not_allowed',
      message:
        'This backend does not accept uploads. Camera and body data are processed on-device only.',
    },
    { status: 405, headers: { allow: 'GET' } },
  );
}

export const POST = rejectUpload;
export const PUT = rejectUpload;
export const PATCH = rejectUpload;
export const DELETE = rejectUpload;
