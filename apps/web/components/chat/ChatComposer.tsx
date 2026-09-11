"use client";

import { useState } from "react";
import { useAppActions } from "@/lib/app-state";
import { CHAT_SCRIPT } from "@/lib/mock-data";

type ChatComposerProps = {
	chatIndex: number;
	disabled?: boolean;
	onReplyStart?: (reply: () => void) => void;
};

export function ChatComposer({
	chatIndex,
	disabled = false,
	onReplyStart,
}: ChatComposerProps) {
	const { chooseChatReply, submitCustomChatReply } = useAppActions();
	const [customText, setCustomText] = useState("");
	const step = CHAT_SCRIPT[chatIndex];

	function queueReply(reply: () => void) {
		if (onReplyStart) {
			onReplyStart(reply);
			return;
		}
		reply();
	}

  return (
    <>
      <div className="bg-accent rounded-2xl px-3.5 py-2.5 text-xs text-[#2a2a2a] mb-3">{step.hint}</div>
      <div className="flex flex-col gap-2 mb-3.5">
        {step.choices.map((choice, i) => (
          <button
            key={choice.label}
            type="button"
            disabled={disabled}
            onClick={() =>
              queueReply(() => chooseChatReply(i as 0 | 1))
            }
            className="text-left bg-white border border-foreground/16 rounded-2xl px-4 py-3 text-sm cursor-pointer text-foreground"
          >
            {choice.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2.5 mb-1.5">
        <div className="flex-1 h-px bg-foreground/12" />
        <span className="text-[11px] opacity-50">or type your own answer</span>
        <div className="flex-1 h-px bg-foreground/12" />
      </div>
      <div className="flex gap-2">
        <input
          disabled={disabled}
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          placeholder="Type an answer…"
          className="flex-1 px-4 py-2 text-sm text-foreground bg-muted border border-foreground/16 rounded-full"
        />
        <button
          type="button"
          disabled={disabled || !customText.trim()}
          onClick={() => {
            queueReply(() => submitCustomChatReply(customText));
            setCustomText("");
          }}
          className="shrink-0 bg-foreground text-background text-[13.5px] px-5 border-none rounded-full cursor-pointer"
        >
          Send
        </button>
      </div>
    </>
  );
}
