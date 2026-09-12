/** Invitation verification is separate from the site's existing signup policy. */
export async function sendTeamCode(email: string, code: string): Promise<void> {
  const key = process.env.RESEND_API_KEY; const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from || !/^\d{8}$/.test(code)) throw new Error("Team email is unavailable.");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [email], subject: "Your Tradies2Quote team verification code", text: `Your Tradies2Quote verification code is ${code}.\n\nEnter it in the app to join your invited team. It expires in 10 minutes.\n\nIf you did not request this code, you can ignore this email. Your account has not joined a team.` }), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Team verification email failed (${response.status}).`);
}
