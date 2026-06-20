import { hasSupabaseSettings } from "../bridge/settingsBridge.js";
import { toErrorMessage } from "../utils/errors.js";
import { escapeHtml, prettyJson, safeJsonParse } from "../utils/json.js";

const CREATOR_TABS = Object.freeze([
  { id: "skills", label: "Skills" },
  { id: "equipment", label: "Equipment Models" },
]);

function createEmptySkillDraft() {
  return {
    id: "",
    code: "",
    name: "",
    category: "combat",
    maxLevel: "5",
    mainAttributeId: "",
    secondaryAttributeId: "",
    sortOrder: "0",
    description: "",
    tagsText: "",
  };
}

function createEmptyEquipmentDraft() {
  return {
    id: "",
    code: "",
    name: "",
    itemType: "armor",
    description: "",
    armorValue: "0",
    armorMaxMinor: "0",
    armorMaxSerious: "0",
    armorMaxCritical: "0",
    defaultBodyPartCode: "",
    canEquip: true,
    canEquipToBodyPart: true,
    sortOrder: "0",
    tagsText: "",
    flagsText: "{}",
    effectDataText: "{}",
    abilityLinksText: "[]",
  };
}

function createInitialState() {
  return {
    activeTab: "skills",
    loading: false,
    loadingLabel: "",
    error: "",
    info: "",
    lastLoadedSettingsKey: "",
    references: null,
    loadedTabs: {
      skills: false,
      equipment: false,
    },
    filters: {
      skills: {
        search: "",
        category: "",
      },
      equipment: {
        search: "",
        itemType: "",
      },
    },
    lists: {
      skills: [],
      equipment: [],
    },
    selectedIds: {
      skills: "",
      equipment: "",
    },
    bundles: {
      skills: null,
      equipment: null,
    },
    drafts: {
      skills: createEmptySkillDraft(),
      equipment: createEmptyEquipmentDraft(),
    },
    dirty: {
      skills: false,
      equipment: false,
    },
    requestNonce: 0,
  };
}

function cloneJson(value) {
  return safeJsonParse(JSON.stringify(value), value);
}

function normalizeTagsText(tags) {
  if (!Array.isArray(tags)) return "";
  return tags.map((value) => String(value ?? "").trim()).filter(Boolean).join(", ");
}

function parseTagsText(value) {
  return String(value ?? "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSkillDraft(bundle) {
  const skill = bundle?.skill ?? {};
  return {
    id: String(skill.id ?? ""),
    code: String(skill.code ?? ""),
    name: String(skill.name ?? ""),
    category: String(skill.category ?? "combat"),
    maxLevel: String(skill.max_level ?? 5),
    mainAttributeId: String(skill.main_attribute_id ?? ""),
    secondaryAttributeId: String(skill.secondary_attribute_id ?? ""),
    sortOrder: String(skill.sort_order ?? 0),
    description: String(skill.description ?? ""),
    tagsText: normalizeTagsText(skill.tags),
  };
}

function normalizeEquipmentDraft(bundle) {
  const model = bundle?.equipment_model ?? {};
  return {
    id: String(model.id ?? ""),
    code: String(model.code ?? ""),
    name: String(model.name ?? ""),
    itemType: String(model.item_type ?? "armor"),
    description: String(model.description ?? ""),
    armorValue: String(model.armor_value ?? 0),
    armorMaxMinor: String(model.armor_max_minor ?? 0),
    armorMaxSerious: String(model.armor_max_serious ?? 0),
    armorMaxCritical: String(model.armor_max_critical ?? 0),
    defaultBodyPartCode: String(model.default_body_part_code ?? ""),
    canEquip: Boolean(model.can_equip ?? true),
    canEquipToBodyPart: Boolean(model.can_equip_to_body_part ?? true),
    sortOrder: String(model.sort_order ?? 0),
    tagsText: normalizeTagsText(model.tags),
    flagsText: prettyJson(model.flags ?? {}),
    effectDataText: prettyJson(model.effect_data ?? {}),
    abilityLinksText: prettyJson(bundle?.ability_links ?? []),
  };
}

function makeSkillDuplicateDraft(source) {
  const code = String(source.code ?? "").trim();
  const name = String(source.name ?? "").trim();
  return {
    ...cloneJson(source),
    id: "",
    code: code ? `${code}_copy` : "",
    name: name ? `${name} Copy` : "",
  };
}

function makeEquipmentDuplicateDraft(source) {
  const code = String(source.code ?? "").trim();
  const name = String(source.name ?? "").trim();
  const abilityLinks = safeJsonParse(String(source.abilityLinksText ?? "[]"), []);
  const normalizedLinks = Array.isArray(abilityLinks)
    ? abilityLinks.map((entry) => {
        const next = { ...(entry && typeof entry === "object" ? entry : {}) };
        delete next.id;
        return next;
      })
    : [];
  return {
    ...cloneJson(source),
    id: "",
    code: code ? `${code}_copy` : "",
    name: name ? `${name} Copy` : "",
    abilityLinksText: prettyJson(normalizedLinks),
  };
}

function parseJsonField(text, label, expectedType) {
  const parsed = safeJsonParse(String(text ?? "").trim(), undefined);
  if (parsed === undefined) {
    throw new Error(`${label} must contain valid JSON.`);
  }
  if (expectedType === "array" && !Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array.`);
  }
  if (
    expectedType === "object"
    && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
  ) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

function coerceInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCreatorError(result, fallback) {
  if (!result || result.ok !== false) {
    return fallback;
  }
  const details = Array.isArray(result.details)
    ? result.details
        .map((entry) => String(entry?.message ?? entry?.field ?? "").trim())
        .filter(Boolean)
    : [];
  const message = String(result.message ?? result.error ?? fallback).trim() || fallback;
  return details.length ? `${message} ${details.join(" | ")}` : message;
}

function buildSkillPayload(draft) {
  return {
    id: draft.id || undefined,
    code: String(draft.code ?? "").trim(),
    name: String(draft.name ?? "").trim(),
    category: String(draft.category ?? "combat").trim() || "combat",
    max_level: coerceInteger(draft.maxLevel, 5),
    main_attribute_id: String(draft.mainAttributeId ?? "").trim() || null,
    secondary_attribute_id: String(draft.secondaryAttributeId ?? "").trim() || null,
    sort_order: coerceInteger(draft.sortOrder, 0),
    description: String(draft.description ?? ""),
    tags: parseTagsText(draft.tagsText),
  };
}

function buildEquipmentPayload(draft) {
  return {
    id: draft.id || undefined,
    code: String(draft.code ?? "").trim(),
    name: String(draft.name ?? "").trim(),
    item_type: String(draft.itemType ?? "armor").trim() || "armor",
    description: String(draft.description ?? ""),
    armor_value: coerceInteger(draft.armorValue, 0),
    armor_max_minor: coerceInteger(draft.armorMaxMinor, 0),
    armor_max_serious: coerceInteger(draft.armorMaxSerious, 0),
    armor_max_critical: coerceInteger(draft.armorMaxCritical, 0),
    default_body_part_code: String(draft.defaultBodyPartCode ?? "").trim() || null,
    can_equip: Boolean(draft.canEquip),
    can_equip_to_body_part: Boolean(draft.canEquipToBodyPart),
    sort_order: coerceInteger(draft.sortOrder, 0),
    tags: parseTagsText(draft.tagsText),
    flags: parseJsonField(draft.flagsText, "Flags", "object"),
    effect_data: parseJsonField(draft.effectDataText, "Data / effect_data", "object"),
    ability_links: parseJsonField(draft.abilityLinksText, "Ability links", "array"),
  };
}

function extractEntityBundle(result) {
  if (result?.entity?.ok) {
    return result.entity;
  }
  if (result?.ok) {
    return result;
  }
  return null;
}

function buildTabButtons(activeTab) {
  return CREATOR_TABS
    .map(
      (tab) => `
        <button
          type="button"
          class="creator-tab${activeTab === tab.id ? " active" : ""}"
          data-creator-tab="${tab.id}"
        >${escapeHtml(tab.label)}</button>
      `,
    )
    .join("");
}

function buildSkillFilterMarkup(state, references) {
  const selected = state.filters.skills.category;
  const categories = Array.isArray(references?.skill_categories) ? references.skill_categories : [];
  const options = [
    '<option value="">All categories</option>',
    ...categories.map(
      (category) => `<option value="${escapeHtml(category)}"${selected === category ? " selected" : ""}>${escapeHtml(category)}</option>`,
    ),
  ];
  return `
    <div class="creator-toolbar">
      <label class="field-stack">
        <span>Search</span>
        <input data-creator-filter-search="skills" type="text" value="${escapeHtml(state.filters.skills.search)}" placeholder="code, name, tags">
      </label>
      <label class="field-stack">
        <span>Category</span>
        <select data-creator-filter-category="skills">
          ${options.join("")}
        </select>
      </label>
      <div class="creator-filter-actions">
        <button type="button" class="secondary" data-creator-action="applyFilters">Apply Filters</button>
        <button type="button" class="secondary" data-creator-action="refreshList">Refresh</button>
      </div>
    </div>
  `;
}

function buildEquipmentFilterMarkup(state, references) {
  const selected = state.filters.equipment.itemType;
  const types = Array.isArray(references?.equipment_item_types) ? references.equipment_item_types : [];
  const options = [
    '<option value="">All item types</option>',
    ...types.map(
      (itemType) => `<option value="${escapeHtml(itemType)}"${selected === itemType ? " selected" : ""}>${escapeHtml(itemType)}</option>`,
    ),
  ];
  return `
    <div class="creator-toolbar">
      <label class="field-stack">
        <span>Search</span>
        <input data-creator-filter-search="equipment" type="text" value="${escapeHtml(state.filters.equipment.search)}" placeholder="code, name, tags">
      </label>
      <label class="field-stack">
        <span>Item Type</span>
        <select data-creator-filter-item-type="equipment">
          ${options.join("")}
        </select>
      </label>
      <div class="creator-filter-actions">
        <button type="button" class="secondary" data-creator-action="applyFilters">Apply Filters</button>
        <button type="button" class="secondary" data-creator-action="refreshList">Refresh</button>
      </div>
    </div>
  `;
}

function buildListMarkup(kind, items, selectedId) {
  if (!items.length) {
    return `<div class="creator-empty">No ${kind === "skills" ? "skills" : "equipment models"} found for the current filter.</div>`;
  }
  return items
    .map((item) => {
      const isActive = selectedId && selectedId === item.id;
      const meta = kind === "skills"
        ? [
            item.category || "unknown",
            item.main_attribute_name || item.main_attribute_code || "no main attribute",
            item.secondary_attribute_name || item.secondary_attribute_code || "no secondary attribute",
          ]
        : [
            item.item_type || "unknown",
            item.default_body_part_code || "no body part",
            `armor ${item.armor_value ?? 0}`,
          ];
      return `
        <button
          type="button"
          class="creator-list-item${isActive ? " active" : ""}"
          data-creator-open="${escapeHtml(kind)}:${escapeHtml(item.id)}"
        >
          <span class="creator-list-title">${escapeHtml(item.name || item.code || "Unnamed")}</span>
          <span class="creator-list-code">${escapeHtml(item.code || "")}</span>
          <span class="creator-list-meta">${escapeHtml(meta.join(" • "))}</span>
        </button>
      `;
    })
    .join("");
}

function buildAttributeOptions(references, selectedValue) {
  const attributes = Array.isArray(references?.attributes) ? references.attributes : [];
  const options = ['<option value="">None</option>'];
  for (const attribute of attributes) {
    options.push(
      `<option value="${escapeHtml(attribute.id)}"${selectedValue === attribute.id ? " selected" : ""}>${escapeHtml(attribute.name || attribute.code || attribute.id)}</option>`,
    );
  }
  return options.join("");
}

function buildBodyPartOptions(references, selectedValue) {
  const bodyParts = Array.isArray(references?.body_part_definitions) ? references.body_part_definitions : [];
  const options = ['<option value="">None</option>'];
  for (const part of bodyParts) {
    options.push(
      `<option value="${escapeHtml(part.code)}"${selectedValue === part.code ? " selected" : ""}>${escapeHtml(part.name || part.code)}</option>`,
    );
  }
  return options.join("");
}

function buildSkillEditorMarkup(state, references) {
  const draft = state.drafts.skills;
  const bundle = state.bundles.skills;
  const categories = Array.isArray(references?.skill_categories) ? references.skill_categories : [];
  const categoryOptions = categories
    .map((category) => `<option value="${escapeHtml(category)}"${draft.category === category ? " selected" : ""}>${escapeHtml(category)}</option>`)
    .join("");
  const levelPreview = bundle?.level_requirements?.length
    ? prettyJson(bundle.level_requirements)
    : "[]";
  return `
    <div class="creator-editor-head">
      <div>
        <div class="creator-editor-title">${escapeHtml(draft.name || "New Skill Draft")}</div>
        <div class="muted">${draft.id ? `Editing ${escapeHtml(draft.code || draft.id)}` : "Draft is local until Save."}</div>
      </div>
      <div class="creator-pill${state.dirty.skills ? " dirty" : ""}" data-creator-dirty-pill="skills">${state.dirty.skills ? "Unsaved" : "Saved / clean"}</div>
    </div>
    <div class="button-row">
      <button type="button" data-creator-action="newDraft">Create New</button>
      <button type="button" class="secondary" data-creator-action="duplicateDraft">Duplicate</button>
      <button type="button" data-creator-action="saveDraft">Save</button>
      <button type="button" class="secondary" data-creator-action="reloadSelected"${draft.id ? "" : " disabled"}>Reload</button>
      <button type="button" class="secondary" data-creator-action="deleteSelected"${draft.id ? "" : " disabled"}>Delete</button>
    </div>
    <form class="creator-form" data-creator-form="skills">
      <div class="field-grid creator-grid-2">
        <label class="field-stack">
          <span>Code</span>
          <input data-creator-input="code" type="text" value="${escapeHtml(draft.code)}" placeholder="frontier_melee">
        </label>
        <label class="field-stack">
          <span>Name</span>
          <input data-creator-input="name" type="text" value="${escapeHtml(draft.name)}" placeholder="Frontier Melee">
        </label>
      </div>
      <div class="field-grid creator-grid-4">
        <label class="field-stack">
          <span>Category</span>
          <select data-creator-input="category">${categoryOptions}</select>
        </label>
        <label class="field-stack">
          <span>Max Level</span>
          <select data-creator-input="maxLevel">
            <option value="1"${draft.maxLevel === "1" ? " selected" : ""}>1</option>
            <option value="3"${draft.maxLevel === "3" ? " selected" : ""}>3</option>
            <option value="5"${draft.maxLevel === "5" ? " selected" : ""}>5</option>
          </select>
        </label>
        <label class="field-stack">
          <span>Main Attribute</span>
          <select data-creator-input="mainAttributeId">${buildAttributeOptions(references, draft.mainAttributeId)}</select>
        </label>
        <label class="field-stack">
          <span>Secondary Attribute</span>
          <select data-creator-input="secondaryAttributeId">${buildAttributeOptions(references, draft.secondaryAttributeId)}</select>
        </label>
      </div>
      <div class="field-grid creator-grid-2">
        <label class="field-stack">
          <span>Sort Order</span>
          <input data-creator-input="sortOrder" type="number" value="${escapeHtml(draft.sortOrder)}">
        </label>
        <label class="field-stack">
          <span>Tags (comma-separated)</span>
          <input data-creator-input="tagsText" type="text" value="${escapeHtml(draft.tagsText)}" placeholder="combat, melee, starter">
        </label>
      </div>
      <label class="field-stack">
        <span>Description</span>
        <textarea data-creator-input="description" rows="4" placeholder="Short GM-facing description">${escapeHtml(draft.description)}</textarea>
      </label>
      <label class="field-stack">
        <span>Level Requirements Preview</span>
        <textarea rows="8" readonly>${escapeHtml(levelPreview)}</textarea>
      </label>
      <p class="muted">Skill level requirements are currently preview-only in this V1 creator UI because the active backend upsert path does not persist edits for that nested block yet.</p>
      <label class="field-stack">
        <span>Payload Preview</span>
        <textarea rows="10" readonly>${escapeHtml(prettyJson(buildSkillPayload(draft)))}</textarea>
      </label>
    </form>
  `;
}

function buildEquipmentEditorMarkup(state, references) {
  const draft = state.drafts.equipment;
  const types = Array.isArray(references?.equipment_item_types) ? references.equipment_item_types : [];
  const typeOptions = types
    .map((itemType) => `<option value="${escapeHtml(itemType)}"${draft.itemType === itemType ? " selected" : ""}>${escapeHtml(itemType)}</option>`)
    .join("");
  const payloadPreview = (() => {
    try {
      return prettyJson(buildEquipmentPayload(draft));
    } catch (_error) {
      return prettyJson({
        draft: {
          ...draft,
        },
      });
    }
  })();
  return `
    <div class="creator-editor-head">
      <div>
        <div class="creator-editor-title">${escapeHtml(draft.name || "New Equipment Draft")}</div>
        <div class="muted">${draft.id ? `Editing ${escapeHtml(draft.code || draft.id)}` : "Draft is local until Save."}</div>
      </div>
      <div class="creator-pill${state.dirty.equipment ? " dirty" : ""}" data-creator-dirty-pill="equipment">${state.dirty.equipment ? "Unsaved" : "Saved / clean"}</div>
    </div>
    <div class="button-row">
      <button type="button" data-creator-action="newDraft">Create New</button>
      <button type="button" class="secondary" data-creator-action="duplicateDraft">Duplicate</button>
      <button type="button" data-creator-action="saveDraft">Save</button>
      <button type="button" class="secondary" data-creator-action="reloadSelected"${draft.id ? "" : " disabled"}>Reload</button>
      <button type="button" class="secondary" data-creator-action="deleteSelected"${draft.id ? "" : " disabled"}>Delete</button>
    </div>
    <form class="creator-form" data-creator-form="equipment">
      <div class="field-grid creator-grid-2">
        <label class="field-stack">
          <span>Code</span>
          <input data-creator-input="code" type="text" value="${escapeHtml(draft.code)}" placeholder="frontier_plate">
        </label>
        <label class="field-stack">
          <span>Name</span>
          <input data-creator-input="name" type="text" value="${escapeHtml(draft.name)}" placeholder="Frontier Plate">
        </label>
      </div>
      <div class="field-grid creator-grid-4">
        <label class="field-stack">
          <span>Item Type</span>
          <select data-creator-input="itemType">${typeOptions}</select>
        </label>
        <label class="field-stack">
          <span>Default Body Part</span>
          <select data-creator-input="defaultBodyPartCode">${buildBodyPartOptions(references, draft.defaultBodyPartCode)}</select>
        </label>
        <label class="field-stack">
          <span>Sort Order</span>
          <input data-creator-input="sortOrder" type="number" value="${escapeHtml(draft.sortOrder)}">
        </label>
        <div class="creator-check-stack">
          <label class="toggle-inline">
            <input data-creator-input="canEquip" type="checkbox"${draft.canEquip ? " checked" : ""}>
            <span>Can equip</span>
          </label>
          <label class="toggle-inline">
            <input data-creator-input="canEquipToBodyPart" type="checkbox"${draft.canEquipToBodyPart ? " checked" : ""}>
            <span>Can equip to body part</span>
          </label>
        </div>
      </div>
      <div class="field-grid creator-grid-4">
        <label class="field-stack">
          <span>Armor Value</span>
          <input data-creator-input="armorValue" type="number" value="${escapeHtml(draft.armorValue)}">
        </label>
        <label class="field-stack">
          <span>Armor Max Minor</span>
          <input data-creator-input="armorMaxMinor" type="number" value="${escapeHtml(draft.armorMaxMinor)}">
        </label>
        <label class="field-stack">
          <span>Armor Max Serious</span>
          <input data-creator-input="armorMaxSerious" type="number" value="${escapeHtml(draft.armorMaxSerious)}">
        </label>
        <label class="field-stack">
          <span>Armor Max Critical</span>
          <input data-creator-input="armorMaxCritical" type="number" value="${escapeHtml(draft.armorMaxCritical)}">
        </label>
      </div>
      <label class="field-stack">
        <span>Description</span>
        <textarea data-creator-input="description" rows="4" placeholder="Short GM-facing description">${escapeHtml(draft.description)}</textarea>
      </label>
      <label class="field-stack">
        <span>Tags (comma-separated)</span>
        <input data-creator-input="tagsText" type="text" value="${escapeHtml(draft.tagsText)}" placeholder="armor, torso, medium">
      </label>
      <label class="field-stack">
        <span>Flags JSON</span>
        <textarea data-creator-input="flagsText" rows="8" spellcheck="false">${escapeHtml(draft.flagsText)}</textarea>
      </label>
      <label class="field-stack">
        <span>Data / effect_data JSON</span>
        <textarea data-creator-input="effectDataText" rows="8" spellcheck="false">${escapeHtml(draft.effectDataText)}</textarea>
      </label>
      <label class="field-stack">
        <span>Ability Links JSON</span>
        <textarea data-creator-input="abilityLinksText" rows="10" spellcheck="false">${escapeHtml(draft.abilityLinksText)}</textarea>
      </label>
      <label class="field-stack">
        <span>Payload Preview</span>
        <textarea rows="12" readonly>${escapeHtml(payloadPreview)}</textarea>
      </label>
    </form>
  `;
}

function buildPanelMarkup(state, access) {
  if (!access.isGm) {
    return `
      <section class="panel">
        <div class="panel-title">Creator Menu</div>
        <p class="muted">Creator tools are GM-only. Players should not edit catalog definitions from this surface.</p>
      </section>
    `;
  }

  if (!access.configured) {
    return `
      <section class="panel">
        <div class="panel-title">Creator Menu</div>
        <p class="muted">Configure Supabase room settings above, then the creator tabs for Skills and Equipment Models will unlock here.</p>
      </section>
    `;
  }

  const references = state.references ?? {};
  const listMarkup = state.activeTab === "skills"
    ? buildListMarkup("skills", state.lists.skills, state.selectedIds.skills)
    : buildListMarkup("equipment", state.lists.equipment, state.selectedIds.equipment);
  const filtersMarkup = state.activeTab === "skills"
    ? buildSkillFilterMarkup(state, references)
    : buildEquipmentFilterMarkup(state, references);
  const editorMarkup = state.activeTab === "skills"
    ? buildSkillEditorMarkup(state, references)
    : buildEquipmentEditorMarkup(state, references);

  return `
    <section class="panel creator-panel">
      <div class="panel-title">Creator Menu</div>
      <p class="panel-note">Drafts stay local in the UI until you press Save. Duplicate makes a copy-as-new draft and keeps nested link payloads where the active backend supports them.</p>
      <nav class="creator-tabs">${buildTabButtons(state.activeTab)}</nav>
      ${filtersMarkup}
      ${state.error ? `<div class="creator-banner error">${escapeHtml(state.error)}</div>` : ""}
      ${state.info ? `<div class="creator-banner info">${escapeHtml(state.info)}</div>` : ""}
      ${state.loading ? `<div class="creator-banner info">Loading: ${escapeHtml(state.loadingLabel || "working…")}</div>` : ""}
      <div class="creator-layout">
        <aside class="creator-sidebar">
          <div class="creator-sidebar-head">
            <span>${state.activeTab === "skills" ? "Skill Catalog" : "Equipment Catalog"}</span>
            <span class="creator-count">${state.activeTab === "skills" ? state.lists.skills.length : state.lists.equipment.length}</span>
          </div>
          <div class="creator-list">${listMarkup}</div>
        </aside>
        <div class="creator-editor">
          ${editorMarkup}
        </div>
      </div>
    </section>
  `;
}

function readSkillDraftFromDom(root) {
  const form = root.querySelector('[data-creator-form="skills"]');
  if (!(form instanceof HTMLElement)) {
    return createEmptySkillDraft();
  }
  const query = (field) => form.querySelector(`[data-creator-input="${field}"]`);
  return {
    id: String(form.dataset.creatorEntityId ?? ""),
    code: String(query("code")?.value ?? ""),
    name: String(query("name")?.value ?? ""),
    category: String(query("category")?.value ?? "combat"),
    maxLevel: String(query("maxLevel")?.value ?? "5"),
    mainAttributeId: String(query("mainAttributeId")?.value ?? ""),
    secondaryAttributeId: String(query("secondaryAttributeId")?.value ?? ""),
    sortOrder: String(query("sortOrder")?.value ?? "0"),
    description: String(query("description")?.value ?? ""),
    tagsText: String(query("tagsText")?.value ?? ""),
  };
}

function readEquipmentDraftFromDom(root) {
  const form = root.querySelector('[data-creator-form="equipment"]');
  if (!(form instanceof HTMLElement)) {
    return createEmptyEquipmentDraft();
  }
  const query = (field) => form.querySelector(`[data-creator-input="${field}"]`);
  return {
    id: String(form.dataset.creatorEntityId ?? ""),
    code: String(query("code")?.value ?? ""),
    name: String(query("name")?.value ?? ""),
    itemType: String(query("itemType")?.value ?? "armor"),
    description: String(query("description")?.value ?? ""),
    armorValue: String(query("armorValue")?.value ?? "0"),
    armorMaxMinor: String(query("armorMaxMinor")?.value ?? "0"),
    armorMaxSerious: String(query("armorMaxSerious")?.value ?? "0"),
    armorMaxCritical: String(query("armorMaxCritical")?.value ?? "0"),
    defaultBodyPartCode: String(query("defaultBodyPartCode")?.value ?? ""),
    canEquip: Boolean(query("canEquip")?.checked),
    canEquipToBodyPart: Boolean(query("canEquipToBodyPart")?.checked),
    sortOrder: String(query("sortOrder")?.value ?? "0"),
    tagsText: String(query("tagsText")?.value ?? ""),
    flagsText: String(query("flagsText")?.value ?? "{}"),
    effectDataText: String(query("effectDataText")?.value ?? "{}"),
    abilityLinksText: String(query("abilityLinksText")?.value ?? "[]"),
  };
}

function updateDirtyPill(root, kind, isDirty) {
  const pill = root.querySelector(`[data-creator-dirty-pill="${kind}"]`);
  if (!(pill instanceof HTMLElement)) {
    return;
  }
  pill.textContent = isDirty ? "Unsaved" : "Saved / clean";
  pill.classList.toggle("dirty", Boolean(isDirty));
}

export function mountCreatorMenu({
  root,
  runtime,
  getPlayer,
  getSettings,
  onDiagnostic = () => {},
}) {
  const state = createInitialState();

  function getAccess() {
    const player = getPlayer();
    const settings = getSettings();
    return {
      player,
      settings,
      isGm: player?.role === "GM",
      configured: hasSupabaseSettings(settings),
      settingsKey: hasSupabaseSettings(settings)
        ? `${settings.url}::${settings.apiKey}`
        : "",
    };
  }

  function captureActiveDraft() {
    if (state.activeTab === "skills") {
      state.drafts.skills = readSkillDraftFromDom(root);
    } else {
      state.drafts.equipment = readEquipmentDraftFromDom(root);
    }
  }

  function clearMessages() {
    state.error = "";
    state.info = "";
  }

  function resetLoadedData({ keepTab = true } = {}) {
    const activeTab = keepTab ? state.activeTab : "skills";
    state.references = null;
    state.loadedTabs = { skills: false, equipment: false };
    state.lists = { skills: [], equipment: [] };
    state.selectedIds = { skills: "", equipment: "" };
    state.bundles = { skills: null, equipment: null };
    state.drafts = {
      skills: createEmptySkillDraft(),
      equipment: createEmptyEquipmentDraft(),
    };
    state.dirty = { skills: false, equipment: false };
    state.activeTab = activeTab;
  }

  function render() {
    const access = getAccess();
    root.innerHTML = buildPanelMarkup(state, access);

    const form = root.querySelector(`[data-creator-form="${state.activeTab}"]`);
    if (form instanceof HTMLElement) {
      form.dataset.creatorEntityId = state.drafts[state.activeTab].id || "";
      form.addEventListener("input", () => {
        captureActiveDraft();
        state.dirty[state.activeTab] = true;
        clearMessages();
        updateDirtyPill(root, state.activeTab, true);
      });
      form.addEventListener("change", () => {
        captureActiveDraft();
        state.dirty[state.activeTab] = true;
        clearMessages();
        updateDirtyPill(root, state.activeTab, true);
      });
    }

    root.querySelectorAll("[data-creator-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        captureActiveDraft();
        state.activeTab = button.dataset.creatorTab;
        clearMessages();
        render();
        void ensureReadyForActiveTab();
      });
    });

    root.querySelectorAll("[data-creator-open]").forEach((button) => {
      button.addEventListener("click", () => {
        const [kind, id] = String(button.dataset.creatorOpen ?? "").split(":");
        if (!kind || !id) return;
        captureActiveDraft();
        void openRecord(kind, id);
      });
    });

    root.querySelectorAll("[data-creator-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.creatorAction;
        switch (action) {
          case "applyFilters":
            captureActiveDraft();
            applyFiltersFromDom();
            void refreshActiveList();
            break;
          case "refreshList":
            captureActiveDraft();
            void refreshActiveList({ forceRefs: true });
            break;
          case "newDraft":
            captureActiveDraft();
            createNewDraft();
            break;
          case "duplicateDraft":
            captureActiveDraft();
            duplicateDraft();
            break;
          case "saveDraft":
            captureActiveDraft();
            void saveDraft();
            break;
          case "reloadSelected":
            captureActiveDraft();
            void reloadSelected();
            break;
          case "deleteSelected":
            captureActiveDraft();
            void deleteSelected();
            break;
          default:
            break;
        }
      });
    });
  }

  function applyFiltersFromDom() {
    if (state.activeTab === "skills") {
      const search = root.querySelector('[data-creator-filter-search="skills"]');
      const category = root.querySelector('[data-creator-filter-category="skills"]');
      state.filters.skills.search = String(search?.value ?? "").trim();
      state.filters.skills.category = String(category?.value ?? "").trim();
    } else {
      const search = root.querySelector('[data-creator-filter-search="equipment"]');
      const itemType = root.querySelector('[data-creator-filter-item-type="equipment"]');
      state.filters.equipment.search = String(search?.value ?? "").trim();
      state.filters.equipment.itemType = String(itemType?.value ?? "").trim();
    }
  }

  async function ensureReadyForActiveTab({ forceRefs = false } = {}) {
    const access = getAccess();
    if (!access.isGm || !access.configured) {
      return;
    }

    if (state.lastLoadedSettingsKey && state.lastLoadedSettingsKey !== access.settingsKey) {
      resetLoadedData();
    }

    const shouldLoadRefs = forceRefs || !state.references || state.lastLoadedSettingsKey !== access.settingsKey;
    const shouldLoadList = shouldLoadRefs || !state.loadedTabs[state.activeTab];
    if (!shouldLoadRefs && !shouldLoadList) {
      return;
    }

    const requestId = ++state.requestNonce;
    state.loading = true;
    state.loadingLabel = shouldLoadRefs ? "reference data and catalog" : "catalog";
    clearMessages();
    render();

    try {
      if (shouldLoadRefs) {
        const referenceResult = await runtime.api.creator.getCreatorReferenceData(access.settings);
        if (requestId !== state.requestNonce) return;
        if (!referenceResult?.ok) {
          throw new Error(formatCreatorError(referenceResult, "Unable to load creator reference data."));
        }
        state.references = referenceResult;
        state.lastLoadedSettingsKey = access.settingsKey;
      }
      await loadListForTab(state.activeTab, access.settings, requestId);
      if (requestId !== state.requestNonce) return;
      state.loading = false;
      render();
    } catch (error) {
      if (requestId !== state.requestNonce) return;
      state.loading = false;
      state.error = toErrorMessage(error, "Unable to load creator data.");
      onDiagnostic("error", "Creator load failed", state.error);
      render();
    }
  }

  async function loadListForTab(kind, settings, requestId = state.requestNonce) {
    let result = null;
    if (kind === "skills") {
      const filters = state.filters.skills;
      result = await runtime.api.creator.listSkills(
        {
          search: filters.search || null,
          categories: filters.category ? [filters.category] : [],
        },
        settings,
      );
    } else {
      const filters = state.filters.equipment;
      result = await runtime.api.creator.listEquipmentModels(
        {
          search: filters.search || null,
          itemTypes: filters.itemType ? [filters.itemType] : [],
        },
        settings,
      );
    }

    if (requestId !== state.requestNonce) return;
    if (!result?.ok) {
      throw new Error(formatCreatorError(result, "Unable to load catalog list."));
    }

    state.lists[kind] = Array.isArray(result.items) ? result.items : [];
    state.loadedTabs[kind] = true;

    if (
      state.selectedIds[kind]
      && !state.lists[kind].some((item) => item.id === state.selectedIds[kind])
    ) {
      state.selectedIds[kind] = "";
      state.bundles[kind] = null;
      state.drafts[kind] = kind === "skills" ? createEmptySkillDraft() : createEmptyEquipmentDraft();
      state.dirty[kind] = false;
    }
  }

  async function refreshActiveList({ forceRefs = false } = {}) {
    const access = getAccess();
    if (!access.isGm || !access.configured) {
      return;
    }
    const requestId = ++state.requestNonce;
    state.loading = true;
    state.loadingLabel = forceRefs ? "reference data and current list" : "current list";
    clearMessages();
    render();
    try {
      if (forceRefs) {
        const referenceResult = await runtime.api.creator.getCreatorReferenceData(access.settings);
        if (!referenceResult?.ok) {
          throw new Error(formatCreatorError(referenceResult, "Unable to refresh creator reference data."));
        }
        state.references = referenceResult;
        state.lastLoadedSettingsKey = access.settingsKey;
      }
      await loadListForTab(state.activeTab, access.settings, requestId);
      state.loading = false;
      state.info = `${state.activeTab === "skills" ? "Skill" : "Equipment"} catalog refreshed.`;
      render();
    } catch (error) {
      state.loading = false;
      state.error = toErrorMessage(error, "Unable to refresh creator list.");
      onDiagnostic("error", "Creator refresh failed", state.error);
      render();
    }
  }

  async function openRecord(kind, id) {
    const access = getAccess();
    if (!access.isGm || !access.configured) {
      return;
    }
    const requestId = ++state.requestNonce;
    state.loading = true;
    state.loadingLabel = `loading ${kind === "skills" ? "skill" : "equipment model"}`;
    clearMessages();
    render();

    try {
      const result = kind === "skills"
        ? await runtime.api.creator.getSkill(id, access.settings)
        : await runtime.api.creator.getEquipmentModel(id, access.settings);
      if (requestId !== state.requestNonce) return;
      if (!result?.ok) {
        throw new Error(formatCreatorError(result, "Unable to load creator record."));
      }
      state.selectedIds[kind] = id;
      state.bundles[kind] = result;
      state.drafts[kind] = kind === "skills"
        ? normalizeSkillDraft(result)
        : normalizeEquipmentDraft(result);
      state.dirty[kind] = false;
      state.loading = false;
      state.info = `${kind === "skills" ? "Skill" : "Equipment model"} loaded into draft.`;
      render();
    } catch (error) {
      if (requestId !== state.requestNonce) return;
      state.loading = false;
      state.error = toErrorMessage(error, "Unable to open creator record.");
      onDiagnostic("error", "Creator open failed", state.error);
      render();
    }
  }

  function createNewDraft() {
    clearMessages();
    if (state.activeTab === "skills") {
      state.selectedIds.skills = "";
      state.bundles.skills = null;
      state.drafts.skills = createEmptySkillDraft();
      state.dirty.skills = false;
      state.info = "New skill draft created.";
    } else {
      state.selectedIds.equipment = "";
      state.bundles.equipment = null;
      state.drafts.equipment = createEmptyEquipmentDraft();
      state.dirty.equipment = false;
      state.info = "New equipment draft created.";
    }
    render();
  }

  function duplicateDraft() {
    clearMessages();
    if (state.activeTab === "skills") {
      state.selectedIds.skills = "";
      state.bundles.skills = null;
      state.drafts.skills = makeSkillDuplicateDraft(state.drafts.skills);
      state.dirty.skills = true;
      state.info = "Skill draft duplicated as a new record.";
    } else {
      state.selectedIds.equipment = "";
      state.bundles.equipment = null;
      state.drafts.equipment = makeEquipmentDuplicateDraft(state.drafts.equipment);
      state.dirty.equipment = true;
      state.info = "Equipment draft duplicated as a new record.";
    }
    render();
  }

  async function saveDraft() {
    const access = getAccess();
    if (!access.isGm || !access.configured) {
      return;
    }
    clearMessages();
    state.loading = true;
    state.loadingLabel = "saving draft";
    render();
    try {
      const draft = state.activeTab === "skills" ? state.drafts.skills : state.drafts.equipment;
      const result = state.activeTab === "skills"
        ? await runtime.api.creator.upsertSkill(buildSkillPayload(draft), access.settings)
        : await runtime.api.creator.upsertEquipmentModel(buildEquipmentPayload(draft), access.settings);
      if (!result?.ok) {
        throw new Error(formatCreatorError(result, "Unable to save draft."));
      }
      const bundle = extractEntityBundle(result);
      if (!bundle?.ok) {
        throw new Error("Save succeeded but the returned entity bundle was incomplete.");
      }
      if (state.activeTab === "skills") {
        state.selectedIds.skills = String(result.entity_id ?? "");
        state.bundles.skills = bundle;
        state.drafts.skills = normalizeSkillDraft(bundle);
        state.dirty.skills = false;
      } else {
        state.selectedIds.equipment = String(result.entity_id ?? "");
        state.bundles.equipment = bundle;
        state.drafts.equipment = normalizeEquipmentDraft(bundle);
        state.dirty.equipment = false;
      }
      await loadListForTab(state.activeTab, access.settings);
      state.loading = false;
      state.info = `${state.activeTab === "skills" ? "Skill" : "Equipment model"} saved to Supabase.`;
      onDiagnostic("info", "Creator save complete", state.info);
      render();
    } catch (error) {
      state.loading = false;
      state.error = toErrorMessage(error, "Unable to save draft.");
      onDiagnostic("error", "Creator save failed", state.error);
      render();
    }
  }

  async function reloadSelected() {
    const id = state.selectedIds[state.activeTab];
    if (!id) {
      return;
    }
    await openRecord(state.activeTab, id);
  }

  async function deleteSelected() {
    const access = getAccess();
    const id = state.selectedIds[state.activeTab];
    if (!access.isGm || !access.configured || !id) {
      return;
    }
    const label = state.activeTab === "skills" ? "skill" : "equipment model";
    if (!globalThis.confirm(`Delete this ${label} definition from the catalog?`)) {
      return;
    }

    clearMessages();
    state.loading = true;
    state.loadingLabel = `deleting ${label}`;
    render();
    try {
      const result = state.activeTab === "skills"
        ? await runtime.api.creator.deleteSkill(id, access.settings)
        : await runtime.api.creator.deleteEquipmentModel(id, access.settings);
      if (!result?.ok) {
        throw new Error(formatCreatorError(result, `Unable to delete ${label}.`));
      }
      if (state.activeTab === "skills") {
        state.selectedIds.skills = "";
        state.bundles.skills = null;
        state.drafts.skills = createEmptySkillDraft();
        state.dirty.skills = false;
      } else {
        state.selectedIds.equipment = "";
        state.bundles.equipment = null;
        state.drafts.equipment = createEmptyEquipmentDraft();
        state.dirty.equipment = false;
      }
      await loadListForTab(state.activeTab, access.settings);
      state.loading = false;
      state.info = `${label[0].toUpperCase()}${label.slice(1)} deleted from the catalog.`;
      onDiagnostic("info", "Creator delete complete", state.info);
      render();
    } catch (error) {
      state.loading = false;
      state.error = toErrorMessage(error, `Unable to delete ${label}.`);
      onDiagnostic("error", "Creator delete failed", state.error);
      render();
    }
  }

  const controller = {
    syncAccess() {
      const access = getAccess();
      if (state.lastLoadedSettingsKey && state.lastLoadedSettingsKey !== access.settingsKey) {
        resetLoadedData();
      }
      render();
      void ensureReadyForActiveTab();
    },
    refresh() {
      render();
      void ensureReadyForActiveTab({ forceRefs: true });
    },
  };

  render();
  void ensureReadyForActiveTab();
  return controller;
}
