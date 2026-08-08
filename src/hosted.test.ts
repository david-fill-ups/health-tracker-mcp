import { afterEach, describe, expect, it } from "vitest";
import { assertHostedResourceConfiguration, mcpResourceUrl, protectedResourceMetadata } from "./hosted.js";

describe("hosted MCP metadata", () => {
  const originalPublicUrl = process.env.MCP_PUBLIC_URL;
  const originalIssuer = process.env.OAUTH_ISSUER;
  const originalAudience = process.env.OAUTH_AUDIENCE;

  afterEach(() => {
    if (originalPublicUrl === undefined) delete process.env.MCP_PUBLIC_URL;
    else process.env.MCP_PUBLIC_URL = originalPublicUrl;
    if (originalIssuer === undefined) delete process.env.OAUTH_ISSUER;
    else process.env.OAUTH_ISSUER = originalIssuer;
    if (originalAudience === undefined) delete process.env.OAUTH_AUDIENCE;
    else process.env.OAUTH_AUDIENCE = originalAudience;
  });

  it("uses the exact MCP endpoint as the canonical OAuth resource", async () => {
    process.env.MCP_PUBLIC_URL = "https://health-mcp.example/";
    process.env.OAUTH_ISSUER = "https://tenant.example/";
    process.env.OAUTH_AUDIENCE = "https://health-mcp.example/mcp";

    expect(mcpResourceUrl()).toBe("https://health-mcp.example/mcp");
    expect(() => assertHostedResourceConfiguration()).not.toThrow();
    const response = protectedResourceMetadata();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resource: "https://health-mcp.example/mcp",
      authorization_servers: ["https://tenant.example/"],
    });
  });

  it("fails closed when Auth0 would issue a token for a different audience", () => {
    process.env.MCP_PUBLIC_URL = "https://health-mcp.example";
    process.env.OAUTH_AUDIENCE = "https://different.example/api";
    expect(() => assertHostedResourceConfiguration()).toThrow(
      "OAUTH_AUDIENCE must equal the canonical MCP resource URL",
    );
  });
});
