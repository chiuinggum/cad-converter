import React from "react";

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  side?: "left" | "right";
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  onMouseDown,
  side = "right",
}) => (
  <div
    role="separator"
    aria-orientation="vertical"
    onMouseDown={onMouseDown}
    className={`group shrink-0 w-1 hover:w-1.5 transition-all cursor-col-resize flex items-center justify-center ${
      side === "left" ? "-ml-0.5" : "-mr-0.5"
    }`}
  >
    <div className="w-px h-full min-h-[48px] bg-slate-200 group-hover:bg-orange-400 group-active:bg-orange-500" />
  </div>
);
