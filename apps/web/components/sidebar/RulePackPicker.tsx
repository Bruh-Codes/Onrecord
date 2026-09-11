"use client";

import { useAppActions, useAppState } from "@/lib/app-state";
import { RULE_PACKS } from "@/lib/mock-data";

export function RulePackPicker() {
  const { rulePack } = useAppState();
  const { setRulePack } = useAppActions();

  return (
    <div>
      <div className="mt-5 text-[10.5px] tracking-wider uppercase text-foreground/50 px-2.5 pb-1">Rule pack</div>
      <div className="text-[11px] opacity-55 px-2.5 pb-2 leading-tight">
        The document checklist your profile is checked against. Pick the facility you&apos;re applying for.
      </div>
      <div className="flex flex-col gap-0.5">
        {RULE_PACKS.map((name) => (
          <div
            key={name}
            onClick={() => setRulePack(name)}
            className={`px-2.5 py-2 rounded-[10px] text-[13px] cursor-pointer ${
              rulePack === name ? "bg-foreground/8 font-semibold" : "opacity-70 hover:opacity-100"
            }`}
          >
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}
