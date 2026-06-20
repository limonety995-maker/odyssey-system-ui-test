// Character Panel (Stage 5B start). Source of truth is Supabase; this screen only
// collects input, calls existing RPC adapters, renders results, and re-reads server
// state after mutations. No combat math, no client rolls, no direct table writes.

import characterStyles from "./characterStyles.css";
import { escapeHtml } from "../../utils/json.js";
import { describeError } from "../resolveAttack/resolveAttackService.js";
import {
  loadDevSettings,
  hasUsableSettings,
  resolveEffectiveSettings,
} from "../resolveAttack/resolveAttackSettings.js";
import { getRealtimeClient } from "../../bridge/realtimeClient.js";

/* canonical attribute codes in display order (psionics and perception swapped vs alphabetical) */
const ATTR_RU = {
  strength: "Сила",
  agility: "Ловкость",
  reaction: "Реакция",
  endurance: "Выносливость",
  psionics: "Псионика",
  intelligence: "Интеллект",
  charisma: "Харизма",
  willpower: "Сила воли",
  perception: "Восприятие",
};
const BASE_ATTR_CODES = Object.keys(ATTR_RU);

const PART_GEOMETRY = {
  head: { x: 31, y: 6, w: 18, h: 18, r: "50%" },
  torso: { x: 28, y: 26, w: 24, h: 30, r: 6 },
  l_arm: { x: 16, y: 28, w: 8, h: 26, r: 5 },
  r_arm: { x: 56, y: 28, w: 8, h: 26, r: 5 },
  l_leg: { x: 28, y: 58, w: 9, h: 24, r: 5 },
  r_leg: { x: 42, y: 58, w: 9, h: 24, r: 5 },
};
const PART_ALIASES = { arm_l: "l_arm", arm_r: "r_arm", leg_l: "l_leg", leg_r: "r_leg" };
const DOLL_SCALE = 1.7;
const OBR_TIMEOUT = 1500;
const ARMOR_TYPES = new Set(["armor", "shield", "special_protection", "exoskeleton", "closed_suit"]);
const IMPLANT_TYPES = new Set(["implant", "prosthetic", "device"]);

const esc = (v) => escapeHtml(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const dash = (v) => (v === null || v === undefined || v === "" ? "-" : v);
const normPart = (p) => { const c = String(p?.code || p?.part_key || "").toLowerCase(); return PART_ALIASES[c] || c; };

function injectStylesOnce() {
  if (document.getElementById("cp-screen-styles")) return;
  const s = document.createElement("style");
  s.id = "cp-screen-styles";
  s.textContent = characterStyles;
  document.head.appendChild(s);
}
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    Promise.resolve().then(() => promise).catch(() => fallback),
    new Promise((r) => setTimeout(() => r(fallback), ms)),
  ]);
}
function banner(kind, html) {
  return `<div class="cp-banner ${kind}">${html}</div>`;
}

export function mountCharacterScreen({ root, runtime }) {
  injectStylesOnce();
  const api = runtime?.api ?? {};
  const bridges = runtime?.bridges ?? {};

  const state = {
    settings: loadDevSettings(),
    role: "PLAYER", // from OBR
    devRole: "auto", // 'auto' | 'PLAYER' | 'GM'
    characterId: "",
    loading: false,
    error: null,
    section: "overview",
    sheet: null,
    abilities: [],
    pools: [],
    armory: null,
    equipment: null,
    inv: { ammoStock: [], magazines: [], items: [], fallback: false },
    itemDefs: [],
    skillDefs: [],
    weaponDefs: [],
    magazineDefs: [],
    ammoDefs: [],
    equipmentDefs: [],
    lastSlot: {}, // equipmentItemId -> last equipped body_part id (for re-equip default)
    pinnedPartId: "",
    rollingAttr: "",
    busy: false,
    notice: "",
    realtimeSubscriptions: [], // Real-Time listeners for auto-refresh
  };

  const settings = () => state.settings;
  const isGM = () => (state.devRole === "GM" ? true : state.devRole === "PLAYER" ? false : state.role === "GM");

  /* ---- detect role (best-effort; OBR may be absent) ---- */
  (async () => {
    const player = await withTimeout(bridges.obr?.getPlayerInfo?.(), OBR_TIMEOUT, null);
    if (player?.role) { state.role = String(player.role).toUpperCase() === "GM" ? "GM" : "PLAYER"; render(); }
  })();

  /* ---- data adapters ---- */
  // Central read via get_character_runtime_bundle - one RPC replaces 4-5 parallel calls.
  // combat section: body_parts with minor/serious/critical/disabled/destroyed/armor_value/armor_critical
  // No HP tracking - damage state is tracked per body part.
  const loadBundle = (id, sections) =>
    api.placement.getCharacterRuntimeBundle({ character_id: id, sections }, settings());

  // Catalog of item definitions for the GM "Add item" dropdown (read-only).
  async function fetchItemDefs() {
    const rows = await bridges.supabase.fetchSupabaseRows(
      "odyssey_item_defs?select=code,name,item_type&order=name",
      settings(),
      "Unable to read item defs.",
    );
    return arr(rows);
  }

  async function fetchAmmoAndMagazineDefs() {
    const safe = (p) => p.catch(() => []);
    const [magazines, ammo] = await Promise.all([
      safe(bridges.supabase.fetchSupabaseRows("odyssey_magazine_defs?select=id,code,name,capacity,caliber_id,caliber:caliber_id(id,code,name)&order=name", settings(), "")),
      safe(bridges.supabase.fetchSupabaseRows("odyssey_ammo_type_defs?select=id,code,name,caliber_id,caliber:caliber_id(id,code,name)&order=name", settings(), "")),
    ]);
    state.magazineDefs = arr(magazines);
    state.ammoDefs = arr(ammo);
  }

  // Fetch GM-only grant defs (skills, weapon models, equipment models).
  async function fetchGmDefs() {
    const safe = (p) => p.catch(() => []);
    const [skills, weapons, equipment] = await Promise.all([
      safe(bridges.supabase.fetchSupabaseRows("odyssey_skill_defs?select=id,code,name,category,max_level&order=name", settings(), "")),
      safe(bridges.supabase.fetchSupabaseRows("odyssey_weapon_model_defs?select=id,code,name&order=name", settings(), "")),
      safe(bridges.supabase.fetchSupabaseRows("odyssey_equipment_model_defs?select=id,code,name,item_type&order=name", settings(), "")),
    ]);
    state.skillDefs = arr(skills);
    state.weaponDefs = arr(weapons);
    state.equipmentDefs = arr(equipment);
  }

  // Maps bundle response into state. Merges into existing sheet so partial refreshes
  // (abilities-only, equipment-only, etc.) never wipe fields that weren't requested.
  function applyBundle(bundle) {
    if (!bundle || bundle.ok === false || !bundle.character) return false;
    const s = bundle.sections ?? {};
    const combat = s.combat && typeof s.combat === "object" ? s.combat : null;

    // Build only the patch for sections that were actually returned
    const patch = { character: bundle.character };
    if (s.attributes !== undefined)           patch.attributes    = arr(s.attributes);
    if (combat !== null) {
      patch.body_parts    = arr(combat.body_parts);
      patch.is_alive      = combat.is_alive ?? true;
      patch.is_conscious  = combat.is_conscious ?? true;
      patch.armor_summary = combat.armor_summary ?? null;
      patch.combat_flags  = combat.combat_flags ?? {};
    }
    if (s.skills !== undefined)               patch.skills        = arr(s.skills);
    if (s.abilities?.resource_pools !== undefined) patch.resource_pools = arr(s.abilities.resource_pools);
    if (bundle.state?.status_summary !== undefined) patch.status_summary = bundle.state.status_summary;

    // Merge into existing sheet; initialise defaults on first load
    state.sheet = state.sheet
      ? { ...state.sheet, ...patch }
      : { attributes: [], body_parts: [], skills: [], resource_pools: [],
          is_alive: true, is_conscious: true, status_summary: "",
          armor_summary: null, combat_flags: {}, ...patch };

    if (s.abilities) {
      state.abilities = arr(s.abilities.abilities);
      state.pools = arr(s.abilities.resource_pools);
    }
    if (s.equipment !== undefined) {
      // Bundle returns a flat array; add model/body_part sub-objects for render compat
      state.equipment = arr(s.equipment).map((it) => ({
        ...it,
        model: { item_type: it.item_type, can_equip: it.can_equip !== false },
        body_part: (it.is_equipped && it.equipped_body_part_id)
          ? { id: it.equipped_body_part_id, name: it.equipped_body_part_name }
          : null,
      }));
    }
    if (s.inventory) {
      state.inv = {
        ammoStock: arr(s.inventory.ammo_stock),
        magazines: arr(s.inventory.magazines),
        items: arr(s.inventory.items),
        fallback: false,
      };
    }
    return true;
  }

  async function ensureSettings() {
    const dev = loadDevSettings();
    if (hasUsableSettings(dev)) { state.settings = dev; return dev; }
    const resolved = await resolveEffectiveSettings();
    state.settings = resolved.settings;
    return resolved.settings;
  }

  const ALL_SECTIONS = ["summary", "combat", "attributes", "skills", "equipment", "inventory", "abilities", "effects"];

  async function loadCharacter(id) {
    state.loading = true; state.error = null; state.notice = ""; render();
    cleanupRealtimeSubscriptions();
    try {
      await ensureSettings();
      if (!hasUsableSettings(settings())) {
        throw new Error("Supabase is not configured. Set URL/key in the Resolve Attack tab.");
      }
      const gmMode = isGM();
      const [bundle, itemDefs, armoryData] = await Promise.all([
        loadBundle(id, ALL_SECTIONS),
        gmMode && !state.itemDefs.length ? fetchItemDefs().catch(() => []) : Promise.resolve(state.itemDefs),
        api.weapon.getCharacterArmory(id, settings()).catch(() => null),
      ]);
      if (!state.ammoDefs.length || !state.magazineDefs.length) {
        await fetchAmmoAndMagazineDefs().catch(() => {});
      }
      if (gmMode && (!state.skillDefs.length || !state.weaponDefs.length || !state.equipmentDefs.length)) {
        fetchGmDefs().then(() => render()).catch(() => {});
      }
      if (!bundle || bundle.ok === false || !bundle.character) throw new Error("Character not found: check character_id.");
      state.characterId = id;
      state.itemDefs = arr(itemDefs);
      if (armoryData) state.armory = armoryData;
      applyBundle(bundle);
      state.pinnedPartId = "";
      setupRealtimeSubscriptions(id);
    } catch (e) {
      state.error = e.message;
    } finally {
      state.loading = false;
      render();
    }
  }

  // Re-pull server state after a mutation using bundle sections - selective refresh.
  async function refresh({ sheet = true, armory = true, equipment = true, inventory = true, abilities = false } = {}) {
    const id = state.characterId;
    if (!id) return;
    const sections = [
      ...(sheet ? ["summary", "combat", "attributes", "skills"] : []),
      ...(equipment ? ["equipment"] : []),
      ...(inventory ? ["inventory"] : []),
      ...(abilities ? ["abilities"] : []),
    ];
    const bundlePromise = sections.length ? loadBundle(id, sections).catch(() => null) : Promise.resolve(null);
    const armoryPromise = armory ? api.weapon.getCharacterArmory(id, settings()).catch(() => null) : Promise.resolve(null);
    const [bundle, armoryData] = await Promise.all([bundlePromise, armoryPromise]);
    if (bundle) applyBundle(bundle);
    if (armoryData) state.armory = armoryData;
    render();
  }

  /* ---- Real-Time subscriptions for live updates ---- */
  function setupRealtimeSubscriptions(characterId) {
    const sb = getRealtimeClient(settings());
    if (!sb) return;

    const tables = [
      "odyssey_character_body_parts",
      "odyssey_character_equipment_items",
      "odyssey_character_items",
      "odyssey_character_attributes",
      "odyssey_character_weapons",
      "odyssey_character_weapon_profile_states",
      "odyssey_character_magazines",
      "odyssey_character_abilities",
      "odyssey_character_resource_pools",
    ];

    const epoch = Date.now();
    for (const table of tables) {
      const channel = sb
        .channel(`cp:${epoch}:${table}:${characterId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `character_id=eq.${characterId}` },
          () => { onRealtimeUpdate(table); },
        )
        .subscribe();
      state.realtimeSubscriptions.push(channel);
    }
  }

  function cleanupRealtimeSubscriptions() {
    const sb = getRealtimeClient(settings());
    if (!sb) { state.realtimeSubscriptions = []; return; }
    for (const channel of state.realtimeSubscriptions) sb.removeChannel(channel);
    state.realtimeSubscriptions = [];
  }

  function onRealtimeUpdate(table) {
    // Selectively refresh based on which table changed
    switch (table) {
      case "odyssey_character_body_parts":
        refresh({ sheet: true, armory: false, equipment: false, inventory: false, abilities: false });
        break;
      case "odyssey_character_equipment_items":
        refresh({ sheet: true, armory: false, equipment: true, inventory: false, abilities: false });
        break;
      case "odyssey_character_items":
        refresh({ sheet: false, armory: false, equipment: false, inventory: true, abilities: false });
        break;
      case "odyssey_character_attributes":
        refresh({ sheet: true, armory: false, equipment: false, inventory: false, abilities: false });
        break;
      case "odyssey_character_weapons":
      case "odyssey_character_weapon_profile_states":
      case "odyssey_character_magazines":
        refresh({ sheet: false, armory: true, equipment: false, inventory: true, abilities: false });
        break;
      case "odyssey_character_abilities":
      case "odyssey_character_resource_pools":
        refresh({ sheet: false, armory: false, equipment: false, inventory: false, abilities: true });
        break;
    }
  }

  /* ---- mutation runner: handles {ok:false} AND thrown SupabaseError; never crashes ---- */
  async function runMutation(label, fn, after) {
    if (state.busy) return;
    state.busy = true; state.notice = `${label}...`; render();
    try {
      let result;
      try { result = await fn(); }
      catch (e) {
        state.notice = ""; setNotice("err", `${esc(describeError(e.code, e.message))}`);
        state.busy = false; render(); return null;
      }
      if (result && result.ok === false) {
        setNotice("err", `${esc(describeError(result.error, result.message))}${result.error ? ` <span class="cp-mono">[${esc(result.error)}]</span>` : ""}`);
        state.busy = false; render(); return null;
      }
      if (after) await after(result);
      setNotice("ok", `${esc(label)} done.`);
      return result;
    } finally {
      state.busy = false; render();
    }
  }
  function setNotice(kind, html) { state.notice = `__${kind}__${html}`; }
  function noticeHtml() {
    if (!state.notice) return "";
    const m = state.notice.match(/^__(ok|err|warn|info)__(.*)$/s);
    if (m) return banner(m[1], m[2]);
    return banner("info", esc(state.notice));
  }

  /* =========================================================== render */
  function render() {
    root.innerHTML = `<div class="cp-screen">${topBar()}${body()}</div>`;
    bindStaticEvents();
  }

  function topBar() {
    const cfgWarn = hasUsableSettings(loadDevSettings()) ? "" :
      `<div class="cp-banner warn" style="margin-top:6px">Supabase not configured - open the <b>Resolve Attack</b> tab and save URL/key, then load a character here.</div>`;
    return `
      <section class="panel">
        <div class="panel-title">Character</div>
        <div class="cp-row">
          <label class="cp-field"><span>character_id</span><input data-ref="charId" class="cp-mono" placeholder="uuid" autocomplete="off" value="${esc(state.characterId)}"></label>
          <label class="cp-field" style="max-width:170px"><span>View as (dev)</span>
            <select data-ref="devRole">
              <option value="auto" ${state.devRole === "auto" ? "selected" : ""}>Auto (${esc(state.role)})</option>
              <option value="PLAYER" ${state.devRole === "PLAYER" ? "selected" : ""}>Player</option>
              <option value="GM" ${state.devRole === "GM" ? "selected" : ""}>GM</option>
            </select></label>
        </div>
        <div class="button-row">
          <button data-ref="useToken" type="button" class="secondary">Use selected token</button>
          <button data-ref="loadBtn" type="button">Load character</button>
        </div>
        ${cfgWarn}
      </section>`;
  }

  function body() {
    if (state.loading) return skeleton();
    if (state.error) {
      return `<section class="panel">${banner("err", esc(state.error))}
        <div class="button-row"><button data-ref="retry" type="button">Retry</button></div></section>`;
    }
    if (!state.sheet) {
      return `<section class="panel">${noticeHtml()}<div class="cp-empty">Enter a character_id and press <b>Load character</b>.</div></section>`;
    }
    return `<section class="panel">
      ${headerBlock()}
      <div class="cp-nav" role="tablist">${navTabs()}</div>
      ${noticeHtml()}
      <div data-ref="section" style="margin-top:10px">${sectionContent()}</div>
    </section>`;
  }

  function skeleton() {
    return `<section class="panel">
      <div class="cp-skel cp-skel-card" style="width:60%"></div>
      <div class="cp-attrs" style="margin-top:10px">${Array.from({ length: 9 }).map(() => `<div class="cp-skel cp-skel-card"></div>`).join("")}</div>
      <div class="cp-skel cp-skel-line" style="width:40%;margin-top:12px"></div>
    </section>`;
  }

  /* ---- header ---- */
  function headerBlock() {
    const ch = state.sheet.character || {};
    const res = ch.resources && typeof ch.resources === "object" ? ch.resources : {};
    const portrait = res.portrait || res.avatar_url || res.image || "";
    const meta = [];
    if (res.faction) meta.push(`Faction: ${esc(res.faction)}`);
    if (res.age) meta.push(`Age: ${esc(res.age)}`);
    if (ch.character_bucket) meta.push(esc(ch.character_bucket));
    const poolChips = state.pools
      .filter((p) => p && (p.max_value ?? 0) > 0)
      .map((p) => {
        if (isGM()) {
          const cur = p.current_value ?? 0;
          const max = p.max_value ?? 0;
          return `<span class="cp-chip cp-pool-gm">
            <button class="cp-pool-adj" data-pool-adjust="-1" data-pool-code="${esc(p.code)}" ${cur <= 0 ? "disabled" : ""} aria-label="Decrease ${esc(p.name || p.code)}">-</button>
            <span>${esc(p.name || p.code)} <span class="cp-mono">${dash(cur)}/${dash(max)}</span></span>
            <button class="cp-pool-adj" data-pool-adjust="1" data-pool-code="${esc(p.code)}" ${cur >= max ? "disabled" : ""} aria-label="Increase ${esc(p.name || p.code)}">+</button>
          </span>`;
        }
        return `<span class="cp-chip">${esc(p.name || p.code)} <span class="cp-mono">${dash(p.current_value)}/${dash(p.max_value)}</span></span>`;
      })
      .join("");
    return `<div class="cp-head">
      <div class="cp-avatar">${portrait ? `<img src="${esc(portrait)}" alt="">` : esc((ch.name || "?").slice(0, 1).toUpperCase())}</div>
      <div style="flex:1;min-width:120px">
        <div class="cp-name">${esc(ch.name || ch.character_key || "Character")}</div>
        <div class="cp-muted">${meta.join(" В· ") || "&nbsp;"}</div>
      </div>
      ${isGM() ? `<span class="cp-pill good">GM</span>` : `<span class="cp-pill">Player</span>`}
    </div>
    ${poolChips ? `<div class="cp-row" style="margin-top:8px">${poolChips}</div>` : ""}`;
  }

  function navTabs() {
    const tabs = [
      ["overview", "Overview"], ["skills", "Skills"], ["abilities", "Abilities"],
      ["inventory", "Inventory"], ["armor", "Armor"], ["implants", "Implants"],
    ];
    return tabs.map(([k, label]) =>
      `<button class="cp-tab ${state.section === k ? "active" : ""}" role="tab" aria-selected="${state.section === k}" data-section="${k}">${label}</button>`,
    ).join("");
  }

  function sectionContent() {
    switch (state.section) {
      case "skills": return renderSkills();
      case "abilities": return renderAbilities();
      case "inventory": return renderInventory();
      case "armor": return renderArmor();
      case "implants": return renderImplants();
      default: return renderOverview();
    }
  }

  /* ---- OVERVIEW: characteristics + doll ---- */
  function renderOverview() {
    const attrs = arr(state.sheet.attributes);
    const base = BASE_ATTR_CODES
      .map((code) => attrs.find((a) => a.code === code))
      .filter(Boolean);
    const customs = attrs.filter((a) => !BASE_ATTR_CODES.includes(a.code));
    return `
      <div class="cp-overview">
        <div class="cp-doll-col">${renderDoll()}</div>
        <div class="cp-attrs-col">
          <div class="cp-section-title" style="margin-top:0">Characteristics</div>
          <div class="cp-attrs">${base.map(attrCard).join("")}</div>
        </div>
      </div>
      ${customs.length ? `<div class="cp-section-title">Additional attributes</div><div class="cp-row">${customs.map((a) => `<span class="cp-chip">${esc(a.name || a.code)} <span class="cp-mono">${dash(a.value)}</span></span>`).join("")}</div>` : ""}
      ${renderAdditionalParts()}
      ${isGM() ? gmToolsBlock() : ""}`;
  }

  function attrCard(a) {
    const label = a.name || a.code;
    const pending = state.rollingAttr === a.code;
    const editBtn = isGM()
      ? `<button class="cp-attr-edit" data-attr-edit="${esc(a.code)}" aria-label="Edit ${esc(label)} (GM)" title="Edit (GM)">вњЋ</button>`
      : "";
    return `<div class="cp-attr" role="button" tabindex="${pending ? -1 : 0}" data-attr-roll="${esc(a.code)}" aria-label="Roll ${esc(label)}" aria-disabled="${pending}" title="Roll ${esc(label)}">
      ${editBtn}
      <div class="cp-attr-val">${dash(a.value)}</div>
      <div class="cp-attr-code">${esc(a.code)}</div>
      ${pending ? `<div class="cp-attr-pending">Rolling...</div>` : ""}
    </div>`;
  }

  /* ---- doll ---- */
  function partColorClass(p) {
    if (p.destroyed || p.disabled || (p.critical || 0) > 0) return "cp-c-danger";
    if ((p.serious || 0) > 0 || (p.minor || 0) > 0 || p.armor_destroyed) return "cp-c-warn";
    return "cp-c-intact";
  }
  function bodyStatusText(p) {
    if (p.destroyed) return ["Destroyed", "cp-sb-danger"];
    if (p.disabled) return ["Disabled", "cp-sb-danger"];
    if ((p.critical || 0) > 0) return ["Damaged", "cp-sb-danger"];
    if ((p.serious || 0) > 0 || (p.minor || 0) > 0) return ["Damaged", "cp-sb-warn"];
    return ["Intact", "cp-sb-intact"];
  }
  function armorStatusText(p) {
    if (p.armor_destroyed) return ["Armor destroyed", "cp-sb-danger"];
    if ((p.armor_critical || 0) > 0) return ["Armor damaged", "cp-sb-warn"];
    if ((p.armor_value || 0) > 0) return ["Armor ok", "cp-sb-intact"];
    return ["No armor", "cp-sb-intact"];
  }
  function renderDoll() {
    const parts = arr(state.sheet.body_parts);
    const s = DOLL_SCALE, W = 96 * s, H = 104 * s;
    let doll = `<div class="cp-doll" style="width:${W}px;height:${H}px">`;
    doll += `<div class="cp-base" style="left:${22 * s}px;top:${84 * s}px;width:${36 * s}px;height:${9 * s}px"></div>`;
    for (const p of parts) {
      const g = PART_GEOMETRY[normPart(p)];
      if (!g) continue;
      const rad = g.r === "50%" ? "50%" : g.r * s + "px";
      const pinned = p.id === state.pinnedPartId ? "pinned" : "";
      doll += `<div class="cp-part ${partColorClass(p)} ${pinned}" tabindex="0" role="button" data-part="${esc(p.id)}" aria-label="${esc(p.name)}: ${bodyStatusText(p)[0]}"
        style="left:${g.x * s}px;top:${g.y * s}px;width:${g.w * s}px;height:${g.h * s}px;border-radius:${rad}"></div>`;
    }
    doll += `<div data-ref="tip"></div></div>`;
    return doll;
  }
  function renderAdditionalParts() {
    const additional = arr(state.sheet.body_parts).filter((p) => !PART_GEOMETRY[normPart(p)]);
    if (!additional.length) return "";
    return `<div class="cp-section-title">Additional body parts / modules</div><div class="cp-list">${additional.map((p) => {
      const [bs, bcls] = bodyStatusText(p);
      return `<div class="cp-card cp-rowitem" tabindex="0" role="button" data-part="${esc(p.id)}" aria-label="${esc(p.name)}">
        <span>${esc(p.name)}</span><span class="cp-statebadge ${bcls}">${bs} В· crit ${dash(p.critical)}/${dash(p.max_critical)}</span></div>`;
    }).join("")}</div>`;
  }
  function partTipHtml(p) {
    const [bs, bcls] = bodyStatusText(p);
    const [as, acls] = armorStatusText(p);
    return `<b>${esc(p.name)}</b>
      <div class="cp-kv"><span>Status</span><span class="cp-statebadge ${bcls}">${bs}</span></div>
      <div class="cp-kv"><span>Minor injuries</span><span>${dash(p.minor)}</span></div>
      <div class="cp-kv"><span>Serious injuries</span><span>${dash(p.serious)}</span></div>
      <div class="cp-kv"><span>Critical injuries</span><span>${dash(p.critical)}/${dash(p.max_critical)}</span></div>
      <div class="cp-kv"><span>Armor</span><span class="cp-statebadge ${acls}">${as}</span></div>
      <div class="cp-kv"><span>Armor value</span><span>${dash(p.armor_value)}</span></div>
      <div class="cp-kv"><span>Armor critical</span><span>${dash(p.armor_critical)}/${dash(p.armor_max_critical)}</span></div>`;
  }

  /* ---- SKILLS ---- */
  function renderSkills() {
    const skills = arr(state.sheet.skills).filter((s) => {
      const eff = s.effective_level ?? s.level ?? 0;
      return eff > 0; // only trained skills
    });
    const gmBlock = isGM() ? gmSkillsBlock() : "";
    if (!skills.length) return `<div class="cp-empty">No trained skills.</div>${gmBlock}`;
    const byCat = {};
    for (const s of skills) (byCat[s.category || "other"] ||= []).push(s);
    return Object.entries(byCat).map(([cat, list]) => `
      <div class="cp-section-title">${esc(cat)}</div>
      <div class="cp-list">${list.map(skillRow).join("")}</div>`).join("") + gmBlock;
  }
  function skillRow(s) {
    const max = s.max_level || 5;
    const eff = s.effective_level ?? s.level ?? 0;
    const purchased = s.purchased_level;
    const pips = Array.from({ length: max }).map((_, i) => `<span class="cp-pip ${i < eff ? "on" : ""}"></span>`).join("");
    const attrs = [s.main_attribute, s.secondary_attribute].filter(Boolean).join(" В· ");
    const perks = arr(s.perks).map((p) => `<span class="cp-pill good">${esc(p.name || p.code || p)}</span>`).join("");
    const locked = s.locked || s.is_locked;
    const passive = s.is_passive || s.category === "passive";
    const isPsionics = s.category?.toLowerCase() === "psionics";
    const isClickable = !passive && !isPsionics;
    const attrs_str = attrs ? ` <span class="cp-muted">(${esc(attrs)})</span>` : "";
    const buyStr = purchased != null && purchased !== eff ? ` <span class="cp-muted cp-mono">buy ${esc(purchased)}</span>` : "";
    return `<div class="cp-card"${isClickable ? ` role="button" tabindex="0" data-skill-roll="${esc(s.code)}"` : ""} aria-label="Skill ${esc(s.name)}" ${isClickable ? 'title="Skill check"' : ''}>
      <div class="cp-rowitem">
        <span>${esc(s.name)}${attrs_str}
          <span class="cp-pill">${passive ? "passive" : "trained"}</span>${buyStr}</span>
        <span class="cp-row" style="gap:6px">${perks}<span class="cp-pips" title="${dash(eff)}/${max}">${pips}</span>${locked ? `<span class="cp-pill bad">locked</span>` : ""}</span>
      </div>
      ${isGM() ? `<div class="button-row" style="margin-top:4px"><button class="cp-btn-sm secondary" data-gmdel="skill" data-id="${esc(s.id)}" type="button">GM delete</button></div>` : ""}
    </div>`;
  }

  /* ---- ABILITIES ---- */
  function renderAbilities() {
    const list = state.abilities;
    if (!list.length) return `<div class="cp-empty">No abilities.</div>`;
    // Group by source_type for categorization
    const byCat = { psionics: [], implants: [], weapon: [], other: [] };
    for (const a of list) {
      const type = String(a.source_type || "").toLowerCase();
      if (type.includes("psion")) byCat.psionics.push(a);
      else if (type.includes("implant") || type.includes("prosthetic") || type.includes("device")) byCat.implants.push(a);
      else if (type.includes("weapon")) byCat.weapon.push(a);
      else byCat.other.push(a);
    }
    const catNames = { psionics: "Psionics", implants: "Implants", weapon: "Weapon", other: "Other" };
    return Object.entries(byCat)
      .filter(([_, items]) => items.length > 0)
      .map(([catKey, items]) => `
        <div class="cp-section-title">${catNames[catKey]}</div>
        <div class="cp-list">${items.map(abilityCard).join("")}</div>`).join("");
  }
  function abilityCard(a) {
    const passive = a.activation_type === "passive" || a.ability_kind === "passive";
    const cost = a.resource?.cost;
    const cd = a.current_cooldown_rounds;
    const effect = a.level_data?.effect_data?.summary || a.description || "";
    const canUse = !passive && !cd; // can use if active and not on cooldown
    return `<div class="cp-card"${canUse ? ` role="button" tabindex="0" data-ability-use="${esc(a.id)}"` : ""} aria-label="Ability ${esc(a.name)}">
      <div class="cp-rowitem"><span><b>${esc(a.name)}</b> <span class="cp-pill">${esc(a.source_type || "ability")}</span></span>
      <span class="cp-pill ${passive ? "" : "good"}">${passive ? "passive" : cd ? "cooldown" : "active"}</span></div>
      <div class="cp-row" style="gap:6px;margin-top:6px">
        ${a.effective_level != null ? `<span class="cp-chip">lvl ${dash(a.effective_level)}</span>` : ""}
        ${cost != null ? `<span class="cp-chip">cost Рє:${esc(cost)}</span>` : ""}
        ${cd ? `<span class="cp-chip bad">cooldown ${esc(cd)}</span>` : ""}
        ${a.attack_type && a.attack_type !== "none" ? `<span class="cp-chip">attack: ${esc(a.attack_type)}</span>` : ""}
      </div>
      ${effect ? `<div class="cp-muted" style="margin-top:6px">${esc(effect)}</div>` : ""}
    </div>`;
  }

  /* ---- INVENTORY (weapons mgmt + magazines + ammo + items + GM) ---- */
  function renderInventory() {
    const armory = state.armory;
    const weapons = arr(armory?.weapons);
    const mags = arr(state.armory?.magazines);
    const ammo = arr(state.inv.ammoStock);
    const items = arr(state.inv.items);
    return `
      ${state.inv.fallback ? banner("warn", "Ammo/items read via fallback (backend get_character_inventory error 25006).") : ""}
      <div class="cp-section-title" style="margin-top:0">Weapons</div>
      <div class="cp-list">${weapons.length ? weapons.map(weaponCard).join("") : `<div class="cp-empty">No weapons.</div>`}</div>
      <div class="cp-section-title">Magazines</div>
      <div class="cp-list">${mags.length ? mags.map(magCard).join("") : `<div class="cp-empty">No magazines.</div>`}</div>
      <div class="cp-section-title">Ammo stock</div>
      <div class="cp-list">${ammo.length ? ammo.map((a) => `<div class="cp-card"><div class="cp-rowitem"><span>${esc(a.display_name)}</span><span class="cp-mono">${esc(getAmmoStockTypeName(a))} · ${esc(getAmmoStockCaliberName(a))} · x${dash(a.quantity)}</span></div>${isGM() ? `<div class="cp-row" style="gap:6px;margin-top:6px;align-items:center"><input data-gmammoqty="${esc(a.id)}" type="number" min="1" max="${a.quantity}" value="1" class="cp-mono" style="width:46px;padding:3px 4px;font-size:11px"><button class="cp-btn-sm secondary" data-gmammo="removeqty" data-ammo="${esc(a.id)}" type="button">GM -N</button><button class="cp-btn-sm secondary" data-gmammo="removeall" data-ammo="${esc(a.id)}" data-maxqty="${a.quantity}" type="button">GM -all</button></div>` : ""}</div>`).join("") : `<div class="cp-empty">No ammo.</div>`}</div>
      <div class="cp-section-title">Active items</div>
      <div class="cp-list">${items.length ? items.map(itemCard).join("") : `<div class="cp-empty">No items.</div>`}</div>
      ${isGM() ? gmInventoryBlock() : ""}`;
  }

  function findAmmoDefForRow(row) {
    const ammoTypeId = String(row?.ammo_type_id ?? "").trim();
    const ammoCode = String(row?.ammo_type_code ?? row?.ammo_code ?? "").trim().toLowerCase();
    return state.ammoDefs.find((def) =>
      (ammoTypeId && String(def?.id ?? "").trim() === ammoTypeId) ||
      (ammoCode && String(def?.code ?? "").trim().toLowerCase() === ammoCode)
    ) || null;
  }

  function findMagazineDefForRow(row) {
    const magazineDefId = String(row?.magazine_def?.id ?? row?.magazine_def_id ?? "").trim();
    const magazineCode = String(row?.magazine_def?.code ?? row?.code ?? "").trim().toLowerCase();
    return state.magazineDefs.find((def) =>
      (magazineDefId && String(def?.id ?? "").trim() === magazineDefId) ||
      (magazineCode && String(def?.code ?? "").trim().toLowerCase() === magazineCode)
    ) || null;
  }

  function getAmmoStockCaliberCode(row) {
    const ammoDef = findAmmoDefForRow(row);
    return String(
      ammoDef?.caliber_code ||
      ammoDef?.caliber?.code ||
      row?.caliber_code ||
      row?.caliber?.code ||
      ""
    ).trim().toLowerCase();
  }

  function getAmmoStockCaliberName(row) {
    const ammoDef = findAmmoDefForRow(row);
    return String(
      ammoDef?.caliber_name ||
      ammoDef?.caliber?.name ||
      row?.caliber_name ||
      row?.caliber?.name ||
      ""
    ).trim();
  }

  function getAmmoStockTypeCode(row) {
    const ammoDef = findAmmoDefForRow(row);
    return String(
      row?.ammo_type_code ||
      row?.ammo_code ||
      ammoDef?.code ||
      ""
    ).trim().toLowerCase();
  }

  function getAmmoStockTypeName(row) {
    const ammoDef = findAmmoDefForRow(row);
    return String(
      row?.ammo_type_name ||
      row?.ammo_name ||
      ammoDef?.name ||
      ""
    ).trim();
  }

  function getMagazineCaliberCode(row) {
    const magazineDef = findMagazineDefForRow(row);
    return String(
      row?.magazine_def?.caliber_code ||
      row?.magazine_def?.caliber ||
      row?.caliber_code ||
      row?.caliber?.code ||
      magazineDef?.caliber_code ||
      magazineDef?.caliber?.code ||
      ""
    ).trim().toLowerCase();
  }

  function getMagazineCurrentAmmoTypeCode(row) {
    return String(
      row?.ammo_type?.code ||
      row?.ammo_type_code ||
      row?.ammo_code ||
      ""
    ).trim().toLowerCase();
  }

  function weaponCard(w) {
    const isMelee = !w.model?.caliber;
    const mag = w.loaded_magazine || w.active_profile?.loaded_magazine || null;
    const fm = w.selected_fire_mode || w.active_profile?.selected_fire_mode || null;
    const profiles = arr(w.profiles);
    const fireModes = arr(w.available_fire_modes?.length ? w.available_fire_modes : w.active_profile?.available_fire_modes);
    const compatMags = arr(state.armory?.magazines).filter((m) => !w.model?.caliber || (m.magazine_def?.caliber || m.caliber) === w.model.caliber);
    const ammoChips = isMelee
      ? `<span class="cp-chip">melee</span>`
      : (mag
          ? `<span class="cp-chip ${(mag.current_rounds ?? 0) <= 0 ? "bad" : ""}">${dash(mag.current_rounds)}/${dash(mag.capacity || mag.magazine_def?.capacity)} - ${esc(mag.ammo_type_name || mag.ammo_type?.name || "")}</span>`
          : `<span class="cp-chip bad">no magazine</span>`);
    return `<div class="cp-card" data-weapon="${esc(w.id)}">
      <div class="cp-rowitem"><span><b>${esc(w.name)}</b> <span class="cp-pill">${esc(w.model?.weapon_class_name || w.model?.weapon_class || "")}</span></span>
        <span class="cp-row" style="gap:6px">${w.model?.caliber_name ? `<span class="cp-chip">${esc(w.model.caliber_name)}</span>` : ""}${ammoChips}</span></div>
      <div class="cp-row" style="gap:8px;margin-top:8px">
        ${profiles.length > 1 ? `<label class="cp-field" style="min-width:130px"><span>Profile</span><select data-wact="profile" data-weapon="${esc(w.id)}">${profiles.map((p) => `<option value="${esc(p.id)}" ${p.id === w.active_profile_id ? "selected" : ""}>${esc(p.name || p.code)}</option>`).join("")}</select></label>` : ""}
        ${fireModes.length && !isMelee ? `<label class="cp-field" style="min-width:130px"><span>Fire mode</span><select data-wact="firemode" data-weapon="${esc(w.id)}">${fireModes.map((f) => `<option value="${esc(f.id)}" ${f.id === fm?.id ? "selected" : ""}>${esc(f.name || f.code)}</option>`).join("")}</select></label>` : ""}
        ${!isMelee ? `<label class="cp-field" style="min-width:150px"><span>Insert magazine</span><select data-wact="reloadmag" data-weapon="${esc(w.id)}">${compatMags.length ? compatMags.map((m) => `<option value="${esc(m.id)}">${esc(m.name)} - ${dash(m.current_rounds)}/${dash(m.magazine_def?.capacity ?? m.capacity)}</option>`).join("") : `<option value="">-- none --</option>`}</select></label>` : ""}
      </div>
      ${!isMelee ? `<div class="button-row" style="margin-top:8px"><button class="cp-btn-sm" data-wbtn="reload" data-weapon="${esc(w.id)}" type="button" ${compatMags.length ? "" : "disabled"}>Reload (insert magazine)</button>${isGM() ? `<button class="cp-btn-sm secondary" data-gmdel="weapon" data-id="${esc(w.id)}" type="button">GM delete</button>` : ""}</div>${compatMags.length ? "" : `<div class="cp-muted">No compatible magazine to insert.</div>`}` : `${isGM() ? `<div class="button-row" style="margin-top:8px"><button class="cp-btn-sm secondary" data-gmdel="weapon" data-id="${esc(w.id)}" type="button">GM delete</button></div>` : ""}`}
    </div>`;
  }

  function magCard(m) {
    const inW = arr(state.armory?.weapons).find((w) => (w.loaded_magazine?.id || w.active_profile?.loaded_magazine?.id) === m.id);
    const cap = m.magazine_def?.capacity ?? m.capacity;
    const ammoName = m.ammo_type?.name || m.ammo_type_name || "empty";
    const caliberCode = getMagazineCaliberCode(m);
    const currentAmmoTypeCode = getMagazineCurrentAmmoTypeCode(m);
    const compatAmmo = arr(state.inv.ammoStock).filter((a) => {
      const ammoCaliberCode = getAmmoStockCaliberCode(a);
      const ammoTypeCode = getAmmoStockTypeCode(a);
      if (caliberCode && ammoCaliberCode !== caliberCode) return false;
      if ((m.current_rounds ?? 0) > 0 && currentAmmoTypeCode && ammoTypeCode !== currentAmmoTypeCode) return false;
      return true;
    });
    const empty = (m.current_rounds ?? 0) <= 0;
    return `<div class="cp-card" data-mag="${esc(m.id)}">
      <div class="cp-rowitem"><span><b>${esc(m.name)}</b> ${inW ? `<span class="cp-pill good">Inserted in ${esc(inW.name)}</span>` : `<span class="cp-pill">not inserted</span>`}</span>
        <span class="cp-mono">${dash(m.current_rounds)}/${dash(cap)} - ${esc(ammoName)}</span></div>
      <div class="cp-row" style="gap:8px;margin-top:8px">
        <label class="cp-field" style="min-width:150px"><span>Ammo to load</span><select data-mact="ammo" data-mag="${esc(m.id)}">${compatAmmo.length ? compatAmmo.map((a) => `<option value="${esc(a.id)}">${esc(a.display_name)} - ${esc(getAmmoStockTypeName(a))} - x${dash(a.quantity)}</option>`).join("") : `<option value="">-- no compatible ammo --</option>`}</select></label>
        <div class="button-row" style="margin:0;align-items:flex-end">
          <button class="cp-btn-sm" data-mbtn="load" data-mag="${esc(m.id)}" type="button" ${compatAmmo.length ? "" : "disabled"}>Load / Top up</button>
          <button class="cp-btn-sm secondary" data-mbtn="unload" data-mag="${esc(m.id)}" type="button" ${empty ? "disabled" : ""}>Unload all</button>
        </div>
      </div>
      ${compatAmmo.length ? "" : `<div class="cp-muted">No compatible ammo in stock.</div>`}
      ${isGM() ? `<div class="button-row" style="margin-top:6px"><button class="cp-btn-sm secondary" data-gmdel="mag" data-id="${esc(m.id)}" type="button">GM delete</button></div>` : ""}
    </div>`;
  }

  function itemCard(i) {
    const healable = i.use_action_type === "heal" || i.code === "basic_medkit";
    return `<div class="cp-card" data-item="${esc(i.id)}">
      <div class="cp-rowitem"><span><b>${esc(i.name)}</b> <span class="cp-pill">${esc(i.item_type || "")}</span></span><span class="cp-mono">x${dash(i.quantity)}</span></div>
      ${healable ? `<div class="cp-row" style="gap:8px;margin-top:8px">
        <label class="cp-field" style="min-width:160px"><span>Heal body part</span><select data-iact="part" data-item="${esc(i.id)}">${arr(state.sheet.body_parts).map((p) => `<option value="${esc(p.id)}" ${p.destroyed ? "disabled" : ""}>${esc(p.name)}${p.destroyed ? " (destroyed)" : ""}</option>`).join("")}</select></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-ibtn="use" data-item="${esc(i.id)}" type="button">Use</button></div>
      </div>` : ""}
      ${isGM() ? `<div class="cp-row" style="gap:6px;margin-top:6px;align-items:center">
        <input data-gmqty="${esc(i.id)}" type="number" min="1" max="${i.quantity}" value="1" class="cp-mono" style="width:46px;padding:3px 4px;font-size:11px">
        <button class="cp-btn-sm secondary" data-gmitem="removeqty" data-item="${esc(i.id)}" data-code="${esc(i.code || "")}" type="button">GM -N</button>
        <button class="cp-btn-sm secondary" data-gmitem="removeall" data-item="${esc(i.id)}" data-code="${esc(i.code || "")}" data-maxqty="${i.quantity}" type="button">GM -all</button>
      </div>` : ""}
    </div>`;
  }

  function gmInventoryBlock() {
    const itemOpts = state.itemDefs.length
      ? state.itemDefs.map((d) => `<option value="${esc(d.code)}">${esc(d.name)}${d.item_type ? ` - ${esc(d.item_type)}` : ""}</option>`).join("")
      : `<option value="">-- no item defs --</option>`;
    const weaponOpts = state.weaponDefs.length
      ? state.weaponDefs.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("")
      : `<option value="">-- no weapon models --</option>`;
    // For magazine block: filter ammo types by selected magazine's caliber
    const curMagId = root?.querySelector('[data-ref="gmMagDef"]')?.value || state.magazineDefs[0]?.id || "";
    const curMag = state.magazineDefs.find((d) => d.id === curMagId);
    const magAmmoOpts = (() => {
      const compatible = curMag ? state.ammoDefs.filter((a) => a.caliber_id === curMag.caliber_id) : state.ammoDefs;
      return compatible.length
        ? compatible.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("")
        : `<option value="">-- no compatible ammo --</option>`;
    })();
      const magOpts = state.magazineDefs.length
        ? state.magazineDefs.map((d) => `<option value="${esc(d.id)}" ${d.id === curMagId ? "selected" : ""}>${esc(d.name)} (x${esc(d.capacity)})</option>`).join("")
        : `<option value="">-- no magazine defs --</option>`;
      const ammoOpts = state.ammoDefs.length
        ? state.ammoDefs.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}${d.caliber?.name ? ` - ${esc(d.caliber.name)}` : ""}</option>`).join("")
        : `<option value="">-- no ammo types --</option>`;
    return `
      <div class="cp-section-title">GM - add weapon</div>
      <div class="cp-card"><div class="cp-row" style="gap:8px">
        <label class="cp-field"><span>Model</span><select data-ref="gmWeaponDef">${weaponOpts}</select></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-gmbtn="addweapon" type="button" ${state.weaponDefs.length ? "" : "disabled"}>Add weapon</button></div>
      </div></div>
      <div class="cp-section-title">GM - add magazine</div>
      <div class="cp-card"><div class="cp-row" style="gap:8px;flex-wrap:wrap">
        <label class="cp-field"><span>Magazine</span><select data-ref="gmMagDef" data-gmmag="1">${magOpts}</select></label>
        <label class="cp-field"><span>Ammo type (initial)</span><select data-ref="gmMagAmmo">${magAmmoOpts}</select></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-gmbtn="addmag" type="button" ${state.magazineDefs.length ? "" : "disabled"}>Add magazine</button></div>
      </div></div>
      <div class="cp-section-title">GM - add ammo</div>
      <div class="cp-card"><div class="cp-row" style="gap:8px">
        <label class="cp-field"><span>Ammo type</span><select data-ref="gmAmmoDef">${ammoOpts}</select></label>
        <label class="cp-field" style="max-width:90px"><span>qty</span><input data-ref="gmAmmoQty" type="number" min="1" value="10" class="cp-mono"></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-gmbtn="addammo" type="button" ${state.ammoDefs.length ? "" : "disabled"}>Add ammo</button></div>
      </div></div>
      <div class="cp-section-title">GM - add item</div>
      <div class="cp-card"><div class="cp-row" style="gap:8px">
        <label class="cp-field"><span>Item</span><select data-ref="gmAddCode">${itemOpts}</select></label>
        <label class="cp-field" style="max-width:90px"><span>qty</span><input data-ref="gmAddQty" type="number" min="1" value="1" class="cp-mono"></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-gmbtn="additem" type="button" ${state.itemDefs.length ? "" : "disabled"}>Add item</button></div>
      </div></div>`;
  }
  function gmSkillsBlock() {
    const opts = state.skillDefs.length
      ? state.skillDefs.map((d) => `<option value="${esc(d.id)}">${esc(d.name)} - ${esc(d.category)}</option>`).join("")
      : `<option value="">-- no skill defs --</option>`;
    return `<div class="cp-section-title">GM - add skill</div>
      <div class="cp-card"><div class="cp-row" style="gap:8px">
        <label class="cp-field"><span>Skill</span><select data-ref="gmSkillDef">${opts}</select></label>
        <label class="cp-field" style="max-width:80px"><span>Level</span><input data-ref="gmSkillLevel" type="number" min="1" max="10" value="1" class="cp-mono"></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-gmbtn="addskill" type="button" ${state.skillDefs.length ? "" : "disabled"}>Add skill</button></div>
      </div></div>`;
  }
  function gmArmorBlock() {
    const defs = state.equipmentDefs.filter((d) => ARMOR_TYPES.has(d.item_type));
    const opts = defs.length
      ? defs.map((d) => `<option value="${esc(d.code)}">${esc(d.name)} В· ${esc(d.item_type)}</option>`).join("")
      : `<option value="">-- no armor models --</option>`;
    return `<div class="cp-section-title">GM - add armor</div>
      <div class="cp-card"><div class="cp-row" style="gap:8px">
        <label class="cp-field"><span>Model</span><select data-ref="gmArmorDef">${opts}</select></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-gmbtn="addarmor" type="button" ${defs.length ? "" : "disabled"}>Add armor</button></div>
      </div></div>`;
  }
  function gmImplantsBlock() {
    const defs = state.equipmentDefs.filter((d) => IMPLANT_TYPES.has(d.item_type));
    const opts = defs.length
      ? defs.map((d) => `<option value="${esc(d.code)}">${esc(d.name)} В· ${esc(d.item_type)}</option>`).join("")
      : `<option value="">-- no implant models --</option>`;
    return `<div class="cp-section-title">GM - add implant</div>
      <div class="cp-card"><div class="cp-row" style="gap:8px">
        <label class="cp-field"><span>Model</span><select data-ref="gmImplantDef">${opts}</select></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-gmbtn="addimplant" type="button" ${defs.length ? "" : "disabled"}>Add implant</button></div>
      </div></div>`;
  }
  function gmToolsBlock() {
    return `<div class="cp-section-title">GM - character tools</div>
      <div class="button-row"><button class="cp-btn-sm" data-gmbtn="heal" type="button">Heal (full)</button>
      <button class="cp-btn-sm secondary" data-gmbtn="repair" type="button">Repair armor</button></div>`;
  }

  /* ---- ARMOR ---- */
  function equipmentItems() { return arr(state.equipment); }
  function renderArmor() {
    const items = equipmentItems().filter((it) => ARMOR_TYPES.has(it.model?.item_type) || (it.armor_max_critical || 0) > 0 || (it.armor_value || 0) > 0);
    const gmBlock = isGM() ? gmArmorBlock() : "";
    if (!state.equipment) return `<div class="cp-empty">Equipment unavailable.</div>${gmBlock}`;
    if (!items.length) return `<div class="cp-empty">No armor.</div>${gmBlock}`;
    return `<div class="cp-list">${items.map(armorCard).join("")}</div>${gmBlock}`;
  }
  function armorCard(it) {
    const dest = it.armor_destroyed;
    const hasCrit = (it.armor_critical || 0) > 0;
    const hasSerious = (it.armor_serious || 0) > 0;
    const hasMinor = (it.armor_minor || 0) > 0;
    const status = dest ? ["Destroyed", "bad"]
      : hasCrit ? ["Damaged", ""]
      : hasSerious ? ["Damaged", ""]
      : (hasMinor ? ["Minor damage", ""] : ["OK", "good"]);
    const slot = it.body_part?.name || it.model?.default_body_part_code || "-";
    return `<div class="cp-card" data-equip="${esc(it.id)}">
      <div class="cp-rowitem"><span><b>${esc(it.name)}</b> <span class="cp-pill">${esc(it.model?.item_type || "armor")}</span></span>
      <span class="cp-pill ${status[1]}">${status[0]}</span></div>
      <div class="cp-row" style="gap:6px;margin-top:6px">
        <span class="cp-chip">${it.is_equipped ? `Equipped В· ${esc(slot)}` : "Unequipped"}</span>
        <span class="cp-chip">AV ${dash(it.armor_value)}</span>
        <span class="cp-chip${(it.armor_minor||0) > 0 ? " warn" : ""}">Minor ${dash(it.armor_minor)}/${dash(it.armor_max_minor)}</span>
        <span class="cp-chip${(it.armor_serious||0) > 0 ? " warn" : ""}">Serious ${dash(it.armor_serious)}/${dash(it.armor_max_serious)}</span>
        <span class="cp-chip${hasCrit ? " bad" : ""}">Crit ${dash(it.armor_critical)}/${dash(it.armor_max_critical)}</span>
      </div>
      ${it.is_equipped
        ? `<div class="button-row" style="margin-top:8px"><button class="cp-btn-sm secondary" data-armorbtn="unequip" data-equip="${esc(it.id)}" type="button">Unequip</button>${isGM() ? `<button class="cp-btn-sm secondary" data-gmdel="equip" data-id="${esc(it.id)}" type="button">GM delete</button>` : ""}</div>`
        : `<div class="cp-row" style="gap:8px;margin-top:8px">
            <label class="cp-field" style="min-width:150px"><span>Equip to body part</span>
              <select data-equip-part="${esc(it.id)}">${armorSlotOptions(it)}</select></label>
            <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-armorbtn="equip" data-equip="${esc(it.id)}" type="button" ${it.model?.can_equip === false ? "disabled" : ""}>Equip</button>${isGM() ? `<button class="cp-btn-sm secondary" data-gmdel="equip" data-id="${esc(it.id)}" type="button">GM delete</button>` : ""}</div>
          </div>`}
    </div>`;
  }

  /* ---- IMPLANTS ---- */
  function renderImplants() {
    const items = equipmentItems().filter((it) => IMPLANT_TYPES.has(it.model?.item_type));
    const gmBlock = isGM() ? gmImplantsBlock() : "";
    if (!state.equipment) return `<div class="cp-empty">Equipment unavailable.</div>${gmBlock}`;
    if (!items.length) return `<div class="cp-empty">No installed implants</div>${gmBlock}`;
    return `<div class="cp-list">${items.map(implantCard).join("")}</div>${gmBlock}`;
  }
  function implantCard(it) {
    const eff = it.model?.effect_data;
    const effTxt = eff && typeof eff === "object" ? (eff.summary || eff.description || "") : "";
    const active = it.is_equipped;
    return `<div class="cp-card">
      <div class="cp-rowitem"><span><b>${esc(it.name)}</b> <span class="cp-pill">${esc(it.model?.item_type || "implant")}</span></span>
      <span class="cp-pill ${active ? "good" : ""}">${active ? "installed" : "inactive"}</span></div>
      ${it.model?.description ? `<div class="cp-muted" style="margin-top:6px">${esc(it.model.description)}</div>` : ""}
      <div class="cp-row" style="gap:6px;margin-top:6px">
        ${it.max_charges ? `<span class="cp-chip">charges ${dash(it.current_charges)}/${dash(it.max_charges)}</span>` : ""}
        ${effTxt ? `<span class="cp-chip">${esc(effTxt)}</span>` : ""}
      </div>
      ${isGM() ? `<div class="button-row" style="margin-top:6px"><button class="cp-btn-sm secondary" data-gmdel="equip" data-id="${esc(it.id)}" type="button">GM delete</button></div>` : ""}
    </div>`;
  }

  /* =========================================================== events */
  function bindStaticEvents() {
    const $ = (r) => root.querySelector(`[data-ref="${r}"]`);
    $("loadBtn")?.addEventListener("click", () => {
      const id = $("charId").value.trim();
      if (!id) { setNotice("err", "Enter a character_id."); render(); return; }
      loadCharacter(id);
    });
    $("retry")?.addEventListener("click", () => state.characterId && loadCharacter(state.characterId));
    $("charId")?.addEventListener("keydown", (e) => { if (e.key === "Enter") $("loadBtn").click(); });
    $("devRole")?.addEventListener("change", (e) => { state.devRole = e.target.value; render(); });
    $("useToken")?.addEventListener("click", onUseToken);

    // section nav
    root.querySelectorAll("[data-section]").forEach((b) =>
      b.addEventListener("click", () => { state.section = b.dataset.section; state.notice = ""; render(); }));

    // pool +/- buttons in header - registered once on root to survive re-renders
    if (!root._poolAdjBound) {
      root._poolAdjBound = true;
      root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-pool-adjust]");
        if (btn) onPoolAdjust(btn.dataset.poolCode, Number(btn.dataset.poolAdjust));
      });
    }

    // delegated clicks/changes inside the panel
    const section = $("section");
    if (section) {
      section.addEventListener("click", onSectionClick);
      section.addEventListener("change", onSectionChange);
      // doll tooltips (hover + focus)
      section.querySelectorAll("[data-part]").forEach((el) => {
        el.addEventListener("mouseenter", () => showTip(el));
        el.addEventListener("mouseleave", hideTip);
        el.addEventListener("focus", () => showTip(el));
        el.addEventListener("blur", hideTip);
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pinPart(el.dataset.part); } });
      });
      // keep a pinned body-part tooltip visible after re-render
      if (state.pinnedPartId) {
        const pinnedEl = section.querySelector(`.cp-part[data-part="${CSS.escape(state.pinnedPartId)}"]`);
        if (pinnedEl) showTip(pinnedEl);
      }
    }
    // characteristic keyboard
    root.querySelectorAll("[data-attr-roll]").forEach((el) =>
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRoll(el.dataset.attrRoll); } }));
    root.querySelectorAll("[data-skill-roll]").forEach((el) =>
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRollSkill(el.dataset.skillRoll); } }));
    root.querySelectorAll("[data-ability-use]").forEach((el) =>
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onUseAbility(el.dataset.abilityUse); } }));
    document.addEventListener("keydown", onEscOnce);
  }
  function onEscOnce(e) { if (e.key === "Escape") { hideTip(); if (state.pinnedPartId) { state.pinnedPartId = ""; render(); } } }

  function showTip(el) {
    const p = arr(state.sheet?.body_parts).find((x) => x.id === el.dataset.part);
    const host = root.querySelector('[data-ref="tip"]');
    if (!p || !host || !PART_GEOMETRY[normPart(p)]) return;
    host.className = "cp-tip";
    host.style.left = el.style.left;
    host.style.top = `calc(${el.style.top} + 24px)`;
    host.innerHTML = partTipHtml(p);
  }
  function hideTip() {
    const host = root.querySelector('[data-ref="tip"]');
    if (!host) return;
    if (state.pinnedPartId) { // keep the pinned part's tooltip visible
      const el = root.querySelector(`.cp-part[data-part="${CSS.escape(state.pinnedPartId)}"]`);
      if (el) { showTip(el); return; }
    }
    host.className = ""; host.innerHTML = "";
  }
  function pinPart(id) { state.pinnedPartId = state.pinnedPartId === id ? "" : id; render(); }

  function onSectionClick(e) {
    const t = e.target;
    const part = t.closest("[data-part]"); if (part && !t.closest("[data-wact],[data-mact]")) { pinPart(part.dataset.part); return; }
    const attrRoll = t.closest("[data-attr-roll]"); if (attrRoll && !t.closest("[data-attr-edit]")) { onRoll(attrRoll.dataset.attrRoll); return; }
    const attrEdit = t.closest("[data-attr-edit]"); if (attrEdit) { e.stopPropagation(); onAttrEdit(attrEdit.dataset.attrEdit); return; }
    const skillRoll = t.closest("[data-skill-roll]"); if (skillRoll) { onRollSkill(skillRoll.dataset.skillRoll); return; }
    const abilityUse = t.closest("[data-ability-use]"); if (abilityUse) { onUseAbility(abilityUse.dataset.abilityUse); return; }
    // weapon buttons
    const wbtn = t.closest("[data-wbtn]"); if (wbtn) { onReloadWeapon(wbtn.dataset.weapon); return; }
    const mbtn = t.closest("[data-mbtn]"); if (mbtn) { mbtn.dataset.mbtn === "load" ? onLoadRounds(mbtn.dataset.mag) : onUnloadRounds(mbtn.dataset.mag); return; }
    const ibtn = t.closest("[data-ibtn]"); if (ibtn) { onUseItem(ibtn.dataset.item); return; }
    // inventory items - click on card to use
    const itemCard = t.closest("[data-item]"); if (itemCard && !t.closest("select,button,[data-gmitem]")) { onUseItem(itemCard.dataset.item); return; }
    const armorBtn = t.closest("[data-armorbtn]"); if (armorBtn) { armorBtn.dataset.armorbtn === "equip" ? onEquip(armorBtn.dataset.equip) : onUnequip(armorBtn.dataset.equip); return; }
    const gmItem = t.closest("[data-gmitem]");
    if (gmItem) {
      const { code, item: itemId, maxqty } = gmItem.dataset;
      if (gmItem.dataset.gmitem === "removeall") {
        onGmRemoveItem(code, maxqty);
      } else {
        const qty = root.querySelector(`[data-gmqty="${CSS.escape(itemId)}"]`)?.value ?? 1;
        onGmRemoveItem(code, qty);
      }
      return;
    }
    const gmAmmo = t.closest("[data-gmammo]");
    if (gmAmmo) {
      const { ammo: ammoStockId, maxqty } = gmAmmo.dataset;
      if (gmAmmo.dataset.gmammo === "removeall") {
        onGmRemoveAmmo(ammoStockId, maxqty);
      } else {
        const qty = root.querySelector(`[data-gmammoqty="${CSS.escape(ammoStockId)}"]`)?.value ?? 1;
        onGmRemoveAmmo(ammoStockId, qty);
      }
      return;
    }
    const gmDel = t.closest("[data-gmdel]");
    if (gmDel) { onGmDelete(gmDel.dataset.gmdel, gmDel.dataset.id); return; }
    const gmBtn = t.closest("[data-gmbtn]");
    if (gmBtn) {
      if (gmBtn.dataset.gmbtn === "addmag" && gmBtn.closest("[data-gmmag]") === null) {
        // re-render magazine ammo dropdown when magazine selection may have changed
      }
      onGmTool(gmBtn.dataset.gmbtn); return;
    }
  }
  function onSectionChange(e) {
    const sel = e.target;
    if (sel.dataset.wact === "profile") return onSwitchProfile(sel.dataset.weapon, sel.value);
    if (sel.dataset.wact === "firemode") return onSwitchFireMode(sel.dataset.weapon, sel.value);
    if (sel.dataset.gmmag) return render(); // update compatible ammo dropdown
    // reloadmag / ammo / part selects are read on button click via DOM
  }
  function selVal(attr, key, val) {
    const el = root.querySelector(`[data-${attr}="${CSS.escape(val)}"][data-${key}]`) || root.querySelector(`select[data-${key}][data-${attr === "weapon" ? "weapon" : attr}="${CSS.escape(val)}"]`);
    return el?.value || "";
  }

  /* ---- characteristic roll (server-authoritative roll_characteristic) ---- */
  async function onRoll(code) {
    if (state.rollingAttr || state.busy) return; // prevent double-trigger
    state.rollingAttr = code; render();
    try {
      const r = await api.checks.rollCharacteristic({ character_id: state.characterId, attribute_code: code }, settings());
      if (!r || r.ok === false) setNotice("err", esc(describeError(r?.error, r?.message || "Roll failed.")));
      else setNotice(r.result?.success ? "ok" : "warn", rollResultText(r));
    } catch (e) {
      setNotice("err", `Roll error: ${esc(e.message)}`);
    } finally {
      state.rollingAttr = ""; render();
    }
  }
  function rollResultText(r) {
    const a = r.attribute || {}, roll = r.roll || {}, res = r.result || {};
    const crit = res.is_critical_success ? " В· CRIT SUCCESS" : res.is_critical_failure ? " В· CRIT FAIL" : "";
    const name = ATTR_RU[a.code] || a.name || a.code;
    return `${esc(name)} check - d20 <span class="cp-mono">${dash(roll.natural_roll)} <= ${dash(roll.target_value)}</span> -> <b>${res.success ? "SUCCESS" : "FAILURE"}</b>${crit}`;
  }
  /* ---- skill check (roll_skill) ---- */
  async function onRollSkill(code) {
    if (state.busy || state.rollingAttr) return;
    state.rollingAttr = "skill:" + code; render();
    try {
      const r = await api.checks.rollSkill({ character_id: state.characterId, skill_code: code }, settings());
      if (!r || r.ok === false) setNotice("err", esc(describeError(r?.error, r?.message || "Skill check failed.")));
      else { const res = r.result || {}; setNotice(res.success ? "ok" : "warn", `Skill check - ${esc(code)} -> <b>${esc(res.outcome || (res.success ? "success" : "failure"))}</b>`); }
    } catch (e) {
      setNotice("err", `Skill check error: ${esc(e.message)}`);
    } finally {
      state.rollingAttr = ""; render();
    }
  }
  /* ---- GM pool adjust (+/-) ---- */
  async function onPoolAdjust(code, delta) {
    const pool = state.pools.find((p) => p.code === code);
    if (!pool || state.busy) return;
    const cur = pool.current_value ?? 0;
    const max = pool.max_value ?? 0;
    const newVal = Math.max(0, Math.min(max, cur + delta));
    if (newVal === cur) return;
    state.busy = true; render();
    try {
      await bridges.supabase.mutateSupabaseRows(
        `odyssey_character_resource_pools?id=eq.${encodeURIComponent(pool.id)}`,
        { current_value: newVal },
        settings(),
        { method: "PATCH", prefer: "return=minimal" },
      );
      await refresh({ sheet: false, armory: false, equipment: false, inventory: false, abilities: true });
    } catch (e) {
      setNotice("err", `Pool update failed: ${esc(e.message)}`); render();
    } finally {
      state.busy = false; render();
    }
  }

  /* ---- GM attribute edit (gm_update_character_attribute) ---- */
  function onAttrEdit(code) {
    const a = arr(state.sheet.attributes).find((x) => x.code === code) || {};
    const name = a.name || code;
    openForm({
      title: `Edit ${name} (GM)`,
      note: (a.default_value != null || a.max_value != null) ? `Allowed: ${dash(a.default_value)} - ${dash(a.max_value)}` : "",
      current: a.value, min: a.default_value, max: a.max_value,
      onSave: (value) => runMutation("Update attribute",
        () => api.gm.gmUpdateCharacterAttribute({ character_id: state.characterId, attribute_code: code, operation: "set", value, reason: "GM edit" }, settings()),
        () => refresh({ armory: false, equipment: false, inventory: false })),
    });
  }

  /* ---- weapon mutations ---- */
  function onSwitchProfile(weaponId, profileId) {
    runMutation("Switch profile", () => api.weapon.switchWeaponProfile(weaponId, profileId, settings()), () => refresh({ equipment: false }));
  }
  function onSwitchFireMode(weaponId, fireModeId) {
    runMutation("Switch fire mode", () => api.weapon.switchWeaponFireMode(state.characterId, weaponId, fireModeId, settings()), () => refresh({ equipment: false }));
  }
  function onReloadWeapon(weaponId) {
    const w = arr(state.armory?.weapons).find((x) => x.id === weaponId);
    const profileId = w?.active_profile?.id || w?.active_profile_id;
    const magId = root.querySelector(`select[data-wact="reloadmag"][data-weapon="${CSS.escape(weaponId)}"]`)?.value;
    if (!profileId || !magId) { setNotice("err", "Select a magazine to insert."); render(); return; }
    runMutation("Reload", () => api.weapon.loadWeaponProfileMagazine({ character_weapon_id: weaponId, profile_id: profileId, character_magazine_id: magId }, settings()), () => refresh({ equipment: false }));
  }
  function onLoadRounds(magId) {
    const ammoId = root.querySelector(`select[data-mact="ammo"][data-mag="${CSS.escape(magId)}"]`)?.value;
    if (!ammoId) { setNotice("err", "Select ammo to load."); render(); return; }
    runMutation("Load rounds", () => api.inventory.loadRoundsToMagazine({ character_magazine_id: magId, ammo_stock_id: ammoId, quantity: 0, allow_partial: true }, settings()), () => refresh({ equipment: false }));
  }
  function onUnloadRounds(magId) {
    runMutation("Unload", () => api.inventory.unloadRoundsFromMagazine({ character_magazine_id: magId }, settings()), () => refresh({ equipment: false }));
  }

  /* ---- abilities (activation) ---- */
  function onUseAbility(abilityId) {
    const ability = state.abilities.find((a) => a.id === abilityId);
    if (!ability) return;
    const passive = ability.activation_type === "passive" || ability.ability_kind === "passive";
    if (passive) { setNotice("warn", "Passive abilities activate automatically."); render(); return; }
    setNotice("info", `Ability activation: ${esc(ability.name)} - ready to use (no RPC yet).`);
    render();
  }

  /* ---- items / medkit ---- */
  function onUseItem(itemId) {
    const partId = root.querySelector(`select[data-iact="part"][data-item="${CSS.escape(itemId)}"]`)?.value;
    if (!partId) { setNotice("err", "Select a body part."); render(); return; }
    runMutation("Use item", () => api.inventory.useCharacterItem({ character_item_id: itemId, target_body_part_id: partId, used_by_character_id: state.characterId }, settings()), () => refresh());
  }

  /* ---- armor equip/unequip ---- */
  // Body-part choices when equipping armor. The model's default slot (if any) is
  // pre-selected; otherwise the user picks the target part explicitly so an
  // unequipped item can always be re-equipped.
  function armorSlotOptions(it) {
    const def = String(it.model?.default_body_part_code || "").toLowerCase();
    const allowed = arr(it.model?.flags?.allowed_body_part_codes || []).map((c) => String(c).toLowerCase());
    const lastId = state.lastSlot[it.id]; // previously-equipped part wins as default
    let parts = arr(state.sheet?.body_parts);

    // Filter to only allowed slots (if the model specifies constraints).
    if (allowed.length > 0) {
      parts = parts.filter((b) => {
        const codes = [b.code, b.part_key].map((x) => String(x || "").toLowerCase());
        return codes.some((c) => allowed.includes(c));
      });
    }

    if (!parts.length) return `<option value="">-- no compatible body parts --</option>`;

    // Pre-select: last slot > default > first available
    const selected = parts.find((b) => b.id === lastId) ||
                     parts.find((b) => {
                       const codes = [b.code, b.part_key].map((x) => String(x || "").toLowerCase());
                       return def && codes.includes(def);
                     }) ||
                     parts[0];

    return parts.map((b) => {
      const sel = b.id === selected?.id ? "selected" : "";
      return `<option value="${esc(b.id)}" ${sel}>${esc(b.name)}</option>`;
    }).join("");
  }
  function onEquip(equipId) {
    const partId = root.querySelector(`select[data-equip-part="${CSS.escape(equipId)}"]`)?.value;
    if (!partId) { setNotice("err", "Select a body part to equip to."); render(); return; }
    runMutation("Equip", () => api.equipment.equipCharacterEquipmentItem(equipId, partId, settings()), () => refresh());
  }
  function onUnequip(equipId) {
    const it = equipmentItems().find((x) => x.id === equipId);
    if (it?.body_part?.id) state.lastSlot[equipId] = it.body_part.id; // remember slot for re-equip
    runMutation("Unequip", () => api.equipment.unequipCharacterEquipmentItem(equipId, settings()), () => refresh());
  }

  /* ---- GM ---- */
  function onGmRemoveItem(code, qty) {
    if (!code) { setNotice("err", "Item has no code."); render(); return; }
    const n = Math.max(1, Number(qty) || 1);
    runMutation("Remove item", () => api.inventory.removeCharacterItemQuantity(state.characterId, code, n, settings()), () => refresh());
  }
  function onGmRemoveAmmo(ammoStockId, qty) {
    if (!ammoStockId) { setNotice("err", "Ammo stack ID is missing."); render(); return; }
    const n = Math.max(1, Number(qty) || 1);
    runMutation("Remove ammo", () => api.inventory.removeCharacterAmmoStock(ammoStockId, n, settings()), () => refresh({ sheet: false, armory: false, equipment: false, abilities: false }));
  }
  function onGmAddItem() {
    const code = root.querySelector('[data-ref="gmAddCode"]')?.value.trim();
    const qty = Math.max(Number(root.querySelector('[data-ref="gmAddQty"]')?.value) || 1, 1);
    if (!code) { setNotice("err", "Select item."); render(); return; }
    runMutation("Add item", () => api.inventory.addCharacterItem({ character_id: state.characterId, item_code: code, quantity: qty }, settings()), () => refresh({ sheet: false, equipment: false, abilities: false }));
  }
  function onGmAddSkill() {
    const defId = root.querySelector('[data-ref="gmSkillDef"]')?.value;
    const level = Math.max(1, Number(root.querySelector('[data-ref="gmSkillLevel"]')?.value) || 1);
    if (!defId) { setNotice("err", "Select a skill."); render(); return; }
    runMutation("Add skill", () => bridges.supabase.mutateSupabaseRows(
      "odyssey_character_skills",
      { character_id: state.characterId, skill_def_id: defId, level },
      settings(), { method: "POST", prefer: "return=minimal" }
    ), () => refresh({ armory: false, equipment: false, inventory: false }));
  }
  function onGmAddWeapon() {
    const defId = root.querySelector('[data-ref="gmWeaponDef"]')?.value;
    if (!defId) { setNotice("err", "Select a weapon model."); render(); return; }
    runMutation("Add weapon", () => bridges.supabase.mutateSupabaseRows(
      "odyssey_character_weapons",
      { character_id: state.characterId, weapon_model_id: defId },
      settings(), { method: "POST", prefer: "return=minimal" }
    ), () => refresh({ sheet: false, equipment: false, abilities: false }));
  }
  function onGmAddMagazine() {
    const defId = root.querySelector('[data-ref="gmMagDef"]')?.value;
    const ammoId = root.querySelector('[data-ref="gmMagAmmo"]')?.value;
    if (!defId) { setNotice("err", "Select a magazine type."); render(); return; }
    if (!ammoId) { setNotice("err", "Select an ammo type for the magazine."); render(); return; }
    runMutation("Add magazine", () => bridges.supabase.mutateSupabaseRows(
      "odyssey_character_magazines",
      { character_id: state.characterId, magazine_def_id: defId, ammo_type_id: ammoId },
      settings(), { method: "POST", prefer: "return=minimal" }
    ), () => refresh({ sheet: false, equipment: false, abilities: false }));
  }
  function onGmAddAmmo() {
    const ammoTypeId = root.querySelector('[data-ref="gmAmmoDef"]')?.value;
    const qty = Math.max(1, Number(root.querySelector('[data-ref="gmAmmoQty"]')?.value) || 1);
    if (!ammoTypeId) { setNotice("err", "Select an ammo type."); render(); return; }
    const ammoDef = state.ammoDefs.find((d) => String(d?.id ?? "") === ammoTypeId);
    if (!ammoDef) { setNotice("err", "Ammo type definition not found."); render(); return; }
    runMutation("Add ammo", () => api.inventory.addCharacterAmmoStock(
      { character_id: state.characterId, ammo_type_id: ammoTypeId, quantity: qty }, settings()
    ), () => refresh({ sheet: false, equipment: false, abilities: false }));
  }
  function onGmDelete(type, id) {
    if (!id) { setNotice("err", "Missing ID."); render(); return; }
    const DEL = { method: "DELETE", prefer: "return=minimal" };
    const charIdFilter = `character_id=eq.${encodeURIComponent(state.characterId)}`;
    const idFilter = `id=eq.${encodeURIComponent(id)}`;
    if (type === "skill") {
      runMutation("Delete skill", () => bridges.supabase.mutateSupabaseRows(
        `odyssey_character_skills?${idFilter}&${charIdFilter}`, null, settings(), DEL
      ), () => refresh({ armory: false, equipment: false, inventory: false }));
    } else if (type === "weapon") {
      runMutation("Delete weapon", () => bridges.supabase.mutateSupabaseRows(
        `odyssey_character_weapons?${idFilter}&${charIdFilter}`, null, settings(), DEL
      ), () => refresh({ sheet: false, equipment: false, inventory: false, abilities: false }));
    } else if (type === "mag") {
      runMutation("Delete magazine", () => bridges.supabase.mutateSupabaseRows(
        `odyssey_character_magazines?${idFilter}&${charIdFilter}`, null, settings(), DEL
      ), () => refresh({ sheet: false, equipment: false, abilities: false }));
    } else if (type === "equip") {
      runMutation("Delete equipment", () => bridges.supabase.mutateSupabaseRows(
        `odyssey_character_equipment_items?${idFilter}&${charIdFilter}`, null, settings(), DEL
      ), () => refresh({ sheet: false, armory: false, inventory: false, abilities: false }));
    } else {
      setNotice("err", `Unknown delete type: ${type}`); render();
    }
  }
  function onGmAddEquipment(refKey, label) {
    const code = root.querySelector(`[data-ref="${refKey}"]`)?.value;
    if (!code) { setNotice("err", "Select a model."); render(); return; }
    runMutation(label, () => api.equipment.createCharacterEquipmentItem(
      { character_id: state.characterId, equipment_model_code: code }, settings()
    ), () => refresh({ sheet: false, armory: false, inventory: false, abilities: false }));
  }
  function onGmTool(kind) {
    if (kind === "additem")    return onGmAddItem();
    if (kind === "addskill")   return onGmAddSkill();
    if (kind === "addweapon")  return onGmAddWeapon();
    if (kind === "addmag")     return onGmAddMagazine();
    if (kind === "addammo")    return onGmAddAmmo();
    if (kind === "addarmor")   return onGmAddEquipment("gmArmorDef", "Add armor");
    if (kind === "addimplant") return onGmAddEquipment("gmImplantDef", "Add implant");
    if (kind === "heal")   return runMutation("GM heal",   () => api.gm.gmHealCharacter(state.characterId, settings()), () => refresh());
    if (kind === "repair") return runMutation("GM repair", () => api.gm.gmRepairCharacterArmor(state.characterId, settings()), () => refresh());
  }

  /* ---- OBR token -> character_id ---- */
  async function onUseToken() {
    const tokens = await withTimeout(bridges.obr?.getSelectedOwlbearTokens?.(), OBR_TIMEOUT, null);
    if (!tokens) { setNotice("warn", "Owlbear not available (run inside Owlbear)."); render(); return; }
    if (!tokens.length) { setNotice("warn", "No token selected."); render(); return; }

    const token = tokens[0];
    const tokenId = String(token?.id ?? "");

    // Fast path: OBR token metadata (written by tokenRealtimeSync in GM Tools)
    let characterId = bridges.token.getTokenCharacterLink(token).characterId;

    // Fallback: use get_character_spawn_catalog (known to work) - find item by scene_link.token_id
    if (!characterId && hasUsableSettings(settings())) {
      setNotice("info", "Looking up character by token_id..."); render();
      const ctx = await withTimeout(bridges.obr?.getRoomSceneContext?.(), OBR_TIMEOUT, null);
      if (ctx?.roomId) {
        const catalogRes = await withTimeout(
          api.placement.getCharacterSpawnCatalog({
            room_id: ctx.roomId,
            scene_id: ctx.sceneId,
            include_active_npcs: true,
            limit: 200,
          }, settings()),
          OBR_TIMEOUT * 2,
          null,
        );
        const match = (catalogRes?.items ?? []).find(
          (item) => String(item?.scene_link?.token_id ?? "") === tokenId,
        );
        characterId = String(match?.id ?? "").trim();
      }
    }

    if (!characterId) { setNotice("warn", "Token is not linked to a character. Bind it first in GM Tools -> Placement."); render(); return; }
    const input = root.querySelector('[data-ref="charId"]');
    if (input) input.value = characterId;
    loadCharacter(characterId);
  }

  /* ---- numeric edit dialog with - / + stepper (Save/Cancel) ---- */
  function openForm({ title, note, current, min, max, onSave }) {
    const overlay = document.createElement("div");
    overlay.className = "cp-overlay";
    overlay.innerHTML = `<div class="cp-dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h3>${esc(title)}</h3>
      ${note ? `<div class="cp-muted" style="font-size:11px;margin-bottom:8px">${esc(note)}</div>` : ""}
      <div class="cp-dlg-stepper">
        <button data-dlg-dec type="button" class="secondary cp-dlg-step">-</button>
        <input data-dlg-input type="text" inputmode="numeric" value="${esc(current ?? "")}" class="cp-mono cp-dlg-input">
        <button data-dlg-inc type="button" class="secondary cp-dlg-step">+</button>
      </div>
      <div class="button-row" style="margin-top:8px"><button data-dlg-save type="button">Save</button><button data-dlg-cancel type="button" class="secondary">Cancel</button></div>
    </div>`;
    const input = overlay.querySelector("[data-dlg-input]");
    const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
    const save = () => {
      let v = Number(input.value);
      if (!Number.isFinite(v)) { input.focus(); return; }
      if (min != null) v = Math.max(v, Number(min));
      if (max != null) v = Math.min(v, Number(max));
      close();
      Promise.resolve(onSave(v)).catch(() => {});
    };
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Enter" && document.activeElement === input) { e.preventDefault(); save(); }
    }
    overlay.addEventListener("click", (e) => { if (e.target === overlay || e.target.closest("[data-dlg-cancel]")) close(); });
    overlay.querySelector("[data-dlg-save]").addEventListener("click", save);
    overlay.querySelector("[data-dlg-dec]").addEventListener("click", () => {
      let v = Number(input.value) - 1;
      if (min != null) v = Math.max(v, Number(min));
      input.value = v;
    });
    overlay.querySelector("[data-dlg-inc]").addEventListener("click", () => {
      let v = Number(input.value) + 1;
      if (max != null) v = Math.min(v, Number(max));
      input.value = v;
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    input.focus(); input.select();
  }

  render();
  return () => {
    document.removeEventListener("keydown", onEscOnce);
    cleanupRealtimeSubscriptions(); // cleanup real-time listeners on unmount
  };
}
