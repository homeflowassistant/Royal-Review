import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAccountAuth } from '@/contexts/AccountAuthContext';
import { TopNavBar } from '@/components/account/TopNavBar';
import { PaymentMethodTab } from '@/components/account/PaymentMethodTab';
import { UpdatePaymentTab } from '@/components/account/UpdatePaymentTab';
import { ManageUsersTab } from '@/components/account/ManageUsersTab';
import { AddUserTab } from '@/components/account/AddUserTab';
import { CloseAccountTab } from '@/components/account/CloseAccountTab';
import { LoadingSpinner } from '@/components/account/AccountSharedUI';

export default function AccountManagement() {
  const [activeTab, setActiveTab] = useState('payment-method');
  const { loading, error, locationId, locationToken, retryTokenFetch } = useAccountAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error || !locationToken || !locationId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Failed to Load Account</h1>
          <p className="text-sm text-gray-600 mb-6">
            {error || 'Unable to authenticate. Please check the URL and try again.'}
          </p>
          <Button onClick={retryTokenFetch} className="bg-blue-600 hover:bg-blue-700">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNavBar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'payment-method' && <PaymentMethodTab locationId={locationId} />}
        {activeTab === 'update-payment' && <UpdatePaymentTab locationId={locationId} />}
        {activeTab === 'manage-users' && (
          <ManageUsersTab locationId={locationId} onAddUserClick={() => setActiveTab('add-user')} />
        )}
        {activeTab === 'add-user' && (
          <AddUserTab locationId={locationId} onSuccess={() => setActiveTab('manage-users')} />
        )}
        {activeTab === 'close-account' && <CloseAccountTab locationId={locationId} />}
      </main>
    </div>
  );
}
