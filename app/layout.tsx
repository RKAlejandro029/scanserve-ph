import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import './tailwind.css';
import '../public/site.css';

export const metadata: Metadata = {
  title: 'ScanServe PH',
  description: 'QR ordering and restaurant operations for Filipino restaurants.',
  icons: '/logo.svg'
};

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en">
    <body>{children}<Script src="/app.js" type="module" strategy="afterInteractive" /></body>
  </html>;
}
