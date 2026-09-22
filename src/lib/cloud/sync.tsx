import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useGym } from "@/lib/gym/store";
import { pullVault, pushVault } from "./api";
import { cloudGymFromState, vaultHasLog } from "./payload";
import type { CloudProfile, CloudStatus } from "./types";

type CloudState = {
  status: CloudStatus;
  profile: CloudProfile | null;
  lastSavedAt: string | null;
  booted: boolean;
  setProfile: (profile: CloudProfile | null) => void;
};

const CloudContext = createContext<CloudState>({
  status: "guest",
  profile: null,
  lastSavedAt: null,
  booted: false,
  setProfile: () => {},
});

export function useCloud() {
  return useContext(CloudContext);
}

function unauthorized(error: unknown) {
  return error instanceof Error && /unauthorized/i.test(error.message);
}

export function CloudSync({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const hydrated = useGym((s) => s.hydrated);
  const [status, setStatus] = useState<CloudStatus>("guest");
  const [profile, setProfile] = useState<CloudProfile | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const applying = useRef(false);
  const ready = useRef(false);

  useEffect(() => {
    if (isPending || !hydrated) return;
    if (!user) {
      ready.current = false;
      setStatus("guest");
      setProfile(null);
      setBooted(true);
      return;
    }
    let cancelled = false;
    setBooted(false);
    setStatus("pulling");
    const displayName = user.displayName ?? user.primaryEmail ?? "Lifter";
    void pullVault({ data: { displayName } })
      .then((remote) => {
        if (cancelled) return;
        setProfile(remote.profile);
        applying.current = true;
        if (remote.payload && vaultHasLog(remote.payload)) {
          useGym.getState().replaceFromCloud(remote.payload);
        } else if (vaultHasLog(cloudGymFromState(useGym.getState()))) {
          return pushVault({ data: { payload: cloudGymFromState(useGym.getState()), displayName } }).then((pushed) => {
            if (cancelled) return;
            setLastSavedAt(pushed.updatedAt);
          });
        }
        setLastSavedAt(remote.updatedAt);
      })
      .then(() => {
        if (cancelled) return;
        applying.current = false;
        ready.current = true;
        setBooted(true);
        setStatus("synced");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        applying.current = false;
        ready.current = !unauthorized(error);
        setBooted(true);
        setStatus(unauthorized(error) ? "guest" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, isPending, hydrated, user?.displayName, user?.primaryEmail]);

  useEffect(() => {
    if (!user || !hydrated) return;
    let timer: number | undefined;
    const unsub = useGym.subscribe(() => {
      if (applying.current || !ready.current) return;
      setStatus("saving");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const displayName = user.displayName ?? user.primaryEmail ?? "Lifter";
        void pushVault({ data: { payload: cloudGymFromState(useGym.getState()), displayName } })
          .then((pushed) => {
            setLastSavedAt(pushed.updatedAt);
            setStatus("synced");
          })
          .catch((error: unknown) => {
            setStatus(unauthorized(error) ? "guest" : "error");
          });
      }, 1600);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, [user, hydrated]);

  const value = useMemo(
    () => ({ status, profile, lastSavedAt, booted, setProfile }),
    [status, profile, lastSavedAt, booted],
  );
  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}
