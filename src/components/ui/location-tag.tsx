"use client";
import { useState, useEffect } from "react";

interface LocationTagProps {
  city?: string;
  country?: string;
  timezone?: string;
}

export function LocationTag({
  city = "Newcastle",
  country = "UK",
  timezone = "GMT",
}: LocationTagProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Europe/London",
        }),
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <button
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      type="button"
      className="group relative flex items-center gap-2 rounded-full px-3 py-1.5 transition-all duration-300"
      style={{
        border: "1px solid rgba(255,255,255,0.08)",
        background: isHovered ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
      }}
    >
      <div className="relative flex items-center justify-center flex-shrink-0">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
      </div>

      <div className="relative overflow-hidden h-4" style={{ width: "90px" }}>
        <span
          className="absolute text-xs font-medium transition-all duration-300 whitespace-nowrap"
          style={{
            color: "#7A90A8",
            transform: isHovered ? "translateY(-100%)" : "translateY(0)",
            opacity: isHovered ? 0 : 1,
          }}
        >
          {city}, {country}
        </span>
        <span
          className="absolute text-xs font-medium transition-all duration-300 whitespace-nowrap"
          style={{
            color: "#C8D5E3",
            transform: isHovered ? "translateY(0)" : "translateY(100%)",
            opacity: isHovered ? 1 : 0,
          }}
        >
          {currentTime} {timezone}
        </span>
      </div>
    </button>
  );
}
