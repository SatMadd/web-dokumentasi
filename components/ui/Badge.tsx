import React from "react";

export type BadgeVariant = "blue" | "orange" | "green" | "red" | "neutral";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  size?: "sm" | "md";
}

export function Badge({
  children,
  variant = "blue",
  className = "",
  size = "md",
}: BadgeProps) {
  const variantStyles: Record<BadgeVariant, string> = {
    blue: "bg-[var(--accent-blue-strong)]/40 text-[var(--accent-blue-soft)] border border-[var(--accent-blue)]/30",
    orange: "bg-[#78350F]/40 text-[#FDE68A] border border-[var(--accent-orange)]/40",
    green: "bg-[#064E3B]/40 text-[#A7F3D0] border border-[var(--status-success)]/40",
    red: "bg-[#7F1D1D]/40 text-[#FECACA] border border-[var(--accent-red)]/40",
    neutral: "bg-[var(--surface-hover)] text-[var(--text-secondary)] border border-[var(--border)]",
  };

  const sizeStyles = {
    sm: "text-[11px] px-2 py-0.5",
    md: "text-xs px-2.5 py-1",
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-[var(--radius-full)] ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {children}
    </span>
  );
}
