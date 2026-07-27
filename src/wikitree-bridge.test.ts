import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executeBridgeOperation,
  fixedWikiTreeUrl,
  type BridgeOperation,
} from "./client.js";
import { runWithRequestContext } from "./request-context.js";
import type { WikiTreeBrowserTransport } from "./wikitree-browser-transport.js";

const operation: BridgeOperation = {
  operationToken: "t".repeat(43),
  operationId: "operation-1",
  version: 1,
  action: "searchPerson",
  parameters: {
    FirstName: "Frank",
    LastName: "Phillips",
    BirthDate: "1873-01-02",
    DeathDate: "1948-03-04",
  },
  parameterDigest: "a".repeat(64),
  appId: "DavidHealthTracker",
  endpoint: "https://api.wikitree.com/api.php",
  retryPolicy: { maxAttempts: 3 },
  claimExpiresAt: new Date(Date.now() + 60_000).toISOString(),
};

const context = {
  auth: { method: "local_api_key" as const, principal: "local-test", scopes: new Set<string>() },
  credentials: { getAuthorization: vi.fn().mockResolvedValue("Bearer local") },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("local MCP WikiTree bridge", () => {
  it("uses only the fixed endpoint and preserves exact supplied parameters", () => {
    const url = fixedWikiTreeUrl(operation);
    expect(url.origin + url.pathname).toBe("https://api.wikitree.com/api.php");
    expect(url.searchParams.get("appId")).toBe("DavidHealthTracker");
    expect(url.searchParams.get("BirthDate")).toBe("1873-01-02");
    expect(url.searchParams.get("DeathDate")).toBe("1948-03-04");
    expect(() => fixedWikiTreeUrl({ ...operation, endpoint: "https://evil.example/api" }))
      .toThrow("invalid WikiTree endpoint");
  });

  it("reserves a new global slot before every retry and submits valid JSON", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    let wikiAttempts = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/bridge/reserve")) {
        return new Response(JSON.stringify({ waitMs: 0 }), { status: 200 });
      }
      if (url.includes("/bridge/submit")) {
        return new Response(JSON.stringify({ done: true, result: [] }), { status: 200 });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser: WikiTreeBrowserTransport = {
      navigate: vi.fn(async (url) => {
        calls.push(url.href);
        wikiAttempts++;
        return wikiAttempts === 1
          ? { status: 200, contentType: "application/json", body: "", retryAfter: null }
          : {
              status: 200,
              contentType: "application/json",
              body: '[{"status":0,"matches":[]}]',
              retryAfter: null,
            };
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const pending = runWithRequestContext(context, () => executeBridgeOperation(operation, browser));
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ done: true });

    expect(calls.filter((url) => url.includes("/bridge/reserve"))).toHaveLength(2);
    expect(wikiAttempts).toBe(2);
    expect(calls.findIndex((url) => url.includes("/bridge/reserve")))
      .toBeLessThan(calls.findIndex((url) => url.startsWith("https://api.wikitree.com")));
    expect(browser.close).not.toHaveBeenCalled();
  });
});
