import { useEffect } from "react";
import { isNativePlatform } from "@/lib/native/platform";
import { readHealthNow } from "@/lib/native/health-sync";

/**
 * Health context reads once when the app opens (native only, and only for the types the lifter switched on).
 * It renders nothing and a failed read is dropped, so it can never get in the way of logging.
 */
export function HealthAutoRead() {
  useEffect(() => {
    if (!isNativePlatform()) return;
    void readHealthNow().catch(() => undefined);
  }, []);
  return null;
}
