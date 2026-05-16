"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  Eye,
  Home,
  ListTodo,
  Map,
  MessageCircle,
  Settings,
  Target,
} from "lucide-react";
import LogoMark from "./LogoMark";
import NavItem from "./NavItem";
import SettingsModal from "./SettingsModal";
import PaywallModal from "./PaywallModal";
import { useMe } from "./AuthProvider";

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/chat", label: "Reid", icon: MessageCircle },
  { href: "/observations", label: "Noticed", icon: Eye },
  { href: "/plan", label: "Plan", icon: Map },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
] as const;

function openSettings() {
  // Agent 3 will mount a listener that opens the settings modal.
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("reid:open-settings"));
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const me = useMe();
  const [settingsHovered, setSettingsHovered] = useState(false);

  const name =
    me?.name?.trim() ||
    (me?.email ? me.email.split("@")[0] : null);
  const initial = name?.charAt(0).toUpperCase() ?? "·";

  return (
    <div className="min-h-screen flex flex-col bg-bg-dark">
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 w-[224px] flex-col z-40"
        style={{
          background: "rgba(8,18,34,0.98)",
          borderRight: "1px solid rgba(242,237,232,0.06)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <div
          className="flex items-center gap-3"
          style={{
            padding: "28px 22px 22px",
            borderBottom: "1px solid rgba(242,237,232,0.06)",
          }}
        >
          <LogoMark size={32} />
          <span
            className="font-serif text-text-primary"
            style={{
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            Reid
          </span>
          <button
            type="button"
            onClick={openSettings}
            onMouseEnter={() => setSettingsHovered(true)}
            onMouseLeave={() => setSettingsHovered(false)}
            aria-label="Open settings"
            className="ml-auto flex items-center justify-center"
            style={{
              padding: 8,
              background: "transparent",
              border: "none",
              color: settingsHovered ? "#7A90A8" : "#3A5070",
              transition: "color 150ms ease",
              cursor: "pointer",
              lineHeight: 0,
            }}
          >
            <Settings size={14} strokeWidth={1.7} />
          </button>
        </div>

        <nav
          className="flex flex-col flex-1"
          style={{ padding: "16px 10px", gap: 2 }}
        >
          {NAV.map((item) => (
            <NavItem key={item.href} {...item} variant="sidebar" />
          ))}
        </nav>

        {/* Identity chip: avatar initial + name. The previous decorative green
            "online" dot was removed — it had no real wiring (no presence
            channel, no realtime subscription) so it was misrepresenting
            state. The name is sourced from public.users.name, falling back to
            the local-part of the email. Identity row hides when neither name
            nor email is available. */}
        {name && (
          <div
            className="flex items-center gap-3"
            style={{
              padding: "16px 22px",
              borderTop: "1px solid rgba(242,237,232,0.06)",
            }}
          >
            <div
              className="rounded-full flex items-center justify-center"
              style={{
                width: 28,
                height: 28,
                background: "rgba(255,255,255,0.08)",
                fontFamily: "var(--font-sans), sans-serif",
                fontSize: 12,
                color: "#C8D5E3",
              }}
            >
              {initial}
            </div>
            <span
              className="font-sans truncate"
              style={{ fontSize: 13, color: "#7A90A8" }}
            >
              {name}
            </span>
          </div>
        )}
      </aside>

      <main className="reid-radial flex-1 md:ml-[224px] pb-20 md:pb-0">
        {/* Keying by pathname forces React to remount this wrapper on each
            navigation, so the page-enter animation actually fires (otherwise
            the App Router preserves the wrapper and only swaps `children`). */}
        <div key={pathname} className="page-enter">
          {children}
        </div>
      </main>

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/5 backdrop-blur"
        style={{
          background: "rgba(10,22,40,0.95)",
          paddingBottom: "env(safe-area-inset-bottom)",
          minHeight: 64,
        }}
      >
        <div className="mx-auto max-w-[680px] flex items-stretch px-2 py-1">
          {NAV.map((item) => (
            <NavItem key={item.href} {...item} variant="bottom" />
          ))}
        </div>
      </nav>

      {/* Globally mounted — listens for the `reid:open-settings` event the
          sidebar gear dispatches, regardless of which (app) route is active. */}
      <SettingsModal />
      {/* Globally mounted — opens on the `reid:open-paywall` event the chat
          page fires when /api/reid returns 429 daily_limit_exceeded, and on
          Settings → Upgrade to Pro. */}
      <PaywallModal />
    </div>
  );
}
