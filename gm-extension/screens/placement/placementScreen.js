// GM Placement Screen — token→character binding for Owlbear Rodeo.
// Flow: OBR token selected → load scene links → pick character from catalog → bind/spawn/unbind/delete.
// Only GMs see this screen. All mutations go through characterPlacementApi RPCs.

import placementStyles from "./placementStyles.css";
import { escapeHtml } from "../../utils/json.js";
import {
  loadDevSettings,
  hasUsableSettings,
  resolveEffectiveSettings,
} from "../resolveAttack/resolveAttackSettings.js";

const esc = (v) => escapeHtml(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const OBR_TIMEOUT = 1500;

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    Promise.resolve().then(() => promise).catch(() => fallback),
    new Promise((r) => setTimeout(() => r(fallback), ms)),
  ]);
}

function injectStylesOnce() {
  if (document.getElementById("pl-screen-styles")) return;
  const s = document.createElement("style");
  s.id = "pl-screen-styles";
  s.textContent = placementStyles;
  document.head.appendChild(s);
}

export function mountPlacementScreen({ root, runtime }) {
  injectStylesOnce();

  const api = runtime?.api ?? {};
  const bridges = runtime?.bridges ?? {};

  const state = {
    settings: loadDevSettings(),
    role: "PLAYER",
    obr: { roomId: "", sceneId: "", campaignId: "" },
    // selected OBR token
    selectedToken: null,         // { id, name, layer }
    existingLink: null,          // current scene link for selected token
    // catalog
    catalog: [],
    catalogFilter: "all",        // "all" | "player" | "npc_template" | "npc_active"
    catalogSearch: "",
    catalogLoading: false,
    // preview
    previewCharacter: null,      // { id, display_name, character_bucket, summary }
    // delete confirm
    deleteTarget: null,          // { id, display_name } pending confirmation
    deleteMode: "",              // "archive" | "hard_delete"
    // ui state
    busy: false,
    notice: "",
    noticeKind: "info",
    sceneLinksLoading: false,
  };

  const settings = () => state.settings;
  const isGM = () => state.role === "GM";

  /* ---- init ---- */
  (async () => {
    const dev = loadDevSettings();
    if (hasUsableSettings(dev)) {
      state.settings = dev;
    } else {
      const resolved = await resolveEffectiveSettings();
      state.settings = resolved.settings;
    }
    const player = await withTimeout(bridges.obr?.getPlayerInfo?.(), OBR_TIMEOUT, null);
    if (player?.role) state.role = String(player.role).toUpperCase() === "GM" ? "GM" : "PLAYER";
    const ctx = await withTimeout(bridges.obr?.getRoomSceneContext?.(), OBR_TIMEOUT, null);
    if (ctx) { state.obr.roomId = ctx.roomId || ""; state.obr.sceneId = ctx.sceneId || ""; state.obr.campaignId = ctx.campaignId || ""; }
    render();
    if (isGM()) {
      loadCatalog();
      await subscribeObrSelection();
    }
    root.addEventListener("click", onRootClick);
  })();

  /* ---- OBR token selection listener ---- */
  let _unsubPlayerChanges = null;

  async function syncSelectedToken(selectedIds) {
    const id = arr(selectedIds)[0] || null;
    if (!id) {
      state.selectedToken = null;
      state.existingLink = null;
      state.previewCharacter = null;
      render();
      return;
    }
    const sceneItems = await withTimeout(bridges.obr?.getSceneItems?.(), OBR_TIMEOUT, []);
    const token = arr(sceneItems).find((t) => t.id === id);
    state.selectedToken = token
      ? { id: token.id, name: token.name || token.id, layer: token.layer || "CHARACTER" }
      : { id, name: id, layer: "CHARACTER" };
    state.existingLink = null;
    state.previewCharacter = null;
    render();
    if (isGM() && state.obr.roomId && state.obr.sceneId) {
      await loadSceneLink(id);
    }
  }

  async function subscribeObrSelection() {
    const selectedIds = await withTimeout(bridges.obr?.getSelectedTokenIds?.(), OBR_TIMEOUT, []);
    await syncSelectedToken(selectedIds);
    if (!bridges.obr?.subscribePlayerChanges) return;
    _unsubPlayerChanges = bridges.obr.subscribePlayerChanges((player) => {
      syncSelectedToken(player.selection);
    });
  }

  async function loadSceneLink(tokenId) {
    state.sceneLinksLoading = true; render();
    try {
      const res = await api.placement.getSceneTokenLinks({
        room_id: state.obr.roomId,
        scene_id: state.obr.sceneId,
        token_id: tokenId,
      }, settings());
      const link = arr(res?.links).find((l) => l.token_id === tokenId && l.is_active !== false);
      state.existingLink = link || null;
    } catch { state.existingLink = null; }
    state.sceneLinksLoading = false; render();
  }

  async function loadCatalog() {
    state.catalogLoading = true; render();
    try {
      const includeActive = state.catalogFilter === "npc_active" || state.catalogFilter === "all";
      const payload = {
        campaign_id: state.obr.campaignId,
        room_id: state.obr.roomId,
        scene_id: state.obr.sceneId,
        include_active_npc: includeActive,
        limit: 100,
      };
      if (state.catalogSearch) payload.search = state.catalogSearch;
      const res = await api.placement.getCharacterSpawnCatalog(payload, settings());
      state.catalog = arr(res?.characters);
      if (!res?.ok) {
        setNotice("err", res?.message || "Catalog load failed.");
        state.catalog = [];
      }
    } catch (e) {
      setNotice("err", `Catalog error: ${esc(e.message)}`);
      state.catalog = [];
    }
    state.catalogLoading = false; render();
  }

  function setNotice(kind, msg) { state.noticeKind = kind; state.notice = msg; }

  /* ---- actions ---- */
  async function onBind(sourceCharacterId) {
    if (!state.selectedToken) { setNotice("warn", "Select a token first."); render(); return; }
    if (state.selectedToken.layer !== "CHARACTER") {
      setNotice("warn", `Tokens on the "${esc(state.selectedToken.layer)}" layer cannot be bound. Only CHARACTER layer is supported.`);
      render();
      return;
    }
    if (state.busy) return;
    state.busy = true; setNotice("info", "Binding…"); render();
    try {
      const selectedChar = arr(state.catalog).find((c) => c.id === sourceCharacterId);
      const bucket = selectedChar?.character_bucket || "unknown";
      const params = {
        source_character_id: sourceCharacterId,
        token_id: state.selectedToken.id,
        token_name: state.selectedToken.name,
        token_layer: state.selectedToken.layer || "CHARACTER",
        character_bucket: bucket,
        campaign_id: state.obr.campaignId || undefined,
        room_id: state.obr.roomId,
        scene_id: state.obr.sceneId,
        replace_existing_token_link: !!state.existingLink,
      };
      if (bucket === "npc_active") {
        params.allow_rebind_active_npc = true;
      }
      const res = await api.placement.loadCharacterToToken(params, settings());
      if (res?.ok === false) { setNotice("err", res.message || "Bind failed."); }
      else {
        const action = res?.action ?? "linked";
        setNotice("ok", actionLabel(action, res?.character?.name));
        await loadSceneLink(state.selectedToken.id);
        await loadCatalog();
      }
    } catch (e) { setNotice("err", e.message || "Bind failed."); }
    state.busy = false; render();
  }

  async function onUnbind() {
    if (!state.selectedToken || !state.existingLink) return;
    if (state.busy) return;
    state.busy = true; setNotice("info", "Unbinding…"); render();
    try {
      const res = await api.placement.unbindTokenCharacter({
        room_id: state.obr.roomId,
        scene_id: state.obr.sceneId,
        token_id: state.selectedToken.id,
      }, settings());
      if (res?.ok === false) { setNotice("err", res.message || "Unbind failed."); }
      else { setNotice("ok", `Unbound: ${esc(res?.character?.display_name || state.existingLink.character?.display_name || "")}`); state.existingLink = null; await loadCatalog(); }
    } catch (e) { setNotice("err", e.message || "Unbind failed."); }
    state.busy = false; render();
  }

  async function onDelete(characterId, mode) {
    if (state.busy) return;
    state.busy = true; setNotice("info", mode === "hard_delete" ? "Deleting permanently…" : "Archiving…"); render();
    try {
      const res = await api.placement.purgeActiveNpcs({ character_id: characterId, mode }, settings());
      if (res?.ok === false) { setNotice("err", res.message || "Delete failed."); }
      else {
        setNotice("ok", mode === "hard_delete" ? "NPC permanently deleted." : "NPC archived.");
        state.deleteTarget = null; state.deleteMode = "";
        if (state.existingLink?.character?.id === characterId) state.existingLink = null;
        await loadCatalog();
      }
    } catch (e) { setNotice("err", e.message || "Delete failed."); }
    state.busy = false; render();
  }

  function actionLabel(action, name) {
    const n = name ? ` "${esc(name)}"` : "";
    if (action === "spawned_npc") return `NPC${n} spawned and bound to token.`;
    if (action === "linked_player") return `Player${n} bound to token.`;
    if (action === "relinked_active_npc") return `NPC${n} rebound to token.`;
    return `Bound${n}.`;
  }

  /* ---- render ---- */
  function bucketLabel(b) {
    if (b === "player") return "Player";
    if (b === "npc_template") return "NPC Template";
    if (b === "npc_active") return "NPC Active";
    return b || "—";
  }
  function bucketBadge(b) {
    const cls = b === "player" ? "pl-badge-player" : b === "npc_template" ? "pl-badge-template" : "pl-badge-active";
    return `<span class="pl-badge ${cls}">${bucketLabel(b)}</span>`;
  }

  function renderNotice() {
    if (!state.notice) return "";
    return `<div class="pl-banner ${state.noticeKind}">${esc(state.notice)}</div>`;
  }

  function renderTokenPanel() {
    const t = state.selectedToken;
    if (!t) return `<div class="pl-empty">No token selected — click a token on the scene.</div>`;
    const link = state.existingLink;
    const loading = state.sceneLinksLoading;
    return `
      <div class="pl-token-panel">
        <div class="pl-token-row">
          <span class="pl-token-name">${esc(t.name)}</span>
          <span class="pl-token-layer pl-badge">${esc(t.layer || "CHARACTER")}</span>
        </div>
        ${loading ? `<div class="pl-muted">Checking link…</div>` : link ? `
          <div class="pl-link-row">
            <span class="pl-muted">Linked to:</span>
            <strong>${esc(link.character?.display_name || link.character?.character_key || link.character_id || "—")}</strong>
            ${bucketBadge(link.character?.character_bucket)}
          </div>
          <div class="pl-link-state">${esc(link.state?.status_summary || "")}</div>
          <div class="pl-actions-row">
            <button class="pl-btn pl-btn-danger" data-action="unbind" ${state.busy ? "disabled" : ""}>Unbind</button>
          </div>` : `<div class="pl-muted">No active link — select a character below to bind.</div>`}
      </div>`;
  }

  function renderCatalog() {
    const items = state.catalogFilter === "all"
      ? state.catalog
      : state.catalog.filter((c) => c.character_bucket === state.catalogFilter);
    const loading = state.catalogLoading;
    return `
      <div class="pl-catalog">
        <div class="pl-catalog-controls">
          <div class="pl-control-group">
            <label class="pl-label">Search</label>
            <input class="pl-search" type="text" placeholder="Filter by character name or key…" value="${esc(state.catalogSearch)}" data-ref="search">
          </div>
          <div class="pl-control-group">
            <label class="pl-label">Type</label>
            <select class="pl-filter" data-ref="filter">
              <option value="all" ${state.catalogFilter === "all" ? "selected" : ""}>All</option>
              <option value="player" ${state.catalogFilter === "player" ? "selected" : ""}>Player</option>
              <option value="npc_template" ${state.catalogFilter === "npc_template" ? "selected" : ""}>NPC Template</option>
              <option value="npc_active" ${state.catalogFilter === "npc_active" ? "selected" : ""}>NPC Active</option>
            </select>
          </div>
        </div>
        ${loading ? `<div class="pl-muted">Loading…</div>` : !items.length ? `<div class="pl-empty">No characters found.</div>` : `
          <div class="pl-list">
            ${items.map(renderCatalogItem).join("")}
          </div>`}
      </div>`;
  }

  function renderCatalogItem(c) {
    const isLinked = !!c.linked_token_id;
    const canBind = !!state.selectedToken && !state.busy;
    const displayName = c.name || c.character_key;
    const btnLabel = c.character_bucket === "player" ? "Bind Player"
      : c.character_bucket === "npc_template" ? "Spawn NPC"
      : "Rebind NPC";

    return `
      <div class="pl-item ${isLinked ? "pl-item-linked" : ""}">
        <div class="pl-item-head">
          <span class="pl-item-name">${esc(displayName)}</span>
          ${bucketBadge(c.character_bucket)}
          ${isLinked ? `<span class="pl-badge pl-badge-on-scene">On scene</span>` : ""}
        </div>
        ${c.status_summary ? `<div class="pl-item-status pl-muted">${esc(c.status_summary)}</div>` : ""}
        <div class="pl-item-actions">
          <button class="pl-btn pl-btn-primary" data-action="bind" data-char="${esc(c.id)}" ${canBind ? "" : "disabled"}>${btnLabel}</button>
        </div>
      </div>`;
  }

  function renderDeleteConfirm() {
    if (!state.deleteTarget) return "";
    const hard = state.deleteMode === "hard_delete";
    return `
      <div class="pl-overlay">
        <div class="pl-dialog">
          <h3>${hard ? "Permanently delete NPC?" : "Archive NPC?"}</h3>
          <p class="pl-muted">${hard
            ? `<strong>${esc(state.deleteTarget.display_name)}</strong> and all associated logs, links, and initiative entries will be <strong>permanently removed</strong>. This cannot be undone.`
            : `<strong>${esc(state.deleteTarget.display_name)}</strong> will be hidden from the scene. History is preserved and the NPC can be restored.`
          }</p>
          <div class="pl-dialog-actions">
            <button class="pl-btn ${hard ? "pl-btn-danger" : "pl-btn-secondary"}" data-action="confirm-delete">
              ${hard ? "Delete permanently" : "Archive"}
            </button>
            <button class="pl-btn pl-btn-ghost" data-action="cancel-delete">Cancel</button>
          </div>
        </div>
      </div>`;
  }

  function render() {
    if (!isGM()) {
      root.innerHTML = `<div class="pl-screen pl-screen-nogm"><p class="pl-muted">Placement tools are available to GMs only.</p></div>`;
      return;
    }
    root.innerHTML = `
      <div class="pl-screen">
        <div class="pl-header">
          <span class="pl-title">Token Placement</span>
        </div>
        ${renderNotice()}
        <section class="pl-section">
          <div class="pl-section-title">Selected Token</div>
          ${renderTokenPanel()}
        </section>
        <section class="pl-section">
          <div class="pl-section-title">Character Catalog</div>
          ${renderCatalog()}
        </section>
        ${renderDeleteConfirm()}
      </div>`;
    bindEvents();
  }

  /* ---- event binding ---- */
  function bindEvents() {
    const searchEl = root.querySelector("[data-ref='search']");
    if (searchEl) {
      searchEl.addEventListener("input", (e) => {
        state.catalogSearch = e.target.value;
        clearTimeout(state._searchTimer);
        state._searchTimer = setTimeout(() => loadCatalog(), 300);
      });
    }
    const filterEl = root.querySelector("[data-ref='filter']");
    if (filterEl) {
      filterEl.addEventListener("change", (e) => {
        state.catalogFilter = e.target.value;
        loadCatalog();
      });
    }
  }

  function onRootClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const charId = btn.dataset.char;

    if (action === "bind") { onBind(charId); return; }
    if (action === "unbind") { onUnbind(); return; }
    if (action === "confirm-delete") { onDelete(state.deleteTarget.id, state.deleteMode); return; }
    if (action === "cancel-delete") { state.deleteTarget = null; state.deleteMode = ""; render(); return; }
  }

  render();

  return () => {
    root.removeEventListener("click", onRootClick);
    if (typeof _unsubPlayerChanges === "function") _unsubPlayerChanges();
  };
}
