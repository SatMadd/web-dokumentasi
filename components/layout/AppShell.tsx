"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  FileText,
  CalendarCheck,
  Bell,
  User as UserIcon,
  Sun,
  Moon,
  Plus,
  Menu,
  X,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";
import { useTheme } from "@/lib/context/theme-context";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { profile, role, isHead, signOut, switchDemoUser, isDemoMode } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Tugas", href: "/tugas", icon: CheckSquare },
    { name: "Riwayat Laporan", href: "/riwayat", icon: FileText, shortName: "Riwayat" },
    { name: "Pengajuan Izin", href: "/izin", icon: CalendarCheck, shortName: "Izin" },
    { name: "Notifikasi", href: "/notifikasi", icon: Bell },
    { name: "Profile", href: "/profile", icon: UserIcon },
  ];

  const mobileNavItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Tugas", href: "/tugas", icon: CheckSquare },
    { name: "Riwayat", href: "/riwayat", icon: FileText },
    { name: "Izin", href: "/izin", icon: CalendarCheck },
    { name: "Profile", href: "/profile", icon: UserIcon },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text-primary)]">
      {/* 1. Desktop Top Navigation (>1024px) */}
      <header className="sticky top-0 z-40 w-full bg-[var(--surface)]/95 backdrop-blur-xs border-b border-[var(--border)] px-4 sm:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4 sm:gap-8">
          {/* Mobile menu hamburger toggle */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="lg:hidden p-2 rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Toggle menu"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <Link href="/" className="flex items-center">
            <BrandLogo size={28} />
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-[var(--radius-md)] text-sm font-medium transition-colors ${
                    active
                      ? "text-[var(--accent-blue)] bg-[var(--surface-hover)] border-b-2 border-[var(--accent-blue)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Head-Only Task Creation Button */}
          {isHead && (
            <Link href="/tugas/baru" className="hidden sm:inline-flex">
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
              >
                Buat Tugas
              </Button>
            </Link>
          )}

          {/* Theme Toggle (Sun/Moon per design.md section 7) */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
            aria-label="Ganti Tema"
            title={theme === "dark" ? "Ganti ke tema terang" : "Ganti ke tema gelap"}
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          {/* Notification bell */}
          <Link
            href="/notifikasi"
            className="relative p-2 rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
            aria-label="Notifikasi"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[var(--accent-blue)]" />
          </Link>

          {/* Profile & Role Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center gap-2 p-1.5 rounded-[var(--radius-md)] hover:bg-[var(--surface-hover)] transition-colors min-h-[44px]"
            >
              <div className="w-8 h-8 rounded-full bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-center text-xs font-semibold text-[var(--text-primary)]">
                {(profile?.full_name || "U").charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-medium text-[var(--text-primary)] leading-tight max-w-[120px] truncate">
                  {profile?.full_name || "Pengguna"}
                </span>
                <span className="text-[10px] text-[var(--text-secondary)] leading-tight">
                  {isHead ? "Kepala" : "Anggota"}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)] hidden md:block" />
            </button>

            {/* Profile Dropdown Menu */}
            {isProfileMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-2xl p-2 z-50 animate-in fade-in">
                <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
                  <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                    {profile?.full_name}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate">
                    {profile?.division || "Divisi Umum"}
                  </p>
                  <div className="mt-1.5">
                    <Badge size="sm" variant={isHead ? "blue" : "neutral"}>
                      {isHead ? "Peran: Kepala (Head)" : "Peran: Anggota (Member)"}
                    </Badge>
                  </div>
                </div>

                {/* Role Switcher for quick evaluation */}
                <div className="px-3 py-2 text-[11px] text-[var(--text-secondary)]">
                  <span className="font-semibold block mb-1">Ganti Akun Demo:</span>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        switchDemoUser("head");
                        setIsProfileMenuOpen(false);
                      }}
                      className={`px-2 py-1 text-left rounded text-[10px] font-medium ${
                        isHead ? "bg-[var(--accent-blue)] text-white" : "hover:bg-[var(--surface-hover)]"
                      }`}
                    >
                      Suprapto (Kepala)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        switchDemoUser("member1");
                        setIsProfileMenuOpen(false);
                      }}
                      className={`px-2 py-1 text-left rounded text-[10px] font-medium ${
                        !isHead ? "bg-[var(--accent-blue)] text-white" : "hover:bg-[var(--surface-hover)]"
                      }`}
                    >
                      Budi (Anggota)
                    </button>
                  </div>
                </div>

                <div className="border-t border-[var(--border)] mt-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      signOut();
                    }}
                    className="w-full px-3 py-2 text-xs text-[var(--accent-red)] hover:bg-[var(--surface-hover)] rounded-[var(--radius-sm)] flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Keluar (Sign Out)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. Collapsible Mobile/Tablet Drawer Navigation */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setIsSidebarOpen(false)}
          />
          <div className="relative w-64 max-w-xs bg-[var(--surface)] border-r border-[var(--border)] p-4 flex flex-col justify-between h-full z-10 animate-in slide-in-from-left duration-200">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[var(--border)] mb-4">
                <BrandLogo size={24} />
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col gap-1">
                {navItems.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm font-medium transition-colors ${
                        active
                          ? "text-[var(--accent-blue)] bg-[var(--surface-hover)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>

              {isHead && (
                <div className="mt-4 pt-4 border-t border-[var(--border)]">
                  <Link
                    href="/tugas/baru"
                    onClick={() => setIsSidebarOpen(false)}
                    className="w-full block"
                  >
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full"
                      icon={<Plus className="w-4 h-4" />}
                    >
                      Buat Tugas
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
              <p className="font-medium text-[var(--text-primary)] truncate">{profile?.full_name}</p>
              <p className="text-[11px] capitalize">{role === "head" ? "Kepala (Head)" : "Anggota (Member)"}</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Main Content Container */}
      <main className="flex-1 pb-20 sm:pb-8">
        {children}
      </main>

      {/* 4. Mobile Bottom Navigation Bar (<640px) per design.md section 5 & 6 */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--surface)] border-t border-[var(--border)] h-16 flex items-center justify-around px-2">
        {mobileNavItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1 flex-1 min-h-[44px] transition-colors ${
                active ? "text-[var(--accent-blue)]" : "text-[var(--text-secondary)]"
              }`}
            >
              <Icon className="w-[18px] h-[18px] mb-0.5" />
              <span className="text-[10px] font-medium leading-tight">
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
