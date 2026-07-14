import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import {
  Auth0BearerAuthenticator,
  OAuthPassthroughCredentialProvider,
  LocalApiCredentialProvider,
  LocalApiKeyAuthenticator,
  PolicyAuthorizer,
  assertRuntimeMode,
  createAuthenticator,
  createCredentialProvider,
} from "./auth.js";
import { runWithRequestContext, getRequestContext, runInvocationWithContext } from "./request-context.js";

describe("dual authentication", () => {
  let server: Server;
  let privateKey: CryptoKey;
  let issuer: string;
  const audience = "https://health-mcp.test";
  const subject = "google-oauth2|allowed";

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    const jwk = await exportJWK(pair.publicKey);
    Object.assign(jwk, { kid: "test", use: "sig", alg: "RS256" });
    server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server failed");
    issuer = `http://127.0.0.1:${address.port}/`;
    Object.assign(process.env, {
      OAUTH_ISSUER: issuer,
      OAUTH_AUDIENCE: audience,
      OAUTH_JWKS_URI: issuer,
      OAUTH_ALLOWED_SUB: subject,
      HEALTH_TRACKER_INTERNAL_USER_ID: "internal-user",
      HEALTH_TRACKER_API_KEY: "ht_local",
      LOCAL_INTERNAL_USER_ID: "local-internal-user",
    });
  });
  afterAll(() => server.close());

  async function token(overrides: { issuer?: string; audience?: string; subject?: string; expires?: string; scopes?: string } = {}) {
    return new SignJWT({ scope: overrides.scopes ?? "health:read health:write" })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(overrides.issuer ?? issuer)
      .setAudience(overrides.audience ?? audience)
      .setSubject(overrides.subject ?? subject)
      .setIssuedAt()
      .setExpirationTime(overrides.expires ?? "5m")
      .sign(privateKey);
  }

  it("preserves local personal access token mode", async () => {
    const context = await new LocalApiKeyAuthenticator().authenticate();
    expect(context.method).toBe("local_api_key");
    expect(context.internalUserId).toBe("local-internal-user");
    expect(await new LocalApiCredentialProvider().getAuthorization()).toBe("Bearer ht_local");
  });

  it("establishes local context for each stdio-style invocation", async () => {
    const auth = await new LocalApiKeyAuthenticator().authenticate({});
    const context = { auth, credentials: new LocalApiCredentialProvider() };
    const received = await runInvocationWithContext(context, async () => ({
      internalUserId: getRequestContext().auth.internalUserId,
      authorization: await getRequestContext().credentials.getAuthorization(getRequestContext().auth),
    }));
    expect(received).toEqual({ internalUserId: "local-internal-user", authorization: "Bearer ht_local" });
  });

  it("accepts a valid OAuth token and maps immutable subject", async () => {
    const context = await new Auth0BearerAuthenticator().authenticate({ authorization: `Bearer ${await token()}` });
    expect(context.internalUserId).toBe("internal-user");
    expect(context.scopes.has("health:read")).toBe(true);
  });

  it("requires an inbound bearer token in hosted OAuth mode", async () => {
    await expect(new Auth0BearerAuthenticator().authenticate({})).rejects.toThrow("Missing bearer access token");
  });

  it("hosted credentials cannot fall back to the local API key", async () => {
    const hosted = { method: "oauth_bearer" as const, principal: "hosted", internalUserId: "internal-user", scopes: new Set<string>() };
    await expect(new OAuthPassthroughCredentialProvider().getAuthorization(hosted)).rejects.toThrow("OAuth access token unavailable");
    process.env.AUTH_MODE = "oauth_bearer";
    expect(createCredentialProvider("oauth_bearer")).toBeInstanceOf(OAuthPassthroughCredentialProvider);
    expect(() => createCredentialProvider("local_api_key")).toThrow("Expected AUTH_MODE=local_api_key");
    process.env.AUTH_MODE = "local_api_key";
  });

  it.each([
    ["wrong issuer", () => token({ issuer: "https://wrong.example/" })],
    ["wrong audience", () => token({ audience: "wrong" })],
    ["expired token", () => token({ expires: "-5m" })],
    ["unknown subject", () => token({ subject: "google-oauth2|unknown" })],
  ])("rejects %s", async (_name, makeToken) => {
    await expect(new Auth0BearerAuthenticator().authenticate({ authorization: `Bearer ${await makeToken()}` })).rejects.toThrow();
  });

  it("rejects missing scope and disabled hosted tools", async () => {
    const context = await new Auth0BearerAuthenticator().authenticate({ authorization: `Bearer ${await token({ scopes: "health:read" })}` });
    const authorizer = new PolicyAuthorizer();
    expect(() => authorizer.authorize(context, { domain: "health", impact: "write", requiredScopes: ["health:write"], hostedEnabled: true })).toThrow("Missing required scope");
    expect(() => authorizer.authorize(context, { domain: "health", impact: "read", requiredScopes: ["health:read"], hostedEnabled: false })).toThrow("disabled");
  });

  it("isolates concurrent request state and ignores caller identity fields", async () => {
    const makeContext = (id: string) => ({
      auth: { method: "oauth_bearer" as const, principal: id, internalUserId: id, scopes: new Set<string>(), activeProfileId: id },
      credentials: { getAuthorization: async () => "Bearer redacted" },
    });
    const [a, b] = await Promise.all([
      runWithRequestContext(makeContext("user-a"), async () => {
        getRequestContext().auth.activeProfileId = "profile-a";
        await new Promise((resolve) => setTimeout(resolve, 5));
        return [getRequestContext().auth.internalUserId, getRequestContext().auth.activeProfileId];
      }),
      runWithRequestContext(makeContext("user-b"), async () => {
        getRequestContext().auth.activeProfileId = "profile-b";
        await Promise.resolve();
        return [getRequestContext().auth.internalUserId, getRequestContext().auth.activeProfileId];
      }),
    ]);
    expect([a, b]).toEqual([["user-a", "profile-a"], ["user-b", "profile-b"]]);
    const toolArguments = { userId: "attacker" };
    expect(toolArguments.userId).not.toBe(a[0]);
  });

  it("fails closed outside a context or valid transport/auth pairing", () => {
    expect(() => getRequestContext()).toThrow("No authenticated request context");
    process.env.MCP_TRANSPORT = "stdio";
    process.env.AUTH_MODE = "oauth_bearer";
    expect(() => assertRuntimeMode("stdio", "local_api_key")).toThrow("requires AUTH_MODE=local_api_key");
    expect(() => createAuthenticator("local_api_key")).toThrow("Expected AUTH_MODE=local_api_key");
    process.env.MCP_TRANSPORT = "streamable_http";
    process.env.AUTH_MODE = "local_api_key";
    expect(() => assertRuntimeMode("streamable_http", "oauth_bearer")).toThrow("requires AUTH_MODE=oauth_bearer");
    process.env.MCP_TRANSPORT = "stdio";
    process.env.AUTH_MODE = "local_api_key";
  });
});
