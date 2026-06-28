// Combat HUD — Phase 3B target profiles (PURE: no OBR, no DOM, no Supabase, no DB).
//
// A target profile is a local, extensible description of the selectable hit
// zones for a kind of target. Phase 3B ships a single generic "humanoid"
// profile; new profiles (mech, turret, beast…) can be added here later WITHOUT
// touching the TargetBlock component — it derives zones/labels from the profile.
//
// Zone ids are stable, UPPER_SNAKE wire values. They are intentionally generic
// (map-level UI only) and carry no private character data.

export const DEFAULT_PROFILE_ID = "humanoid";

export const HUMANOID_PROFILE = Object.freeze({
  id: "humanoid",
  zones: Object.freeze([
    Object.freeze({ id: "HEAD",      label: "Head" }),
    Object.freeze({ id: "TORSO",     label: "Torso" }),
    Object.freeze({ id: "LEFT_ARM",  label: "Left arm" }),
    Object.freeze({ id: "RIGHT_ARM", label: "Right arm" }),
    Object.freeze({ id: "LEFT_LEG",  label: "Left leg" }),
    Object.freeze({ id: "RIGHT_LEG", label: "Right leg" }),
  ]),
  defaultZoneId: "TORSO",
});

/** Registry of known profiles, keyed by id. */
const PROFILES = Object.freeze({
  humanoid: HUMANOID_PROFILE,
});

/** Resolve a profile by id; unknown ids fall back to the humanoid profile. */
export function getTargetProfile(profileId) {
  return PROFILES[String(profileId ?? "")] ?? HUMANOID_PROFILE;
}

/** The default zone id for a profile (e.g. "TORSO"). */
export function getDefaultZoneId(profileId) {
  return getTargetProfile(profileId).defaultZoneId;
}

/** Whether `zoneId` is a real zone of the profile. */
export function isValidZoneId(profileId, zoneId) {
  return getTargetProfile(profileId).zones.some((z) => z.id === zoneId);
}

/** Human-readable label for a zone (empty string when unknown). */
export function getZoneLabel(profileId, zoneId) {
  const zone = getTargetProfile(profileId).zones.find((z) => z.id === zoneId);
  return zone ? zone.label : "";
}

/**
 * Map a generic profile zone id → the silhouette body-part id understood by
 * hudIcons.humanoidSvg({ highlight }). Keeps the SVG layer agnostic of the
 * profile's wire ids. Unknown → null (no highlight).
 */
const ZONE_TO_SVG_PART = Object.freeze({
  HEAD: "head",
  TORSO: "torso",
  LEFT_ARM: "l_arm",
  RIGHT_ARM: "r_arm",
  LEFT_LEG: "l_leg",
  RIGHT_LEG: "r_leg",
});

export function zoneIdToSvgPart(zoneId) {
  return ZONE_TO_SVG_PART[String(zoneId ?? "")] ?? null;
}
