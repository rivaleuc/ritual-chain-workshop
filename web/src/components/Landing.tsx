"use client";

import { WalletConnect } from "@/components/WalletConnect";
import { Reveal } from "@/components/Reveal";
import { Logo } from "@/components/Logo";
import { ritualChain } from "@/config/wagmi";
import { contractAddress } from "@/config/contract";
import { shortenAddress } from "@/lib/format";

/* ----------------------------------------------------------------- icons */

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const I = {
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  spark: "M12 3v6m0 6v6m9-9h-6M9 12H3m13.5-4.5L14 10m-4 4-2.5 2.5m9 0L14 14m-4-4L7.5 7.5",
  scale: "M12 3v18M5 7l-3 6h6l-3-6Zm14 0-3 6h6l-3-6ZM3 21h18",
  code: "M8 9l-3 3 3 3m8-6 3 3-3 3M14 5l-4 14",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  flask: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3",
  pen: "M3 21l3-1 11-11-2-2L4 18l-1 3ZM14 7l3 3",
  chip: "M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3M7 7h10v10H7z",
} as const;

/* ------------------------------------------------------------------ data */

const STEPS = [
  { n: "01", t: "Create", d: "Set the rubric, deadlines, and reward. The reward is escrowed on-chain." },
  { n: "02", t: "Commit", d: "Participants submit only a hash of their answer. Nothing is public yet." },
  { n: "03", t: "Reveal", d: "After the deadline, answers are revealed and verified against the hash." },
  { n: "04", t: "Judge", d: "One batched AI inference ranks every revealed answer against the rubric." },
  { n: "05", t: "Finalize", d: "The owner ratifies the winner. The escrowed reward is paid out." },
];

const FEATURES = [
  { icon: I.lock, t: "Hidden until judged", d: "Commit-reveal keeps submissions private during the window, so no one can copy the leading answer." },
  { icon: I.spark, t: "One batched review", d: "Every answer is judged in a single on-chain LLM inference, not one call per submission." },
  { icon: I.scale, t: "On-chain settlement", d: "Reward escrow, judging, and payout all happen on Ritual. No off-chain trust." },
  { icon: I.eye, t: "Human ratifies", d: "The AI recommends a winner; the bounty owner makes the final, on-chain call." },
];

/* --------------------------------------------------------------- landing */

export function Landing({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <Logo className="h-8 w-8" />
            <span className="text-sm font-bold tracking-tight">Bounty Judge</span>
          </div>
          <div className="hidden items-center gap-7 text-sm font-semibold text-[var(--muted)] md:flex">
            <a href="#how" className="hover:text-[var(--foreground)]">How it works</a>
            <a href="#features" className="hover:text-[var(--foreground)]">Why it&apos;s private</a>
          </div>
          <div className="flex items-center gap-2">
            <WalletConnect />
            <button
              onClick={onLaunch}
              className="btn-anim hidden rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] sm:inline-flex"
            >
              Launch app
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="section-tint">
        <div className="mx-auto max-w-6xl px-5 pb-20 pt-14 sm:px-8 sm:pb-28 sm:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Copy */}
            <div>
              <div className="rise-in">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  On {ritualChain.name}, commit-reveal + on-chain AI
                </span>
              </div>
              <h1
                className="rise-in mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-[56px]"
                style={{ animationDelay: "60ms" }}
              >
                Private bounties, judged on-chain by AI.
              </h1>
              <p
                className="rise-in mt-5 max-w-xl text-lg font-medium leading-relaxed text-[var(--muted)]"
                style={{ animationDelay: "120ms" }}
              >
                Submissions stay hidden until the deadline. Then one batched AI inference ranks every
                answer against the rubric, and you finalize the winner.
              </p>
              <div
                className="rise-in mt-8 flex flex-wrap gap-3"
                style={{ animationDelay: "180ms" }}
              >
                <button
                  onClick={onLaunch}
                  className="btn-anim rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
                >
                  Create a bounty
                </button>
                <a
                  href="#how"
                  className="btn-anim rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-2.5 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--hover)]"
                >
                  See how it works
                </a>
              </div>
            </div>

            {/* Product preview */}
            <div
              className="rise-in lg:justify-self-end"
              style={{ animationDelay: "220ms" }}
            >
              <HeroPreview />
            </div>
          </div>

          {/* Lifecycle ribbon */}
          <div
            className="rise-in mt-16 flex flex-wrap items-center gap-x-2 gap-y-3 text-sm font-semibold"
            style={{ animationDelay: "300ms" }}
          >
            {STEPS.map((s, i) => (
              <span key={s.t} className="flex items-center gap-2">
                {i > 0 && <span className="text-[var(--muted-2)]" aria-hidden>→</span>}
                <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[var(--muted)] shadow-card">
                  <span className="font-mono text-[var(--accent)]">{s.n}</span> {s.t}
                </span>
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* How it works */}
      <section id="how" className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <Reveal>
            <SectionLabel>Lifecycle</SectionLabel>
            <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
              Five steps from open to paid.
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.t} delay={i * 70}>
                <div className="h-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-6 shadow-card lift">
                  <div className="font-mono text-sm font-bold text-[var(--accent)]">{s.n}</div>
                  <div className="mt-3 text-lg font-bold tracking-tight">{s.t}</div>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--muted)]">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <Reveal>
            <SectionLabel>Why it stays fair</SectionLabel>
            <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
              Privacy first, AI advisory, human final.
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <Reveal key={f.t} delay={i * 70}>
                <div className="flex h-full gap-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-6 shadow-card lift">
                  <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[var(--accent)]/10 text-[var(--accent)]">
                    <Icon path={f.icon} />
                  </div>
                  <div>
                    <div className="text-base font-bold tracking-tight">{f.t}</div>
                    <p className="mt-1.5 text-sm font-medium leading-relaxed text-[var(--muted)]">{f.d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-tint border-t border-[var(--border)]">
        <div className="mx-auto max-w-3xl px-5 py-24 text-center sm:px-8 sm:py-32">
          <Reveal>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
              Open your first bounty.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[15px] font-medium leading-relaxed text-[var(--muted)]">
              Escrow a reward, set the rubric, and let the commit-reveal flow keep it honest until
              the AI judges.
            </p>
            <button
              onClick={onLaunch}
              className="btn-anim mt-8 rounded-md bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
            >
              Launch app
            </button>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-xs font-medium text-[var(--muted-2)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-2.5">
            <Logo className="h-6 w-6" />
            <span className="font-semibold text-[var(--muted)]">Bounty Judge</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {contractAddress && (
              <span className="font-mono">{shortenAddress(contractAddress, 6)}</span>
            )}
            <span>Chain {ritualChain.id}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
      {children}
    </div>
  );
}

/* An illustrative product preview, a judged bounty as the app renders it. */
function HeroPreview() {
  return (
    <div className="floaty w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-float">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-[var(--muted-2)]">#7</span>
          <span className="text-sm font-bold tracking-tight">Best gas-optimization writeup</span>
        </div>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
          Judged
        </span>
      </div>
      <p className="mt-2 text-xs font-medium leading-relaxed text-[var(--muted)]">
        Correctness 50%, clarity 30%, novelty 20%.
      </p>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/8 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded bg-[var(--accent)] text-[10px] font-bold text-white">
              1
            </span>
            <span className="font-mono text-xs font-semibold text-[var(--foreground)]">0x9f…21a</span>
          </div>
          <span className="text-[11px] font-bold text-[var(--accent)]">Winner</span>
        </div>
        <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded bg-[var(--border-strong)] text-[10px] font-bold text-[var(--muted)]">
              2
            </span>
            <span className="font-mono text-xs font-semibold text-[var(--muted)]">0x3c…525</span>
          </div>
          <span className="text-[11px] font-semibold text-[var(--muted-2)]">Revealed</span>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted-2)]">
          AI review
        </div>
        <pre className="mt-1.5 overflow-x-auto font-mono text-[11px] leading-relaxed text-[var(--muted)]">{`{ "winnerIndex": 1, "summary": "ok" }`}</pre>
      </div>
    </div>
  );
}
