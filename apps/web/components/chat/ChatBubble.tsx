import type { ChatMessage } from "@/lib/types";

export function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.fromAgent) {
    return (
      <div className="max-w-[85%] bg-muted rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-[4px] px-4 py-3 text-sm leading-relaxed self-start animate-slide-in">
        {message.text}
      </div>
    );
  }
  return (
    <div className="max-w-[85%] bg-foreground text-background rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl rounded-br-[4px] px-4 py-3 text-sm leading-relaxed self-end ml-auto animate-slide-in">
      {message.text}
    </div>
  );
}
