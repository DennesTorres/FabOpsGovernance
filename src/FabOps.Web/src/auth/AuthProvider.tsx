import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { PublicClientApplication, AccountInfo, Configuration } from '@azure/msal-browser';
import { apiUrl } from '../config';

export interface AuthConfig {
  tenantId: string;
  clientId: string;
}

const STORAGE_KEY = 'fabops_auth_cfg';
const LOGIN_SCOPES = ['openid', 'profile', 'email'];

function buildMsalConfig(cfg: AuthConfig): Configuration {
  return {
    auth: {
      clientId: cfg.clientId,
      authority: `https://login.microsoftonline.com/${cfg.tenantId}`,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
  };
}

export interface AuthContextValue {
  account: AccountInfo | null;
  config: AuthConfig | null;
  isInitializing: boolean;
  /** True when the backend serves Entra tenant/client ids — i.e. interactive sign-in is set up. When false, the app runs without the sign-in gate. */
  authConfigured: boolean;
  error: string | null;
  login: (cfg: AuthConfig) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  /**
   * The signed-in user's ID token for calling the API (validated by the Function App's
   * App Service Authentication in Azure). Null when signed out or locally without auth.
   */
  getApiToken: () => Promise<string | null>;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authConfigured, setAuthConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const msalRef = useRef<PublicClientApplication | null>(null);
  const accountRef = useRef<AccountInfo | null>(null);

  // On mount: find out whether sign-in is configured on the backend, then restore any
  // existing MSAL session (handles the redirect flow). When sign-in isn't configured, the
  // app runs open (no gate) — the gate returns automatically once Entra ids are served.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(apiUrl('/api/secrets'));
        if (r.ok) {
          const d = (await r.json()) as { tenant_id: string | null; client_id: string | null };
          setAuthConfigured(!!(d.tenant_id && d.client_id));
        }
      } catch {
        // leave authConfigured = false (open access)
      }

      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const cfg = JSON.parse(raw) as AuthConfig;
          const inst = new PublicClientApplication(buildMsalConfig(cfg));
          await inst.initialize();
          const result = await inst.handleRedirectPromise();
          const restored = result?.account ?? inst.getAllAccounts()[0] ?? null;
          if (restored) {
            accountRef.current = restored;
            setAccount(restored);
            setConfig(cfg);
            msalRef.current = inst;
          }
        } catch {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      }

      setIsInitializing(false);
    })();
  }, []);

  const login = useCallback(async (cfg: AuthConfig) => {
    setError(null);
    try {
      // Store config before a possible redirect so we can restore on return.
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
      const inst = new PublicClientApplication(buildMsalConfig(cfg));
      await inst.initialize();
      msalRef.current = inst;
      setConfig(cfg);

      try {
        const resp = await inst.loginPopup({ scopes: LOGIN_SCOPES });
        accountRef.current = resp.account;
        setAccount(resp.account);
      } catch {
        // Popup blocked or dismissed — fall back to full-page redirect.
        await inst.loginRedirect({ scopes: LOGIN_SCOPES });
      }
    } catch (e: unknown) {
      sessionStorage.removeItem(STORAGE_KEY);
      msalRef.current = null;
      setConfig(null);
      setError(e instanceof Error ? e.message : 'Authentication failed');
    }
  }, []);

  const logout = useCallback(() => {
    const inst = msalRef.current;
    sessionStorage.removeItem(STORAGE_KEY);
    inst?.logoutPopup().catch(() => inst?.logoutRedirect());
    accountRef.current = null;
    setAccount(null);
    setConfig(null);
    msalRef.current = null;
  }, []);

  const getApiToken = useCallback(async (): Promise<string | null> => {
    const inst = msalRef.current;
    const acct = accountRef.current;
    if (!inst || !acct) return null;
    try {
      const result = await inst.acquireTokenSilent({ scopes: LOGIN_SCOPES, account: acct });
      return result.idToken || null;
    } catch {
      return null;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthCtx.Provider value={{ account, config, isInitializing, authConfigured, error, login, logout, clearError, getApiToken }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Fetches the sign-in configuration served by the backend (same contract as the reference project). */
export async function fetchAuthConfig(): Promise<AuthConfig> {
  const r = await fetch(apiUrl('/api/secrets'));
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = (await r.json()) as { tenant_id: string | null; client_id: string | null };
  if (!data.tenant_id || !data.client_id) {
    throw new Error('Sign-in is not configured: set Entra:TenantId and Entra:ClientId on the API.');
  }
  return { tenantId: data.tenant_id, clientId: data.client_id };
}
