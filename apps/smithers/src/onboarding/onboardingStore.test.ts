import { beforeEach, describe, expect, test } from "bun:test";
import { classifyIntent } from "./createWorkflowFlow";
import { useOnboardingStore } from "./onboardingStore";

/**
 * The onboarding step machine. Drives the store's actions directly (no React)
 * and asserts the transitions the overlay relies on. createWorkflow's side
 * effects on the other stores are covered where those stores live; here we only
 * exercise the navigation between phases and the draft edits.
 */

beforeEach(() => {
  useOnboardingStore.getState().reset();
});

describe("onboarding step machine", () => {
  test("starts on the splash, not yet completed", () => {
    const state = useOnboardingStore.getState();
    expect(state.step).toBe("intro");
    expect(state.completed).toBe(false);
  });

  test("enterWelcome leaves the splash and is idempotent", () => {
    const { enterWelcome } = useOnboardingStore.getState();
    enterWelcome();
    expect(useOnboardingStore.getState().step).toBe("welcome");
    // Firing again (the animation-end can repeat) does not bounce the step.
    enterWelcome();
    expect(useOnboardingStore.getState().step).toBe("welcome");
  });

  test("submitGoal classifies the goal and moves to the builder", () => {
    useOnboardingStore.getState().submitGoal("review my open PR");
    const { step, draft } = useOnboardingStore.getState();
    expect(step).toBe("build");
    expect(draft.goal).toBe("review my open PR");
    expect(draft.templateId).toBe(classifyIntent("review my open PR"));
  });

  test("an empty goal still advances, on the recommended default", () => {
    useOnboardingStore.getState().submitGoal("");
    const { step, draft } = useOnboardingStore.getState();
    expect(step).toBe("build");
    expect(draft.templateId).toBe("research-plan-implement");
  });

  test("setGoal tracks the live box without reclassifying", () => {
    const before = useOnboardingStore.getState().draft.templateId;
    useOnboardingStore.getState().setGoal("review this");
    const { draft } = useOnboardingStore.getState();
    expect(draft.goal).toBe("review this");
    // Live typing only updates text; classification waits for submit.
    expect(draft.templateId).toBe(before);
  });

  test("refine toggles flip the draft", () => {
    const store = useOnboardingStore.getState();
    store.submitGoal("implement a feature");
    const start = useOnboardingStore.getState().draft.withApproval;
    store.toggleApproval();
    expect(useOnboardingStore.getState().draft.withApproval).toBe(!start);
    store.toggleLoop();
    expect(useOnboardingStore.getState().draft.withLoop).toBe(true);
  });

  test("pickTemplate switches the shape", () => {
    const store = useOnboardingStore.getState();
    store.submitGoal("implement a feature");
    store.pickTemplate("debug");
    expect(useOnboardingStore.getState().draft.templateId).toBe("debug");
  });

  test("editGoal returns to the conversation keeping the goal", () => {
    const store = useOnboardingStore.getState();
    store.submitGoal("add dark mode");
    store.editGoal();
    expect(useOnboardingStore.getState().step).toBe("welcome");
    expect(useOnboardingStore.getState().draft.goal).toBe("add dark mode");
  });

  test("skip and complete finish the first run", () => {
    useOnboardingStore.getState().skip();
    expect(useOnboardingStore.getState().completed).toBe(true);
    expect(useOnboardingStore.getState().step).toBe("done");

    useOnboardingStore.getState().reset();
    expect(useOnboardingStore.getState().completed).toBe(false);

    useOnboardingStore.getState().complete();
    expect(useOnboardingStore.getState().completed).toBe(true);
  });
});
