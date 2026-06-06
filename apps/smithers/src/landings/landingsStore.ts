import { create } from "zustand";
import { useChatStore } from "../chat/chatStore";
import { useNotificationsStore } from "../notifications/notificationsStore";
import {
  createLanding,
  landLanding,
  reviewLanding,
  SEEDED_LANDINGS,
  type DetailTab,
  type Landing,
  type LandingFilter,
  type ReviewAction,
} from "./landings";

/**
 * The landings store: the seeded stack plus all view state (selection, filter,
 * detail tab, the review note, and the create form). Mutations replay the jjhub
 * workflow's review/land/create verbs as a chat line plus a toast, the shape
 * launchRun uses, since this PWA has no gateway.
 */
type LandingsState = {
  landings: Landing[];
  selectedId: string | null;
  filter: LandingFilter;
  tab: DetailTab;
  reviewDraft: string;
  createOpen: boolean;
  newTitle: string;
  newBody: string;
  newTarget: string;
  select: (id: string) => void;
  setFilter: (filter: LandingFilter) => void;
  setTab: (tab: DetailTab) => void;
  setReviewDraft: (value: string) => void;
  review: (action: ReviewAction) => void;
  land: () => void;
  openCreate: () => void;
  cancelCreate: () => void;
  setNewTitle: (value: string) => void;
  setNewBody: (value: string) => void;
  setNewTarget: (value: string) => void;
  submitCreate: () => void;
};

export const useLandingsStore = create<LandingsState>((set, get) => ({
  landings: SEEDED_LANDINGS,
  selectedId: SEEDED_LANDINGS[0]?.id ?? null,
  filter: "open",
  tab: "info",
  reviewDraft: "",
  createOpen: false,
  newTitle: "",
  newBody: "",
  newTarget: "",

  select: (id) => set({ selectedId: id, tab: "info" }),

  setFilter: (filter) => set({ filter }),

  setTab: (tab) => set({ tab }),

  setReviewDraft: (reviewDraft) => set({ reviewDraft }),

  review: (action) => {
    const { landings, selectedId, reviewDraft } = get();
    const selected = landings.find((landing) => landing.id === selectedId);
    if (!selected) return;
    const chat = useChatStore.getState();
    const notify = useNotificationsStore.getState().notify;
    const note = reviewDraft.trim();

    set({ landings: reviewLanding(landings, selected.number, action), reviewDraft: "" });

    const verb =
      action === "approve" ? "Approved" : action === "request_changes" ? "Requested changes on" : "Commented on";
    chat.say(`${verb} #${selected.number} \`${selected.title}\`.${note ? `\n\n> ${note}` : ""}`);
    notify({
      title: `${verb} #${selected.number}`,
      detail: selected.title,
      kind: "transient",
      command: "chat",
    });
  },

  land: () => {
    const { landings, selectedId } = get();
    const selected = landings.find((landing) => landing.id === selectedId);
    if (!selected) return;
    const chat = useChatStore.getState();
    const notify = useNotificationsStore.getState().notify;

    set({ landings: landLanding(landings, selected.number) });

    chat.say(`Landed #${selected.number} \`${selected.title}\` onto \`${selected.targetBranch}\`.`);
    notify({
      title: `Landed #${selected.number}`,
      detail: selected.targetBranch,
      kind: "transient",
      command: "chat",
    });
  },

  openCreate: () => set({ createOpen: true }),

  cancelCreate: () => set({ createOpen: false, newTitle: "", newBody: "", newTarget: "" }),

  setNewTitle: (newTitle) => set({ newTitle }),

  setNewBody: (newBody) => set({ newBody }),

  setNewTarget: (newTarget) => set({ newTarget }),

  submitCreate: () => {
    const { landings, newTitle, newBody, newTarget } = get();
    const title = newTitle.trim();
    if (title === "") return;
    const chat = useChatStore.getState();
    const notify = useNotificationsStore.getState().notify;

    const { landings: next, created } = createLanding(landings, {
      title,
      description: newBody.trim(),
      target: newTarget.trim(),
    });
    set({
      landings: next,
      selectedId: created.id,
      tab: "info",
      filter: "open",
      createOpen: false,
      newTitle: "",
      newBody: "",
      newTarget: "",
    });

    chat.say(`Opened #${created.number} \`${created.title}\` onto \`${created.targetBranch}\`.`);
    notify({
      title: `Opened #${created.number}`,
      detail: created.title,
      kind: "transient",
      command: "chat",
    });
  },
}));
