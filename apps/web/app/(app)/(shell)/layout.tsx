import { Sidebar } from "@/components/sidebar/Sidebar";
import { TopBar } from "@/components/sidebar/TopBar";
import { ShellGate } from "@/components/shell/ShellGate";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen animate-fade-in">
      <div className="sticky top-0 h-screen shrink-0">
        <Sidebar />
      </div>
      <div className="flex-1 min-w-0 h-screen overflow-y-auto">
        <TopBar />
        <ShellGate>{children}</ShellGate>
      </div>
    </div>
  );
}