# t2-real-signin — Sign-in against the REAL plue api with a real seeded token

`apps/smithers/tests/e2e-real/signin.spec.ts`: drive the app's token sign-in UI against the REAL plue api (port 4000) and land signed in.

The real token: plue's compose seeds postgres from $PLUE_DIR/db/seed.sql, which inserts user alice (display name "Alice Dev", admin) and the access token `smithers_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef` (sha-256 hash stored in access_tokens; scopes write:repository,write:user,write:organization). The api validates `Authorization: Bearer <token>` by hashing and looking up. Use that seeded token in the spec; cite db/seed.sql in a comment. (Compose also sets SMITHERS_ENABLE_E2E_TEST_ROUTES=true if you need /_test/ routes; minting is NOT required since the seed token exists.)

Success criteria:
- Spec starts signed out (anonymous /api/user is 401), performs token sign-in through the UI, asserts the signed-in state shows "Alice Dev" exactly as stored in plue's postgres, and survives a page reload still signed in.
- No fakePlueHost / fixture imports; the token comes from real plue's own seed, not from a fake's seed table.
- Pin the plue contract you depend on (token format, /api/user response fields) in a NEW bun assumption test under apps/smithers/tests/assumptions/ that probes the live plue api, guarded by an env flag so it only runs when plue is up. Do not modify the existing fixture-suite assumption files.

## Verify command (must exit 0)

```bash
pnpm -C apps/smithers exec playwright test --config playwright.real.config.ts tests/e2e-real/signin.spec.ts
```
