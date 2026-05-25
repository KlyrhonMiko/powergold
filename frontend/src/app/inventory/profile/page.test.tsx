import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: {
    user_id: 'USER-001',
    username: 'staff.user',
    email: 'staff@example.com',
    first_name: 'Staff',
    last_name: 'User',
    middle_name: '',
    contact_number: '09123456789',
    role: 'staff',
    password_rotated_at: '2026-04-01T00:00:00.000Z',
  },
  refreshUser: vi.fn(),
  updateMe: vi.fn(),
  getTwoFactorStatus: vi.fn(),
  initiateTwoFactorEnrollment: vi.fn(),
  verifyTwoFactorEnrollment: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mocks.user,
    refreshUser: mocks.refreshUser,
  }),
}));

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');

  return {
    ...actual,
    auth: {
      ...actual.auth,
      updateMe: mocks.updateMe,
    },
  };
});

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    api: {
      ...actual.api,
      getTwoFactorStatus: mocks.getTwoFactorStatus,
      initiateTwoFactorEnrollment: mocks.initiateTwoFactorEnrollment,
      verifyTwoFactorEnrollment: mocks.verifyTwoFactorEnrollment,
    },
  };
});

vi.mock('sonner', () => ({
  toast: {
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock('lucide-react', () => {
  const Icon = () => <svg aria-hidden="true" />;

  return {
    User: Icon,
    Mail: Icon,
    Phone: Icon,
    Shield: Icon,
    Key: Icon,
    Smartphone: Icon,
    Loader2: Icon,
    Edit3: Icon,
    Save: Icon,
    X: Icon,
  };
});

import ProfilePage from './page';

describe('inventory profile two-factor enrollment', () => {
  beforeEach(() => {
    mocks.refreshUser.mockReset();
    mocks.updateMe.mockReset();
    mocks.getTwoFactorStatus.mockReset();
    mocks.initiateTwoFactorEnrollment.mockReset();
    mocks.verifyTwoFactorEnrollment.mockReset();
    mocks.toastInfo.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it('starts optional 2FA enrollment from profile security section', async () => {
    mocks.getTwoFactorStatus.mockResolvedValue({
      enabled: false,
      method: 'authenticator_app',
      enrolled_at: null,
    });
    mocks.initiateTwoFactorEnrollment.mockResolvedValue({
      method: 'authenticator_app',
      secret: 'ABCDEF123456',
      provisioning_uri: 'otpauth://totp/PowerGold:staff@example.com?secret=ABCDEF123456',
    });

    render(<ProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Set up 2FA' }));

    await waitFor(() => {
      expect(mocks.initiateTwoFactorEnrollment).toHaveBeenCalledTimes(1);
    });

    expect(mocks.getTwoFactorStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Protect your account with an additional security layer')).toBeInTheDocument();

    expect(screen.getByText('Setup Authenticator')).toBeInTheDocument();
  });
});
