"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, ArrowRight, ShieldCheck, UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/context/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { switchDemoUser } = useAuth();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Mohon isi email dan kata sandi");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
      } else if (data.session) {
        router.push("/");
      }
    } catch {
      setError("Gagal menghubungi server otentikasi");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = (roleKey: "head" | "member1") => {
    switchDemoUser(roleKey);
    router.push("/");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[var(--bg)]">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Brand header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo size={44} showWordmark={false} />
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] mt-3">
            DOOR
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 tracking-wider uppercase">
            preserveD dOcumentatiOn progRam
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-2">
            Sistem dokumentasi rapat dan penugasan organisasi
          </p>
        </div>

        {/* Login Card */}
        <Card className="w-full">
          <form onSubmit={handleLogin} className="space-y-4">
            <h2 className="text-base font-medium text-[var(--text-primary)] mb-2">
              Masuk ke Akun
            </h2>

            {error && (
              <div className="p-3 text-xs bg-[var(--accent-red)]/15 border border-[var(--accent-red)]/30 rounded-[var(--radius-md)] text-[var(--accent-red)]">
                {error}
              </div>
            )}

            <Input
              label="Email"
              type="email"
              placeholder="nama@instansi.go.id"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              label="Kata Sandi"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              isLoading={isLoading}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Masuk
            </Button>
          </form>

          {/* Quick Demo Access Switcher */}
          <div className="mt-6 pt-6 border-t border-[var(--border)]">
            <p className="text-xs text-[var(--text-secondary)] text-center mb-3">
              Atau masuk cepat dengan peran simulasi:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleDemoLogin("head")}
                icon={<ShieldCheck className="w-4 h-4 text-[var(--accent-blue)]" />}
                className="text-xs justify-start"
              >
                Masuk sbg Kepala
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleDemoLogin("member1")}
                icon={<UserCheck className="w-4 h-4 text-[var(--status-success)]" />}
                className="text-xs justify-start"
              >
                Masuk sbg Anggota
              </Button>
            </div>
          </div>
        </Card>

        {/* Footer info */}
        <p className="text-[11px] text-[var(--text-secondary)]/70 text-center mt-6">
          DOOR aman dan menerapkan Row Level Security (RLS) di setiap transaksi data.
        </p>
      </div>
    </div>
  );
}
