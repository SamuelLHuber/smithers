# jjhub backend seam

The new UI talks to two backends. This doc defines the client seam for the second
one. See `.smithers/plans/jjhub-parity.md` for the full parity roadmap; this is
Phase 0a, the transport client every code-hosting feature imports.

## Two backends

| Backend | Context | Transport | Client |
|---|---|---|---|
| smithers gateway | run-context (a run = a unit of work) | `POST {base}/v1/rpc/<method>`, JSON frame `{type:"res",ok,payload}` | `gateway/gatewayRpc.ts` |
| jjhub (Plue) | repo-context (`owner/repo`) | REST over `fetch`, plain JSON bodies | `jjhub/` (this seam) |

They coexist. The gateway client is not changed. jjhub is reached only through
`jjhub/`.

## Base-URL resolution — `jjhub/platformBaseUrl.ts`

`platformUrl(path)` resolves an API path to a full URL:

- A configured origin wins: `VITE_SMITHERS_PLATFORM_BASE_URL`, overridable at
  runtime via the `smithers_platform_base_url` localStorage key
  (`setPlatformBaseUrl`). The value is canonicalized by
  `normalizePlatformBaseUrl` (http/https only, trailing slash/hash/query
  stripped; `""` for anything unusable).
- With no configured origin, paths resolve **same-origin**, so the Cloudflare
  Worker proxies them. The Worker proxy branch for `/api/repos/*` etc. is a later
  Phase-0 step; until it lands, point `VITE_SMITHERS_PLATFORM_BASE_URL` at a
  jjhub origin directly.

This mirrors the gateway base-url helpers (`getGatewayBaseUrl`/`gatewayUrl`) in
`auth/authClient.ts`.

## Requests — `jjhub/platformFetch.ts` and `jjhub/platformJson.ts`

`platformFetch(path, init): Promise<Response>` is the jjhub analog of
`authFetch`. It attaches the bearer token and (for mutations) the CSRF header via
`withAuthHeaders`, sends cookies (`credentials: "include"`), targets
`platformUrl(path)`, and on `401` fires the auth-required event
(`handleAuthRequired`) so the shell can route to login.

`platformJson<T>(path, init): Promise<T>` wraps it for the common case: parse the
JSON body, return it on 2xx, throw `PlatformError` on anything else.
`PlatformError` carries `status` and the machine `code` from the jjhub error body
(`{error:{code,message}}` or `{error,message}`), falling back to the HTTP status.

## Pagination — `jjhub/parseLinkCursor.ts`

jjhub list endpoints page with a `Link` header:
`Link: <…?cursor=abc>; rel="next"`. `parseLinkCursor(header)` returns the `cursor`
query param of the `rel="next"` URL, or `null` for the last page. Consumers read
`response.headers.get("Link")` from a `platformFetch` call and pass it here.

## Deferred (the rest of Phase 0)

These touch shared, mid-migration files and land as one separate step:

- Worker proxy branch `isPlatformProxyRoute` + `GO_API_BASE_URL` in `worker.ts` /
  `env.ts` (the same-origin proxy path).
- `repoContext` selection. Per the routing law (URL is the source of truth), the
  active `owner/repo` lives in the URL with a read-only store, alongside the new
  `/:owner/:repo/...` route vocabulary in `deriveRoute.ts` / `Surface.ts`.
- A `backend` selector store that picks the home view (gateway runs vs repo
  dashboard).
- The SSE seam (`authenticatedEventSource`) and the WebSocket ticket helper
  (`/api/auth/sse-ticket`) that the notifications stream and the terminal need.
