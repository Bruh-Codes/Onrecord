"use client";

import { SearchIcon, SunIcon, MoonIcon } from "@/components/icons";
import { useTheme } from "@/lib/theme";

export function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="flex items-center gap-4 px-4 sm:px-7 py-3 sm:py-3.5 border-b border-border">
      <div className="hidden sm:flex flex-1 max-w-[420px] items-center gap-2 bg-panel rounded-full px-4 py-2">
        <SearchIcon className="opacity-50" />
        <span className="text-[13px] opacity-50">Search documents, transactions…</span>
      </div>
      <div className="ml-auto flex items-center gap-4 text-[13px]">
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
        <span className="w-[30px] h-[30px] rounded-full bg-ink flex items-center justify-center text-paper text-[13px] font-bold cursor-pointer">
          +
        </span>
      </div>
    </div>
  );
}
