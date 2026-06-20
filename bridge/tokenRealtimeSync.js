import { addDiagnosticEntry } from "../utils/diagnostics.js";
import { normalizeError } from "../utils/errors.js";
import { normalizeTokenCharacterLink } from "../constants/metadataKeys.js";
import { getRealtimeClient } from "./realtimeClient.js";

const RECONCILE_DEBOUNCE_MS = 300;

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildContextKey(context) {
  return `${String(context?.roomId ?? "").trim()}::${String(context?.sceneId ?? "").trim()}`;
}

function buildMetadataPayload(link) {
  return normalizeTokenCharacterLink({
    characterId: link?.character_id,
    stateVersion: link?.state_version,
    statusSummary: link?.status_summary,
    updatedAt: link?.state_updated_at ?? link?.updated_at ?? new Date().toISOString(),
  });
}

function buildCombatStateMetadata(row) {
  return normalizeTokenCharacterLink({
    characterId: row?.character_id,
    stateVersion: row?.state_version,
    statusSummary: row?.status_summary,
    updatedAt: row?.updated_at ?? new Date().toISOString(),
  });
}

function metadataMatches(current, next) {
  return (
    current.characterId === next.characterId &&
    current.stateVersion === next.stateVersion &&
    current.statusSummary === next.statusSummary
  );
}

export function createTokenRealtimeSync({ runtime }) {
  const characterApi = runtime?.api?.character;
  const obrBridge = runtime?.bridges?.obr;
  const settingsBridge = runtime?.bridges?.settings;
  const tokenBridge = runtime?.bridges?.token;

  const state = {
    started: false,
    stopped: false,
    reconcileTimer: 0,
    reconcileQueuedReason: "",
    reconciling: false,
    playerUnsubscribe: null,
    sceneItemsUnsubscribe: null,
    sceneReadyUnsubscribe: null,
    tokenLinksChannel: null,
    combatChannels: new Map(),
    linksByTokenId: new Map(),
    linksByCharacterId: new Map(),
    roomId: "",
    sceneId: "",
    contextKey: "",
    lastSettings: null,
    realtimeClient: null,
  };

  function getSnapshot() {
    return {
      started: state.started,
      roomId: state.roomId,
      sceneId: state.sceneId,
      contextKey: state.contextKey,
      tokenLinks: Array.from(state.linksByTokenId.values()),
      linkedCharacterIds: Array.from(state.linksByCharacterId.keys()),
    };
  }

  async function getActiveSettings() {
    const settings = await settingsBridge.loadRoomSupabaseSettings();
    state.lastSettings = settings;
    return settings;
  }

  function clearTimer() {
    if (state.reconcileTimer) {
      clearTimeout(state.reconcileTimer);
      state.reconcileTimer = 0;
    }
  }

  function resolveRealtimeClient(settings) {
    const client = getRealtimeClient(settings);
    state.realtimeClient = client;
    return client;
  }

  function clearRealtimeSubscriptions({ dropClient = false } = {}) {
    const client = state.realtimeClient;
    if (state.tokenLinksChannel) {
      client?.removeChannel(state.tokenLinksChannel);
      state.tokenLinksChannel = null;
    }
    for (const channel of state.combatChannels.values()) {
      client?.removeChannel(channel);
    }
    state.combatChannels.clear();
    if (dropClient) {
      state.realtimeClient = null;
    }
  }

  function resetLinkMaps() {
    state.linksByTokenId = new Map();
    state.linksByCharacterId = new Map();
  }

  function updateLinkMaps(links) {
    resetLinkMaps();
    for (const link of safeArray(links)) {
      const tokenId = String(link?.token_id ?? "").trim();
      const characterId = String(link?.character_id ?? "").trim();
      if (!tokenId || !characterId) continue;
      state.linksByTokenId.set(tokenId, link);
      const existing = state.linksByCharacterId.get(characterId) ?? [];
      existing.push(link);
      state.linksByCharacterId.set(characterId, existing);
    }
  }

  async function writeMetadataIfNeeded(token, nextMetadata) {
    const current = tokenBridge.getTokenCharacterLink(token);
    if (metadataMatches(current, nextMetadata)) {
      return false;
    }
    await tokenBridge.setTokenCharacterLink(token.id, nextMetadata.characterId, nextMetadata);
    return true;
  }

  async function syncTokenMetadata(sceneItems, links) {
    const sceneById = new Map(
      safeArray(sceneItems).map((item) => [String(item?.id ?? "").trim(), item]),
    );
    let updateCount = 0;

    for (const link of safeArray(links)) {
      const tokenId = String(link?.token_id ?? "").trim();
      if (!tokenId) continue;
      const token = sceneById.get(tokenId);
      if (!token) continue;
      const nextMetadata = buildMetadataPayload(link);
      try {
        if (await writeMetadataIfNeeded(token, nextMetadata)) {
          updateCount += 1;
        }
      } catch (error) {
        const normalized = normalizeError(error, "Unable to update token metadata.");
        addDiagnosticEntry(
          "error",
          "Token metadata sync failed",
          `${tokenId}: ${normalized.message}`,
        );
      }
    }

    return updateCount;
  }

  async function clearOrphanedTokenMetadata(sceneItems, links) {
    const validTokenIds = new Set(
      safeArray(links)
        .map((link) => String(link?.token_id ?? "").trim())
        .filter(Boolean),
    );

    let clearedCount = 0;
    for (const item of safeArray(sceneItems)) {
      const tokenId = String(item?.id ?? "").trim();
      if (!tokenId || validTokenIds.has(tokenId)) continue;
      const current = tokenBridge.getTokenCharacterLink(item);
      if (!current.characterId) continue;
      try {
        await tokenBridge.clearTokenCharacterLink(tokenId);
        clearedCount += 1;
      } catch (error) {
        const normalized = normalizeError(error, "Unable to clear stale token metadata.");
        addDiagnosticEntry(
          "error",
          "Token metadata cleanup failed",
          `${tokenId}: ${normalized.message}`,
        );
      }
    }

    return clearedCount;
  }

  async function deactivateMissingSceneLinks(links, sceneItemIds, context, settings) {
    const staleLinks = safeArray(links).filter((link) => {
      const tokenId = String(link?.token_id ?? "").trim();
      return tokenId && !sceneItemIds.has(tokenId);
    });

    if (!staleLinks.length) {
      return 0;
    }

    let deletedCount = 0;
    for (const link of staleLinks) {
      try {
        const result = await characterApi.deactivateTokenLink(
          {
            room_id: context.roomId,
            scene_id: context.sceneId,
            token_id: link.token_id,
          },
          settings,
        );
        if (result?.ok !== false) {
          deletedCount += 1;
        }
      } catch (error) {
        const normalized = normalizeError(error, "Unable to deactivate stale token link.");
        addDiagnosticEntry(
          "error",
          "Token link cleanup failed",
          `${link?.token_id ?? "unknown"}: ${normalized.message}`,
        );
      }
    }

    return deletedCount;
  }

  async function ensureRealtimeChannels(context, settings) {
    const client = resolveRealtimeClient(settings);
    if (!client) {
      clearRealtimeSubscriptions({ dropClient: true });
      return;
    }

    const nextContextKey = buildContextKey(context);
    if (state.contextKey !== nextContextKey) {
      clearRealtimeSubscriptions();
      state.contextKey = nextContextKey;
      state.roomId = context.roomId;
      state.sceneId = context.sceneId;
    }

    if (!state.tokenLinksChannel) {
      state.tokenLinksChannel = client
        .channel(`odyssey:token-links:${nextContextKey}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "odyssey_token_links",
            filter: `room_id=eq.${context.roomId}`,
          },
          (payload) => {
            const row = payload?.new ?? payload?.old ?? {};
            if (String(row?.scene_id ?? "").trim() !== context.sceneId) {
              return;
            }
            scheduleReconcile("token-links-change");
          },
        )
        .subscribe();
    }

    const activeCharacterIds = new Set(state.linksByCharacterId.keys());

    for (const [characterId, channel] of state.combatChannels.entries()) {
      if (activeCharacterIds.has(characterId)) {
        continue;
      }
      client.removeChannel(channel);
      state.combatChannels.delete(characterId);
    }

    for (const characterId of activeCharacterIds) {
      if (state.combatChannels.has(characterId)) {
        continue;
      }
      const channel = client
        .channel(`odyssey:combat-state:${nextContextKey}:${characterId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "odyssey_character_combat_state",
            filter: `character_id=eq.${characterId}`,
          },
          async (payload) => {
            const row = payload?.new ?? null;
            if (!row?.character_id) {
              scheduleReconcile("combat-state-fallback");
              return;
            }
            const linkedTokens = state.linksByCharacterId.get(characterId) ?? [];
            if (!linkedTokens.length) {
              return;
            }
            const metadata = buildCombatStateMetadata(row);
            try {
              const nextLinkedTokens = linkedTokens.map((link) => ({
                ...link,
                state_version: metadata.stateVersion,
                status_summary: metadata.statusSummary,
                state_updated_at: metadata.updatedAt,
              }));
              state.linksByCharacterId.set(characterId, nextLinkedTokens);
              for (const link of nextLinkedTokens) {
                state.linksByTokenId.set(String(link?.token_id ?? "").trim(), link);
              }
              const sceneItems = await obrBridge.getSceneItems();
              const sceneById = new Map(
                safeArray(sceneItems).map((item) => [String(item?.id ?? "").trim(), item]),
              );
              for (const link of nextLinkedTokens) {
                const token = sceneById.get(String(link?.token_id ?? "").trim());
                if (!token) continue;
                await writeMetadataIfNeeded(token, metadata);
              }
            } catch (error) {
              const normalized = normalizeError(error, "Unable to apply combat-state metadata update.");
              addDiagnosticEntry(
                "error",
                "Combat state sync failed",
                `${characterId}: ${normalized.message}`,
              );
            }
          },
        )
        .subscribe();
      state.combatChannels.set(characterId, channel);
    }
  }

  async function reconcileNow(reason = "manual") {
    if (state.stopped) {
      return { ok: false, skipped: "stopped" };
    }
    if (state.reconciling) {
      state.reconcileQueuedReason = reason;
      return { ok: true, queued: true };
    }

    state.reconciling = true;
    try {
      const player = await obrBridge.getPlayerInfo();
      if (player.role !== "GM") {
        resetLinkMaps();
        clearRealtimeSubscriptions({ dropClient: true });
        return { ok: false, skipped: "not-gm" };
      }

      const settings = await getActiveSettings();
      if (!settingsBridge.hasSupabaseSettings(settings)) {
        resetLinkMaps();
        clearRealtimeSubscriptions({ dropClient: true });
        return { ok: false, skipped: "missing-settings" };
      }

      const context = await obrBridge.getRoomSceneContext();
      if (!context.roomId || !context.sceneId) {
        return { ok: false, skipped: "missing-context" };
      }

      const [sceneItems, tokenLinksResponse] = await Promise.all([
        obrBridge.getSceneItems(),
        characterApi.getRoomTokenLinks(
          {
            room_id: context.roomId,
            scene_id: context.sceneId,
          },
          settings,
        ),
      ]);

      const sceneItemIds = new Set(
        safeArray(sceneItems)
          .map((item) => String(item?.id ?? "").trim())
          .filter(Boolean),
      );
      const activeLinks = safeArray(tokenLinksResponse?.links).filter((link) => link?.is_active !== false);

      const staleCount = await deactivateMissingSceneLinks(activeLinks, sceneItemIds, context, settings);
      const validLinks = staleCount
        ? safeArray(
            (
              await characterApi.getRoomTokenLinks(
                {
                  room_id: context.roomId,
                  scene_id: context.sceneId,
                },
                settings,
              )
            )?.links,
          ).filter((link) => link?.is_active !== false)
        : activeLinks;

      updateLinkMaps(validLinks);
      const updatedCount = await syncTokenMetadata(sceneItems, validLinks);
      const clearedCount = await clearOrphanedTokenMetadata(sceneItems, validLinks);
      await ensureRealtimeChannels(context, settings);

      return {
        ok: true,
        reason,
        roomId: context.roomId,
        sceneId: context.sceneId,
        activeLinkCount: validLinks.length,
        staleCount,
        updatedCount,
        clearedCount,
      };
    } catch (error) {
      const normalized = normalizeError(error, "Token reconciliation failed.");
      addDiagnosticEntry("error", "Token realtime sync failed", normalized.message);
      return {
        ok: false,
        error: normalized.message,
      };
    } finally {
      state.reconciling = false;
      if (state.reconcileQueuedReason) {
        const nextReason = state.reconcileQueuedReason;
        state.reconcileQueuedReason = "";
        scheduleReconcile(nextReason);
      }
    }
  }

  function scheduleReconcile(reason = "scheduled", delay = RECONCILE_DEBOUNCE_MS) {
    if (state.stopped) return;
    clearTimer();
    state.reconcileTimer = setTimeout(() => {
      state.reconcileTimer = 0;
      void reconcileNow(reason);
    }, delay);
  }

  async function start() {
    if (state.started) {
      scheduleReconcile("restart");
      return api;
    }

    state.started = true;
    state.stopped = false;

    state.playerUnsubscribe = await obrBridge.subscribePlayerChanges(() => {
      scheduleReconcile("player-change");
    });
    state.sceneItemsUnsubscribe = await obrBridge.subscribeSceneItems(() => {
      scheduleReconcile("scene-items-change");
    });
    state.sceneReadyUnsubscribe = obrBridge.OBR?.scene?.onReadyChange?.((ready) => {
      if (ready) scheduleReconcile("scene-ready");
    }) ?? null;

    scheduleReconcile("startup", 0);
    return api;
  }

  function stop() {
    state.stopped = true;
    clearTimer();
    if (typeof state.playerUnsubscribe === "function") {
      state.playerUnsubscribe();
      state.playerUnsubscribe = null;
    }
    if (typeof state.sceneItemsUnsubscribe === "function") {
      state.sceneItemsUnsubscribe();
      state.sceneItemsUnsubscribe = null;
    }
    if (typeof state.sceneReadyUnsubscribe === "function") {
      state.sceneReadyUnsubscribe();
      state.sceneReadyUnsubscribe = null;
    }
    clearRealtimeSubscriptions({ dropClient: true });
    resetLinkMaps();
  }

  const api = {
    start,
    stop,
    scheduleReconcile,
    reconcileNow,
    getSnapshot,
  };

  return api;
}
