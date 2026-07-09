// Ability Studio — Phase 4.1C.0: structured debug events.
//
// gm-extension is a separate OBR extension/popover from the main Odyssey
// System extension (own manifest.json, no background_url) — it cannot reach
// the main extension's in-memory Debug Console log store (hud/debug/*,
// which is explicitly scoped to that background page and never persists).
// Ability Studio therefore logs through utils/diagnostics.js (the same
// generic, in-memory diagnostics feed already imported by background.js),
// and the Ability Studio screen renders its own small "Recent events" list
// from it — honest about the architectural boundary rather than pretending
// to feed a console it cannot reach.
//
// Safe fields only, per task spec: abilityId, abilityName, template,
// classification, characterId, serverCode, serverMessage. Never the full
// runtime bundle, credentials, Supabase keys, auth/session tokens, hidden
// GM-only data, raw SQL, or unrelated inventory data.

import { addDiagnosticEntry } from "../../utils/diagnostics.js";

const SAFE_KEYS = [
  "abilityId",
  "abilityName",
  "template",
  "classification",
  "characterId",
  "serverCode",
  "serverMessage",
];

function sanitize(fields) {
  const safe = {};
  const source = fields && typeof fields === "object" ? fields : {};
  for (const key of SAFE_KEYS) {
    if (source[key] !== undefined) {
      safe[key] = source[key];
    }
  }
  return safe;
}

export function logAbilityStudioEvent(eventName, fields = {}) {
  const safe = sanitize(fields);
  return addDiagnosticEntry("info", `ability-studio: ${eventName}`, JSON.stringify(safe));
}

export function logAbilityStudioError(eventName, message, fields = {}) {
  const safe = sanitize(fields);
  return addDiagnosticEntry("error", `ability-studio: ${eventName}`, `${message} ${JSON.stringify(safe)}`);
}
