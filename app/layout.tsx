import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import './tailwind.css';
import '../public/site.css';

export const metadata: Metadata = {
  title: 'ScanServe PH',
  description: 'QR ordering and restaurant operations for Filipino restaurants.',
  icons: { icon: '/logo.svg', apple: '/app-icon-180.png' },
  appleWebApp: { capable: true, title: 'ScanServe PH', statusBarStyle: 'default' }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f7f8fc'
};

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en">
    <body>{children}<Script src="/app.js" type="module" strategy="afterInteractive" /></body>
  </html>;
}
