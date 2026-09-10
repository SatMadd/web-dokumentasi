"use client";

import React, { useState } from "react";
import { CalendarCheck, Clock, Plus, CheckCircle, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, Input, Textarea } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/context/auth-context";

export default function IzinPage() {
  const { profile, isHead } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const sampleIzin = [
    {
      id: "iz-1",
      user: "Budi Santoso",
      division: "Divisi Dokumentasi & Acara",
      reason: "Cuti keperluan keluarga / mendesak",
      dates: "15 Sep 2026 – 16 Sep 2026",
      status: "pending",
    },
    {
      id: "iz-2",
      user: "Siti Rahma",
      division: "Divisi Dokumentasi & Acara",
      reason: "Izin sakit dengan surat dokter",
      dates: "10 Sep 2026",
      status: "approved",
    },
  ];

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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                alert("Pengajuan izin berhasil dikirimkan.");
                setShowForm(false);
              }}
              className="space-y-4"
            >
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
                <Button type="submit" variant="primary" size="sm">
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
          {sampleIzin.map((item) => (
            <Card key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {item.user}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    • {item.division}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  {item.reason}
                </p>
                <div className="flex items-center gap-1.5 mt-2 text-xs text-[var(--accent-blue)]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{item.dates}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={item.status === "approved" ? "green" : "orange"}>
                  {item.status === "approved" ? "Disetujui" : "Menunggu Persetujuan"}
                </Badge>
                {isHead && item.status === "pending" && (
                  <div className="flex items-center gap-1.5 ml-2">
                    <Button variant="secondary" size="sm" className="text-xs">
                      Tolak
                    </Button>
                    <Button variant="primary" size="sm" className="text-xs">
                      Setujui
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
