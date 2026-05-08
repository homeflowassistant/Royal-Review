import { useEffect, useMemo, useState } from 'react';
import { Loader2, CreditCard, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getBackendUrl } from '@/lib/backend';
import { Card, SkeletonCard, ErrorState } from '@/components/account/AccountSharedUI';
import { capitalizeCardBrand } from '@/lib/accountManagement.utils';
import {
  inferCardBrand,
  loadPaymentProfile,
  savePaymentProfile,
  type PaymentMethodProfile,
} from '@/lib/paymentProfile';

interface SaaSPlanData {
  customerId: string;
  subscriptionId: string;
  status: string;
  planName: string;
  paymentMethod?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    name: string;
  };
  taxInformation?: {
    taxLabel?: string;
    taxId?: string;
    taxStatus?: string;
  };
  billingInformation?: {
    name?: string;
    email?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
}

interface UpdatePaymentTabProps {
  locationId: string;
}

interface PaymentFormState {
  cardholderName: string;
  cardNumber: string;
  expMonth: string;
  expYear: string;
  cvc: string;
  country: string;
  billingEmail: string;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
}

const EMPTY_FORM: PaymentFormState = {
  cardholderName: '',
  cardNumber: '',
  expMonth: '',
  expYear: '',
  cvc: '',
  country: 'US',
  billingEmail: '',
  billingAddressLine1: '',
  billingAddressLine2: '',
  billingCity: '',
  billingState: '',
  billingPostalCode: '',
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900 mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function PaymentDrawer({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (profile: PaymentMethodProfile) => void;
}) {
  const [form, setForm] = useState<PaymentFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  const handleSubmit = async () => {
    const digits = form.cardNumber.replace(/\D/g, '');

    if (digits.length < 12) {
      toast.error('Enter a valid card number');
      return;
    }

    if (!form.cardholderName.trim()) {
      toast.error('Cardholder name is required');
      return;
    }

    if (!form.expMonth || !form.expYear) {
      toast.error('Expiration date is required');
      return;
    }

    try {
      setSaving(true);
      const profile: PaymentMethodProfile = {
        cardBrand: inferCardBrand(digits),
        last4: digits.slice(-4),
        expMonth: Number(form.expMonth),
        expYear: Number(form.expYear),
        cardholderName: form.cardholderName.trim(),
        billingEmail: form.billingEmail.trim(),
        billingAddressLine1: form.billingAddressLine1.trim(),
        billingAddressLine2: form.billingAddressLine2.trim(),
        billingCity: form.billingCity.trim(),
        billingState: form.billingState.trim(),
        billingPostalCode: form.billingPostalCode.trim(),
        billingCountry: form.country.trim() || 'US',
        taxId: '',
        taxLabel: 'Tax ID',
        taxStatus: 'Not provided',
      };

      onSave(profile);
      toast.success('Payment method updated');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Add New Payment Method</h3>
            <p className="text-sm text-gray-500 mt-1">Provide the card details below</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-700 text-sm font-medium">
            Secure, fast checkout with Link
          </div>

          <Field
            label="Cardholder Name"
            value={form.cardholderName}
            onChange={(value) => setForm((prev) => ({ ...prev, cardholderName: value }))}
            placeholder="Name on card"
          />
          <Field
            label="Card Number"
            value={form.cardNumber}
            onChange={(value) => setForm((prev) => ({ ...prev, cardNumber: value }))}
            placeholder="1234 1234 1234 1234"
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Expiration Month"
              value={form.expMonth}
              onChange={(value) => setForm((prev) => ({ ...prev, expMonth: value }))}
              placeholder="MM"
            />
            <Field
              label="Expiration Year"
              value={form.expYear}
              onChange={(value) => setForm((prev) => ({ ...prev, expYear: value }))}
              placeholder="YYYY"
            />
          </div>
          <Field
            label="Security Code"
            value={form.cvc}
            onChange={(value) => setForm((prev) => ({ ...prev, cvc: value }))}
            placeholder="CVC"
          />
          <Field
            label="Country"
            value={form.country}
            onChange={(value) => setForm((prev) => ({ ...prev, country: value }))}
            placeholder="US"
          />
          <Field
            label="Billing Email"
            value={form.billingEmail}
            onChange={(value) => setForm((prev) => ({ ...prev, billingEmail: value }))}
            placeholder="billing@company.com"
            type="email"
          />
          <Field
            label="Billing Address"
            value={form.billingAddressLine1}
            onChange={(value) => setForm((prev) => ({ ...prev, billingAddressLine1: value }))}
            placeholder="Street address"
          />
          <Field
            label="Address Line 2"
            value={form.billingAddressLine2}
            onChange={(value) => setForm((prev) => ({ ...prev, billingAddressLine2: value }))}
            placeholder="Suite, unit, etc."
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label="City"
              value={form.billingCity}
              onChange={(value) => setForm((prev) => ({ ...prev, billingCity: value }))}
              placeholder="City"
            />
            <Field
              label="State"
              value={form.billingState}
              onChange={(value) => setForm((prev) => ({ ...prev, billingState: value }))}
              placeholder="State"
            />
            <Field
              label="Postal Code"
              value={form.billingPostalCode}
              onChange={(value) => setForm((prev) => ({ ...prev, billingPostalCode: value }))}
              placeholder="ZIP"
            />
          </div>
        </div>

        <div className="border-t border-gray-200 px-6 py-4 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

export function UpdatePaymentTab({ locationId }: UpdatePaymentTabProps) {
  const [currentPlan, setCurrentPlan] = useState<SaaSPlanData | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [planNotConnected, setPlanNotConnected] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [storedProfile, setStoredProfile] = useState<PaymentMethodProfile | null>(null);

  const fetchCurrentPlan = async () => {
    try {
      setLoadingPlan(true);
      const response = await fetch(getBackendUrl(`/api/saas/plan?locationId=${encodeURIComponent(locationId)}`));

      if (!response.ok) {
        if (response.status === 404) {
          setCurrentPlan(null);
          setPlanNotConnected(true);
          return;
        }

        throw new Error('Failed to fetch current plan');
      }

      const data = await response.json();
      setCurrentPlan(data);
      setPlanNotConnected(false);
    } catch (err) {
      console.error('Error fetching current plan:', err);
      setPlanNotConnected(false);
      toast.error('Failed to load current plan');
    } finally {
      setLoadingPlan(false);
    }
  };

  useEffect(() => {
    fetchCurrentPlan();
    setStoredProfile(loadPaymentProfile(locationId));
  }, [locationId]);

  const connectedPaymentMethod = useMemo(
    () => currentPlan?.paymentMethod || storedProfile,
    [currentPlan, storedProfile]
  );
  const hasPaymentMethod = Boolean(connectedPaymentMethod?.last4);

  const handleSaveProfile = (profile: PaymentMethodProfile) => {
    savePaymentProfile(locationId, profile);
    setStoredProfile(profile);
    setDrawerOpen(false);
  };

  if (loadingPlan) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const paymentMethod = connectedPaymentMethod as NonNullable<typeof connectedPaymentMethod> | undefined;
  const brand = paymentMethod ? ('brand' in paymentMethod ? paymentMethod.brand : paymentMethod.cardBrand) : '';
  const last4 = paymentMethod ? paymentMethod.last4 : '';
  const expMonth = paymentMethod ? paymentMethod.expMonth : 0;
  const expYear = paymentMethod ? paymentMethod.expYear : 0;
  const holderName = paymentMethod ? ('name' in paymentMethod ? paymentMethod.name : paymentMethod.cardholderName) : '';
  const billingName = currentPlan?.billingInformation?.name || holderName || 'N/A';
  const billingEmail = currentPlan?.billingInformation?.email || storedProfile?.billingEmail || 'N/A';
  const billingAddress = [
    currentPlan?.billingInformation?.addressLine1 || storedProfile?.billingAddressLine1,
    currentPlan?.billingInformation?.addressLine2 || storedProfile?.billingAddressLine2,
    [currentPlan?.billingInformation?.city || storedProfile?.billingCity, currentPlan?.billingInformation?.state || storedProfile?.billingState]
      .filter(Boolean)
      .join(', '),
    [currentPlan?.billingInformation?.postalCode || storedProfile?.billingPostalCode, currentPlan?.billingInformation?.country || storedProfile?.billingCountry]
      .filter(Boolean)
      .join(' '),
  ]
    .filter(Boolean)
    .join(' • ');
  const taxLabel = currentPlan?.taxInformation?.taxLabel || storedProfile?.taxLabel || 'Tax ID';
  const taxId = currentPlan?.taxInformation?.taxId || storedProfile?.taxId || 'Not available';
  const taxStatus = currentPlan?.taxInformation?.taxStatus || storedProfile?.taxStatus || 'Not provided';

  return (
    <div className="space-y-6">
      <Card title="Connected Card" description="Connect or replace the card on file for this account">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Card on file</p>
                <h3 className="text-lg font-semibold text-gray-900 mt-1">
                  {hasPaymentMethod ? capitalizeCardBrand(brand) : 'No card connected'}
                </h3>
              </div>
              <div className="rounded-full bg-blue-50 p-2 text-blue-600">
                <CreditCard className="h-5 w-5" />
              </div>
            </div>

            {hasPaymentMethod ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Card Number</p>
                  <p className="text-sm font-semibold text-gray-900">•••• {last4}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Expiry Date</p>
                  <p className="text-sm font-semibold text-gray-900">{String(expMonth).padStart(2, '0')}/{expYear}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Cardholder Name</p>
                  <p className="text-sm font-semibold text-gray-900">{holderName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Status</p>
                  <p className="text-sm font-semibold text-emerald-700">Connected</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                <p className="text-sm text-gray-600">
                  {planNotConnected
                    ? 'No plan or payment method is connected for this location yet.'
                    : 'No payment card is connected yet.'}
                </p>
                <div className="mt-4">
                  <Button onClick={() => setDrawerOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                    Add Card
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Billing profile</p>
                <h3 className="text-lg font-semibold text-gray-900 mt-1">Account details</h3>
              </div>
              <div className="rounded-full bg-emerald-50 p-2 text-emerald-600">
                <CreditCard className="h-5 w-5" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Billing Name</p>
                <p className="text-sm font-semibold text-gray-900">{billingName}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Billing Email</p>
                <p className="text-sm font-semibold text-gray-900">{billingEmail}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Billing Address</p>
                <p className="text-sm font-semibold text-gray-900">{billingAddress || 'Not available'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{taxLabel}</p>
                <p className="text-sm font-semibold text-gray-900">{taxId}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Tax Status</p>
                <p className="text-sm font-semibold text-gray-900">{taxStatus}</p>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <Button onClick={() => setDrawerOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                Replace Card
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <PaymentDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onSave={handleSaveProfile} />
    </div>
  );
}
