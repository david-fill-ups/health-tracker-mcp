# Health Tracker MCP

One codebase supports local stdio and a stateless hosted Streamable HTTP deployment.

## Local mode

```dotenv
MCP_TRANSPORT=stdio
AUTH_MODE=local_api_key
HEALTH_TRACKER_URL=http://localhost:3000
HEALTH_TRACKER_API_KEY=ht_...
```

```powershell
npm install
npm run build
npm start
```

Claude and Codex configurations continue to launch `node dist/index.js` and pass these environment variables. The personal access token is forwarded as a bearer credential exactly as before.
`LOCAL_INTERNAL_USER_ID` is optional diagnostic or consistency metadata only. The API derives the authoritative user from the personal access token record. The MCP neither invents nor forwards a local internal user ID as authority. If future consistency validation compares this value with an API-reported identity, a mismatch must fail closed.

## Hosted mode on Vercel

The MCP endpoint is `https://<project>.vercel.app/mcp`. It is stateless, uses a fresh server, transport, API client context, and authenticated context per invocation, and requests JSON responses rather than an indefinitely open SSE connection.

Set these Vercel project variables:

```dotenv
MCP_TRANSPORT=streamable_http
AUTH_MODE=oauth_bearer
MCP_PUBLIC_URL=https://<project>.vercel.app
HEALTH_TRACKER_URL=https://<health-tracker-project>.vercel.app
OAUTH_ISSUER=https://<tenant>.us.auth0.com/
OAUTH_AUDIENCE=https://mcp.health-tracker.example
OAUTH_JWKS_URI=https://<tenant>.us.auth0.com/.well-known/jwks.json
OAUTH_ALLOWED_SUB=google-oauth2|<immutable-auth0-sub>
HEALTH_TRACKER_INTERNAL_USER_ID=<health-tracker-user-id>
DEFAULT_PROFILE_ID=<optional-initial-profile-id>
OAUTH_CLOCK_TOLERANCE_SECONDS=60
AUTH_LOG_HMAC_KEY=<32-or-more-random-bytes>
```

Do not set `HEALTH_TRACKER_API_KEY` in hosted mode. The validated OAuth access token is forwarded to the API.
Generate `AUTH_LOG_HMAC_KEY` independently (for example, 32 random bytes encoded as base64). It pseudonymizes the Auth0 principal in audit logs and must not be shared with the API rate-limit key.

Deploy from this directory with `vercel`, choose a new project, configure the variables above, then run `vercel --prod`. No deployment is attempted automatically without an authenticated Vercel CLI and configured Auth0 tenant.

## Auth0 configuration

1. Create or select an Auth0 tenant and enable the Google social connection for the application.
2. Create an Auth0 API with identifier exactly equal to `OAUTH_AUDIENCE`, signing algorithm RS256, and RBAC enabled. Enable adding permissions to the access token.
3. Add permissions `health:read`, `health:write`, `health:destructive`, `genealogy:read`, `genealogy:write`, `genealogy:destructive`, and the corresponding `system:*` permissions if needed.
4. Create a regular web application for the ChatGPT OAuth client. Use Authorization Code with PKCE and configure the callback URL displayed by ChatGPT when creating the connector.
5. Authorize only the intended Google-backed Auth0 user and record the immutable Auth0 `sub` as `OAUTH_ALLOWED_SUB`. Do not use email as the allowlist key.
6. Use short-lived access tokens. Configure the Health Tracker API with the same issuer, audience, allowed subject, and internal user mapping.

## Health Tracker API variables

```dotenv
OAUTH_ISSUER=https://<tenant>.us.auth0.com/
OAUTH_AUDIENCE=https://mcp.health-tracker.example
OAUTH_JWKS_URI=https://<tenant>.us.auth0.com/.well-known/jwks.json
OAUTH_ALLOWED_SUB=google-oauth2|<immutable-auth0-sub>
OAUTH_INTERNAL_USER_ID=<health-tracker-user-id>
OAUTH_CLOCK_TOLERANCE_SECONDS=60
RATE_LIMIT_HMAC_KEY=<32-or-more-random-bytes>
```

Existing database-backed personal access tokens remain accepted. OAuth JWTs are independently checked for signature, issuer, audience, time validity, allowlisted subject, internal-user mapping, and method/path scope. Profile and entity permission checks remain in force.

## ChatGPT custom app

1. In ChatGPT Settings, enable Developer mode.
2. Create a custom connector/app using `https://<project>.vercel.app/mcp`.
3. Choose OAuth and enter the Auth0 authorization URL, token URL, client ID, and client secret from the Auth0 application.
4. Add the exact ChatGPT callback URL to Auth0 Allowed Callback URLs.
5. Request only the scopes needed initially, preferably `health:read genealogy:read`.
6. Complete Google sign-in and verify that an unapproved Google/Auth0 user receives `403`.

## Verification

Run unit tests and builds:

```powershell
npm test
npm run build
```

For a hosted local smoke test, set hosted variables against a test Auth0 tenant, run `vercel dev`, and connect MCP Inspector to `http://localhost:3000/mcp` with `Authorization: Bearer <test-access-token>`. Verify initialization, `tools/list`, a read tool, a missing-scope denial, and a disabled destructive-tool denial.

After deployment, repeat against `https://<project>.vercel.app/mcp`, check `/.well-known/oauth-protected-resource`, then confirm the Health Tracker audit trail records the mapped internal user. Never paste production tokens into shell history or logs.

Destructive, access-administration, import, reset, and long-running job-control tools are disabled in hosted mode by default. Long-running genealogy state already resides in the Health Tracker database; hosted execution must use a separately scheduled durable worker before those start/resume tools are enabled.

### Profile selection and authorization

`DEFAULT_PROFILE_ID` controls only the initial active profile selected when a hosted MCP request starts. It is not a confinement boundary. The authenticated internal user's Health Tracker profile RBAC permissions define the complete set of profiles the MCP can access. `list_profiles` returns that RBAC-filtered set, and every explicit `profileId` remains subject to authorization by the Health Tracker API.

`HOSTED_PROFILE_ID` remains a deprecated, temporary compatibility alias used only when `DEFAULT_PROFILE_ID` is unset. Neither variable restricts the MCP to one profile. `switch_profile` checks the requested profile through the API before changing request-scoped selection; stateless hosted calls must not rely on that selection persisting into a later HTTP request. Explicit profile IDs remain protected by API RBAC.

## Manual deployment runbook

1. In the Auth0 dashboard, configure the tenant, Google connection, API audience, RS256, scopes, and ChatGPT callback URL.
2. In the Health Tracker Vercel project, configure OAuth validation, internal-user mapping, and `RATE_LIMIT_HMAC_KEY`, then deploy Health Tracker.
3. In the MCP Vercel project, configure hosted transport and OAuth variables. Set `DEFAULT_PROFILE_ID` only when an initial selection is useful; do not treat it as authorization. Migrate any existing `HOSTED_PROFILE_ID` value to `DEFAULT_PROFILE_ID`.
4. Deploy the MCP and verify `/mcp`, protected-resource metadata, the unauthenticated challenge, and read-only OAuth calls.
5. Add the `/mcp` URL as a ChatGPT custom app, complete Google sign-in, test RBAC-filtered reads, review redacted logs, and grant write scopes only after manual review.
