"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Profile, UserRole } from "@/types/database";

// Predefined demo profiles for quick testing/fallback
export const DEMO_PROFILES: Record<string, Profile> = {
  head: {
    id: "00000000-0000-0000-0000-000000000001",
    full_name: "Suprapto (Kepala Bagian)",
    role: "head",
    division: "Bagian Operasional & Perencanaan",
    avatar_url: null,
    created_at: new Date().toISOString(),
  },
  member1: {
    id: "00000000-0000-0000-0000-000000000002",
    full_name: "Budi Santoso",
    role: "member",
    division: "Divisi Dokumentasi & Acara",
    avatar_url: null,
    created_at: new Date().toISOString(),
  },
  member2: {
    id: "00000000-0000-0000-0000-000000000003",
    full_name: "Siti Rahma",
    role: "member",
    division: "Divisi Dokumentasi & Acara",
    avatar_url: null,
    created_at: new Date().toISOString(),
  },
  head2: {
    id: "00000000-0000-0000-0000-000000000004",
    full_name: "Hendra Wijaya (Kepala Divisi)",
    role: "head",
    division: "Divisi TI & Infrastruktur",
    avatar_url: null,
    created_at: new Date().toISOString(),
  },
};

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  role: UserRole;
  isHead: boolean;
  isLoading: boolean;
  isDemoMode: boolean;
  signOut: () => Promise<void>;
  switchDemoUser: (key: "head" | "member1" | "member2" | "head2") => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(DEMO_PROFILES.head);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const supabase = createClient();

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.warn("Could not fetch profile from Supabase:", error.message);
        return null;
      }
      return data as Profile;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          const userProfile = await fetchProfile(session.user.id);
          if (userProfile) {
            setProfile(userProfile);
            setIsDemoMode(false);
          } else {
            // Default profile from session metadata
            const fallback: Profile = {
              id: session.user.id,
              full_name: session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "User",
              role: (session.user.user_metadata?.role as UserRole) || "member",
              division: session.user.user_metadata?.division || "Umum",
              avatar_url: null,
              created_at: new Date().toISOString(),
            };
            setProfile(fallback);
          }
        } else {
          // Check if user set a demo preference in localStorage
          const savedDemo = localStorage.getItem("door_demo_user");
          if (savedDemo && DEMO_PROFILES[savedDemo]) {
            setProfile(DEMO_PROFILES[savedDemo]);
          } else {
            setProfile(DEMO_PROFILES.head);
          }
          setIsDemoMode(true);
        }
      } catch (err) {
        console.error("Auth initialization error:", err);
        setIsDemoMode(true);
      } finally {
        setIsLoading(false);
      }
    };

    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          const p = await fetchProfile(session.user.id);
          if (p) {
            setProfile(p);
            setIsDemoMode(false);
          }
        } else if (!isDemoMode) {
          setUser(null);
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const switchDemoUser = (key: "head" | "member1" | "member2" | "head2") => {
    if (DEMO_PROFILES[key]) {
      setProfile(DEMO_PROFILES[key]);
      localStorage.setItem("door_demo_user", key);
      setIsDemoMode(true);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    setUser(null);
    setProfile(DEMO_PROFILES.member1);
    localStorage.setItem("door_demo_user", "member1");
    setIsDemoMode(true);
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
        isDemoMode,
        signOut,
        switchDemoUser,
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
