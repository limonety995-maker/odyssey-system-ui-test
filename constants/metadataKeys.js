export const EXTENSION_ID = "com.codex.body-hp";

export const ROOM_SUPABASE_SETTINGS_KEY = `${EXTENSION_ID}/supabaseSettings`;
export const ROOM_CONTEXT_KEY = `${EXTENSION_ID}/roomContext`;
export const TOKEN_LINK_KEY = `${EXTENSION_ID}/link`;
export const SHELL_GLOBAL_KEY = "OdysseyBridge";

export function normalizeTokenCharacterLink(raw) {
  return {
    characterId: String(raw?.characterId ?? raw?.character_id ?? "").trim(),
    stateVersion: Math.max(
      0,
      Number(raw?.stateVersion ?? raw?.state_version ?? 0) || 0,
    ),
    statusSummary: String(raw?.statusSummary ?? raw?.status_summary ?? "").trim(),
    updatedAt: String(raw?.updatedAt ?? raw?.updated_at ?? "").trim(),
  };
}

export function hasTokenCharacterLink(raw) {
  return Boolean(normalizeTokenCharacterLink(raw).characterId);
}
