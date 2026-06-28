/**
 * Brand mark: a shield (submissions stay private/secure) with a check
 * (the judged verdict). White glyph on the accent square.
 */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-[7px] bg-[var(--accent)] ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[60%] w-[60%]" aria-hidden>
        <path
          d="M12 3.2l6.5 2.4v5.2c0 4-2.8 6.5-6.5 7.5-3.7-1-6.5-3.5-6.5-7.5V5.6z"
          stroke="white"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M9 12l2.2 2.2L15.2 10"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
