"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reveals its children with a short rise animation the first time they scroll
 * into view. CSS-only motion (no animation library); respects reduced-motion
 * via the stylesheet. `delay` staggers items within a row.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return (
    <Tag
      // @ts-expect-error polymorphic ref across the small tag union
      ref={ref}
      className={`reveal ${shown ? "in" : ""} ${className}`}
      style={{ animationDelay: shown ? `${delay}ms` : undefined }}
    >
      {children}
    </Tag>
  );
}
