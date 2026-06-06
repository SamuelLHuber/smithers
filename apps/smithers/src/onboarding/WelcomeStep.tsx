import type { FormEvent } from "react";
import { GOAL_SUGGESTIONS, WELCOME_LINES } from "./onboardingScript";
import { useOnboardingStore } from "./onboardingStore";

/**
 * Phase two: Smithers introduces itself and what a workflow is (the scripted
 * lines reveal in sequence), then asks the one question onboarding needs. The
 * goal box is store-backed, so there's no component state; suggestion chips fill
 * common answers, including "I'm not sure yet", which takes the recommended
 * default.
 */
export function WelcomeStep() {
  const goal = useOnboardingStore((state) => state.draft.goal);
  const setGoal = useOnboardingStore((state) => state.setGoal);
  const submitGoal = useOnboardingStore((state) => state.submitGoal);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    submitGoal(goal);
  };

  return (
    <div className="ob-welcome">
      <div className="ob-lines">
        {WELCOME_LINES.map((line, index) => (
          <p
            className="ob-line"
            key={line.id}
            style={{ animationDelay: `${index * 360}ms` }}
          >
            {line.text}
          </p>
        ))}
      </div>

      <form className="ob-goal" onSubmit={onSubmit}>
        <input
          aria-label="What would you like a workflow to do?"
          autoFocus
          className="ob-goal-input"
          placeholder="e.g. ship the new billing page"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
        />
        <button className="ob-goal-send" type="submit">
          Continue →
        </button>
      </form>

      <div className="ob-suggestions">
        {GOAL_SUGGESTIONS.map((suggestion) => (
          <button
            className="ob-chip"
            key={suggestion}
            type="button"
            onClick={() => submitGoal(suggestion === "I'm not sure yet" ? "" : suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
