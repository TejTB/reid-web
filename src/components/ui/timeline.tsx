"use client";
import { cn } from "@/lib/utils";
import { GlowCard } from "./glow-card";

interface TimelineEvent {
  sessionNumber: number;
  date: string;
  summary: string;
  tasksCount?: number;
  goalDelta?: number;
  goalUnit?: string;
  goalUnitPrefix?: string;
}

interface TimelineProps {
  events: TimelineEvent[];
}

export const Timeline = ({ events }: TimelineProps) => {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-white/20 text-sm italic font-serif">
          Your plan builds after your first session.
        </p>
      </div>
    );
  }

  return (
    <div className="relative max-w-2xl mx-auto py-12 px-4">
      <div className="absolute left-[18px] top-0 h-full w-[2px] bg-gradient-to-b from-[#B91C1C]/60 to-[#B91C1C]/10" />

      <div className="space-y-10">
        {events.map((event, idx) => (
          <div key={idx} className="relative flex gap-6 items-start">
            <div className="relative z-10 mt-1">
              <div
                className={cn(
                  "h-4 w-4 rounded-full border-2 border-[#0a0a0a]",
                  "bg-[#B91C1C]",
                  "shadow-[0_0_12px_rgba(185,28,28,0.6)]",
                  "transition-transform duration-200 hover:scale-110",
                )}
              />
            </div>

            <div className="flex-1">
              <GlowCard customSize={true} glowColor="red" className="w-full p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-widest text-[#B91C1C]">
                    Session {event.sessionNumber}
                  </span>
                  <span className="text-xs text-white/30">{event.date}</span>
                </div>

                <p className="text-white/80 text-sm leading-relaxed font-serif italic mb-4">
                  {event.summary}
                </p>

                <div className="flex items-center gap-4 pt-3 border-t border-white/6">
                  {event.goalDelta !== undefined && (
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          event.goalDelta > 0
                            ? "text-[#16a34a]"
                            : "text-white/30",
                        )}
                      >
                        {event.goalDelta > 0
                          ? `+${event.goalDelta}`
                          : event.goalDelta === 0
                            ? "—"
                            : event.goalDelta}
                      </span>
                      <span className="text-xs text-white/30">
                        {event.goalUnitPrefix}
                        {event.goalUnit}
                      </span>
                    </div>
                  )}
                  {event.tasksCount !== undefined && event.tasksCount > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-white/40">
                        {event.tasksCount}{" "}
                        {event.tasksCount === 1 ? "task" : "tasks"} assigned
                      </span>
                    </div>
                  )}
                </div>
              </GlowCard>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
