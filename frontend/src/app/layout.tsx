import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import '@/styles/globals.css';
import { StoreHydration } from '@/components/store-hydration';
import { QueryProvider } from '@/components/query-provider';
import { WebVitalsReporter } from '@/components/web-vitals-reporter';
import { NotificationFocusHighlighter } from '@/components/layout/notification-focus-highlighter';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Ai-HRMS — Workforce Management Platform',
  description: 'AI-powered Human Resource Management System for attendance, payroll, recruitment, and performance.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <QueryProvider>
          <StoreHydration />
          <WebVitalsReporter />
          <Suspense fallback={null}>
            <NotificationFocusHighlighter />
          </Suspense>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
