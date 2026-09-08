"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { SearchIcon, SunIcon, MoonIcon, LogOutIcon } from "@/components/icons";
import { useTheme } from "@/lib/theme";
import { authClient } from "@/lib/auth-client";
import icon from "@/public/icon.png";

export function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const isDark = theme === "dark";
  const { data: session } = authClient.useSession();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDropdownOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsDropdownOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isDropdownOpen]);

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      setIsDropdownOpen(false);
      await authClient.signOut({
        fetchOptions: { onSuccess: () => router.push("/signup") },
      });
    } catch {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-3 sm:px-7 py-3 sm:py-3.5 border-b border-border sticky top-0 z-30 bg-paper/80 backdrop-blur">
      <Link
        href="/dashboard"
        className="md:hidden flex items-center gap-2 shrink-0"
        aria-label="Onrecord home"
      >
        <Image src={icon} alt="" width={26} height={26} />
        <span className="font-display text-[16px] hidden sm:inline">Onrecord</span>
      </Link>

      <div className="flex-1 flex items-center gap-2 md:max-w-[420px] bg-panel rounded-full px-4 py-2 text-[13px]">
        <SearchIcon className="opacity-50 shrink-0" />
        <span className="opacity-50 truncate">Search documents, transactions…</span>
      </div>

      <div className="ml-auto flex items-center gap-3 sm:gap-4 text-[13px] shrink-0">
        <button
          type="button"
          onClick={toggleTheme}
          aria-pressed={isDark}
          aria-label="Toggle dark mode"
          title="Toggle dark mode"
          className={`w-8 h-[18px] rounded-full relative cursor-pointer transition-colors ${
            isDark ? "bg-[#4a4a47]" : "bg-[#dddddb]"
          }`}
        >
          <span
            className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center text-[#141414] transition-[left] ${
              isDark ? "left-4" : "left-0.5"
            }`}
          >
            {isDark ? <MoonIcon className="w-2.5 h-2.5" /> : <SunIcon className="w-2.5 h-2.5" />}
          </span>
        </button>

        <div ref={wrapperRef} className="relative">
          <button
            type="button"
            onClick={() => setIsDropdownOpen((open) => !open)}
            disabled={isLoading}
            aria-haspopup="menu"
            aria-expanded={isDropdownOpen}
            aria-label="Account menu"
            className="rounded-full p-1 transition-colors hover:bg-panel cursor-pointer"
          >
            <span className="w-[30px] h-[30px] rounded-full bg-ink text-paper text-[13px] font-bold flex items-center justify-center">
              {session?.user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={session.user.name ?? ""}
                  className="w-[30px] h-[30px] rounded-full object-cover"
                />
              ) : (
                (session?.user?.name ?? "?").charAt(0)
              )}
            </span>
          </button>

          {isDropdownOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 min-w-[160px] rounded-xl bg-panel-strong border border-ink/16 shadow-lg p-1 z-50"
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                disabled={isLoading}
                className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-left transition-colors hover:bg-ink hover:text-paper cursor-pointer disabled:opacity-60"
              >
                <LogOutIcon />
                {isLoading ? "Logging out..." : "Log out"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}