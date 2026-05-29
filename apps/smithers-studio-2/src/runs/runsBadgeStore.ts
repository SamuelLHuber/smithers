import { create } from "zustand";

/**
 * A tiny store inside the Runs folder that holds the unread pending-approval
 * count. The navRegistry's `badge()` hook for "runs" is synchronous and called
 * during the sidebar render, so it reads this store's snapshot. The Runs
 * surface writes the count whenever it loads/refreshes approvals — that keeps
 * time-sensitive gates visible without the user opening the surface (UX.md).
 *
 * It lives here (not in useStudioStore) per the disjointness rule: per-surface
 * detail state stays in the surface's own folder.
 */
type RunsBadgeState = {
  pendingApprovals: number;
  setPendingApprovals: (count: number) => void;
};

export const useRunsBadgeStore = create<RunsBadgeState>((set) => ({
  pendingApprovals: 0,
  setPendingApprovals: (count) => set({ pendingApprovals: count }),
}));

/**
 * Synchronous snapshot for navRegistry.badge(). The nav row is re-rendered by
 * the shell on store changes; this returns the latest committed count.
 */
export function runsApprovalsBadge(): number {
  return useRunsBadgeStore.getState().pendingApprovals;
}
