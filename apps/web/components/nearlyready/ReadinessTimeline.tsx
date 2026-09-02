import type { AppState } from "@/lib/app-state-types";

function TimelineRow({
  done,
  isLast,
  title,
  detail,
}: {
  done: boolean;
  isLast: boolean;
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex gap-3 mb-1">
      <div className="flex flex-col items-center">
        <span className={`w-[9px] h-[9px] rounded-full shrink-0 ${done ? "bg-ink" : "bg-ink/25"}`} />
        {!isLast && <span className="w-[1.4px] flex-1 bg-ink/25 min-h-8" />}
      </div>
      <div>
        <div className={`text-[13.5px] font-semibold ${done ? "" : "text-ink/50"}`}>{title}</div>
        {detail && <div className="text-xs opacity-60">{detail}</div>}
      </div>
    </div>
  );
}

export function ReadinessTimeline({ state }: { state: AppState }) {
  const chatInProgress = state.chatLog.length > 0 && state.chatIndex < 3;

  return (
    <div className="border border-border rounded-[20px] p-5.5">
      <div className="text-[15px] font-semibold mb-4">Readiness timeline</div>
      <TimelineRow done isLast={false} title="Documents uploaded" detail="9 of 12 months, 4 Jun" />
      <TimelineRow
        done={state.chatLog.length > 0}
        isLast={false}
        title="Assistant session"
        detail={chatInProgress ? "In progress" : state.chatLog.length > 0 ? "Complete" : "Not started"}
      />
      <TimelineRow done={false} isLast title="Profile ready to export" />
      <div className="h-px bg-ink/12 my-4.5" />
      <div className="text-[13.5px] font-semibold mb-1">Questions?</div>
      <div className="text-[12.5px] opacity-70">
        Our team can help: <a href="mailto:help@sankofa.app">help@sankofa.app</a>
      </div>
    </div>
  );
}
