"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Profile, UserRole } from "@/types/database";

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  role: UserRole;
  isHead: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.warn("Error fetching user profile:", error.message);
        return null;
      }
      return data as Profile | null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.warn("Session error:", error.message);
        }

        if (session?.user) {
          if (isMounted) setUser(session.user);
          const p = await fetchProfile(session.user.id);
          if (isMounted) {
            if (p) {
              setProfile(p);
            } else {
              // Construct profile from user metadata if profiles row is not yet queried
              const meta = session.user.user_metadata || {};
              setProfile({
                id: session.user.id,
                full_name: meta.full_name || session.user.email?.split("@")[0] || "Pengguna",
                role: (meta.role as UserRole) || "member",
                division: meta.division || "Umum",
                avatar_url: meta.avatar_url || null,
                created_at: session.user.created_at || new Date().toISOString(),
              });
            }
          }
        } else {
          if (isMounted) {
            setUser(null);
            setProfile(null);
          }
        }
      } catch (err) {
        console.error("Auth init exception:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          const p = await fetchProfile(session.user.id);
          if (p) {
            setProfile(p);
          } else {
            const meta = session.user.user_metadata || {};
            setProfile({
              id: session.user.id,
              full_name: meta.full_name || session.user.email?.split("@")[0] || "Pengguna",
              role: (meta.role as UserRole) || "member",
              division: meta.division || "Umum",
              avatar_url: meta.avatar_url || null,
              created_at: session.user.created_at || new Date().toISOString(),
            });
          }
        } else {
          setUser(null);
          setProfile(null);
        }
        setIsLoading(false);
      }
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Route protection: redirect unauthenticated users to /login
  useEffect(() => {
    if (!isLoading && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [isLoading, user, pathname, router]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("SignOut error:", err);
    }
    setUser(null);
    setProfile(null);
    router.replace("/login");
  };

  const refreshProfile = async () => {
    if (user) {
      const p = await fetchProfile(user.id);
      if (p) setProfile(p);
    }
  };

  const role: UserRole = profile?.role || "member";
  const isHead = role === "head";

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        isHead,
        isLoading,
        signOut,
        refreshProfile,
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
