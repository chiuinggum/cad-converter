import React from "react";

interface WonderCADLogoProps {
  className?: string;
  size?: "sm" | "md";
}

export const WonderCADLogo: React.FC<WonderCADLogoProps> = ({
  className = "",
  size = "md",
}) => {
  const boxSize = size === "sm" ? "w-7 h-7" : "w-9 h-9";
  const iconSize = size === "sm" ? "w-5 h-5" : "w-6 h-6";

  return (
    <div className={`relative shrink-0 ${boxSize} ${className}`} aria-hidden="true">
      <div className="absolute inset-0 rounded-lg bg-slate-400/25 translate-x-[1.5px] translate-y-[2px] blur-[0.5px]" />
      <div className="relative w-full h-full rounded-lg bg-white border border-slate-300/90 shadow-[0_1px_3px_rgba(100,116,139,0.22)] flex items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          className={iconSize}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 3.5L19.5 8v8L12 20.5 4.5 16V8L12 3.5Z"
            stroke="#94a3b8"
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
          <path
            d="M12 3.5V12M12 12L4.5 16M12 12L19.5 16"
            stroke="#cbd5e1"
            strokeWidth="0.75"
            strokeLinecap="round"
          />
          <path
            d="M8.5 6.2L12 8.2L15.5 6.2L12 4.2 8.5 6.2Z"
            fill="#fed7aa"
            stroke="#ea580c"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <path
            d="M8.5 6.2V10.2L12 12.2V8.2L8.5 6.2Z"
            fill="#fb923c"
            stroke="#ea580c"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <path
            d="M15.5 6.2V10.2L12 12.2V8.2L15.5 6.2Z"
            fill="#fdba74"
            stroke="#ea580c"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <path
            d="M8.5 10.2L12 12.2L15.5 10.2L12 8.2 8.5 10.2Z"
            fill="#fff7ed"
            stroke="#ea580c"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="8.2" r="0.85" fill="#ea580c" />
        </svg>
      </div>
    </div>
  );
};

/** @deprecated Use WonderCADLogo */
export const CADConverterLogo = WonderCADLogo;
