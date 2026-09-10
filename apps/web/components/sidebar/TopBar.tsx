"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BellIcon, SearchIcon, SunIcon, MoonIcon, LogOutIcon } from "@/components/icons";
import { useTheme } from "@/lib/theme";
import { authClient } from "@/lib/auth-client";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useMe, useNotifications } from "@/lib/hooks/use-business";
import icon from "@/public/icon.png";

export function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const isDark = theme === "dark";
  const { data: session } = authClient.useSession();
  const { businessId } = useMe();
  const notifications = useNotifications(businessId);
  const markRead = useMarkNotificationRead(businessId);
  const markAllRead = useMarkAllNotificationsRead(businessId);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDropdownOpen && !isNotificationsOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current && !wrapperRef.current.contains(target)) {
        setIsDropdownOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setIsNotificationsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDropdownOpen(false);
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isDropdownOpen, isNotificationsOpen]);

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

  const openNotification = async (id: string, href: string | null) => {
    await markRead.mutateAsync(id);
    setIsNotificationsOpen(false);
    if (href) router.push(href);
  };

  const displayTime = (value: string) => value.replace("T", " ").slice(0, 16);

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
        <div ref={notificationsRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setIsNotificationsOpen((open) => !open);
              setIsDropdownOpen(false);
            }}
            aria-label={`Notifications${(notifications.data?.unread_count ?? 0) > 0 ? `, ${notifications.data?.unread_count} unread` : ""}`}
            aria-haspopup="dialog"
            aria-expanded={isNotificationsOpen}
            className="relative rounded-full p-2 transition-colors hover:bg-panel cursor-pointer"
          >
            <BellIcon className="w-4 h-4" />
            {(notifications.data?.unread_count ?? 0) > 0 && (
              <span className="absolute -right-0.5 -top-0.5 min-w-4 h-4 rounded-full bg-negative px-1 text-[9px] leading-4 text-white text-center">
                {(notifications.data?.unread_count ?? 0) > 99 ? "99+" : notifications.data?.unread_count}
              </span>
            )}
          </button>
          {isNotificationsOpen && (
            <div role="dialog" aria-label="Notifications" className="absolute right-0 top-full mt-2 w-[min(360px,calc(100vw-24px))] rounded-2xl border border-ink/16 bg-panel-strong p-2 shadow-xl z-50">
              <div className="flex items-center justify-between px-3 py-2">
                <div className="font-semibold">Notifications</div>
                <button
                  type="button"
                  disabled={!notifications.data?.unread_count || markAllRead.isPending}
                  onClick={() => markAllRead.mutate()}
                  className="text-[11px] text-ink/60 underline underline-offset-2 disabled:no-underline disabled:opacity-40"
                >
                  Mark all as read
                </button>
              </div>
              <div className="max-h-[min(420px,60vh)] overflow-y-auto">
                {(notifications.data?.items ?? []).length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-ink/55">You’re all caught up.</div>
                ) : (notifications.data?.items ?? []).map((notification) => (
                  <div key={notification.id} className={`rounded-xl px-3 py-3 ${notification.read_at ? "opacity-60" : "bg-paper"}`}>
                    <button type="button" onClick={() => void openNotification(notification.id, notification.href)} className="w-full text-left">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.severity === "warning" ? "bg-amber" : notification.read_at ? "bg-ink/20" : "bg-negative"}`} />
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold">{notification.title}</div>
                          <div className="mt-0.5 text-xs leading-relaxed text-ink/65">{notification.body}</div>
                          <div className="mt-1 text-[10px] text-ink/45">{displayTime(notification.created_at)}</div>
                        </div>
                      </div>
                    </button>
                    {!notification.read_at && (
                      <button
                        type="button"
                        onClick={() => void markRead.mutateAsync(notification.id)}
                        className="ml-4 mt-2 text-[10px] font-semibold text-ink/60 underline underline-offset-2"
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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
