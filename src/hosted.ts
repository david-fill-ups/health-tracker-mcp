import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AuthError, assertRuntimeMode, createAuthenticator, createCredentialProvider } from "./auth.js";
import { createHealthTrackerServer } from "./index.js";
import { runWithRequestContext } from "./request-context.js";

function challenge(): string {
  const publicUrl = process.env.MCP_PUBLIC_URL || "http://localhost:3001";
  return `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource"`;
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  if (request.method === "GET") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  try {
    assertRuntimeMode("streamable_http", "oauth_bearer");
    const auth = await createAuthenticator("oauth_bearer").authenticate({ authorization: request.headers.get("authorization") });
    const credentials = createCredentialProvider("oauth_bearer");
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createHealthTrackerServer();
    return await runWithRequestContext({ auth, credentials }, async () => {
      await server.connect(transport);
      return transport.handleRequest(request);
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 401;
    const message = status === 401 ? "Unauthorized" : error instanceof Error ? error.message : "Forbidden";
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
      { status, headers: status === 401 ? { "WWW-Authenticate": challenge() } : undefined },
    );
  }
}

export async function handleMcpNodeRequest(
  request: IncomingMessage & { body?: unknown },
  response: ServerResponse,
): Promise<void> {
  try {
    assertRuntimeMode("streamable_http", "oauth_bearer");
    const auth = await createAuthenticator("oauth_bearer").authenticate({ authorization: request.headers.authorization });
    const credentials = createCredentialProvider("oauth_bearer");
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    const server = createHealthTrackerServer();
    await runWithRequestContext({ auth, credentials }, async () => {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 401;
    response.statusCode = status;
    response.setHeader("Content-Type", "application/json");
    if (status === 401) response.setHeader("WWW-Authenticate", challenge());
    response.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: status === 401 ? "Unauthorized" : "Forbidden" }, id: null }));
  }
}

export function protectedResourceMetadata(): Response {
  const resource = process.env.MCP_PUBLIC_URL || "http://localhost:3001";
  const issuer = process.env.OAUTH_ISSUER;
  if (!issuer) return Response.json({ error: "OAUTH_ISSUER is not configured" }, { status: 500 });
  return Response.json({ resource, authorization_servers: [issuer], scopes_supported: [
    "health:read", "health:write", "health:destructive",
    "genealogy:read", "genealogy:write", "genealogy:destructive",
    "system:read", "system:write", "system:destructive",
  ] });
}

export function writeProtectedResourceMetadata(response: ServerResponse): void {
  const metadata = protectedResourceMetadata();
  response.statusCode = metadata.status;
  response.setHeader("Content-Type", "application/json");
  metadata.text().then((body) => response.end(body));
}
