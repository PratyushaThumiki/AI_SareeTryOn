import type { Metadata, Viewport } from 'next';
import './globals.css';
import { NetworkGuard } from '@/components/dev/NetworkGuard';

export const metadata: Metadata = {
  title: 'Virtual Try-On — Privacy-First',
  description:
    'See yourself wearing beautiful sarees — powered entirely on your device. No images are ever uploaded.',
  keywords: ['virtual try-on', 'saree', 'fashion', 'privacy', 'on-device AI'],
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0b0d10',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        {/* Dev-only guard: intercepts network calls for privacy audit. */}
        {process.env.NODE_ENV === 'development' && <NetworkGuard />}
        {children}
      </body>
    </html>
  );
}
