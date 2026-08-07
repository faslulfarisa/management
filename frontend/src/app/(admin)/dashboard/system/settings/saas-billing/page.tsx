'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Check, Loader2 } from 'lucide-react';

export default function SaaSBillingPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  
  const [subscription, setSubscription] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ total_paid: 0, total_pending: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('calculator');

  // Calculator State
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [billingCycle, setBillingCycle] = useState<'monthly'|'yearly'>('monthly');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [resourceQuantities, setResourceQuantities] = useState<Record<string, number>>({});
  const [calculatedPrice, setCalculatedPrice] = useState<any>(null);
  const [calculating, setCalculating] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [plansRes, modRes, featRes, resRes, subRes, invRes, sumRes] = await Promise.all([
        api.get('/billing/plans'),
        api.get('/billing/modules'),
        api.get('/billing/features'),
        api.get('/billing/resources'),
        api.get('/billing/subscription'),
        api.get('/billing/invoices'),
        api.get('/billing/summary'),
      ]);
      setPlans(plansRes.data.data);
      setModules(modRes.data.data);
      setFeatures(featRes.data.data);
      setResources(resRes.data.data);
      
      setSubscription(subRes.data.data);
      setInvoices(invRes.data.data);
      setSummary(sumRes.data.data);
      
      if (plansRes.data.data.length > 0 && !selectedPlan) {
        setSelectedPlan(plansRes.data.data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch billing:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (!selectedPlan) return;
    const calculate = async () => {
      setCalculating(true);
      try {
        const res = await api.post('/billing/calculate-price', {
          plan_id: selectedPlan,
          billing_cycle: billingCycle,
          selected_modules: selectedModules,
          selected_features: selectedFeatures,
          resource_quantities: resourceQuantities
        });
        setCalculatedPrice(res.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setCalculating(false);
      }
    };
    // Debounce slightly
    const t = setTimeout(calculate, 300);
    return () => clearTimeout(t);
  }, [selectedPlan, billingCycle, selectedModules, selectedFeatures, resourceQuantities]);

  const handleSubscribe = async () => {
    if (!confirm(`Confirm subscription upgrade?`)) return;
    try {
      await api.post('/billing/subscribe', { 
        plan_id: selectedPlan, 
        billing_cycle: billingCycle,
        selected_modules: selectedModules,
        selected_features: selectedFeatures,
        resource_quantities: resourceQuantities
      });
      fetchData();
      setActiveTab('subscription');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to subscribe');
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel your subscription?')) return;
    try {
      await api.post('/billing/cancel');
      fetchData();
    } catch (err) {
      alert('Failed to cancel');
    }
  };

  const handlePayInvoice = async (id: string) => {
    try {
      await api.post(`/billing/invoices/${id}/pay`, { payment_method: 'manual' });
      fetchData();
    } catch (err) {
      alert('Failed to pay');
    }
  };

  const toggleModule = (id: string) => {
    setSelectedModules(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleFeature = (id: string) => {
    setSelectedFeatures(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const setResourceQty = (id: string, qty: number) => {
    setResourceQuantities(prev => ({ ...prev, [id]: qty }));
  };

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-blue-100 text-blue-800',
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Billing & Subscriptions</h1>
          <p className="text-muted-foreground">Manage your modular SaaS subscription</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Paid</p>
            <p className="text-2xl font-bold">₹{parseFloat(summary.total_paid).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending Invoices</p>
            <p className="text-2xl font-bold">₹{parseFloat(summary.total_pending).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Current Plan</p>
            <p className="text-lg font-medium">{subscription?.plan_name || 'Free / No subscription'}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 bg-muted p-1 rounded-lg w-fit">
        <Button variant={activeTab === 'calculator' ? 'default' : 'ghost'} onClick={() => setActiveTab('calculator')}>Subscription Builder</Button>
        <Button variant={activeTab === 'subscription' ? 'default' : 'ghost'} onClick={() => setActiveTab('subscription')}>My Subscription</Button>
        <Button variant={activeTab === 'invoices' ? 'default' : 'ghost'} onClick={() => setActiveTab('invoices')}>Invoices</Button>
      </div>

      {activeTab === 'calculator' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>1. Select Base Plan</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {plans.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => setSelectedPlan(p.id)}
                    className={`border rounded-xl p-4 cursor-pointer transition-all ${selectedPlan === p.id ? 'border-primary ring-1 ring-primary bg-primary/5' : 'hover:border-primary/50'}`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-bold text-lg">{p.name}</h3>
                      {selectedPlan === p.id && <Check className="w-5 h-5 text-primary" />}
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">{p.description}</p>
                    <p className="font-semibold text-xl">₹{billingCycle === 'yearly' ? p.price_yearly : p.price_monthly} <span className="text-sm font-normal text-muted-foreground">/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span></p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>2. Select Add-on Modules</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {modules.map(m => (
                  <label key={m.id} className={`flex items-center gap-4 p-4 border rounded-xl cursor-pointer ${selectedModules.includes(m.id) ? 'border-primary bg-primary/5' : ''}`}>
                    <input type="checkbox" checked={selectedModules.includes(m.id)} onChange={() => toggleModule(m.id)} className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary" />
                    <div className="flex-1">
                      <p className="font-medium">{m.name}</p>
                      <p className="text-sm text-muted-foreground">{m.description}</p>
                    </div>
                    <div className="text-right font-medium">
                      +₹{billingCycle === 'yearly' ? m.price_yearly : m.price_monthly} /{billingCycle === 'yearly' ? 'yr' : 'mo'}
                    </div>
                  </label>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>3. Add Extra Resources</CardTitle><p className="text-sm text-muted-foreground">Scale limits beyond what your base plan includes.</p></CardHeader>
              <CardContent className="space-y-6">
                {resources.map(r => (
                  <div key={r.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-sm text-muted-foreground">₹{billingCycle === 'yearly' ? r.price_per_unit_yearly : r.price_per_unit_monthly} / {r.unit_name} / {billingCycle === 'yearly' ? 'yr' : 'mo'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <input 
                        type="number" 
                        min="0"
                        value={resourceQuantities[r.id] || 0} 
                        onChange={(e) => setResourceQty(r.id, parseInt(e.target.value) || 0)}
                        className="w-20 px-3 py-1.5 border rounded-lg text-center"
                      />
                      <span className="text-sm text-muted-foreground w-16">Units</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle>Summary</CardTitle>
                <div className="flex bg-muted p-1 rounded-lg w-full mt-4">
                  <Button size="sm" className="flex-1" variant={billingCycle === 'monthly' ? 'default' : 'ghost'} onClick={() => setBillingCycle('monthly')}>Monthly</Button>
                  <Button size="sm" className="flex-1" variant={billingCycle === 'yearly' ? 'default' : 'ghost'} onClick={() => setBillingCycle('yearly')}>Yearly</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {calculating ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Calculating...
                  </div>
                ) : calculatedPrice ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Base Plan</span>
                      <span className="font-medium">₹{calculatedPrice.basePrice}</span>
                    </div>
                    {calculatedPrice.breakdown?.modules?.map((m: any) => (
                      <div key={m.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">+ {m.name}</span>
                        <span className="font-medium">₹{m.cost}</span>
                      </div>
                    ))}
                    {calculatedPrice.breakdown?.resources?.map((r: any) => (
                      <div key={r.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">+ {r.billableUnits} {r.name}</span>
                        <span className="font-medium">₹{r.cost}</span>
                      </div>
                    ))}
                    
                    {calculatedPrice.discountAmount > 0 && (
                      <div className="flex justify-between text-sm text-green-600 font-medium pt-2">
                        <span>Discount</span>
                        <span>-₹{calculatedPrice.discountAmount}</span>
                      </div>
                    )}
                    
                    <div className="border-t pt-4 mt-4 flex justify-between items-center">
                      <span className="font-bold text-lg">Total</span>
                      <span className="font-bold text-2xl text-primary">₹{calculatedPrice.total}</span>
                    </div>
                    
                    <Button className="w-full mt-6" size="lg" onClick={handleSubscribe}>
                      Checkout & Subscribe
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center">Select a plan to calculate price</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'subscription' && (
        <Card>
          <CardHeader><CardTitle>My Subscription Details</CardTitle></CardHeader>
          <CardContent>
            {subscription ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold">{subscription.plan_name}</p>
                    <p className="text-sm text-muted-foreground capitalize">{subscription.billing_cycle} billing • ₹{subscription.amount}/period</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm ${statusColors[subscription.status] || 'bg-gray-100'}`}>
                    {subscription.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                  <div>
                    <p className="text-muted-foreground">Period Start</p>
                    <p className="font-medium">{new Date(subscription.current_period_start).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Period End</p>
                    <p className="font-medium">{new Date(subscription.current_period_end).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Next Billing</p>
                    <p className="font-medium">{new Date(subscription.next_billing_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Auto Renew</p>
                    <p className="font-medium">{subscription.auto_renew ? 'Yes' : 'No'}</p>
                  </div>
                </div>
                
                {subscription.is_custom_pricing && (
                  <div className="mt-4 p-4 bg-amber-50 text-amber-800 rounded-lg border border-amber-200 text-sm">
                    <strong>Custom Enterprise Pricing:</strong> Your organization has a custom negotiated rate. 
                  </div>
                )}
                
                {subscription.status === 'active' && (
                  <div className="pt-4 border-t mt-4 flex gap-4">
                    <Button variant="outline" onClick={() => setActiveTab('calculator')}>Modify Subscription</Button>
                    <Button variant="destructive" onClick={handleCancel}>Cancel Subscription</Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">You are currently on the default Free plan.</p>
                <Button onClick={() => setActiveTab('calculator')}>Upgrade Plan</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'invoices' && (
        <Card>
          <CardHeader><CardTitle>Invoices & Transactions</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8">Loading...</p>
            ) : invoices.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No invoices found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Tax</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono">{inv.invoice_number}</TableCell>
                      <TableCell>₹{parseFloat(inv.amount).toLocaleString('en-IN')}</TableCell>
                      <TableCell>₹{parseFloat(inv.tax_amount).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="font-medium">₹{parseFloat(inv.total_amount).toLocaleString('en-IN')}</TableCell>
                      <TableCell>{new Date(inv.due_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[inv.status] || 'bg-gray-100'}`}>
                          {inv.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {inv.status === 'pending' && (
                          <Button size="sm" onClick={() => handlePayInvoice(inv.id)}>Pay Now</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
