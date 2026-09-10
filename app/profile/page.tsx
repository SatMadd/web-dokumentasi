"use client";

import React, { useState } from "react";
import { User, Shield, Building, Mail, Check, LogOut } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, Input } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/context/auth-context";

export default function ProfilePage() {
  const { profile, isHead, signOut, switchDemoUser } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [division, setDivision] = useState(profile?.division || "");
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
            Profil Pengguna
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            Informasi identitas akun dan peran Anda dalam sistem DOOR.
          </p>
        </div>

        <Card className="space-y-6">
          {/* Header avatar & role */}
          <div className="flex items-center gap-4 pb-6 border-b border-[var(--border)]">
            <div className="w-16 h-16 rounded-full bg-[var(--surface-hover)] border-2 border-[var(--accent-blue)] flex items-center justify-center text-xl font-bold text-[var(--text-primary)]">
              {(profile?.full_name || "U").charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {profile?.full_name}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {profile?.division || "Divisi Operasional"}
              </p>
              <div className="mt-2">
                <Badge variant={isHead ? "blue" : "neutral"} size="sm">
                  {isHead ? "Peran: Kepala (Head)" : "Peran: Anggota (Member)"}
                </Badge>
              </div>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <Input
              label="Nama Lengkap"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />

            <Input
              label="Divisi / Satuan Kerja"
              value={division}
              onChange={(e) => setDivision(e.target.value)}
              required
            />

            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
                Tingkat Akses / Peran (Ditentukan oleh Administrator)
              </label>
              <div className="p-3 bg-[var(--surface-hover)]/70 border border-[var(--border)] rounded-[var(--radius-md)] text-xs text-[var(--text-secondary)] flex items-center justify-between">
                <span>{isHead ? "Kepala (Head) — Hak Buat Tugas & Persetujuan" : "Anggota (Member) — Pelaksana & Pelapor"}</span>
                <Shield className="w-4 h-4 text-[var(--accent-blue)]" />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              {isSaved ? (
                <span className="text-xs text-[var(--status-success)] flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Perubahan berhasil disimpan
                </span>
              ) : <div />}

              <Button type="submit" variant="primary" size="sm">
                Simpan Profil
              </Button>
            </div>
          </form>

          {/* Quick testing switch */}
          <div className="pt-4 border-t border-[var(--border)]">
            <span className="text-xs font-medium text-[var(--text-secondary)] block mb-2">
              Uji Coba Peran Lain (Mode Pengujian):
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => switchDemoUser("head")}
                className="text-xs"
              >
                Ubah ke Kepala (Head)
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => switchDemoUser("member1")}
                className="text-xs"
              >
                Ubah ke Anggota (Member)
              </Button>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)]">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => signOut()}
              icon={<LogOut className="w-3.5 h-3.5" />}
            >
              Keluar dari Sesi
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
