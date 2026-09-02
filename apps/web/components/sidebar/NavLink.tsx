"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] ${
        active ? "bg-ink/8 font-semibold text-black" : "opacity-80 hover:opacity-100"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}
