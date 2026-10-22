import type { ChatMessage } from "@/lib/types";
import ReactMarkdown from "react-markdown";

function formatAgentMarkdown(text: string) {
  return text.replace(/\s+(?=\d+\.\s+\*\*)/g, "\n");
}

export function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.fromAgent) {
    return (
      <div className="max-w-[85%] bg-muted rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-[4px] px-4 py-3 text-sm leading-relaxed self-start animate-slide-in">
         <div className="[&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:font-semibold [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_li]:pl-1 [&_strong]:font-semibold [&_a]:underline [&_a]:underline-offset-2">
           <ReactMarkdown>{formatAgentMarkdown(message.text)}</ReactMarkdown>
         </div>
      </div>
    );
  }
  return (
    <div className="max-w-[85%] bg-foreground text-background rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl rounded-br-[4px] px-4 py-3 text-sm leading-relaxed self-end ml-auto animate-slide-in">
      {message.text}
    </div>
  );
}
