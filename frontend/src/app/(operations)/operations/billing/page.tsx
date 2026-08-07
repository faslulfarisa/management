'use client';

import { useState } from 'react';
import PlansTab from './PlansTab';
import ResourcesTab from './ResourcesTab';
import { Layers, Receipt } from 'lucide-react';

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState<'plans' | 'resources'>('plans');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing & Plans</h1>
        <p className="text-muted-foreground">Define platform-wide modular pricing components</p>
      </div>

      <div className="flex gap-2 border-b border-border">
        <button 
          onClick={() => setActiveTab('plans')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'plans' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <Receipt className="w-4 h-4" /> Base Plans
        </button>
        <button 
          onClick={() => setActiveTab('resources')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'resources' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <Layers className="w-4 h-4" /> Resources
        </button>
      </div>

      <div className="pt-2">
        {activeTab === 'plans' && <PlansTab />}
        {activeTab === 'resources' && <ResourcesTab />}
      </div>
    </div>
  );
}
