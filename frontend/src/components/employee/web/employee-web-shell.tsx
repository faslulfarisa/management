import { EmployeeWebSidebar } from './employee-web-sidebar';
import { BottomNav } from '@/components/employee/layout/bottom-nav';

export function EmployeeWebShell({ children }: { children: React.ReactNode }) {
  return (
    /*
     * Outer wrapper:
     *   Mobile  — natural height, allows page scroll
     *   Desktop — h-screen + overflow-hidden so sidebar and content
     *             each scroll independently inside the fixed viewport
     */
    <div className="flex min-h-[100dvh] md:h-screen md:overflow-hidden">
      {/*
       * Sidebar — desktop only.
       * sticky + h-full lets it scroll internally if nav overflows
       * while staying pinned to the left edge.
       */}
      <EmployeeWebSidebar />

      {/*
       * Content column:
       *   Mobile  — max-w-lg, centred, bordered, natural scroll
       *   Desktop — fills remaining width, bg-gray-50, independent scroll
       */}
      <div
        className={[
          'flex flex-1 flex-col min-w-0',
          // ── mobile ──────────────────────────────────────
          'max-md:max-w-lg max-md:mx-auto',
          'max-md:bg-background max-md:border-x max-md:border-border max-md:shadow-sm',
          // ── desktop ─────────────────────────────────────
          'md:overflow-y-auto md:bg-gray-50',
        ].join(' ')}
      >
        {/* pb-20 clears the fixed BottomNav on mobile; removed on desktop */}
        <main className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
      </div>

      {/* BottomNav has md:hidden baked in */}
      <BottomNav />
    </div>
  );
}
