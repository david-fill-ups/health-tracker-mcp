import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { createHmac } from "node:crypto";

export type AuthMode = "local_api_key" | "oauth_bearer";
export type McpTransportMode = "stdio" | "streamable_http";
export type ToolDomain = "health" | "genealogy" | "system";
export type ToolImpact = "read" | "write" | "destructive";

export type RequestAuthInput = { authorization?: string | null };
export type AuthContext = {
  method: AuthMode;
  principal: string;
  internalUserId: string;
  scopes: ReadonlySet<string>;
  accessToken?: string;
  activeProfileId?: string;
};
export type OperationPolicy = {
  domain: ToolDomain;
  impact: ToolImpact;
  requiredScopes: string[];
  hostedEnabled: boolean;
};
export type AuditEvent = {
  action: string;
  principal: string;
  decision: "allowed" | "denied";
  reason?: string;
};

export interface Authenticator {
  authenticate(input: RequestAuthInput): Promise<AuthContext>;
}
export interface Authorizer {
  authorize(context: AuthContext, operation: OperationPolicy): void;
}
export interface ApiCredentialProvider {
  getAuthorization(context: AuthContext): Promise<string>;
}
export interface AuditLogger {
  record(event: AuditEvent): Promise<void> | void;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export class LocalApiKeyAuthenticator implements Authenticator {
  async authenticate(_input: RequestAuthInput = {}): Promise<AuthContext> {
    return {
      method: "local_api_key",
      principal: "local",
      // The Health Tracker API derives the real user from the personal access
      // token. This local-only label is never used as API authority.
      internalUserId: process.env.LOCAL_INTERNAL_USER_ID?.trim() || "local-api-key-user",
      scopes: new Set(["*"]),
      activeProfileId: process.env.HEALTH_TRACKER_PROFILE_ID?.trim() || undefined,
    };
  }
}

export class Auth0BearerAuthenticator implements Authenticator {
  private readonly issuer = required("OAUTH_ISSUER").replace(/\/?$/, "/");
  private readonly audience = required("OAUTH_AUDIENCE");
  private readonly allowedSubject = required("OAUTH_ALLOWED_SUB");
  private readonly internalUserId = required("HEALTH_TRACKER_INTERNAL_USER_ID");
  private readonly jwks = createRemoteJWKSet(
    new URL(process.env.OAUTH_JWKS_URI || `${this.issuer}.well-known/jwks.json`),
  );

  async authenticate(input: RequestAuthInput): Promise<AuthContext> {
    const match = input.authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new AuthError("Missing bearer access token", 401);
    const token = match[1].trim();
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: ["RS256"],
      clockTolerance: Number(process.env.OAUTH_CLOCK_TOLERANCE_SECONDS || 60),
    });
    if (!payload.sub || payload.sub !== this.allowedSubject) {
      throw new AuthError("Unknown OAuth subject", 403);
    }
    return {
      method: "oauth_bearer",
      principal: `${this.issuer}|${payload.sub}`,
      internalUserId: this.internalUserId,
      scopes: extractScopes(payload),
      accessToken: token,
      activeProfileId: process.env.HOSTED_PROFILE_ID?.trim() || undefined,
    };
  }
}

function extractScopes(payload: JWTPayload): Set<string> {
  const values = new Set<string>();
  if (typeof payload.scope === "string") {
    for (const scope of payload.scope.split(/\s+/)) if (scope) values.add(scope);
  }
  const permissions = payload.permissions;
  if (Array.isArray(permissions)) {
    for (const permission of permissions) if (typeof permission === "string") values.add(permission);
  }
  return values;
}

export class PolicyAuthorizer implements Authorizer {
  authorize(context: AuthContext, operation: OperationPolicy): void {
    if (context.method === "local_api_key") return;
    if (!operation.hostedEnabled) throw new AuthError("Tool is disabled in hosted mode", 403);
    for (const scope of operation.requiredScopes) {
      if (!context.scopes.has(scope)) throw new AuthError(`Missing required scope: ${scope}`, 403);
    }
  }
}

export class LocalApiCredentialProvider implements ApiCredentialProvider {
  async getAuthorization(): Promise<string> {
    return `Bearer ${required("HEALTH_TRACKER_API_KEY")}`;
  }
}

export class OAuthPassthroughCredentialProvider implements ApiCredentialProvider {
  async getAuthorization(context: AuthContext): Promise<string> {
    if (!context.accessToken) throw new AuthError("OAuth access token unavailable", 401);
    return `Bearer ${context.accessToken}`;
  }
}

export class SafeAuditLogger implements AuditLogger {
  record(event: AuditEvent): void {
    const principal = event.principal === "local"
      ? "local"
      : createHmac("sha256", required("AUTH_LOG_HMAC_KEY")).update(event.principal).digest("hex").slice(0, 24);
    console.error(JSON.stringify({ type: "auth_audit", ...event, principal }));
  }
}

export class AuthError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function getAuthMode(): AuthMode {
  const mode = process.env.AUTH_MODE || "local_api_key";
  if (mode !== "local_api_key" && mode !== "oauth_bearer") throw new Error(`Unsupported AUTH_MODE: ${mode}`);
  return mode;
}

export function assertRuntimeMode(expectedTransport: McpTransportMode, expectedAuthMode: AuthMode): void {
  const transport = process.env.MCP_TRANSPORT || "stdio";
  if (transport !== "stdio" && transport !== "streamable_http") {
    throw new Error(`Unsupported MCP_TRANSPORT: ${transport}`);
  }
  if (transport !== expectedTransport) {
    throw new Error(`${expectedTransport} bootstrap cannot run with MCP_TRANSPORT=${transport}`);
  }
  const authMode = getAuthMode();
  if (authMode !== expectedAuthMode) {
    throw new Error(`${expectedTransport} bootstrap requires AUTH_MODE=${expectedAuthMode}`);
  }
}

export function createAuthenticator(expectedMode?: AuthMode): Authenticator {
  const mode = getAuthMode();
  if (expectedMode && mode !== expectedMode) throw new Error(`Expected AUTH_MODE=${expectedMode}, received ${mode}`);
  return mode === "oauth_bearer" ? new Auth0BearerAuthenticator() : new LocalApiKeyAuthenticator();
}

export function createCredentialProvider(expectedMode?: AuthMode): ApiCredentialProvider {
  const mode = getAuthMode();
  if (expectedMode && mode !== expectedMode) throw new Error(`Expected AUTH_MODE=${expectedMode}, received ${mode}`);
  return mode === "oauth_bearer" ? new OAuthPassthroughCredentialProvider() : new LocalApiCredentialProvider();
}
