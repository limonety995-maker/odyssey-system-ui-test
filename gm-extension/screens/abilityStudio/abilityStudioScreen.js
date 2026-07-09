// Ability Studio — Phase 4.1C.0. GM-only tool for creating, validating,
// previewing, and assigning abilities that Skills Block can classify and
// execute correctly. See docs/PHASE_4_1C_0_ABILITY_STUDIO_AUDIT.md.
//
// Lives entirely inside gm-extension — a separate OBR extension/popover from
// the combat HUD, mounted the same way Creator/Placement already are (own
// screen module + nav tab in gm-extension/main.js). It never touches
// combat-hud-overlay.html, hudLayout.js, scene click listeners, or targeting
// — it only calls Supabase RPCs.

import abilityStudioStyles from "./abilityStudioStyles.css";
import { escapeHtml } from "../../../utils/json.js";
import {
  loadDevSettings,
  hasUsableSettings,
  resolveEffectiveSettings,
} from "../../../screens/resolveAttack/resolveAttackSettings.js";
import { classifyAbilityForStudio, HUD_CLASSIFICATION } from "../../../hud/abilities/abilityStudioClassification.js";
import {
  ABILITY_STUDIO_TEMPLATES,
  TEMPLATE_LABELS,
  createEmptyDraft,
  validateAbilityDraft,
} from "../../../hud/abilities/abilityStudioTemplates.js";
import { logAbilityStudioEvent, logAbilityStudioError } from "../../../hud/abilities/abilityStudioDebugEvents.js";
import { subscribeDiagnostics } from "../../../utils/diagnostics.js";

const esc = (v) => escapeHtml(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const OBR_TIMEOUT = 1500;

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    Promise.resolve().then(() => promise).catch(() => fallback),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function injectStylesOnce() {
  if (document.getElementById("as-screen-styles")) return;
  const s = document.createElement("style");
  s.id = "as-screen-styles";
  s.textContent = abilityStudioStyles;
  document.head.appendChild(s);
}

function badgeClassFor(classification) {
  if (classification === HUD_CLASSIFICATION.armedAttackTechnique) return "as-badge-armed";
  if (classification === HUD_CLASSIFICATION.directAbilityAttack) return "as-badge-direct";
  if (classification === HUD_CLASSIFICATION.instantSelfAbility) return "as-badge-instant";
  if (classification === HUD_CLASSIFICATION.directedTargetAbility) return "as-badge-directed";
  return "as-badge-unsupported";
}

export function mountAbilityStudioScreen({ root, runtime }) {
  injectStylesOnce();

  const api = runtime?.api ?? {};
  const bridges = runtime?.bridges ?? {};

  const state = {
    settings: loadDevSettings(),
    role: "PLAYER",
    obr: { roomId: "", sceneId: "", campaignId: "" },
    view: "library", // "library" | "detail" | "create"
    catalog: [],
    catalogLoading: false,
    catalogSearch: "",
    detailAbilityId: null,
    detail: null, // { ability, levels, classification }
    detailLoading: false,
    characters: [],
    charactersLoading: false,
    selectedCharacterId: "",
    assignBusy: false,
    lastAssignment: null, // { characterAbilityId, characterId }
    createTemplate: null,
    draft: null,
    draftErrors: [],
    saveBusy: false,
    notice: "",
    noticeKind: "info",
    events: [],
  };

  const settings = () => state.settings;
  const isGM = () => state.role === "GM";

  function setNotice(kind, message) {
    state.noticeKind = kind;
    state.notice = message;
  }

  const unsubscribeEvents = subscribeDiagnostics((entries) => {
    state.events = arr(entries)
      .filter((e) => e.title?.startsWith("ability-studio"))
      .slice(0, 8);
    render();
  });

  /* ---- data loading ---- */
  async function loadCatalog() {
    state.catalogLoading = true;
    render();
    const res = await api.abilityStudio.listAbilityCatalog({ search: state.catalogSearch || null }, settings());
    state.catalogLoading = false;
    if (!res.ok) {
      setNotice("err", res.error);
      state.catalog = [];
    } else {
      state.catalog = arr(res.data?.items);
      logAbilityStudioEvent("ability-catalog-loaded", { classification: `${state.catalog.length} items` });
    }
    render();
  }

  async function openDetail(abilityId) {
    state.view = "detail";
    state.detailAbilityId = abilityId;
    state.detail = null;
    state.detailLoading = true;
    state.lastAssignment = null;
    state.selectedCharacterId = "";
    render();

    const res = await api.abilityStudio.getAbilityDetail(abilityId, settings());
    state.detailLoading = false;
    if (!res.ok) {
      setNotice("err", res.error);
      logAbilityStudioError("ability-detail-loaded", res.error, { abilityId });
      render();
      return;
    }
    const ability = res.data.ability;
    const levels = arr(res.data.levels);
    const classification = classifyAbilityForStudio(ability, levels);
    state.detail = { ability, levels, classification };
    logAbilityStudioEvent("ability-detail-loaded", {
      abilityId,
      abilityName: ability?.name,
      classification: classification.classification,
    });
    render();
  }

  async function ensureCharactersLoaded() {
    if (state.characters.length || state.charactersLoading) return;
    state.charactersLoading = true;
    render();
    const res = await api.abilityStudio.listAssignableCharacters(
      {
        campaign_id: state.obr.campaignId,
        room_id: state.obr.roomId,
        scene_id: state.obr.sceneId,
        limit: 200,
      },
      settings(),
    );
    state.charactersLoading = false;
    if (res.ok) {
      state.characters = arr(res.data?.characters);
    }
    render();
  }

  async function onAssign() {
    if (!state.detail || !state.selectedCharacterId || state.assignBusy) return;
    state.assignBusy = true;
    setNotice("info", "Assigning…");
    render();
    const abilityId = state.detailAbilityId;
    const characterId = state.selectedCharacterId;
    logAbilityStudioEvent("ability-assign-requested", {
      abilityId,
      abilityName: state.detail.ability?.name,
      characterId,
    });
    const res = await api.abilityStudio.assignAbilityToCharacter({ abilityId, characterId }, settings());
    state.assignBusy = false;
    if (!res.ok) {
      setNotice("err", res.error);
      logAbilityStudioError("ability-assign-result", res.error, { abilityId, characterId, serverCode: res.code });
      render();
      return;
    }
    state.lastAssignment = { characterAbilityId: res.data.character_ability_id, characterId };
    setNotice("ok", "Ability assigned. The character's Skills Block will pick it up on its next runtime refresh.");
    logAbilityStudioEvent("ability-assign-result", { abilityId, characterId, classification: "ok" });
    render();
  }

  async function onRemoveLastAssignment() {
    if (!state.lastAssignment || state.assignBusy) return;
    state.assignBusy = true;
    render();
    const { characterAbilityId } = state.lastAssignment;
    const res = await api.abilityStudio.removeAbilityFromCharacter({ characterAbilityId }, settings());
    state.assignBusy = false;
    if (!res.ok) {
      setNotice("err", res.error);
      render();
      return;
    }
    setNotice("ok", "Assignment removed.");
    state.lastAssignment = null;
    render();
  }

  function startCreate(template) {
    state.view = "create";
    state.createTemplate = template;
    state.draft = createEmptyDraft(template);
    state.draftErrors = [];
    setNotice("info", "");
    render();
  }

  function updateDraftField(field, value) {
    if (!state.draft) return;
    state.draft = { ...state.draft, [field]: value };
    const validation = validateAbilityDraft(state.draft);
    state.draftErrors = validation.errors;
    render();
  }

  async function onSaveDraft() {
    if (!state.draft || state.saveBusy) return;
    const validation = validateAbilityDraft(state.draft);
    state.draftErrors = validation.errors;
    logAbilityStudioEvent("ability-draft-validated", {
      template: state.draft.template,
      classification: validation.ok ? "valid" : "invalid",
    });
    if (!validation.ok) {
      render();
      return;
    }
    state.saveBusy = true;
    setNotice("info", "Saving…");
    render();
    logAbilityStudioEvent("ability-create-requested", {
      abilityName: state.draft.name,
      template: state.draft.template,
    });
    const res = await api.abilityStudio.createAbilityFromTemplate(state.draft, settings());
    state.saveBusy = false;
    if (!res.ok) {
      setNotice("err", res.error);
      logAbilityStudioError("ability-create-result", res.error, { abilityName: state.draft.name, serverCode: res.code });
      render();
      return;
    }
    setNotice("ok", `"${state.draft.name}" saved.`);
    logAbilityStudioEvent("ability-create-result", {
      abilityId: res.data.entity_id,
      abilityName: state.draft.name,
      template: state.draft.template,
    });
    await loadCatalog();
    await openDetail(res.data.entity_id);
  }

  /* ---- render: library ---- */
  function renderClassificationBadge(classification) {
    return `<span class="as-badge ${badgeClassFor(classification)}">${esc(classification)}</span>`;
  }

  function renderCatalogItem(item) {
    return `
      <div class="as-item" data-action="open-detail" data-ability="${esc(item.id)}">
        <div class="as-item-head">
          <span class="as-item-name">${esc(item.name)}</span>
          <span class="as-badge">${esc(item.ability_kind || "custom")}</span>
        </div>
        <div class="as-item-sub">${esc(item.code)} · ${esc(item.source_type || "custom")}</div>
      </div>`;
  }

  function renderLibrary() {
    return `
      <section class="as-section">
        <div class="as-section-title">Ability Catalog</div>
        <input class="as-search" type="text" placeholder="Search abilities…" value="${esc(state.catalogSearch)}" data-ref="search">
        ${state.catalogLoading
          ? `<div class="as-muted">Loading…</div>`
          : !state.catalog.length
            ? `<div class="as-empty">No abilities found.</div>`
            : `<div class="as-list">${state.catalog.map(renderCatalogItem).join("")}</div>`}
      </section>
      <section class="as-section">
        <div class="as-section-title">Create From Template</div>
        <div class="as-templates">
          ${Object.values(ABILITY_STUDIO_TEMPLATES).map((template) => `
            <button class="as-template-btn" type="button" data-action="start-create" data-template="${esc(template)}">
              ${esc(TEMPLATE_LABELS[template])}
            </button>`).join("")}
        </div>
      </section>`;
  }

  /* ---- render: detail ---- */
  function renderClassificationPreview(classification) {
    const c = classification;
    return `
      <div class="as-classification-box">
        <div><strong>HUD classification:</strong> ${esc(c.classification)}</div>
        <div><strong>Execution path:</strong> ${esc(c.executionPath)}</div>
        <div><strong>Requires selected target:</strong> ${c.requiresSelectedTarget ? "yes" : "no"}</div>
        <div><strong>Requires body zone:</strong> ${c.requiresBodyZone ? "yes" : "no"}</div>
        <div><strong>Uses weapon/ammo:</strong> ${c.usesWeaponAmmo ? "yes" : "no"}</div>
        <div><strong>Effect support:</strong> ${esc(c.effectSupport)}</div>
        ${c.unsupportedReason ? `<div class="as-muted">Reason: ${esc(c.unsupportedReason)}</div>` : ""}
        <div><strong>Can assign to character:</strong> ${c.canAssignToCharacter ? "yes" : "no"}</div>
        <div><strong>Can execute from Skills Block:</strong> ${c.canExecuteFromSkillsBlock ? "yes" : "no"}</div>
      </div>`;
  }

  function renderAssignPanel() {
    const chars = state.characters;
    return `
      <section class="as-section">
        <div class="as-section-title">Assign to Character</div>
        ${state.charactersLoading ? `<div class="as-muted">Loading characters…</div>` : `
          <select class="as-select" data-ref="character">
            <option value="">Select a character…</option>
            ${chars.map((c) => `<option value="${esc(c.id)}" ${state.selectedCharacterId === c.id ? "selected" : ""}>${esc(c.name || c.character_key)}</option>`).join("")}
          </select>`}
        <div class="as-field-row">
          <button class="as-btn as-btn-primary" type="button" data-action="assign" ${state.assignBusy || !state.selectedCharacterId ? "disabled" : ""}>Assign</button>
          ${state.lastAssignment ? `<button class="as-btn as-btn-danger" type="button" data-action="remove-assignment" ${state.assignBusy ? "disabled" : ""}>Remove last assignment</button>` : ""}
        </div>
      </section>`;
  }

  function renderDetail() {
    if (state.detailLoading || !state.detail) {
      return `<div class="as-muted">Loading…</div>`;
    }
    const { ability, classification } = state.detail;
    return `
      <button class="as-btn as-btn-ghost" type="button" data-action="back-to-library">&larr; Back to catalog</button>
      <section class="as-section">
        <div class="as-detail">
          <div class="as-item-head">
            <span class="as-item-name">${esc(ability.name)}</span>
            ${renderClassificationBadge(classification.classification)}
          </div>
          <div class="as-muted">${esc(ability.description || "")}</div>
          <dl>
            <div class="as-detail-row"><dt>Code</dt><dd>${esc(ability.code)}</dd></div>
            <div class="as-detail-row"><dt>Semantic kind</dt><dd>${esc(ability.ability_kind)}</dd></div>
            <div class="as-detail-row"><dt>Target type</dt><dd>${esc(ability.target_type)}</dd></div>
            <div class="as-detail-row"><dt>Effect mode</dt><dd>${esc(ability.effect_mode)}</dd></div>
            <div class="as-detail-row"><dt>Cost</dt><dd>${classification.costs.main} MAIN${classification.costs.psi ? ` / ${classification.costs.psi} PSI` : ""}</dd></div>
            <div class="as-detail-row"><dt>Cooldown</dt><dd>${classification.cooldown.max} ${esc(classification.cooldown.unit)}(s)</dd></div>
          </dl>
        </div>
        ${renderClassificationPreview(classification)}
      </section>
      ${renderAssignPanel()}`;
  }

  /* ---- render: create ---- */
  function renderTemplateFields() {
    const d = state.draft;
    const template = state.createTemplate;
    const isAttackTemplate =
      template === ABILITY_STUDIO_TEMPLATES.armedAttackTechnique
      || template === ABILITY_STUDIO_TEMPLATES.directAbilityAttack;
    const showTargetChoice =
      template === ABILITY_STUDIO_TEMPLATES.armedAttackTechnique
      || template === ABILITY_STUDIO_TEMPLATES.directAbilityAttack;

    return `
      <div class="as-field"><label class="as-field-label">Code</label>
        <input class="as-input" data-ref="code" value="${esc(d.code)}" placeholder="my_ability_code"></div>
      <div class="as-field"><label class="as-field-label">Name</label>
        <input class="as-input" data-ref="name" value="${esc(d.name)}"></div>
      <div class="as-field"><label class="as-field-label">Description</label>
        <input class="as-input" data-ref="description" value="${esc(d.description)}"></div>
      <div class="as-field-row">
        <div class="as-field"><label class="as-field-label">Cost</label>
          <input class="as-input" data-ref="resourceCost" type="number" min="0" value="${esc(d.resourceCost)}"></div>
        <div class="as-field"><label class="as-field-label">Cooldown (rounds)</label>
          <input class="as-input" data-ref="cooldownRounds" type="number" min="0" value="${esc(d.cooldownRounds)}"></div>
      </div>
      ${showTargetChoice ? `
        <div class="as-field"><label class="as-field-label">Target type</label>
          <select class="as-select" data-ref="targetType">
            <option value="character" ${d.targetType === "character" ? "selected" : ""}>Character</option>
            <option value="body_part" ${d.targetType === "body_part" ? "selected" : ""}>Body part</option>
          </select></div>` : ""}
      ${isAttackTemplate ? `
        <div class="as-field-row">
          <div class="as-field"><label class="as-field-label">Accuracy bonus</label>
            <input class="as-input" data-ref="attackAccuracyBonus" type="number" value="${esc(d.attackAccuracyBonus)}"></div>
          <div class="as-field"><label class="as-field-label">Damage bonus</label>
            <input class="as-input" data-ref="attackDamageBonus" type="number" value="${esc(d.attackDamageBonus)}"></div>
          <div class="as-field"><label class="as-field-label">Armor pierce</label>
            <input class="as-input" data-ref="attackArmorPierce" type="number" value="${esc(d.attackArmorPierce)}"></div>
        </div>
        <label class="as-checkbox-row"><input type="checkbox" data-ref="ignoreArmor" ${d.ignoreArmor ? "checked" : ""}> Ignore armor</label>` : ""}
    `;
  }

  function renderCreate() {
    return `
      <button class="as-btn as-btn-ghost" type="button" data-action="back-to-library">&larr; Back to catalog</button>
      <section class="as-section">
        <div class="as-section-title">${esc(TEMPLATE_LABELS[state.createTemplate])}</div>
        ${renderTemplateFields()}
        ${state.draftErrors.length ? `<div class="as-field-error">${state.draftErrors.map((e) => esc(e.message)).join("<br>")}</div>` : ""}
        <div class="as-field-row">
          <button class="as-btn as-btn-primary" type="button" data-action="save-draft" ${state.saveBusy || state.draftErrors.length ? "disabled" : ""}>Save</button>
        </div>
      </section>`;
  }

  /* ---- render ---- */
  function renderNotice() {
    if (!state.notice) return "";
    return `<div class="as-banner ${state.noticeKind}">${esc(state.notice)}</div>`;
  }

  function render() {
    if (!isGM()) {
      root.innerHTML = `<div class="as-screen as-screen-nogm"><p class="as-muted">Ability Studio is available to GMs only.</p></div>`;
      return;
    }
    root.innerHTML = `
      <div class="as-screen">
        <div class="as-header"><span class="as-title">Ability Studio</span></div>
        ${renderNotice()}
        ${state.view === "library" ? renderLibrary() : state.view === "detail" ? renderDetail() : renderCreate()}
        <div class="as-events">${state.events.map((e) => `<div>${esc(e.title)}</div>`).join("")}</div>
      </div>`;
    bindEvents();
  }

  function bindEvents() {
    const searchEl = root.querySelector("[data-ref='search']");
    if (searchEl) {
      searchEl.addEventListener("input", (e) => {
        state.catalogSearch = e.target.value;
        clearTimeout(state._searchTimer);
        state._searchTimer = setTimeout(() => loadCatalog(), 300);
      });
    }
    const characterEl = root.querySelector("[data-ref='character']");
    if (characterEl) {
      characterEl.addEventListener("change", (e) => {
        state.selectedCharacterId = e.target.value;
        render();
      });
    }
    if (state.view === "create" && state.draft) {
      for (const key of Object.keys(state.draft)) {
        const el = root.querySelector(`[data-ref='${key}']`);
        if (!el) continue;
        const eventName = el.tagName === "SELECT" || el.type === "checkbox" || el.type === "number" ? "change" : "input";
        el.addEventListener(eventName, (e) => {
          const value = el.type === "checkbox" ? e.target.checked : e.target.value;
          updateDraftField(key, value);
        });
      }
    }
  }

  function onRootClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "open-detail") { openDetail(btn.dataset.ability); return; }
    if (action === "start-create") { startCreate(btn.dataset.template); return; }
    if (action === "back-to-library") { state.view = "library"; setNotice("info", ""); render(); return; }
    if (action === "assign") { void ensureCharactersLoaded().then(onAssign); return; }
    if (action === "remove-assignment") { onRemoveLastAssignment(); return; }
    if (action === "save-draft") { onSaveDraft(); return; }
  }

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
    if (ctx) {
      state.obr.roomId = ctx.roomId || "";
      state.obr.sceneId = ctx.sceneId || "";
      state.obr.campaignId = ctx.campaignId || "";
    }
    render();
    logAbilityStudioEvent("ability-studio-opened", {});
    if (isGM()) {
      await ensureCharactersLoaded();
      await loadCatalog();
    }
    root.addEventListener("click", onRootClick);
  })();

  render();

  return () => {
    root.removeEventListener("click", onRootClick);
    if (typeof unsubscribeEvents === "function") unsubscribeEvents();
  };
}
