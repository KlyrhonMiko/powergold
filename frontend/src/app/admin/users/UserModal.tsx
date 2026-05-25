'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Mail, Shield, Hash, Phone, UserCircle, KeyRound, RotateCcwKey, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  userApi,
  User,
  UserCreate,
  UserUpdate,
  AuthConfig,
  UserTwoFactorStatus,
  UserTwoFactorEnrollmentInitiateResponse,
} from './api';
import { toast } from 'sonner';
import { FormSelect } from '@/components/ui/form-select';
import { cn } from '@/lib/utils';
import type { UserCredentialReveal } from './lib/types';

interface UserModalProps {
  user?: User;
  onClose: () => void;
  onSuccess: () => void;
  onCredentialReveal: (payload: UserCredentialReveal) => void;
  onRefetchUsers?: () => void;
}

type EditableUserUpdate = UserUpdate & {
  employee_id?: string;
  password?: string;
};

export function UserModal({
  user,
  onClose,
  onSuccess,
  onCredentialReveal,
  onRefetchUsers,
}: UserModalProps) {
  const isEdit = !!user;
  const MIN_TWO_FACTOR_CODE_LENGTH = 6;
  const DEFAULT_PIN_LENGTH = 6;
  const SCHEMA_PASSWORD_MIN_LENGTH = 6;

  const [loading, setLoading] = useState(false);
  const [resettingTwoFactor, setResettingTwoFactor] = useState(false);
  const [twoFactorStatus, setTwoFactorStatus] = useState<UserTwoFactorStatus | null>(null);
  const [twoFactorStatusLoading, setTwoFactorStatusLoading] = useState(false);
  const [retrievingRecoveryCredential, setRetrievingRecoveryCredential] = useState(false);
  const [resettingLoginPassword, setResettingLoginPassword] = useState(false);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [roles, setRoles] = useState<AuthConfig[]>([]);
  const [shifts, setShifts] = useState<AuthConfig[]>([]);
  const [pinLength, setPinLength] = useState(DEFAULT_PIN_LENGTH);
  const [isInitiatingTwoFactorEnrollment, setIsInitiatingTwoFactorEnrollment] = useState(false);
  const [isVerifyingTwoFactorEnrollment, setIsVerifyingTwoFactorEnrollment] = useState(false);
  const [twoFactorEnrollment, setTwoFactorEnrollment] = useState<UserTwoFactorEnrollmentInitiateResponse | null>(null);
  const [twoFactorEnrollmentCode, setTwoFactorEnrollmentCode] = useState('');
  const [isPasswordChangeEnabled, setIsPasswordChangeEnabled] = useState(false);

  const pinValidationMessage = `PIN must be at least ${pinLength} characters`;
  const BORROWER_ROLE_KEYS = new Set(['borrower', 'brwr', 'borrow']);
  const PASSWORD_POLICY_EXEMPT_ROLES = new Set(['borrower', 'brwr', 'borrow', 'dispatch']);

  const normalizeRole = (role: string | undefined): string => (role || '').trim().toLowerCase();

  const isBorrowerRoleKey = (role: string | undefined): boolean =>
    BORROWER_ROLE_KEYS.has(normalizeRole(role));

  const isRolePasswordPolicyExempt = (role: string | undefined): boolean =>
    PASSWORD_POLICY_EXEMPT_ROLES.has(normalizeRole(role));

  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    password: '',
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    middle_name: user?.middle_name || '',
    contact_number: user?.contact_number || '',
    employee_id: user?.employee_id || '',
    role: user?.role || '',
    shift_type: user?.shift_type || 'day',
  });

  const isBorrowerRole = isBorrowerRoleKey(formData.role || user?.role);
  const isTwoFactorEligibleUser = !isBorrowerRole;
  const borrowerActionDisabledReason =
    'Unavailable for borrower accounts because this role uses borrower PIN login flows.';

  useEffect(() => {
    const normalizePinLength = (value: unknown): number => {
      const parsed = Number(value);
      return (!Number.isFinite(parsed) || parsed < 1) ? DEFAULT_PIN_LENGTH : Math.trunc(parsed);
    };

    const fetchConfigs = async () => {
      try {
        const [rolesRes, shiftsRes, securityRes] = await Promise.allSettled([
          userApi.getConfigs('users_role'),
          userApi.getConfigs('users_shift_type'),
          userApi.getSecuritySettings(),
        ]);

        if (rolesRes.status === 'fulfilled') setRoles(rolesRes.value.data);
        if (shiftsRes.status === 'fulfilled') setShifts(shiftsRes.value.data);
        if (securityRes.status === 'fulfilled') {
          setPinLength(normalizePinLength(securityRes.value.data?.password_rules?.min_length));
        }

        if (!isEdit && rolesRes.status === 'fulfilled' && rolesRes.value.data.length > 0) {
          setFormData((prev) => prev.role ? prev : { ...prev, role: rolesRes.value.data[0].key });
        }
      } catch {
        toast.error('Failed to load settings');
      } finally {
        setConfigsLoading(false);
      }
    };
    fetchConfigs();
  }, [isEdit]);

  useEffect(() => {
    if (!isEdit || !user) {
      setTwoFactorStatus(null);
      return;
    }

    const fetchTwoFactorStatus = async () => {
      setTwoFactorStatusLoading(true);
      try {
        const response = await userApi.getTwoFactorStatus(user.user_id);
        setTwoFactorStatus(response.data);
      } catch {
        toast.error('Failed to load 2FA status');
      } finally {
        setTwoFactorStatusLoading(false);
      }
    };

    void fetchTwoFactorStatus();
  }, [isEdit, user]);

  const toOptionalText = (value: string): string | undefined => {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const employeeId = (formData.employee_id || '').trim();
      const email = toOptionalText(formData.email);
      const pin = (formData.password || '').trim();
      const effectiveRole = formData.role || user?.role;
      const enforcePasswordRules = !isRolePasswordPolicyExempt(effectiveRole);

      const effectiveUsername = employeeId || (formData.username || '').trim();

      if (isEdit) {
        if (isPasswordChangeEnabled && !pin) {
          toast.error(`${isBorrowerRole ? 'PIN' : 'Password'} is required when changing credentials`);
          return;
        }

        if (isPasswordChangeEnabled && pin.length < SCHEMA_PASSWORD_MIN_LENGTH) {
          toast.error(`PIN must be at least ${SCHEMA_PASSWORD_MIN_LENGTH} characters`);
          return;
        }

        if (isPasswordChangeEnabled && enforcePasswordRules && pin.length < pinLength) {
          toast.error(pinValidationMessage);
          return;
        }

        const { password: _password, email: _email, ...formDataWithoutPassword } = formData;
        const updateData: EditableUserUpdate = {
          ...formDataWithoutPassword,
          username: employeeId || effectiveUsername,
          ...(email ? { email } : {}),
          ...(employeeId ? { employee_id: employeeId } : {}),
          ...(isPasswordChangeEnabled ? { password: pin, change_password: true } : {}),
        };
        await userApi.update(user.user_id, updateData);
        toast.success('User updated successfully');
      } else {
        if (!employeeId) {
          toast.error('Employee ID is required');
          return;
        }

        if (isBorrowerRole) {
          if (!pin) {
            toast.error('PIN is required for borrower accounts');
            return;
          }

          if (pin.length < SCHEMA_PASSWORD_MIN_LENGTH) {
            toast.error(`PIN must be at least ${SCHEMA_PASSWORD_MIN_LENGTH} characters`);
            return;
          }

          if (enforcePasswordRules && pin.length < pinLength) {
            toast.error(pinValidationMessage);
            return;
          }
        }

        const middleName = toOptionalText(formData.middle_name);
        const contactNumber = toOptionalText(formData.contact_number);

        const createPayload: UserCreate = {
          username: employeeId,
          first_name: formData.first_name,
          last_name: formData.last_name,
          role: formData.role,
          shift_type: formData.shift_type,
          employee_id: employeeId,
          ...(email ? { email } : {}),
          ...(middleName ? { middle_name: middleName } : {}),
          ...(contactNumber ? { contact_number: contactNumber } : {}),
          ...(isBorrowerRole ? { password: pin } : {}),
        };

        const created = await userApi.register(createPayload);

        if (created.data.generated_credentials) {
          onCredentialReveal({
            source: 'create',
            userId: created.data.user.user_id,
            userName: `${created.data.user.first_name} ${created.data.user.last_name}`,
            oneTimeLoginPassword: created.data.generated_credentials.one_time_login_password,
            secondaryPassword: created.data.generated_credentials.secondary_password ?? undefined,
          });
        }

        toast.success('User registered successfully');
      }
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save user';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };
  const handleResetTwoFactor = async () => {
    if (!user) return;
    const confirmed = window.confirm(`Reset 2FA for ${user.first_name}?`);
    if (!confirmed) return;

    setResettingTwoFactor(true);
    try {
      await userApi.resetTwoFactor(user.user_id);
      setTwoFactorStatus({ enabled: false, enrolled_at: null, method: 'authenticator_app' });
      toast.success('2FA reset');
    } catch {
      toast.error('Failed to reset 2FA');
    } finally {
      setResettingTwoFactor(false);
    }
  };

  const handleStartTwoFactorEnrollment = async () => {
    if (!user) return;
    setIsInitiatingTwoFactorEnrollment(true);
    try {
      const response = await userApi.initiateTwoFactorEnrollment(user.user_id);
      setTwoFactorEnrollment(response.data);
      setTwoFactorEnrollmentCode('');
      toast.info('Scan QR and enter code');
    } catch {
      toast.error('Unable to start setup');
    } finally {
      setIsInitiatingTwoFactorEnrollment(false);
    }
  };

  const handleVerifyTwoFactorEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const code = twoFactorEnrollmentCode.trim();
    if (code.length < MIN_TWO_FACTOR_CODE_LENGTH) {
      toast.error('Invalid code');
      return;
    }

    setIsVerifyingTwoFactorEnrollment(true);
    try {
      const response = await userApi.verifyTwoFactorEnrollment(user.user_id, code);
      setTwoFactorStatus(response.data);
      setTwoFactorEnrollment(null);
      toast.success('2FA enabled');
    } catch {
      toast.error('Failed to verify');
    } finally {
      setIsVerifyingTwoFactorEnrollment(false);
    }
  };

  const handleRetrieveSecondaryPassword = async () => {
    if (!user) return;
    setRetrievingRecoveryCredential(true);
    try {
      const result = await userApi.getSecondaryPassword(user.user_id);
      onCredentialReveal({
        source: 'secondary_password',
        userId: result.data.user_id,
        userName: `${user.first_name} ${user.last_name}`,
        secondaryPassword: result.data.secondary_password,
        rotatedAt: result.data.rotated_at,
      });
    } catch {
      toast.error('Failed to retrieve');
    } finally {
      setRetrievingRecoveryCredential(false);
    }
  };

  const handleResetLoginPassword = async () => {
    if (!user) return;
    const secondaryPassword = window.prompt(`Enter current secondary password:`);
    if (!secondaryPassword?.trim()) return;

    setResettingLoginPassword(true);
    try {
      const result = await userApi.resetLoginPassword(user.user_id, {
        secondary_password: secondaryPassword.trim(),
      });
      onCredentialReveal({
        source: 'reset_login_password',
        userId: result.data.user_id,
        userName: `${user.first_name} ${user.last_name}`,
        oneTimeLoginPassword: result.data.generated_credentials.one_time_login_password,
        secondaryPassword: result.data.generated_credentials.secondary_password ?? undefined,
      });
      onRefetchUsers?.();
    } catch {
      toast.error('Failed to reset');
    } finally {
      setResettingLoginPassword(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const togglePasswordChange = () => {
    setIsPasswordChangeEnabled((prev) => {
      if (prev) {
        setFormData((current) => ({ ...current, password: '' }));
      }

      return !prev;
    });
  };

  const inputClassName =
    'w-full h-11 px-4 rounded-lg bg-muted/40 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition-all placeholder:text-muted-foreground/40';
  const inputWithIconClassName = 'w-full h-11 pl-10 pr-4 rounded-xl bg-muted/40 border border-border text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none';

  const twoFactorStatusLabel = twoFactorStatusLoading
    ? 'Checking 2FA status...'
    : twoFactorStatus?.enabled
      ? '2FA Enabled'
      : '2FA Not Enabled';

  const twoFactorStatusClassName = twoFactorStatusLoading
    ? 'bg-muted text-muted-foreground border-border'
    : twoFactorStatus?.enabled
      ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
      : 'bg-amber-500/10 text-amber-700 border-amber-500/20';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-4xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-border bg-muted/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shadow-inner">
              <UserCircle className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">{isEdit ? 'Edit User' : 'Create User'}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{isEdit ? 'Update details and manage security' : 'Add a new member to the system'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 text-muted-foreground hover:bg-muted rounded-full transition-all hover:rotate-90 duration-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto bg-background/50">
          <div className="p-8 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              {/* Left Column */}
              <div className="space-y-8">
                <section>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                    <UserCircle className="w-4 h-4 text-primary" />
                    Personal Details
                  </h3>
                  <div className="space-y-4 p-5 rounded-2xl border border-border/60 bg-muted/20">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1.5 ml-1">First Name</label>
                        <input required name="first_name" value={formData.first_name} onChange={handleChange} className={inputClassName} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1.5 ml-1">Last Name</label>
                        <input required name="last_name" value={formData.last_name} onChange={handleChange} className={inputClassName} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1.5 ml-1">Middle Name</label>
                      <input name="middle_name" value={formData.middle_name} onChange={handleChange} className={inputClassName} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1.5 ml-1">Contact Number</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                        <input name="contact_number" value={formData.contact_number} onChange={handleChange} className={inputWithIconClassName} />
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    System Role
                  </h3>
                  <div className="grid grid-cols-2 gap-4 p-5 rounded-2xl border border-border/60 bg-muted/20">
                    <FormSelect label="Role" value={formData.role} onChange={(v) => setFormData(p => ({ ...p, role: v }))} options={roles.map(r => ({ key: r.key, label: r.value }))} triggerClassName="h-11 rounded-xl" labelClassName="text-[11px] font-bold text-muted-foreground uppercase mb-1.5 ml-1" placeholder="Select role..." />
                    <FormSelect label="Shift" value={formData.shift_type} onChange={(v) => setFormData(p => ({ ...p, shift_type: v }))} options={shifts.map(s => ({ key: s.key, label: s.value }))} triggerClassName="h-11 rounded-xl" labelClassName="text-[11px] font-bold text-muted-foreground uppercase mb-1.5 ml-1" placeholder="Select shift..." />
                  </div>
                </section>
              </div>

              {/* Right Column */}
              <div className="space-y-8">
                <section>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-primary" />
                    Account Credentials
                  </h3>
                  <div className="space-y-4 p-5 rounded-2xl border border-border/60 bg-muted/20">
                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1.5 ml-1">Employee ID</label>
                      <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                        <input name="employee_id" value={formData.employee_id} onChange={handleChange} required={!isEdit} className={inputWithIconClassName} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1.5 ml-1">Email Address (Optional)</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                        <input type="email" name="email" value={formData.email} onChange={handleChange} className={inputWithIconClassName} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1.5 ml-1">
                        {isBorrowerRole ? 'Security PIN' : 'Password'}
                      </label>
                      {isEdit ? (
                        <div className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {isBorrowerRole ? 'Change PIN' : 'Change Password'}
                              </p>
                              <p className="text-[11px] leading-relaxed text-muted-foreground">
                                Enable this only when you intend to rotate credentials during this edit.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={togglePasswordChange}
                              className={cn(
                                'rounded-md border px-3 py-2 text-xs font-semibold transition-colors',
                                isPasswordChangeEnabled
                                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-700'
                                  : 'border-border bg-muted/50 text-foreground hover:bg-muted',
                              )}
                            >
                              {isPasswordChangeEnabled ? 'Cancel Credential Change' : `Enable ${isBorrowerRole ? 'PIN' : 'Password'} Change`}
                            </button>
                          </div>
                          {isPasswordChangeEnabled ? (
                            <div className="relative">
                              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40 pointer-events-none" />
                              <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                autoComplete="new-password"
                                className={inputWithIconClassName}
                                placeholder={isBorrowerRole ? 'Enter new PIN' : 'Enter new password'}
                              />
                            </div>
                          ) : (
                            <p className="text-[11px] leading-relaxed text-muted-foreground">
                              {isBorrowerRole
                                ? 'Leave this disabled to keep the current PIN unchanged.'
                                : 'Leave this disabled to keep the current login password unchanged. Use the reset action below when you need a generated one-time password instead.'}
                            </p>
                          )}
                        </div>
                      ) : isBorrowerRole ? (
                        <div className="relative">
                          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40 pointer-events-none" />
                          <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            autoComplete="new-password"
                            className={inputWithIconClassName}
                            placeholder={isBorrowerRole ? 'Enter PIN' : 'Enter new password'}
                          />
                        </div>
                      ) : (
                        <div className="h-11 flex items-center px-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-700 text-xs font-medium">
                          Auto-generated on creation
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {isEdit && (
                  <section>
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-500" />
                      Security Actions
                    </h3>
                    <div className="space-y-3">
                      {/* 2FA Action */}
                      <div className="p-4 rounded-2xl border border-border bg-background shadow-sm hover:shadow-md transition-all">
                        <div className="flex justify-between items-center mb-1">
                           <div className="flex items-center gap-3">
                              <div className={cn("p-2 rounded-lg", twoFactorStatus?.enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600")}>
                                <Smartphone className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="text-sm font-bold">2FA Status</p>
                                <p className={cn('text-[11px]', twoFactorStatusClassName)}>{twoFactorStatusLabel}</p>
                              </div>
                           </div>
                           {isTwoFactorEligibleUser && (
                              twoFactorStatus?.enabled ? (
                                <button type="button" onClick={handleResetTwoFactor} disabled={resettingTwoFactor} className="text-xs font-bold text-amber-600 hover:underline disabled:opacity-50">
                                  {resettingTwoFactor ? 'Resetting...' : 'Reset'}
                                </button>
                              ) : (
                                !twoFactorEnrollment && (
                                  <button type="button" onClick={handleStartTwoFactorEnrollment} disabled={isInitiatingTwoFactorEnrollment} className="text-xs font-bold text-primary hover:underline disabled:opacity-50">
                                    {isInitiatingTwoFactorEnrollment ? 'Preparing...' : 'Setup'}
                                  </button>
                                )
                              )
                           )}
                        </div>
                        
                        {twoFactorEnrollment && (
                          <div className="mt-4 pt-4 border-t space-y-4 animate-in slide-in-from-top-2">
                             <div className="flex justify-center bg-white p-3 rounded-xl border w-fit mx-auto shadow-inner">
                               <QRCodeSVG value={twoFactorEnrollment.provisioning_uri} size={140} />
                             </div>
                             <div className="flex gap-2">
                               <input placeholder="Code" value={twoFactorEnrollmentCode} onChange={(e) => setTwoFactorEnrollmentCode(e.target.value)} className="flex-1 h-9 px-3 rounded-lg border bg-muted/20 text-sm" />
                               <button type="button" onClick={handleVerifyTwoFactorEnrollment} disabled={isVerifyingTwoFactorEnrollment} className="bg-primary text-primary-foreground px-4 rounded-lg text-xs font-bold">
                                 {isVerifyingTwoFactorEnrollment ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Verify'}
                               </button>
                               <button type="button" onClick={() => setTwoFactorEnrollment(null)} className="p-2 rounded-lg border hover:bg-muted"><X className="w-4 h-4" /></button>
                             </div>
                          </div>
                        )}
                      </div>

                      {/* Other Actions */}
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          aria-label="View Secondary Password"
                          onClick={handleRetrieveSecondaryPassword}
                          disabled={isBorrowerRole || retrievingRecoveryCredential || loading}
                          className="flex items-center justify-center gap-2 h-12 rounded-2xl border border-blue-500/20 bg-blue-500/5 text-blue-700 text-xs font-bold hover:bg-blue-500/10 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {retrievingRecoveryCredential ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                          View Secondary Password
                        </button>
                        <button
                          type="button"
                          aria-label="Reset Login Password"
                          onClick={handleResetLoginPassword}
                          disabled={isBorrowerRole || resettingLoginPassword || loading}
                          className="flex items-center justify-center gap-2 h-12 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-600 text-xs font-bold hover:bg-red-500/10 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {resettingLoginPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcwKey className="w-4 h-4" />}
                          Reset Login Password
                        </button>
                      </div>
                      {isBorrowerRole && (
                        <p className="text-[11px] text-muted-foreground">
                          {borrowerActionDisabledReason}
                        </p>
                      )}
                    </div>
                  </section>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 py-6 border-t border-border bg-muted/30 flex gap-4">
            <button type="button" onClick={onClose} className="flex-1 h-12 rounded-xl border border-border bg-background text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-all">Cancel</button>
            <button type="submit" disabled={loading || configsLoading} className="flex-[2] h-12 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-lg shadow-primary/25 hover:bg-primary/90 hover:scale-[1.02] active:scale-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isEdit ? 'Save Changes' : 'Create Member')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
