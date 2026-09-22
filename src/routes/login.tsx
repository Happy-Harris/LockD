import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { StampMark } from "@/components/app/mark";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas px-6 text-ink">
        <div className="h-12 w-48 animate-pulse rounded-xl bg-raised" />
      </main>
    );
  }
  if (user) return <RedirectToSignIn to="/" />;

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-between overflow-hidden bg-canvas px-6 py-10 text-ink">
      <div className="pointer-events-none absolute -right-10 top-16 size-56 rounded-full bg-accent/15 blur-3xl" />
      <div>
        <StampMark className="size-14" />
        <p className="mt-10 stamp text-7xl leading-[0.85] tracking-tight">LOCKD</p>
        <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.28em] text-accent">The log lives with you.</p>
        <p className="mt-6 max-w-sm text-base leading-relaxed text-muted">
          Sign in and the lifting life is on the locker — phone, laptop, a link you can actually send. Same receipt.
          Not a browser souvenir.
        </p>
      </div>
      <div className="space-y-3">
        {authEnabled ? (
          GROK_PROVIDERS.map((provider) => (
            <Button
              key={provider.providerId}
              className="w-full"
              size="lg"
              variant={provider.idp === "google" ? "primary" : "secondary"}
              onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
            >
              Continue with {provider.label}
            </Button>
          ))
        ) : (
          <p className="text-sm text-muted">Sign-in is disabled.</p>
        )}
        <Button className="w-full" size="lg" variant="ghost" asChild>
          <Link to="/">Use this device first</Link>
        </Button>
        <p className="text-center text-xs leading-relaxed text-subtle">
          Google or X. The sample log can still be loaded. Signing in keeps it.
        </p>
      </div>
    </main>
  );
}
