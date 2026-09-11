import { MobileNav } from "@/components/sidebar/MobileNav";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { TopBar } from "@/components/sidebar/TopBar";
import { AgentDockHost } from "@/components/chat/AgentDockHost";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh">
      <div className="sticky top-0 h-dvh shrink-0">
        <Sidebar />
      </div>
      <div className="app-shell-scroll flex-1 min-w-0 h-dvh overflow-y-auto pb-14 md:pb-0">
        <TopBar />
        {children}
      </div>
      <MobileNav />
      <AgentDockHost />
    </div>
  );
}
