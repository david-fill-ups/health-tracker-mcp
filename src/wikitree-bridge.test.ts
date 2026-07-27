import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executeBridgeOperation,
  fixedWikiTreeUrl,
  runWikiTreeLocalBridge,
  truncateUnicode,
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
  it("truncates Unicode by code point without splitting surrogate pairs", () => {
    expect(truncateUnicode("A😀B😀C", 4)).toBe("A😀B😀");
  });

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

    const pending = runWithRequestContext(
      context,
      () => executeBridgeOperation(operation, browser, false),
    );
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ done: true });

    expect(calls.filter((url) => url.includes("/bridge/reserve"))).toHaveLength(2);
    expect(wikiAttempts).toBe(2);
    expect(calls.findIndex((url) => url.includes("/bridge/reserve")))
      .toBeLessThan(calls.findIndex((url) => url.startsWith("https://api.wikitree.com")));
    expect(browser.close).not.toHaveBeenCalled();
    const submitCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/bridge/submit"));
    expect(JSON.parse(String((submitCall as unknown as [unknown, RequestInit])?.[1]?.body))).toMatchObject({
      continueClaim: false,
    });
  });

  it("continues immediately across two one-operation drains at a released boundary", async () => {
    let claim = 0;
    const submittedContinueClaims: boolean[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/bridge/claim")) {
        claim++;
        return new Response(JSON.stringify({ operation: {
          ...operation,
          operationId: `operation-${claim}`,
          version: claim,
        } }), { status: 200 });
      }
      if (url.includes("/bridge/reserve")) {
        return new Response(JSON.stringify({ waitMs: 0 }), { status: 200 });
      }
      if (url.includes("/bridge/submit")) {
        const body = JSON.parse(String(init?.body));
        submittedContinueClaims.push(body.continueClaim);
        return new Response(JSON.stringify(
          claim === 1
            ? { done: false, continue: true }
            : { done: true, result: { status: "no_match" } },
        ), { status: 200 });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser: WikiTreeBrowserTransport = {
      navigate: vi.fn().mockResolvedValue({
        status: 200,
        contentType: "application/json; charset=UTF-8",
        body: '[{"status":0,"matches":[]}]',
        retryAfter: null,
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const first = await runWithRequestContext(
      context,
      () => runWikiTreeLocalBridge("job-1", 1, browser),
    );
    const second = await runWithRequestContext(
      context,
      () => runWikiTreeLocalBridge("job-1", 1, browser),
    );

    expect(first).toMatchObject({ continue: true, processedOperations: 1 });
    expect(second).toMatchObject({ continue: true, processedOperations: 1 });
    expect(claim).toBe(2);
    expect(submittedContinueClaims).toEqual([false, false]);
    expect(browser.close).not.toHaveBeenCalled();
  });

  it("submits bounded structured parse diagnostics without response content", async () => {
    vi.useFakeTimers();
    const submissions: Array<Record<string, any>> = [];
    const rawBody = `<html>${JSON.stringify({ profile: "private genealogy content" })}${"x".repeat(2_000)}</html>`;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/bridge/reserve")) {
        return new Response(JSON.stringify({ waitMs: 0 }), { status: 200 });
      }
      if (url.includes("/bridge/submit")) {
        submissions.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ done: true, status: "error" }), { status: 200 });
      }
      throw new Error(`Unexpected URL ${url}`);
    }));
    const browser: WikiTreeBrowserTransport = {
      navigate: vi.fn().mockResolvedValue({
        status: 200,
        contentType: "text/html; charset=UTF-8",
        body: rawBody,
        retryAfter: null,
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const pending = runWithRequestContext(context, () => executeBridgeOperation(operation, browser));
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ done: true });

    const failure = submissions[0].failure;
    expect(failure).toMatchObject({
      kind: "parse",
      message: "Malformed JSON response",
      status: 200,
      contentType: "text/html; charset=UTF-8",
      responseLength: Buffer.byteLength(rawBody),
      responseBodyDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      attempt: 3,
      retryCount: 2,
      messageTruncated: false,
      originalMessageLength: 23,
      parseErrors: 3,
    });
    expect(Array.from(failure.message).length).toBeLessThanOrEqual(800);
    expect(JSON.stringify(failure)).not.toContain("private genealogy content");
    expect(JSON.stringify(failure)).not.toContain("<html>");
  });

  it("replaces oversized thrown diagnostics with a stable safe network summary", async () => {
    vi.useFakeTimers();
    let submission: Record<string, any> | undefined;
    const unsafe = `${"😀".repeat(900)}<html>{"token":"secret"}</html>\n    at privateStack()`;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/bridge/reserve")) {
        return new Response(JSON.stringify({ waitMs: 0 }), { status: 200 });
      }
      if (url.includes("/bridge/submit")) {
        submission = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ done: true, status: "error" }), { status: 200 });
      }
      throw new Error(`Unexpected URL ${url}`);
    }));
    const browser: WikiTreeBrowserTransport = {
      navigate: vi.fn().mockRejectedValue(new Error(unsafe)),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const pending = runWithRequestContext(context, () => executeBridgeOperation(operation, browser));
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ done: true });

    expect(submission?.failure).toMatchObject({
      kind: "network",
      message: "Browser transport request failed",
      attempt: 3,
      retryCount: 2,
      messageTruncated: true,
      originalMessageLength: Array.from(unsafe).length,
    });
    expect(JSON.stringify(submission)).not.toContain("<html>");
    expect(JSON.stringify(submission)).not.toContain("privateStack");
    expect(JSON.stringify(submission)).not.toContain('"token"');
  });
});
