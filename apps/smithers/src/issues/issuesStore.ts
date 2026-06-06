import { create } from "zustand";
import { useChatStore } from "../chat/chatStore";
import { useNotificationsStore } from "../notifications/notificationsStore";
import {
  closeIssue,
  createIssue,
  reopenIssue,
  SEEDED_ISSUES,
  type Issue,
  type IssueFilter,
} from "./issues";

/**
 * The issues store: the seeded backlog plus the selection, filter, and create
 * form state the card and canvas read. Mutations post feedback the same way the
 * vcs store does, a chat line and a transient toast, since this PWA has no
 * gateway yet.
 */
type IssuesState = {
  issues: Issue[];
  selectedId: string | null;
  filter: IssueFilter;
  creating: boolean;
  draftTitle: string;
  draftBody: string;
  select: (id: string) => void;
  setFilter: (filter: IssueFilter) => void;
  openCreate: () => void;
  cancelCreate: () => void;
  setDraftTitle: (value: string) => void;
  setDraftBody: (value: string) => void;
  submitCreate: () => void;
  close: (number: number) => void;
  reopen: (number: number) => void;
};

export const useIssuesStore = create<IssuesState>((set, get) => ({
  issues: SEEDED_ISSUES,
  selectedId: null,
  filter: "open",
  creating: false,
  draftTitle: "",
  draftBody: "",

  select: (id) => set({ selectedId: id }),

  setFilter: (filter) => set({ filter }),

  openCreate: () => set({ creating: true }),

  cancelCreate: () => set({ creating: false, draftTitle: "", draftBody: "" }),

  setDraftTitle: (value) => set({ draftTitle: value }),

  setDraftBody: (value) => set({ draftBody: value }),

  submitCreate: () => {
    const { issues, draftTitle, draftBody } = get();
    const title = draftTitle.trim();
    if (title === "") return;
    const { issues: next, created } = createIssue(issues, { title, body: draftBody.trim() });
    set({
      issues: next,
      selectedId: created.id,
      filter: "open",
      creating: false,
      draftTitle: "",
      draftBody: "",
    });
    useChatStore.getState().say(`Opened issue #${created.number}: ${created.title}`);
    useNotificationsStore.getState().notify({
      title: "Issue opened",
      detail: `#${created.number} · ${created.title}`,
      kind: "transient",
      command: "chat",
    });
  },

  close: (number) => {
    const { issues } = get();
    const target = issues.find((issue) => issue.number === number);
    if (!target) return;
    set({ issues: closeIssue(issues, number) });
    useChatStore.getState().say(`Closed issue #${number}: ${target.title}`);
    useNotificationsStore.getState().notify({
      title: "Issue closed",
      detail: `#${number} · ${target.title}`,
      kind: "transient",
      command: "chat",
    });
  },

  reopen: (number) => {
    const { issues } = get();
    const target = issues.find((issue) => issue.number === number);
    if (!target) return;
    set({ issues: reopenIssue(issues, number) });
    useChatStore.getState().say(`Reopened issue #${number}: ${target.title}`);
    useNotificationsStore.getState().notify({
      title: "Issue reopened",
      detail: `#${number} · ${target.title}`,
      kind: "transient",
      command: "chat",
    });
  },
}));
