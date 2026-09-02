"use client";

import { useState } from "react";
import { useAppActions } from "@/lib/app-state";
import { CHAT_SCRIPT } from "@/lib/mock-data";

export function ChatComposer({ chatIndex }: { chatIndex: number }) {
  const { chooseChatReply, submitCustomChatReply } = useAppActions();
  const [customText, setCustomText] = useState("");
  const step = CHAT_SCRIPT[chatIndex];

  return (
    <>
      <div className="bg-panel-strong rounded-2xl px-3.5 py-2.5 text-xs text-[#2a2a2a] mb-3">{step.hint}</div>
      <div className="flex flex-col gap-2 mb-3.5">
        {step.choices.map((choice, i) => (
          <button
            key={choice.label}
            type="button"
            onClick={() => chooseChatReply(i as 0 | 1)}
            className="text-left bg-white border border-ink/16 rounded-2xl px-4 py-3 text-sm cursor-pointer text-ink"
          >
            {choice.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2.5 mb-1.5">
        <div className="flex-1 h-px bg-ink/12" />
        <span className="text-[11px] opacity-50">or type your own answer</span>
        <div className="flex-1 h-px bg-ink/12" />
      </div>
      <div className="flex gap-2">
        <input
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          placeholder="Type an answer…"
          className="flex-1 px-4 py-2 text-sm text-ink bg-panel border border-ink/16 rounded-full"
        />
        <button
          type="button"
          onClick={() => {
            submitCustomChatReply(customText);
            setCustomText("");
          }}
          className="shrink-0 bg-ink text-paper text-[13.5px] px-5 border-none rounded-full cursor-pointer"
        >
          Send
        </button>
      </div>
    </>
  );
}
