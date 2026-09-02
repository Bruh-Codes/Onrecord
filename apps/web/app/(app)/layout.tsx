import { AppStateProvider } from "@/lib/app-state";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppStateProvider>{children}</AppStateProvider>;
}
