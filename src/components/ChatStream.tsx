"use client";
import { useEffect, useRef, type ReactNode } from "react";
import type { Message } from "@/types/chat";
import { ShiningText } from "@/components/ui/shining-text";

type ChatMessage = Message & { id?: string };

export default function ChatStream({
  messages,
  streamingText,
  isStreaming,
  faded = false,
  emptyState,
  headerSlot,
  suppressThinking = false,
}: {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  faded?: boolean;
  /** Rendered in place of the messages list when there are no messages and
   *  nothing is streaming. Used by /chat for the "Your co-founder is ready"
   *  empty state. */
  emptyState?: ReactNode;
  /** Optional content rendered above the messages — used by /chat to render
   *  session dividers and prior-session history scoped to this stream. */
  headerSlot?: ReactNode;
  /** When true, the red-dot + "thinking." indicator is hidden. Used by /chat
   *  in voice mode where the mic surface owns the thinking state and we don't
   *  want two indicators on screen at once. */
  suppressThinking?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the bottom marker into view on every messages update AND on
  // every streamingText delta. Including streamingText keeps the user pinned
  // to the latest character as Reid types.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, streamingText]);

  const hasContent = messages.length > 0 || (isStreaming && streamingText);
  const showEmpty = !!emptyState && !hasContent && !isStreaming;

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        paddingTop: "80px",
        paddingBottom: "160px",
        paddingLeft: "24px",
        paddingRight: "24px",
        scrollBehavior: "smooth",
        transition: "opacity 500ms ease 200ms",
        opacity: faded ? 0 : 1,
      }}
    >
      {showEmpty ? (
        <div className="h-full flex items-center justify-center">
          {emptyState}
        </div>
      ) : null}
      {headerSlot}
      {messages.map((m, i) => {
        const key = m.id ?? `${m.role}-${i}`;
        if (m.role === "assistant") {
          return (
            <div key={key} className="animate-fade-up mb-8">
              <p
                className="font-serif italic whitespace-pre-wrap max-w-[78%] [text-wrap:pretty] text-lg"
                style={{ lineHeight: 1.65, color: "#F2EDE3" }}
              >
                {m.content}
              </p>
            </div>
          );
        }
        return (
          <div key={key} className="animate-fade-right mb-8 flex justify-end">
            <div className="user-bubble max-w-[62%]">
              <p
                className="font-sans whitespace-pre-wrap [text-wrap:pretty]"
                style={{ fontSize: 15, lineHeight: 1.6, color: "#C8D5E3" }}
              >
                {m.content}
              </p>
            </div>
          </div>
        );
      })}

      {isStreaming && streamingText && (
        <div className="animate-fade-up mb-8">
          <p
            className="font-serif italic whitespace-pre-wrap max-w-[78%] [text-wrap:pretty] text-lg"
            style={{ lineHeight: 1.65, color: "#F2EDE3" }}
          >
            {streamingText}
            <span className="inline-block w-[2px] h-[1em] align-middle ml-0.5 bg-accent animate-pulse" />
          </p>
        </div>
      )}

      {isStreaming && !streamingText && !suppressThinking && (
        <div className="mb-8 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[#B91C1C] animate-pulse" />
          <ShiningText text="thinking." />
        </div>
      )}

      <div ref={bottomRef} style={{ height: "1px" }} />
    </div>
  );
}
