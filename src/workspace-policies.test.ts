import { describe, expect, it } from "vitest";
import { requireToolPolicy } from "./policies.js";

describe("integrated workspace policies", () => {
  it("classifies aggregate reads", () => {
    for (const name of ["get_health_summary", "get_health_timeline", "get_care_directory", "search_health", "get_visit_encounter"])
      expect(requireToolPolicy(name)).toMatchObject({ domain: "health", impact: "read" });
  });
  it("classifies irreversible and bulk changes", () => {
    for (const name of ["delete_symptom", "delete_preventive_care", "bulk_update_visits"])
      expect(requireToolPolicy(name)).toMatchObject({ domain: "health", impact: "destructive", hostedEnabled: false });
  });
  it("classifies creates and updates", () => {
    for (const name of ["create_health_task", "update_symptom", "create_metric_panel"])
      expect(requireToolPolicy(name)).toMatchObject({ domain: "health", impact: "write" });
  });
});
