'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/contexts/AuthContext';
import { auth, User } from '@/lib/auth';
import {
    api,
    AuthApiError,
    TwoFactorEnrollmentInitiateResponse,
    TwoFactorStatusResponse,
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
    User as UserIcon,
    Edit3,
    Save,
    Shield,
    Key,
    Smartphone,
    X,
    Loader2
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

const MIN_TWO_FACTOR_CODE_LENGTH = 6;

export default function ProfilePage() {
    const { user, refreshUser } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<Partial<User>>({});
    const [currentPasswordForSensitive, setCurrentPasswordForSensitive] = useState('');
    
    // 2FA States
    const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatusResponse | null>(null);
    const [isLoadingTwoFactorStatus, setIsLoadingTwoFactorStatus] = useState(false);
    const [isInitiatingTwoFactorEnrollment, setIsInitiatingTwoFactorEnrollment] = useState(false);
    const [twoFactorEnrollment, setTwoFactorEnrollment] = useState<TwoFactorEnrollmentInitiateResponse | null>(null);
    const [twoFactorEnrollmentCode, setTwoFactorEnrollmentCode] = useState('');
    const [isVerifyingTwoFactorEnrollment, setIsVerifyingTwoFactorEnrollment] = useState(false);
    const [showTwoFactorEnrollmentModal, setShowTwoFactorEnrollmentModal] = useState(false);
    
    const [isShowingDisableTwoFactor, setIsShowingDisableTwoFactor] = useState(false);
    const [twoFactorDisableCode, setTwoFactorDisableCode] = useState('');
    const [isDisablingTwoFactor, setIsDisablingTwoFactor] = useState(false);

    // Password Update States
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [passwordData, setPasswordData] = useState({ current: '', new: '', confirm: '' });

    useEffect(() => {
        if (user) {
            setFormData({
                first_name: user.first_name,
                last_name: user.last_name,
                middle_name: user.middle_name || '',
                email: user.email,
                username: user.username,
                contact_number: user.contact_number || '',
            });
        }
    }, [user]);

    const loadTwoFactorStatus = async () => {
        setIsLoadingTwoFactorStatus(true);
        try {
            const status = await api.getTwoFactorStatus();
            setTwoFactorStatus(status);

            if (status.enabled) {
                setTwoFactorEnrollment(null);
                setTwoFactorEnrollmentCode('');
                setShowTwoFactorEnrollmentModal(false);
            } else {
                setIsShowingDisableTwoFactor(false);
                setTwoFactorDisableCode('');
            }
        } catch (error: unknown) {
            toast.error('Failed to load 2FA status');
        } finally {
            setIsLoadingTwoFactorStatus(false);
        }
    };

    useEffect(() => {
        if (user) {
            void loadTwoFactorStatus();
        }
    }, [user]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        const isEmailChanged = (formData.email || '').trim() !== (user?.email || '');
        const isUsernameChanged = (formData.username || '').trim() !== user?.username;
        const requiresCurrentPassword = isEmailChanged || isUsernameChanged;

        if (requiresCurrentPassword && !currentPasswordForSensitive) {
            toast.error('Current password is required when changing email or username');
            return;
        }

        const payload: Partial<User> = {
            first_name: formData.first_name,
            last_name: formData.last_name,
            middle_name: formData.middle_name,
            email: formData.email,
            contact_number: formData.contact_number,
            username: formData.username,
            ...(requiresCurrentPassword ? { current_password: currentPasswordForSensitive } : {})
        };

        setLoading(true);
        try {
            await auth.updateMe(payload);
            await refreshUser();
            setIsEditing(false);
            setCurrentPasswordForSensitive('');
            toast.success('Profile updated successfully');
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Failed to update profile');
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordUpdate = async () => {
        if (!passwordData.current) {
            toast.error('Current password is required');
            return;
        }
        if (passwordData.new !== passwordData.confirm) {
            toast.error('Passwords do not match');
            return;
        }
        if (passwordData.new.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }

        setLoading(true);
        try {
            await auth.updateMe({
                password: passwordData.new,
                current_password: passwordData.current
            });
            await refreshUser();
            setShowPasswordForm(false);
            setPasswordData({ current: '', new: '', confirm: '' });
            toast.success('Password updated successfully');
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Failed to update password');
        } finally {
            setLoading(false);
        }
    };

    const handleInitiateTwoFactorEnrollment = async () => {
        setIsInitiatingTwoFactorEnrollment(true);
        try {
            const enrollment = await api.initiateTwoFactorEnrollment();
            setTwoFactorEnrollment(enrollment);
            setTwoFactorEnrollmentCode('');
            setShowTwoFactorEnrollmentModal(true);
            toast.info('Scan the QR code in your authenticator app to continue setup.');
        } catch (error: unknown) {
            if (error instanceof AuthApiError && error.status === 400) {
                toast.info('Two-factor authentication is already enabled.');
            } else {
                toast.error(error instanceof Error ? error.message : 'Unable to initiate setup');
            }
        } finally {
            setIsInitiatingTwoFactorEnrollment(false);
        }
    };

    const handleVerifyTwoFactorEnrollment = async (e: React.FormEvent) => {
        e.preventDefault();
        const code = twoFactorEnrollmentCode.trim();
        if (code.length < MIN_TWO_FACTOR_CODE_LENGTH) {
            toast.error('Enter a valid code.');
            return;
        }

        setIsVerifyingTwoFactorEnrollment(true);
        try {
            const status = await api.verifyTwoFactorEnrollment(code);
            setTwoFactorStatus(status);
            toast.success('Two-factor authentication enabled.');
            setTwoFactorEnrollment(null);
            setShowTwoFactorEnrollmentModal(false);
        } catch (error: unknown) {
            toast.error('Failed to verify code');
        } finally {
            setIsVerifyingTwoFactorEnrollment(false);
        }
    };

    const handleDisableTwoFactor = async (e: React.FormEvent) => {
        e.preventDefault();
        const code = twoFactorDisableCode.trim();
        if (code.length < MIN_TWO_FACTOR_CODE_LENGTH) {
            toast.error('Enter a valid code.');
            return;
        }

        setIsDisablingTwoFactor(true);
        try {
            await api.disableTwoFactorEnrollment(code);
            toast.success('Two-factor authentication disabled.');
            setIsShowingDisableTwoFactor(false);
            setTwoFactorDisableCode('');
            await loadTwoFactorStatus();
        } catch (error: unknown) {
            toast.error('Failed to disable 2FA');
        } finally {
            setIsDisablingTwoFactor(false);
        }
    };

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto py-10 px-4 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-2">
                <div className="flex items-center gap-5">
                    <div className="w-20 h-20 rounded-full bg-primary/10 border-4 border-background shadow-sm flex items-center justify-center ring-1 ring-primary/20">
                        <UserIcon className="w-10 h-10 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">{user.first_name} {user.last_name}</h1>
                        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mt-1">{user.role} Account</p>
                    </div>
                </div>
                {!isEditing ? (
                    <Button onClick={() => setIsEditing(true)} variant="outline" className="gap-2 h-11 px-6 shadow-sm">
                        <Edit3 className="w-4 h-4" />
                        Edit Profile
                    </Button>
                ) : (
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => { setIsEditing(false); setCurrentPasswordForSensitive(''); }} disabled={loading} className="h-11 px-6">Cancel</Button>
                        <Button onClick={handleSave} disabled={loading} className="gap-2 h-11 px-6 shadow-md">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Changes
                        </Button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-1 gap-8 items-start">
                <Card className="border-border/60 shadow-sm overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b border-border/50">
                        <CardTitle className="text-lg flex items-center gap-2"><UserIcon className="w-5 h-5 text-primary" />Personal Information</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Input label="First Name" name="first_name" value={formData.first_name || ''} onChange={handleInputChange} disabled={!isEditing || loading} />
                            <Input label="Last Name" name="last_name" value={formData.last_name || ''} onChange={handleInputChange} disabled={!isEditing || loading} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Input label="Middle Name (Optional)" name="middle_name" value={formData.middle_name || ''} onChange={handleInputChange} disabled={!isEditing || loading} />
                            <Input label="Contact Number" name="contact_number" value={formData.contact_number || ''} onChange={handleInputChange} disabled={!isEditing || loading} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <Input label="Email Address" name="email" value={formData.email || ''} onChange={handleInputChange} disabled={!isEditing || loading} />
                           <Input label="Username" name="username" value={formData.username || ''} onChange={handleInputChange} disabled={!isEditing || loading} />
                        </div>
                        {isEditing && (
                            <div className="pt-4 mt-4 border-t border-dashed">
                                <p className="text-xs text-amber-600 font-medium mb-3">Changes to email or username require password verification</p>
                                <Input type="password" label="Current Password" value={currentPasswordForSensitive} onChange={(e) => setCurrentPasswordForSensitive(e.target.value)} disabled={loading} placeholder="Verify your identity to save sensitive changes" />
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-border/60 shadow-sm overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b border-border/50">
                        <CardTitle className="text-lg flex items-center gap-2"><Shield className="w-5 h-5 text-amber-500" />Login & Security</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-8">
                        {/* 2FA Status Banner */}
                        <div className={cn(
                            "flex items-center justify-between p-5 rounded-xl border transition-colors",
                            twoFactorStatus?.enabled 
                                ? "bg-emerald-500/5 border-emerald-500/20" 
                                : "bg-amber-500/5 border-amber-500/20"
                        )}>
                            <div className="flex items-center gap-4">
                                <div className={cn(
                                    "p-3 rounded-full",
                                    twoFactorStatus?.enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                                )}>
                                    <Smartphone className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="font-semibold text-foreground">Two-Factor Authentication</p>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        {isLoadingTwoFactorStatus ? 'Checking status...' : twoFactorStatus?.enabled 
                                            ? `Enabled since ${formatDate(twoFactorStatus.enrolled_at)}` 
                                            : 'Protect your account with an additional security layer'}
                                    </p>
                                </div>
                            </div>
                            {twoFactorStatus?.enabled ? (
                                <Button variant="outline" size="sm" onClick={() => setIsShowingDisableTwoFactor(true)} className="border-amber-500/30 text-amber-700 hover:bg-amber-500/10">Disable</Button>
                            ) : (
                                <Button size="sm" onClick={handleInitiateTwoFactorEnrollment} disabled={isInitiatingTwoFactorEnrollment}>
                                    {isInitiatingTwoFactorEnrollment ? 'Preparing...' : 'Set up 2FA'}
                                </Button>
                            )}
                        </div>

                        {/* Disable 2FA Form */}
                        {isShowingDisableTwoFactor && (
                            <form onSubmit={handleDisableTwoFactor} className="p-4 rounded-lg border border-red-500/20 bg-red-500/5 animate-in slide-in-from-top-2">
                                <div className="flex items-center justify-between mb-4">
                                    <p className="text-sm font-semibold text-red-700">Disable Two-Factor Authentication</p>
                                    <button type="button" onClick={() => setIsShowingDisableTwoFactor(false)}><X className="w-4 h-4" /></button>
                                </div>
                                <div className="flex gap-3">
                                    <input placeholder="Enter 6-digit code" value={twoFactorDisableCode} onChange={(e) => setTwoFactorDisableCode(e.target.value)} className="flex-1 h-10 px-3 rounded-lg border bg-background text-sm" />
                                    <Button type="submit" variant="destructive" size="sm" disabled={isDisablingTwoFactor}>
                                        {isDisablingTwoFactor ? 'Disabling...' : 'Confirm Disable'}
                                    </Button>
                                </div>
                            </form>
                        )}

                        {/* Password Section */}
                        <div className="space-y-6 pt-4 border-t">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <p className="font-semibold text-foreground">Sign-in Password</p>
                                    <p className="text-sm text-muted-foreground italic">Last changed: {user.password_rotated_at ? formatDate(user.password_rotated_at) : 'Never'}</p>
                                </div>
                                {!showPasswordForm && (
                                    <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowPasswordForm(true)}>
                                        <Key className="w-4 h-4" />
                                        Update Password
                                    </Button>
                                )}
                            </div>

                            {showPasswordForm && (
                                <div className="space-y-4 p-5 rounded-xl border bg-muted/20 animate-in slide-in-from-top-2">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="sm:col-span-2">
                                            <Input type="password" label="Current Password" value={passwordData.current} onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })} />
                                        </div>
                                        <Input type="password" label="New Password" value={passwordData.new} onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })} />
                                        <Input type="password" label="Confirm New Password" value={passwordData.confirm} onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })} />
                                    </div>
                                    <div className="flex justify-end gap-3 pt-2">
                                        <Button variant="ghost" size="sm" onClick={() => setShowPasswordForm(false)}>Cancel</Button>
                                        <Button size="sm" onClick={handlePasswordUpdate} disabled={loading}>Update Password</Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Modal for 2FA Enrollment */}
            {showTwoFactorEnrollmentModal && twoFactorEnrollment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <Card className="w-full max-w-lg shadow-2xl animate-in zoom-in-95">
                        <CardHeader className="flex flex-row items-center justify-between border-b">
                            <CardTitle>Setup Authenticator</CardTitle>
                            <button onClick={() => setShowTwoFactorEnrollmentModal(false)} className="p-1 rounded-md hover:bg-muted transition-colors"><X className="w-5 h-5" /></button>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-6">
                            <div className="bg-muted/30 p-4 rounded-xl flex flex-col items-center gap-4">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest text-center">Scan with your app</p>
                                <div className="p-3 bg-white rounded-xl shadow-inner border">
                                    <QRCodeSVG value={twoFactorEnrollment.provisioning_uri} size={180} />
                                </div>
                                <div className="w-full space-y-1 mt-2">
                                    <p className="text-xs font-medium text-muted-foreground">Secret Key (manual entry)</p>
                                    <code className="block w-full p-2 bg-background border rounded text-xs font-mono text-center select-all">{twoFactorEnrollment.secret}</code>
                                </div>
                            </div>

                            <form onSubmit={handleVerifyTwoFactorEnrollment} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Verification Code</label>
                                    <input 
                                        required
                                        autoFocus
                                        placeholder="000000"
                                        maxLength={6}
                                        value={twoFactorEnrollmentCode}
                                        onChange={(e) => setTwoFactorEnrollmentCode(e.target.value)}
                                        className="w-full h-12 text-center text-2xl font-bold tracking-[0.5em] rounded-xl border bg-background focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <Button type="button" variant="ghost" className="flex-1 h-11" onClick={() => setShowTwoFactorEnrollmentModal(false)}>Cancel</Button>
                                    <Button type="submit" className="flex-1 h-11" disabled={isVerifyingTwoFactorEnrollment}>
                                        {isVerifyingTwoFactorEnrollment ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enable 2FA'}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
