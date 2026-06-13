import React from "react";

interface BlueprintSVGProps {
  presetId: string;
  className?: string;
}

export const BlueprintSVG: React.FC<BlueprintSVGProps> = ({ presetId, className = "w-full h-full" }) => {
  if (presetId === "preset_flange") {
    return (
      <svg viewBox="0 0 400 240" className={`${className} text-slate-800 bg-[#f8fafc] p-4 border border-slate-200 rounded-lg font-mono`}>
        {/* Engineering background grid */}
        <defs>
          <pattern id="grid_blueprint" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid_blueprint)" />

        {/* Centerlines */}
        <line x1="20" y1="120" x2="380" y2="120" stroke="#f43f5e" strokeWidth="1" strokeDasharray="8,4,2,4" />
        <line x1="200" y1="10" x2="200" y2="230" stroke="#f43f5e" strokeWidth="1" strokeDasharray="8,4,2,4" />

        {/* Outer Flange Silhouette */}
        <circle cx="200" cy="120" r="80" fill="none" stroke="#475569" strokeWidth="2" />
        
        {/* Inner Bore hole */}
        <circle cx="200" cy="120" r="30" fill="none" stroke="#475569" strokeWidth="1.5" />

        {/* Pitch Circle Diameter representation (Bolt Circle) */}
        <circle cx="200" cy="120" r="60" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4,4" />

        {/* Symmetry drill holes */}
        <circle cx="200" cy="60" r="8" fill="none" stroke="#10b981" strokeWidth="1.5" />
        <circle cx="200" cy="180" r="8" fill="none" stroke="#10b981" strokeWidth="1.5" />
        <circle cx="140" cy="120" r="8" fill="none" stroke="#10b981" strokeWidth="1.5" />
        <circle cx="260" cy="120" r="8" fill="none" stroke="#10b981" strokeWidth="1.5" />

        {/* Dimension leaders and values */}
        {/* D_outer */}
        <line x1="280" y1="120" x2="310" y2="120" stroke="#4f46e5" strokeWidth="1" />
        <path d="M 280 120 L 285 117 L 285 123 Z" fill="#4f46e5" />
        <text x="315" y="124" fill="#4f46e5" className="text-[10px] font-semibold">Ø D_outer (80)</text>

        {/* D_bore */}
        <line x1="200" y1="120" x2="175" y2="95" stroke="#4f46e5" strokeWidth="1" />
        <path d="M 200 120 L 195 125 L 197 121 Z" fill="#4f46e5" />
        <text x="127" y="90" fill="#4f46e5" className="text-[10px] font-semibold">Ø D_bore (30)</text>

        {/* PCD (bolt circle diameter) */}
        <line x1="200" y1="60" x2="200" y2="180" stroke="#4f46e5" strokeWidth="0.5" strokeDasharray="2,2" />
        <path d="M 200 60 L 197 65 L 203 65 Z" fill="#4f46e5" />
        <path d="M 200 180 L 197 175 L 203 175 Z" fill="#4f46e5" />
        <text x="206" y="155" fill="#4f46e5" className="text-[9px] font-semibold">PCD Ø hole_pcd (60)</text>

        {/* Hole detail */}
        <line x1="260" y1="120" x2="295" y2="155" stroke="#4f46e5" strokeWidth="1" />
        <path d="M 260 120 L 266 123 L 263 125 Z" fill="#4f46e5" />
        <text x="280" y="168" fill="#4f46e5" className="text-[9px] font-semibold">4x Ø hole_dia (8)</text>

        {/* Section AA Title and arrows */}
        <text x="25" y="30" fill="#475569" className="text-xs uppercase font-sans font-semibold">VIEW A-A (FRONTAL PLAN)</text>
      </svg>
    );
  } else if (presetId === "preset_sleeve") {
    return (
      <svg viewBox="0 0 400 240" className={`${className} text-slate-800 bg-[#f8fafc] p-4 border border-slate-200 rounded-lg font-mono`}>
        <defs>
          <pattern id="grid_blueprint_sleeve" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid_blueprint_sleeve)" />

        {/* Centerlines */}
        <line x1="20" y1="120" x2="380" y2="120" stroke="#f43f5e" strokeWidth="1" strokeDasharray="8,4,2,4" />

        {/* Stepped sleeve shell body */}
        <rect x="80" y="55" width="45" height="130" fill="none" stroke="#475569" strokeWidth="2" />
        <rect x="125" y="80" width="105" height="80" fill="none" stroke="#475569" strokeWidth="2" />

        {/* Central Bore lines (Dashed interior) */}
        <line x1="80" y1="95" x2="230" y2="95" stroke="#475569" strokeWidth="1.5" strokeDasharray="4,4" />
        <line x1="80" y1="145" x2="230" y2="145" stroke="#475569" strokeWidth="1.5" strokeDasharray="4,4" />

        {/* Cross locking Pin Hole */}
        <rect x="180" y="80" width="12" height="80" fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="2,2" />

        {/* Dimensions */}
        {/* D_large */}
        <line x1="60" y1="55" x2="60" y2="185" stroke="#4f46e5" strokeWidth="1" />
        <path d="M 60 55 L 57 60 L 63 60 Z" fill="#4f46e5" />
        <path d="M 60 185 L 57 180 L 63 180 Z" fill="#4f46e5" />
        <text x="18" y="124" fill="#4f46e5" className="text-[9px] font-semibold">Ø D_large(65)</text>

        {/* D_small */}
        <line x1="245" y1="80" x2="245" y2="160" stroke="#4f46e5" strokeWidth="1" />
        <path d="M 245 80 L 242 85 L 248 85 Z" fill="#4f46e5" />
        <path d="M 245 160 L 242 155 L 248 155 Z" fill="#4f46e5" />
        <text x="250" y="124" fill="#4f46e5" className="text-[9px] font-semibold">Ø D_small(40)</text>

        {/* H_flange */}
        <line x1="80" y1="205" x2="125" y2="205" stroke="#4f46e5" strokeWidth="1" />
        <path d="M 80 205 L 85 202 L 85 208 Z" fill="#4f46e5" />
        <path d="M 125 205 L 120 202 L 120 208 Z" fill="#4f46e5" />
        <text x="82" y="220" fill="#4f46e5" className="text-[9.5px] font-semibold">H_flange(12)</text>

        {/* H_sleeve */}
        <line x1="125" y1="205" x2="230" y2="205" stroke="#4f46e5" strokeWidth="1" />
        <path d="M 125 205 L 130 202 L 130 208 Z" fill="#4f46e5" />
        <path d="M 230 205 L 225 202 L 225 208 Z" fill="#4f46e5" />
        <text x="156" y="220" fill="#4f46e5" className="text-[9.5px] font-semibold">H_sleeve(28)</text>

        {/* pin_hole_dist */}
        <line x1="186" y1="40" x2="230" y2="40" stroke="#4f46e5" strokeWidth="0.7" />
        <path d="M 186 40 L 191 37 L 191 43 Z" fill="#4f46e5" />
        <path d="M 230 40 L 225 37 L 225 43 Z" fill="#4f46e5" />
        <text x="175" y="30" fill="#4f46e5" className="text-[8.5px] font-semibold">pin_hole_dist(16)</text>

        <text x="25" y="30" fill="#475569" className="text-xs uppercase font-sans font-semibold">VIEW B-B (LATERAL ELEVATION)</text>
      </svg>
    );
  } else if (presetId === "preset_bracket") {
    return (
      <svg viewBox="0 0 400 240" className={`${className} text-slate-800 bg-[#f8fafc] p-4 border border-slate-200 rounded-lg font-mono`}>
        <defs>
          <pattern id="grid_blueprint_bracket" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid_blueprint_bracket)" />

        {/* Border Outline of bracket flat plate */}
        <rect x="70" y="40" width="260" height="160" rx="12" fill="none" stroke="#475569" strokeWidth="2" />

        {/* Central rectangular rounded cutout */}
        <rect x="150" y="90" width="100" height="60" rx="10" fill="none" stroke="#475569" strokeWidth="1.5" />

        {/* Corner alignment drill holes */}
        <circle cx="95" cy="65" r="10" fill="none" stroke="#10b981" strokeWidth="1.5" />
        <circle cx="305" cy="65" r="10" fill="none" stroke="#10b981" strokeWidth="1.5" />
        <circle cx="95" cy="175" r="10" fill="none" stroke="#10b981" strokeWidth="1.5" />
        <circle cx="305" cy="175" r="10" fill="none" stroke="#10b981" strokeWidth="1.5" />

        {/* Dimensions */}
        {/* Width (W) */}
        <line x1="70" y1="215" x2="330" y2="215" stroke="#4f46e5" strokeWidth="1" />
        <path d="M 70 215 L 75 212 L 75 218 Z" fill="#4f46e5" />
        <path d="M 330 215 L 325 212 L 325 218 Z" fill="#4f46e5" />
        <text x="180" y="228" fill="#4f46e5" className="text-[10px] font-semibold">W (120)</text>

        {/* Depth (L) */}
        <line x1="345" y1="40" x2="345" y2="200" stroke="#4f46e5" strokeWidth="1" />
        <path d="M 345 40 L 342 45 L 348 45 Z" fill="#4f46e5" />
        <path d="M 345 200 L 342 195 L 348 195 Z" fill="#4f46e5" />
        <text x="350" y="125" fill="#4f46e5" className="text-[10px] font-semibold">L (80)</text>

        {/* Cut_w & Cut_l */}
        <line x1="150" y1="110" x2="250" y2="110" stroke="#4f46e5" strokeWidth="1" strokeDasharray="1,1" />
        <text x="180" y="105" fill="#4f46e5" className="text-[9px] font-semibold">cut_w (50)</text>
        
        <line x1="190" y1="90" x2="190" y2="150" stroke="#4f46e5" strokeWidth="1" strokeDasharray="1,1" />
        <text x="195" y="125" fill="#4f46e5" className="text-[9px] font-semibold">cut_l (30)</text>

        {/* hole_inset */}
        <line x1="70" y1="65" x2="95" y2="65" stroke="#4f46e5" strokeWidth="1" />
        <text x="56" y="58" fill="#4f46e5" className="text-[8px] font-semibold">inset(12)</text>

        <text x="25" y="30" fill="#475569" className="text-xs uppercase font-sans font-semibold">VIEW C-C (PLAN VIEW)</text>
      </svg>
    );
  }
  return null;
};
