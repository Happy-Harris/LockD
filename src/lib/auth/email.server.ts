/**
 * Sends the sign-in link through Resend's HTTP API (no SDK). The message is plain: a link, what it
 * is for, and that it can be ignored.
 */
export async function sendSignInLink(opts: {
  apiKey: string;
  from: string;
  to: string;
  url: string;
}): Promise<void> {
  const text = [
    "Tap the link below to sign in to Lockd. It works once and expires in 5 minutes.",
    "",
    opts.url,
    "",
    "If you didn't ask to sign in, you can ignore this email.",
  ].join("\n");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: opts.from, to: [opts.to], subject: "Your Lockd sign-in link", text }),
  });
  if (!response.ok) {
    throw new Error(`The sign-in email could not be sent (${response.status}).`);
  }
}
