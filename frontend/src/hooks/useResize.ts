import { useCallback, useRef, useState } from "react";

export function useResizeWidth(
  initialWidth: number,
  minWidth: number,
  maxWidth: number
) {
  const [width, setWidth] = useState(initialWidth);
  const widthRef = useRef(width);
  widthRef.current = width;

  const startResize = useCallback(
    (direction: "left" | "right") => (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = widthRef.current;

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        const next =
          direction === "right" ? startW + delta : startW - delta;
        setWidth(Math.min(maxWidth, Math.max(minWidth, next)));
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [minWidth, maxWidth]
  );

  return { width, startResize };
}
