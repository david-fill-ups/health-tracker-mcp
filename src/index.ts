import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as client from "./client.js";

const server = new McpServer({
  name: "health-tracker",
  version: "1.0.0",
});

// Helper: get profile ID, preferring explicit over active
function pid(explicit?: string): string {
  const id = explicit ?? client.getActiveProfileId();
  if (!id) throw new Error("No active profile. Use switch_profile first or provide a profileId.");
  return id;
}

// Helper: strip undefined values from an object
function clean(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// Helper: wrap tool handler result
function ok(data: unknown) {
  const text = data === undefined || data === null
    ? "Deleted successfully."
    : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

// ==========================================================================
// Profile Management
// ==========================================================================

server.tool(
  "list_profiles",
  "List all profiles the current user has access to (owned and shared).",
  {},
  async () => ok(await client.listProfiles()),
);

server.tool(
  "create_profile",
  "Create a new health profile.",
  {
    name: z.string().describe("Full name"),
    birthDate: z.string().describe("Birth date (YYYY-MM-DD)"),
    sex: z.string().describe("Sex (MALE, FEMALE, OTHER)"),
    state: z.string().optional().describe("US state abbreviation"),
    heightIn: z.number().optional().describe("Height in inches"),
    timezone: z.string().optional().describe("IANA timezone"),
    notes: z.string().optional().describe("Additional notes"),
  },
  async (args) => ok(await client.createProfile(args)),
);

server.tool(
  "get_profile",
  "Get details for a specific profile.",
  { profileId: z.string().describe("Profile ID") },
  async ({ profileId }) => ok(await client.getProfile(profileId)),
);

server.tool(
  "update_profile",
  "Update an existing profile's information.",
  {
    profileId: z.string().describe("Profile ID"),
    name: z.string().optional().describe("Full name"),
    birthDate: z.string().optional().describe("Birth date (YYYY-MM-DD)"),
    sex: z.string().optional().describe("Sex"),
    state: z.string().optional().describe("US state abbreviation"),
    heightIn: z.number().optional().describe("Height in inches"),
    timezone: z.string().optional().describe("IANA timezone"),
    notes: z.string().optional().describe("Additional notes"),
  },
  async ({ profileId, ...rest }) => ok(await client.updateProfile(profileId, clean(rest))),
);

server.tool(
  "delete_profile",
  "Permanently delete a profile and all its data.",
  { profileId: z.string().describe("Profile ID") },
  async ({ profileId }) => ok(await client.deleteProfile(profileId)),
);

server.tool(
  "switch_profile",
  "Set the active profile for subsequent calls. Most tools operate on the active profile.",
  { profileId: z.string().describe("Profile ID to make active") },
  async ({ profileId }) => {
    client.setActiveProfileId(profileId);
    return ok({ activeProfileId: profileId });
  },
);

server.tool(
  "get_active_profile",
  "Return the currently active profile ID.",
  {},
  async () => ok({ activeProfileId: client.getActiveProfileId() }),
);

server.tool(
  "regenerate_calendar_token",
  "Regenerate the calendar subscription token for a profile.",
  { profileId: z.string().describe("Profile ID") },
  async ({ profileId }) => ok(await client.regenerateCalendarToken(profileId)),
);

// ==========================================================================
// Profile Access
// ==========================================================================

server.tool(
  "list_profile_access",
  "List users with access and pending invitations for a profile.",
  { profileId: z.string().describe("Profile ID") },
  async ({ profileId }) => ok(await client.listProfileAccess(profileId)),
);

server.tool(
  "grant_profile_access",
  "Invite a user to access a profile.",
  {
    profileId: z.string().describe("Profile ID"),
    email: z.string().describe("Email of user to invite"),
    permission: z.enum(["READ_ONLY", "WRITE", "OWNER"]).describe("Permission level"),
  },
  async ({ profileId, email, permission }) =>
    ok(await client.grantProfileAccess(profileId, { email, permission })),
);

server.tool(
  "update_profile_access",
  "Update a user's permission level on a profile.",
  {
    profileId: z.string().describe("Profile ID"),
    userId: z.string().describe("User ID to update"),
    permission: z.enum(["READ_ONLY", "WRITE", "OWNER"]).describe("New permission level"),
  },
  async ({ profileId, userId, permission }) =>
    ok(await client.updateProfileAccess(profileId, userId, { permission })),
);

server.tool(
  "revoke_profile_access",
  "Remove a user's access to a profile.",
  {
    profileId: z.string().describe("Profile ID"),
    userId: z.string().describe("User ID to revoke"),
  },
  async ({ profileId, userId }) => ok(await client.revokeProfileAccess(profileId, userId)),
);

// ==========================================================================
// Export / Import
// ==========================================================================

server.tool(
  "export_profile",
  "Export all data for a profile as JSON.",
  { profileId: z.string().describe("Profile ID") },
  async ({ profileId }) => ok(await client.exportProfile(profileId)),
);

server.tool(
  "import_profile",
  "Import data into a profile.",
  {
    profileId: z.string().describe("Profile ID"),
    mode: z.enum(["append", "skip_duplicates", "replace"]).describe("Import strategy"),
    data: z.record(z.unknown()).describe("Data object to import"),
  },
  async ({ profileId, mode, data }) =>
    ok(await client.importProfile(profileId, { mode, data })),
);

// ==========================================================================
// Profile Relationships
// ==========================================================================

server.tool(
  "list_relationships",
  "[Deprecated: use person relationships] List profile-to-profile relationships. Uses the active profile.",
  {
    includeInherited: z.string().optional().describe("Include inherited relationships (true/false)"),
  },
  async (args) => ok(await client.listRelationships(clean(args) as { includeInherited?: string })),
);

server.tool(
  "create_relationship",
  "[Deprecated: use create_person_relationship] Create a relationship between two profiles.",
  {
    toProfileId: z.string().describe("Target profile ID"),
    relationship: z.string().describe("Relationship type"),
    biological: z.boolean().optional().describe("Whether the relationship is biological"),
  },
  async ({ toProfileId, relationship, biological }) =>
    ok(
      await client.createRelationship({
        profileId: pid(),
        toProfileId,
        relationship,
        biological,
      }),
    ),
);

server.tool(
  "update_relationship",
  "[Deprecated: use update_person_relationship] Update an existing relationship.",
  {
    id: z.string().describe("Relationship ID"),
    relationship: z.string().optional().describe("Relationship type"),
    biological: z.boolean().optional().describe("Whether the relationship is biological"),
  },
  async ({ id, ...rest }) => ok(await client.updateRelationship(id, clean(rest))),
);

server.tool(
  "delete_relationship",
  "[Deprecated: use delete_person_relationship] Delete a relationship.",
  { id: z.string().describe("Relationship ID") },
  async ({ id }) => ok(await client.deleteRelationship(id)),
);

// ==========================================================================
// Conditions
// ==========================================================================

server.tool(
  "list_conditions",
  "List all medical conditions for the active profile.",
  {},
  async () => ok(await client.listConditions()),
);

server.tool(
  "create_condition",
  "Add a medical condition to the active profile.",
  {
    name: z.string().describe("Condition name"),
    diagnosisDate: z.string().optional().describe("Date of diagnosis (YYYY-MM-DD)"),
    status: z.enum(["ACTIVE", "RESOLVED", "MONITORING", "BENIGN"]).optional().describe("Condition status"),
    notes: z.string().optional().describe("Notes"),
  },
  async (args) =>
    ok(await client.createCondition({ profileId: pid(), ...args })),
);

server.tool(
  "get_condition",
  "Get details for a specific condition.",
  { id: z.string().describe("Condition ID") },
  async ({ id }) => ok(await client.getCondition(id)),
);

server.tool(
  "update_condition",
  "Update a condition.",
  {
    id: z.string().describe("Condition ID"),
    name: z.string().optional().describe("Condition name"),
    diagnosisDate: z.string().optional().describe("Date of diagnosis"),
    status: z.enum(["ACTIVE", "RESOLVED", "MONITORING", "BENIGN"]).optional().describe("Condition status"),
    notes: z.string().optional().describe("Notes"),
  },
  async ({ id, ...rest }) => ok(await client.updateCondition(id, clean(rest))),
);

server.tool(
  "delete_condition",
  "Delete a condition from the active profile.",
  { id: z.string().describe("Condition ID") },
  async ({ id }) => ok(await client.deleteCondition(id)),
);

// ==========================================================================
// Allergies
// ==========================================================================

server.tool(
  "list_allergies",
  "List all allergies for the active profile.",
  {},
  async () => ok(await client.listAllergies()),
);

server.tool(
  "create_allergy",
  "Add an allergy to the active profile.",
  {
    allergen: z.string().describe("Allergen name"),
    category: z.string().optional().describe("Category of allergy"),
    diagnosisDate: z.string().optional().describe("Diagnosis date (YYYY-MM-DD)"),
    whealSize: z.number().optional().describe("Wheal size in mm (for skin prick tests)"),
    notes: z.string().optional().describe("Notes"),
  },
  async (args) =>
    ok(await client.createAllergy({ profileId: pid(), ...args })),
);

server.tool(
  "get_allergy",
  "Get details for a specific allergy.",
  { id: z.string().describe("Allergy ID") },
  async ({ id }) => ok(await client.getAllergy(id)),
);

server.tool(
  "update_allergy",
  "Update an allergy record.",
  {
    id: z.string().describe("Allergy ID"),
    allergen: z.string().optional().describe("Allergen name"),
    category: z.string().optional().describe("Category"),
    diagnosisDate: z.string().optional().describe("Diagnosis date"),
    whealSize: z.number().optional().describe("Wheal size in mm"),
    notes: z.string().optional().describe("Notes"),
  },
  async ({ id, ...rest }) => ok(await client.updateAllergy(id, clean(rest))),
);

server.tool(
  "delete_allergy",
  "Delete an allergy from the active profile.",
  { id: z.string().describe("Allergy ID") },
  async ({ id }) => ok(await client.deleteAllergy(id)),
);

// ==========================================================================
// Medications
// ==========================================================================

server.tool(
  "list_medications",
  "List all medications for the active profile.",
  {},
  async () => ok(await client.listMedications()),
);

server.tool(
  "create_medication",
  "Add a medication to the active profile.",
  {
    name: z.string().describe("Medication name"),
    medicationType: z.enum(["ORAL", "INJECTABLE", "TOPICAL", "INHALER", "SUPPLEMENT", "DEVICE", "OTHER"]).optional().describe("Type of medication"),
    dosage: z.string().optional().describe("Dosage (e.g. '10mg')"),
    frequency: z.string().optional().describe("How often taken (e.g. 'twice daily')"),
    prescribingDoctorId: z.string().optional().describe("Doctor ID who prescribed"),
    startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
    endDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
    instructions: z.string().optional().describe("Special instructions"),
    active: z.boolean().optional().describe("Whether currently active"),
  },
  async (args) =>
    ok(await client.createMedication({ profileId: pid(), ...args })),
);

server.tool(
  "get_medication",
  "Get details for a specific medication.",
  { id: z.string().describe("Medication ID") },
  async ({ id }) => ok(await client.getMedication(id)),
);

server.tool(
  "update_medication",
  "Update a medication record.",
  {
    id: z.string().describe("Medication ID"),
    name: z.string().optional().describe("Medication name"),
    medicationType: z.enum(["ORAL", "INJECTABLE", "TOPICAL", "INHALER", "SUPPLEMENT", "DEVICE", "OTHER"]).optional().describe("Type"),
    dosage: z.string().optional().describe("Dosage"),
    frequency: z.string().optional().describe("Frequency"),
    prescribingDoctorId: z.string().optional().describe("Doctor ID"),
    startDate: z.string().optional().describe("Start date"),
    endDate: z.string().optional().describe("End date"),
    instructions: z.string().optional().describe("Instructions"),
    active: z.boolean().optional().describe("Active status"),
  },
  async ({ id, ...rest }) => ok(await client.updateMedication(id, clean(rest))),
);

server.tool(
  "delete_medication",
  "Delete a medication from the active profile.",
  { id: z.string().describe("Medication ID") },
  async ({ id }) => ok(await client.deleteMedication(id)),
);

// ==========================================================================
// Medication Logs
// ==========================================================================

server.tool(
  "list_medication_logs",
  "List administration logs for a medication.",
  {
    medicationId: z.string().describe("Medication ID"),
    limit: z.string().optional().describe("Max results to return"),
    cursor: z.string().optional().describe("Pagination cursor"),
  },
  async ({ medicationId, limit, cursor }) =>
    ok(await client.listMedicationLogs(medicationId, clean({ limit, cursor }) as { limit?: string; cursor?: string })),
);

server.tool(
  "create_medication_log",
  "Log an administration event for a medication.",
  {
    medicationId: z.string().describe("Medication ID"),
    date: z.string().describe("Date/time administered (ISO 8601)"),
    dosage: z.string().optional().describe("Dosage given"),
    unit: z.string().optional().describe("Unit of dosage"),
    injectionSite: z.string().optional().describe("Injection site (for injectables)"),
    notes: z.string().optional().describe("Notes"),
  },
  async ({ medicationId, ...rest }) =>
    ok(await client.createMedicationLog(medicationId, { profileId: pid(), ...rest })),
);

server.tool(
  "update_medication_log",
  "Update a medication log entry.",
  {
    medicationId: z.string().describe("Medication ID"),
    logId: z.string().describe("Log entry ID"),
    date: z.string().optional().describe("Date/time"),
    dosage: z.string().optional().describe("Dosage"),
    unit: z.string().optional().describe("Unit"),
    injectionSite: z.string().optional().describe("Injection site"),
    notes: z.string().optional().describe("Notes"),
  },
  async ({ medicationId, logId, ...rest }) =>
    ok(await client.updateMedicationLog(medicationId, logId, clean(rest))),
);

server.tool(
  "delete_medication_log",
  "Delete a medication log entry.",
  {
    medicationId: z.string().describe("Medication ID"),
    logId: z.string().describe("Log entry ID"),
  },
  async ({ medicationId, logId }) =>
    ok(await client.deleteMedicationLog(medicationId, logId)),
);

// ==========================================================================
// Visits
// ==========================================================================

server.tool(
  "list_visits",
  "List visits/appointments for the active profile.",
  {
    limit: z.string().optional().describe("Max results"),
    cursor: z.string().optional().describe("Pagination cursor"),
  },
  async (args) => ok(await client.listVisits(clean(args) as { limit?: string; cursor?: string })),
);

server.tool(
  "create_visit",
  "Create a visit or appointment for the active profile.",
  {
    doctorId: z.string().optional().describe("Doctor ID"),
    facilityId: z.string().optional().describe("Facility ID"),
    locationId: z.string().optional().describe("Location ID"),
    date: z.string().optional().describe("Visit date (ISO 8601)"),
    dueMonth: z.string().optional().describe("Due month (YYYY-MM) for future visits without a specific date"),
    type: z.enum(["ROUTINE", "LAB", "SPECIALIST", "URGENT", "TELEHEALTH", "PROCEDURE", "OTHER"]).optional().describe("Visit type"),
    reason: z.string().optional().describe("Reason for visit"),
    specialty: z.string().optional().describe("Medical specialty"),
    notes: z.string().optional().describe("Notes"),
    documentUrl: z.string().optional().describe("URL to visit document/summary"),
    status: z.enum(["PENDING", "SCHEDULED", "COMPLETED", "CANCELLED"]).optional().describe("Visit status"),
  },
  async (args) =>
    ok(await client.createVisit({ profileId: pid(), ...args })),
);

server.tool(
  "get_visit",
  "Get details for a specific visit.",
  { id: z.string().describe("Visit ID") },
  async ({ id }) => ok(await client.getVisit(id)),
);

server.tool(
  "update_visit",
  "Update a visit record.",
  {
    id: z.string().describe("Visit ID"),
    doctorId: z.string().optional().describe("Doctor ID"),
    facilityId: z.string().optional().describe("Facility ID"),
    locationId: z.string().optional().describe("Location ID"),
    date: z.string().optional().describe("Visit date"),
    dueMonth: z.string().optional().describe("Due month"),
    type: z.enum(["ROUTINE", "LAB", "SPECIALIST", "URGENT", "TELEHEALTH", "PROCEDURE", "OTHER"]).optional().describe("Visit type"),
    reason: z.string().optional().describe("Reason"),
    specialty: z.string().optional().describe("Specialty"),
    notes: z.string().optional().describe("Notes"),
    documentUrl: z.string().optional().describe("Document URL"),
    status: z.enum(["PENDING", "SCHEDULED", "COMPLETED", "CANCELLED"]).optional().describe("Status"),
  },
  async ({ id, ...rest }) => ok(await client.updateVisit(id, clean(rest))),
);

server.tool(
  "delete_visit",
  "Delete a visit from the active profile.",
  { id: z.string().describe("Visit ID") },
  async ({ id }) => ok(await client.deleteVisit(id)),
);

// ==========================================================================
// Vaccinations
// ==========================================================================

server.tool(
  "list_vaccinations",
  "List all vaccinations for the active profile.",
  {},
  async () => ok(await client.listVaccinations()),
);

server.tool(
  "create_vaccination_dose",
  "Record a vaccination dose for the active profile. Multiple vaccine names can be given if administered at the same time.",
  {
    vaccinationNames: z.array(z.string()).describe("Vaccine name(s) administered"),
    date: z.string().describe("Date administered (YYYY-MM-DD)"),
    source: z.enum(["ADMINISTERED", "NATURAL", "DECLINED"]).optional().describe("How the vaccination was sourced"),
    facilityId: z.string().optional().describe("Facility ID where administered"),
    lotNumber: z.string().optional().describe("Vaccine lot number"),
    notes: z.string().optional().describe("Notes"),
  },
  async (args) =>
    ok(await client.createVaccinationDose({ profileId: pid(), ...args })),
);

server.tool(
  "get_vaccination",
  "Get details for a specific vaccination record.",
  { id: z.string().describe("Vaccination ID") },
  async ({ id }) => ok(await client.getVaccination(id)),
);

server.tool(
  "update_vaccination",
  "Update a vaccination record (name, aliases, notes).",
  {
    id: z.string().describe("Vaccination ID"),
    name: z.string().optional().describe("Vaccine name"),
    aliases: z.array(z.string()).optional().describe("Alternative names"),
    notes: z.string().optional().describe("Notes"),
  },
  async ({ id, ...rest }) => ok(await client.updateVaccination(id, clean(rest))),
);

server.tool(
  "delete_vaccination",
  "Delete a vaccination record.",
  { id: z.string().describe("Vaccination ID") },
  async ({ id }) => ok(await client.deleteVaccination(id)),
);

// ==========================================================================
// Vaccination Doses
// ==========================================================================

server.tool(
  "get_dose",
  "Get details for a specific vaccination dose.",
  { id: z.string().describe("Dose ID") },
  async ({ id }) => ok(await client.getDose(id)),
);

server.tool(
  "update_dose",
  "Update a vaccination dose record.",
  {
    id: z.string().describe("Dose ID"),
    name: z.string().optional().describe("Dose name"),
    date: z.string().optional().describe("Date administered"),
    source: z.enum(["ADMINISTERED", "NATURAL", "DECLINED"]).optional().describe("Source"),
    facilityId: z.string().optional().describe("Facility ID"),
    lotNumber: z.string().optional().describe("Lot number"),
    notes: z.string().optional().describe("Notes"),
  },
  async ({ id, ...rest }) => ok(await client.updateDose(id, clean(rest))),
);

server.tool(
  "delete_dose",
  "Delete a vaccination dose.",
  { id: z.string().describe("Dose ID") },
  async ({ id }) => ok(await client.deleteDose(id)),
);

// ==========================================================================
// Vaccination Recommendations
// ==========================================================================

server.tool(
  "get_vaccine_recommendations",
  "Get personalized vaccine recommendations based on the active profile's age, conditions, and history.",
  {},
  async () => ok(await client.getVaccineRecommendations()),
);

server.tool(
  "check_travel_vaccines",
  "Check recommended vaccinations for travel to a specific destination.",
  { destination: z.string().describe("Travel destination country or region") },
  async ({ destination }) =>
    ok(await client.checkTravelVaccines({ profileId: pid(), destination })),
);

// ==========================================================================
// Health Metrics
// ==========================================================================

server.tool(
  "list_health_metrics",
  "List health metrics (weight, blood pressure, etc.) for the active profile.",
  {
    metricType: z.string().optional().describe("Filter by metric type"),
    limit: z.string().optional().describe("Max results"),
    cursor: z.string().optional().describe("Pagination cursor"),
  },
  async (args) =>
    ok(await client.listHealthMetrics(clean(args) as { metricType?: string; limit?: string; cursor?: string })),
);

server.tool(
  "create_health_metric",
  "Record a health metric measurement for the active profile.",
  {
    metricType: z.string().describe("Type of metric (e.g. WEIGHT, BLOOD_PRESSURE, HEART_RATE)"),
    value: z.number().describe("Measured value"),
    unit: z.string().describe("Unit of measurement (e.g. lbs, mmHg, bpm)"),
    measuredAt: z.string().describe("When the measurement was taken (ISO 8601)"),
    notes: z.string().optional().describe("Notes"),
  },
  async (args) =>
    ok(await client.createHealthMetric({ profileId: pid(), ...args })),
);

server.tool(
  "get_health_metric",
  "Get details for a specific health metric entry.",
  { id: z.string().describe("Health metric ID") },
  async ({ id }) => ok(await client.getHealthMetric(id)),
);

server.tool(
  "update_health_metric",
  "Update a health metric entry.",
  {
    id: z.string().describe("Health metric ID"),
    metricType: z.string().optional().describe("Metric type"),
    value: z.number().optional().describe("Value"),
    unit: z.string().optional().describe("Unit"),
    measuredAt: z.string().optional().describe("Measurement time"),
    notes: z.string().optional().describe("Notes"),
  },
  async ({ id, ...rest }) => ok(await client.updateHealthMetric(id, clean(rest))),
);

server.tool(
  "delete_health_metric",
  "Delete a health metric entry.",
  { id: z.string().describe("Health metric ID") },
  async ({ id }) => ok(await client.deleteHealthMetric(id)),
);

server.tool(
  "list_metric_types",
  "List distinct metric types that have been recorded for the active profile.",
  {},
  async () => ok(await client.listDistinctMetricTypes()),
);

// ==========================================================================
// Doctors
// ==========================================================================

server.tool(
  "list_doctors",
  "List all doctors associated with the active profile.",
  {},
  async () => ok(await client.listDoctors()),
);

server.tool(
  "create_doctor",
  "Add a doctor to the active profile.",
  {
    name: z.string().describe("Doctor's full name"),
    specialty: z.string().optional().describe("Medical specialty"),
    facilityId: z.string().optional().describe("Primary facility ID"),
    primaryLocationId: z.string().optional().describe("Primary location ID"),
    npiNumber: z.string().optional().describe("NPI number"),
    credential: z.string().optional().describe("Credential (e.g. MD, DO)"),
    photo: z.string().optional().describe("Photo URL"),
    rating: z.number().optional().describe("Rating (1-5)"),
    websiteUrl: z.string().optional().describe("Website URL"),
    portalUrl: z.string().optional().describe("Patient portal URL"),
    phone: z.string().optional().describe("Phone number"),
    notes: z.string().optional().describe("Notes"),
  },
  async (args) => ok(await client.createDoctor(clean(args))),
);

server.tool(
  "get_doctor",
  "Get details for a specific doctor.",
  { id: z.string().describe("Doctor ID") },
  async ({ id }) => ok(await client.getDoctor(id)),
);

server.tool(
  "update_doctor",
  "Update a doctor's information.",
  {
    id: z.string().describe("Doctor ID"),
    name: z.string().optional().describe("Name"),
    specialty: z.string().optional().describe("Specialty"),
    facilityId: z.string().optional().describe("Facility ID"),
    primaryLocationId: z.string().optional().describe("Primary location ID"),
    npiNumber: z.string().optional().describe("NPI number"),
    credential: z.string().optional().describe("Credential"),
    photo: z.string().optional().describe("Photo URL"),
    rating: z.number().optional().describe("Rating"),
    websiteUrl: z.string().optional().describe("Website URL"),
    portalUrl: z.string().optional().describe("Portal URL"),
    phone: z.string().optional().describe("Phone"),
    notes: z.string().optional().describe("Notes"),
  },
  async ({ id, ...rest }) => ok(await client.updateDoctor(id, clean(rest))),
);

server.tool(
  "delete_doctor",
  "Remove a doctor from the active profile.",
  { id: z.string().describe("Doctor ID") },
  async ({ id }) => ok(await client.deleteDoctor(id)),
);

// ==========================================================================
// Facilities
// ==========================================================================

server.tool(
  "list_facilities",
  "List all medical facilities associated with the active profile.",
  {},
  async () => ok(await client.listFacilities()),
);

server.tool(
  "create_facility",
  "Add a medical facility to the active profile.",
  {
    name: z.string().describe("Facility name"),
    type: z.string().optional().describe("Facility type"),
    npiNumber: z.string().optional().describe("NPI number"),
    rating: z.number().optional().describe("Rating (1-5)"),
    websiteUrl: z.string().optional().describe("Website URL"),
    portalUrl: z.string().optional().describe("Patient portal URL"),
    phone: z.string().optional().describe("Phone number"),
    notes: z.string().optional().describe("Notes"),
  },
  async (args) => ok(await client.createFacility(clean(args))),
);

server.tool(
  "get_facility",
  "Get details for a specific facility.",
  { id: z.string().describe("Facility ID") },
  async ({ id }) => ok(await client.getFacility(id)),
);

server.tool(
  "update_facility",
  "Update a facility's information.",
  {
    id: z.string().describe("Facility ID"),
    name: z.string().optional().describe("Name"),
    type: z.string().optional().describe("Type"),
    npiNumber: z.string().optional().describe("NPI number"),
    rating: z.number().optional().describe("Rating"),
    websiteUrl: z.string().optional().describe("Website URL"),
    portalUrl: z.string().optional().describe("Portal URL"),
    phone: z.string().optional().describe("Phone"),
    notes: z.string().optional().describe("Notes"),
  },
  async ({ id, ...rest }) => ok(await client.updateFacility(id, clean(rest))),
);

server.tool(
  "delete_facility",
  "Remove a facility from the active profile.",
  { id: z.string().describe("Facility ID") },
  async ({ id }) => ok(await client.deleteFacility(id)),
);

// ==========================================================================
// Locations
// ==========================================================================

server.tool(
  "list_locations",
  "List all locations for a facility.",
  { facilityId: z.string().describe("Facility ID") },
  async ({ facilityId }) => ok(await client.listLocations(facilityId)),
);

server.tool(
  "create_location",
  "Add a location to a facility.",
  {
    facilityId: z.string().describe("Facility ID"),
    name: z.string().describe("Location name"),
    address1: z.string().optional().describe("Street address line 1"),
    address2: z.string().optional().describe("Street address line 2"),
    city: z.string().optional().describe("City"),
    state: z.string().optional().describe("State abbreviation"),
    zip: z.string().optional().describe("ZIP code"),
    phone: z.string().optional().describe("Phone number"),
  },
  async ({ facilityId, ...rest }) =>
    ok(await client.createLocation(facilityId, clean(rest))),
);

server.tool(
  "get_location",
  "Get details for a specific location.",
  { id: z.string().describe("Location ID") },
  async ({ id }) => ok(await client.getLocation(id)),
);

server.tool(
  "update_location",
  "Update a location's information.",
  {
    id: z.string().describe("Location ID"),
    facilityId: z.string().describe("Facility ID"),
    name: z.string().optional().describe("Location name"),
    address1: z.string().optional().describe("Street address line 1"),
    address2: z.string().optional().describe("Street address line 2"),
    city: z.string().optional().describe("City"),
    state: z.string().optional().describe("State"),
    zip: z.string().optional().describe("ZIP code"),
    phone: z.string().optional().describe("Phone"),
  },
  async ({ id, facilityId, ...rest }) =>
    ok(await client.updateLocation(id, facilityId, clean(rest))),
);

server.tool(
  "delete_location",
  "Delete a location.",
  {
    id: z.string().describe("Location ID"),
    facilityId: z.string().describe("Facility ID"),
  },
  async ({ id, facilityId }) => ok(await client.deleteLocation(id, facilityId)),
);

// ==========================================================================
// Insurance
// ==========================================================================

server.tool(
  "list_insurance",
  "List all insurance policies for the active profile.",
  {},
  async () => ok(await client.listInsurance()),
);

server.tool(
  "create_insurance",
  "Add an insurance policy to the active profile.",
  {
    type: z.enum(["HEALTH", "DENTAL", "VISION", "PRESCRIPTION", "HSA", "FSA", "HRA", "OTHER"]).describe("Insurance type"),
    status: z.enum(["ACTIVE", "INACTIVE", "EXPIRED"]).optional().describe("Policy status"),
    insurerName: z.string().optional().describe("Insurance company name"),
    planName: z.string().optional().describe("Plan name"),
    policyHolder: z.string().optional().describe("Policy holder name"),
    memberId: z.string().optional().describe("Member ID"),
    groupNumber: z.string().optional().describe("Group number"),
    rxBIN: z.string().optional().describe("Rx BIN"),
    rxPCN: z.string().optional().describe("Rx PCN"),
    rxGroup: z.string().optional().describe("Rx Group"),
    cardLastFour: z.string().optional().describe("Last 4 digits of card"),
    cardNetwork: z.string().optional().describe("Card network (e.g. Visa)"),
    phone: z.string().optional().describe("Customer service phone"),
    website: z.string().optional().describe("Insurer website"),
    effectiveDate: z.string().optional().describe("Effective date (YYYY-MM-DD)"),
    expirationDate: z.string().optional().describe("Expiration date (YYYY-MM-DD)"),
    frontImageData: z.string().optional().describe("Front card image (base64)"),
    backImageData: z.string().optional().describe("Back card image (base64)"),
    notes: z.string().optional().describe("Notes"),
  },
  async (args) =>
    ok(await client.createInsurance({ profileId: pid(), ...args })),
);

server.tool(
  "get_insurance",
  "Get details for a specific insurance policy.",
  { id: z.string().describe("Insurance ID") },
  async ({ id }) => ok(await client.getInsurance(id)),
);

server.tool(
  "update_insurance",
  "Update an insurance policy.",
  {
    id: z.string().describe("Insurance ID"),
    type: z.enum(["HEALTH", "DENTAL", "VISION", "PRESCRIPTION", "HSA", "FSA", "HRA", "OTHER"]).optional().describe("Type"),
    status: z.enum(["ACTIVE", "INACTIVE", "EXPIRED"]).optional().describe("Status"),
    insurerName: z.string().optional().describe("Insurer name"),
    planName: z.string().optional().describe("Plan name"),
    policyHolder: z.string().optional().describe("Policy holder"),
    memberId: z.string().optional().describe("Member ID"),
    groupNumber: z.string().optional().describe("Group number"),
    rxBIN: z.string().optional().describe("Rx BIN"),
    rxPCN: z.string().optional().describe("Rx PCN"),
    rxGroup: z.string().optional().describe("Rx Group"),
    cardLastFour: z.string().optional().describe("Card last 4"),
    cardNetwork: z.string().optional().describe("Card network"),
    phone: z.string().optional().describe("Phone"),
    website: z.string().optional().describe("Website"),
    effectiveDate: z.string().optional().describe("Effective date"),
    expirationDate: z.string().optional().describe("Expiration date"),
    frontImageData: z.string().optional().describe("Front image (base64)"),
    backImageData: z.string().optional().describe("Back image (base64)"),
    notes: z.string().optional().describe("Notes"),
  },
  async ({ id, ...rest }) => ok(await client.updateInsurance(id, clean(rest))),
);

server.tool(
  "delete_insurance",
  "Delete an insurance policy from the active profile.",
  { id: z.string().describe("Insurance ID") },
  async ({ id }) => ok(await client.deleteInsurance(id)),
);

// ==========================================================================
// Portals
// ==========================================================================

server.tool(
  "list_portals",
  "List all patient portals for the active profile.",
  {},
  async () => ok(await client.listPortals()),
);

server.tool(
  "create_portal",
  "Add a patient portal to the active profile.",
  {
    name: z.string().describe("Portal name"),
    organization: z.string().optional().describe("Organization name"),
    url: z.string().describe("Portal URL"),
    facilityId: z.string().optional().describe("Associated facility ID"),
    notes: z.string().optional().describe("Notes"),
  },
  async (args) =>
    ok(await client.createPortal({ profileId: pid(), ...args })),
);

server.tool(
  "get_portal",
  "Get details for a specific portal.",
  { id: z.string().describe("Portal ID") },
  async ({ id }) => ok(await client.getPortal(id)),
);

server.tool(
  "update_portal",
  "Update a patient portal.",
  {
    id: z.string().describe("Portal ID"),
    name: z.string().optional().describe("Name"),
    organization: z.string().optional().describe("Organization"),
    url: z.string().optional().describe("URL"),
    facilityId: z.string().optional().describe("Facility ID"),
    notes: z.string().optional().describe("Notes"),
  },
  async ({ id, ...rest }) => ok(await client.updatePortal(id, clean(rest))),
);

server.tool(
  "delete_portal",
  "Delete a patient portal from the active profile.",
  { id: z.string().describe("Portal ID") },
  async ({ id }) => ok(await client.deletePortal(id)),
);

// ==========================================================================
// Family Members (deprecated — use Person tools below)
// ==========================================================================

server.tool(
  "list_family_members",
  "[Deprecated: use list_people] List all family members in the active profile's family history.",
  {},
  async () => ok(await client.listFamilyMembers()),
);

server.tool(
  "create_family_member",
  "[Deprecated: use create_person] Add a family member to the active profile's family history.",
  {
    name: z.string().describe("Family member's name"),
    relationship: z.enum([
      "MOTHER", "FATHER", "SISTER", "BROTHER",
      "GRANDMOTHER", "GRANDFATHER", "AUNT", "UNCLE",
      "HALF_BROTHER", "HALF_SISTER", "SON", "DAUGHTER",
      "STEP_FATHER", "STEP_MOTHER", "STEP_BROTHER", "STEP_SISTER",
      "STEP_SON", "STEP_DAUGHTER",
      "FATHER_IN_LAW", "MOTHER_IN_LAW", "BROTHER_IN_LAW", "SISTER_IN_LAW",
      "SON_IN_LAW", "DAUGHTER_IN_LAW",
      "SPOUSE", "OTHER",
    ]).describe("Relationship to the profile"),
    side: z.enum(["MATERNAL", "PATERNAL"]).optional().describe("Side of family (for grandparents, aunts, uncles)"),
    biological: z.boolean().optional().describe("Whether this is a biological relationship (default true). Non-biological members' conditions are not surfaced in medical family history."),
    dateOfBirth: z.string().optional().describe("Date of birth (YYYY-MM-DD)"),
    dateOfDeath: z.string().optional().describe("Date of death (YYYY-MM-DD)"),
    causeOfDeath: z.string().optional().describe("Cause of death"),
    notes: z.string().optional().describe("Notes"),
    imageData: z.string().optional().describe("Photo (base64)"),
  },
  async (args) =>
    ok(await client.createFamilyMember({ profileId: pid(), ...args })),
);

server.tool(
  "get_family_member",
  "[Deprecated: use get_person] Get details for a specific family member.",
  { id: z.string().describe("Family member ID") },
  async ({ id }) => ok(await client.getFamilyMember(id)),
);

server.tool(
  "update_family_member",
  "[Deprecated: use update_person] Update a family member's information.",
  {
    id: z.string().describe("Family member ID"),
    name: z.string().optional().describe("Name"),
    relationship: z.enum([
      "MOTHER", "FATHER", "SISTER", "BROTHER",
      "GRANDMOTHER", "GRANDFATHER", "AUNT", "UNCLE",
      "HALF_BROTHER", "HALF_SISTER", "SON", "DAUGHTER",
      "STEP_FATHER", "STEP_MOTHER", "STEP_BROTHER", "STEP_SISTER",
      "STEP_SON", "STEP_DAUGHTER",
      "FATHER_IN_LAW", "MOTHER_IN_LAW", "BROTHER_IN_LAW", "SISTER_IN_LAW",
      "SON_IN_LAW", "DAUGHTER_IN_LAW",
      "SPOUSE", "OTHER",
    ]).optional().describe("Relationship"),
    side: z.enum(["MATERNAL", "PATERNAL"]).optional().describe("Side"),
    biological: z.boolean().optional().describe("Whether this is a biological relationship"),
    dateOfBirth: z.string().optional().describe("Date of birth"),
    dateOfDeath: z.string().optional().describe("Date of death"),
    causeOfDeath: z.string().optional().describe("Cause of death"),
    notes: z.string().optional().describe("Notes"),
    imageData: z.string().optional().describe("Photo (base64)"),
  },
  async ({ id, ...rest }) => ok(await client.updateFamilyMember(id, clean(rest))),
);

server.tool(
  "delete_family_member",
  "[Deprecated: use delete_person] Remove a family member from the active profile's history.",
  { id: z.string().describe("Family member ID") },
  async ({ id }) => ok(await client.deleteFamilyMember(id)),
);

server.tool(
  "list_family_conditions",
  "[Deprecated: use list_person_conditions] List medical conditions for a family member.",
  { familyMemberId: z.string().describe("Family member ID") },
  async ({ familyMemberId }) => ok(await client.listFamilyConditions(familyMemberId)),
);

server.tool(
  "create_family_condition",
  "[Deprecated: use create_person_condition] Add a medical condition to a family member's record.",
  {
    familyMemberId: z.string().describe("Family member ID"),
    name: z.string().describe("Condition name"),
    notes: z.string().optional().describe("Notes"),
  },
  async ({ familyMemberId, name, notes }) =>
    ok(
      await client.createFamilyCondition(familyMemberId, {
        profileId: pid(),
        name,
        notes,
      }),
    ),
);

// ==========================================================================
// Persons (unified identity model — replaces Family Members)
// ==========================================================================

const RELATIONSHIP_TYPES = [
  "FATHER", "MOTHER", "SON", "DAUGHTER", "BROTHER", "SISTER",
  "HALF_BROTHER", "HALF_SISTER", "GRANDFATHER", "GRANDMOTHER",
  "GRANDSON", "GRANDDAUGHTER", "AUNT", "UNCLE", "NIECE", "NEPHEW",
  "COUSIN", "SPOUSE",
  "STEP_FATHER", "STEP_MOTHER", "STEP_SON", "STEP_DAUGHTER",
  "STEP_BROTHER", "STEP_SISTER",
  "FATHER_IN_LAW", "MOTHER_IN_LAW", "SON_IN_LAW", "DAUGHTER_IN_LAW",
  "BROTHER_IN_LAW", "SISTER_IN_LAW",
  "OTHER",
] as const;

server.tool(
  "list_people",
  "List all persons (family members and linked profiles) for the active profile.",
  {},
  async () => ok(await client.listPersons()),
);

server.tool(
  "create_person",
  "Create a person in the family tree. Optionally creates a relationship to the active profile's person.",
  {
    name: z.string().describe("Person's name"),
    sex: z.enum(["MALE", "FEMALE", "OTHER"]).optional().describe("Sex"),
    dateOfBirth: z.string().optional().describe("Date of birth (YYYY-MM-DD)"),
    dateOfDeath: z.string().optional().describe("Date of death (YYYY-MM-DD)"),
    causeOfDeath: z.string().optional().describe("Cause of death"),
    notes: z.string().optional().describe("Notes"),
    imageData: z.string().optional().describe("Photo (base64)"),
    relationship: z.enum(RELATIONSHIP_TYPES).optional().describe("Relationship to the active profile's person"),
    generation: z.number().optional().describe("Generation relative to profile: 1=parent, 2=grandparent, -1=child, 0=same gen"),
    side: z.enum(["MATERNAL", "PATERNAL"]).optional().describe("Side of family"),
    biological: z.boolean().optional().describe("Whether biological (default true)"),
  },
  async (args) =>
    ok(await client.createPerson({ ownerProfileId: pid(), ...args })),
);

server.tool(
  "get_person",
  "Get details for a specific person.",
  { id: z.string().describe("Person ID") },
  async ({ id }) => ok(await client.getPerson(id)),
);

server.tool(
  "update_person",
  "Update a person's information.",
  {
    id: z.string().describe("Person ID"),
    name: z.string().optional().describe("Name"),
    sex: z.enum(["MALE", "FEMALE", "OTHER"]).optional().describe("Sex"),
    dateOfBirth: z.string().optional().describe("Date of birth (YYYY-MM-DD)"),
    dateOfDeath: z.string().optional().describe("Date of death (YYYY-MM-DD)"),
    causeOfDeath: z.string().optional().describe("Cause of death"),
    notes: z.string().optional().describe("Notes"),
    imageData: z.string().optional().describe("Photo (base64)"),
  },
  async ({ id, ...rest }) => ok(await client.updatePerson(id, clean(rest))),
);

server.tool(
  "delete_person",
  "Delete a person from the family tree. Cannot delete persons linked to a profile.",
  { id: z.string().describe("Person ID") },
  async ({ id }) => ok(await client.deletePerson(id)),
);

// ==========================================================================
// Person Conditions
// ==========================================================================

server.tool(
  "list_person_conditions",
  "List medical conditions for a person (family member).",
  { personId: z.string().describe("Person ID") },
  async ({ personId }) => ok(await client.listPersonConditions(personId)),
);

server.tool(
  "create_person_condition",
  "Add a medical condition to a person's record.",
  {
    personId: z.string().describe("Person ID"),
    name: z.string().describe("Condition name"),
    notes: z.string().optional().describe("Notes"),
  },
  async ({ personId, name, notes }) =>
    ok(await client.createPersonCondition(personId, { name, notes })),
);

server.tool(
  "update_person_condition",
  "Update a person's medical condition.",
  {
    personId: z.string().describe("Person ID"),
    conditionId: z.string().describe("Condition ID"),
    name: z.string().optional().describe("Condition name"),
    notes: z.string().optional().describe("Notes"),
  },
  async ({ personId, conditionId, ...rest }) =>
    ok(await client.updatePersonCondition(personId, conditionId, clean(rest) as { name?: string; notes?: string })),
);

server.tool(
  "delete_person_condition",
  "Delete a medical condition from a person's record.",
  {
    personId: z.string().describe("Person ID"),
    conditionId: z.string().describe("Condition ID"),
  },
  async ({ personId, conditionId }) =>
    ok(await client.deletePersonCondition(personId, conditionId)),
);

// ==========================================================================
// Person Relationships
// ==========================================================================

server.tool(
  "get_person_relationships",
  "List relationships for a specific person.",
  { personId: z.string().describe("Person ID") },
  async ({ personId }) => ok(await client.getPersonRelationships(personId)),
);

server.tool(
  "get_person_family_graph",
  "Get the full family graph for a person, derived via BFS traversal.",
  {
    personId: z.string().describe("Person ID"),
    maxDepth: z.number().optional().describe("Maximum traversal depth (default 5)"),
  },
  async ({ personId, maxDepth }) =>
    ok(await client.getPersonFamilyGraph(personId, maxDepth)),
);

server.tool(
  "create_person_relationship",
  "Create a relationship between two persons. An inverse relationship is auto-created.",
  {
    fromPersonId: z.string().describe("Source person ID"),
    toPersonId: z.string().describe("Target person ID"),
    relationship: z.enum(RELATIONSHIP_TYPES).describe("Relationship type (from → to)"),
    generation: z.number().optional().describe("Generation offset: 1=parent, 2=grandparent, -1=child, 0=same gen"),
    side: z.enum(["MATERNAL", "PATERNAL"]).optional().describe("Side of family"),
    biological: z.boolean().optional().describe("Whether biological (default true)"),
  },
  async (args) => ok(await client.createPersonRelationship(args)),
);

server.tool(
  "update_person_relationship",
  "Update a person relationship.",
  {
    id: z.string().describe("Relationship ID"),
    relationship: z.enum(RELATIONSHIP_TYPES).optional().describe("Relationship type"),
    generation: z.number().optional().describe("Generation offset"),
    side: z.enum(["MATERNAL", "PATERNAL"]).optional().describe("Side of family"),
    biological: z.boolean().optional().describe("Whether biological"),
  },
  async ({ id, ...rest }) =>
    ok(await client.updatePersonRelationship(id, clean(rest))),
);

server.tool(
  "delete_person_relationship",
  "Delete a person relationship (and its auto-created inverse).",
  { id: z.string().describe("Relationship ID") },
  async ({ id }) => ok(await client.deletePersonRelationship(id)),
);

server.tool(
  "propagate_relationships",
  "[Deprecated — no-op] Biological relationships are now derived at query time via FamilyUnit traversal. " +
    "This tool exists for backward compatibility but does nothing. " +
    "Use create_family_unit and add_family_unit_member to model parent-child structure instead.",
  {
    personId: z.string().describe("Person ID (ignored — this tool is a no-op)"),
  },
  async ({ personId }) =>
    ok(await client.propagateRelationships(personId)),
);

server.tool(
  "get_relationship_suggestions",
  "Get suggested relationships for a person that need user confirmation. " +
    "Identifies plausible but uncertain relationships between the person's " +
    "family members — e.g., 'this grandfather might be your father's father.' " +
    "Does not create any records; returns suggestions for review.",
  {
    personId: z.string().describe("Person ID to get suggestions for"),
  },
  async ({ personId }) =>
    ok(await client.getRelationshipSuggestions(personId)),
);

// ==========================================================================
// Family Units (parent-child structure for biological relationships)
// ==========================================================================

server.tool(
  "list_family_units",
  "List all family units that a person belongs to (as parent or child). " +
    "A family unit represents a parent pair (mother + father) and their children.",
  {
    personId: z.string().describe("Person ID to list family units for"),
  },
  async ({ personId }) => ok(await client.listFamilyUnits(personId)),
);

server.tool(
  "create_family_unit",
  "Create a new family unit (parent pair). Children are added separately via add_family_unit_member. " +
    "A family unit represents one set of parents. At least one of motherId or fatherId should be provided.",
  {
    motherId: z.string().optional().describe("Mother's person ID"),
    fatherId: z.string().optional().describe("Father's person ID"),
  },
  async (args) =>
    ok(await client.createFamilyUnit({ profileId: pid(), ...args })),
);

server.tool(
  "get_family_unit",
  "Get details for a specific family unit, including its parents and members (children).",
  { id: z.string().describe("Family unit ID") },
  async ({ id }) => ok(await client.getFamilyUnit(id)),
);

server.tool(
  "update_family_unit",
  "Update a family unit's parent references.",
  {
    id: z.string().describe("Family unit ID"),
    motherId: z.string().optional().describe("New mother person ID"),
    fatherId: z.string().optional().describe("New father person ID"),
  },
  async ({ id, ...rest }) =>
    ok(await client.updateFamilyUnit(id, clean(rest) as { motherId?: string; fatherId?: string })),
);

server.tool(
  "delete_family_unit",
  "Delete a family unit. Members (children) are not deleted, only the unit itself.",
  { id: z.string().describe("Family unit ID") },
  async ({ id }) => ok(await client.deleteFamilyUnit(id)),
);

server.tool(
  "add_family_unit_member",
  "Add a child (person) to a family unit.",
  {
    familyUnitId: z.string().describe("Family unit ID"),
    personId: z.string().describe("Person ID to add as a child/member"),
  },
  async ({ familyUnitId, personId }) =>
    ok(await client.addFamilyUnitMember(familyUnitId, { personId })),
);

server.tool(
  "remove_family_unit_member",
  "Remove a child (person) from a family unit.",
  {
    familyUnitId: z.string().describe("Family unit ID"),
    personId: z.string().describe("Person ID to remove"),
  },
  async ({ familyUnitId, personId }) =>
    ok(await client.removeFamilyUnitMember(familyUnitId, personId)),
);

server.tool(
  "replace_person",
  "Replace a placeholder person (e.g. 'Unknown Mother') with an existing real person. " +
    "Updates all FamilyUnit references, merges conditions, and deletes the old placeholder.",
  {
    oldPersonId: z.string().describe("ID of the placeholder person to replace"),
    newPersonId: z.string().describe("ID of the real person to replace it with"),
  },
  async ({ oldPersonId, newPersonId }) =>
    ok(await client.replacePerson(oldPersonId, newPersonId)),
);

// ==========================================================================
// External Identities
// ==========================================================================

server.tool(
  "list_external_identities",
  "List all external genealogy provider identities linked to a person (e.g. FamilySearch, FindAGrave, WikiTree).",
  {
    personId: z.string().describe("Person ID"),
  },
  async ({ personId }) =>
    ok(await client.listExternalIdentities(personId)),
);

server.tool(
  "create_external_identity",
  "Link a person to an identity on an external genealogy provider. Each person may have at most one identity per provider. " +
    "Providers: familysearch, findagrave, wikitree, myheritage, ancestry.",
  {
    personId: z.string().describe("Person ID"),
    provider: z
      .string()
      .describe("Provider name: familysearch, findagrave, wikitree, myheritage, ancestry"),
    externalId: z.string().describe("Provider-specific person/profile ID"),
    externalUrl: z
      .string()
      .optional()
      .describe("Direct URL to the profile on the provider"),
  },
  async ({ personId, provider, externalId, externalUrl }) =>
    ok(
      await client.createExternalIdentity(personId, {
        provider,
        externalId,
        externalUrl,
      }),
    ),
);

server.tool(
  "update_external_identity",
  "Update the external ID or URL for an existing external identity link.",
  {
    personId: z.string().describe("Person ID"),
    identityId: z.string().describe("External Identity ID"),
    externalId: z.string().optional().describe("Updated provider-specific ID"),
    externalUrl: z
      .string()
      .optional()
      .describe("Updated URL to the profile on the provider"),
  },
  async ({ personId, identityId, externalId, externalUrl }) =>
    ok(
      await client.updateExternalIdentity(personId, identityId, {
        externalId,
        externalUrl,
      }),
    ),
);

server.tool(
  "delete_external_identity",
  "Unlink a person from an external genealogy provider. Does not affect the external provider.",
  {
    personId: z.string().describe("Person ID"),
    identityId: z.string().describe("External Identity ID"),
  },
  async ({ personId, identityId }) =>
    ok(await client.deleteExternalIdentity(personId, identityId)),
);

// ==========================================================================
// Person Facts
// ==========================================================================

server.tool(
  "list_person_facts",
  "List structured life facts for a person (occupation, military service, residence, burial, cause of death, etc.). " +
    "Optionally filter by fact type.",
  {
    personId: z.string().describe("Person ID"),
    factType: z
      .string()
      .optional()
      .describe(
        "Filter by fact type: OCCUPATION, MILITARY_SERVICE, RESIDENCE, IMMIGRATION, EMIGRATION, " +
          "EDUCATION, BURIAL, CAUSE_OF_DEATH, BIRTH, DEATH, MARRIAGE, DIVORCE, RELIGION, ETHNICITY, NATURALIZATION, OTHER",
      ),
  },
  async ({ personId, factType }) =>
    ok(await client.listPersonFacts(personId, factType)),
);

server.tool(
  "create_person_fact",
  "Add a structured life fact to a person. Fact types: OCCUPATION, MILITARY_SERVICE, RESIDENCE, IMMIGRATION, " +
    "EMIGRATION, EDUCATION, BURIAL, CAUSE_OF_DEATH, BIRTH, DEATH, MARRIAGE, DIVORCE, RELIGION, ETHNICITY, NATURALIZATION, OTHER.",
  {
    personId: z.string().describe("Person ID"),
    factType: z
      .string()
      .describe(
        "Fact type: OCCUPATION, MILITARY_SERVICE, RESIDENCE, IMMIGRATION, EMIGRATION, " +
          "EDUCATION, BURIAL, CAUSE_OF_DEATH, BIRTH, DEATH, MARRIAGE, DIVORCE, RELIGION, ETHNICITY, NATURALIZATION, OTHER",
      ),
    value: z.string().describe("Primary value (e.g. job title, branch of service, address)"),
    startDate: z.string().optional().describe("Start date (ISO 8601)"),
    endDate: z.string().optional().describe("End date (ISO 8601)"),
    location: z.string().optional().describe("Free-text location (e.g. 'Chicago, IL')"),
    sourceProvider: z
      .string()
      .optional()
      .describe("Source of the fact: familysearch, findagrave, manual, etc."),
    externalFactId: z
      .string()
      .optional()
      .describe("Provider-specific fact identifier for sync"),
    notes: z.string().optional().describe("Additional notes"),
  },
  async ({ personId, ...data }) =>
    ok(await client.createPersonFact(personId, data)),
);

server.tool(
  "update_person_fact",
  "Update a structured life fact for a person.",
  {
    personId: z.string().describe("Person ID"),
    factId: z.string().describe("Person Fact ID"),
    factType: z.string().optional().describe("Updated fact type"),
    value: z.string().optional().describe("Updated primary value"),
    startDate: z.string().optional().describe("Updated start date (ISO 8601)"),
    endDate: z.string().optional().describe("Updated end date (ISO 8601)"),
    location: z.string().optional().describe("Updated location"),
    sourceProvider: z.string().optional().describe("Updated source provider"),
    externalFactId: z.string().optional().describe("Updated external fact ID"),
    notes: z.string().optional().describe("Updated notes"),
  },
  async ({ personId, factId, ...data }) =>
    ok(await client.updatePersonFact(personId, factId, data)),
);

server.tool(
  "delete_person_fact",
  "Permanently delete a life fact from a person.",
  {
    personId: z.string().describe("Person ID"),
    factId: z.string().describe("Person Fact ID"),
  },
  async ({ personId, factId }) =>
    ok(await client.deletePersonFact(personId, factId)),
);

// ==========================================================================
// NPI Search
// ==========================================================================

server.tool(
  "search_npi",
  "Search the NPI registry for healthcare providers or organizations.",
  {
    query: z.string().describe("Search query (name or organization)"),
    type: z.string().optional().describe("Provider type filter"),
    city: z.string().optional().describe("City filter"),
    limit: z.string().optional().describe("Max results"),
  },
  async ({ query, type, city, limit }) =>
    ok(await client.searchNpi({ q: query, type, city, limit })),
);

// ==========================================================================
// Onboarding
// ==========================================================================

server.tool(
  "onboard",
  "Create an initial profile via the onboarding flow. Use this for first-time setup.",
  {
    name: z.string().describe("Full name"),
    birthDate: z.string().describe("Birth date (YYYY-MM-DD)"),
    sex: z.string().describe("Sex (MALE, FEMALE, OTHER)"),
    state: z.string().optional().describe("US state abbreviation"),
    heightIn: z.number().optional().describe("Height in inches"),
    timezone: z.string().optional().describe("IANA timezone"),
    notes: z.string().optional().describe("Notes"),
  },
  async (args) => ok(await client.onboard(args)),
);

// ==========================================================================
// Genealogy Sync
// ==========================================================================

server.tool(
  "sync_preview",
  "Generate a sync preview comparing a person's data with their linked external genealogy sources (e.g. WikiTree). Returns field comparisons, relationship matches, and provider errors.",
  {
    personId: z.string().describe("Person ID to sync"),
  },
  async ({ personId }) => ok(await client.getSyncPreview(personId)),
);

server.tool(
  "sync_apply",
  "Apply selected sync changes from a sync preview. Specify which fields to update, which facts to import, and which relationships to create.",
  {
    personId: z.string().describe("Person ID to apply changes to"),
    fields: z.record(z.string(), z.string()).describe("Field name → source ('current' or provider ID)"),
    factIndices: z.array(z.number()).optional().describe("Indices of facts from preview to import"),
    portraitProvider: z.string().nullable().optional().describe("Provider to use for portrait (null = keep current)"),
    relationships: z.array(z.object({
      provider: z.string(),
      index: z.number(),
      localPersonId: z.string().nullable(),
    })).optional().describe("Relationships to create from preview"),
  },
  async (args) => ok(await client.applySyncChanges(args.personId, {
    personId: args.personId,
    fields: args.fields,
    factIndices: args.factIndices ?? [],
    portraitProvider: args.portraitProvider ?? null,
    relationships: args.relationships ?? [],
  })),
);

server.tool(
  "list_providers",
  "List all registered genealogy providers with their capabilities.",
  {},
  async () => ok(await client.getProviderCapabilities()),
);

server.tool(
  "wikitree_search",
  "Search WikiTree for persons matching the given criteria. Returns potential matches with names, dates, locations, and parent info.",
  {
    firstName: z.string().optional().describe("First name to search"),
    lastName: z.string().describe("Last name (required)"),
    birthDate: z.string().optional().describe("Birth date (YYYY or YYYY-MM-DD)"),
    deathDate: z.string().optional().describe("Death date (YYYY or YYYY-MM-DD)"),
    limit: z.number().optional().describe("Max results (default 10)"),
  },
  async (args) => ok(await client.searchWikiTree(args)),
);

server.tool(
  "wikitree_preview",
  "Preview a WikiTree profile before linking it to a person. Accepts a WikiTree ID (e.g. 'Jorgensen-4571') or a WikiTree profile URL.",
  {
    wikiTreeId: z.string().describe("WikiTree ID or profile URL"),
  },
  async ({ wikiTreeId }) => ok(await client.previewWikiTreeLink(wikiTreeId)),
);

// ==========================================================================
// WikiTree Matching Queue
// ==========================================================================

server.tool(
  "queue_wikitree_matching",
  "Build or refresh the WikiTree matching queue. Creates queue entries for all persons " +
    "that don't already have a WikiTree ExternalIdentity. Returns a summary of queue counts.",
  {},
  async () => ok(await client.buildWikiTreeMatchQueue()),
);

server.tool(
  "get_matching_queue",
  "Get the WikiTree matching queue. Returns queue entries with scored candidates. " +
    "Can filter by status and return only summary counts.",
  {
    status: z
      .string()
      .optional()
      .describe(
        "Filter by status: strong_match, ambiguous, no_match, linked, pending, error"
      ),
    summary: z
      .boolean()
      .optional()
      .describe("If true, return only summary counts instead of full entries"),
  },
  async ({ status, summary }) =>
    ok(await client.getWikiTreeMatchQueue({ status, summary })),
);

server.tool(
  "search_wikitree_candidates",
  "Search WikiTree for candidates matching persons in the queue. " +
    "If personId is provided, searches for a single person. " +
    "If no personId, searches all pending entries (bulk search). " +
    "Supports custom search queries to override automatic search parameters.",
  {
    personId: z.string().optional().describe("Person ID to search for (omit for bulk search)"),
    firstName: z.string().optional().describe("Override first name for search"),
    lastName: z.string().optional().describe("Override last name for search"),
    birthDate: z.string().optional().describe("Override birth date for search (YYYY or YYYY-MM-DD)"),
    deathDate: z.string().optional().describe("Override death date for search"),
    wikiTreeId: z.string().optional().describe("Look up a specific WikiTree ID or URL"),
  },
  async (args) => ok(await client.searchWikiTreeCandidates(args)),
);

server.tool(
  "link_wikitree_candidate",
  "Link a WikiTree candidate to a person by creating an ExternalIdentity. " +
    "The user must explicitly call this - no automatic linking occurs.",
  {
    personId: z.string().describe("Person ID to link"),
    wikiTreeId: z.string().describe("WikiTree ID to link (e.g. 'Jorgensen-4571')"),
  },
  async ({ personId, wikiTreeId }) =>
    ok(await client.linkWikiTreeCandidate(personId, wikiTreeId)),
);

server.tool(
  "reject_wikitree_candidate",
  "Reject a specific WikiTree candidate for a person. The candidate will be " +
    "added to the ignored list and filtered from future results.",
  {
    personId: z.string().describe("Person ID"),
    wikiTreeId: z.string().describe("WikiTree ID to reject"),
  },
  async ({ personId, wikiTreeId }) =>
    ok(await client.rejectWikiTreeCandidate(personId, wikiTreeId)),
);

server.tool(
  "reset_wikitree_no_matches",
  "Reset all no_match entries back to pending for re-searching. " +
    "Use this after fixing search parameters or after the search implementation has been updated.",
  {},
  async () => ok(await client.resetWikiTreeNoMatches()),
);

server.tool(
  "reset_wikitree_non_final",
  "Extended reset: reset strong_match, ambiguous, no_match, and error entries back to pending. " +
    "Preserves linked and rejected entries. Use before starting a fresh A/B comparison run.",
  {},
  async () => ok(await client.resetWikiTreeNonFinal()),
);

// ==========================================================================
// WikiTree Matching Jobs
// ==========================================================================

server.tool(
  "start_wikitree_match_job",
  "Start a persistent background matching job. Searches all pending queue entries, " +
    "scores candidates, and optionally enriches top candidates with WikiTree relationship data. " +
    "Returns immediately with job status; processing runs in background.",
  {
    enrichment: z.boolean().optional().describe("Enable candidate enrichment via WikiTree relationship API (default: false)"),
    enrichmentTopN: z.number().optional().describe("Number of top candidates to enrich (default: 5, max: 10). Use 3 or 5 for A/B testing."),
    batchSize: z.number().optional().describe("Number of people to process per batch (default: 10, max: 50)"),
    strongThreshold: z.number().optional().describe("Minimum score for strong_match classification (default: 7)"),
    leadRequired: z.number().optional().describe("Required score lead over second-place candidate for strong_match (default: 3)"),
  },
  async (args) => ok(await client.startWikiTreeMatchJob(args)),
);

server.tool(
  "pause_wikitree_match_job",
  "Pause a running WikiTree matching job. The current batch will complete but no new batches start.",
  {
    jobId: z.string().describe("Job ID to pause"),
  },
  async ({ jobId }) => ok(await client.pauseWikiTreeMatchJob(jobId)),
);

server.tool(
  "resume_wikitree_match_job",
  "Resume a paused WikiTree matching job.",
  {
    jobId: z.string().describe("Job ID to resume"),
  },
  async ({ jobId }) => ok(await client.resumeWikiTreeMatchJob(jobId)),
);

server.tool(
  "cancel_wikitree_match_job",
  "Cancel a running or paused WikiTree matching job.",
  {
    jobId: z.string().describe("Job ID to cancel"),
  },
  async ({ jobId }) => ok(await client.cancelWikiTreeMatchJob(jobId)),
);

server.tool(
  "get_wikitree_match_job_status",
  "Get the status of a WikiTree matching job including progress, statistics, and configuration. " +
    "If no jobId is provided, returns the most recent job. " +
    "Statistics include: total people, processed, pending, strong matches, ambiguous, no match, " +
    "errors, linked, rejected, total API calls, total runtime, avg candidates per search, " +
    "avg API calls per person, avg processing time, enrichmentTopN setting.",
  {
    jobId: z.string().optional().describe("Job ID (omit for most recent job)"),
  },
  async ({ jobId }) => ok(await client.getWikiTreeMatchJobStatus(jobId)),
);

server.tool(
  "list_wikitree_match_jobs",
  "List all WikiTree matching jobs for the current user, most recent first.",
  {},
  async () => ok(await client.listWikiTreeMatchJobs()),
);

server.tool(
  "compare_wikitree_match_jobs",
  "Compare two completed WikiTree matching jobs (A/B test). Returns derived metrics: " +
    "additional strong matches, reduction in ambiguous/no_match, additional API calls, " +
    "additional runtime, and strong matches per additional API call.",
  {
    baselineJobId: z.string().describe("Job ID of the baseline run (e.g., no enrichment)"),
    comparisonJobId: z.string().describe("Job ID of the comparison run (e.g., with enrichment)"),
  },
  async ({ baselineJobId, comparisonJobId }) =>
    ok(await client.compareWikiTreeMatchJobs(baselineJobId, comparisonJobId)),
);

// ==========================================================================
// Start server
// ==========================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("health-tracker MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
