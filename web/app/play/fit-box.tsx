"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

export function FitBox({
  logicalWidth,
  logicalHeight,
  children,
}: {
  logicalWidth: number;
  logicalHeight: number;
  children: ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const s = Math.min(rect.width / logicalWidth, rect.height / logicalHeight);
      setScale(s);
      setOffset({
        x: (rect.width - logicalWidth * s) / 2,
        y: (rect.height - logicalHeight * s) / 2,
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [logicalWidth, logicalHeight]);

  return (
    <div
      ref={parentRef}
      className="relative h-full w-full overflow-hidden"
    >
      <div
        style={{
          position: "absolute",
          left: offset.x,
          top: offset.y,
          width: logicalWidth,
          height: logicalHeight,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
