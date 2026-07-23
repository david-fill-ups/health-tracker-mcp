import type { OperationPolicy, ToolDomain, ToolImpact } from "./auth.js";

const health = `list_profiles create_profile get_profile update_profile delete_profile switch_profile get_active_profile regenerate_calendar_token list_profile_access grant_profile_access update_profile_access revoke_profile_access export_profile import_profile list_relationships create_relationship update_relationship delete_relationship list_conditions create_condition get_condition update_condition delete_condition list_allergies create_allergy get_allergy update_allergy delete_allergy list_medications create_medication get_medication update_medication delete_medication list_medication_logs create_medication_log update_medication_log delete_medication_log list_visits create_visit get_visit update_visit delete_visit list_vaccinations create_vaccination_dose get_vaccination update_vaccination delete_vaccination get_dose update_dose delete_dose get_vaccine_recommendations check_travel_vaccines list_health_metrics create_health_metric get_health_metric update_health_metric delete_health_metric list_metric_types list_doctors create_doctor get_doctor update_doctor delete_doctor list_facilities create_facility get_facility update_facility delete_facility list_locations create_location get_location update_location delete_location list_insurance create_insurance get_insurance update_insurance delete_insurance list_portals create_portal get_portal update_portal delete_portal search_npi`.split(" ");
const genealogy = `list_family_members create_family_member get_family_member update_family_member delete_family_member list_family_conditions create_family_condition list_people create_person get_person update_person delete_person list_person_conditions create_person_condition update_person_condition delete_person_condition get_person_relationships get_person_family_graph create_person_relationship update_person_relationship delete_person_relationship propagate_relationships get_relationship_suggestions list_family_units create_family_unit get_family_unit update_family_unit delete_family_unit add_family_unit_member remove_family_unit_member replace_person list_external_identities create_external_identity update_external_identity delete_external_identity list_person_facts create_person_fact update_person_fact delete_person_fact sync_preview sync_apply list_providers wikitree_search wikitree_preview queue_wikitree_matching get_matching_queue search_wikitree_candidates link_wikitree_candidate reject_wikitree_candidate reset_wikitree_no_matches reset_wikitree_non_final start_wikitree_match_job drain_wikitree_match_job pause_wikitree_match_job resume_wikitree_match_job cancel_wikitree_match_job get_wikitree_match_job_status list_wikitree_match_jobs compare_wikitree_match_jobs`.split(" ");
const system = `onboard`.split(" ");

const destructive = new Set(`delete_profile regenerate_calendar_token grant_profile_access update_profile_access revoke_profile_access import_profile delete_relationship delete_condition delete_allergy delete_medication delete_medication_log delete_visit delete_vaccination delete_dose delete_health_metric delete_doctor delete_facility delete_location delete_insurance delete_portal delete_family_member delete_person delete_person_condition delete_person_relationship propagate_relationships delete_family_unit remove_family_unit_member replace_person delete_external_identity delete_person_fact sync_apply queue_wikitree_matching link_wikitree_candidate reject_wikitree_candidate reset_wikitree_no_matches reset_wikitree_non_final start_wikitree_match_job drain_wikitree_match_job pause_wikitree_match_job resume_wikitree_match_job cancel_wikitree_match_job`.split(" "));
const hostedDisabled = new Set([...destructive, "onboard"]);
const readPrefixes = ["list_", "get_", "search_", "check_", "compare_", "export_", "wikitree_search", "wikitree_preview", "sync_preview"];

function impactFor(name: string): ToolImpact {
  if (destructive.has(name)) return "destructive";
  if (name === "switch_profile" || name === "get_active_profile") return "read";
  return readPrefixes.some((prefix) => name.startsWith(prefix)) ? "read" : "write";
}

function addPolicies(target: Record<string, OperationPolicy>, names: string[], domain: ToolDomain): void {
  for (const name of names) {
    const impact = impactFor(name);
    target[name] = {
      domain,
      impact,
      requiredScopes: [`${domain}:${impact}`],
      hostedEnabled: !hostedDisabled.has(name),
    };
  }
}

export const TOOL_POLICIES: Readonly<Record<string, OperationPolicy>> = (() => {
  const policies: Record<string, OperationPolicy> = {};
  addPolicies(policies, health, "health");
  addPolicies(policies, genealogy, "genealogy");
  addPolicies(policies, system, "system");
  return Object.freeze(policies);
})();

export function requireToolPolicy(name: string): OperationPolicy {
  const policy = TOOL_POLICIES[name];
  if (!policy) throw new Error(`MCP tool '${name}' has no explicit authorization policy`);
  return policy;
}
