"use client";
import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Settings, LogOut, Zap, Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { ShiningText } from "@/components/ui/shining-text";
import { signOut } from "@/lib/session";

interface UserDropdownProps {
  user: {
    name?: string | null;
    email?: string | null;
    initials?: string;
    is_pro?: boolean;
    avatarUrl?: string | null;
  };
  onOpenSettings: () => void;
  onUpgrade: () => void;
  onUploadAvatar?: () => void;
}

export function UserDropdown({
  user,
  onOpenSettings,
  onUpgrade,
  onUploadAvatar,
}: UserDropdownProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
    router.refresh();
  };

  const displayName = user.name?.trim() || "You";
  const initials =
    user.initials ?? user.name?.trim().charAt(0).toUpperCase() ?? "·";
  const hasAvatar = !!user.avatarUrl;

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group outline-none"
          aria-label="Open account menu"
        >
          {hasAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl ?? ""}
              alt={displayName}
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
              style={{ border: "1px solid rgba(185,28,28,0.25)" }}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#B91C1C]/15 border border-[#B91C1C]/25 flex items-center justify-center flex-shrink-0">
              <span className="text-xs text-[#B91C1C] font-medium font-sans">
                {initials}
              </span>
            </div>
          )}
          <span className="text-white/40 text-sm font-sans truncate group-hover:text-white/60 transition-colors">
            {displayName}
          </span>
        </button>
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          side="top"
          align="start"
          sideOffset={6}
          className="w-56 rounded-xl border border-white/8 bg-[#111111] p-1.5 shadow-2xl z-50 outline-none"
        >
          <div className="px-3 py-2.5 mb-1">
            <p className="text-white/70 text-sm font-medium truncate font-sans">
              {displayName}
            </p>
            {user.email && (
              <p className="text-white/25 text-xs truncate font-sans mt-0.5">
                {user.email}
              </p>
            )}
          </div>

          <div className="h-px bg-white/6 mb-1" />

          {onUploadAvatar && (
            <DropdownMenuPrimitive.Item
              onSelect={onUploadAvatar}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 focus:bg-white/5 focus:text-white/70 cursor-pointer transition-colors outline-none text-sm font-sans"
            >
              <Camera className="w-3.5 h-3.5" />
              Upload photo
            </DropdownMenuPrimitive.Item>
          )}

          <DropdownMenuPrimitive.Item
            onSelect={onOpenSettings}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 focus:bg-white/5 focus:text-white/70 cursor-pointer transition-colors outline-none text-sm font-sans"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </DropdownMenuPrimitive.Item>

          {user.is_pro ? (
            <div className="flex items-center gap-2.5 px-3 py-2 text-sm">
              <Zap className="w-3.5 h-3.5 text-[#B91C1C]" />
              <ShiningText text="Reid Pro" />
            </div>
          ) : (
            <DropdownMenuPrimitive.Item
              onSelect={onUpgrade}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 focus:bg-white/5 focus:text-white/70 cursor-pointer transition-colors outline-none text-sm font-sans"
            >
              <Zap className="w-3.5 h-3.5 text-[#B91C1C]" />
              Upgrade to Pro
            </DropdownMenuPrimitive.Item>
          )}

          <div className="h-px bg-white/6 my-1" />

          <DropdownMenuPrimitive.Item
            onSelect={handleLogout}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/25 hover:text-white/50 hover:bg-white/5 focus:bg-white/5 focus:text-white/50 cursor-pointer transition-colors outline-none text-sm font-sans"
          >
            <LogOut className="w-3.5 h-3.5" />
            Log out
          </DropdownMenuPrimitive.Item>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
