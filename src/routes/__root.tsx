import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
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
import { StorageNoticeBanner } from "@/components/app/storage-notice";
import { bootStorage } from "@/lib/storage/boot";
import { startServiceWorker } from "@/lib/pwa/start";
import appCss from "../styles.css?url";

const APP_NAME = "Lockd";

const fetchSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const u = await getSessionUser();
  return u ? { id: u.id, email: u.email } : null;
});

export const Route = createRootRoute({
  // Offline, the session lookup cannot reach the server. Carry on as a guest, which always works:
  // the log lives on this device. A real server error still surfaces.
  beforeLoad: async () => ({
    sessionUser: await fetchSessionUser().catch((error: unknown) => {
      const offline =
        typeof window !== "undefined" && (navigator.onLine === false || error instanceof TypeError);
      if (offline) return null;
      throw error;
    }),
  }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "theme-color", content: "#0E0E0C" },
      {
        name: "description",
        content:
          "Lock’d — a training operating system that remembers a lifting life. Keep the receipt.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
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
  // Everyone waits for the log to load, guests included: an onboarding tap before it loads would
  // be overwritten by it. Signed-in lifters also wait for the cloud pull.
  const showSplash =
    !publicRoute && (!hydrated || (knownUser && (isPending || !booted || status === "pulling")));

  // Decide where the log lives (the `lockd` database, or the old `localStorage` as a fallback),
  // load it, and start writing changes. Sets `hydrated` when the log is in the store.
  useEffect(() => {
    bootStorage()
      .then((result) => {
        if (!useGym.getState().hydrated) useGym.getState().setHydrated(true);
        startServiceWorker();
        // Test hook: how long reading the log took (see `BootResult.readMs`).
        if (result.readMs !== undefined) {
          document.documentElement.dataset.gymBootMs = String(result.readMs);
        }
      })
      .catch((error: unknown) => {
        // Never leave the app on the splash screen: open with what is in memory.
        console.error("Storage boot failed.", error);
        useGym.getState().setHydrated(true);
      });
  }, []);

  // Test hook: effects only run after React hydrates, so this marks "interactive and log loaded".
  useEffect(() => {
    if (hydrated) document.documentElement.dataset.gymReady = "true";
  }, [hydrated]);

  return (
    <>
      <ThemeSync />
      {publicRoute ? (
        <Outlet />
      ) : showSplash ? (
        <Splash locker={knownUser} />
      ) : onboarded ? (
        <>
          <StorageNoticeBanner />
          <Outlet />
          <CommandPalette />
        </>
      ) : (
        <>
          <StorageNoticeBanner />
          <Onboarding />
        </>
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
