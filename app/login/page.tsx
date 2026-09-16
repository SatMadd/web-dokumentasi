"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, User, Lock, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError(null);
    setPasswordError(null);
    setGeneralError(null);

    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername) {
      setUsernameError("Username wajib diisi");
      return;
    }

    if (!password) {
      setPasswordError("Password wajib diisi");
      return;
    }

    setIsLoading(true);

    try {
      // Map username to fixed-domain email: username@door.id
      const email = cleanUsername.includes("@")
        ? cleanUsername
        : `${cleanUsername}@door.id`;

      // 1. Check if user exists using the RPC check_user_exists
      let userExists: boolean | null = null;
      try {
        const { data: exists, error: rpcError } = await supabase.rpc("check_user_exists", {
          p_email: email,
        });
        if (!rpcError && typeof exists === "boolean") {
          userExists = exists;
        }
      } catch {
        // If RPC is not available yet, fall back to login attempt
        userExists = null;
      }

      // If RPC confirmed user does not exist:
      if (userExists === false) {
        setUsernameError("Username tidak ditemukan");
        setIsLoading(false);
        return;
      }

      // 2. Attempt signInWithPassword
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.warn("Auth error:", authError.message, authError.status);
        const errMsg = authError.message.toLowerCase();

        if (
          authError.status === 400 ||
          errMsg.includes("invalid login credentials") ||
          errMsg.includes("invalid_credentials")
        ) {
          // If we already verified username exists via RPC, it must be wrong password
          if (userExists === true) {
            setPasswordError("Password salah");
          } else {
            // If RPC was unavailable, double check by testing if username exists in profiles or give specific guidance
            setPasswordError("Password salah atau akun tidak ditemukan");
          }
        } else if (errMsg.includes("email not confirmed")) {
          setPasswordError("Akun belum dikonfirmasi. Pastikan script seed telah dijalankan.");
        } else {
          setGeneralError(authError.message);
        }
      } else if (data?.session) {
        // Successful login! Redirect to dashboard
        router.push("/");
        router.refresh();
      }
    } catch (err: any) {
      setGeneralError(err?.message || "Gagal menghubungi server otentikasi");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[var(--bg)]">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Brand header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <h1 className="text-3xl font-bold tracking-wider text-[var(--text-primary)]">
            DOOR
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1 tracking-wider uppercase">
            preserveD dOcumentatiOn progRam
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            Sistem dokumentasi rapat dan penugasan organisasi
          </p>
        </div>

        {/* Login Card */}
        <Card className="w-full">
          <form onSubmit={handleLogin} className="space-y-4">
            <h2 className="text-base font-medium text-[var(--text-primary)] mb-2">
              Masuk ke Akun
            </h2>

            {generalError && (
              <div className="p-3 text-xs bg-[var(--accent-red)]/15 border border-[var(--accent-red)]/30 rounded-[var(--radius-md)] text-[var(--accent-red)]">
                {generalError}
              </div>
            )}

            {/* Username Input with individual error display */}
            <div className="flex flex-col gap-1 w-full">
              <Input
                label="Username"
                type="text"
                placeholder="Contoh: suprapto atau budi"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setUsernameError(null);
                }}
                error={usernameError || undefined}
                required
                autoFocus
              />
            </div>

            {/* Password Input with individual error display and visibility toggle */}
            <div className="flex flex-col gap-1 w-full">
              <Input
                label="Password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError(null);
                }}
                error={passwordError || undefined}
                required
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus:outline-none"
                    aria-label={showPassword ? "Sembunyikan password" : "Lihat password"}
                    title={showPassword ? "Sembunyikan password" : "Lihat password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                }
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-3"
              isLoading={isLoading}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Masuk
            </Button>
          </form>
        </Card>

      </div>
    </div>
  );
}
