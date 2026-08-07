'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/currency';
import api from '@/lib/api';
import { organizationChangeRequestApi, type OrganizationChangeRequest } from '@/lib/organization-registration-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import PhoneNumberInput from '@/components/forms/PhoneNumberInput';
import { AlertCircle, Building2, Check, Loader2, Send } from 'lucide-react';

const COMPANY_TYPES = [
  'Private Limited',
  'Public Limited',
  'LLP',
  'Partnership',
  'Sole Proprietorship',
  'NGO / Non-Profit',
  'Government',
  'Other',
];

export default function SaaSBillingPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);

  const [subscription, setSubscription] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ total_paid: 0, total_pending: 0 });
  const [organizationRequests, setOrganizationRequests] = useState<OrganizationChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('calculator');
  const [currency, setCurrency] = useState('INR');
  const [currencySymbol, setCurrencySymbol] = useState('₹');

  // Calculator State
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [resourceQuantities, setResourceQuantities] = useState<Record<string, number>>({});
  const [calculatedPrice, setCalculatedPrice] = useState<any>(null);
  const [calculating, setCalculating] = useState(false);
  const [orgRequestForm, setOrgRequestForm] = useState({
    organizationName: '',
    companyType: '',
    registrationNumber: '',
    gstin: '',
    panNumber: '',
    phoneNumber: '',
    estimatedBranchCount: '',
    estimatedEmployeeCount: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    otherDetails: '',
    reason: '',
  });
  const [submittingOrgRequest, setSubmittingOrgRequest] = useState(false);
  const [orgRequestError, setOrgRequestError] = useState('');
  const [orgRequestErrors, setOrgRequestErrors] = useState<Record<string, string>>({});
  const [orgRequestMessage, setOrgRequestMessage] = useState('');
  const [showOrgRequestModal, setShowOrgRequestModal] = useState(false);
  const [requestResponseNotes, setRequestResponseNotes] = useState<Record<string, string>>({});
  const [requestResponseFiles, setRequestResponseFiles] = useState<Record<string, File[]>>({});
  const [submittingResponseId, setSubmittingResponseId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [plansRes, modRes, featRes, resRes, subRes, invRes, sumRes, orgReqRes] = await Promise.allSettled([
        api.get('/billing/plans'),
        api.get('/billing/modules'),
        api.get('/billing/features'),
        api.get('/billing/resources'),
        api.get('/billing/subscription'),
        api.get('/billing/invoices'),
        api.get('/billing/summary'),
        organizationChangeRequestApi.listMine(),
      ]);

      const dataFrom = <T,>(result: PromiseSettledResult<any>, fallback: T): T =>
        result.status === 'fulfilled' ? (result.value.data?.data ?? fallback) : fallback;

      const nextPlans = dataFrom<any[]>(plansRes, []);
      setPlans(nextPlans);
      setModules(dataFrom<any[]>(modRes, []));
      setFeatures(dataFrom<any[]>(featRes, []));
      setResources(dataFrom<any[]>(resRes, []));

      setSubscription(dataFrom<any | null>(subRes, null));
      if (subRes.status === 'fulfilled') {
        const subBody = subRes.value.data;
        const curCode = subBody?.meta?.currency || 'INR';
        const curSym = subBody?.meta?.currency_symbol || '₹';
        setCurrency(curCode);
        setCurrencySymbol(curSym);
      }
      setInvoices(dataFrom<any[]>(invRes, []));
      setSummary(dataFrom<any>(sumRes, { total_paid: 0, total_pending: 0 }));
      setOrganizationRequests(orgReqRes.status === 'fulfilled' ? orgReqRes.value : []);

      if (nextPlans.length > 0 && !selectedPlan) {
        setSelectedPlan(nextPlans[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch billing:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  useEffect(() => {
    const hasActivePending = organizationRequests.some(
      (r) => (r.changes?.requestType === 'plan_upgrade' || r.changes?.additionalOrganization) &&
             (r.status === 'pending' || r.status === 'documents_requested')
    );
    if (!hasActivePending) return;

    const interval = setInterval(() => {
      fetchData();
    }, 5000);

    return () => clearInterval(interval);
  }, [organizationRequests]);

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
      alert(err.response?.data?.message || err.response?.data?.error?.message || 'Failed to subscribe');
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

  const setOrgRequestField = (field: keyof typeof orgRequestForm, value: string) => {
    setOrgRequestForm((current) => ({ ...current, [field]: value }));
    setOrgRequestError('');
    setOrgRequestErrors((current) => ({ ...current, [field]: '' }));
    setOrgRequestMessage('');
  };

  const handleAdditionalOrganizationRequest = async () => {
    const errors: Record<string, string> = {};

    const orgName = orgRequestForm.organizationName.trim();
    if (!orgName) {
      errors.organizationName = 'Organization name is required.';
    } else if (!/^[a-zA-Z0-9\s&.-]+$/.test(orgName)) {
      errors.organizationName = 'Organization name contains invalid characters.';
    }

    if (!orgRequestForm.companyType.trim()) {
      errors.companyType = 'Company type is required.';
    }
    
    const regNum = orgRequestForm.registrationNumber.trim();
    if (!regNum) {
      errors.registrationNumber = 'Registration number is required.';
    } else if (!/^[A-Za-z0-9-]+$/.test(regNum)) {
      errors.registrationNumber = 'Registration number format is invalid.';
    }

    const gstin = orgRequestForm.gstin.trim().toUpperCase();
    if (!gstin) {
      errors.gstin = 'GST Number is required.';
    } else if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
      errors.gstin = 'Invalid GST Number format.';
    }

    const pan = orgRequestForm.panNumber.trim().toUpperCase();
    if (!pan) {
      errors.panNumber = 'PAN Number is required.';
    } else if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) {
      errors.panNumber = 'Invalid PAN Number format.';
    }

    if (!orgRequestForm.phoneNumber.trim()) {
      errors.phoneNumber = 'Organization phone is required.';
    } else if (!/^\+[1-9]\d{5,14}$/.test(orgRequestForm.phoneNumber.trim())) {
      errors.phoneNumber = 'Organization phone is invalid.';
    }
    const estimatedBranchCount = orgRequestForm.estimatedBranchCount.trim()
      ? Number(orgRequestForm.estimatedBranchCount)
      : undefined;
    const estimatedEmployeeCount = orgRequestForm.estimatedEmployeeCount.trim()
      ? Number(orgRequestForm.estimatedEmployeeCount)
      : undefined;
    if (estimatedBranchCount !== undefined && (!Number.isInteger(estimatedBranchCount) || estimatedBranchCount < 0)) {
      errors.estimatedBranchCount = 'Number of branches must be a whole number.';
    }
    if (estimatedEmployeeCount !== undefined && (!Number.isInteger(estimatedEmployeeCount) || estimatedEmployeeCount < 0)) {
      errors.estimatedEmployeeCount = 'Number of employees must be a whole number.';
    }
    const contactName = orgRequestForm.contactName.trim();
    if (!contactName) {
      errors.contactName = 'Contact name is required.';
    } else if (!/^[a-zA-Z\s.\-']{2,50}$/.test(contactName)) {
      errors.contactName = 'Contact name contains invalid characters.';
    }

    if (!orgRequestForm.contactEmail.trim()) {
      errors.contactEmail = 'Contact email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orgRequestForm.contactEmail.trim())) {
      errors.contactEmail = 'Contact email must be valid.';
    }

    if (!orgRequestForm.contactPhone.trim()) {
      errors.contactPhone = 'Contact phone is required.';
    } else if (!/^\+[1-9]\d{5,14}$/.test(orgRequestForm.contactPhone.trim())) {
      errors.contactPhone = 'Contact phone is invalid.';
    }

    if (orgRequestForm.reason.trim().length < 10) {
      errors.reason = 'Please provide a reason of at least 10 characters.';
    }

    if (Object.keys(errors).length > 0) {
      setOrgRequestErrors(errors);
      return;
    }

    setSubmittingOrgRequest(true);
    setOrgRequestError('');
    setOrgRequestErrors({});
    setOrgRequestMessage('');
    try {
      await organizationChangeRequestApi.create({
        requestType: 'additional_organization',
        organizationName: orgRequestForm.organizationName.trim(),
        companyType: orgRequestForm.companyType.trim() || undefined,
        registrationNumber: orgRequestForm.registrationNumber.trim() || undefined,
        gstin: orgRequestForm.gstin.trim() || undefined,
        panNumber: orgRequestForm.panNumber.trim() || undefined,
        phoneNumber: orgRequestForm.phoneNumber.trim() || undefined,
        estimatedBranchCount,
        estimatedEmployeeCount,
        contactName: orgRequestForm.contactName.trim() || undefined,
        contactEmail: orgRequestForm.contactEmail.trim() || undefined,
        contactPhone: orgRequestForm.contactPhone.trim() || undefined,
        otherDetails: orgRequestForm.otherDetails.trim() || undefined,
        reason: orgRequestForm.reason.trim(),
      });
      setOrgRequestForm({
        organizationName: '',
        companyType: '',
        registrationNumber: '',
        gstin: '',
        panNumber: '',
        phoneNumber: '',
        estimatedBranchCount: '',
        estimatedEmployeeCount: '',
        contactName: '',
        contactEmail: '',
        contactPhone: '',
        otherDetails: '',
        reason: '',
      });
      setOrgRequestMessage('Request sent successfully.');
      setShowOrgRequestModal(false);
      organizationChangeRequestApi.listMine().then(setOrganizationRequests).catch(() => { });
    } catch (err: any) {
      setOrgRequestError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to send request.');
    } finally {
      setSubmittingOrgRequest(false);
    }
  };

  const handleSubmitRequestResponse = async (request: OrganizationChangeRequest) => {
    const notes = requestResponseNotes[request.id]?.trim() || '';
    const files = requestResponseFiles[request.id] ?? [];
    if (!notes && files.length === 0) {
      setOrgRequestError('Add extra information or attach at least one document.');
      return;
    }

    setSubmittingResponseId(request.id);
    setOrgRequestError('');
    setOrgRequestMessage('');
    try {
      const documents = [];
      for (const file of files) {
        documents.push(await organizationChangeRequestApi.uploadSupportingDocument(request.id, file));
      }
      await organizationChangeRequestApi.respond(request.id, { notes: notes || undefined, documents });
      setOrgRequestMessage('Response submitted successfully.');
      setRequestResponseNotes((current) => ({ ...current, [request.id]: '' }));
      setRequestResponseFiles((current) => ({ ...current, [request.id]: [] }));
      organizationChangeRequestApi.listMine().then(setOrganizationRequests).catch(() => {});
    } catch (err: any) {
      setOrgRequestError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to submit response.');
    } finally {
      setSubmittingResponseId(null);
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

  const pendingRequests = organizationRequests.filter((request) => 
    !!request.changes.additionalOrganization || request.changes?.requestType === 'plan_upgrade'
  );
  const orgRequestStatusClasses: Record<OrganizationChangeRequest['status'], string> = {
    pending: 'bg-amber-100 text-amber-700',
    documents_requested: 'bg-orange-100 text-orange-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
  };
  const orgRequestStatusLabels: Record<OrganizationChangeRequest['status'], string> = {
    pending: 'Pending Review',
    documents_requested: 'Documents / Info Requested',
    approved: 'Approved',
    rejected: 'Rejected',
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
            <p className="text-2xl font-bold">{formatCurrency(parseFloat(summary.total_paid), currency, { maximumFractionDigits: 0 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending Invoices</p>
            <p className="text-2xl font-bold">{formatCurrency(parseFloat(summary.total_pending), currency, { maximumFractionDigits: 0 })}</p>
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
                {plans.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No base plans are available right now.</p>
                ) : plans.map(p => (
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
                    <p className="font-semibold text-xl">{formatCurrency(billingCycle === 'yearly' ? p.price_yearly : p.price_monthly, currency, { maximumFractionDigits: 0 })} <span className="text-sm font-normal text-muted-foreground">/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span></p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>2. Select Add-on Modules</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {modules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No add-on modules are available right now.</p>
                ) : modules.map(m => (
                  <label key={m.id} className={`flex items-center gap-4 p-4 border rounded-xl cursor-pointer ${selectedModules.includes(m.id) ? 'border-primary bg-primary/5' : ''}`}>
                    <input type="checkbox" checked={selectedModules.includes(m.id)} onChange={() => toggleModule(m.id)} className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary" />
                    <div className="flex-1">
                      <p className="font-medium">{m.name}</p>
                      <p className="text-sm text-muted-foreground">{m.description}</p>
                    </div>
                    <div className="text-right font-medium">
                      +{formatCurrency(billingCycle === 'yearly' ? m.price_yearly : m.price_monthly, currency, { maximumFractionDigits: 0 })} /{billingCycle === 'yearly' ? 'yr' : 'mo'}
                    </div>
                  </label>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>3. Add Extra Resources</CardTitle><p className="text-sm text-muted-foreground">Scale limits beyond what your base plan includes.</p></CardHeader>
              <CardContent className="space-y-6">
                {resources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No extra resources are available right now.</p>
                ) : resources.map(r => (
                  <div key={r.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-sm text-muted-foreground">{formatCurrency(billingCycle === 'yearly' ? r.price_per_unit_yearly : r.price_per_unit_monthly, currency, { maximumFractionDigits: 0 })} / {r.unit_name} / {billingCycle === 'yearly' ? 'yr' : 'mo'}</p>
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
                <div className="pt-2 space-y-2">
                  <Button className="w-full sm:w-auto" variant="outline" onClick={() => setShowOrgRequestModal(true)}>
                    <Building2 className="mr-2 h-4 w-4" />
                    Request Organization
                  </Button>
                  {orgRequestMessage && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                      {orgRequestMessage}
                    </div>
                  )}
                  {orgRequestError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                      {orgRequestError}
                    </div>
                  )}
                  {pendingRequests.length > 0 && (
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <div className="mb-2 text-sm font-semibold text-foreground">My Pending Requests</div>
                      <div className="space-y-2">
                        {pendingRequests.map((request) => {
                          const isOrg = !!request.changes.additionalOrganization;
                          const details = isOrg 
                            ? request.changes.additionalOrganization?.new ?? {}
                            : request.changes;
                          const displayName = isOrg 
                            ? (details.organizationName || 'Additional organization')
                            : `Plan Upgrade: ${details.plan_name || details.plan_id}`;
                          return (
                            <div key={request.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <div className="font-medium text-foreground">{displayName}</div>
                                  <div className="text-xs text-muted-foreground">Submitted {new Date(request.created_at).toLocaleDateString()}</div>
                                </div>
                                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${orgRequestStatusClasses[request.status]}`}>
                                  {orgRequestStatusLabels[request.status]}
                                </span>
                              </div>
                              {request.review_notes && (
                                <div className="mt-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
                                  {request.review_notes}
                                </div>
                              )}
                              {request.status === 'documents_requested' && (
                                <div className="mt-3 space-y-2 rounded-lg border border-orange-200 bg-orange-50/50 p-3">
                                  <textarea
                                    value={requestResponseNotes[request.id] ?? ''}
                                    onChange={(e) => setRequestResponseNotes((current) => ({ ...current, [request.id]: e.target.value }))}
                                    rows={3}
                                    className="w-full resize-none rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    placeholder="Add the requested details for internal staff"
                                  />
                                  <input
                                    type="file"
                                    multiple
                                    onChange={(e) => setRequestResponseFiles((current) => ({ ...current, [request.id]: Array.from(e.target.files ?? []) }))}
                                    className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
                                  />
                                  {!!requestResponseFiles[request.id]?.length && (
                                    <div className="text-xs text-muted-foreground">
                                      {requestResponseFiles[request.id].map((file) => file.name).join(', ')}
                                    </div>
                                  )}
                                  <Button
                                    size="sm"
                                    onClick={() => handleSubmitRequestResponse(request)}
                                    disabled={submittingResponseId === request.id}
                                  >
                                    {submittingResponseId === request.id && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                                    Submit Info / Docs
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
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
                      <span className="font-medium">{formatCurrency(calculatedPrice.basePrice, currency, { maximumFractionDigits: 0 })}</span>
                    </div>
                    {calculatedPrice.breakdown?.modules?.map((m: any) => (
                      <div key={m.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">+ {m.name}</span>
                        <span className="font-medium">{formatCurrency(m.cost, currency, { maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                    {calculatedPrice.breakdown?.resources?.map((r: any) => (
                      <div key={r.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">+ {r.billableUnits} {r.name}</span>
                        <span className="font-medium">{formatCurrency(r.cost, currency, { maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}

                    {calculatedPrice.discountAmount > 0 && (
                      <div className="flex justify-between text-sm text-green-600 font-medium pt-2">
                        <span>Discount</span>
                        <span>-{formatCurrency(calculatedPrice.discountAmount, currency, { maximumFractionDigits: 0 })}</span>
                      </div>
                    )}

                    <div className="border-t pt-4 mt-4 flex justify-between items-center">
                      <span className="font-bold text-lg">Total</span>
                      <span className="font-bold text-2xl text-primary">{formatCurrency(calculatedPrice.total, currency, { maximumFractionDigits: 0 })}</span>
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
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>My Subscription Details</CardTitle></CardHeader>
            <CardContent>
              {subscription ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-bold">{subscription.plan_name}</p>
                      <p className="text-sm text-muted-foreground capitalize">{subscription.billing_cycle} billing • {formatCurrency(subscription.amount, currency, { maximumFractionDigits: 0 })}/period</p>
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

          {pendingRequests.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="mb-2 text-sm font-semibold text-foreground">My Pending Requests</div>
              <div className="space-y-2">
                {pendingRequests.map((request) => {
                  const isOrg = !!request.changes.additionalOrganization;
                  const details = isOrg 
                    ? request.changes.additionalOrganization?.new ?? {}
                    : request.changes;
                  const displayName = isOrg 
                    ? (details.organizationName || 'Additional organization')
                    : `Plan Upgrade: ${details.plan_name || details.plan_id}`;
                  return (
                    <div key={request.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-medium text-foreground">{displayName}</div>
                          <div className="text-xs text-muted-foreground">Submitted {new Date(request.created_at).toLocaleDateString()}</div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${orgRequestStatusClasses[request.status]}`}>
                          {orgRequestStatusLabels[request.status]}
                        </span>
                      </div>
                      {request.review_notes && (
                        <div className="mt-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
                          {request.review_notes}
                        </div>
                      )}
                      {request.status === 'documents_requested' && (
                        <div className="mt-3 space-y-2 rounded-lg border border-orange-200 bg-orange-50/50 p-3">
                          <textarea
                            value={requestResponseNotes[request.id] ?? ''}
                            onChange={(e) => setRequestResponseNotes((current) => ({ ...current, [request.id]: e.target.value }))}
                            rows={3}
                            className="w-full resize-none rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="Add the requested details for internal staff"
                          />
                          <input
                            type="file"
                            multiple
                            onChange={(e) => setRequestResponseFiles((current) => ({ ...current, [request.id]: Array.from(e.target.files ?? []) }))}
                            className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
                          />
                          {!!requestResponseFiles[request.id]?.length && (
                            <div className="text-xs text-muted-foreground">
                              {requestResponseFiles[request.id].map((file) => file.name).join(', ')}
                            </div>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleSubmitRequestResponse(request)}
                            disabled={submittingResponseId === request.id}
                          >
                            {submittingResponseId === request.id && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                            Submit Info / Docs
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
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
                      <TableCell>{formatCurrency(parseFloat(inv.amount), currency, { maximumFractionDigits: 0 })}</TableCell>
                      <TableCell>{formatCurrency(parseFloat(inv.tax_amount), currency, { maximumFractionDigits: 0 })}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(parseFloat(inv.total_amount), currency, { maximumFractionDigits: 0 })}</TableCell>
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

      <Dialog open={showOrgRequestModal} onOpenChange={(open) => {
        setShowOrgRequestModal(open);
        if (!open) {
          setOrgRequestError('');
          setOrgRequestErrors({});
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Organization</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Organization Name *</label>
              <input
                value={orgRequestForm.organizationName}
                onChange={(e) => setOrgRequestField('organizationName', e.target.value)}
                className={`w-full rounded-lg border ${orgRequestErrors.organizationName ? 'border-red-500' : 'border-border'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30`}
                placeholder="New property or company name"
              />
              {orgRequestErrors.organizationName && <p className="text-xs text-red-500">{orgRequestErrors.organizationName}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Company Type *</label>
                <select
                  value={orgRequestForm.companyType}
                  onChange={(e) => setOrgRequestField('companyType', e.target.value)}
                  className={`w-full rounded-lg border ${orgRequestErrors.companyType ? 'border-red-500' : 'border-border'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30`}
                >
                  <option value="">Select company type</option>
                  {COMPANY_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                {orgRequestErrors.companyType && <p className="text-xs text-red-500">{orgRequestErrors.companyType}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Registration Number *</label>
                <input
                  value={orgRequestForm.registrationNumber}
                  onChange={(e) => setOrgRequestField('registrationNumber', e.target.value)}
                  className={`w-full rounded-lg border ${orgRequestErrors.registrationNumber ? 'border-red-500' : 'border-border'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30`}
                />
                {orgRequestErrors.registrationNumber && <p className="text-xs text-red-500">{orgRequestErrors.registrationNumber}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">GST Number *</label>
                <input
                  value={orgRequestForm.gstin}
                  onChange={(e) => setOrgRequestField('gstin', e.target.value.toUpperCase())}
                  className={`w-full rounded-lg border ${orgRequestErrors.gstin ? 'border-red-500' : 'border-border'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30`}
                />
                {orgRequestErrors.gstin && <p className="text-xs text-red-500">{orgRequestErrors.gstin}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">PAN Number *</label>
                <input
                  value={orgRequestForm.panNumber}
                  onChange={(e) => setOrgRequestField('panNumber', e.target.value.toUpperCase())}
                  className={`w-full rounded-lg border ${orgRequestErrors.panNumber ? 'border-red-500' : 'border-border'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30`}
                />
                {orgRequestErrors.panNumber && <p className="text-xs text-red-500">{orgRequestErrors.panNumber}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Organization Phone *</label>
                <div className={orgRequestErrors.phoneNumber ? 'rounded-lg border border-red-500' : ''}>
                  <PhoneNumberInput value={orgRequestForm.phoneNumber} onChange={(value) => setOrgRequestField('phoneNumber', value)} />
                </div>
                {orgRequestErrors.phoneNumber && <p className="text-xs text-red-500">{orgRequestErrors.phoneNumber}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Number of Branches</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={orgRequestForm.estimatedBranchCount}
                  onChange={(e) => setOrgRequestField('estimatedBranchCount', e.target.value)}
                  className={`w-full rounded-lg border ${orgRequestErrors.estimatedBranchCount ? 'border-red-500' : 'border-border'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30`}
                  placeholder="0"
                />
                {orgRequestErrors.estimatedBranchCount && <p className="text-xs text-red-500">{orgRequestErrors.estimatedBranchCount}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Number of Employees</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={orgRequestForm.estimatedEmployeeCount}
                  onChange={(e) => setOrgRequestField('estimatedEmployeeCount', e.target.value)}
                  className={`w-full rounded-lg border ${orgRequestErrors.estimatedEmployeeCount ? 'border-red-500' : 'border-border'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30`}
                  placeholder="0"
                />
                {orgRequestErrors.estimatedEmployeeCount && <p className="text-xs text-red-500">{orgRequestErrors.estimatedEmployeeCount}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Contact Name *</label>
                <input
                  value={orgRequestForm.contactName}
                  onChange={(e) => setOrgRequestField('contactName', e.target.value)}
                  className={`w-full rounded-lg border ${orgRequestErrors.contactName ? 'border-red-500' : 'border-border'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30`}
                />
                {orgRequestErrors.contactName && <p className="text-xs text-red-500">{orgRequestErrors.contactName}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Contact Email *</label>
                <input
                  type="email"
                  value={orgRequestForm.contactEmail}
                  onChange={(e) => setOrgRequestField('contactEmail', e.target.value)}
                  className={`w-full rounded-lg border ${orgRequestErrors.contactEmail ? 'border-red-500' : 'border-border'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30`}
                />
                {orgRequestErrors.contactEmail && <p className="text-xs text-red-500">{orgRequestErrors.contactEmail}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Contact Phone *</label>
                <div className={orgRequestErrors.contactPhone ? 'rounded-lg border border-red-500' : ''}>
                  <PhoneNumberInput value={orgRequestForm.contactPhone} onChange={(value) => setOrgRequestField('contactPhone', value)} />
                </div>
                {orgRequestErrors.contactPhone && <p className="text-xs text-red-500">{orgRequestErrors.contactPhone}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Other Details</label>
              <textarea
                value={orgRequestForm.otherDetails}
                onChange={(e) => setOrgRequestField('otherDetails', e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Billing notes or anything internal staff should know"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Business Reason *</label>
              <textarea
                value={orgRequestForm.reason}
                onChange={(e) => setOrgRequestField('reason', e.target.value)}
                rows={4}
                className={`w-full resize-none rounded-lg border ${orgRequestErrors.reason ? 'border-red-500' : 'border-border'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30`}
                placeholder="Why do you need another organization?"
              />
              {orgRequestErrors.reason && <p className="text-xs text-red-500">{orgRequestErrors.reason}</p>}
            </div>

            {orgRequestError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{orgRequestError}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOrgRequestModal(false)} disabled={submittingOrgRequest}>
              Cancel
            </Button>
            <Button onClick={handleAdditionalOrganizationRequest} disabled={submittingOrgRequest}>
              {submittingOrgRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {submittingOrgRequest ? 'Sending...' : 'Send Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
