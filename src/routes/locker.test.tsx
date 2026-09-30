// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CloudProfile } from "@/lib/cloud/types";

const state = vi.hoisted(() => ({
  profile: null as CloudProfile | null,
  user: { id: "athlete" },
  setProfile: vi.fn(),
  save: vi.fn(),
  dismiss: vi.fn().mockResolvedValue({ ok: true }),
  unpublish: vi.fn().mockResolvedValue({ ok: true }),
  shares: vi.fn().mockResolvedValue([]),
  links: vi.fn().mockResolvedValue([]),
  createLink: vi.fn(),
  revokeLink: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/app/shell", () => ({
  Page: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/lib/auth/gates", () => ({ RedirectToSignIn: () => null }));
vi.mock("@/lib/auth/use-current-user", () => ({
  useCurrentUserState: () => ({ user: state.user, isPending: false }),
}));
vi.mock("@/lib/cloud/sync", () => ({
  useCloud: () => ({ profile: state.profile, status: "pulling", setProfile: state.setProfile }),
}));
vi.mock("@/lib/cloud/api", () => ({
  listMyShares: state.shares,
  saveProfile: state.save,
  acknowledgePrivacyNotice: state.dismiss,
  unpublishShare: state.unpublish,
  listHistoryLinks: state.links,
  createHistoryLink: state.createLink,
  revokeHistoryLink: state.revokeLink,
}));
import { LockerPage } from "./locker";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.profile = null;
});
const profile: CloudProfile = {
  handle: "athlete",
  displayName: "Athlete",
  bio: "",
  isPublic: false,
  privacyNoticePending: true,
};

describe("locker controls", () => {
  it("starts private and cannot save until the owner's profile loads", async () => {
    render(<LockerPage />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save locker" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save locker" }));
    expect(state.save).not.toHaveBeenCalled();
    await waitFor(() => expect(state.shares).toHaveBeenCalled());
  });

  it("requires an explicit toggle and save, and preserves the migration notice", async () => {
    state.profile = profile;
    state.save.mockResolvedValue({ ok: true, profile: { ...profile, isPublic: true } });
    render(<LockerPage />);
    expect(screen.getByText(/previously public locker is now private/)).toBeVisible();
    fireEvent.click(screen.getByRole("switch"));
    expect(state.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save locker" }));
    await waitFor(() =>
      expect(state.save).toHaveBeenCalledWith({
        data: { handle: "athlete", displayName: "Athlete", bio: "", isPublic: true },
      }),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Got it" })).not.toBeDisabled());
    expect(state.dismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() => expect(state.dismiss).toHaveBeenCalledOnce());
    expect(state.setProfile).toHaveBeenLastCalledWith({ ...profile, privacyNoticePending: false });
  });

  it("makes a read-only link, shows its URL, and revokes it", async () => {
    state.profile = { ...profile, privacyNoticePending: false };
    const token = "t".repeat(43);
    state.createLink.mockResolvedValue({ ok: true, link: { token, label: "Coach", createdAt: "2026-09-30T05:00:00.000Z" } });
    render(<LockerPage />);
    expect(await screen.findByText("No read-only links. Nobody can see your log.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Who is this link for?"), { target: { value: "Coach" } });
    fireEvent.click(screen.getByRole("button", { name: "Make link" }));
    await waitFor(() => expect(state.createLink).toHaveBeenCalledWith({ data: { label: "Coach" } }));
    expect(await screen.findByText(`${window.location.origin}/h/${token}`)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Revoke Coach" }));
    await waitFor(() => expect(state.revokeLink).toHaveBeenCalledWith({ data: { token } }));
    expect(await screen.findByText("Link revoked. It no longer opens your log.")).toBeVisible();
    expect(screen.queryByText(`${window.location.origin}/h/${token}`)).toBeNull();
  });
});
