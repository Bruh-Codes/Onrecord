"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { PillButton } from "@/components/ui/PillButton";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { useBusiness, useMe } from "@/lib/hooks/use-business";
import { ChangePasswordModal } from "@/components/sidebar/ChangePasswordModal";

export default function SettingsPage() {
	const { toast } = useToast();
	const router = useRouter();
	const { data: session } = authClient.useSession();
	const { businessId } = useMe();
	const businessQuery = useBusiness(businessId);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [legalName, setLegalName] = useState("");
	const [tradingName, setTradingName] = useState("");
	const [savingProfile, setSavingProfile] = useState(false);
	const [savingBusiness, setSavingBusiness] = useState(false);
	const [profileError, setProfileError] = useState<string | null>(null);
	const [businessError, setBusinessError] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<"account" | "billing">("account");
	const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
	const [deleteConfirmation, setDeleteConfirmation] = useState("");
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [changePasswordOpen, setChangePasswordOpen] = useState(false);

	useEffect(() => {
		if (session?.user) {
			setName(session.user.name ?? "");
			setEmail(session.user.email ?? "");
		}
	}, [session?.user]);

	useEffect(() => {
		if (businessQuery.data) {
			setLegalName(businessQuery.data.legal_name);
			setTradingName(businessQuery.data.trading_name ?? "");
		}
	}, [businessQuery.data]);

	async function saveProfile() {
		setSavingProfile(true);
		setProfileError(null);
		try {
			const nameResult = await authClient.updateUser({ name: name.trim() });
			if (nameResult.error) throw new Error(nameResult.error.message);

			if (email.trim() !== session?.user.email) {
				const emailResult = await authClient.changeEmail({
					newEmail: email.trim(),
					callbackURL: "/settings",
				});
				if (emailResult.error) throw new Error(emailResult.error.message);
			}

			toast({ title: "Profile updated", tone: "success" });
		} catch (error) {
			setProfileError(error instanceof Error ? error.message : "Couldn’t update your profile.");
		} finally {
			setSavingProfile(false);
		}
	}

	async function saveBusiness() {
		if (!businessId || !legalName.trim()) return;
		setSavingBusiness(true);
		setBusinessError(null);
		try {
			await api.patchBusiness(businessId, {
				legal_name: legalName.trim(),
				trading_name: tradingName.trim() || null,
			});
			await businessQuery.refetch();
			toast({ title: "Business details updated", tone: "success" });
		} catch (error) {
			setBusinessError(error instanceof Error ? error.message : "Couldn’t update business details.");
		} finally {
			setSavingBusiness(false);
		}
	}

	async function deleteAccount() {
		if (deleteConfirmation !== "DELETE" || !businessId) return;
		setDeleting(true);
		setDeleteError(null);
		try {
			await api.deleteBusiness(businessId);
			const result = await authClient.deleteUser({ callbackURL: "/signup" });
			if (result.error) throw new Error(result.error.message ?? "Couldn’t delete your login.");
			router.replace("/signup");
		} catch (error) {
			setDeleteError(error instanceof Error ? error.message : "Couldn’t delete your account.");
			setDeleting(false);
		}
	}

	return (
		<>
		<div className="min-w-0 max-w-[820px] px-4 pb-10 pt-6 sm:px-7 sm:pt-7.5">
			<h1 className="m-0 mb-1.5 text-[24px] sm:text-[28px]">Settings</h1>
			<p className="m-0 mb-5 text-sm opacity-70">Manage your account and business details.</p>
			<div className="mb-6 flex gap-1 border-b border-border" role="tablist" aria-label="Settings sections">
				<button type="button" role="tab" aria-selected={activeTab === "account"} onClick={() => setActiveTab("account")} className={`border-b-2 px-3 py-2.5 text-[13px] font-semibold ${activeTab === "account" ? "border-foreground" : "border-transparent opacity-55"}`}>Account</button>
				<button type="button" role="tab" aria-selected={false} disabled className="cursor-not-allowed border-b-2 border-transparent px-3 py-2.5 text-[13px] font-semibold opacity-35">Billing</button>
			</div>

			{activeTab === "account" ? <>
				<section className="mb-5 rounded-2xl border border-foreground/12 bg-card p-5 sm:p-6">
					<h2 className="m-0 mb-1 text-[16px] font-semibold">Profile</h2>
					<p className="m-0 mb-5 text-[13px] opacity-65">Update the details used for your account.</p>
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="text-[13px]"><span className="mb-1.5 block opacity-70">Name</span><input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-foreground/16 bg-muted px-3.5 py-2.5 text-sm" /></label>
						<label className="text-[13px]"><span className="mb-1.5 block opacity-70">Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-foreground/16 bg-muted px-3.5 py-2.5 text-sm" /></label>
					</div>
					{profileError && <p className="mt-3 mb-0 text-[12.5px] text-destructive">{profileError}</p>}
					<div className="mt-5 flex justify-end"><PillButton onClick={saveProfile} disabled={savingProfile || !name.trim() || !email.trim()}>{savingProfile ? "Saving…" : "Save profile"}</PillButton></div>
				</section>

				<section className="mb-5 rounded-2xl border border-foreground/12 bg-card p-5 sm:p-6">
					<h2 className="m-0 mb-1 text-[16px] font-semibold">Business</h2>
					<p className="m-0 mb-5 text-[13px] opacity-65">Keep your business identity up to date.</p>
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="text-[13px] sm:col-span-2"><span className="mb-1.5 block opacity-70">Legal business name</span><input value={legalName} onChange={(event) => setLegalName(event.target.value)} disabled={!businessId || businessQuery.isLoading} className="w-full rounded-xl border border-foreground/16 bg-muted px-3.5 py-2.5 text-sm disabled:opacity-50" /></label>
						<label className="text-[13px] sm:col-span-2"><span className="mb-1.5 block opacity-70">Trading name <span className="opacity-50">(optional)</span></span><input value={tradingName} onChange={(event) => setTradingName(event.target.value)} disabled={!businessId || businessQuery.isLoading} className="w-full rounded-xl border border-foreground/16 bg-muted px-3.5 py-2.5 text-sm disabled:opacity-50" /></label>
					</div>
					{businessError && <p className="mt-3 mb-0 text-[12.5px] text-destructive">{businessError}</p>}
					<div className="mt-5 flex justify-end"><PillButton onClick={saveBusiness} disabled={savingBusiness || !businessId || !legalName.trim()}>{savingBusiness ? "Saving…" : "Save business"}</PillButton></div>
				</section>
				<section className="mb-5 rounded-2xl border border-foreground/12 bg-card p-5 sm:p-6">
					<h2 className="m-0 mb-1 text-[16px] font-semibold">Password</h2>
					<p className="m-0 text-[13px] opacity-65">Update your password or request a reset link if you have forgotten it.</p>
					<div className="mt-5 flex flex-wrap items-center gap-3">
						<PillButton onClick={() => setChangePasswordOpen(true)}>Change password</PillButton>
						<a href="/forgot-password" className="text-[13px] opacity-65 underline underline-offset-2 hover:opacity-100">Forgot password?</a>
					</div>
				</section>
				<section className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5 sm:p-6">
					<h2 className="m-0 mb-1 text-[16px] font-semibold text-destructive">Delete account</h2>
					<p className="m-0 max-w-[620px] text-[13px] leading-relaxed opacity-75">This permanently deletes your login, sessions, business profile, uploaded documents, transactions, and all derived data. This cannot be undone.</p>
					<PillButton variant="danger" className="mt-5" onClick={() => setShowDeleteConfirmation(true)}>Delete account</PillButton>
				</section>
			</> : <section className="rounded-2xl border border-foreground/12 bg-card p-5 sm:p-6"><h2 className="m-0 mb-1 text-[16px] font-semibold">Billing</h2><p className="m-0 text-[13px] opacity-65">Billing and subscription management will be available later.</p></section>}
		</div>
		{showDeleteConfirmation && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 px-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setShowDeleteConfirmation(false); }}>
			<div role="dialog" aria-modal="true" aria-labelledby="delete-account-title" className="w-full max-w-[440px] rounded-2xl border border-destructive/25 bg-card p-5 shadow-card">
				<h2 id="delete-account-title" className="m-0 text-lg font-semibold text-destructive">Delete account?</h2>
				<p className="mt-2 mb-1 text-sm leading-relaxed">This permanently deletes your entire account and all business data.</p>
				<p className="m-0 text-[12.5px] leading-relaxed opacity-65">Your login, sessions, business profile, uploaded files, transactions, analytics, and audit data will be wiped permanently. This action cannot be undone.</p>
				<label className="mt-5 block text-[13px] font-semibold">Type DELETE to confirm<input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="DELETE" className="mt-1.5 w-full rounded-xl border border-destructive/30 bg-muted px-3.5 py-2.5 text-sm font-normal" /></label>
				{deleteError && <p className="mt-2 mb-0 text-[12.5px] text-destructive">{deleteError}</p>}
				<div className="mt-5 flex justify-end gap-2"><PillButton variant="secondary" onClick={() => { setShowDeleteConfirmation(false); setDeleteConfirmation(""); }} disabled={deleting}>Cancel</PillButton><PillButton variant="danger" onClick={deleteAccount} disabled={deleting || deleteConfirmation !== "DELETE"}>{deleting ? "Deleting…" : "Permanently delete"}</PillButton></div>
			</div>
		</div>}
		<ChangePasswordModal open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
		</>
	);
}
