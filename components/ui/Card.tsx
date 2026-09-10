import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "", ...props }: CardProps) {
  return (
    <div
      className={`bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 sm:p-6 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({
  label,
  error,
  helperText,
  id,
  className = "",
  ...props
}: InputProps) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-[var(--text-secondary)]"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/60 focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)] focus:border-[var(--accent-blue)] transition-colors min-h-[44px] ${
          error ? "border-[var(--accent-red)] focus:ring-[var(--accent-red)]" : ""
        } ${className}`}
        {...props}
      />
      {error ? (
        <span className="text-xs text-[var(--accent-red)]">{error}</span>
      ) : helperText ? (
        <span className="text-xs text-[var(--text-secondary)]">{helperText}</span>
      ) : null}
    </div>
  );
}

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Textarea({
  label,
  error,
  helperText,
  id,
  className = "",
  rows = 4,
  ...props
}: TextareaProps) {
  const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label
          htmlFor={textareaId}
          className="text-xs font-medium text-[var(--text-secondary)]"
        >
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        rows={rows}
        className={`w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-md)] p-3.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/60 focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)] focus:border-[var(--accent-blue)] transition-colors ${
          error ? "border-[var(--accent-red)] focus:ring-[var(--accent-red)]" : ""
        } ${className}`}
        {...props}
      />
      {error ? (
        <span className="text-xs text-[var(--accent-red)]">{error}</span>
      ) : helperText ? (
        <span className="text-xs text-[var(--text-secondary)]">{helperText}</span>
      ) : null}
    </div>
  );
}

interface ProgressBarProps {
  value: number; // 0 to 100
  label?: string;
  countLabel?: string;
  color?: "blue" | "orange" | "green" | "red";
  className?: string;
}

export function ProgressBar({
  value,
  label,
  countLabel,
  color = "blue",
  className = "",
}: ProgressBarProps) {
  const colorMap = {
    blue: "bg-[var(--accent-blue)]",
    orange: "bg-[var(--accent-orange)]",
    green: "bg-[var(--status-success)]",
    red: "bg-[var(--accent-red)]",
  };

  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      {(label || countLabel) && (
        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-medium">
          <span>{label}</span>
          <span>{countLabel || `${clampedValue}%`}</span>
        </div>
      )}
      <div className="w-full h-1.5 bg-[var(--surface-hover)] rounded-[var(--radius-full)] overflow-hidden">
        <div
          className={`h-full ${colorMap[color]} rounded-[var(--radius-full)] transition-all duration-300`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
}
