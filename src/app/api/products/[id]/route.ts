import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products/repository';

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

export async function GET(_req: Request, { params }: Params) {
  const product = getProduct(params.id);
  if (!product) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ product });
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
