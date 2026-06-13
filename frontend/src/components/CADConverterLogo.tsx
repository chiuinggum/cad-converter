import React from "react";

interface CADConverterLogoProps {
  className?: string;
  size?: "sm" | "md";
}

export const CADConverterLogo: React.FC<CADConverterLogoProps> = ({
  className = "",
  size = "md",
}) => {
  const boxSize = size === "sm" ? "w-7 h-7" : "w-8 h-8";
  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  return (
    <div
      className={`${boxSize} rounded-md bg-gradient-to-br from-[#ea580c] to-[#c2410c] flex items-center justify-center shadow-sm shrink-0 ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className={iconSize} fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect
          x="2"
          y="6"
          width="8"
          height="8"
          rx="0.5"
          stroke="white"
          strokeWidth="1.4"
          fill="white"
          fillOpacity="0.12"
        />
        <line x1="2" y1="10" x2="10" y2="10" stroke="white" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="6" y1="6" x2="6" y2="14" stroke="white" strokeWidth="0.7" strokeOpacity="0.55" />
        <path
          d="M11.5 10h2.5M13.5 8.5L15.5 10 13.5 11.5"
          stroke="white"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16.5 15.5L19.5 13.5V9.5L16.5 11.5V15.5Z"
          fill="white"
          fillOpacity="0.35"
          stroke="white"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path
          d="M16.5 11.5L19.5 9.5L22.5 11.5L19.5 13.5Z"
          fill="white"
          fillOpacity="0.55"
          stroke="white"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path
          d="M16.5 15.5L19.5 13.5L22.5 11.5"
          stroke="white"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
