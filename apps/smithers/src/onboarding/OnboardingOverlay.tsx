import { SmithersIntro } from "./SmithersIntro";
import { WelcomeStep } from "./WelcomeStep";
import { WorkflowBuilder } from "./WorkflowBuilder";
import { useOnboardingStore } from "./onboardingStore";

/**
 * The first-run overlay. It renders the active phase over a dimmed app: the
 * splash full-bleed, then a centered dialog for the conversation and the
 * builder. "Skip for now" ends onboarding from either step. State lives in the
 * store, so this only fans out on `step`.
 */
export function OnboardingOverlay() {
  const step = useOnboardingStore((state) => state.step);
  const skip = useOnboardingStore((state) => state.skip);

  if (step === "intro") {
    return (
      <div className="ob-overlay ob-overlay--intro">
        <SmithersIntro />
      </div>
    );
  }

  return (
    <div className="ob-overlay">
      <div
        aria-label="Welcome to Smithers"
        aria-modal="true"
        className="ob-panel"
        role="dialog"
      >
        <header className="ob-panel-head">
          <span className="ob-brand">
            <span className="ob-brand-dot" aria-hidden="true" />
            Smithers
          </span>
          <button className="ob-skip" type="button" onClick={skip}>
            Skip for now
          </button>
        </header>
        {step === "welcome" ? <WelcomeStep /> : <WorkflowBuilder />}
      </div>
    </div>
  );
}
