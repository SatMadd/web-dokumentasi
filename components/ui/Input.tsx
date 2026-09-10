import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  rightElement?: React.ReactNode;
}

export function Input({
  label,
  error,
  helperText,
  rightElement,
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
      <div className="relative w-full flex items-center">
        <input
          id={inputId}
          className={`w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/60 focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)] focus:border-[var(--accent-blue)] transition-colors min-h-[44px] ${
            rightElement ? "pr-10" : ""
          } ${
            error ? "border-[var(--accent-red)] focus:ring-[var(--accent-red)]" : ""
          } ${className}`}
          {...props}
        />
        {rightElement && (
          <div className="absolute right-2.5 flex items-center justify-center text-[var(--text-secondary)]">
            {rightElement}
          </div>
        )}
      </div>
      {error ? (
        <span className="text-xs text-[var(--accent-red)]">{error}</span>
      ) : helperText ? (
        <span className="text-xs text-[var(--text-secondary)]">{helperText}</span>
      ) : null}
    </div>
  );
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
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
