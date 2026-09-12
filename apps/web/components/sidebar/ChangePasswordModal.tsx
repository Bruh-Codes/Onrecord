"use client";

import { useEffect, useState } from "react";
import { XIcon } from "@/components/icons";
import { PillButton } from "@/components/ui/PillButton";
import { useToast } from "@/components/ui/Toast";
import { authClient } from "@/lib/auth-client";

type Props = {
  open: boolean;
  onClose: () => void;
};

// Better Auth returns this when the signed-in account has no password (e.g. a
// Google-only sign-in). There's nothing to change then, so we explain instead
// of pretending otherwise.
const NO_CREDENTIAL_CODE = "CREDENTIAL_ACCOUNT_NOT_FOUND";

export function ChangePasswordModal({ open, onClose }: Props) {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const ready =
    !submitting &&
    current.length > 0 &&
    next.length >= 8 &&
    confirm.length > 0 &&
    next === confirm;

  async function handleSubmit() {
    if (!ready) return;
    setSubmitting(true);
    setError(null);

    const { error: changeError } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      // Log out any other device that's still signed in with the old password.
      revokeOtherSessions: true,
    });

    if (changeError) {
      if (changeError.code === NO_CREDENTIAL_CODE) {
        setError(
          "This account has no password — it was created with a social sign-in, so there's nothing to change.",
        );
      } else if (changeError.code === "INVALID_PASSWORD") {
        setError("Current password is incorrect.");
      } else {
        setError(changeError.message || "Couldn't change the password. Please try again.");
      }
      setSubmitting(false);
      return;
    }

    setDone(true);
    setSubmitting(false);
    toast({ title: "Password updated", tone: "success" });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 px-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        className="relative w-full max-w-[420px] rounded-2xl border border-border bg-card p-5 shadow-card animate-slide-in"
      >
        <button
          type="button"
          aria-label="Close change password"
          onClick={onClose}
          disabled={submitting}
          className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full text-foreground/55 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 disabled:opacity-50"
        >
          <XIcon />
        </button>

        {done ? (
          <>
            <h2 id="change-password-title" className="m-0 pr-8 text-lg font-semibold">
              Password updated
            </h2>
            <p className="mt-2 mb-5 text-sm leading-relaxed text-foreground/65">
              Your password has been changed and other sessions were logged out.
            </p>
            <div className="flex justify-end gap-2">
              <PillButton onClick={onClose}>Done</PillButton>
            </div>
          </>
        ) : (
          <>
            <h2 id="change-password-title" className="m-0 pr-8 text-lg font-semibold">
              Change password
            </h2>
            <p className="mt-2 mb-5 text-sm leading-relaxed text-foreground/65">
              Choose something strong — at least 8 characters.
            </p>

            <div className="mb-3.5">
              <label className="block text-xs mb-1.5 text-foreground/70">
                Current password
              </label>
              <input
                type="password"
                autoFocus
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                disabled={submitting}
                placeholder="••••••••"
                className="w-full min-h-11 px-4.5 py-2.5 text-[14.5px] text-foreground bg-muted border border-foreground/16 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div className="mb-2">
              <label className="block text-xs mb-1.5 text-foreground/70">
                New password
              </label>
              <input
                type="password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                disabled={submitting}
                placeholder="••••••••"
                className="w-full min-h-11 px-4.5 py-2.5 text-[14.5px] text-foreground bg-muted border border-foreground/16 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5 text-foreground/70">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                disabled={submitting}
                placeholder="••••••••"
                className="w-full min-h-11 px-4.5 py-2.5 text-[14.5px] text-foreground bg-muted border border-foreground/16 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            {next.length > 0 && next.length < 8 && (
              <p className="mt-2 text-[12.5px] text-destructive">Use at least 8 characters.</p>
            )}
            {confirm.length > 0 && next !== confirm && (
              <p className="mt-2 text-[12.5px] text-destructive">Passwords don&apos;t match.</p>
            )}
            {error && <p className="mt-2 text-[12.5px] text-destructive">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <PillButton variant="secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </PillButton>
              <PillButton onClick={handleSubmit} disabled={!ready}>
                {submitting ? "Saving…" : "Update password"}
              </PillButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}