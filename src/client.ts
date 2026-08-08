import {
  PlaywrightChromeTransport,
  type WikiTreeBrowserTransport,
} from "./wikitree-browser-transport.js";
import { createHash } from "node:crypto";

const BASE_URL = process.env.HEALTH_TRACKER_URL ?? "http://localhost:3000";
import { getRequestContext } from "./request-context.js";

// ── String sanitization ──────────────────────────────────────────────────────

/** Unescape common HTML entities that LLM clients sometimes inject into tool inputs. */
function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

/** Recursively sanitize all string values in a request body (trim + unescape HTML entities). */
function sanitize<T>(obj: T): T {
  if (typeof obj === "string") return unescapeHtml(obj.trim()) as T;
  if (Array.isArray(obj)) return obj.map(sanitize) as T;
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, sanitize(v)])
    ) as T;
  }
  return obj;
}

export function getActiveProfileId(): string | null {
  return getRequestContext().auth.activeProfileId ?? null;
}

export function setActiveProfileId(id: string | null): void {
  getRequestContext().auth.activeProfileId = id ?? undefined;
}

function requireProfileId(explicit?: string): string {
  const id = explicit ?? getActiveProfileId();
  if (!id) throw new Error("No active profile. Use switch_profile first or provide a profileId.");
  return id;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const hdrs: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: await getRequestContext().credentials.getAuthorization(getRequestContext().auth),
  };
  const res = await fetch(url, {
    method,
    headers: hdrs,
    body: body !== undefined ? JSON.stringify(sanitize(body)) : undefined,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as {
        error?: string;
        code?: string;
        correlationId?: string;
        issues?: Array<{ code: string; path: string; message: string }>;
      };
      const safe = {
        code: err.code,
        correlationId: err.correlationId,
        issues: err.issues,
      };
      detail = err.error
        ? `: ${err.error}${err.code ? ` ${JSON.stringify(safe)}` : ""}`
        : "";
    } catch {}
    throw new Error(`health-tracker ${method} ${path} → ${res.status}${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function withProfile(path: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  const activeProfileId = getActiveProfileId();
  if (activeProfileId) params.set("profileId", activeProfileId);
  if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function qs(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export async function listProfiles(): Promise<unknown> {
  return request("GET", "/api/profiles");
}

export async function createProfile(data: {
  name: string;
  birthDate: string;
  sex: string;
  state?: string;
  heightIn?: number;
  timezone?: string;
  notes?: string;
  imageData?: string;
}): Promise<unknown> {
  return request("POST", "/api/profiles", data);
}

export async function getProfile(id: string): Promise<unknown> {
  return request("GET", `/api/profiles/${id}`);
}

export async function updateProfile(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", `/api/profiles/${id}`, data);
}

export async function deleteProfile(id: string): Promise<unknown> {
  return request("DELETE", `/api/profiles/${id}`);
}

export async function exportProfile(id: string): Promise<unknown> {
  return request("GET", `/api/profiles/${id}/export`);
}

export async function importProfile(
  id: string,
  data: { mode: string; data: unknown },
): Promise<unknown> {
  return request("POST", `/api/profiles/${id}/import`, data);
}

export async function regenerateCalendarToken(id: string): Promise<unknown> {
  return request("POST", `/api/profiles/${id}/calendar-token`);
}

// ---------------------------------------------------------------------------
// Profile Access
// ---------------------------------------------------------------------------

export async function listProfileAccess(id: string): Promise<unknown> {
  return request("GET", `/api/profiles/${id}/access`);
}

export async function grantProfileAccess(
  id: string,
  data: { email: string; permission: string },
): Promise<unknown> {
  return request("POST", `/api/profiles/${id}/access`, data);
}

export async function updateProfileAccess(
  profileId: string,
  userId: string,
  data: { permission: string },
): Promise<unknown> {
  return request("PATCH", `/api/profiles/${profileId}/access/${userId}`, data);
}

export async function revokeProfileAccess(
  profileId: string,
  userId: string,
): Promise<unknown> {
  return request("DELETE", `/api/profiles/${profileId}/access/${userId}`);
}

// ---------------------------------------------------------------------------
// Profile Relationships
// ---------------------------------------------------------------------------

export async function listRelationships(opts?: {
  includeInherited?: string;
}): Promise<unknown> {
  return request(
    "GET",
    withProfile("/api/profile-relationships", opts as Record<string, string>),
  );
}

export async function createRelationship(data: {
  profileId: string;
  toProfileId: string;
  relationship: string;
  biological?: boolean;
}): Promise<unknown> {
  return request("POST", "/api/profile-relationships", data);
}

export async function updateRelationship(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", withProfile(`/api/profile-relationships/${id}`), data);
}

export async function deleteRelationship(id: string): Promise<unknown> {
  return request("DELETE", withProfile(`/api/profile-relationships/${id}`));
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export async function listConditions(): Promise<unknown> {
  return request("GET", withProfile("/api/conditions"));
}

export async function createCondition(data: {
  profileId: string;
  name: string;
  diagnosisDate?: string;
  status?: string;
  notes?: string;
}): Promise<unknown> {
  return request("POST", "/api/conditions", data);
}

export async function getCondition(id: string): Promise<unknown> {
  return request("GET", withProfile(`/api/conditions/${id}`));
}

export async function updateCondition(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", withProfile(`/api/conditions/${id}`), data);
}

export async function deleteCondition(id: string): Promise<unknown> {
  return request("DELETE", withProfile(`/api/conditions/${id}`));
}

// ---------------------------------------------------------------------------
// Allergies
// ---------------------------------------------------------------------------

export async function listAllergies(): Promise<unknown> {
  return request("GET", withProfile("/api/allergies"));
}

export async function createAllergy(data: {
  profileId: string;
  allergen: string;
  category?: string;
  diagnosisDate?: string;
  whealSize?: number;
  notes?: string;
}): Promise<unknown> {
  return request("POST", "/api/allergies", data);
}

export async function getAllergy(id: string): Promise<unknown> {
  return request("GET", withProfile(`/api/allergies/${id}`));
}

export async function updateAllergy(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", withProfile(`/api/allergies/${id}`), data);
}

export async function deleteAllergy(id: string): Promise<unknown> {
  return request("DELETE", withProfile(`/api/allergies/${id}`));
}

// ---------------------------------------------------------------------------
// Medications
// ---------------------------------------------------------------------------

export async function listMedications(): Promise<unknown> {
  return request("GET", withProfile("/api/medications"));
}

export async function createMedication(data: {
  profileId: string;
  name: string;
  medicationType?: string;
  dosage?: string;
  frequency?: string;
  prescribingDoctorId?: string;
  startDate?: string;
  endDate?: string;
  instructions?: string;
  active?: boolean;
}): Promise<unknown> {
  return request("POST", "/api/medications", data);
}

export async function getMedication(id: string): Promise<unknown> {
  return request("GET", withProfile(`/api/medications/${id}`));
}

export async function updateMedication(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", withProfile(`/api/medications/${id}`), data);
}

export async function deleteMedication(id: string): Promise<unknown> {
  return request("DELETE", withProfile(`/api/medications/${id}`));
}

// ---------------------------------------------------------------------------
// Medication Logs
// ---------------------------------------------------------------------------

export async function listMedicationLogs(
  medicationId: string,
  opts?: { limit?: string; cursor?: string },
): Promise<unknown> {
  return request(
    "GET",
    withProfile(`/api/medications/${medicationId}/logs`, opts as Record<string, string>),
  );
}

export async function createMedicationLog(
  medicationId: string,
  data: {
    profileId: string;
    date: string;
    dosage?: string;
    unit?: string;
    injectionSite?: string;
    notes?: string;
  },
): Promise<unknown> {
  return request("POST", `/api/medications/${medicationId}/logs`, data);
}

export async function updateMedicationLog(
  medicationId: string,
  logId: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request(
    "PUT",
    withProfile(`/api/medications/${medicationId}/logs/${logId}`),
    data,
  );
}

export async function deleteMedicationLog(
  medicationId: string,
  logId: string,
): Promise<unknown> {
  return request(
    "DELETE",
    withProfile(`/api/medications/${medicationId}/logs/${logId}`),
  );
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

export async function listVisits(opts?: {
  profileId?: string;
  limit?: string;
  cursor?: string;
  order?: "asc" | "desc";
}): Promise<unknown> {
  return request(
    "GET",
    withProfile("/api/visits", { order: "desc", ...opts } as Record<string, string>),
  );
}

export async function createVisit(data: {
  profileId: string;
  doctorId?: string;
  facilityId?: string;
  locationId?: string;
  date?: string;
  dueMonth?: string;
  type?: string;
  reason?: string;
  specialty?: string;
  notes?: string;
  documentUrl?: string;
  status?: string;
}): Promise<unknown> {
  return request("POST", "/api/visits", data);
}

export async function getVisit(id: string): Promise<unknown> {
  return request("GET", withProfile(`/api/visits/${id}`));
}

export async function updateVisit(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", withProfile(`/api/visits/${id}`), data);
}

export async function deleteVisit(id: string): Promise<unknown> {
  return request("DELETE", withProfile(`/api/visits/${id}`));
}

// ---------------------------------------------------------------------------
// Vaccinations
// ---------------------------------------------------------------------------

export async function listVaccinations(): Promise<unknown> {
  return request("GET", withProfile("/api/vaccinations"));
}

export async function createVaccinationDose(data: {
  profileId: string;
  vaccinationNames: string[];
  date: string;
  source?: string;
  facilityId?: string;
  lotNumber?: string;
  notes?: string;
}): Promise<unknown> {
  return request("POST", "/api/vaccinations", data);
}

export async function getVaccination(id: string): Promise<unknown> {
  return request("GET", withProfile(`/api/vaccinations/${id}`));
}

export async function updateVaccination(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", `/api/vaccinations/${id}`, data);
}

export async function deleteVaccination(id: string): Promise<unknown> {
  return request("DELETE", `/api/vaccinations/${id}`);
}

// ---------------------------------------------------------------------------
// Vaccination Doses
// ---------------------------------------------------------------------------

export async function getDose(id: string): Promise<unknown> {
  return request("GET", withProfile(`/api/vaccinations/doses/${id}`));
}

export async function updateDose(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", `/api/vaccinations/doses/${id}`, data);
}

export async function deleteDose(id: string): Promise<unknown> {
  return request("DELETE", `/api/vaccinations/doses/${id}`);
}

// ---------------------------------------------------------------------------
// Vaccination Recommendations
// ---------------------------------------------------------------------------

export async function getVaccineRecommendations(): Promise<unknown> {
  return request("GET", withProfile("/api/vaccinations/recommendations"));
}

export async function checkTravelVaccines(data: {
  profileId: string;
  destination: string;
}): Promise<unknown> {
  return request("POST", "/api/vaccinations/travel-check", data);
}

// ---------------------------------------------------------------------------
// Health Metrics
// ---------------------------------------------------------------------------

export async function listHealthMetrics(opts?: {
  metricType?: string;
  limit?: string;
  cursor?: string;
}): Promise<unknown> {
  return request(
    "GET",
    withProfile("/api/health-metrics", opts as Record<string, string>),
  );
}

export async function createHealthMetric(data: {
  profileId: string;
  metricType: string;
  value: number;
  unit: string;
  measuredAt: string;
  notes?: string;
}): Promise<unknown> {
  return request("POST", "/api/health-metrics", data);
}

export async function getHealthMetric(id: string): Promise<unknown> {
  return request("GET", withProfile(`/api/health-metrics/${id}`));
}

export async function updateHealthMetric(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", withProfile(`/api/health-metrics/${id}`), data);
}

export async function deleteHealthMetric(id: string): Promise<unknown> {
  return request("DELETE", withProfile(`/api/health-metrics/${id}`));
}

export async function listDistinctMetricTypes(): Promise<unknown> {
  return request("GET", withProfile("/api/health-metrics/distinct"));
}

// ---------------------------------------------------------------------------
// Compound Vision Health Metric
// ---------------------------------------------------------------------------

export async function listVisionMetrics(): Promise<unknown> {
  return request("GET", withProfile("/api/health-metrics/vision"));
}

export async function getVisionMetric(id: string): Promise<unknown> {
  return request("GET", withProfile(`/api/health-metrics/vision/${id}`));
}

export async function createVisionMetric(data: Record<string, unknown>): Promise<unknown> {
  return request("POST", "/api/health-metrics/vision", { profileId: requireProfileId(), ...data });
}

export async function updateVisionMetric(id: string, data: Record<string, unknown>): Promise<unknown> {
  return request("PUT", withProfile(`/api/health-metrics/vision/${id}`), data);
}

export async function deleteVisionMetric(id: string): Promise<unknown> {
  return request("DELETE", withProfile(`/api/health-metrics/vision/${id}`));
}

// ---------------------------------------------------------------------------
// Doctors
// ---------------------------------------------------------------------------

export async function listDoctors(): Promise<unknown> {
  return request("GET", withProfile("/api/doctors"));
}

export async function createDoctor(data: Record<string, unknown>): Promise<unknown> {
  return request("POST", withProfile("/api/doctors"), data);
}

export async function getDoctor(id: string): Promise<unknown> {
  return request("GET", withProfile(`/api/doctors/${id}`));
}

export async function updateDoctor(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", withProfile(`/api/doctors/${id}`), data);
}

export async function deleteDoctor(id: string): Promise<unknown> {
  return request("DELETE", withProfile(`/api/doctors/${id}`));
}

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

export async function listFacilities(): Promise<unknown> {
  return request("GET", withProfile("/api/facilities"));
}

export async function createFacility(data: Record<string, unknown>): Promise<unknown> {
  return request("POST", withProfile("/api/facilities"), data);
}

export async function getFacility(id: string): Promise<unknown> {
  return request("GET", withProfile(`/api/facilities/${id}`));
}

export async function updateFacility(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", withProfile(`/api/facilities/${id}`), data);
}

export async function deleteFacility(id: string): Promise<unknown> {
  return request("DELETE", withProfile(`/api/facilities/${id}`));
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export async function listLocations(facilityId: string): Promise<unknown> {
  return request("GET", `/api/locations${qs({ facilityId })}`);
}

export async function createLocation(
  facilityId: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("POST", `/api/locations${qs({ facilityId })}`, data);
}

export async function getLocation(id: string): Promise<unknown> {
  return request("GET", `/api/locations/${id}`);
}

export async function updateLocation(
  id: string,
  facilityId: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", `/api/locations/${id}${qs({ facilityId })}`, data);
}

export async function deleteLocation(
  id: string,
  facilityId: string,
): Promise<unknown> {
  return request("DELETE", `/api/locations/${id}${qs({ facilityId })}`);
}

// ---------------------------------------------------------------------------
// Insurance
// ---------------------------------------------------------------------------

export async function listInsurance(): Promise<unknown> {
  return request("GET", withProfile("/api/insurance"));
}

export async function createInsurance(data: Record<string, unknown> & {
  profileId: string;
  type: string;
}): Promise<unknown> {
  return request("POST", "/api/insurance", data);
}

export async function getInsurance(id: string): Promise<unknown> {
  return request("GET", withProfile(`/api/insurance/${id}`));
}

export async function updateInsurance(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", withProfile(`/api/insurance/${id}`), data);
}

export async function deleteInsurance(id: string): Promise<unknown> {
  return request("DELETE", withProfile(`/api/insurance/${id}`));
}

// ---------------------------------------------------------------------------
// Portals
// ---------------------------------------------------------------------------

export async function listPortals(): Promise<unknown> {
  return request("GET", withProfile("/api/portals"));
}

export async function createPortal(data: {
  profileId: string;
  name: string;
  organization?: string;
  url: string;
  facilityId?: string;
  notes?: string;
}): Promise<unknown> {
  return request("POST", "/api/portals", data);
}

export async function getPortal(id: string): Promise<unknown> {
  return request("GET", withProfile(`/api/portals/${id}`));
}

export async function updatePortal(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", withProfile(`/api/portals/${id}`), data);
}

export async function deletePortal(id: string): Promise<unknown> {
  return request("DELETE", withProfile(`/api/portals/${id}`));
}

// ---------------------------------------------------------------------------
// Family Members
// ---------------------------------------------------------------------------

export async function listFamilyMembers(): Promise<unknown> {
  return request("GET", withProfile("/api/family-members"));
}

export async function createFamilyMember(data: Record<string, unknown> & {
  profileId: string;
  name: string;
  relationship: string;
}): Promise<unknown> {
  return request("POST", "/api/family-members", data);
}

export async function getFamilyMember(id: string): Promise<unknown> {
  return request("GET", withProfile(`/api/family-members/${id}`));
}

export async function updateFamilyMember(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", withProfile(`/api/family-members/${id}`), data);
}

export async function deleteFamilyMember(id: string): Promise<unknown> {
  return request("DELETE", withProfile(`/api/family-members/${id}`));
}

export async function listFamilyConditions(
  familyMemberId: string,
): Promise<unknown> {
  return request(
    "GET",
    withProfile(`/api/family-members/${familyMemberId}/conditions`),
  );
}

export async function createFamilyCondition(
  familyMemberId: string,
  data: { profileId: string; name: string; notes?: string },
): Promise<unknown> {
  return request(
    "POST",
    `/api/family-members/${familyMemberId}/conditions`,
    data,
  );
}

// ---------------------------------------------------------------------------
// Persons (unified Person model — replaces Family Members + Profile Relationships)
// ---------------------------------------------------------------------------

export async function listPersons(): Promise<unknown> {
  return request("GET", withProfile("/api/persons"));
}

export async function createPerson(data: {
  ownerProfileId: string;
  name: string;
  sex?: string;
  dateOfBirth?: string;
  dateOfDeath?: string;
  causeOfDeath?: string;
  notes?: string;
  imageData?: string;
  relationship?: string;
  generation?: number;
  side?: string;
  biological?: boolean;
}): Promise<unknown> {
  return request("POST", "/api/persons", data);
}

export async function getPerson(id: string): Promise<unknown> {
  return request("GET", `/api/persons/${id}`);
}

export async function updatePerson(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", `/api/persons/${id}`, data);
}

export async function deletePerson(id: string): Promise<unknown> {
  return request("DELETE", `/api/persons/${id}`);
}

export async function listPersonConditions(personId: string): Promise<unknown> {
  return request("GET", `/api/persons/${personId}/conditions`);
}

export async function createPersonCondition(
  personId: string,
  data: { name: string; notes?: string },
): Promise<unknown> {
  return request("POST", `/api/persons/${personId}/conditions`, data);
}

export async function updatePersonCondition(
  personId: string,
  conditionId: string,
  data: { name?: string; notes?: string },
): Promise<unknown> {
  return request("PUT", `/api/persons/${personId}/conditions/${conditionId}`, data);
}

export async function deletePersonCondition(
  personId: string,
  conditionId: string,
): Promise<unknown> {
  return request("DELETE", `/api/persons/${personId}/conditions/${conditionId}`);
}

export async function getPersonRelationships(personId: string): Promise<unknown> {
  return request("GET", `/api/persons/${personId}/relationships`);
}

export async function getPersonFamilyGraph(
  personId: string,
  maxDepth?: number,
): Promise<unknown> {
  const params = maxDepth ? `?maxDepth=${maxDepth}` : "";
  return request("GET", `/api/persons/${personId}/family-graph${params}`);
}

export async function createPersonRelationship(data: {
  fromPersonId: string;
  toPersonId: string;
  relationship: string;
  generation?: number;
  side?: string;
  biological?: boolean;
}): Promise<unknown> {
  return request("POST", "/api/person-relationships", data);
}

export async function updatePersonRelationship(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return request("PUT", `/api/person-relationships/${id}`, data);
}

export async function deletePersonRelationship(id: string): Promise<unknown> {
  return request("DELETE", `/api/person-relationships/${id}`);
}

/**
 * @deprecated No-op — relationships are now derived at query time via FamilyUnit traversal.
 */
export async function propagateRelationships(
  personId: string,
): Promise<unknown> {
  return request("POST", `/api/person-relationships/propagate`, { personId });
}

// ---------------------------------------------------------------------------
// Family Units
// ---------------------------------------------------------------------------

export async function listFamilyUnits(personId: string): Promise<unknown> {
  return request("GET", `/api/family-units?personId=${encodeURIComponent(personId)}`);
}

export async function createFamilyUnit(data: {
  profileId: string;
  motherId?: string;
  fatherId?: string;
}): Promise<unknown> {
  return request("POST", "/api/family-units", data);
}

export async function getFamilyUnit(id: string): Promise<unknown> {
  return request("GET", `/api/family-units/${id}`);
}

export async function updateFamilyUnit(
  id: string,
  data: { motherId?: string; fatherId?: string },
): Promise<unknown> {
  return request("PUT", `/api/family-units/${id}`, data);
}

export async function deleteFamilyUnit(id: string): Promise<unknown> {
  return request("DELETE", `/api/family-units/${id}`);
}

export async function addFamilyUnitMember(
  familyUnitId: string,
  data: { personId: string },
): Promise<unknown> {
  return request("POST", `/api/family-units/${familyUnitId}/members`, data);
}

export async function removeFamilyUnitMember(
  familyUnitId: string,
  personId: string,
): Promise<unknown> {
  return request("DELETE", `/api/family-units/${familyUnitId}/members`, { personId });
}

export async function replacePerson(
  oldPersonId: string,
  newPersonId: string,
): Promise<unknown> {
  return request("POST", `/api/persons/${oldPersonId}/replace`, { newPersonId });
}

export async function getRelationshipSuggestions(
  personId: string,
): Promise<unknown> {
  return request("GET", `/api/persons/${personId}/relationship-suggestions`);
}

// ---------------------------------------------------------------------------
// External Identities
// ---------------------------------------------------------------------------

export async function listExternalIdentities(
  personId: string,
): Promise<unknown> {
  return request("GET", `/api/persons/${personId}/external-identities`);
}

export async function createExternalIdentity(
  personId: string,
  data: { provider: string; externalId: string; externalUrl?: string },
): Promise<unknown> {
  return request("POST", `/api/persons/${personId}/external-identities`, data);
}

export async function updateExternalIdentity(
  personId: string,
  identityId: string,
  data: { externalId?: string; externalUrl?: string | null },
): Promise<unknown> {
  return request("PUT", `/api/persons/${personId}/external-identities/${identityId}`, data);
}

export async function deleteExternalIdentity(
  personId: string,
  identityId: string,
): Promise<unknown> {
  return request("DELETE", `/api/persons/${personId}/external-identities/${identityId}`);
}

// ---------------------------------------------------------------------------
// Person Facts
// ---------------------------------------------------------------------------

export async function listPersonFacts(
  personId: string,
  factType?: string,
): Promise<unknown> {
  const params = factType ? qs({ factType }) : "";
  return request("GET", `/api/persons/${personId}/facts${params}`);
}

export async function createPersonFact(
  personId: string,
  data: {
    factType: string;
    value: string;
    startDate?: string;
    endDate?: string;
    location?: string;
    sourceProvider?: string;
    externalFactId?: string;
    notes?: string;
  },
): Promise<unknown> {
  return request("POST", `/api/persons/${personId}/facts`, data);
}

export async function updatePersonFact(
  personId: string,
  factId: string,
  data: {
    factType?: string;
    value?: string;
    startDate?: string | null;
    endDate?: string | null;
    location?: string | null;
    sourceProvider?: string | null;
    externalFactId?: string | null;
    notes?: string | null;
  },
): Promise<unknown> {
  return request("PUT", `/api/persons/${personId}/facts/${factId}`, data);
}

export async function deletePersonFact(
  personId: string,
  factId: string,
): Promise<unknown> {
  return request("DELETE", `/api/persons/${personId}/facts/${factId}`);
}

// ---------------------------------------------------------------------------
// Genealogy Sync
// ---------------------------------------------------------------------------

export async function getSyncPreview(personId: string): Promise<unknown> {
  return request("POST", `/api/persons/${personId}/sync/preview`);
}

export async function applySyncChanges(
  personId: string,
  data: {
    personId: string;
    fields: Record<string, string>;
    factIndices: number[];
    portraitProvider: string | null;
    relationships: Array<{
      provider: string;
      index: number;
      localPersonId: string | null;
    }>;
  }
): Promise<unknown> {
  return request("POST", `/api/persons/${personId}/sync/apply`, data);
}

export async function getProviderCapabilities(): Promise<unknown> {
  return request("GET", "/api/genealogy/providers");
}

export async function searchWikiTree(params: {
  firstName?: string;
  lastName: string;
  birthDate?: string;
  deathDate?: string;
  limit?: number;
}): Promise<unknown> {
  return runWikiTreeAdhocBridge({ kind: "search", ...params });
}

export async function previewWikiTreeLink(wikiTreeId: string): Promise<unknown> {
  return runWikiTreeAdhocBridge({ kind: "preview", wikiTreeId });
}

// ---------------------------------------------------------------------------
// WikiTree Matching Queue
// ---------------------------------------------------------------------------

export async function getWikiTreeMatchQueue(opts?: {
  status?: string;
  summary?: boolean;
}): Promise<unknown> {
  const params: Record<string, string> = {};
  if (opts?.status) params.status = opts.status;
  if (opts?.summary) params.summary = "true";
  return request("GET", `/api/genealogy/wikitree/queue${qs(params)}`);
}

export async function buildWikiTreeMatchQueue(): Promise<unknown> {
  return request("POST", "/api/genealogy/wikitree/queue");
}

export async function searchWikiTreeCandidates(opts?: {
  personId?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  deathDate?: string;
  wikiTreeId?: string;
}): Promise<unknown> {
  if (opts && (opts.firstName || opts.lastName || opts.birthDate || opts.deathDate || opts.wikiTreeId)) {
    throw new Error(
      "Custom queue-query overrides are not accepted by the local bridge; use wikitree_search or wikitree_preview for an exact ad-hoc operation.",
    );
  }
  const job = await startWikiTreeMatchJob({
    enrichment: true,
    personIds: opts?.personId ? [opts.personId] : undefined,
  }) as { id: string };
  return {
    job,
    drain: await runWikiTreeLocalBridge(job.id),
  };
}

export async function linkWikiTreeCandidate(
  personId: string,
  wikiTreeId: string
): Promise<unknown> {
  return request("POST", "/api/genealogy/wikitree/queue/link", {
    personId,
    wikiTreeId,
  });
}

export async function rejectWikiTreeCandidate(
  personId: string,
  wikiTreeId: string
): Promise<unknown> {
  return request("POST", "/api/genealogy/wikitree/queue/reject", {
    personId,
    wikiTreeId,
  });
}

export async function resetWikiTreeNoMatches(): Promise<unknown> {
  return request("POST", "/api/genealogy/wikitree/queue/reset");
}

export async function resetWikiTreeNonFinal(): Promise<unknown> {
  return request("POST", "/api/genealogy/wikitree/queue/reset", { extended: true });
}

export async function resetWikiTreeManifest(
  manifest: Array<{ personId: string; updatedAt: string }>,
): Promise<unknown> {
  return request("POST", "/api/genealogy/wikitree/queue/reset", { manifest });
}

// ---------------------------------------------------------------------------
// WikiTree Matching Jobs
// ---------------------------------------------------------------------------

export async function startWikiTreeMatchJob(opts?: {
  enrichment?: boolean;
  enrichmentTopN?: number;
  batchSize?: number;
  strongThreshold?: number;
  leadRequired?: number;
  graphExpansion?: boolean;
  personIds?: string[];
}): Promise<unknown> {
  return request("POST", "/api/genealogy/wikitree/queue/job", {
    action: "start",
    ...opts,
  });
}

export async function pauseWikiTreeMatchJob(jobId: string): Promise<unknown> {
  return request("POST", "/api/genealogy/wikitree/queue/job", {
    action: "pause",
    jobId,
  });
}

export async function resumeWikiTreeMatchJob(jobId: string): Promise<unknown> {
  return request("POST", "/api/genealogy/wikitree/queue/job", {
    action: "resume",
    jobId,
  });
}

export async function cancelWikiTreeMatchJob(jobId: string): Promise<unknown> {
  return request("POST", "/api/genealogy/wikitree/queue/job", {
    action: "cancel",
    jobId,
  });
}

export async function drainWikiTreeMatchJob(
  jobId: string,
  maxOperations = 25,
): Promise<unknown> {
  return runWikiTreeLocalBridge(jobId, maxOperations);
}

export type BridgeOperation = {
  operationToken: string;
  operationId: string;
  version: number;
  action: "searchPerson" | "getProfile" | "getRelatives";
  parameters: Record<string, string>;
  parameterDigest: string;
  appId: string;
  endpoint: string;
  retryPolicy: { maxAttempts: number };
  claimExpiresAt: string;
};

const FAILURE_MESSAGE_LIMIT = 800;

type BridgeFailureKind = "empty_body" | "http" | "parse" | "network" | "retry_exhausted";

type BridgeFailure = {
  kind: BridgeFailureKind;
  message: string;
  status?: number;
  contentType?: string | null;
  responseLength?: number;
  responseBodyDigest?: string;
  attempt?: number;
  retryCount?: number;
  messageTruncated?: boolean;
  originalMessageLength?: number;
  emptyBodies: number;
  httpErrors: number;
  parseErrors: number;
  throttledResponses: number;
  successfulTransportResponses: number;
};

function unicodeLength(value: string): number {
  return Array.from(value).length;
}

export function truncateUnicode(value: string, maxLength: number): string {
  return Array.from(value).slice(0, maxLength).join("");
}

function responseDigest(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function safeFailureSummary(
  kind: BridgeFailureKind,
  error: unknown,
): Pick<BridgeFailure, "message" | "messageTruncated" | "originalMessageLength"> {
  const original = error instanceof Error ? error.message : String(error);
  const originalMessageLength = unicodeLength(original);
  const stable = kind === "network"
    ? (/timeout/i.test(original) ? "Browser navigation timed out" : "Browser transport request failed")
    : "WikiTree transport failed";
  const message = truncateUnicode(stable, FAILURE_MESSAGE_LIMIT);
  return {
    message,
    messageTruncated: original !== message,
    originalMessageLength,
  };
}

function responseFailure(
  previous: BridgeFailure,
  kind: BridgeFailureKind,
  message: string,
  response: { status: number; contentType: string | null; body: string },
  attempt: number,
): BridgeFailure {
  return {
    ...previous,
    kind,
    message: truncateUnicode(message, FAILURE_MESSAGE_LIMIT),
    status: response.status,
    contentType: response.contentType
      ? truncateUnicode(response.contentType, 200)
      : response.contentType,
    responseLength: Buffer.byteLength(response.body),
    responseBodyDigest: responseDigest(response.body),
    attempt,
    retryCount: Math.max(0, attempt - 1),
    messageTruncated: false,
    originalMessageLength: unicodeLength(message),
    emptyBodies: previous.emptyBodies + (kind === "empty_body" ? 1 : 0),
    httpErrors: previous.httpErrors + (kind === "http" ? 1 : 0),
    parseErrors: previous.parseErrors + (kind === "parse" ? 1 : 0),
    throttledResponses:
      previous.throttledResponses + (kind === "http" && response.status === 429 ? 1 : 0),
  };
}

async function sleep(ms: number): Promise<void> {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

export function fixedWikiTreeUrl(operation: BridgeOperation): URL {
  const endpoint = new URL(operation.endpoint);
  if (endpoint.href !== "https://api.wikitree.com/api.php") {
    throw new Error("Production supplied an invalid WikiTree endpoint");
  }
  const url = new URL(endpoint);
  url.searchParams.set("action", operation.action);
  url.searchParams.set("format", "json");
  url.searchParams.set("appId", operation.appId);
  for (const [key, value] of Object.entries(operation.parameters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export async function executeBridgeOperation(
  operation: BridgeOperation,
  suppliedTransport?: WikiTreeBrowserTransport,
  continueClaim = true,
): Promise<unknown> {
  const transport = suppliedTransport ?? new PlaywrightChromeTransport();
  const ownsTransport = !suppliedTransport;
  try {
  const maxAttempts = Math.min(3, Math.max(1, operation.retryPolicy.maxAttempts));
  let failure: BridgeFailure = {
    kind: "retry_exhausted",
    message: "Retry limit exhausted",
    attempt: 0,
    retryCount: 0,
    messageTruncated: false,
    originalMessageLength: 21,
    emptyBodies: 0,
    httpErrors: 0,
    parseErrors: 0,
    throttledResponses: 0,
    successfulTransportResponses: 0,
  };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reservation = await request("POST", "/api/genealogy/wikitree/bridge/reserve", {
      operationToken: operation.operationToken,
      version: operation.version,
      attempt,
    }) as { waitMs: number };
    await sleep(reservation.waitMs);
    let response;
    try {
      response = await transport.navigate(fixedWikiTreeUrl(operation));
    } catch (error) {
      const safe = safeFailureSummary("network", error);
      failure = {
        ...failure,
        kind: "network",
        ...safe,
        attempt,
        retryCount: Math.max(0, attempt - 1),
      };
      if (attempt < maxAttempts) await sleep(500 * (2 ** (attempt - 1)));
      continue;
    }
    const text = response.body;
      if (response.status >= 200 && response.status < 300) failure.successfulTransportResponses++;
      if (!text.trim()) {
        failure = responseFailure(
          failure, "empty_body", "Empty response body", response, attempt,
        );
      } else if (response.status < 200 || response.status >= 300) {
        failure = responseFailure(
          failure, "http", `HTTP ${response.status}`, response, attempt,
        );
      } else {
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          failure = responseFailure(
            failure, "parse", "Malformed JSON response", response, attempt,
          );
          if (attempt < maxAttempts) continue;
          break;
        }
        const submitted = await request("POST", "/api/genealogy/wikitree/bridge/submit", {
          type: "success",
          operationToken: operation.operationToken,
          version: operation.version,
          parameterDigest: operation.parameterDigest,
          continueClaim,
          response: body,
          metadata: {
            status: response.status,
            contentType: response.contentType,
            successfulTransportResponses: failure.successfulTransportResponses,
            emptyBodies: failure.emptyBodies,
            httpErrors: failure.httpErrors,
            parseErrors: failure.parseErrors,
            throttledResponses: failure.throttledResponses,
          },
        }) as Record<string, unknown>;
        return {
          ...submitted,
          transport: { kind: "playwright_chrome", headless: true },
        };
      }
    const retryAfter = Number(response.retryAfter);
    if (attempt < maxAttempts) {
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 500 * (2 ** (attempt - 1)));
    }
  }
  const submitted = await request("POST", "/api/genealogy/wikitree/bridge/submit", {
    type: "failure",
    operationToken: operation.operationToken,
    version: operation.version,
    parameterDigest: operation.parameterDigest,
    failure,
  }) as Record<string, unknown>;
  return {
    ...submitted,
    transport: { kind: "playwright_chrome", headless: true },
  };
  } finally {
    if (ownsTransport) await transport.close();
  }
}

async function runWikiTreeAdhocBridge(input: Record<string, unknown>): Promise<unknown> {
  const prepared = await request("POST", "/api/genealogy/wikitree/bridge/prepare", input) as {
    operation?: BridgeOperation;
  };
  if (!prepared.operation) throw new Error("Production did not prepare a WikiTree operation");
  const transport = new PlaywrightChromeTransport();
  try {
  const submitted = await executeBridgeOperation(prepared.operation, transport) as {
    done?: boolean;
    result?: unknown;
    transport?: unknown;
  };
  if (!submitted.done) throw new Error("Ad-hoc WikiTree operation did not complete");
  return { result: submitted.result, transport: submitted.transport };
  } finally {
    await transport.close();
  }
}

export async function expandWikiTreeGraphLocally(
  seedExternalId: string,
  targetPersonIds: string[],
): Promise<unknown> {
  return runWikiTreeAdhocBridge({ kind: "graph", seedExternalId, targetPersonIds });
}

export async function runWikiTreeLocalBridge(
  jobId: string,
  maxOperations = 25,
  suppliedTransport?: WikiTreeBrowserTransport,
): Promise<unknown> {
  const transport = suppliedTransport ?? new PlaywrightChromeTransport();
  const ownsTransport = !suppliedTransport;
  try {
  let processedOperations = 0;
  let last: unknown = null;
  while (processedOperations < maxOperations) {
    const claimed = await request("POST", "/api/genealogy/wikitree/bridge/claim", { jobId }) as {
      done?: boolean;
      busy?: boolean;
      status?: string;
      operation?: BridgeOperation;
    };
    if (claimed.done || claimed.busy || !claimed.operation) {
      return { ...claimed, processedOperations, last };
    }
    let operation: BridgeOperation | undefined = claimed.operation;
    while (operation && processedOperations < maxOperations) {
      const submitted = await executeBridgeOperation(
        operation,
        transport,
        processedOperations + 1 < maxOperations,
      ) as {
        done?: boolean;
        operation?: BridgeOperation;
      };
      processedOperations++;
      last = submitted;
      operation = submitted.operation;
    }
  }
  return { continue: true, processedOperations, last };
  } finally {
    if (ownsTransport) await transport.close();
  }
}

export async function getWikiTreeMatchJobStatus(jobId?: string): Promise<unknown> {
  const params: Record<string, string> = {};
  if (jobId) params.jobId = jobId;
  return request("GET", `/api/genealogy/wikitree/queue/job${qs(params)}`);
}

export async function listWikiTreeMatchJobs(): Promise<unknown> {
  return request("GET", "/api/genealogy/wikitree/queue/job?list=true");
}

export async function compareWikiTreeMatchJobs(
  baselineJobId: string,
  comparisonJobId: string,
): Promise<unknown> {
  return request(
    "GET",
    `/api/genealogy/wikitree/queue/job${qs({
      compareBaseline: baselineJobId,
      compareComparison: comparisonJobId,
    })}`,
  );
}

// ---------------------------------------------------------------------------
// NPI Search
// ---------------------------------------------------------------------------

export async function searchNpi(opts: {
  q: string;
  type?: string;
  city?: string;
  limit?: string;
}): Promise<unknown> {
  return request("GET", `/api/npi${qs(opts)}`);
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export async function onboard(data: {
  name: string;
  birthDate: string;
  sex: string;
  state?: string;
  heightIn?: number;
  timezone?: string;
  notes?: string;
}): Promise<unknown> {
  return request("POST", "/api/onboarding", data);
}
