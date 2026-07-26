import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./client.js";
import { runWithRequestContext } from "./request-context.js";
import { requireToolPolicy } from "./policies.js";

const context = {
  auth: {
    method: "local_api_key" as const,
    principal: "local",
    scopes: new Set<string>(),
    activeProfileId: "profile-vision",
  },
  credentials: { getAuthorization: async () => "Bearer ht_test" },
};

afterEach(() => vi.restoreAllMocks());

describe("compound Vision Health Metric MCP client", () => {
  it("lists and gets exams with the active profile", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } })
    );
    await runWithRequestContext(context, () => client.listVisionMetrics());
    await runWithRequestContext(context, () => client.getVisionMetric("exam-1"));
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/health-metrics/vision?profileId=profile-vision");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/health-metrics/vision/exam-1?profileId=profile-vision");
  });

  it("creates a cohesive exam and injects the active profile", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "exam-1" }), { status: 201, headers: { "content-type": "application/json" } })
    );
    await runWithRequestContext(context, () => client.createVisionMetric({
      examAt: "2026-07-17T13:22:00Z",
      refractions: [{ type: "FINAL_PRESCRIPTION", eyes: [{ eye: "OD", sphere: -1 }] }],
    }));
    const init = fetchMock.mock.calls[0][1];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      profileId: "profile-vision",
      examAt: "2026-07-17T13:22:00Z",
    });
  });

  it("passes optimistic version updates and profile-scoped deletes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200, headers: { "content-type": "application/json" } })
    );
    await runWithRequestContext(context, () => client.updateVisionMetric("exam-1", { version: 3, notes: "reviewed" }));
    await runWithRequestContext(context, () => client.deleteVisionMetric("exam-1"));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ version: 3, notes: "reviewed" });
    expect(fetchMock.mock.calls[1][1]?.method).toBe("DELETE");
    expect(String(fetchMock.mock.calls[1][0])).toContain("profileId=profile-vision");
  });

  it("assigns read, write, and destructive authorization policies", () => {
    expect(requireToolPolicy("list_vision_metrics")).toMatchObject({ impact: "read", requiredScopes: ["health:read"] });
    expect(requireToolPolicy("get_vision_metric")).toMatchObject({ impact: "read", requiredScopes: ["health:read"] });
    expect(requireToolPolicy("create_vision_metric")).toMatchObject({ impact: "write", requiredScopes: ["health:write"] });
    expect(requireToolPolicy("update_vision_metric")).toMatchObject({ impact: "write", requiredScopes: ["health:write"] });
    expect(requireToolPolicy("delete_vision_metric")).toMatchObject({ impact: "destructive", requiredScopes: ["health:destructive"], hostedEnabled: false });
  });
});
