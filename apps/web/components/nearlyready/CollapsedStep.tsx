import Link from "next/link";

export function CollapsedStep({
  n,
  title,
  done,
}: {
  n: number;
  title: string;
  done: boolean;
}) {
  const circle = done
    ? "bg-positive text-white"
    : "border-[1.4px] border-ink/35 text-ink/60";

  return (
    <Link
      href="/documents"
      className="flex items-center gap-3 py-4 px-1 border-t border-ink/12"
    >
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 ${circle}`}>
        {n}
      </span>
      <span className={done ? "text-[15.5px] text-ink/40 line-through" : "text-[15.5px] text-ink/85"}>
        {title}
      </span>
    </Link>
  );
}
