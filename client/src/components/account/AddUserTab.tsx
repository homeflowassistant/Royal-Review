import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getBackendUrl } from '@/lib/backend';
import { Card } from '@/components/account/AccountSharedUI';
import { validateEmail, validatePassword } from '@/lib/accountManagement.utils';
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS } from '@/lib/accountManagement.const';

interface AddUserTabProps {
  locationId: string;
  onSuccess: () => void;
}

export function AddUserTab({ locationId, onSuccess }: AddUserTabProps) {
  const [submitting, setSubmitting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    extension: '',
    type: 'account',
    role: 'user',
    permissions: DEFAULT_PERMISSIONS,
  });

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (field === 'email') {
      setEmailError(null);
    }
  };

  const handlePermissionToggle = (permission: string) => {
    setFormData((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [permission]: !prev.permissions[permission],
      },
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.firstName.trim()) {
      toast.error('First name is required');
      return false;
    }

    if (!formData.lastName.trim()) {
      toast.error('Last name is required');
      return false;
    }

    if (!formData.email.trim()) {
      toast.error('Email is required');
      return false;
    }

    if (!validateEmail(formData.email)) {
      toast.error('Invalid email format');
      return false;
    }

    if (!formData.password) {
      toast.error('Password is required');
      return false;
    }

    const passwordValidation = validatePassword(formData.password);
    if (!passwordValidation.isValid) {
      toast.error(`Password requirements: ${passwordValidation.errors.join(', ')}`);
      return false;
    }

    if (formData.phone && !/^\+[1-9]\d{1,14}$/.test(formData.phone)) {
      toast.error('Phone must be in E.164 format (e.g., +15551234567)');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setSubmitting(true);
      setEmailError(null);

      const response = await fetch(getBackendUrl('/api/account/users'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          locationId,
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          email: formData.email.trim(),
          password: formData.password,
          phone: formData.phone.trim() || undefined,
          extension: formData.extension.trim() || undefined,
          type: formData.type,
          role: formData.role,
          locationIds: [locationId],
          permissions: formData.permissions,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();

        if (response.status === 422) {
          setEmailError(errorData.message || 'This email is already in use');
          return;
        }

        throw new Error(errorData.message || 'Failed to create user');
      }

      const data = await response.json();
      toast.success(`User ${data.name} has been added.`);

      // Reset form
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        phone: '',
        extension: '',
        type: 'account',
        role: 'user',
        permissions: DEFAULT_PERMISSIONS,
      });

      // Navigate back to manage users tab
      setTimeout(onSuccess, 500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Personal Information Section */}
      <Card title="Personal Information" description="Basic user details">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              First Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => handleChange('firstName', e.target.value)}
              placeholder="Enter first name"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Last Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => handleChange('lastName', e.target.value)}
              placeholder="Enter last name"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Email <span className="text-red-600">*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="Enter email address"
              className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                emailError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
              }`}
              required
            />
            {emailError && <p className="text-xs text-red-600 mt-1">{emailError}</p>}
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Password <span className="text-red-600">*</span>
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              placeholder="Min 8 chars, 1 uppercase, 1 number, 1 special char"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Must contain: 8+ characters, 1 uppercase, 1 number, 1 special character
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="+15551234567"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Format: +1XXXXXXXXXX</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Extension</label>
            <input
              type="text"
              value={formData.extension}
              onChange={(e) => handleChange('extension', e.target.value)}
              placeholder="e.g., 101"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </Card>

      {/* Role & Access Section */}
      <Card title="Role & Access" description="Set user permissions level">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">User Type</label>
            <select
              value={formData.type}
              onChange={(e) => handleChange('type', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="account">Account User</option>
              <option value="agency">Agency User</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Role</label>
            <select
              value={formData.role}
              onChange={(e) => handleChange('role', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Permissions Section */}
      <Card title="Permissions" description="Choose which features this user can access">
        <div className="grid grid-cols-2 gap-3">
          {ALL_PERMISSIONS.map((perm) => (
            <label key={perm.key} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={formData.permissions[perm.key] ?? false}
                onChange={() => handlePermissionToggle(perm.key)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              <span className="text-sm text-gray-900">{perm.label}</span>
            </label>
          ))}
        </div>
      </Card>

      {/* Form Actions */}
      <div className="flex gap-3">
        <Button onClick={() => window.history.back()} variant="outline" className="flex-1" disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Creating User...
            </>
          ) : (
            'Create User'
          )}
        </Button>
      </div>
    </form>
  );
}
