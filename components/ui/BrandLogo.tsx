import React from "react";

interface BrandLogoProps {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}

export function BrandLogo({ size = 28, showWordmark = true, className = "" }: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Geometric Compass Emblem */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-200 hover:rotate-45"
      >
        <circle cx="16" cy="16" r="14" stroke="var(--accent-blue)" strokeWidth="2" strokeDasharray="3 3" opacity="0.6" />
        <circle cx="16" cy="16" r="11" stroke="var(--border)" strokeWidth="1.5" />
        <polygon points="16,4 20,16 16,14 12,16" fill="var(--accent-blue)" />
        <polygon points="16,28 20,16 16,18 12,16" fill="var(--accent-blue-strong)" />
        <circle cx="16" cy="16" r="2.5" fill="var(--text-primary)" />
      </svg>

      {showWordmark && (
        <div className="flex flex-col">
          <span className="font-semibold tracking-wider text-base leading-none text-[var(--text-primary)]">
            DOOR
          </span>
          <span className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)] font-normal leading-tight mt-0.5">
            preserveD dOcumentatiOn progRam
          </span>
        </div>
      )}
    </div>
  );
}
