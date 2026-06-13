import React, { useEffect, useState } from "react";

interface StreamTypewriterProps {
  text: string;
  active?: boolean;
  speed?: number;
  className?: string;
}

export const StreamTypewriter: React.FC<StreamTypewriterProps> = ({
  text,
  active = false,
  speed = 14,
  className = "",
}) => {
  const [shown, setShown] = useState("");

  useEffect(() => {
    setShown("");
  }, [text]);

  useEffect(() => {
    if (!text) {
      setShown("");
      return;
    }
    if (shown.length >= text.length) return;

    const timer = window.setTimeout(() => {
      setShown(text.slice(0, shown.length + 1));
    }, speed);

    return () => window.clearTimeout(timer);
  }, [text, shown, speed]);

  const display = active && shown.length < text.length ? shown : text;

  return (
    <span className={className}>
      {display}
      {active && shown.length < text.length && (
        <span className="inline-block w-[2px] h-[12px] ml-0.5 bg-orange-500 animate-pulse align-middle" />
      )}
    </span>
  );
};
