"use client";
import { useEffect, useRef } from "react";
import type { Message } from "@/types/chat";
import TypingDots from "./TypingDots";

type ChatMessage = Message & { id?: string };

export default function ChatStream({
  messages,
  streamingText,
  isStreaming,
  faded = false,
}: {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  faded?: boolean;
}) {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the end-marker into view on every messages update. We do NOT
  // depend on streamingText/isStreaming here — that's intentional, per the
  // Sprint 3 hotfix spec. Per-token scroll during streaming caused jitter and
  // is no longer wanted.
  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  return (
    <div
      ref={messagesContainerRef}
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
      {messages.map((m, i) => {
        const key = m.id ?? `${m.role}-${i}`;
        if (m.role === "assistant") {
          return (
            <div key={key} className="animate-fade-up mb-8">
              <p
                className="font-serif italic whitespace-pre-wrap max-w-[78%]"
                style={{ fontSize: 20, lineHeight: 1.75, color: "#F2EDE3" }}
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
                className="font-sans whitespace-pre-wrap"
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
            className="font-serif italic whitespace-pre-wrap max-w-[78%]"
            style={{ fontSize: 20, lineHeight: 1.75, color: "#F2EDE3" }}
          >
            {streamingText}
            <span className="inline-block w-[2px] h-[18px] align-[-3px] ml-0.5 bg-text-secondary animate-caret" />
          </p>
        </div>
      )}

      {isStreaming && !streamingText && (
        <div className="mb-8">
          <TypingDots />
        </div>
      )}

      <div ref={endRef} style={{ height: "1px" }} />
    </div>
  );
}
