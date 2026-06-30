export type ServerOptions = {
  port?: number;
  /**
   * Network interface to bind. Defaults to the loopback address 127.0.0.1.
   * Binding a non-loopback host (e.g. 0.0.0.0) requires an authToken unless
   * `insecure` is set, because the control plane can launch/cancel/approve
   * arbitrary workflow runs.
   * @default "127.0.0.1"
   */
  host?: string;
  /**
   * Allow binding a non-loopback host with no authToken configured. This
   * exposes a full-control, unauthenticated HTTP control plane to the network.
   * @default false
   */
  insecure?: boolean;
  db?: unknown;
  authToken?: string;
  maxBodyBytes?: number;
  rootDir?: string;
  allowNetwork?: boolean;
  /**
   * Maximum time (in milliseconds) allowed for the HTTP parser to receive the
   * complete headers of a single request. Helps mitigate slowloris attacks.
   * @default 30000
   */
  headersTimeout?: number;
  /**
   * Maximum time (in milliseconds) allowed for a single request to be received
   * and parsed, including the body. Helps mitigate slowloris attacks.
   * @default 60000
   */
  requestTimeout?: number;
};
