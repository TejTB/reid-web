"use client";
import React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { ArrowUp, Paperclip, Square, StopCircle, Mic, X } from "lucide-react";
import { cn } from "@/lib/utils";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={1}
      className={cn(
        "flex w-full rounded-md border-none bg-transparent px-3 py-2.5 text-sm text-gray-100 placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px] resize-none",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border border-white/10 bg-[#111111] px-3 py-1.5 text-xs text-white shadow-md",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost";
  size?: "default" | "icon";
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variantClasses = {
      default: "bg-[#B91C1C] hover:bg-[#991818] text-white",
      ghost: "bg-transparent hover:bg-white/5",
    };
    const sizeClasses = {
      default: "h-10 px-4 py-2",
      icon: "h-8 w-8 rounded-full aspect-[1/1]",
    };
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

interface PromptInputBoxProps {
  onSend?: (message: string, files?: File[]) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  /** When the input is empty, the send button is replaced by a mic icon and
   *  clicking it calls this handler instead of submitting. Used by /chat to
   *  intercept the voice path through a Pro gate before recording starts. */
  onMicClick?: () => void;
  /** Renders a small badge slot to the left of the send/mic button. /chat
   *  uses this to surface a ShiningText "PRO" badge next to the mic for
   *  free users. */
  inlineBadge?: React.ReactNode;
  /** When set, seeds the input on mount. Only applied once — subsequent
   *  changes don't overwrite the user's typing. Used by the goals page to
   *  pre-fill "I want to set a new goal: " via /chat?prefill=…. */
  initialValue?: string;
}

export const PromptInputBox = React.forwardRef<HTMLDivElement, PromptInputBoxProps>(
  ({ onSend = () => {}, isLoading = false, placeholder = "What's the situation?", className, onMicClick, inlineBadge, initialValue }, ref) => {
    const [input, setInput] = React.useState(initialValue ?? "");
    const [files, setFiles] = React.useState<File[]>([]);
    const [previews, setPreviews] = React.useState<Record<string, string>>({});
    const [focused, setFocused] = React.useState(false);
    const uploadInputRef = React.useRef<HTMLInputElement>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const wasLoadingRef = React.useRef(false);

    React.useEffect(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
    }, [input]);

    // Re-focus the textarea the moment isLoading flips false. Covers both the
    // post-send case (parent flipped isLoading on while streaming) and the
    // post-receive case (stream ended, parent flipped it back off). Tracked
    // via a ref so we only fire on the true→false transition, not on every
    // false render — that would steal focus from anywhere else the user
    // clicks while idle.
    React.useEffect(() => {
      if (wasLoadingRef.current && !isLoading) {
        textareaRef.current?.focus();
      }
      wasLoadingRef.current = isLoading;
    }, [isLoading]);

    const processFile = (file: File) => {
      if (!file.type.startsWith("image/")) return;
      if (file.size > 10 * 1024 * 1024) return;
      setFiles([file]);
      const reader = new FileReader();
      reader.onload = (e) =>
        setPreviews({ [file.name]: e.target?.result as string });
      reader.readAsDataURL(file);
    };

    const handleSubmit = () => {
      if (isLoading) return;
      const text = input.trim();
      if (!text && files.length === 0) return;
      onSend(text, files);
      setInput("");
      setFiles([]);
      setPreviews({});
    };

    const hasContent = input.trim() !== "" || files.length > 0;

    return (
      <TooltipProvider>
        <div
          ref={ref}
          className={cn(
            "rounded-2xl bg-[#0a0a0a] p-2 shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition-[border-color,box-shadow] duration-150",
            className,
          )}
          style={{
            border: isLoading
              ? "1px solid rgba(185,28,28,0.70)"
              : focused
                ? "1px solid rgba(255,255,255,0.20)"
                : "1px solid rgba(255,255,255,0.10)",
            boxShadow:
              focused && !isLoading
                ? "0 8px 30px rgba(0,0,0,0.4), 0 0 0 3px rgba(185,28,28,0.15)"
                : "0 8px 30px rgba(0,0,0,0.4)",
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
            if (f) processFile(f);
          }}
        >
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-2">
              {files.map((file) => {
                const src = previews[file.name];
                if (!src) return null;
                return (
                  <div key={file.name} className="relative">
                    <div className="w-16 h-16 rounded-xl overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={file.name} className="h-full w-full object-cover" />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFiles([]);
                        setPreviews({});
                      }}
                      className="absolute top-1 right-1 rounded-full bg-black/70 p-0.5"
                      aria-label="Remove image"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={placeholder}
            disabled={isLoading}
          />

          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                    className="flex h-8 w-8 text-white/30 items-center justify-center rounded-full transition-colors hover:bg-white/5 hover:text-white/60"
                    disabled={isLoading}
                    aria-label="Attach image"
                  >
                    <Paperclip className="h-4 w-4" />
                    <input
                      ref={uploadInputRef}
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) processFile(f);
                        e.target.value = "";
                      }}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Attach image</TooltipContent>
              </Tooltip>
            </div>

            <div className="flex items-center gap-2">
              {inlineBadge && !hasContent && !isLoading && (
                <span className="pointer-events-none select-none">
                  {inlineBadge}
                </span>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="icon"
                    onClick={() => {
                      if (isLoading) return;
                      if (hasContent) {
                        handleSubmit();
                        return;
                      }
                      if (onMicClick) {
                        onMicClick();
                      }
                    }}
                    disabled={isLoading || (!hasContent && !onMicClick)}
                    aria-label={
                      isLoading
                        ? "Sending"
                        : hasContent
                          ? "Send"
                          : onMicClick
                            ? "Speak to Reid"
                            : "Send"
                    }
                    className={cn(
                      "h-8 w-8 rounded-full",
                      !hasContent &&
                        "bg-transparent text-white/40 hover:text-white/80",
                    )}
                  >
                    {isLoading ? (
                      <Square className="h-3 w-3 fill-white animate-pulse" />
                    ) : hasContent ? (
                      <ArrowUp className="h-4 w-4 text-white" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {isLoading
                    ? "Sending"
                    : hasContent
                      ? "Send"
                      : onMicClick
                        ? "Speak to Reid"
                        : "Send"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </TooltipProvider>
    );
  },
);
PromptInputBox.displayName = "PromptInputBox";

// Unused exports kept for parity with the Sprint 8B reference signature.
// They're not currently re-imported anywhere; this comment is a marker for
// future use if the input box gets richer toolbars.
export { StopCircle, Mic };
