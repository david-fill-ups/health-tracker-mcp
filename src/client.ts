const BASE_URL = process.env.HEALTH_TRACKER_URL ?? "http://localhost:3000";
const API_KEY = process.env.HEALTH_TRACKER_API_KEY ?? "";

let activeProfileId: string | null = null;

export function getActiveProfileId(): string | null {
  return activeProfileId;
}

export function setActiveProfileId(id: string | null): void {
  activeProfileId = id;
}

function requireProfileId(explicit?: string): string {
  const id = explicit ?? activeProfileId;
  if (!id) throw new Error("No active profile. Use switch_profile first or provide a profileId.");
  return id;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const hdrs: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  };
  const res = await fetch(url, {
    method,
    headers: hdrs,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as { error?: string };
      detail = err.error ? `: ${err.error}` : "";
    } catch {}
    throw new Error(`health-tracker ${method} ${path} → ${res.status}${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function withProfile(path: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
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
  limit?: string;
  cursor?: string;
}): Promise<unknown> {
  return request(
    "GET",
    withProfile("/api/visits", opts as Record<string, string>),
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
