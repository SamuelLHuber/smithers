import { useOnboardingStore } from "./onboardingStore";

/**
 * The opening splash: the Smithers mark draws itself, the wordmark rises, and a
 * "Get started" button appears. The mark is the app's magnifying glass — the
 * ring strokes on, then the search stem in brand green. It advances on the
 * wordmark's animation-end (so it auto-continues once the mark has settled) and
 * on the button (so a reader who skips, or has reduced motion, is never stuck).
 */
export function SmithersIntro() {
  const enterWelcome = useOnboardingStore((state) => state.enterWelcome);
  return (
    <div className="ob-intro">
      <div className="ob-glow" aria-hidden="true" />
      <svg className="ob-mark" viewBox="0 0 512 512" role="img" aria-label="Smithers">
        <rect className="ob-mark-bg" width="512" height="512" rx="96" />
        <circle
          className="ob-mark-ring"
          cx="230"
          cy="230"
          r="112"
          fill="none"
          strokeWidth="44"
        />
        <path
          className="ob-mark-stem"
          d="M310 310l84 84"
          strokeWidth="52"
          strokeLinecap="round"
        />
      </svg>
      <div className="ob-wordmark" onAnimationEnd={enterWelcome}>
        Smithers
      </div>
      <p className="ob-tagline">Durable agents, from a single sentence.</p>
      <button className="ob-begin" type="button" onClick={enterWelcome}>
        Get started
      </button>
    </div>
  );
}
