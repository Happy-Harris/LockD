// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ pull: vi.fn(), push: vi.fn(), subscribe: vi.fn() }));
vi.mock("@/lib/auth/use-current-user", () => ({
  useCurrentUserState: () => ({ user: null, isPending: false }),
}));
vi.mock("@/lib/gym/store", () => ({ useGym: Object.assign(() => true, { subscribe: mocks.subscribe }) }));
vi.mock("./api", () => ({ pullVault: mocks.pull, pushVault: mocks.push }));
vi.mock("./payload", () => ({ cloudGymFromState: vi.fn() }));
vi.mock("./signin-merge", () => ({ applyRemoteVault: vi.fn(), normalizeCloudGym: vi.fn() }));
vi.mock("@/lib/storage/safety", () => ({ takeSafetyBackup: vi.fn() }));
import { CloudSync, useCloud } from "./sync";
afterEach(cleanup);
it("keeps the shared development identity in guest mode without cloud traffic or a push subscription", () => {
  function Status() {
    const { status, booted } = useCloud();
    return (
      <p>
        {status}:{String(booted)}
      </p>
    );
  }
  render(
    <CloudSync>
      <Status />
    </CloudSync>,
  );
  expect(screen.getByText("guest:true")).toBeVisible();
  expect(mocks.pull).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.subscribe).not.toHaveBeenCalled();
});
