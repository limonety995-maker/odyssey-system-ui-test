import { addDiagnosticEntry } from "../utils/diagnostics.js";
import { toErrorMessage } from "../utils/errors.js";
import { safeJsonParse } from "../utils/json.js";
import { CHARACTER_PLACEMENT_RPC_NAMES } from "../constants/rpcNames.js";
import { normalizeSupabaseSettings } from "./settingsBridge.js";

function getSupabaseSettingsOrThrow(settings) {
  const normalized = normalizeSupabaseSettings(settings);
  if (!normalized.url) {
    throw new Error("Supabase URL is not configured.");
  }
  if (!normalized.apiKey) {
    throw new Error("Supabase public key is not configured.");
  }
  return normalized;
}

function buildHeaders(apiKey, method, extraHeaders = {}, prefer = "return=representation") {
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    ...extraHeaders,
  };
  if (method !== "GET" && method !== "HEAD" && prefer) {
    headers.Prefer = prefer;
  }
  return headers;
}

function isSupabaseDebugEnabled() {
  try {
    if (globalThis.localStorage?.getItem("odyssey.debug") === "1") return true;
  } catch (_error) {
    // ignore storage access failures
  }
  try {
    return /[?&](odysseyDebug|debugRpc)=1(?:&|$)/i.test(
      String(globalThis.location?.search ?? ""),
    );
  } catch (_error) {
    return false;
  }
}

function logSupabaseDebug(message, payload) {
  if (!isSupabaseDebugEnabled()) return;
  if (payload === undefined) {
    console.info(message);
    return;
  }
  console.info(message, payload);
}

async function parseSupabaseResponse(response, fallbackMessage, requestId = "") {
  logSupabaseDebug(`[Odyssey RPC ${requestId}] response headers received`, {
    status: response.status,
    ok: response.ok,
  });
  const rawText = await response.text();
  logSupabaseDebug(`[Odyssey RPC ${requestId}] response body read`, {
    bytes: rawText.length,
  });
  const body = safeJsonParse(rawText, rawText || null);
  if (!response.ok) {
    throw new Error(
      toErrorMessage(body, fallbackMessage || "Supabase request failed."),
    );
  }
  return body;
}

async function requestSupabase(path, options = {}) {
  const {
    method = "GET",
    body,
    settings,
    headers = {},
    prefer = "return=representation",
    fallbackMessage = "Supabase request failed.",
  } = options;
  const { url, apiKey } = getSupabaseSettingsOrThrow(settings);
  const requestId =
    globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const requestInit = {
    method,
    headers: buildHeaders(apiKey, method, headers, prefer),
  };
  if (body !== undefined) {
    requestInit.body = JSON.stringify(body);
    requestInit.headers["Content-Type"] = "application/json";
  }
  try {
    logSupabaseDebug(`[Odyssey RPC ${requestId}] request prepared`, {
      method,
      path,
    });
    logSupabaseDebug(`[Odyssey RPC ${requestId}] fetch starting`);
    const fetchPromise = fetch(`${url}/rest/v1/${path}`, requestInit);
    logSupabaseDebug(`[Odyssey RPC ${requestId}] fetch promise created`);
    const response = await fetchPromise;
    return await parseSupabaseResponse(response, fallbackMessage, requestId);
  } catch (error) {
    addDiagnosticEntry(
      "error",
      "Supabase request failed",
      `${method} ${path}: ${toErrorMessage(error)}`,
    );
    throw error;
  }
}

export async function callSupabaseRpc(functionName, payload, settings) {
  return requestSupabase(`rpc/${functionName}`, {
    method: "POST",
    body: payload ?? {},
    settings,
    fallbackMessage: `Supabase RPC ${functionName} failed.`,
  });
}

export async function fetchSupabaseRows(path, settings, fallbackMessage = "Supabase query failed.") {
  return requestSupabase(path, {
    method: "GET",
    settings,
    fallbackMessage,
  });
}

export async function mutateSupabaseRows(path, body, settings, options = {}) {
  return requestSupabase(path, {
    method: options.method ?? "POST",
    body,
    settings,
    prefer: options.prefer ?? "return=representation",
    fallbackMessage: options.fallbackMessage ?? "Supabase mutation failed.",
    headers: options.headers ?? {},
  });
}

export async function testSupabaseConnection(settings) {
  const rows = await fetchSupabaseRows(
    "odyssey_characters?select=id&limit=1",
    settings,
    "Unable to query Supabase connection test.",
  );
  return {
    ok: true,
    sampleRowCount: Array.isArray(rows) ? rows.length : 0,
  };
}

export async function fetchTokenLinks(roomIdOrPayload, sceneId = "", settings) {
  const payload =
    roomIdOrPayload && typeof roomIdOrPayload === "object"
      ? roomIdOrPayload
      : {
          room_id: String(roomIdOrPayload ?? "").trim(),
          scene_id: String(sceneId ?? "").trim(),
        };
  const result = await callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.getSceneTokenLinks,
    payload,
    settings,
  );
  return Array.isArray(result?.links) ? result.links : [];
}

export async function upsertTokenLinkRecord(payload, settings) {
  const row = {
    campaign_id: String(payload?.campaign_id ?? "").trim(),
    room_id: String(payload?.room_id ?? "").trim(),
    scene_id: String(payload?.scene_id ?? "").trim(),
    token_id: String(payload?.token_id ?? "").trim(),
    character_id: String(payload?.character_id ?? "").trim(),
    character_key: String(payload?.character_key ?? "").trim(),
    token_name: String(payload?.token_name ?? "").trim(),
    token_layer: String(payload?.token_layer ?? "CHARACTER").trim(),
    is_active: payload?.is_active !== false,
    last_seen_at: new Date().toISOString(),
  };
  const rows = await mutateSupabaseRows(
    "odyssey_token_links?on_conflict=room_id,scene_id,token_id",
    [row],
    settings,
    {
      prefer: "resolution=merge-duplicates,return=representation",
      fallbackMessage: "Unable to upsert token link in Supabase.",
    },
  );
  return Array.isArray(rows) ? rows[0] ?? null : rows;
}

export async function deactivateTokenLinkRecord(roomId, sceneId, tokenId, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.unbindTokenCharacter,
    {
      room_id: String(roomId ?? "").trim(),
      scene_id: String(sceneId ?? "").trim(),
      token_id: String(tokenId ?? "").trim(),
    },
    settings,
  );
}
