"use client";
import { ArrowUp } from "lucide-react";
import { useRef, useState } from "react";

export default function ChatInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (content: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = !!value.trim() && !disabled;

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
    <div className="py-4">
      <div className="input-bar flex items-end gap-3 px-5 py-4">
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
