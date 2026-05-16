"use client";
import { useEffect, useRef } from "react";
import type { Message } from "@/types/chat";
import TypingDots from "./TypingDots";

type ChatMessage = Message & { id?: string };

export default function ChatStream({
  messages,
  streamingText,
  isStreaming,
}: {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const firstScroll = useRef(true);

  useEffect(() => {
    // First render after history loads should be an instant jump (no animation
    // from top down through the whole transcript). Subsequent updates — new
    // user messages, streaming deltas, end-of-stream — animate smoothly.
    const behavior: ScrollBehavior = firstScroll.current ? "instant" : "smooth";
    firstScroll.current = false;
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, [messages, streamingText, isStreaming]);

  return (
    <div
      // Bottom padding clears the fixed ChatInput bar. On mobile the input also
      // sits above the 64px bottom nav, so we need more clearance (~160px).
      className="flex-1 overflow-y-auto pt-6 pb-[160px] md:pb-[140px]"
      style={{ scrollBehavior: "smooth" }}
    >
      <div className="flex flex-col">
        {messages.map((m, i) => {
          const key = m.id ?? `${m.role}-${i}`;
          if (m.role === "assistant") {
            return (
              <div key={key} className="animate-fade-up mb-8">
                <p
                  className="font-serif italic whitespace-pre-wrap max-w-[78%]"
                  style={{
                    fontSize: 20,
                    lineHeight: 1.75,
                    color: "#F2EDE3",
                  }}
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
                  style={{
                    fontSize: 15,
                    lineHeight: 1.6,
                    color: "#C8D5E3",
                  }}
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
              style={{
                fontSize: 20,
                lineHeight: 1.75,
                color: "#F2EDE3",
              }}
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

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
