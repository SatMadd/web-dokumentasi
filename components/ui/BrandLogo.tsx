import React from "react";

interface BrandLogoProps {
  showSubtitle?: boolean;
  className?: string;
}

export function BrandLogo({ showSubtitle = false, className = "" }: BrandLogoProps) {
  return (
    <div className={`flex flex-col select-none ${className}`}>
      <span className="font-bold tracking-wider text-xl sm:text-2xl leading-none text-[var(--text-primary)]">
        DOOR
      </span>
      {showSubtitle && (
        <span className="text-xs uppercase tracking-widest text-[var(--text-secondary)] font-normal leading-tight mt-1">
          preserveD dOcumentatiOn progRam
        </span>
      )}
    </div>
  );
}
