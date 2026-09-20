import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink px-6 text-center">
      <p className="text-6xl font-display text-accent">404</p>
      <p className="text-lg text-white">Page not found</p>
      <Link href="/" className="mt-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-ink">
        Back to catalog
      </Link>
    </div>
  );
}
