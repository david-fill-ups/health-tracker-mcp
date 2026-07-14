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
`LOCAL_INTERNAL_USER_ID` is optional and diagnostic only; the API derives the authoritative user from the personal access token record.

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
HOSTED_PROFILE_ID=<optional-fixed-profile-id>
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

Destructive, access-administration, import, reset, profile-switching, and long-running job-control tools are disabled in hosted mode by default. Long-running genealogy state already resides in the Health Tracker database; hosted execution must use a separately scheduled durable worker before those start/resume tools are enabled.
