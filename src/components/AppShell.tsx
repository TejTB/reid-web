"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import SessionsSidebar from "./SessionsSidebar";
import SettingsModal from "./SettingsModal";
import PaywallModal from "./PaywallModal";
import { UserDropdown } from "./UserDropdown";
import { useMe, useAuth, useEntitlement } from "./AuthProvider";
import { LocationTag } from "./ui/location-tag";
import { supabase } from "@/lib/supabase";
import { isPlausibleFirstName } from "@/lib/reid-summary";

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/chat", label: "Reid", icon: MessageCircle },
  { href: "/observations", label: "Noticed", icon: Eye },
  { href: "/plan", label: "Plan", icon: Map },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();
  const entitlement = useEntitlement();
  const { refresh } = useAuth();
  const [settingsHovered, setSettingsHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openSettings() {
    router.push("/settings");
  }

  const storedName = me?.name?.trim() || null;
  // Re-validate the stored name with isPlausibleFirstName so an existing
  // "Almost" row (from before the extractor was hardened) never reaches the UI.
  const validatedName =
    storedName && isPlausibleFirstName(storedName) ? storedName : null;
  const name =
    validatedName ?? (me?.email ? me.email.split("@")[0] : null);
  const initial = name?.charAt(0).toUpperCase() ?? "·";
  const isPro = me?.subscription_status === "pro";

  function openSettingsModal() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("reid:open-settings"));
  }
  function openPaywall() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("reid:open-paywall", {
        detail: { context: "default" },
      }),
    );
  }
  function triggerAvatarUpload() {
    fileInputRef.current?.click();
  }
  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/avatar/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (res.ok) {
        await refresh();
      } else {
        console.error("[avatar upload] failed:", res.status);
      }
    } catch (err) {
      console.error("[avatar upload] error:", err);
    }
  }

  const streak = me?.streak_days ?? 0;
  const sessionCount = me?.session_count ?? 0;
  const sessionLabel = isPro
    ? `Session ${sessionCount}`
    : entitlement
      ? `Session ${Math.min(entitlement.sessionsUsed + 1, entitlement.allowance)} of ${entitlement.allowance}`
      : "";
  const streakLabel = streak > 0 ? `🔥 ${streak} day streak` : "Start your streak";

  return (
    <div className="min-h-screen flex flex-col bg-bg-dark">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleAvatarFile}
        style={{ display: "none" }}
        aria-hidden="true"
      />

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
            padding: "24px 22px 20px",
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

        {/* "What Reid knows" — summarised-session history (Sprint 13 Build 2).
            Desktop only: lives inside this hidden-md:flex aside. */}
        <SessionsSidebar />

        {/* Stats strip — JARVIS status panel for the founder's pace. */}
        {name && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderTop: "1px solid rgba(242,237,232,0.06)",
              fontFamily: "var(--font-sans), sans-serif",
              fontSize: 11,
              color: "#7A90A8",
              letterSpacing: "0.02em",
            }}
          >
            <span>{streakLabel}</span>
            <span>{sessionLabel}</span>
          </div>
        )}

        {name && (
          <div
            style={{
              padding: "10px 12px",
              borderTop: "1px solid rgba(242,237,232,0.06)",
            }}
          >
            <UserDropdown
              user={{
                name,
                email: me?.email ?? null,
                initials: initial,
                is_pro: isPro,
                avatarUrl: me?.avatar_url ?? null,
              }}
              onOpenSettings={openSettingsModal}
              onUpgrade={openPaywall}
              onUploadAvatar={triggerAvatarUpload}
            />
            <div style={{ marginTop: 8, padding: "0 4px" }}>
              <LocationTag />
            </div>
          </div>
        )}
      </aside>

      <main className="reid-radial flex-1 md:ml-[224px] pb-20 md:pb-0">
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
          {/* Mobile-only account entry → /settings, which already carries
              sign-out, Manage billing (Stripe portal), upgrade and the
              entitlement-seam session display. A trailing avatar slot rather
              than a 7th labelled item keeps the bar legible at 390px. Desktop
              uses the sidebar gear + UserDropdown, so this is not in NAV. */}
          <Link
            href="/settings"
            aria-label="Account"
            aria-current={pathname === "/settings" ? "page" : undefined}
            className="relative flex flex-col items-center justify-center flex-1"
            style={{ minHeight: 44, padding: "8px 4px" }}
          >
            <span
              className="flex items-center justify-center rounded-full"
              style={{
                width: 26,
                height: 26,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${
                  pathname === "/settings"
                    ? "#B91C1C"
                    : "rgba(255,255,255,0.10)"
                }`,
                color: "#F2EDE3",
                fontFamily: "var(--font-sans), sans-serif",
                fontSize: 11,
                fontWeight: 500,
                transition: "border-color 150ms ease",
              }}
            >
              {initial}
            </span>
          </Link>
        </div>
      </nav>

      <SettingsModal />
      <PaywallModal />
    </div>
  );
}
