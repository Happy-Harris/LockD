import { createFileRoute, Link } from "@tanstack/react-router";
import { Calculator, Flame } from "lucide-react";
import { Page } from "@/components/app/shell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/tools")({ component: ToolsPage });

function ToolsPage() {
  return (
    <Page>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Tools</h1>
      <p className="mt-1 text-sm text-muted">Load the bar with plates you actually own. Warm up to a working set.</p>
      <div className="mt-6 space-y-3">
        <Link to="/tools/plates">
          <Card className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-raised">
              <Calculator className="size-5" />
            </span>
            <span>
              <span className="block font-medium">Plate calculator</span>
              <span className="block text-sm text-muted">Exact stacks from your inventory. Pairs only.</span>
            </span>
          </Card>
        </Link>
        <Link to="/tools/warmup">
          <Card className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-raised">
              <Flame className="size-5" />
            </span>
            <span>
              <span className="block font-medium">Warm-up generator</span>
              <span className="block text-sm text-muted">Percent ramps rounded to loads you can build.</span>
            </span>
          </Card>
        </Link>
      </div>
    </Page>
  );
}
