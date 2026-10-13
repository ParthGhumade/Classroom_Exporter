import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
  "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
  "https://www.googleapis.com/auth/classroom.announcements.readonly",
].join(" ");

export interface UserProfile {
  email: string | null;
  name: string | null;
  avatarUrl?: string | null;
}

interface AuthContextType {
  authenticated: boolean;
  accessToken: string | null;
  user: UserProfile | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => void;
  setManualToken: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "classroom_exporter_access_token";
const EXPIRES_AT_KEY = "classroom_exporter_expires_at";
const USER_KEY = "classroom_exporter_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize from storage or Supabase session on load
  useEffect(() => {
    async function initAuth() {
      try {
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          if (data.session?.provider_token) {
            setAccessToken(data.session.provider_token);
            setUser({
              email: data.session.user.email ?? null,
              name: data.session.user.user_metadata?.full_name ?? data.session.user.email ?? null,
              avatarUrl: data.session.user.user_metadata?.avatar_url ?? null,
            });
            setIsLoading(false);
            return;
          }
        }

        const storedToken = localStorage.getItem(TOKEN_KEY);
        const storedExpiresAt = localStorage.getItem(EXPIRES_AT_KEY);
        const storedUser = localStorage.getItem(USER_KEY);

        if (storedToken && storedExpiresAt && Number(storedExpiresAt) > Date.now()) {
          setAccessToken(storedToken);
          if (storedUser) {
            setUser(JSON.parse(storedUser));
          }
        } else {
          // Token expired
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(EXPIRES_AT_KEY);
          localStorage.removeItem(USER_KEY);
        }
      } catch (err) {
        console.error("Auth init error:", err);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  const fetchUserInfo = async (token: string): Promise<UserProfile> => {
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch user info");
      const data = await res.json();
      return {
        email: data.email ?? null,
        name: data.name ?? null,
        avatarUrl: data.picture ?? null,
      };
    } catch {
      return { email: null, name: null, avatarUrl: null };
    }
  };

  const loginWithGoogleGIS = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) {
        reject(new Error("VITE_GOOGLE_CLIENT_ID is not configured in .env"));
        return;
      }

      // Check if Google Identity Services script is loaded
      const google = (window as any).google;
      if (!google?.accounts?.oauth2) {
        reject(new Error("Google Identity Services library not yet loaded. Please refresh."));
        return;
      }

      try {
        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_SCOPES,
          callback: async (resp: any) => {
            if (resp.error) {
              reject(new Error(resp.error_description || resp.error));
              return;
            }
            if (resp.access_token) {
              const token = resp.access_token;
              const expiresIn = Number(resp.expires_in) || 3600;
              const expiresAt = Date.now() + expiresIn * 1000;

              setAccessToken(token);
              localStorage.setItem(TOKEN_KEY, token);
              localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt));

              const profile = await fetchUserInfo(token);
              setUser(profile);
              localStorage.setItem(USER_KEY, JSON.stringify(profile));

              resolve();
            }
          },
        });

        tokenClient.requestAccessToken({ prompt: "consent" });
      } catch (err) {
        reject(err);
      }
    });
  };

  const login = async () => {
    setIsLoading(true);
    try {
      if (supabase) {
        // If Supabase is used, initiate OAuth with scopes
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            scopes: GOOGLE_SCOPES,
            redirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        return;
      }

      await loginWithGoogleGIS();
    } finally {
      setIsLoading(false);
    }
  };

  const setManualToken = async (token: string) => {
    const expiresAt = Date.now() + 3600 * 1000;
    setAccessToken(token);
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt));

    const profile = await fetchUserInfo(token);
    setUser(profile);
    localStorage.setItem(USER_KEY, JSON.stringify(profile));
  };

  const logout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
    localStorage.removeItem(USER_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        authenticated: Boolean(accessToken),
        accessToken,
        user,
        isLoading,
        login,
        logout,
        setManualToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
