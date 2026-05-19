"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  Goal,
  Observation,
  ObservationCategory,
} from "@/types/db";
import { observationBadge } from "@/lib/observation-badge";

// Reid design tokens — colocated so the component is a single drop-in. Any
// change to the system itself lives in tailwind config + globals.css; these
// literals mirror those values for inline use.
const COLOR = {
  bgDeep: "#060E1C",
  surface: "rgba(255,255,255,0.04)",
  divider: "rgba(255,255,255,0.06)",
  textPrimary: "#F2EDE3",
  textSecondary: "#C8D5E3",
  textDim: "#7A90A8",
  accent: "#B91C1C",
  border: "rgba(255,255,255,0.10)",
  borderTake: "rgba(255,255,255,0.12)",
  // Type-driven badge palette — never derived from observation category for
  // goal/task surfaces. "PATTERN" is forbidden on those.
  badgeObservationBg: "#92400E",
  badgeObservationFg: "#F2EDE3",
  badgeGoalBg: "#1E3A5F",
  badgeGoalFg: "#93C5FD",
  badgeTaskBg: "#B91C1C",
  badgeTaskFg: "#F2EDE3",
} as const;

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export type FullScreenObservationData = Pick<
  Observation,
  "id" | "text" | "category" | "confidence" | "created_at" | "session_id"
> & {
  sessionLabel?: string | null;
  trigger?: string | null;
  evidence?: string[];
};

export type FullScreenGoalData = Pick<
  Goal,
  | "id"
  | "title"
  | "description"
  | "current_value"
  | "target_value"
  | "unit"
  | "unit_prefix"
  | "deadline"
> & {
  history?: { value: number; created_at: string }[];
  blocking?: string | null;
};

export type FullScreenTaskData = {
  id: string;
  description: string;
  due_date: string | null;
  completed: boolean;
  source?: string | null;
  reason?: string | null;
  stake?: string | null;
};

type FullScreenContext =
  | {
      type: "observation";
      layoutId: string;
      data: FullScreenObservationData;
    }
  | {
      type: "goal";
      layoutId: string;
      data: FullScreenGoalData;
    }
  | {
      type: "task";
      layoutId: string;
      data: FullScreenTaskData;
      onComplete?: () => Promise<void> | void;
      onUndo?: () => Promise<void> | void;
    };

export interface FullScreenCardProps {
  context: FullScreenContext | null;
  onClose: () => void;
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export function FullScreenCard({ context, onClose }: FullScreenCardProps) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // Portal target. SSR-safe: don't try to read document until after mount.
  // The overlay MUST live on document.body so position:fixed escapes the
  // .page-enter animation's transform — that animation establishes a
  // containing block which would otherwise trap the overlay inside the
  // main content column (sidebar visible behind it).
  useEffect(() => {
    setMounted(true);
  }, []);

  const open = context !== null;

  // ESC / focus trap / scroll lock. Effect-driven so it tears down cleanly
  // on unmount or context change.
  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab") {
        const root = containerRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'a, button, textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 60);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = originalOverflow;
      const prev = previousFocus.current;
      if (prev) {
        try {
          prev.focus();
        } catch {
          // ignore — element may have unmounted
        }
      }
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const overlay = (
    <AnimatePresence>
      {context && (
        <motion.div
          key={context.layoutId}
          // Outer overlay sits at viewport bounds via position: fixed and a
          // z-index well above the AppShell sidebar (z-40) + bottom nav
          // (z-40) + paywall modal. Inline numeric zIndex so Tailwind JIT
          // can't drop the arbitrary value class.
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: "100vw",
            height: "100vh",
            zIndex: 9999,
            background: `radial-gradient(ellipse at 50% 0%, rgba(185,28,28,0.06) 0%, transparent 70%), ${COLOR.bgDeep}`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          role="dialog"
          aria-modal="true"
        >
          {/* Close button — sibling of the scroll/morph container so it's not
              affected by the morph transform OR by user scroll. Always at
              viewport top-right. */}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              width: 44,
              height: 44,
              borderRadius: 12,
              background: COLOR.surface,
              border: `1px solid ${COLOR.border}`,
              color: COLOR.textPrimary,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2,
              transition: "background-color 150ms ease, border-color 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.20)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = COLOR.border;
            }}
          >
            <X size={20} strokeWidth={2} />
          </button>

          {/* Scrollable / layout-morphing inner container. Owns scroll so the
              close button overlay stays put as the user reads long content.
              Grid layout vertically centres short content; when content is
              taller than the viewport the grid track expands and the top of
              the content stays accessible via the scroll bar. */}
          <motion.div
            ref={containerRef}
            layoutId={context.layoutId}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="full-screen-card-scroll"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            <div
              style={{
                minHeight: "100%",
                display: "grid",
                placeItems: "center",
                padding: "64px 32px",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: 680,
                  margin: "0 auto",
                  padding: "40px 40px 48px",
                  border: `1px solid ${COLOR.divider}`,
                  borderRadius: 16,
                  background: "rgba(8,18,34,0.4)",
                  boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
                }}
              >
                {context.type === "observation" && (
                  <ObservationBody data={context.data} />
                )}
                {context.type === "goal" && <GoalBody data={context.data} />}
                {context.type === "task" && (
                  <TaskBody
                    data={context.data}
                    onComplete={context.onComplete}
                    onUndo={context.onUndo}
                    onClose={onClose}
                  />
                )}

                <ReidTake
                  key={`take-${context.type}-${
                    context.type === "observation"
                      ? context.data.id
                      : context.type === "goal"
                        ? context.data.id
                        : context.data.id
                  }`}
                  type={context.type}
                  id={
                    context.type === "observation"
                      ? context.data.id
                      : context.type === "goal"
                        ? context.data.id
                        : context.data.id
                  }
                  contextText={buildContextText(context)}
                />
              </div>
            </div>
          </motion.div>

          {/* Scoped styles: thin scrollbar inside the FullScreenCard. Kept
              inline so the design system stays self-contained — no global
              CSS leak. */}
          <style jsx>{`
            :global(.full-screen-card-scroll)::-webkit-scrollbar {
              width: 6px;
            }
            :global(.full-screen-card-scroll)::-webkit-scrollbar-track {
              background: transparent;
            }
            :global(.full-screen-card-scroll)::-webkit-scrollbar-thumb {
              background: rgba(255, 255, 255, 0.1);
              border-radius: 3px;
            }
            :global(.full-screen-card-scroll) {
              scrollbar-width: thin;
              scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(overlay, document.body);
}

// ----------------------------------------------------------------------------
// Type-driven badge — never "PATTERN" on goals or tasks.
// ----------------------------------------------------------------------------

function TypeBadge({
  type,
  observationCategory,
  completed,
}: {
  type: "observation" | "goal" | "task";
  observationCategory?: ObservationCategory | string | null;
  completed?: boolean;
}) {
  let bg: string;
  let fg: string;
  let label: string;
  if (type === "observation") {
    // Sprint 11: read from the shared observationBadge so the colour + label
    // match the /observations list tile byte-for-byte. Before this commit
    // the FullScreenCard always rendered #92400E amber regardless of
    // category, so a "Contradiction" tile and its detail card disagreed.
    const palette = observationBadge(observationCategory);
    bg = palette.bg;
    fg = palette.fg;
    label = palette.label;
  } else if (type === "goal") {
    bg = COLOR.badgeGoalBg;
    fg = COLOR.badgeGoalFg;
    label = "Goal";
  } else {
    bg = COLOR.badgeTaskBg;
    fg = COLOR.badgeTaskFg;
    label = completed ? "Complete" : "Task";
  }
  return (
    <span
      style={{
        background: bg,
        color: fg,
        padding: "4px 12px",
        borderRadius: 999,
        fontFamily: "var(--font-sans), sans-serif",
        fontSize: 11,
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        display: "inline-block",
      }}
    >
      {label}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Header primitives — shared by every body
// ----------------------------------------------------------------------------

function Headline({ children }: { children: ReactNode }) {
  return (
    <h2
      className="font-serif italic [text-wrap:pretty]"
      style={{
        fontSize: 40,
        color: COLOR.textPrimary,
        lineHeight: 1.2,
        letterSpacing: "-0.015em",
        margin: 0,
        marginTop: 20,
        marginBottom: 8,
      }}
    >
      {children}
    </h2>
  );
}

function OneLiner({ children }: { children: ReactNode }) {
  return (
    <p
      className="font-sans [text-wrap:pretty]"
      style={{
        fontSize: 16,
        color: COLOR.textSecondary,
        lineHeight: 1.6,
        maxWidth: 600,
        margin: 0,
        marginBottom: 32,
      }}
    >
      {children}
    </p>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        paddingTop: 32,
        paddingBottom: 32,
        borderTop: `1px solid ${COLOR.divider}`,
      }}
    >
      <p
        className="font-sans"
        style={{
          color: COLOR.textDim,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          fontWeight: 500,
          margin: 0,
          marginBottom: 8,
        }}
      >
        {label}
      </p>
      <div>{children}</div>
    </div>
  );
}

function SectionBody({ children }: { children: ReactNode }) {
  return (
    <p
      className="font-sans [text-wrap:pretty]"
      style={{
        fontSize: 15,
        color: COLOR.textSecondary,
        lineHeight: 1.75,
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

// Voice-flavour body — same dimensions as SectionBody but Playfair italic so
// it reads as Reid's voice rather than UI copy. Used for "Where you stand",
// the task stake, and other Reid-spoken passages.
function VoiceBody({ children }: { children: ReactNode }) {
  return (
    <p
      className="font-serif italic [text-wrap:pretty]"
      style={{
        fontSize: 16,
        color: COLOR.textSecondary,
        lineHeight: 1.75,
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

function deriveHeadline(text: string, maxWords: number = 5): string {
  const words = text.trim().split(/\s+/).slice(0, maxWords);
  let h = words.join(" ");
  h = h.replace(/[.,;:!?]+$/, "");
  return h || text.slice(0, 40);
}

// ----------------------------------------------------------------------------
// OBSERVATION body
// ----------------------------------------------------------------------------

function ObservationBody({ data }: { data: FullScreenObservationData }) {
  const headline = deriveHeadline(data.text);
  const evidence = data.evidence ?? [];
  return (
    <>
      <TypeBadge type="observation" observationCategory={data.category} />
      <Headline>{headline}</Headline>
      <OneLiner>{data.text}</OneLiner>

      <Section label="When Reid first noticed this">
        <SectionBody>
          {data.sessionLabel ?? `Session · ${formatLongDate(data.created_at)}`}
        </SectionBody>
      </Section>

      {data.trigger && (
        <Section label="What triggered it">
          <SectionBody>{data.trigger}</SectionBody>
        </Section>
      )}

      <Section label="Evidence">
        {evidence.length > 0 ? (
          <ul
            className="font-sans"
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              fontSize: 16,
              color: COLOR.textSecondary,
              lineHeight: 1.75,
            }}
          >
            {evidence.slice(0, 3).map((line, i) => (
              <li key={i} style={{ display: "flex", gap: 12 }}>
                <span style={{ color: COLOR.textDim }}>·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p
            className="font-sans italic"
            style={{ fontSize: 14, color: COLOR.textDim, margin: 0 }}
          >
            Not enough yet. Reid needs another session or two.
          </p>
        )}
      </Section>
    </>
  );
}

// ----------------------------------------------------------------------------
// GOAL body
// ----------------------------------------------------------------------------

function GoalBody({ data }: { data: FullScreenGoalData }) {
  const pct = clampPct(
    data.target_value > 0
      ? (data.current_value / data.target_value) * 100
      : 0,
  );
  const history = data.history ?? [];

  return (
    <>
      <TypeBadge type="goal" />
      <Headline>{data.title}</Headline>
      {data.description && <OneLiner>{data.description}</OneLiner>}

      <div
        style={{
          marginTop: 24,
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span
          className="font-sans"
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: COLOR.textPrimary,
            lineHeight: 1,
            letterSpacing: "-0.025em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatGoalValue(data.current_value, data.unit, data.unit_prefix)}
        </span>
        <span
          className="font-sans"
          style={{
            fontSize: 18,
            fontWeight: 400,
            color: COLOR.textDim,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          / {formatGoalValue(data.target_value, data.unit, data.unit_prefix)}
        </span>
      </div>

      {history.length >= 3 ? (
        <div style={{ height: 220, marginTop: 24, width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={history.map((h) => ({
                ts: new Date(h.created_at).getTime(),
                value: h.value,
              }))}
              margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
            >
              <CartesianGrid
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="ts"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) =>
                  new Date(v).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })
                }
                stroke={COLOR.textDim}
                tick={{ fill: COLOR.textDim, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke={COLOR.textDim}
                tick={{ fill: COLOR.textDim, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: COLOR.bgDeep,
                  border: `1px solid ${COLOR.border}`,
                  color: COLOR.textPrimary,
                  fontSize: 12,
                }}
                cursor={{ stroke: "rgba(255,255,255,0.08)" }}
                labelFormatter={(v) =>
                  new Date(Number(v)).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                }
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={COLOR.accent}
                strokeWidth={2}
                dot={{ fill: COLOR.accent, r: 3 }}
                activeDot={{ r: 5, fill: COLOR.textPrimary }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          style={{
            marginTop: 24,
            height: 6,
            width: "100%",
            background: "rgba(255,255,255,0.08)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ height: "100%", background: COLOR.accent }}
          />
        </div>
      )}

      <Section label="Where you stand">
        <VoiceBody>{standingCopy(pct)}</VoiceBody>
      </Section>

      {data.blocking && (
        <Section label="What's blocking you">
          <SectionBody>{data.blocking}</SectionBody>
        </Section>
      )}

      <Section label="What Reid wants next">
        <VoiceBody>{nextStepCopy(pct, data.deadline)}</VoiceBody>
      </Section>
    </>
  );
}

function clampPct(p: number): number {
  if (!Number.isFinite(p)) return 0;
  if (p < 0) return 0;
  if (p > 100) return 100;
  return p;
}

function standingCopy(pct: number): string {
  if (pct >= 100) return "Done. Set the next one.";
  if (pct >= 75) return "Close. Don't slow down now.";
  if (pct >= 40) return "Moving. The middle is where most founders stall.";
  if (pct > 0) return "Started. Now keep going.";
  return "Zero. Whatever you've been waiting for, stop.";
}

function nextStepCopy(pct: number, deadline: string | null): string {
  if (pct >= 100) return "What's the next number?";
  const deadlineSuffix = deadline
    ? ` Deadline: ${new Date(deadline).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })}.`
    : "";
  if (pct === 0) return `Start before tomorrow.${deadlineSuffix}`;
  return `One concrete move this week.${deadlineSuffix}`;
}

function formatGoalValue(
  value: number,
  unit: string,
  unitPrefix: boolean,
): string {
  const rounded = Number.isInteger(value)
    ? value.toString()
    : value.toFixed(2).replace(/\.?0+$/, "");
  if (unitPrefix) return `${unit}${rounded}`;
  return `${rounded} ${unit}`.trim();
}

// ----------------------------------------------------------------------------
// TASK body
// ----------------------------------------------------------------------------

function TaskBody({
  data,
  onComplete,
  onUndo,
  onClose,
}: {
  data: FullScreenTaskData;
  onComplete?: () => Promise<void> | void;
  onUndo?: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "completing" | "done">("idle");
  const [showUndo, setShowUndo] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  const startUndoWindow = useCallback(() => {
    setShowUndo(true);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setShowUndo(false);
      undoTimer.current = null;
    }, 5000);
  }, []);

  const handleComplete = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("completing");
    try {
      if (onComplete) await onComplete();
      setPhase("done");
      startUndoWindow();
      window.setTimeout(() => onClose(), 700);
    } catch {
      setPhase("idle");
    }
  }, [onClose, onComplete, phase, startUndoWindow]);

  const handleUndo = useCallback(async () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setShowUndo(false);
    if (onUndo) await onUndo();
  }, [onUndo]);

  const dueLabel = data.due_date ? formatLongDate(data.due_date) : null;

  return (
    <>
      <TypeBadge type="task" completed={data.completed} />
      <Headline>{deriveHeadline(data.description, 6)}</Headline>
      <OneLiner>{data.description}</OneLiner>

      {/* Reason + stake render even without server-provided copy — the spec
          calls for these sections to always be visible. Placeholder copy
          uses Reid's voice so the empty state still feels intentional. */}
      <Section label="Why Reid assigned this">
        <SectionBody>
          {data.reason ??
            "Reid hasn't written the context for this one yet. It came out of a session — the why will fill in next time you talk."}
        </SectionBody>
      </Section>

      <Section label="What happens if you don't">
        <VoiceBody>
          {data.stake ??
            "Nothing dramatic. You just stay where you are. That's the cost."}
        </VoiceBody>
      </Section>

      {dueLabel && (
        <Section label="Due">
          <SectionBody>{dueLabel}</SectionBody>
        </Section>
      )}

      {!data.completed && (
        <div style={{ marginTop: 40 }}>
          <button
            type="button"
            onClick={handleComplete}
            disabled={phase !== "idle"}
            className="font-sans w-full flex items-center justify-center"
            style={{
              height: 56,
              borderRadius: 12,
              border: "none",
              background: COLOR.accent,
              color: COLOR.textPrimary,
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "0.02em",
              cursor: phase === "idle" ? "pointer" : "default",
              opacity: phase === "idle" ? 1 : 0.7,
              transition: "opacity 200ms ease",
            }}
          >
            {phase === "done" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Check size={18} strokeWidth={2.5} />
                Done
              </span>
            ) : phase === "completing" ? (
              "Saving…"
            ) : (
              "Mark complete"
            )}
          </button>
        </div>
      )}

      <AnimatePresence>
        {showUndo && (
          <motion.div
            key="undo-toast"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{
              position: "fixed",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: 24,
              padding: "12px 18px",
              borderRadius: 12,
              background: "rgba(10,22,40,0.96)",
              border: `1px solid ${COLOR.border}`,
              color: COLOR.textPrimary,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 16,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              zIndex: 10000,
            }}
            role="status"
            aria-live="polite"
          >
            <span className="font-sans">Task marked complete.</span>
            <button
              type="button"
              onClick={handleUndo}
              className="font-sans"
              style={{
                background: "transparent",
                border: "none",
                color: COLOR.accent,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                padding: 0,
              }}
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ----------------------------------------------------------------------------
// Reid's take
// ----------------------------------------------------------------------------

function ReidTake({
  type,
  id,
  contextText,
}: {
  type: "observation" | "goal" | "task";
  id: string;
  contextText: string;
}) {
  const [state, setState] = useState<
    "idle" | "loading" | "typing" | "done" | "error"
  >("idle");
  const [text, setText] = useState("");
  const [shown, setShown] = useState("");
  const cancelled = useRef(false);

  useEffect(() => {
    return () => {
      cancelled.current = true;
    };
  }, []);

  const runTypewriter = useCallback((full: string) => {
    setText(full);
    setShown("");
    setState("typing");
    let i = 0;
    cancelled.current = false;
    const step = () => {
      if (cancelled.current) return;
      i += 1;
      setShown(full.slice(0, i));
      if (i < full.length) {
        window.setTimeout(step, 18);
      } else {
        setState("done");
      }
    };
    window.setTimeout(step, 18);
  }, []);

  const handleClick = useCallback(async () => {
    if (state === "loading" || state === "typing") return;
    setState("loading");
    try {
      const res = await fetch("/api/reid-take", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, context: contextText }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { take?: string };
      const take = (data.take ?? "").trim();
      if (!take) throw new Error("empty");
      runTypewriter(take);
    } catch {
      setState("error");
    }
  }, [contextText, id, runTypewriter, state, type]);

  return (
    <Section label="Reid's take">
      {state === "idle" || state === "error" ? (
        <button
          type="button"
          onClick={handleClick}
          className="font-sans w-full"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${COLOR.border}`,
            borderRadius: 12,
            padding: "16px 18px",
            color: COLOR.textSecondary,
            fontSize: 15,
            fontWeight: 500,
            cursor: "pointer",
            transition: "background-color 200ms ease, border-color 200ms ease, color 200ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
            e.currentTarget.style.color = COLOR.textPrimary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)";
            e.currentTarget.style.borderColor = COLOR.border;
            e.currentTarget.style.color = COLOR.textSecondary;
          }}
        >
          {state === "error" ? "Try again" : "Reid's take"}
        </button>
      ) : state === "loading" ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
          aria-live="polite"
        >
          <span
            className="animate-pulse"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: COLOR.accent,
              flexShrink: 0,
            }}
          />
          <span
            className="font-serif italic"
            style={{
              fontSize: 17,
              color: COLOR.textSecondary,
              lineHeight: 1.4,
            }}
          >
            Reid&apos;s thinking…
          </span>
        </div>
      ) : (
        <p
          className="font-serif italic [text-wrap:pretty]"
          style={{
            fontSize: 17,
            color: COLOR.textPrimary,
            lineHeight: 1.8,
            whiteSpace: "pre-wrap",
            margin: 0,
          }}
        >
          {shown}
          {state === "typing" && (
            <span
              className="animate-pulse"
              style={{
                display: "inline-block",
                width: 2,
                height: "1em",
                background: COLOR.textPrimary,
                marginLeft: 2,
                verticalAlign: "-0.15em",
              }}
            />
          )}
          {state === "typing" && (
            <span aria-hidden style={{ display: "block", visibility: "hidden", height: 0 }}>
              {text}
            </span>
          )}
        </p>
      )}
    </Section>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function buildContextText(context: FullScreenContext): string {
  if (context.type === "observation") {
    const o = context.data;
    return [
      `Observation: ${o.text}`,
      o.category ? `Category: ${o.category}` : null,
      o.confidence ? `Confidence: ${o.confidence}` : null,
      o.trigger ? `Trigger: ${o.trigger}` : null,
      (o.evidence ?? []).length > 0
        ? `Evidence: ${(o.evidence ?? []).join(" | ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (context.type === "goal") {
    const g = context.data;
    return [
      `Goal: ${g.title}`,
      g.description ? `Description: ${g.description}` : null,
      `Progress: ${g.current_value} / ${g.target_value} ${g.unit}`,
      g.deadline ? `Deadline: ${g.deadline}` : null,
      g.blocking ? `Blocking: ${g.blocking}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  const t = context.data;
  return [
    `Task: ${t.description}`,
    t.due_date ? `Due: ${t.due_date}` : null,
    t.reason ? `Reason: ${t.reason}` : null,
    t.stake ? `Stake: ${t.stake}` : null,
    t.completed ? `Status: completed` : `Status: open`,
  ]
    .filter(Boolean)
    .join("\n");
}
