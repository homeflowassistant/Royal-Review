import { useEffect, useState } from 'react';
import { Trash2, Edit2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAccountAuth } from '@/contexts/AccountAuthContext';
import { useGhlApi } from '@/hooks/useGhlApi';
import {
  Card,
  SkeletonTable,
  ErrorState,
  EmptyState,
  Badge,
} from '@/components/account/AccountSharedUI';
import { ALL_PERMISSIONS } from '@/lib/accountManagement.const';
import { getInitials } from '@/lib/accountManagement.utils';
import { EditUserModal } from '@/components/account/EditUserModal';
import { DeleteUserModal } from '@/components/account/DeleteUserModal';

interface User {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  extension: string;
  avatar?: string;
  locationIds: string[];
  roles: {
    type: string;
    role: string;
    locationIds: string[];
  };
  permissions?: Record<string, boolean>;
}

interface ManageUsersTabProps {
  locationId: string;
  onAddUserClick: () => void;
}

export function ManageUsersTab({ locationId, onAddUserClick }: ManageUsersTabProps) {
  const { locationToken } = useAccountAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [updatingUser, setUpdatingUser] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`https://services.leadconnectorhq.com/users/?locationId=${locationId}`, {
        headers: {
          'Authorization': `Bearer ${locationToken}`,
          'Version': '2021-07-28',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      const userList = data.users || [];
      setUsers(userList);
      setFilteredUsers(userList);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Users fetch error:', message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (locationToken) {
      fetchUsers();
    }
  }, [locationId, locationToken]);

  useEffect(() => {
    const filtered = users.filter((user) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        user.name.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower) ||
        user.firstName.toLowerCase().includes(searchLower) ||
        user.lastName.toLowerCase().includes(searchLower)
      );
    });
    setFilteredUsers(filtered);
  }, [searchTerm, users]);

  const handleEditClick = async (user: User) => {
    try {
      // Fetch full user details including permissions
      const response = await fetch(
        `https://services.leadconnectorhq.com/users/${user.id}`,
        {
          headers: {
            'Authorization': `Bearer ${locationToken}`,
            'Version': '2021-07-28',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch user details');
      }

      const data = await response.json();
      setEditingUser(data);
    } catch (err) {
      toast.error('Failed to load user details');
      console.error('Error fetching user details:', err);
    }
  };

  const handleDeleteClick = (user: User) => {
    setDeletingUser(user);
  };

  const handleSaveUser = async (updatedUser: User) => {
    try {
      setUpdatingUser(true);

      const response = await fetch(
        `https://services.leadconnectorhq.com/users/${updatedUser.id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${locationToken}`,
            'Version': '2021-07-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            email: updatedUser.email,
            phone: updatedUser.phone,
            extension: updatedUser.extension,
            roles: updatedUser.roles,
            permissions: updatedUser.permissions,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update user');
      }

      toast.success('User updated successfully');
      setEditingUser(null);
      await fetchUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(message);
    } finally {
      setUpdatingUser(false);
    }
  };

  const handleConfirmDelete = async (userId: string) => {
    try {
      setDeletingUserId(userId);

      const response = await fetch(
        `https://services.leadconnectorhq.com/users/${userId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${locationToken}`,
            'Version': '2021-07-28',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete user');
      }

      toast.success('User removed successfully');
      setDeletingUser(null);
      setUsers(users.filter((u) => u.id !== userId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(message);
    } finally {
      setDeletingUserId(null);
    }
  };

  if (loading) {
    return (
      <Card title="My Staff">
        <SkeletonTable rows={5} />
      </Card>
    );
  }

  if (error) {
    return <ErrorState title="Error Loading Staff" message={error} onRetry={fetchUsers} />;
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">My Staff</h2>
          <Button onClick={onAddUserClick} className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2">
            <UserPlus size={16} />
            Add User
          </Button>
        </div>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {filteredUsers.length === 0 && (
          <EmptyState
            icon={UserPlus}
            title="No staff members"
            message="Add your first team member to get started."
            action={{ label: 'Add User', onClick: onAddUserClick }}
          />
        )}

        {filteredUsers.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {user.avatar ? (
                            <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700">
                              {getInitials(user.firstName, user.lastName)}
                            </div>
                          )}
                          <span className="text-sm font-medium text-gray-900">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{user.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{user.phone || '—'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={user.roles.role === 'admin' ? 'info' : 'default'}>
                          {user.roles.role.charAt(0).toUpperCase() + user.roles.role.slice(1)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm flex gap-2">
                        <button
                          onClick={() => handleEditClick(user)}
                          className="text-blue-600 hover:text-blue-700 p-1"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(user)}
                          className="text-red-600 hover:text-red-700 p-1"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={handleSaveUser}
          saving={updatingUser}
        />
      )}

      {deletingUser && (
        <DeleteUserModal
          user={deletingUser}
          onClose={() => setDeletingUser(null)}
          onConfirm={() => handleConfirmDelete(deletingUser.id)}
          deleting={deletingUserId === deletingUser.id}
        />
      )}
    </>
  );
}
