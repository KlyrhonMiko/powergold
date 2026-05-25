import { http, HttpRequestError, MaintenanceError } from '@/lib/http';
import { tokenStore } from '@/lib/tokenStore';

export interface User {
  user_id: string;
  username: string;
  email?: string | null;
  first_name: string;
  last_name: string;
  middle_name?: string;
  contact_number?: string;
  password?: string;
  current_password?: string;
  password_rotated_at?: string;
  role: string;
  is_active?: boolean;
}

interface SessionPolicyApiPayload {
  inactive_minutes?: number;
  warning_minutes?: number;
}

interface SessionTimerPolicy {
  inactiveMinutes: number;
  warningMinutes: number;
}

const DEFAULT_SESSION_TIMER_POLICY: SessionTimerPolicy = {
  inactiveMinutes: 30,
  warningMinutes: 5,
};

const POLICY_CACHE_TTL_MS = 5 * 60 * 1000;

let logoutTimer: NodeJS.Timeout | null = null;
let lastActivityTime = Date.now();
let listenersBound = false;
let sessionTimerPolicyCache: SessionTimerPolicy | null = null;
let sessionTimerPolicyFetchedAt = 0;
let sessionTimerPolicyPromise: Promise<SessionTimerPolicy> | null = null;

const activityEvents: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll'];

const updateActivity = () => {
  lastActivityTime = Date.now();
};

function bindActivityListeners(): void {
  if (typeof window === 'undefined' || listenersBound) return;

  for (const eventName of activityEvents) {
    window.addEventListener(eventName, updateActivity, { passive: true });
  }
  listenersBound = true;
}

function unbindActivityListeners(): void {
  if (typeof window === 'undefined' || !listenersBound) return;

  for (const eventName of activityEvents) {
    window.removeEventListener(eventName, updateActivity);
  }
  listenersBound = false;
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payloadBase64Url = token.split('.')[1];
    if (!payloadBase64Url) return null;
    const payloadBase64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
    const payloadJson = atob(payloadBase64);
    return JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function clampMinutes(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.floor(value);
  return Math.min(max, Math.max(min, rounded));
}

function normalizeSessionTimerPolicy(
  payload: SessionPolicyApiPayload | undefined
): SessionTimerPolicy {
  const inactiveMinutes = clampMinutes(
    payload?.inactive_minutes,
    DEFAULT_SESSION_TIMER_POLICY.inactiveMinutes,
    5,
    1440,
  );

  const warningCandidate = clampMinutes(
    payload?.warning_minutes,
    DEFAULT_SESSION_TIMER_POLICY.warningMinutes,
    1,
    60,
  );

  const warningMinutes = Math.min(warningCandidate, Math.max(1, inactiveMinutes - 1));

  return {
    inactiveMinutes,
    warningMinutes,
  };
}

function isPolicyCacheFresh(): boolean {
  if (!sessionTimerPolicyCache) return false;
  return Date.now() - sessionTimerPolicyFetchedAt < POLICY_CACHE_TTL_MS;
}

async function getSessionTimerPolicy(): Promise<SessionTimerPolicy> {
  if (isPolicyCacheFresh() && sessionTimerPolicyCache) {
    return sessionTimerPolicyCache;
  }

  if (sessionTimerPolicyPromise) {
    return sessionTimerPolicyPromise;
  }

  sessionTimerPolicyPromise = (async () => {
    try {
      const response = await http.request<SessionPolicyApiPayload>('/auth/session-policy', {
        method: 'GET',
      });

      const resolvedPolicy = normalizeSessionTimerPolicy(response.data);
      sessionTimerPolicyCache = resolvedPolicy;
      sessionTimerPolicyFetchedAt = Date.now();
      return resolvedPolicy;
    } catch (error: unknown) {
      if (error instanceof HttpRequestError && error.status === 401) {
        throw error;
      }

      const fallbackPolicy = sessionTimerPolicyCache ?? DEFAULT_SESSION_TIMER_POLICY;
      sessionTimerPolicyCache = fallbackPolicy;
      sessionTimerPolicyFetchedAt = Date.now();
      return fallbackPolicy;
    } finally {
      sessionTimerPolicyPromise = null;
    }
  })();

  return sessionTimerPolicyPromise;
}

function startTokenTimer(token: string, policy: SessionTimerPolicy): void {
  auth.clearTokenTimer();
  bindActivityListeners();

  try {
    const payload = parseJwtPayload(token);

    if (!payload || typeof payload.exp !== 'number') return;

    const checkInterval = 60 * 1000; // Check every 1 minute
    const refreshThreshold = policy.warningMinutes * 60 * 1000;
    const idleTimeout = policy.inactiveMinutes * 60 * 1000;

    logoutTimer = setInterval(async () => {
      const currentToken = auth.getToken();
      if (!currentToken) {
        auth.clearTokenTimer();
        return;
      }

      try {
        const currentPayload = parseJwtPayload(currentToken);
        if (!currentPayload || typeof currentPayload.exp !== 'number') {
          auth.logout();
          return;
        }

        const currentExpTime = currentPayload.exp * 1000;
        const now = Date.now();
        const timeRemaining = currentExpTime - now;

        if (timeRemaining <= 0) {
          auth.logout();
        } else if (timeRemaining <= refreshThreshold) {
          if (now - lastActivityTime < idleTimeout) {
            try {
              const refreshResponse = await http.request<{ access_token: string }>('/auth/refresh', {
                method: 'POST',
                headers: { Authorization: `Bearer ${currentToken}` },
              });

              const refreshedToken =
                (refreshResponse as { access_token?: string }).access_token ||
                refreshResponse.data?.access_token;

              if (refreshedToken) {
                // Update the token in storage, this keeps the refresh cycle active.
                tokenStore.setToken(refreshedToken);
              }
            } catch (error: unknown) {
              if (error instanceof HttpRequestError && error.status === 401) {
                auth.logout();
              }

              // Keep existing token until expiry if refresh fails transiently.
            }
          } else {
            // User is idle but token not yet expired. Just wait for natural expiration.
          }
        }
      } catch {
        auth.clearTokenTimer();
      }
    }, checkInterval);
  } catch {
    auth.clearTokenTimer();
  }
}

export const auth = {
  setupTokenTimer: (token: string, policyOverride?: SessionTimerPolicy) => {
    if (typeof window === 'undefined') return;
    const initialPolicy = policyOverride ?? sessionTimerPolicyCache ?? DEFAULT_SESSION_TIMER_POLICY;
    startTokenTimer(token, initialPolicy);

    if (policyOverride) {
      return;
    }

    void getSessionTimerPolicy()
      .then((resolvedPolicy) => {
        const currentToken = auth.getToken();
        if (!currentToken || currentToken !== token) {
          return;
        }

        const policyChanged =
          resolvedPolicy.inactiveMinutes !== initialPolicy.inactiveMinutes ||
          resolvedPolicy.warningMinutes !== initialPolicy.warningMinutes;

        if (policyChanged) {
          auth.setupTokenTimer(currentToken, resolvedPolicy);
        }
      })
      .catch(() => {
        // Keep timer running with fallback policy if policy fetch fails.
      });
  },

  clearTokenTimer: () => {
    if (logoutTimer) {
      clearInterval(logoutTimer);
      logoutTimer = null;
    }
  },
  setToken: (token: string) => {
    tokenStore.setToken(token);
    auth.setupTokenTimer(token);
  },

  getToken: () => {
    return tokenStore.getToken();
  },

  clearToken: () => {
    tokenStore.clearToken();
    auth.clearTokenTimer();
    unbindActivityListeners();
  },

  logout: async (redirectTo = '/auth/login') => {
    if (typeof window !== 'undefined') {
      const token = tokenStore.getToken();
      auth.clearToken();

      if (token) {
        void http.request('/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          keepalive: true,
        }).catch(() => {
          // Ignore network errors during logout and proceed with client redirect.
        });
      }

      window.location.replace(redirectTo);
    }
  },

  isAuthenticated: () => {
    return tokenStore.hasToken();
  },

  getUser: async (): Promise<User | null> => {
    const token = auth.getToken();
    if (!token) return null;

    try {
      const result = await http.request<User>('/auth/me', { method: 'GET' });
      return result.data;
    } catch (error) {
      // Preserve maintenance flow for overlay handling.
      if (error instanceof MaintenanceError) {
        throw error;
      }

      // Treat invalid session/auth states as logged out.
      if (
        error instanceof HttpRequestError
        && [401, 403, 404].includes(error.status)
      ) {
        auth.clearToken();
        return null;
      }

      throw error;
    }
  },
  updateMe: async (data: Partial<User>): Promise<User> => {
    const response = await http.request<User>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return response.data;
  },

  getRedirectPath: (role?: string): string => {
    if (!role) return '/auth/login';

    const ROLE_REDIRECT_MAP: Record<string, string> = {
      'admin': '/admin/dashboard',
      'inventory_manager': '/inventory/dashboard',
      'dispatch': '/inventory/dashboard',
      'borrower': '/borrower/history',
      'brwr': '/borrower/history',
      'finance_manager': '/inventory/dashboard',
      'accountant': '/inventory/dashboard',
      'employee': '/borrow_portal/request_form',
    };

    return ROLE_REDIRECT_MAP[role.toLowerCase()] || '/borrow_portal/request_form';
  }
};
