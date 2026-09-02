"use client";

import { useAppActions, useAppState } from "@/lib/app-state";
import { SearchIcon } from "@/components/icons";

export function TopBar() {
  const { draftMode } = useAppState();
  const { toggleDraftMode } = useAppActions();

  return (
    <div className="flex items-center gap-4 px-7 py-3.5 border-b border-border">
      <div className="flex-1 max-w-[420px] flex items-center gap-2 bg-panel rounded-full px-4 py-2">
        <SearchIcon className="opacity-50" />
        <span className="text-[13px] opacity-50">Search documents, transactions…</span>
      </div>
      <div className="ml-auto flex items-center gap-4 text-[13px]">
        <span className="opacity-70">Draft mode</span>
        <button
          type="button"
          onClick={toggleDraftMode}
          aria-pressed={draftMode}
          className={`w-8 h-[18px] rounded-full relative cursor-pointer transition-colors ${
            draftMode ? "bg-ink" : "bg-[#dddddb]"
          }`}
        >
          <span
            className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-[left] ${
              draftMode ? "left-4" : "left-0.5"
            }`}
          />
        </button>
        <span className="w-[30px] h-[30px] rounded-full bg-ink flex items-center justify-center text-paper text-[13px] font-bold cursor-pointer">
          +
        </span>
      </div>
    </div>
  );
}
