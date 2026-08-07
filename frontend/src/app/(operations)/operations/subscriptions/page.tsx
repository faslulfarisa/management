import { CreditCard } from 'lucide-react';
import { ComingSoonPanel } from '@/components/operations/coming-soon-panel';

export default function SubscriptionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Subscription Management</h1>
        <p className="text-muted-foreground">Manage customer plan assignments and renewals</p>
      </div>
      <ComingSoonPanel
        icon={CreditCard}
        title="Subscription management"
        description="Plan assignment and renewal controls will live here once the billing module's plan data is wired up for Operations."
      />
    </div>
  );
}
