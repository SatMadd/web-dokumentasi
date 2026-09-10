"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Clock, Plus, Calendar } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, Input, Textarea } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/context/auth-context";
import { createClient } from "@/lib/supabase/client";
import { PengajuanIzin } from "@/types/database";

export default function IzinPage() {
  const { user, isHead } = useAuth();
  const supabase = createClient();

  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [izinList, setIzinList] = useState<PengajuanIzin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchIzin = useCallback(async (showLoading = true) => {
    if (!user) return;
    if (showLoading) setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("pengajuan_izin")
        .select(`
          *,
          user:profiles!pengajuan_izin_user_id_fkey(full_name, division)
        `)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setIzinList(data as any);
      } else {
        setIzinList([]);
      }
    } catch {
      setIzinList([]);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    if (!user) return;

    fetchIzin(true);

    // Set up Realtime channel on pengajuan_izin per logic.md section 6:
    // - For Member: scoped to their own user_id
    // - For Head: unfiltered (RLS SELECT permits seeing all rows)
    const channelName = isHead
      ? `realtime:pengajuan_izin:head`
      : `realtime:pengajuan_izin:member:${user.id}`;

    const channel = isHead
      ? supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "pengajuan_izin",
            },
            () => {
              fetchIzin(false);
            }
          )
          .subscribe()
      : supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "pengajuan_izin",
              filter: `user_id=eq.${user.id}`,
            },
            () => {
              fetchIzin(false);
            }
          )
          .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isHead, fetchIzin, supabase]);

  const handleSubmitIzin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);
    setFormError(null);

    try {
      const { error } = await supabase.from("pengajuan_izin").insert({
        user_id: user.id,
        reason: reason.trim(),
        start_date: startDate,
        end_date: endDate,
        status: "pending",
      });

      if (error) {
        setFormError(error.message);
      } else {
        setReason("");
        setStartDate("");
        setEndDate("");
        setShowForm(false);
        await fetchIzin();
      }
    } catch (err: any) {
      setFormError(err?.message || "Gagal mengajukan izin");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: "approved" | "rejected") => {
    if (!user || !isHead) return;

    try {
      await supabase
        .from("pengajuan_izin")
        .update({
          status: newStatus,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);

      await fetchIzin();
    } catch (err) {
      console.error("Update izin error:", err);
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
              Pengajuan Izin & Cuti
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
              {isHead
                ? "Tinjau dan proses permohonan izin dari anggota tim."
                : "Ajukan permohonan izin tidak hadir kegiatan atau cuti dinas."}
            </p>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowForm(!showForm)}
            icon={<Plus className="w-4 h-4" />}
          >
            {showForm ? "Tutup Formulir" : "Ajukan Izin"}
          </Button>
        </div>

        {showForm && (
          <Card className="animate-in fade-in">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4 pb-2 border-b border-[var(--border)]">
              Formulir Permohonan Izin
            </h2>

            {formError && (
              <div className="mb-4 p-3 bg-[var(--accent-red)]/15 border border-[var(--accent-red)]/30 rounded-[var(--radius-md)] text-xs text-[var(--accent-red)]">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmitIzin} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Tanggal Mulai *"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
                <Input
                  label="Tanggal Selesai *"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>

              <Textarea
                label="Alasan Pengajuan Izin *"
                placeholder="Jelaskan alasan izin secara ringkas dan jelas..."
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowForm(false)}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSubmitting}
                >
                  Kirim Pengajuan
                </Button>
              </div>
            </form>
          </Card>
        )}

        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Daftar Pengajuan
          </h2>

          {isLoading ? (
            <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
              Memuat pengajuan izin...
            </div>
          ) : izinList.length === 0 ? (
            <Card className="text-center py-12 text-xs text-[var(--text-secondary)]">
              Belum ada riwayat permohonan izin di sistem.
            </Card>
          ) : (
            izinList.map((item) => (
              <Card
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {item.user?.full_name || "Pemohon"}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      • {item.user?.division || "Umum"}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {item.reason}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-[var(--accent-blue)]">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {new Date(item.start_date).toLocaleDateString("id-ID")} –{" "}
                      {new Date(item.end_date).toLocaleDateString("id-ID")}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      item.status === "approved"
                        ? "green"
                        : item.status === "rejected"
                        ? "red"
                        : "orange"
                    }
                  >
                    {item.status === "approved"
                      ? "Disetujui"
                      : item.status === "rejected"
                      ? "Ditolak"
                      : "Menunggu Persetujuan"}
                  </Badge>

                  {isHead && item.status === "pending" && (
                    <div className="flex items-center gap-1.5 ml-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleUpdateStatus(item.id, "rejected")}
                        className="text-xs"
                      >
                        Tolak
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleUpdateStatus(item.id, "approved")}
                        className="text-xs"
                      >
                        Setujui
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
