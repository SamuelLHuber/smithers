import { useState, type FormEvent } from "react";
import { useAuthStore } from "./authStore";
import { authProviderSelectionEnabled, getLoginRedirectTarget } from "./authClient";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState<"token" | "email" | null>(null);
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const signInWithProvider = useAuthStore((state) => state.signInWithProvider);
  const signInWithToken = useAuthStore((state) => state.signInWithToken);
  const refreshUser = useAuthStore((state) => state.refreshUser);

  const redirect = getLoginRedirectTarget();
  const canSelectProvider = authProviderSelectionEnabled();

  const submitEmail = (event: FormEvent) => {
    event.preventDefault();
    setSubmitting("email");
    signInWithProvider("email", { email, redirect });
  };

  const submitToken = async (event: FormEvent) => {
    event.preventDefault();
    if (!token.trim()) return;
    setSubmitting("token");
    const ok = await signInWithToken(token);
    setSubmitting(null);
    if (ok) {
      window.location.href = redirect;
    }
  };

  return (
    <section className="login-page">
      <div className="login-panel">
        <header className="login-head">
          <span className="login-mark">S</span>
          <div>
            <h1>Sign in to Smithers</h1>
            <p>Use the same Plue identity for remote sandboxes and gateway runs.</p>
          </div>
        </header>

        {error ? <div className="login-error">{error}</div> : null}

        {canSelectProvider ? (
          <div className="login-actions">
            <button
              className="login-provider"
              type="button"
              onClick={() => signInWithProvider("google", { redirect })}
            >
              <span className="provider-icon">G</span>
              <span>Continue with Google</span>
            </button>
            <button
              className="login-provider"
              type="button"
              onClick={() => signInWithProvider("github", { redirect })}
            >
              <span className="provider-icon">GH</span>
              <span>Continue with GitHub</span>
            </button>
          </div>
        ) : (
          <div className="login-actions">
            <button
              className="login-provider"
              type="button"
              onClick={() => signInWithProvider("email", { redirect })}
            >
              <span className="provider-icon">SSO</span>
              <span>Continue with SSO</span>
            </button>
          </div>
        )}

        {canSelectProvider ? (
          <form className="login-form" onSubmit={submitEmail}>
            <label htmlFor="login-email">Email</label>
            <div className="login-row">
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                placeholder="you@example.com"
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
              <button type="submit" disabled={submitting !== null || !email.trim()}>
                {submitting === "email" ? "Opening" : "Continue"}
              </button>
            </div>
          </form>
        ) : null}

        <div className="login-divider">or use an access token</div>

        <form className="login-form" onSubmit={submitToken}>
          <label htmlFor="login-token">Token</label>
          <div className="login-row">
            <input
              id="login-token"
              type="password"
              autoComplete="current-password"
              value={token}
              placeholder="smithers_..."
              onChange={(event) => setToken(event.currentTarget.value)}
            />
            <button type="submit" disabled={submitting !== null || !token.trim()}>
              {submitting === "token" || status === "checking" ? "Checking" : "Connect"}
            </button>
          </div>
        </form>

        <button className="login-secondary" type="button" onClick={() => void refreshUser()}>
          I already signed in
        </button>
      </div>
    </section>
  );
}
