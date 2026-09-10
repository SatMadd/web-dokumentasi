"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Bell, CheckSquare, CalendarCheck, Check, Clock } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/context/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Notification } from "@/types/database";

export default function NotifikasiPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarking, setIsMarking] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setNotifications(data as Notification[]);
      } else {
        if (error) console.warn("Fetch notifications error:", error.message);
        setNotifications([]);
      }
    } catch (err) {
      console.warn("Exception fetching notifications:", err);
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [user, fetchNotifications]);

  // Real database update per requirement:
  // UPDATE notifications SET is_read = true WHERE user_id = auth.uid()
  const markAllAsRead = async () => {
    if (!user || notifications.length === 0) return;
    setIsMarking(true);

    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) {
        console.error("Failed to mark notifications as read:", error.message);
      } else {
        // Re-fetch from database so state is 100% verified against Postgres
        await fetchNotifications();
      }
    } catch (err) {
      console.error("Exception marking notifications:", err);
    } finally {
      setIsMarking(false);
    }
  };

  const markSingleAsRead = async (notifId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notifId)
        .eq("user_id", user.id);

      if (!error) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
        );
      }
    } catch (err) {
      console.error("Exception marking single notification:", err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
              Notifikasi
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
              Pemberitahuan penugasan tugas dan status permohonan Anda.
            </p>
          </div>

          {unreadCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={markAllAsRead}
              isLoading={isMarking}
              icon={<Check className="w-3.5 h-3.5" />}
            >
              Tandai Semua Dibaca ({unreadCount})
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-xs text-[var(--text-secondary)]">
            Memuat notifikasi dari database...
          </div>
        ) : notifications.length === 0 ? (
          <Card className="text-center py-16 text-[var(--text-secondary)]">
            <Bell className="w-12 h-12 opacity-20 mx-auto mb-3" />
            <p className="text-sm font-medium">Belum ada notifikasi</p>
            <p className="text-xs mt-1">
              Pemberitahuan penugasan baru atau persetujuan izin akan muncul di sini.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => {
              const formattedTime = formatTimeAgo(new Date(n.created_at));

              return (
                <Card
                  key={n.id}
                  onClick={() => !n.is_read && markSingleAsRead(n.id)}
                  className={`flex items-start gap-3.5 transition-colors cursor-pointer ${
                    !n.is_read
                      ? "border-l-4 border-l-[var(--accent-blue)] bg-[var(--surface)]"
                      : "opacity-75 hover:opacity-100"
                  }`}
                >
                  <div className="mt-0.5 w-8 h-8 rounded-full bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-center shrink-0">
                    {n.type === "task_assigned" ? (
                      <CheckSquare className="w-4 h-4 text-[var(--accent-blue)]" />
                    ) : (
                      <CalendarCheck className="w-4 h-4 text-[var(--accent-orange)]" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                        {n.type === "task_assigned" ? "Penugasan Baru" : "Pemberitahuan"}
                      </h3>
                      <span className="text-[10px] text-[var(--text-secondary)] shrink-0 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formattedTime}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      {n.message}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "Baru saja";
  if (diffMin < 60) return `${diffMin} menit yang lalu`;
  if (diffHour < 24) return `${diffHour} jam yang lalu`;
  if (diffDay === 1) return "Kemarin";
  return `${diffDay} hari yang lalu`;
}
