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
        <span className={`w-[9px] h-[9px] rounded-full shrink-0 ${done ? "bg-foreground" : "bg-foreground/25"}`} />
        {!isLast && <span className="w-[1.4px] flex-1 bg-foreground/25 min-h-8" />}
      </div>
      <div>
        <div className={`text-[13.5px] font-semibold ${done ? "" : "text-foreground/50"}`}>{title}</div>
        {detail && <div className="text-xs opacity-60">{detail}</div>}
      </div>
    </div>
  );
}

export function ReadinessTimeline({
  documentsDone,
  chatDone,
  profileReady,
  chatInProgress,
  documentsDetail,
}: {
  documentsDone: boolean;
  chatDone: boolean;
  profileReady: boolean;
  chatInProgress: boolean;
  documentsDetail?: string;
}) {
  return (
    <div className="border border-border rounded-[20px] p-5.5">
      <div className="text-[15px] font-semibold mb-4">Readiness timeline</div>
      <TimelineRow done={documentsDone} isLast={false} title="Documents uploaded" detail={documentsDetail} />
      <TimelineRow
        done={chatDone}
        isLast={false}
        title="Assistant session"
        detail={chatInProgress ? "In progress" : chatDone ? "Complete" : "Not started"}
      />
      <TimelineRow done={profileReady} isLast title="Profile ready to export" />
      <div className="h-px bg-foreground/12 my-4.5" />
      <div className="text-[13.5px] font-semibold mb-1">Questions?</div>
      <div className="text-[12.5px] opacity-70">
        Our team can help: <a href="mailto:help@onrecord.app">help@onrecord.app</a>
      </div>
    </div>
  );
}
