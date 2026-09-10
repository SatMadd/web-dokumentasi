"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Search, X, Loader2, ChevronLeft, ChevronRight, User } from "lucide-react";
import { Profile } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/Badge";

interface AssigneeSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (assignee: Profile) => void;
  selectedIds?: string[];
}

export function AssigneeSearchModal({
  isOpen,
  onClose,
  onSelect,
  selectedIds = [],
}: AssigneeSearchModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);
  const [matchingUsers, setMatchingUsers] = useState<Profile[]>([]);
  // Independent pagination state per letter group: { 'A': 1, 'B': 2 }
  const [pageByLetter, setPageByLetter] = useState<Record<string, number>>({});

  const supabase = createClient();

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
      setHasQueried(false);
      setMatchingUsers([]);
      setPageByLetter({});
    }
  }, [isOpen]);

  // Exact 1.5 seconds debounce logic per logic.md section 4
  useEffect(() => {
    if (!searchTerm.trim()) {
      setIsDebouncing(false);
      setHasQueried(false);
      setMatchingUsers([]);
      return;
    }

    setIsDebouncing(true);
    const timer = setTimeout(async () => {
      setIsDebouncing(false);
      setHasQueried(true);

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .ilike("full_name", `%${searchTerm.trim()}%`);

        if (!error && data) {
          setMatchingUsers(data as Profile[]);
        } else {
          if (error) console.warn("Search profiles error:", error.message);
          setMatchingUsers([]);
        }
      } catch (err) {
        console.warn("Assignee query error:", err);
        setMatchingUsers([]);
      }
    }, 1500); // 1.5s debounce strictly per logic.md section 4

    return () => clearTimeout(timer);
  }, [searchTerm, supabase]);

  // Group matching users by first letter (A, B, C...)
  const groupedUsers = useMemo(() => {
    const groups: Record<string, Profile[]> = {};
    matchingUsers.forEach((u) => {
      const name = (u.full_name || "Tanpa Nama").trim();
      const firstChar = name.charAt(0).toUpperCase() || "#";
      if (!groups[firstChar]) {
        groups[firstChar] = [];
      }
      groups[firstChar].push(u);
    });

    // Sort letters alphabetically
    return Object.keys(groups)
      .sort()
      .reduce((acc, letter) => {
        // Sort names within group
        acc[letter] = groups[letter].sort((a, b) =>
          (a.full_name || "").localeCompare(b.full_name || "")
        );
        return acc;
      }, {} as Record<string, Profile[]>);
  }, [matchingUsers]);

  const changeGroupPage = (letter: string, delta: number, totalPages: number) => {
    const cur = pageByLetter[letter] || 1;
    const next = Math.max(1, Math.min(totalPages, cur + delta));
    setPageByLetter((prev) => ({ ...prev, [letter]: next }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)] animate-in fade-in duration-200">
      {/* Top Header bar with search input and X button */}
      <div className="flex items-center gap-3 p-4 bg-[var(--surface)] border-b border-[var(--border)] shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Tutup pencarian"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative flex-1">
          <input
            type="text"
            autoFocus
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Ketik nama anggota atau kepala..."
            className="w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-md)] pl-10 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/60 focus:outline-none focus:border-[var(--accent-blue)]"
          />
          <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-3.5" />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-3xl mx-auto w-full">
        {/* State 1: Blank until user types per logic.md section 4 */}
        {!searchTerm.trim() && !hasQueried && !isDebouncing && (
          <div className="h-full flex flex-col items-center justify-center text-center py-20 text-[var(--text-secondary)]">
            <User className="w-10 h-10 opacity-20 mb-3" />
            <p className="text-sm font-medium">Mulai mengetik untuk mencari nama</p>
            <p className="text-xs text-[var(--text-secondary)]/70 mt-1 max-w-xs">
              Pencarian akan memuat dari database 1.5 detik setelah selesai mengetik.
            </p>
          </div>
        )}

        {/* State 2: Debouncing / Fetching loading indicator */}
        {isDebouncing && (
          <div className="h-full flex flex-col items-center justify-center text-center py-20">
            <Loader2 className="w-7 h-7 text-[var(--accent-blue)] animate-spin mb-3" />
            <p className="text-xs text-[var(--text-secondary)]">Mencari nama di database...</p>
          </div>
        )}

        {/* State 3: Results grouped by letter with 10 per group pagination */}
        {!isDebouncing && hasQueried && (
          <div>
            {Object.keys(groupedUsers).length === 0 ? (
              <div className="text-center py-16 text-[var(--text-secondary)]">
                <p className="text-sm font-medium">Tidak ada nama yang cocok dengan "{searchTerm}"</p>
                <p className="text-xs mt-1">Pastikan nama terdaftar pada akun organisasi.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedUsers).map(([letter, users]) => {
                  const pageSize = 10;
                  const totalPages = Math.ceil(users.length / pageSize);
                  const currentPage = pageByLetter[letter] || 1;
                  const pagedUsers = users.slice(
                    (currentPage - 1) * pageSize,
                    currentPage * pageSize
                  );

                  return (
                    <div
                      key={letter}
                      className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden"
                    >
                      {/* Letter Group Header */}
                      <div className="bg-[var(--surface-hover)] px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
                        <span className="text-sm font-semibold text-[var(--accent-blue)]">
                          {letter}
                        </span>
                        {/* Independent Group Pagination Controls ("x of y") */}
                        {totalPages > 1 && (
                          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                            <span>
                              {currentPage} dari {totalPages}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={currentPage === 1}
                                onClick={() => changeGroupPage(letter, -1, totalPages)}
                                className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed"
                                aria-label="Halaman sebelumnya"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={currentPage === totalPages}
                                onClick={() => changeGroupPage(letter, 1, totalPages)}
                                className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed"
                                aria-label="Halaman berikutnya"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* User Items */}
                      <div className="divide-y divide-[var(--border)]">
                        {pagedUsers.map((itemUser) => {
                          const isAlreadySelected = selectedIds.includes(itemUser.id);
                          return (
                            <div
                              key={itemUser.id}
                              onClick={() => {
                                if (!isAlreadySelected) {
                                  onSelect(itemUser);
                                  onClose();
                                }
                              }}
                              className={`px-4 py-3 flex items-center justify-between transition-colors min-h-[52px] ${
                                isAlreadySelected
                                  ? "opacity-40 bg-[var(--surface-hover)]/40 cursor-not-allowed"
                                  : "hover:bg-[var(--surface-hover)] cursor-pointer"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-center text-xs font-medium text-[var(--text-secondary)]">
                                  {(itemUser.full_name || "?").charAt(0).toUpperCase()}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-[var(--text-primary)]">
                                    {itemUser.full_name}
                                  </span>
                                  <span className="text-xs text-[var(--text-secondary)]">
                                    {itemUser.division || "Umum"}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <Badge
                                  size="sm"
                                  variant={itemUser.role === "head" ? "blue" : "neutral"}
                                >
                                  {itemUser.role === "head" ? "Kepala" : "Anggota"}
                                </Badge>
                                {isAlreadySelected && (
                                  <span className="text-[11px] text-[var(--text-secondary)] italic">
                                    Sudah dipilih
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
