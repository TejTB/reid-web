"use client";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
      <div className="input-bar flex items-end gap-3 px-5 py-4 mx-auto max-w-[720px]">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
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
          placeholder="Say something..."
          className="flex-1 resize-none bg-transparent outline-none text-text-primary placeholder:text-text-dim text-[15px] leading-relaxed max-h-[180px]"
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
