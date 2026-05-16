"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import type { Goal } from "@/types/db";
import { supabase } from "@/lib/supabase";
import { formatGoalValue } from "@/lib/format";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Picks one of three Reid-voiced verdicts based on the goal's shape:
 *  - currency goals ("£") → "You said {deadlineMonth}. It's {nowMonth}. Now raise the target."
 *  - count-noun goals (unit_prefix=false, e.g. "5 clients") → "First {target}. Now double it."
 *  - everything else → "Done. What's the next one?" */
function verdictFor(goal: Goal): string {
  const isCurrency = goal.unit_prefix && /[£$€¥]/.test(goal.unit);
  if (isCurrency) {
    const nowMonth = MONTHS[new Date().getMonth()];
    let deadlineMonth: string | null = null;
    if (goal.deadline) {
      const d = new Date(goal.deadline);
      if (!Number.isNaN(d.getTime())) deadlineMonth = MONTHS[d.getMonth()];
    }
    if (deadlineMonth) {
      return `You said ${deadlineMonth}. It's ${nowMonth}. Now raise the target.`;
    }
    return "You hit the number. Now raise the target.";
  }
  if (!goal.unit_prefix) {
    return `First ${formatGoalValue(goal, goal.target_value)}. Now double it.`;
  }
  return "Done. What's the next one?";
}

/** Full-screen ceremony overlay shown once when a goal's completed_at flips
 *  from null. Two paths:
 *  - "Set a new target" — inline form that updates target_value and clears
 *    completed_at; the Realtime subscription will refresh state.
 *  - "Continue" — dismisses the overlay only. */
export default function GoalCompleteOverlay({
  goal,
  onDismiss,
}: {
  goal: Goal;
  onDismiss: () => void;
}) {
  const [mode, setMode] = useState<"verdict" | "set-target">("verdict");
  const [newTarget, setNewTarget] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const parsed = Number(newTarget);
    if (!Number.isFinite(parsed) || parsed <= goal.current_value) {
      setSubmitError(
        `New target must be greater than ${formatGoalValue(goal, goal.current_value)}.`,
      );
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from("goals")
      .update({ target_value: parsed, completed_at: null })
      .eq("id", goal.id);
    setSubmitting(false);
    if (error) {
      setSubmitError("Couldn't update the goal. Try again.");
      return;
    }
    onDismiss();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{
        background: "rgba(2,10,20,0.95)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="absolute font-sans text-text-dim hover:text-text-primary transition-colors"
        style={{ top: 22, right: 22, padding: 8, background: "transparent", border: "none", cursor: "pointer", lineHeight: 0 }}
      >
        <X size={18} strokeWidth={1.7} />
      </button>

      <div
        className="animate-goal-complete-enter w-full max-w-[480px] flex flex-col items-center text-center"
        style={{ paddingTop: 24, paddingBottom: 24 }}
      >
        {/* Big accent check. */}
        <div
          className="flex items-center justify-center"
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            background: "rgba(185, 28, 28, 0.12)",
            border: "1.5px solid rgba(185, 28, 28, 0.6)",
            boxShadow: "0 0 32px rgba(185, 28, 28, 0.35)",
            marginBottom: 28,
          }}
        >
          <Check size={48} strokeWidth={2} color="var(--color-accent)" />
        </div>

        <p
          className="font-sans text-text-dim"
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: 14,
          }}
        >
          Goal complete
        </p>

        <h2
          className="font-serif text-text-primary [text-wrap:pretty]"
          style={{
            fontSize: 32,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          {goal.title}
        </h2>

        <p
          className="font-sans"
          style={{
            fontSize: 14,
            color: "#C8D5E3",
            marginTop: 10,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatGoalValue(goal, goal.target_value)} reached.
        </p>

        {mode === "verdict" ? (
          <>
            <p
              className="font-serif italic mt-7 [text-wrap:pretty]"
              style={{
                fontSize: 18,
                color: "#F2EDE3",
                lineHeight: 1.55,
                maxWidth: 360,
              }}
            >
              {verdictFor(goal)}
            </p>

            <div
              className="flex flex-col w-full mt-9"
              style={{ gap: 10, maxWidth: 320 }}
            >
              <button
                type="button"
                onClick={() => setMode("set-target")}
                className="cta-shadow w-full bg-accent hover:bg-accent-hover text-text-primary transition-all duration-200 hover:-translate-y-px"
                style={{
                  height: 46,
                  borderRadius: 9,
                  fontFamily: "var(--font-sans), sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Set a new target
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="w-full transition-all duration-200 hover:bg-white/5"
                style={{
                  height: 46,
                  borderRadius: 9,
                  fontFamily: "var(--font-sans), sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                  color: "#C8D5E3",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.10)",
                  cursor: "pointer",
                }}
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col w-full mt-7"
            style={{ gap: 12, maxWidth: 320 }}
          >
            <label
              className="font-sans text-text-dim text-left"
              htmlFor="goal-new-target"
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              New target
            </label>
            <input
              id="goal-new-target"
              type="number"
              inputMode="decimal"
              autoFocus
              min={goal.current_value + 0.01}
              step="any"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              placeholder={String(goal.target_value * 2)}
              className="font-sans text-text-primary"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1.5px solid rgba(255,255,255,0.08)",
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 16,
                outline: "none",
              }}
            />
            {submitError && (
              <p
                className="font-sans text-left"
                style={{
                  fontSize: 12,
                  color: "var(--color-accent)",
                  marginTop: -4,
                }}
              >
                {submitError}
              </p>
            )}
            <div className="flex" style={{ gap: 10, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => setMode("verdict")}
                disabled={submitting}
                className="flex-1 transition-all duration-200 hover:bg-white/5"
                style={{
                  height: 44,
                  borderRadius: 9,
                  fontFamily: "var(--font-sans), sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                  color: "#C8D5E3",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.10)",
                  cursor: "pointer",
                }}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="cta-shadow flex-1 bg-accent hover:bg-accent-hover text-text-primary transition-all duration-200 hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  height: 44,
                  borderRadius: 9,
                  fontFamily: "var(--font-sans), sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                  border: "none",
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
