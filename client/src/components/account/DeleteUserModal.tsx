import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
}

interface DeleteUserModalProps {
  user: User;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  deleting: boolean;
}

export function DeleteUserModal({ user, onClose, onConfirm, deleting }: DeleteUserModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
          <AlertTriangle className="h-6 w-6 text-red-600" />
        </div>

        <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">Delete User</h3>

        <p className="text-sm text-gray-600 text-center mb-2">
          Are you sure you want to remove <strong>{user.name}</strong> from this account?
        </p>

        <p className="text-xs text-red-600 text-center mb-6 bg-red-50 p-2 rounded">
          This action cannot be undone.
        </p>

        <div className="flex gap-3">
          <Button onClick={onClose} variant="outline" className="flex-1" disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            className="flex-1 bg-red-600 hover:bg-red-700"
            disabled={deleting}
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Deleting...
              </>
            ) : (
              'Delete User'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
