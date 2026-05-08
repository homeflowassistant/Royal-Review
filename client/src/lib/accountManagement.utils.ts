export function formatCurrency(cents: number, currency = 'usd'): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(dollars);
}

export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return 'N/A';
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return 'N/A';
  }
}

export function formatDateShort(isoString: string | null | undefined): string {
  if (!isoString) return 'N/A';
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return 'N/A';
  }
}

export function capitalizeCardBrand(brand: string): string {
  const map: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    diners: 'Diners Club',
    discover: 'Discover',
  };
  return map[brand.toLowerCase()] || brand;
}

export function getInitials(firstName: string, lastName?: string): string {
  const first = firstName?.charAt(0)?.toUpperCase() || '';
  const last = lastName?.charAt(0)?.toUpperCase() || '';
  return (first + last).slice(0, 2);
}

export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('At least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('At least one uppercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('At least one number');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('At least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validatePhoneE164(phone: string): boolean {
  // E.164 format: +1XXXXXXXXXX
  const re = /^\+[1-9]\d{1,14}$/;
  return re.test(phone);
}

export function maskCardNumber(last4: string): string {
  return `•••• ${last4}`;
}

export function intervalToLabel(interval: string): string {
  const map: Record<string, string> = {
    month: 'Monthly',
    year: 'Annual',
  };
  return map[interval.toLowerCase()] || interval;
}

export function statusToBadgeColor(
  status: string
): 'bg-green-100 text-green-800' | 'bg-red-100 text-red-800' | 'bg-yellow-100 text-yellow-800' | 'bg-gray-100 text-gray-800' {
  const map: Record<string, any> = {
    succeeded: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
    refunded: 'bg-gray-100 text-gray-800',
    active: 'bg-green-100 text-green-800',
    canceled: 'bg-red-100 text-red-800',
    trialing: 'bg-yellow-100 text-yellow-800',
  };
  return map[status.toLowerCase()] || 'bg-gray-100 text-gray-800';
}

export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}
