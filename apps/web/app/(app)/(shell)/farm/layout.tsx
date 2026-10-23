import { FarmWorkspace } from "@/components/farm/FarmWorkspace";
export default function Layout({ children }: { children: React.ReactNode }) {
	return <FarmWorkspace>{children}</FarmWorkspace>;
}
