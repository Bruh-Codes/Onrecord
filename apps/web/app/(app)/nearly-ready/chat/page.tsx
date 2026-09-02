"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { BackArrowIcon } from "@/components/icons";
import { useAppActions, useAppState } from "@/lib/app-state";
import { CHAT_SCRIPT } from "@/lib/mock-data";

export default function AssistantChatPage() {
  const { chatLog, chatIndex } = useAppState();
  const { startChat } = useAppActions();

  useEffect(() => {
    startChat();
  }, [startChat]);

  const hasOpenQuestion = chatIndex < CHAT_SCRIPT.length;
  const chatDone = !hasOpenQuestion && chatLog.length > 0;

  return (
    <div className="min-h-screen flex flex-col items-center px-6 pt-9 pb-15 animate-fade-in">
      <div className="w-full max-w-[560px]">
        <Link href="/nearly-ready" className="text-[13px] inline-flex items-center gap-1 mb-4.5">
          <BackArrowIcon />
          Back to checklist
        </Link>
        <h1 className="text-[22px] m-0 mb-1">Talk to your assistant</h1>
        <p className="text-[13px] opacity-65 m-0 mb-6">One question at a time — you can stop anytime.</p>

        <div className="flex flex-col gap-2.5 mb-4">
          {chatLog.map((msg, i) => (
            <ChatBubble key={i} message={msg} />
          ))}
        </div>

        {hasOpenQuestion && <ChatComposer chatIndex={chatIndex} />}

        {chatDone && (
          <Link
            href="/nearly-ready"
            className="w-full mt-2 block text-center bg-ink text-paper font-[family-name:var(--font-display)] text-sm py-3.5 rounded-full"
          >
            Back to checklist
          </Link>
        )}
      </div>
    </div>
  );
}
