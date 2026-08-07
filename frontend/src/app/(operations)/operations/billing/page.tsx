'use client';

import { useEffect, useMemo, useState } from 'react';
import PlansTab from './PlansTab';
import ResourcesTab from './ResourcesTab';
import ModulesTab from './ModulesTab';
import InvoicesTab from './InvoicesTab';
import { FileText, Layers, Package, Receipt } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { canOps, OPS_PERMISSIONS } from '@/lib/internal-roles';

type BillingTab = 'plans' | 'modules' | 'resources' | 'invoices';

export default function BillingPage() {
  const { internalRole } = useAuthStore();
  const canManagePlans = canOps(internalRole, OPS_PERMISSIONS.BILLING_MANAGE_PLANS);
  const canViewInvoices = canOps(internalRole, OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS);
  const [activeTab, setActiveTab] = useState<BillingTab>('plans');
  const tabs = useMemo(() => {
    const items: Array<{ key: BillingTab; label: string; icon: typeof Receipt }> = [];
    if (canManagePlans) {
      items.push(
        { key: 'plans', label: 'Base Plans', icon: Receipt },
        { key: 'modules', label: 'Modules', icon: Package },
        { key: 'resources', label: 'Resources', icon: Layers },
      );
    }
    if (canViewInvoices) items.push({ key: 'invoices', label: 'Invoices', icon: FileText });
    return items;
  }, [canManagePlans, canViewInvoices]);

  useEffect(() => {
    if (tabs.length && !tabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(tabs[0].key);
    }
  }, [activeTab, tabs]);

  if (!tabs.length) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-foreground">Billing & Plans</h1>
        <div className="ops-panel p-6 text-sm text-muted-foreground">You do not have access to billing administration.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing & Plans</h1>
        <p className="text-muted-foreground">Define platform-wide modular pricing components</p>
      </div>

      <div className="flex gap-2 border-b border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      <div className="pt-2">
        {activeTab === 'plans' && canManagePlans && <PlansTab />}
        {activeTab === 'modules' && canManagePlans && <ModulesTab />}
        {activeTab === 'resources' && canManagePlans && <ResourcesTab />}
        {activeTab === 'invoices' && canViewInvoices && <InvoicesTab />}
      </div>
    </div>
  );
}
