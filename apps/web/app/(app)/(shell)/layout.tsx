import { Sidebar } from "@/components/sidebar/Sidebar";
import { TopBar } from "@/components/sidebar/TopBar";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen animate-fade-in">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <TopBar />
        {children}
      </div>
    </div>
  );
}
