'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { UserModal } from './UserModal';
import { ConfirmActionModal } from './components/ConfirmActionModal';
import { UserCredentialsModal } from './components/UserCredentialsModal';
import { UsersPageHeader } from './components/UsersPageHeader';
import { UserImportSection } from './components/UserImportSection';
import { UsersTable } from './components/UsersTable';
import { UsersToolbar } from './components/UsersToolbar';
import { useUsersManagement } from './lib/useUsersManagement';
import type { UserCredentialReveal } from './lib/types';

export default function UsersPage() {
  const [revealedCredentials, setRevealedCredentials] = useState<UserCredentialReveal | null>(null);

  const {
    users,
    meta,
    loading,
    error,
    roles,
    shifts,
    search,
    setSearch,
    roleFilter,
    setRoleFilter,
    shiftFilter,
    setShiftFilter,
    statusFilter,
    setStatusFilter,
    setPage,
    isModalOpen,
    selectedUser,
    closeUserModal,
    isConfirmingAction,
    setIsConfirmingAction,
    handleEdit,
    handleAdd,
    handleConfirmAction,
    fetchUsers,
  } = useUsersManagement();

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">
      <UsersPageHeader onAdd={handleAdd} />

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <UserImportSection />

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <UsersToolbar
          search={search}
          onSearchChange={setSearch}
          roles={roles}
          roleFilter={roleFilter}
          onRoleFilterChange={setRoleFilter}
          shifts={shifts}
          shiftFilter={shiftFilter}
          onShiftFilterChange={setShiftFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />

        <UsersTable
          users={users}
          roles={roles}
          shifts={shifts}
          loading={loading}
          onEdit={handleEdit}
          onRequestAction={(action) => setIsConfirmingAction(action)}
        />

        {meta && (
          <Pagination
            meta={meta}
            onPageChange={setPage}
          />
        )}
      </div>

      {isConfirmingAction && (
        <ConfirmActionModal
          action={isConfirmingAction}
          onCancel={() => setIsConfirmingAction(null)}
          onConfirm={handleConfirmAction}
        />
      )}

      {isModalOpen && (
        <UserModal
          user={selectedUser}
          onClose={closeUserModal}
          onCredentialReveal={(payload) => setRevealedCredentials(payload)}
          onRefetchUsers={fetchUsers}
          onSuccess={() => {
            closeUserModal();
            fetchUsers();
          }}
        />
      )}

      {revealedCredentials && (
        <UserCredentialsModal
          reveal={revealedCredentials}
          onClose={() => setRevealedCredentials(null)}
        />
      )}
    </div>
  );
}
