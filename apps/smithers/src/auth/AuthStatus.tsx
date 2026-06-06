import { useEffect } from "react";
import { useAuthStore } from "./authStore";
import { currentRedirectPath, loginUrlForRedirect } from "./authClient";

export function AuthStatus() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (status === "signed-in" && user) {
    return (
      <div className="auth-status" data-testid="auth-status">
        <span className="auth-avatar" aria-hidden="true">
          {user.avatarUrl ? <img alt="" src={user.avatarUrl} /> : user.username.slice(0, 1).toUpperCase()}
        </span>
        <span className="auth-name">{user.displayName}</span>
        <button className="auth-link" type="button" onClick={() => void logout()}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="auth-status" data-testid="auth-status">
      <span className="auth-name">{status === "checking" ? "Checking auth" : "Remote mode"}</span>
      <button
        className="auth-link"
        type="button"
        onClick={() => {
          window.location.assign(loginUrlForRedirect(currentRedirectPath()));
        }}
      >
        Sign in
      </button>
    </div>
  );
}
