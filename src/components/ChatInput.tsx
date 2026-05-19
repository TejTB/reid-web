"use client";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Design tokens for the focus ring. Kept here as constants because they only
// apply to this component and are derived from the design system:
//   BORDER_IDLE / BORDER_FOCUS  — neutral white wrapper border (no red).
//   FOCUS_RING                  — single red box-shadow ring on the textarea.
// This deliberately bypasses the global `.input-bar:focus-within` rule (which
// painted the wrapper red), so the user sees ONE red ring on the textarea
// and a subtle neutral wrapper border — never both at once.
const WRAPPER_BORDER_IDLE = "1px solid rgba(255,255,255,0.10)";
const WRAPPER_BORDER_FOCUS = "1px solid rgba(255,255,255,0.20)";
const TEXTAREA_FOCUS_RING = "0 0 0 3px rgba(185,28,28,0.15)";

export default function ChatInput({
  onSubmit,
  disabled,
  autofocus = true,
}: {
  onSubmit: (content: string) => void;
  disabled?: boolean;
  /** When false, the input does not steal focus on mount or on disabled→enabled
   *  transitions. /chat passes false outside the empty state so we don't fight
   *  the user's scroll position on every render. */
  autofocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [wrapperFocused, setWrapperFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = !!value.trim() && !disabled;

  useEffect(() => {
    if (autofocus) textareaRef.current?.focus();
  }, [autofocus]);

  useEffect(() => {
    if (!disabled && autofocus) textareaRef.current?.focus();
  }, [disabled, autofocus]);

  function autoresize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  return (
    <div
      // Fixed at the bottom of the viewport so messages scroll under the input.
      // On mobile, the AppShell bottom nav (h=64px + safe-area inset) is also
      // fixed; this Tailwind arbitrary class places the input ABOVE the nav on
      // screens <768px and flush with the viewport bottom on md+ (and on
      // /onboarding, which is outside the (app) group and has no bottom nav).
      className="fixed left-0 right-0 z-50 bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-0"
      style={{
        background: "rgba(10,22,40,0.96)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderTop: "1px solid rgba(242,237,232,0.06)",
        padding: "16px 24px 32px",
      }}
    >
      {/* Wrapper: subtle neutral border that lifts on focus-within. We
          intentionally do NOT use the global `.input-bar` class here because
          its `:focus-within` rule paints the border red, which clashed with
          the textarea's focus ring (two red borders at once). */}
      <div
        className="flex items-end gap-3 px-5 py-4 mx-auto max-w-[720px]"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: wrapperFocused ? WRAPPER_BORDER_FOCUS : WRAPPER_BORDER_IDLE,
          borderRadius: 14,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          transition: "border-color 200ms ease",
        }}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onFocus={() => setWrapperFocused(true)}
          onBlur={() => setWrapperFocused(false)}
          onChange={(e) => {
            setValue(e.target.value);
            autoresize(e.currentTarget);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="What's the situation?"
          className="flex-1 resize-none bg-transparent text-text-primary placeholder:text-text-dim text-[15px] leading-relaxed max-h-[180px]"
          style={{
            // Suppress the global `:focus-visible` outline (globals.css line ~51)
            // — we replace it with a single red ring below so we never stack
            // outline + box-shadow.
            outline: "none",
            boxShadow: wrapperFocused ? TEXTAREA_FOCUS_RING : "none",
            borderRadius: 6,
            transition: "box-shadow 200ms ease",
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label="Send"
          className="shrink-0 w-10 h-10 rounded-full bg-accent text-text-primary flex items-center justify-center transition-all duration-200 hover:bg-accent-hover hover:scale-[1.05] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-accent"
        >
          <ArrowUp size={18} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
