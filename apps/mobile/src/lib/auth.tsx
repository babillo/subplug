// Who is signed in. The token is read from secure storage when the app opens and checked
// with the server; a rejected token (expired, signed out elsewhere, suspended) signs out here too.
import type { ApiUser } from "@repo/shared/api";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api, ApiError, configureApi } from "./api";
import { deleteSecure, readSecure, TOKEN_KEY, writeSecure } from "./token-store";

type AuthState =
  | { status: "loading"; user: null }
  | { status: "signed_out"; user: null }
  /** We have a token but couldn't reach the server to check it. */
  | { status: "offline"; user: null }
  | { status: "signed_in"; user: ApiUser };

interface Auth {
  state: AuthState;
  /** Call after a successful sign-in with the token from the server. */
  signedIn: (token: string, user: ApiUser) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-reads the user (e.g. after setting or resetting the PIN). */
  refreshUser: () => Promise<void>;
  /** Tries the start-up check again (after being offline). */
  retry: () => void;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });

  const forget = useCallback(async () => {
    configureApi({ token: null });
    await deleteSecure(TOKEN_KEY).catch(() => undefined);
    setState({ status: "signed_out", user: null });
  }, []);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    configureApi({ token: null, onSignedOut: () => void forget() });
    (async () => {
      const token = await readSecure(TOKEN_KEY).catch(() => null);
      if (!token) return setState({ status: "signed_out", user: null });
      configureApi({ token });
      try {
        const { user } = await api<{ user: ApiUser }>("/api/auth/me");
        setState({ status: "signed_in", user });
      } catch (error) {
        // No connection: keep the token and offer to retry. Rejected token: sign out.
        if (error instanceof ApiError && error.status === 0) {
          setState({ status: "offline", user: null });
        } else {
          await forget();
        }
      }
    })();
  }, [forget, attempt]);

  const auth = useMemo<Auth>(
    () => ({
      state,
      signedIn: async (token, user) => {
        await writeSecure(TOKEN_KEY, token);
        configureApi({ token });
        setState({ status: "signed_in", user });
      },
      signOut: async () => {
        await api("/api/auth/sign-out", {}).catch(() => undefined);
        await forget();
      },
      refreshUser: async () => {
        const { user } = await api<{ user: ApiUser }>("/api/auth/me");
        setState({ status: "signed_in", user });
      },
      retry: () => {
        setState({ status: "loading", user: null });
        setAttempt((n) => n + 1);
      },
    }),
    [state, forget],
  );

  return <AuthContext value={auth}>{children}</AuthContext>;
}

export function useAuth(): Auth {
  const auth = use(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside <AuthProvider>");
  return auth;
}

/** The signed-in user. Only for screens that are shown when signed in. */
export function useUser(): ApiUser {
  const { state } = useAuth();
  if (state.status !== "signed_in") throw new Error("Not signed in");
  return state.user;
}
