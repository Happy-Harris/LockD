import { createRootRoute, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { createServerFn } from "@tanstack/react-start";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { ThemeSync } from "@/components/app/theme";
import { Onboarding } from "@/components/app/onboarding";
import { CommandPalette } from "@/components/app/command-palette";
import { StampMark } from "@/components/app/mark";
import { CloudSync, useCloud } from "@/lib/cloud/sync";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useGym } from "@/lib/gym/store";
import appCss from "../styles.css?url";

const APP_NAME = "Lockd";

const fetchSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const u = await getSessionUser();
  return u ? { id: u.id, email: u.email } : null;
});

export const Route = createRootRoute({
  beforeLoad: async () => ({ sessionUser: await fetchSessionUser() }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "theme-color", content: "#0c0b0a" },
      { name: "description", content: "Lock’d — a training operating system that remembers a lifting life. Keep the receipt." },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        <PreviewHostBridge />
        <AuthProvider>
          <CloudSync>
            <GymGate />
          </CloudSync>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}

function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/s/") || pathname.startsWith("/u/");
}

function GymGate() {
  const { sessionUser } = Route.useRouteContext();
  const onboarded = useGym((s) => s.settings.onboardingCompletedAt);
  const hydrated = useGym((s) => s.hydrated);
  const theme = useGym((s) => s.settings.themeMode);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending } = useCurrentUserState();
  const { status, booted } = useCloud();
  const publicRoute = isPublicPath(pathname);
  const knownUser = Boolean(user) || Boolean(sessionUser);
  const showSplash =
    !publicRoute && knownUser && (!hydrated || isPending || !booted || status === "pulling");

  useEffect(() => {
    const finish = () => {
      if (!useGym.getState().hydrated) useGym.getState().setHydrated(true);
    };
    const unsub = useGym.persist.onFinishHydration(finish);
    void useGym.persist.rehydrate();
    if (useGym.persist.hasHydrated()) finish();
    return unsub;
  }, []);

  return (
    <>
      <ThemeSync />
      {publicRoute ? (
        <Outlet />
      ) : showSplash ? (
        <Splash locker={knownUser} />
      ) : onboarded ? (
        <>
          <Outlet />
          <CommandPalette />
        </>
      ) : (
        <Onboarding />
      )}
      <Toaster
        theme={theme === "light" ? "light" : "dark"}
        position="top-center"
        toastOptions={{
          className: "bg-surface text-ink hairline",
        }}
      />
    </>
  );
}

function Splash({ locker }: { locker?: boolean }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas text-ink">
      <div className="flex flex-col items-center gap-3">
        <StampMark className="size-12" />
        <p className="stamp text-3xl">LOCKD</p>
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-subtle">
          {locker ? "Opening the locker" : "Keep the receipt."}
        </p>
      </div>
    </main>
  );
}
