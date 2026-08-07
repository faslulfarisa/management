'use client';

import { Clock } from 'lucide-react';

interface ModulePageProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

export default function ModulePage({ title, description }: ModulePageProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>

      <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex flex-col items-center justify-center py-16 px-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mb-5 shadow-lg"
            style={{ background: 'linear-gradient(135deg, hsl(220 65% 46%), hsl(230 70% 58%))' }}
          >
            <Clock className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Coming Soon</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            This module is under active development and will be available in a future release.
            Stay tuned for updates.
          </p>
        </div>
      </div>
    </div>
  );
}
