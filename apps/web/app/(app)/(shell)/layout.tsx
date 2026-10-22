import { MobileNav } from "@/components/sidebar/MobileNav";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { TopBar } from "@/components/sidebar/TopBar";
import { AgentDockHost } from "@/components/chat/AgentDockHost";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh print:block print:h-auto">
      <div className="sticky top-0 h-dvh shrink-0 print:hidden">
        <Sidebar />
      </div>
      <div className="app-shell-scroll flex-1 min-w-0 h-dvh overflow-y-auto pb-14 md:pb-0 print:h-auto print:overflow-visible print:pb-0">
        <div className="print:hidden">
          <TopBar />
        </div>
        {children}
      </div>
      <div className="print:hidden">
        <MobileNav />
        <AgentDockHost />
      </div>
    </div>
  );
}
