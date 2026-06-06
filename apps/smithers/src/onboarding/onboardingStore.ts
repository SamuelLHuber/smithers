import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useChatStore } from "../chat/chatStore";
import { useNotificationsStore } from "../notifications/notificationsStore";
import { useWorkflowsStore } from "../store/workflowsStore";
import {
  DEFAULT_DRAFT,
  TEMPLATES,
  draftForGoal,
  draftToName,
  draftToStarter,
  type TemplateId,
  type WorkflowDraft,
} from "./createWorkflowFlow";

/** The phases of the first run, in order. The overlay renders one at a time. */
export type OnboardingStep = "intro" | "welcome" | "build" | "done";

type OnboardingState = {
  /** Whether onboarding has run. The only persisted field. */
  completed: boolean;
  step: OnboardingStep;
  /** The workflow being assembled in the build step. */
  draft: WorkflowDraft;

  /** Leave the splash for the welcome conversation. Idempotent (the splash may
   *  fire its animation-end more than once). */
  enterWelcome: () => void;
  /** Track the goal box as the user types it (the live, uncommitted value). */
  setGoal: (goal: string) => void;
  /** Commit the goal, classify it, and move to the builder. */
  submitGoal: (goal: string) => void;
  /** Go back to change the goal. */
  editGoal: () => void;

  pickTemplate: (templateId: TemplateId) => void;
  toggleApproval: () => void;
  toggleLoop: () => void;
  setName: (name: string) => void;

  /** Commit the draft: install it, prime the composer, and finish. */
  createWorkflow: () => void;
  /** End onboarding without creating anything. */
  skip: () => void;
  /** Mark the first run done. */
  complete: () => void;
  /** Replay onboarding from the top (dogfooding, e2e, the /onboarding slash). */
  reset: () => void;
};

/**
 * Onboarding on a split medium: `completed` persists to localStorage (so the
 * first run happens once), while `step` and `draft` are transient and reset on
 * reload. `partialize` is what keeps the persisted blob to just the flag. No
 * timers and no effects — the splash advances on an animation-end event, and
 * every transition is a plain action.
 */
export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      completed: false,
      step: "intro",
      draft: DEFAULT_DRAFT,

      enterWelcome: () => {
        if (get().step === "intro") {
          set({ step: "welcome" });
        }
      },

      setGoal: (goal) => set((state) => ({ draft: { ...state.draft, goal } })),

      submitGoal: (goal) => set({ draft: draftForGoal(goal), step: "build" }),

      editGoal: () => set({ step: "welcome" }),

      pickTemplate: (templateId) =>
        set((state) => ({
          draft: {
            ...state.draft,
            templateId,
            // A read-only template has nothing to loop; don't carry a stale toggle.
            withLoop: TEMPLATES[templateId].loop ? state.draft.withLoop : false,
            name: state.draft.name || draftToName({ ...state.draft, templateId }),
          },
        })),

      toggleApproval: () =>
        set((state) => ({ draft: { ...state.draft, withApproval: !state.draft.withApproval } })),

      toggleLoop: () =>
        set((state) => ({ draft: { ...state.draft, withLoop: !state.draft.withLoop } })),

      setName: (name) => set((state) => ({ draft: { ...state.draft, name } })),

      createWorkflow: () => {
        const draft = get().draft;
        const template = TEMPLATES[draft.templateId];
        const name = draft.name || draftToName(draft);
        // Install the matched workflow so it's ready in the store, and prime the
        // composer with the user's own words so their first real action is one
        // keystroke away. Both reuse the live app stores — onboarding lands the
        // user inside the product, not on a dead end.
        useWorkflowsStore.getState().install(template.installId);
        useChatStore.getState().fill(draftToStarter(draft));
        useNotificationsStore.getState().notify({
          title: `Created ${name}`,
          detail: "Ready in your composer and the store.",
          kind: "transient",
        });
        get().complete();
      },

      skip: () => get().complete(),

      complete: () => set({ completed: true, step: "done" }),

      reset: () => set({ completed: false, step: "intro", draft: DEFAULT_DRAFT }),
    }),
    {
      name: "smithers.onboarding",
      partialize: (state) => ({ completed: state.completed }),
    },
  ),
);
