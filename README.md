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
OAUTH_AUDIENCE=https://<project>.vercel.app/mcp
OAUTH_JWKS_URI=https://<tenant>.us.auth0.com/.well-known/jwks.json
OAUTH_ALLOWED_SUB=google-oauth2|<immutable-auth0-sub>
HEALTH_TRACKER_INTERNAL_USER_ID=<health-tracker-user-id>
HEALTH_TRACKER_HOSTED_API_KEY=ht_<dedicated-hosted-pat>
DEFAULT_PROFILE_ID=<optional-initial-profile-id>
OAUTH_CLOCK_TOLERANCE_SECONDS=60
AUTH_LOG_HMAC_KEY=<32-or-more-random-bytes>
```

Do not set `HEALTH_TRACKER_API_KEY` in hosted mode. `HEALTH_TRACKER_HOSTED_API_KEY`
is a separate, least-privilege Health Tracker personal access token used only for the
MCP-to-API hop. The validated Claude OAuth access token is audience-bound to `/mcp`
and is never forwarded to the Health Tracker API.
Generate `AUTH_LOG_HMAC_KEY` independently (for example, 32 random bytes encoded as base64). It pseudonymizes the Auth0 principal in audit logs and must not be shared with the API rate-limit key.

Deploy from this directory with `vercel`, choose a new project, configure the variables above, then run `vercel --prod`. No deployment is attempted automatically without an authenticated Vercel CLI and configured Auth0 tenant.

## Auth0 configuration

1. Create or select an Auth0 tenant and enable the Google social connection for the application.
2. Create an Auth0 API with identifier exactly equal to the public MCP endpoint (for example, `https://<project>.vercel.app/mcp`) and `OAUTH_AUDIENCE`, signing algorithm RS256, and RBAC enabled. Enable adding permissions to the access token. In Auth0 tenant Settings → Advanced, enable the Resource Parameter Compatibility Profile so MCP's RFC 8707 `resource` parameter selects this API.
3. Add permissions `health:read`, `health:write`, `health:destructive`, `genealogy:read`, `genealogy:write`, `genealogy:destructive`, and the corresponding `system:*` permissions if needed.
4. Create a regular web application for Claude. Use Authorization Code with PKCE and add `https://claude.ai/api/mcp/auth_callback` to Allowed Callback URLs.
5. Authorize only the intended Google-backed Auth0 user and record the immutable Auth0 `sub` as `OAUTH_ALLOWED_SUB`. Do not use email as the allowlist key.
6. Use short-lived access tokens. Configure the Health Tracker API with the same issuer, audience, allowed subject, and internal user mapping.

## Health Tracker API credential

Create a dedicated PAT in Health Tracker for the hosted MCP and store it only as
`HEALTH_TRACKER_HOSTED_API_KEY` in the MCP deployment. The API continues to derive
the authoritative user and profile permissions from that PAT. Revoke this PAT to
cut off the MCP's downstream access. The Health Tracker API does not need to accept
the Claude/Auth0 token.

## Claude custom connector

1. On claude.ai, open Settings → Connectors and add a custom connector using `https://<project>.vercel.app/mcp`.
2. Select OAuth and enter the Auth0 client ID and client secret if prompted.
3. Request only the scopes needed initially, preferably `health:read genealogy:read`.
4. Complete Google sign-in and verify that an unapproved Google/Auth0 user receives `403`.
5. After it is connected on the web, enable the connector in a Claude iOS or Android conversation.

## Verification

Run unit tests and builds:

```powershell
npm test
npm run build
```

## Vision exam tools

Vision data is exposed as a cohesive exam aggregate rather than unrelated generic metrics:

| Tool | Impact | Purpose |
|---|---|---|
| `list_vision_metrics` | read | List entries in the compound Vision Health Metric |
| `get_vision_metric` | read | Retrieve one structured Vision entry |
| `create_vision_metric` | write | Add a partial or complete Vision entry |
| `update_vision_metric` | write | Partially update a Vision entry using its current `version` |
| `delete_vision_metric` | destructive | Delete a Vision entry and its child observations |

The create/update tools accept collections for typed refractions, visual acuity, IOP, PD,
cup-to-disc ratio, and keratometry. OD, OS, and OU laterality and raw source notation should
be preserved. Derived spherical-equivalent and logMAR values are calculated by the Health
Tracker API and must not be supplied as authoritative user input.

`delete_vision_metric` is disabled in hosted mode by the standard destructive-operation policy.
All tools use the active profile and remain subject to the API’s profile authorization checks.
For write operations request `health:write`; reads require `health:read`.

Example:

```json
{
  "examAt": "2026-07-17T09:22:00-04:00",
  "provider": "Bethel Yoseph, O.D.",
  "refractions": [{
    "type": "FINAL_PRESCRIPTION",
    "usage": "Distance single vision",
    "eyes": [
      { "eye": "OD", "sphere": -1.0, "cylinder": -1.25, "axis": 95, "notation": "MINUS" },
      { "eye": "OS", "sphere": -1.0, "cylinder": -1.25, "axis": 70, "notation": "MINUS" }
    ]
  }]
}
```

For a hosted local smoke test, set hosted variables against a test Auth0 tenant, run `vercel dev`, and connect MCP Inspector to `http://localhost:3000/mcp` with `Authorization: Bearer <test-access-token>`. Verify initialization, `tools/list`, a read tool, a missing-scope denial, and a disabled destructive-tool denial.

After deployment, repeat against `https://<project>.vercel.app/mcp`, check that
`/.well-known/oauth-protected-resource` reports that exact `/mcp` URL as `resource`,
then confirm the Health Tracker audit trail records the user belonging to the dedicated
hosted PAT. Never paste production tokens into shell history or logs.

Destructive, access-administration, import, reset, and long-running job-control tools are disabled in hosted mode by default. Long-running genealogy state already resides in the Health Tracker database; hosted execution must use a separately scheduled durable worker before those start/resume tools are enabled.

### Profile selection and authorization

`DEFAULT_PROFILE_ID` controls only the initial active profile selected when a hosted MCP request starts. It is not a confinement boundary. The authenticated internal user's Health Tracker profile RBAC permissions define the complete set of profiles the MCP can access. `list_profiles` returns that RBAC-filtered set, and every explicit `profileId` remains subject to authorization by the Health Tracker API.

`HOSTED_PROFILE_ID` remains a deprecated, temporary compatibility alias used only when `DEFAULT_PROFILE_ID` is unset. Neither variable restricts the MCP to one profile. `switch_profile` checks the requested profile through the API before changing request-scoped selection; stateless hosted calls must not rely on that selection persisting into a later HTTP request. Explicit profile IDs remain protected by API RBAC.

## Manual deployment runbook

1. In the Auth0 dashboard, configure the tenant, Google connection, Resource Parameter Compatibility Profile, `/mcp` API audience, RS256, scopes, and Claude callback URL.
2. In Health Tracker, issue a dedicated least-privilege PAT for the hosted MCP.
3. In the MCP Vercel project, configure hosted transport, OAuth variables, and `HEALTH_TRACKER_HOSTED_API_KEY`. Set `DEFAULT_PROFILE_ID` only when an initial selection is useful; do not treat it as authorization. Migrate any existing `HOSTED_PROFILE_ID` value to `DEFAULT_PROFILE_ID`.
4. Deploy the MCP and verify `/mcp`, protected-resource metadata, the unauthenticated challenge, and read-only OAuth calls.
5. Add the `/mcp` URL as a Claude custom connector, complete Google sign-in, test PAT-authorized reads, review redacted logs, and grant write scopes only after manual review.
