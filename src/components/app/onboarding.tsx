import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LockdMark } from "@/components/app/mark";
import { useCanSignIn } from "@/lib/auth/use-current-user";
import { useGym } from "@/lib/gym/store";
import type { UnitSystem } from "@/domain/types";
import { setTextSize, TEXT_SIZE_LABEL, TEXT_SIZES, useTextSize } from "@/lib/device/text-size";

export function Onboarding() {
  const completeGym = useGym((s) => s.completeOnboarding);
  const textSize = useTextSize();
  // The size shown here is stored with the first choice, so a new lifter is never told "text is larger now".
  const completeOnboarding = (options: Parameters<typeof completeGym>[0]) => {
    setTextSize(textSize);
    completeGym(options);
  };
  const [units, setUnits] = useState<UnitSystem>("metric");
  const canSignIn = useCanSignIn();
  const navigate = useNavigate();

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-between overflow-hidden px-6 py-10">
      <div>
        <LockdMark className="size-14" />
        <p className="mt-10 stamp text-7xl leading-[0.85] tracking-tight text-ink">LOCKD</p>
        <p className="mt-3 text-micro font-medium uppercase tracking-[0.28em] text-subtle">
          Keep the receipt.
        </p>
        <p className="mt-6 max-w-sm text-base leading-relaxed text-muted">
          A training operating system that remembers the whole lifting life. Progression with a why,
          named eras, goal lenses, and a paper receipt for every session.
          {canSignIn ? " Sign in and it follows you: locker, Lab, links you can send." : ""}
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-subtle">Units</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setUnits("metric")}
              className={`h-12 rounded-xl text-sm font-medium hairline ${
                units === "metric" ? "bg-accent text-accent-ink" : "bg-raised text-ink"
              }`}
            >
              Kilograms
            </button>
            <button
              type="button"
              onClick={() => setUnits("imperial")}
              className={`h-12 rounded-xl text-sm font-medium hairline ${
                units === "imperial" ? "bg-accent text-accent-ink" : "bg-raised text-ink"
              }`}
            >
              Pounds
            </button>
          </div>
        </div>
        <div data-testid="onboarding-text-size">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-subtle">Text size</p>
          <div className="grid grid-cols-3 gap-2">
            {TEXT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={textSize === size}
                onClick={() => setTextSize(size)}
                className={`min-h-12 rounded-xl text-sm font-medium hairline ${
                  textSize === size ? "bg-accent text-accent-ink" : "bg-raised text-ink"
                }`}
              >
                {TEXT_SIZE_LABEL[size]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Button
            className="w-full"
            size="lg"
            data-testid="onboarding-import"
            onClick={() => {
              completeOnboarding({ loadDemo: false, unitSystem: units });
              void navigate({ to: "/import" });
            }}
          >
            Import your history
          </Button>
          <p className="text-center text-xs leading-relaxed text-subtle">
            From Strong, Hevy or any spreadsheet. It stays on this device, and your eras are named
            as soon as it is in.
          </p>
          <Button
            className="w-full"
            size="lg"
            variant="secondary"
            onClick={() => completeOnboarding({ loadDemo: true, unitSystem: units })}
          >
            Open with a sample log
          </Button>
          <Button
            className="w-full"
            size="lg"
            variant="secondary"
            onClick={() => completeOnboarding({ loadDemo: false, unitSystem: units })}
          >
            Start empty
          </Button>
          <p className="text-center text-xs leading-relaxed text-subtle">
            Sample log is a year of Push / Pull / Legs — layoff, comeback, PR run, stall, current
            block.{canSignIn ? " Sign in after and it lives on the locker, not just this browser." : ""}
          </p>
          {canSignIn ? (
            <p className="text-center text-xs">
              <Link to="/login" className="text-accent underline-offset-2 hover:underline">
                Sign in first
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
