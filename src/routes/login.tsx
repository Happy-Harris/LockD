import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { sendEmailLink, signInWith } from "@/lib/auth/client";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState, useSignInMethods } from "@/lib/auth/use-current-user";
import { LockdMark } from "@/components/app/mark";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user } = useCurrentUserState();
  // The server already read the session for this page load. Waiting on the client's own session
  // check instead rendered a placeholder on the server and the form on the client (a hydration mismatch).
  const sessionUser = useRouteContext({ from: "__root__", select: (context) => context.sessionUser });
  const methods = useSignInMethods();
  if (user || sessionUser) return <RedirectToSignIn to="/" />;

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-between overflow-hidden bg-canvas px-6 py-10 text-ink">
      <div>
        <LockdMark className="size-14" />
        <p className="mt-10 stamp text-7xl leading-[0.85] tracking-tight">LOCKD</p>
        <p className="mt-3 text-micro font-medium uppercase tracking-[0.28em] text-subtle">
          The log lives with you.
        </p>
        <p className="mt-6 max-w-sm text-base leading-relaxed text-muted">
          Sign in and the lifting life is on the locker — phone, laptop, a link you can actually
          send. Same receipt. Not a browser souvenir.
        </p>
      </div>
      <div className="space-y-3">
        {methods.length === 0 ? (
          <p className="text-sm text-muted" data-testid="sign-in-off">
            Sign-in isn't set up on this deployment. Your log stays on this device.
          </p>
        ) : null}
        {methods.includes("google") ? <ProviderButton provider="google" label="Continue with Google" primary /> : null}
        {methods.includes("apple") ? (
          <ProviderButton provider="apple" label="Continue with Apple" primary={!methods.includes("google")} />
        ) : null}
        {methods.includes("email") ? <EmailLink /> : null}
        <Button className="w-full" size="lg" variant="ghost" asChild>
          <Link to="/">Use this device first</Link>
        </Button>
        <p className="text-center text-xs leading-relaxed text-subtle">
          The sample log can still be loaded. Signing in keeps it.
        </p>
      </div>
    </main>
  );
}

function ProviderButton({
  provider,
  label,
  primary,
}: {
  provider: "google" | "apple";
  label: string;
  primary: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        className="w-full"
        size="lg"
        variant={primary ? "primary" : "secondary"}
        onClick={() => {
          setError(null);
          signInWith(provider).catch((cause: unknown) =>
            setError(cause instanceof Error ? cause.message : "Sign-in failed."),
          );
        }}
      >
        {label}
      </Button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </>
  );
}

function EmailLink() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError(null);
    sendEmailLink(email.trim())
      .then(() => setState("sent"))
      .catch((cause: unknown) => {
        setState("idle");
        setError(cause instanceof Error ? cause.message : "The sign-in link could not be sent.");
      });
  };
  if (state === "sent") {
    return (
      <p className="rounded-xl bg-raised p-4 text-sm text-ink hairline" role="status">
        Check {email.trim()} for a sign-in link. It works once, for 5 minutes.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <FieldLabel htmlFor="sign-in-email">Or get a link by email</FieldLabel>
      <Input
        id="sign-in-email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
      />
      <Button className="w-full" size="lg" variant="secondary" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Email me a link"}
      </Button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}
