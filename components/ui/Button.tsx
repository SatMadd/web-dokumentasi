import React from "react";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  icon?: React.ReactNode;
  isLoading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  children,
  icon,
  isLoading = false,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center font-medium rounded-[var(--radius-md)] transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/50 disabled:opacity-50 disabled:cursor-not-allowed select-none min-h-[44px]";

  const variantStyles: Record<ButtonVariant, string> = {
    primary:
      "bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90 border border-transparent shadow-sm",
    secondary:
      "bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--surface-hover)]",
    destructive:
      "bg-[var(--accent-red)] text-white hover:bg-[var(--accent-red)]/90 border border-transparent",
    ghost:
      "bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]",
  };

  const sizeStyles = {
    sm: "text-xs px-3 py-1.5 min-h-[36px]",
    md: "text-sm px-4 py-2 min-h-[44px]",
    lg: "text-base px-5 py-2.5 min-h-[48px]",
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
      ) : (
        icon && <span className="mr-2 inline-flex items-center">{icon}</span>
      )}
      {children}
    </button>
  );
}
