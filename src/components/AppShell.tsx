"use client";
import { useEffect, useState } from "react";
import { Home, MessageCircle, Map, ListTodo } from "lucide-react";
import LogoMark from "./LogoMark";
import NavItem from "./NavItem";
import { getUserId, getUser } from "@/lib/session";

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/chat", label: "Reid", icon: MessageCircle },
  { href: "/plan", label: "Plan", icon: Map },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = getUserId();
      if (!id) return;
      const u = await getUser(id);
      if (cancelled) return;
      setName(u?.name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const initial = name?.charAt(0).toUpperCase() ?? "·";

  return (
    <div className="min-h-screen flex flex-col bg-bg-dark">
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 w-[220px] flex-col z-40"
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
            padding: "28px 24px 24px",
            borderBottom: "1px solid rgba(242,237,232,0.06)",
          }}
        >
          <LogoMark size={30} />
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
        </div>

        <nav
          className="flex flex-col flex-1"
          style={{ padding: "20px 12px", gap: 2 }}
        >
          {NAV.map((item) => (
            <NavItem key={item.href} {...item} variant="sidebar" />
          ))}
        </nav>

        <div
          className="flex items-center gap-3"
          style={{
            padding: "20px 24px",
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
            {name ?? "Friend"}
          </span>
        </div>
      </aside>

      <main className="flex-1 md:ml-[220px] pb-20 md:pb-0">
        <div className="page-enter">{children}</div>
      </main>

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur-xl"
        style={{
          background: "rgba(10,22,40,0.95)",
          borderTopColor: "rgba(242,237,232,0.06)",
        }}
      >
        <div className="mx-auto max-w-[680px] flex items-stretch px-2 py-1">
          {NAV.map((item) => (
            <NavItem key={item.href} {...item} variant="bottom" />
          ))}
        </div>
      </nav>
    </div>
  );
}
