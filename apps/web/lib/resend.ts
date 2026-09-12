import { Resend } from "resend";

const API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL;

let client: Resend | null = null;
function getClient(): Resend {
	if (!client) client = new Resend(API_KEY!);
	return client;
}

type SendPasswordResetEmailArgs = {
	to: string;
	name: string;
	url: string;
};

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

/**
 * Sends the password-reset email Better Auth hands off to `sendResetPassword`.
 *
 * Without RESEND_API_KEY this degrades to a console log (same pattern as the
 * phoneNumber OTP stub in lib/auth.ts) so local dev keeps working without an
 * email provider. With a key but no RESEND_FROM_EMAIL it throws, because an
 * unconfigured sender will otherwise fail only at delivery time.
 */
export async function sendPasswordResetEmail({
	to,
	name,
	url,
}: SendPasswordResetEmailArgs): Promise<void> {
	if (!API_KEY) {
		console.warn(
			"[resend] RESEND_API_KEY is not set — password-reset email NOT delivered.\n" +
				`  To:    ${to}\n` +
				`  Reset: ${url}`,
		);
		return;
	}
	if (!FROM_EMAIL) {
		throw new Error(
			"RESEND_FROM_EMAIL must be set when RESEND_API_KEY is configured.",
		);
	}

	const subject = "Reset your Onrecord password";
	const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e5e5e0;">
          <tr><td style="font-size:19px;font-weight:600;color:#1a1a1a;padding-bottom:8px;">Onrecord</td></tr>
          <tr><td style="color:#555;font-size:14px;line-height:1.6;padding-bottom:24px;">
            Hi ${escapeHtml(name)},<br/><br/>
            We got a request to reset your password. Click the button below to
            choose a new one. This link expires in one hour.
          </td></tr>
          <tr><td align="center" style="padding-bottom:24px;">
            <a href="${url}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:999px;">
              Reset password
            </a>
          </td></tr>
          <tr><td style="color:#999;font-size:12px;line-height:1.5;">
            If you didn't request this, you can safely ignore this email. For
            security, the link can only be used once and stops working after an hour.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

	const { error } = await getClient().emails.send({
		from: FROM_EMAIL,
		to,
		subject,
		html,
	});

	if (error) {
		console.error("[resend] failed to send password-reset email", error);
		throw new Error(`Failed to send password-reset email: ${error.message}`);
	}
}