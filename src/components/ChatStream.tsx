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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamingText, isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto pt-6 pb-[120px]">
      <div className="flex flex-col">
        {messages.map((m, i) => {
          const key = m.id ?? `${m.role}-${i}`;
          if (m.role === "assistant") {
            return (
              <div key={key} className="animate-fade-up mb-8">
                <p className="font-serif italic text-text-primary text-[19px] leading-[1.75] whitespace-pre-wrap max-w-[72%]">
                  {m.content}
                </p>
              </div>
            );
          }
          return (
            <div key={key} className="animate-fade-up mb-8 flex justify-end">
              <div className="user-bubble max-w-[60%] px-[18px] py-[14px]">
                <p className="font-sans text-text-secondary text-[15px] leading-relaxed whitespace-pre-wrap">
                  {m.content}
                </p>
              </div>
            </div>
          );
        })}

        {isStreaming && streamingText && (
          <div className="animate-fade-up mb-8">
            <p className="font-serif italic text-text-primary text-[19px] leading-[1.75] whitespace-pre-wrap max-w-[72%]">
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
