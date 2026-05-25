'use client';

import {
  User as UserIcon,
  Pencil,
  Trash2,
  RotateCcw,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import type { AuthConfig, User } from '../api';
import type { UserConfirmAction } from '../lib/types';

export function UsersTable({
  users,
  roles,
  shifts,
  loading,
  onEdit,
  onRequestAction,
}: {
  users: User[];
  roles: AuthConfig[];
  shifts: AuthConfig[];
  loading: boolean;
  onEdit: (user: User) => void;
  onRequestAction: (action: UserConfirmAction) => void;
}) {
  const getRoleLabel = (key: string) => roles.find((r) => r.key === key)?.value || key;
  const getShiftLabel = (key: string) => shifts.find((s) => s.key === key)?.value || key;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary/60" />
        <p className="text-sm font-medium">Loading users...</p>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <UserIcon className="w-12 h-12 text-muted-foreground/20" />
        <p className="text-base font-medium text-muted-foreground">No users found</p>
        <p className="text-sm text-muted-foreground/60">Try adjusting your search or filters above.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      {/* Column labels - visible on larger screens */}
      <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_140px_120px_120px_100px_240px] gap-4 px-6 py-3 text-xs font-medium text-muted-foreground bg-muted/20">
        <span>User</span>
        <span>Employee ID</span>
        <span>Role</span>
        <span>Shift</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>

      {users.map((user) => (
        <div
          key={user.user_id}
          className="group px-6 py-4 hover:bg-muted/20 transition-colors"
        >
          {/* Desktop layout */}
          <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_140px_120px_120px_100px_240px] gap-4 items-center">
            {/* User info */}
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${!user.is_deleted
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
                  }`}
              >
                {user.first_name[0]}{user.last_name[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user.first_name} {user.last_name}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email || 'No email'}</p>
              </div>
            </div>

            {/* Employee ID */}
            <span className="text-sm font-mono text-muted-foreground">
              {user.employee_id || '—'}
            </span>

            {/* Role */}
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
              <span className="text-sm">{getRoleLabel(user.role)}</span>
            </div>

            {/* Shift */}
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
              <span className="text-sm text-muted-foreground">{getShiftLabel(user.shift_type)}</span>
            </div>

            {/* Status */}
            {!user.is_deleted ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 w-fit">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500 w-fit">
                <XCircle className="w-3.5 h-3.5" />
                Inactive
              </span>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
              <button
                onClick={() => onEdit(user)}
                aria-label={`Edit ${user.first_name} ${user.last_name}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors shrink-0"
              >
                <Pencil className="w-4 h-4" />
                <span className="hidden lg:inline">Edit</span>
              </button>

              {!user.is_deleted ? (
                <>
                  <button
                    onClick={() => onRequestAction({ type: 'delete', user })}
                    aria-label={`Deactivate ${user.first_name} ${user.last_name}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden lg:inline">Deactivate</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onRequestAction({ type: 'restore', user })}
                  aria-label={`Restore ${user.first_name} ${user.last_name}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors shrink-0"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="hidden lg:inline">Restore</span>
                </button>
              )}
            </div>
          </div>

          {/* Mobile card layout */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${!user.is_deleted
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                    }`}
                >
                  {user.first_name[0]}{user.last_name[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {user.first_name} {user.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{user.email || 'No email'}</p>
                </div>
              </div>

              {!user.is_deleted ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500">
                  <XCircle className="w-3.5 h-3.5" />
                  Inactive
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground pl-[52px]">
              <span className="font-mono">{user.employee_id || '—'}</span>
              <span className="flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" />
                {getRoleLabel(user.role)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {getShiftLabel(user.shift_type)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pl-[52px]">
              <button
                onClick={() => onEdit(user)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary bg-primary/10 rounded-lg transition-colors hover:bg-primary/20 shrink-0"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </button>

              {!user.is_deleted ? (
                <>
                  <button
                    onClick={() => onRequestAction({ type: 'delete', user })}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-500 bg-red-500/10 rounded-lg transition-colors hover:bg-red-500/20 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                    Deactivate
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onRequestAction({ type: 'restore', user })}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-emerald-500 bg-emerald-500/10 rounded-lg transition-colors hover:bg-emerald-500/20 shrink-0"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restore
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
