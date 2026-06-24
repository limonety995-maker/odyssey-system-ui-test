// Resolve Attack screen (Stage 5A vertical slice).
// Collects input, builds payloads, calls perform_attack via the runtime API,
// renders the backend result, and refreshes from the backend after each attack.
// The backend stays authoritative — no combat math, damage, ammo, or energy here.

import screenStyles from "./resolveAttackStyles.css";
import { escapeHtml, prettyJson } from "../../utils/json.js";
import {
  resolveAttack,
  buildAttackPayload,
  describeError,
  ValidationError,
} from "./resolveAttackService.js";
import {
  loadDevSettings,
  saveDevSettings,
  clearDevSettings,
  hasUsableSettings,
  resolveEffectiveSettings,
} from "./resolveAttackSettings.js";
import { getRealtimeClient } from "../../bridge/realtimeClient.js";

/* ---------------- constants ---------------- */
const PART_GEOMETRY = {
  head: { x: 31, y: 6, w: 18, h: 18, r: "50%" },
  torso: { x: 28, y: 26, w: 24, h: 30, r: 6 },
  l_arm: { x: 16, y: 28, w: 8, h: 26, r: 5 },
  r_arm: { x: 56, y: 28, w: 8, h: 26, r: 5 },
  l_leg: { x: 28, y: 58, w: 9, h: 24, r: 5 },
  r_leg: { x: 42, y: 58, w: 9, h: 24, r: 5 },
};
const PART_ALIASES = {
  arm_l: "l_arm", arm_r: "r_arm", leg_l: "l_leg", leg_r: "r_leg",
  left_arm: "l_arm", right_arm: "r_arm", left_leg: "l_leg", right_leg: "r_leg",
};
const DOLL_SCALE = 1.5;
const OBR_TIMEOUT_MS = 1500;

/* ---------------- small helpers ---------------- */
const dash = (v) => (v === null || v === undefined || v === "" ? "-" : v);
const esc = (v) => escapeHtml(v);
const fmt = (v) => (Number(v) > 0 ? "+" : "") + (Number(v) || 0);
const arr = (v) => (Array.isArray(v) ? v : []);
function bodyPartKey(part) {
  const code = normPartCode(part);
  if (code) return code;
  return String(part?.name || part?.id || "").trim().toLowerCase();
}
function dedupeBodyParts(parts) {
  const byKey = new Map();
  for (const part of arr(parts)) {
    const key = bodyPartKey(part);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, part);
      continue;
    }
    const prevTargetable = isTargetable(prev);
    const nextTargetable = isTargetable(part);
    if (!prevTargetable && nextTargetable) {
      byKey.set(key, part);
      continue;
    }
    const prevDrawable = Boolean(PART_GEOMETRY[normPartCode(prev)]);
    const nextDrawable = Boolean(PART_GEOMETRY[normPartCode(part)]);
    if (!prevDrawable && nextDrawable) {
      byKey.set(key, part);
    }
  }
  return Array.from(byKey.values());
}

function injectStylesOnce() {
  if (document.getElementById("ra-screen-styles")) return;
  const style = document.createElement("style");
  style.id = "ra-screen-styles";
  style.textContent = screenStyles;
  document.head.appendChild(style);
}

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    Promise.resolve()
      .then(() => promise)
      .catch(() => fallback),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function normPartCode(part) {
  const c = String(part?.code || part?.part_key || "").toLowerCase();
  return PART_ALIASES[c] || c;
}
function partColor(p) {
  if (p?.destroyed) return "#7a2a32";
  if ((p?.critical || 0) > 0 || (p?.serious || 0) > 0 || (p?.minor || 0) > 0 || p?.armor_destroyed) return "#b07e2a";
  return "#33425e";
}
function isTargetable(p) {
  return p && p.can_be_targeted !== false && !p.destroyed;
}

/* ---------------- mount ---------------- */
export function mountResolveAttackScreen({ root, runtime }) {
  injectStylesOnce();

  const api = runtime?.api ?? {};
  const bridges = runtime?.bridges ?? {};

  const state = {
    settings: loadDevSettings(),
    settingsSource: "local",
    mode: "weapon",
    attacker: { id: "", armory: null, abilities: [], pools: [], weaponId: "", abilityId: "", sheet: null, bodyParts: [], inventory: { magazines: [], ammoStock: [], items: [], fallback: false } },
    target: { id: "", sheet: null, bodyParts: [], partId: "", effectSummary: null },
    inv: { reloadMagId: "", opsMagId: "", ammoStockId: "" },
    heal: { itemId: "", applyTo: "target", partId: "" },
    gmTarget: "target",
    obr: { roomId: "", sceneId: "", campaignId: "", actorTokenId: "", targetTokenId: "" },
    distance: 0,
    modifiers: [
      { id: "prepared", label: "Prepared", value: 20, on: false },
      { id: "cover", label: "Target cover", value: -10, on: false },
      { id: "flank", label: "Flank", value: 10, on: false },
    ],
    debug: { payload: null, raw: null, normalized: null, error: null, refresh: null, inventory: null },
    busy: false,
    log: [],
    realtimeSubscriptions: [],
  };

  root.innerHTML = skeleton();
  const refs = queryRefs(root);

  /* ---- settings helpers ---- */
  async function ensureSettings() {
    const dev = loadDevSettings();
    if (hasUsableSettings(dev)) {
      state.settings = dev;
      state.settingsSource = "local";
      return dev;
    }
    const resolved = await resolveEffectiveSettings();
    state.settings = resolved.settings;
    state.settingsSource = resolved.source;
    return resolved.settings;
  }
  const settings = () => state.settings;

  /* ---- API thin wrappers bound to current settings ---- */
  const callPerformAttack = (payload) => api.combat.performAttack(payload, settings());
  const loadArmory = (id) => api.weapon.getCharacterArmory(id, settings());
  const loadAbilities = (id) => api.ability.getCharacterAbilities(id, settings());
  const loadRuleSheet = (id) => api.character.getCharacterRuleSheet(id, settings());
  const loadEffectSummary = (id) =>
    api.effects?.getCharacterEffectSummary
      ? api.effects.getCharacterEffectSummary(id, settings()).catch(() => null)
      : Promise.resolve(null);
  // get_character_inventory is the intended source. It is currently broken on the
  // backend (marked STABLE but transitively INSERTs via get_character_armory ->
  // "cannot execute INSERT in a read-only transaction"). When it fails we fall back
  // to a plain read of the ammo-stock table so the ammo UI stays usable; magazines
  // come from the armory regardless. (Backend fix needed — flagged, not patched here.)
  async function loadInventory(id) {
    try {
      const inv = await api.inventory.getCharacterInventory(id, settings());
      if (inv && inv.ok !== false) return inv;
    } catch {
      /* fall through to direct reads below */
    }
    const [ammo, items] = await Promise.all([
      fetchAmmoStockDirect(id).catch(() => []),
      fetchItemsDirect(id).catch(() => []),
    ]);
    return { ok: true, _fallback: true, ammo_stock: ammo, items };
  }
  async function fetchItemsDirect(id) {
    const rows = await bridges.supabase.fetchSupabaseRows(
      `odyssey_character_items?character_id=eq.${encodeURIComponent(id)}` +
        `&select=id,quantity,custom_name,item_def:odyssey_item_defs(code,name,item_type,use_action_type)`,
      settings(),
      "Unable to read items.",
    );
    return arr(rows).map((r) => ({
      id: r.id,
      name: r.custom_name || r.item_def?.name || r.item_def?.code || "item",
      item_code: r.item_def?.code || null,
      item_type: r.item_def?.item_type || null,
      use_action_type: r.item_def?.use_action_type || null,
      quantity: r.quantity,
    }));
  }
  const rpcUseItem = (payload) => api.inventory.useCharacterItem(payload, settings());
  const rpcGmHeal = (id) => api.gm.gmHealCharacter(id, settings());
  const rpcGmRepair = (id) => api.gm.gmRepairCharacterArmor(id, settings());
  async function fetchAmmoStockDirect(id) {
    const rows = await bridges.supabase.fetchSupabaseRows(
      `odyssey_character_ammo_stock?character_id=eq.${encodeURIComponent(id)}` +
        `&select=id,character_id,display_name,quantity,caliber_id,ammo_type_id,caliber:odyssey_caliber_defs(id,code,name),ammo_type:odyssey_ammo_type_defs(id,code,name)`,
      settings(),
      "Unable to read ammo stock.",
    );
    return arr(rows).map((r) => ({
      id: r.id,
      character_id: r.character_id,
      display_name: r.display_name,
      quantity: r.quantity,
      caliber_id: r.caliber_id || r.caliber?.id || null,
      caliber_code: r.caliber?.code || null,
      caliber_name: r.caliber?.name || null,
      ammo_type_id: r.ammo_type_id || r.ammo_type?.id || null,
      ammo_type_code: r.ammo_type?.code || null,
      ammo_type_name: r.ammo_type?.name || null,
    }));
  }
  const rpcLoadRounds = (payload) => api.inventory.loadRoundsToMagazine(payload, settings());
  const rpcUnloadRounds = (payload) => api.inventory.unloadRoundsFromMagazine(payload, settings());
  const rpcInsertMagazine = (payload) => api.weapon.loadWeaponProfileMagazine(payload, settings());

  /* ---- connection ---- */
  refs.cfgUrl.value = state.settings.url;
  refs.cfgKey.value = state.settings.apiKey;

  refs.cfgSave.addEventListener("click", async () => {
    state.settings = saveDevSettings({ url: refs.cfgUrl.value, apiKey: refs.cfgKey.value });
    state.settingsSource = "local";
    banner(refs.cfgStatus, "info", "Saved locally. Testing connection…");
    await testConnection();
  });
  refs.cfgClear.addEventListener("click", () => {
    state.settings = clearDevSettings();
    refs.cfgUrl.value = "";
    refs.cfgKey.value = "";
    banner(refs.cfgStatus, "info", "Local dev settings cleared. Room settings (inside Owlbear) will be used if available.");
  });
  refs.cfgTest.addEventListener("click", testConnection);

  async function testConnection() {
    try {
      await ensureSettings();
      if (!hasUsableSettings(settings())) {
        banner(refs.cfgStatus, "err", "Supabase URL and key are required.");
        return;
      }
      // Reuse the shared bridge connection test.
      const result = await bridges.supabase.testSupabaseConnection(settings());
      banner(refs.cfgStatus, "ok", `Connected (source: ${state.settingsSource}). Sample rows: ${result.sampleRowCount}.`);
    } catch (e) {
      banner(refs.cfgStatus, "err", `Connection failed: ${esc(e.message)}`);
    }
  }

  /* ---- OBR token selection ---- */
  refs.useAttacker.addEventListener("click", () => useSelectedToken("attacker"));
  refs.useTarget.addEventListener("click", () => useSelectedToken("target"));

  async function useSelectedToken(which) {
    const statusEl = refs.loadStatus;
    banner(statusEl, "info", "Reading selected Owlbear token…");
    const tokens = await withTimeout(bridges.obr.getSelectedOwlbearTokens(), OBR_TIMEOUT_MS, null);
    if (!tokens) {
      banner(statusEl, "warn", "Owlbear is not available (run inside Owlbear). Manual character_id still works.");
      return;
    }
    if (!tokens.length) {
      banner(statusEl, "warn", "No token selected in Owlbear.");
      return;
    }
    const token = tokens[0];
    const tokenId = String(token?.id ?? "");

    // Fast path: OBR token metadata (written by tokenRealtimeSync in GM Tools)
    let characterId = bridges.token.getTokenCharacterLink(token).characterId;

    // Fallback: use get_character_spawn_catalog (known to work) — find item by scene_link.token_id
    if (!characterId && hasUsableSettings(settings())) {
      banner(statusEl, "info", "Looking up character by token_id…");
      const ctx = await withTimeout(bridges.obr.getRoomSceneContext(), OBR_TIMEOUT_MS, null);
      if (ctx?.roomId) {
        state.obr.roomId = ctx.roomId;
        state.obr.sceneId = ctx.sceneId;
        state.obr.campaignId = ctx.campaignId;
        const catalogRes = await withTimeout(
          api.placement.getCharacterSpawnCatalog({
            room_id: ctx.roomId,
            scene_id: ctx.sceneId,
            include_active_npcs: true,
            limit: 200,
          }, settings()),
          OBR_TIMEOUT_MS * 2,
          null,
        );
        const match = (catalogRes?.items ?? []).find(
          (item) => String(item?.scene_link?.token_id ?? "") === tokenId,
        );
        characterId = String(match?.id ?? "").trim();
      }
    }

    if (!characterId) {
      banner(statusEl, "warn", "Token is not linked to a character. Bind it first in GM Tools → Placement.");
      return;
    }

    // capture room/scene context (may already be set above)
    if (!state.obr.roomId) {
      const ctx = await withTimeout(bridges.obr.getRoomSceneContext(), OBR_TIMEOUT_MS, null);
      if (ctx) {
        state.obr.roomId = ctx.roomId || "";
        state.obr.sceneId = ctx.sceneId || "";
        state.obr.campaignId = ctx.campaignId || "";
      }
    }
    if (which === "attacker") {
      refs.attackerId.value = characterId;
      state.obr.actorTokenId = tokenId;
    } else {
      refs.targetId.value = characterId;
      state.obr.targetTokenId = tokenId;
    }
    banner(statusEl, "ok", `Linked ${which} → character_id ${characterId.slice(0, 8)}… (token ${tokenId.slice(0, 8)}…)`);
    renderObrContext();
    renderPayloadPreview();
  }

  /* ---- tab visibility refresh: re-fetch body parts when Combat tab is shown ---- */
  root.addEventListener("odyssey:tabshow", async () => {
    if (!state.attacker.id || !state.target.id) return;
    await Promise.all([
      refreshSheetFor("attacker").catch(() => null),
      refreshSheetFor("target").catch(() => null),
    ]);
  });

  /* ---- load combatants ---- */
  refs.loadBtn.addEventListener("click", onLoad);

  async function onLoad() {
    const attackerId = refs.attackerId.value.trim();
    const targetId = refs.targetId.value.trim();
    if (!attackerId || !targetId) {
      banner(refs.loadStatus, "err", "Enter both attacker and target character_id.");
      return;
    }
    await ensureSettings();
    if (!hasUsableSettings(settings())) {
      banner(refs.loadStatus, "err", "Configure Supabase connection first.");
      return;
    }
    banner(refs.loadStatus, "info", "Loading combatants from Supabase…");
    try {
      // Inventory/ammo/medkit management lives in the Character panel now; Combat
      // only needs armory (read-only weapon state), abilities, and the target sheet.
      const [armory, abilitiesRes, sheet] = await Promise.all([
        loadArmory(attackerId),
        loadAbilities(attackerId),
        loadRuleSheet(targetId),
      ]);
      if (armory && armory.ok === false) throw new Error("Attacker not found: check attacker character_id.");
      if (!sheet || sheet.ok === false || !sheet.character) throw new Error("Target not found: check target character_id.");

      state.attacker.id = attackerId;
      state.attacker.armory = armory;
      state.attacker.abilities = arr(abilitiesRes?.abilities).filter((a) => a.is_enabled !== false);
      state.attacker.pools = arr(abilitiesRes?.resource_pools);
      state.target.id = targetId;
      state.target.sheet = sheet;
      state.target.bodyParts = dedupeBodyParts(sheet?.body_parts);
      state.target.effectSummary = await loadEffectSummary(targetId);

      const weapons = arr(armory?.weapons);
      state.attacker.weaponId = weapons[0]?.id || "";
      const atkAbilities = attackAbilities();
      state.attacker.abilityId = atkAbilities[0]?.id || "";
      selectFirstTargetablePart();

      setupCombatRealtimeSubscriptions(attackerId, targetId);
      refs.combatCard.classList.remove("ra-hidden");
      refs.debugCard.classList.remove("ra-hidden");
      banner(
        refs.loadStatus,
        "ok",
        `Loaded: weapons ${weapons.length}, attack-abilities ${atkAbilities.length}, target sections ${state.target.bodyParts.length}.`,
      );
      renderAll();
    } catch (e) {
      banner(refs.loadStatus, "err", `Load error: ${esc(e.message)}`);
    }
  }

  function attackAbilities() {
    return state.attacker.abilities.filter((a) => a.attack_type && a.attack_type !== "none");
  }
  function currentWeapon() {
    return arr(state.attacker.armory?.weapons).find((w) => w.id === state.attacker.weaponId) || null;
  }
  function currentAbility() {
    return state.attacker.abilities.find((a) => a.id === state.attacker.abilityId) || null;
  }
  function selectFirstTargetablePart() {
    const targetable = state.target.bodyParts.filter(isTargetable);
    state.target.partId = (targetable[0] || state.target.bodyParts[0])?.id || "";
  }

  /* ---- rendering ---- */
  function renderAll() {
    renderModes();
    renderWeaponSelect();
    renderAbilitySelect();
    renderProfileAndFireMode();
    renderAttackBlock();
    renderFeatures();
    renderDoll();
    renderParts();
    renderMods();
    renderObrContext();
    renderPayloadPreview();
  }

  function renderModes() {
    refs.modes.querySelectorAll("[data-mode]").forEach((el) => el.classList.toggle("active", el.dataset.mode === state.mode));
    refs.weaponPick.classList.toggle("ra-hidden", state.mode !== "weapon");
    refs.skillPick.classList.toggle("ra-hidden", state.mode !== "skill");
  }

  function renderWeaponSelect() {
    const weapons = arr(state.attacker.armory?.weapons);
    refs.weaponSelect.innerHTML = weapons.length
      ? weapons.map((w) => `<option value="${esc(w.id)}" ${w.id === state.attacker.weaponId ? "selected" : ""}>${esc(w.name)} - ${esc(w.model?.weapon_class_name || w.model?.weapon_class || "")}</option>`).join("")
      : `<option value="">- no weapons -</option>`;
  }

  function renderAbilitySelect() {
    const abilities = attackAbilities();
    refs.abilitySelect.innerHTML = abilities.length
      ? abilities.map((a) => `<option value="${esc(a.id)}" ${a.id === state.attacker.abilityId ? "selected" : ""}>${esc(a.name)} - lvl ${dash(a.effective_level)}</option>`).join("")
      : `<option value="">- no attack abilities -</option>`;
  }

  function renderProfileAndFireMode() {
    const w = currentWeapon();
    if (!w) { refs.profileRow.innerHTML = ""; return; }
    const profiles = arr(w.profiles);
    const fireModes = arr(w.available_fire_modes.length ? w.available_fire_modes : w.active_profile?.available_fire_modes);
    const selFmId = (w.selected_fire_mode || w.active_profile?.selected_fire_mode)?.id || "";

    let html = "";
    if (profiles.length > 1) {
      html += `<label class="ra-field"><span>Weapon profile</span><select data-sel="profile">${profiles
        .map((p) => `<option value="${esc(p.id)}" ${p.id === w.active_profile_id ? "selected" : ""}>${esc(p.name || p.code || "profile")}${p.attack_type ? " - " + esc(p.attack_type) : ""}</option>`)
        .join("")}</select></label>`;
    } else if (profiles.length === 1) {
      const p = profiles[0];
      html += `<label class="ra-field"><span>Weapon profile</span><div class="ra-chip">${esc(p.name || p.code || "default")}${p.attack_type ? " - " + esc(p.attack_type) : ""}</div></label>`;
    }
    if (fireModes.length) {
      html += `<label class="ra-field"><span>Fire mode</span><select data-sel="fireMode">${fireModes
        .map((f) => `<option value="${esc(f.id)}" ${f.id === selFmId ? "selected" : ""}>${esc(f.name || f.code || "fire mode")}</option>`)
        .join("")}</select></label>`;
    }
    refs.profileRow.innerHTML = html;
  }

  function renderAttackBlock() {
    if (state.mode === "weapon") {
      const w = currentWeapon();
      if (!w) { refs.attackBlock.innerHTML = ""; return; }
      const isMelee = !w.model?.caliber;
      const mag = w.loaded_magazine || w.active_profile?.loaded_magazine || null;
      const fm = w.selected_fire_mode || w.active_profile?.selected_fire_mode || null;
      let chips = "";
      if (isMelee) {
        chips += `<span class="ra-chip">melee - str-based</span>`;
      } else {
        chips += fm ? `<span class="ra-chip">mode: ${esc(fm.name || fm.code)}</span>` : `<span class="ra-chip neg">no fire mode</span>`;
        if (mag) {
          const ammo = mag.ammo_type_name || mag.ammo_type?.name || mag.ammo_type || "-";
          const cal = mag.magazine_def?.caliber_name || mag.caliber_name || mag.caliber || "";
          chips += `<span class="ra-chip">mag ${dash(mag.current_rounds)} / ${dash(mag.capacity || mag.magazine_def?.capacity)} - ${esc(ammo)}${cal ? " - " + esc(cal) : ""}</span>`;
          if ((mag.current_rounds ?? 0) <= 0) chips += `<span class="ra-chip neg">magazine empty</span>`;
        } else {
          chips += `<span class="ra-chip neg">no magazine loaded</span>`;
        }
      }
      refs.attackBlock.innerHTML = `<div class="ra-block">${chips}</div>`;
    } else {
      const a = currentAbility();
      if (!a) { refs.attackBlock.innerHTML = ""; return; }
      const cost = a.resource?.cost ?? 0;
      const pool = state.attacker.pools.find((p) => p.code === a.resource?.pool_code);
      const cur = pool?.current_value ?? 0, max = pool?.max_value ?? 0;
      const pct = max > 0 ? Math.round((cur / max) * 100) : 0;
      const ignore = a.level_data?.ignore_armor;
      const cd = a.current_cooldown_rounds;
      refs.attackBlock.innerHTML = `<div class="ra-block">
        <span class="ra-chip">cost k:${esc(cost)}</span>
        ${pool ? `<span class="ra-row" style="gap:6px"><span class="ra-muted">${esc(pool.name || "Energy")}</span><span class="ra-ebar"><span style="width:${pct}%"></span></span><span class="ra-mono">${cur} / ${max}</span></span>` : `<span class="ra-chip neg">resource pool not found</span>`}
        ${cd ? `<span class="ra-chip neg">cooldown ${esc(cd)}</span>` : ""}
        ${ignore ? `<span class="ra-chip">ignores armor</span>` : ""}
      </div>`;
    }
  }

  function renderFeatures() {
    const w = currentWeapon();
    const features = arr(w?.features);
    if (state.mode !== "weapon" || !features.length) { refs.features.innerHTML = ""; return; }
    refs.features.innerHTML =
      `<div class="ra-section-title">Weapon features (read-only)</div>` +
      features
        .map((f) => {
          const active = f.is_active ?? f.active;
          const charges = f.current_charges ?? f.charges;
          const bits = [];
          if (charges !== undefined && charges !== null) bits.push(`charges ${charges}${f.max_charges ? "/" + f.max_charges : ""}`);
          if (f.requires_reload) bits.push("needs reload");
          if (f.current_cooldown_rounds) bits.push(`cd ${f.current_cooldown_rounds}`);
          if (f.uses_left !== undefined && f.uses_left !== null) bits.push(`uses ${f.uses_left}`);
          return `<div class="ra-feature"><span>${esc(f.name || f.code || "feature")}</span><span class="${active ? "on" : "off"}">${active ? "active" : "inactive"}${bits.length ? " - " + esc(bits.join(" - ")) : ""}</span></div>`;
        })
        .join("");
  }

  function makeDoll() {
    const s = DOLL_SCALE, W = 96 * s, H = 104 * s;
    let h = `<div class="ra-doll" style="width:${W}px;height:${H}px">`;
    h += `<div class="ra-base" style="left:${22 * s}px;top:${84 * s}px;width:${36 * s}px;height:${9 * s}px"></div>`;
    for (const p of state.target.bodyParts) {
      const g = PART_GEOMETRY[normPartCode(p)];
      if (!g) continue;
      const rad = g.r === "50%" ? "50%" : g.r * s + "px";
      const sel = p.id === state.target.partId ? "sel" : "";
      h += `<div class="ra-part ${sel}" data-part="${esc(p.id)}" title="${esc(p.name)}" style="left:${g.x * s}px;top:${g.y * s}px;width:${g.w * s}px;height:${g.h * s}px;border-radius:${rad};background:${partColor(p)}"></div>`;
    }
    h += `</div>`;
    return h;
  }
  function renderDoll() {
    refs.targetName.textContent = state.target.sheet?.character?.name || (state.target.id ? state.target.id.slice(0, 8) + "..." : "Target");
    refs.doll.innerHTML = makeDoll();
  }

  function renderParts() {
    refs.parts.innerHTML = state.target.bodyParts
      .map((p) => {
        const cls = ["ra-partchip"];
        const targetable = isTargetable(p);
        const drawable = Boolean(PART_GEOMETRY[normPartCode(p)]);
        if (p.id === state.target.partId) cls.push("active");
        if (!drawable) cls.push("custom");
        if (!targetable) cls.push("disabled");
        const aim = p.aim_difficulty ? ` <span class="ra-mono ra-muted">-${esc(p.aim_difficulty)}</span>` : "";
        const reason = p.destroyed ? " (destroyed)" : p.can_be_targeted === false ? " (untargetable)" : "";
        return `<span class="${cls.join(" ")}" data-part="${esc(p.id)}" data-targetable="${targetable}">${esc(p.name)}${aim}${reason}</span>`;
      })
      .join("");
  }

  function renderMods() {
    refs.modRow.innerHTML = state.modifiers
      .map((m) => `<span class="ra-mc ${m.on ? "on" : ""}" data-mod="${esc(m.id)}">${esc(m.label)} <span class="ra-mono ${m.value < 0 ? "ra-neg" : "ra-pos"}">${fmt(m.value)}</span></span>`)
      .join("");
    const total = state.modifiers.reduce((a, m) => a + (m.on ? m.value : 0), 0);
    refs.modTotal.textContent = fmt(total);
  }

  function renderObrContext() {
    const o = state.obr;
    const rows = [
      ["room_id", o.roomId],
      ["scene_id", o.sceneId],
      ["campaign_id", o.campaignId],
      ["actor_token_id", o.actorTokenId],
      ["target_token_id", o.targetTokenId],
    ].filter(([, v]) => v);
    refs.obrContext.innerHTML = rows.length
      ? rows.map(([k, v]) => `<span class="ra-chip"><span class="ra-muted">${k}</span> <span class="ra-mono">${esc(String(v).slice(0, 12))}...</span></span>`).join("")
      : `<span class="ra-muted">No Owlbear context captured (manual/dev mode).</span>`;
  }

  /* ---- inventory & ammo (magazines / ammo stock) ---- */
  function storeInventory(inventory, armory) {
    const inv = inventory && inventory.ok !== false ? inventory : null;
    state.attacker.inventory.magazines = arr(inv?.magazines?.length ? inv.magazines : armory?.magazines);
    state.attacker.inventory.ammoStock = arr(inv?.ammo_stock);
    state.attacker.inventory.items = arr(inv?.items);
    state.attacker.inventory.fallback = Boolean(inv?._fallback);
  }
  const characterMagazines = () => state.attacker.inventory.magazines;
  const ammoStockList = () => state.attacker.inventory.ammoStock;
  const magById = (id) => characterMagazines().find((m) => m.id === id) || null;
  const magCaliberCode = (mag) => mag?.magazine_def?.caliber || mag?.caliber || null;
  function magLoadedInWeaponName(magId) {
    const w = arr(state.attacker.armory?.weapons).find(
      (wp) => (wp.loaded_magazine?.id || wp.active_profile?.loaded_magazine?.id) === magId,
    );
    return w ? w.name : null;
  }
  function compatibleMagazinesForWeapon(w) {
    const cal = w?.model?.caliber;
    const mags = characterMagazines();
    if (!cal) return mags;
    const filtered = mags.filter((m) => magCaliberCode(m) === cal);
    return filtered.length ? filtered : mags;
  }
  function compatibleAmmoForMagazine(mag) {
    const cal = magCaliberCode(mag);
    const list = ammoStockList();
    if (!cal) return list;
    const filtered = list.filter((a) => (a.caliber_code || a.caliber) === cal);
    return filtered.length ? filtered : list;
  }
  function syncAmmoSelectionForMagazine() {
    const compat = compatibleAmmoForMagazine(magById(state.inv.opsMagId));
    if (!compat.some((a) => a.id === state.inv.ammoStockId)) {
      state.inv.ammoStockId = compat[0]?.id || "";
    }
  }
  function resetInventorySelections() {
    const mags = characterMagazines();
    const w = currentWeapon();
    const compatMags = w ? compatibleMagazinesForWeapon(w) : mags;
    state.inv.reloadMagId = (compatMags[0] || mags[0])?.id || "";
    state.inv.opsMagId = mags[0]?.id || "";
    syncAmmoSelectionForMagazine();
  }

  function magOption(m, selId) {
    const cap = m.magazine_def?.capacity ?? m.capacity;
    const ammoName = m.ammo_type?.name || m.ammo_type_name || "-";
    const loaded = magLoadedInWeaponName(m.id);
    return `<option value="${esc(m.id)}" ${m.id === selId ? "selected" : ""}>${esc(m.name)} - ${dash(m.current_rounds)}/${dash(cap)} - ${esc(ammoName)}${loaded ? " - in " + esc(loaded) : ""}</option>`;
  }
  function ammoOption(a, selId) {
    return `<option value="${esc(a.id)}" ${a.id === selId ? "selected" : ""}>${esc(a.display_name)} - ${esc(a.ammo_type_name || a.ammo_type_code || "")} - x${dash(a.quantity)}</option>`;
  }
  function magRow(m) {
    const inW = magLoadedInWeaponName(m.id);
    return `<div class="ra-feature"><span>${esc(m.name)}</span><span class="ra-mono">${dash(m.current_rounds)}/${dash(m.magazine_def?.capacity ?? m.capacity)} - ${esc(m.ammo_type?.name || m.ammo_type_name || "empty")} - ${esc(m.magazine_def?.caliber_name || m.magazine_def?.caliber || "")}${inW ? " - in " + esc(inW) : ""}</span></div>`;
  }
  function ammoRow(a) {
    return `<div class="ra-feature"><span>${esc(a.display_name)}</span><span class="ra-mono">${esc(a.ammo_type_name || a.ammo_type_code || "")} - ${esc(a.caliber_name || a.caliber_code || "")} - x${dash(a.quantity)}</span></div>`;
  }

  function renderInventory() {
    const w = currentWeapon();
    const mags = characterMagazines();
    const ammo = ammoStockList();
    const profileName = w?.active_profile?.name || w?.active_profile?.code || "-";
    const loadedMag = w ? w.loaded_magazine || w.active_profile?.loaded_magazine : null;
    const compatMags = w ? compatibleMagazinesForWeapon(w) : mags;
    const reloadOpts = compatMags.length ? compatMags.map((m) => magOption(m, state.inv.reloadMagId)).join("") : `<option value="">- no compatible magazines -</option>`;
    const opsOpts = mags.length ? mags.map((m) => magOption(m, state.inv.opsMagId)).join("") : `<option value="">- no magazines -</option>`;
    const compatAmmo = compatibleAmmoForMagazine(magById(state.inv.opsMagId));
    const ammoOpts = compatAmmo.length ? compatAmmo.map((a) => ammoOption(a, state.inv.ammoStockId)).join("") : `<option value="">- no compatible ammo -</option>`;

    refs.inventoryBody.innerHTML = `
      ${state.attacker.inventory.fallback ? `<div class="ra-banner warn">Ammo stock read via fallback (backend get_character_inventory error 25006). Magazines/ammo shown are still server truth.</div>` : ""}
      <div class="ra-section-title" style="margin-top:0">Reload weapon - insert / replace magazine</div>
      <div class="ra-block" style="flex-direction:column;align-items:stretch;gap:8px">
        <div class="ra-muted">${w ? esc(w.name) : "-"} - profile ${esc(profileName)} - loaded ${loadedMag ? `<span class="ra-mono">${dash(loadedMag.current_rounds)}/${dash(loadedMag.capacity || loadedMag.magazine_def?.capacity)}</span> ${esc(loadedMag.ammo_type_name || loadedMag.ammo_type?.name || "")}` : "-"}</div>
        <div class="ra-row">
          <label class="ra-field"><span>Magazine to insert</span><select data-inv="reloadMag">${reloadOpts}</select></label>
          <button data-inv-action="reload" type="button" style="align-self:flex-end">Reload weapon</button>
        </div>
      </div>

      <div class="ra-section-title">Magazine rounds - load / unload</div>
      <div class="ra-block" style="flex-direction:column;align-items:stretch;gap:8px">
        <label class="ra-field"><span>Magazine</span><select data-inv="opsMag">${opsOpts}</select></label>
        <div class="ra-row">
          <label class="ra-field"><span>Ammo stock to load</span><select data-inv="ammoStock">${ammoOpts}</select></label>
          <button data-inv-action="load" type="button" class="secondary" style="align-self:flex-end">Load / Top up</button>
          <button data-inv-action="unload" type="button" class="secondary" style="align-self:flex-end">Unload all</button>
        </div>
      </div>

      <div class="ra-section-title">Magazines (${mags.length})</div>
      <div class="ra-list">${mags.length ? mags.map(magRow).join("") : `<div class="ra-muted">No magazines.</div>`}</div>
      <div class="ra-section-title">Ammo stock (${ammo.length})</div>
      <div class="ra-list">${ammo.length ? ammo.map(ammoRow).join("") : `<div class="ra-muted">No ammo in stock.</div>`}</div>

      <div class="ra-section-title">Items (${allItems().length})</div>
      <div class="ra-list">${allItems().length ? allItems().map(itemRow).join("") : `<div class="ra-muted">No items.</div>`}</div>

      <div class="ra-section-title">Use medkit — heal a body part</div>
      <div class="ra-block" style="flex-direction:column;align-items:stretch;gap:8px">
        ${healItems().length ? `
        <div class="ra-row">
          <label class="ra-field"><span>Medkit</span><select data-heal="item">${healItems().map(healItemOption).join("")}</select></label>
          <label class="ra-field"><span>Apply to</span><select data-heal="applyTo">
            <option value="attacker" ${state.heal.applyTo === "attacker" ? "selected" : ""}>Attacker (self)</option>
            <option value="target" ${state.heal.applyTo === "target" ? "selected" : ""}>Target</option>
          </select></label>
        </div>
        <label class="ra-field"><span>Body part to heal</span><select data-heal="part">${healPartOptions()}</select></label>
        <div class="ra-row">
          <button data-heal-action="use" type="button">Use medkit</button>
          <span class="ra-muted">heals 1 serious, or crit→serious, or clears minor; removes unconscious; not consumed if nothing to heal</span>
        </div>` : `<div class="ra-muted">No medkit / healing item in inventory.</div>`}
      </div>

      <div class="ra-section-title">GM tools</div>
      <div class="ra-block" style="flex-direction:column;align-items:stretch;gap:8px">
        <label class="ra-field"><span>Character</span><select data-gm="target">
          <option value="attacker" ${state.gmTarget === "attacker" ? "selected" : ""}>Attacker</option>
          <option value="target" ${state.gmTarget === "target" ? "selected" : ""}>Target</option>
        </select></label>
        <div class="ra-row">
          <button data-gm-action="heal" type="button">Heal (full)</button>
          <button data-gm-action="repair" type="button" class="secondary">Repair armor</button>
          <span class="ra-muted">heals all body parts / repairs all armor sections (Shield &amp; Special excluded)</span>
        </div>
      </div>
    `;
  }

  // Run an inventory RPC; handles both { ok:false, error } results and raised
  // SupabaseError exceptions (load_weapon_profile_magazine raises on invalid input).
  async function runInventoryAction(actionFn) {
    if (state.busy) return null;
    state.busy = true;
    banner(refs.invStatus, "info", "Working…");
    try {
      let result;
      try {
        result = await actionFn();
      } catch (e) {
        state.debug.inventory = { thrown: e.message, code: e.code ?? null, details: e.details ?? null };
        renderDebug();
        banner(refs.invStatus, "err", esc(describeError(e.code, e.message)));
        return null;
      }
      state.debug.inventory = result;
      renderDebug();
      if (result && result.ok === false) {
        banner(refs.invStatus, "err", `${esc(describeError(result.error, result.message))}${result.error ? ` <span class="ra-mono">[${esc(result.error)}]</span>` : ""}`);
        return null;
      }
      return result;
    } finally {
      state.busy = false;
    }
  }

  async function refreshAttackerArmoryInventory(prefetchedArmory) {
    try {
      const [armory, inventory] = await Promise.all([
        prefetchedArmory && prefetchedArmory.ok !== false ? Promise.resolve(prefetchedArmory) : loadArmory(state.attacker.id),
        loadInventory(state.attacker.id).catch(() => null),
      ]);
      if (armory && armory.ok !== false) state.attacker.armory = armory;
      storeInventory(inventory, state.attacker.armory);
      if (!magById(state.inv.opsMagId)) state.inv.opsMagId = characterMagazines()[0]?.id || "";
      if (!magById(state.inv.reloadMagId)) state.inv.reloadMagId = characterMagazines()[0]?.id || "";
      syncAmmoSelectionForMagazine();
      renderProfileAndFireMode();
      renderAttackBlock();
      renderFeatures();
      renderInventory();
      renderPayloadPreview();
    } catch (e) {
      banner(refs.invStatus, "warn", `Action applied, but refresh failed: ${esc(e.message)}`);
    }
  }

  async function onReloadWeapon() {
    const w = currentWeapon();
    if (!w) return;
    const profileId = w.active_profile?.id || w.active_profile_id || "";
    if (!profileId) { banner(refs.invStatus, "err", "Weapon has no active profile."); return; }
    if (!state.inv.reloadMagId) { banner(refs.invStatus, "err", "Select a magazine to insert."); return; }
    const result = await runInventoryAction(() =>
      rpcInsertMagazine({ character_weapon_id: w.id, profile_id: profileId, character_magazine_id: state.inv.reloadMagId }),
    );
    if (!result) return;
    await refreshAttackerArmoryInventory(result.armory);
    banner(refs.invStatus, "ok", "Magazine inserted into weapon.");
  }

  async function onLoadRounds() {
    if (!state.inv.opsMagId) { banner(refs.invStatus, "err", "Select a magazine."); return; }
    if (!state.inv.ammoStockId) { banner(refs.invStatus, "err", "Select ammo stock to load."); return; }
    const result = await runInventoryAction(() =>
      rpcLoadRounds({ character_magazine_id: state.inv.opsMagId, ammo_stock_id: state.inv.ammoStockId, quantity: 0, allow_partial: true }),
    );
    if (!result) return;
    await refreshAttackerArmoryInventory();
    banner(refs.invStatus, "ok", `Loaded ${dash(result.loaded_quantity)} round(s).`);
  }

  async function onUnloadRounds() {
    if (!state.inv.opsMagId) { banner(refs.invStatus, "err", "Select a magazine."); return; }
    const result = await runInventoryAction(() => rpcUnloadRounds({ character_magazine_id: state.inv.opsMagId }));
    if (!result) return;
    await refreshAttackerArmoryInventory();
    banner(refs.invStatus, "ok", `Unloaded ${dash(result.unloaded_quantity)} round(s).`);
  }

  /* ---- items & heal (use_character_item: medkit on a body part) ---- */
  const allItems = () => state.attacker.inventory.items;
  const healItems = () => allItems().filter((i) => i.use_action_type === "heal" || i.item_code === "basic_medkit");
  const healBodyParts = () => (state.heal.applyTo === "attacker" ? state.attacker.bodyParts : state.target.bodyParts);
  function syncHealPartSelection() {
    const parts = healBodyParts();
    if (!parts.some((p) => p.id === state.heal.partId)) {
      state.heal.partId = (parts.filter((p) => !p.destroyed)[0] || parts[0])?.id || "";
    }
  }
  function resetHealSelections() {
    state.heal.itemId = healItems()[0]?.id || "";
    if (state.heal.applyTo !== "attacker" && state.heal.applyTo !== "target") state.heal.applyTo = "target";
    syncHealPartSelection();
  }
  function healPartLabel(p) {
    const dmg = [];
    if (p.critical) dmg.push(`crit ${p.critical}`);
    if (p.serious) dmg.push(`serious ${p.serious}`);
    if (p.minor) dmg.push(`minor ${p.minor}`);
    return `${p.name || p.part_key} · ${dmg.length ? dmg.join(", ") : "intact"}`;
  }
  function itemRow(i) {
    const act = i.use_action_type && i.use_action_type !== "none" ? " · " + esc(i.use_action_type) : "";
    return `<div class="ra-feature"><span>${esc(i.name)}</span><span class="ra-mono">${esc(i.item_type || "")}${act} · x${dash(i.quantity)}</span></div>`;
  }
  function healItemOption(i) {
    return `<option value="${esc(i.id)}" ${i.id === state.heal.itemId ? "selected" : ""}>${esc(i.name)} · x${dash(i.quantity)}</option>`;
  }
  function healPartOptions() {
    const parts = healBodyParts();
    if (!parts.length) return `<option value="">— no body parts —</option>`;
    return parts
      .map((p) => `<option value="${esc(p.id)}" ${p.id === state.heal.partId ? "selected" : ""} ${p.destroyed ? "disabled" : ""}>${esc(healPartLabel(p))}${p.destroyed ? " (destroyed)" : ""}</option>`)
      .join("");
  }

  async function refreshAfterHeal() {
    try {
      const who = state.heal.applyTo;
      const [inventory, healedSheet] = await Promise.all([
        loadInventory(state.attacker.id).catch(() => null),
        loadRuleSheet(who === "attacker" ? state.attacker.id : state.target.id).catch(() => null),
      ]);
      storeInventory(inventory, state.attacker.armory);
      if (healedSheet && healedSheet.ok !== false && healedSheet.character) {
        if (who === "attacker") {
          state.attacker.sheet = healedSheet;
          state.attacker.bodyParts = dedupeBodyParts(healedSheet.body_parts);
        } else {
          state.target.sheet = healedSheet;
          state.target.bodyParts = dedupeBodyParts(healedSheet.body_parts);
          if (!state.target.bodyParts.some((p) => p.id === state.target.partId && isTargetable(p))) selectFirstTargetablePart();
        }
      }
      syncHealPartSelection();
      if (!healItems().some((i) => i.id === state.heal.itemId)) state.heal.itemId = healItems()[0]?.id || "";
      renderDoll();
      renderParts();
      renderInventory();
      renderPayloadPreview();
    } catch (e) {
      banner(refs.invStatus, "warn", `Heal applied, but refresh failed: ${esc(e.message)}`);
    }
  }

  async function onUseMedkit() {
    if (!state.heal.itemId) { banner(refs.invStatus, "err", "Select a medkit."); return; }
    if (!state.heal.partId) { banner(refs.invStatus, "err", "Select a body part to heal."); return; }
    const result = await runInventoryAction(() =>
      rpcUseItem({ character_item_id: state.heal.itemId, target_body_part_id: state.heal.partId, used_by_character_id: state.attacker.id }),
    );
    if (!result) return;
    await refreshAfterHeal();
    const HEAL_TXT = { serious_reduced: "serious −1", critical_to_serious: "crit → serious", minor_cleared: "minor cleared", none: "no change" };
    const healed = HEAL_TXT[result.healing_action] || result.healing_action || "applied";
    const eff = arr(result.removed_effect_ids).length ? " · unconscious removed" : "";
    banner(refs.invStatus, "ok", `Medkit used: ${esc(healed)}${eff}. Remaining: ${dash(result.remaining_quantity)}.`);
  }

  // Re-pull a character's rule sheet (body parts / armor) and re-render.
  async function refreshSheetFor(which) {
    const id = which === "attacker" ? state.attacker.id : state.target.id;
    const sheet = await loadRuleSheet(id).catch(() => null);
    if (sheet && sheet.ok !== false && sheet.character) {
      if (which === "attacker") {
        state.attacker.sheet = sheet;
        state.attacker.bodyParts = dedupeBodyParts(sheet.body_parts);
      } else {
        state.target.sheet = sheet;
        state.target.bodyParts = dedupeBodyParts(sheet.body_parts);
        if (!state.target.bodyParts.some((p) => p.id === state.target.partId && isTargetable(p))) selectFirstTargetablePart();
      }
    }
    syncHealPartSelection();
    renderDoll();
    renderParts();
    renderInventory();
    renderPayloadPreview();
  }

  async function onGmHeal() {
    const which = state.gmTarget;
    const id = which === "attacker" ? state.attacker.id : state.target.id;
    if (!id) { banner(refs.invStatus, "err", "Load combatants first."); return; }
    const result = await runInventoryAction(() => rpcGmHeal(id));
    if (!result) return;
    await refreshSheetFor(which);
    const excl = arr(result.excluded_parts).length ? ` (excluded: ${esc(arr(result.excluded_parts).join(", "))})` : "";
    banner(refs.invStatus, "ok", `GM heal (${which}): ${dash(result.healed_parts)} part(s) healed${excl}.`);
  }

  async function onGmRepair() {
    const which = state.gmTarget;
    const id = which === "attacker" ? state.attacker.id : state.target.id;
    if (!id) { banner(refs.invStatus, "err", "Load combatants first."); return; }
    const result = await runInventoryAction(() => rpcGmRepair(id));
    if (!result) return;
    await refreshSheetFor(which);
    const excl = arr(result.excluded_parts).length ? ` (excluded: ${esc(arr(result.excluded_parts).join(", "))})` : "";
    banner(refs.invStatus, "ok", `GM repair (${which}): ${dash(result.repaired_parts)} armor section(s) repaired${excl}.`);
  }

  /* ---- payload preview (task #5) ---- */
  function buildCtx() {
    return {
      mode: state.mode,
      attackerCharacterId: state.attacker.id || refs.attackerId.value.trim(),
      targetCharacterId: state.target.id || refs.targetId.value.trim(),
      targetBodyPartId: state.target.partId,
      weaponId: state.attacker.weaponId,
      abilityId: state.attacker.abilityId,
      distanceM: state.distance,
      modifiers: state.modifiers,
      roomId: state.obr.roomId,
      campaignId: state.obr.campaignId,
      sceneId: state.obr.sceneId,
      actorTokenId: state.obr.actorTokenId,
      targetTokenId: state.obr.targetTokenId,
    };
  }
  function renderPayloadPreview() {
    let text;
    try {
      text = prettyJson(buildAttackPayload(buildCtx()));
    } catch (e) {
      text = e instanceof ValidationError ? `// cannot build payload yet: ${e.message}` : `// error: ${e.message}`;
    }
    refs.payloadPreview.textContent = text;
  }

  /* ---- resolve (task: the button) ---- */
  refs.resolveBtn.addEventListener("click", onResolve);

  async function onResolve() {
    if (state.busy) return;
    banner(refs.resolveStatus, "", "");
    state.busy = true;
    refs.resolveBtn.disabled = true;
    refs.resolveBtn.classList.add("ra-flash");
    try {
      const outcome = await resolveAttack(buildCtx(), { performAttack: callPerformAttack });
      state.debug.payload = outcome.payload;
      state.debug.raw = outcome.raw;
      state.debug.normalized = outcome.normalized;
      state.debug.error = outcome.ok ? null : { code: outcome.code, message: outcome.error, raw: outcome.raw };
      renderDebug();

      if (!outcome.ok) {
        const human = describeError(outcome.code, outcome.error);
        banner(refs.resolveStatus, "err", `${esc(human)}${outcome.code ? ` <span class="ra-mono">[${esc(outcome.code)}]</span>` : ""}`);
        pushLog(`<span class="ra-muted">attack failed: ${esc(human)}${outcome.code ? ` [${esc(outcome.code)}]` : ""}</span>`);
        renderSummary(outcome.normalized); // may be null -> shows dashes
        return;
      }
      renderSummary(outcome.normalized);
      logResult(outcome.normalized);
      await refreshAfterAttack();
    } catch (e) {
      if (e instanceof ValidationError) {
        banner(refs.resolveStatus, "err", esc(e.message));
      } else {
        banner(refs.resolveStatus, "err", `Unexpected error: ${esc(e.message)}`);
        state.debug.error = { message: e.message };
        renderDebug();
      }
    } finally {
      state.busy = false;
      refs.resolveBtn.disabled = false;
      setTimeout(() => refs.resolveBtn.classList.remove("ra-flash"), 500);
    }
  }

  /* ---- result summary (task #4) ---- */
  function renderSummary(n) {
    const data = n || {};
    const hitTxt = data.hit === true ? "HIT" : data.hit === false ? "MISS" : "-";
    const hitCls = data.hit === true ? "hit" : data.hit === false ? "miss" : "";
    const autoTxt = data.auto === "crit" ? "auto-crit" : data.auto === "fail" ? "auto-fail" : "-";
    const stat = (k, v, cls = "") => `<div class="ra-stat"><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`;
    const pending = arr(data.pendingChecks).map((c) => c.skill_code || c.type || "check").join(", ");
    refs.summary.innerHTML = [
      stat("Result", esc(hitTxt), hitCls),
      stat("Auto", esc(autoTxt), data.auto === "crit" ? "crit" : ""),
      stat("Attack total", esc(dash(data.attackTotal))),
      stat("Defense total", esc(dash(data.defenseTotal))),
      stat("Damage", `${esc(dash(data.damageLevel))}${data.damageDiff != null ? ` <span class="ra-mono">D${esc(data.damageDiff)}</span>` : ""}`, data.damageLevel === "critical" ? "crit" : ""),
      stat("Body part", esc(dash(data.targetBodyPartName))),
      stat("Ammo spent", esc(dash(data.ammoSpent))),
      stat("Energy spent", esc(dash(data.energySpent))),
      stat("Pending", esc(pending || "-")),
      stat("Combat log id", `<span class="ra-mono">${esc(data.combatLogId ? String(data.combatLogId).slice(0, 8) + "..." : "-")}</span>`),
      stat("Target", data.targetAlive === false ? "dead" : data.targetConscious === false ? "unconscious" : "-", data.targetAlive === false ? "danger" : ""),
    ].join("");
    refs.summaryCard.classList.remove("ra-hidden");
  }

  /* ---- debug panel (task #3) ---- */
  function renderDebug() {
    refs.dbgPayload.textContent = state.debug.payload ? prettyJson(state.debug.payload) : "-";
    refs.dbgRaw.textContent = state.debug.raw ? prettyJson(state.debug.raw) : "-";
    refs.dbgNormalized.textContent = state.debug.normalized ? prettyJson(state.debug.normalized) : "-";
    refs.dbgError.textContent = state.debug.error ? prettyJson(state.debug.error) : "-";
    refs.dbgRefresh.textContent = state.debug.refresh ? prettyJson(state.debug.refresh) : "-";
    refs.dbgInventory.textContent = state.debug.inventory ? prettyJson(state.debug.inventory) : "-";
  }
  refs.dbgCopyPayload.addEventListener("click", () => copyJson(state.debug.payload));
  refs.dbgCopyResult.addEventListener("click", () => copyJson(state.debug.raw));
  refs.dbgClear.addEventListener("click", () => {
    state.debug = { payload: null, raw: null, normalized: null, error: null, refresh: null };
    renderDebug();
  });
  function copyJson(obj) {
    try { navigator.clipboard?.writeText(prettyJson(obj ?? null)); } catch { /* ignore */ }
  }

  /* ---- log ---- */
  function pushLog(html) {
    const time = new Date().toLocaleTimeString();
    state.log.unshift(`<span class="ra-mono ra-muted">${time}</span> ${html}`);
    refs.log.innerHTML = state.log.map((e) => `<div class="ra-logline">${e}</div>`).join("");
  }
  function logResult(n) {
    if (!n) { pushLog(`<span class="ra-muted">result received (no detail)</span>`); return; }
    const autoTxt = n.auto === "crit" ? " · auto-crit" : n.auto === "fail" ? " · auto-fail" : "";
    pushLog(`<span class="who">accuracy</span> · <span class="ra-mono">${dash(n.attackRoll)} → ${dash(n.attackTotal)}</span> vs <span class="ra-mono">${dash(n.defenseTotal)}</span> · ${n.hit ? "hit" : "miss"}${autoTxt}`);
    if (n.hit) pushLog(`<span class="who">damage</span> · ${esc(dash(n.targetBodyPartName))} · <span class="ra-mono">Δ ${dash(n.damageDiff)}</span> · ${esc(dash(n.damageLevel))}`);
    if (n.targetAlive === false) pushLog(`<span class="ra-neg">target is dead</span>`);
    else if (n.targetConscious === false) pushLog(`<span class="ra-neg">target is unconscious</span>`);
  }

  /* ---- staged refresh after attack (task #15) ---- */
  async function refreshAfterAttack() {
    const summary = { armory: false, abilities: false, target: false, effects: false };
    try {
      const [armory, abilitiesRes, sheet, effects] = await Promise.all([
        loadArmory(state.attacker.id).catch(() => null),
        loadAbilities(state.attacker.id).catch(() => null),
        loadRuleSheet(state.target.id).catch(() => null),
        loadEffectSummary(state.target.id),
      ]);
      if (armory && armory.ok !== false) { state.attacker.armory = armory; summary.armory = true; }
      if (abilitiesRes) {
        state.attacker.abilities = arr(abilitiesRes.abilities).filter((a) => a.is_enabled !== false);
        state.attacker.pools = arr(abilitiesRes.resource_pools);
        summary.abilities = true;
      }
      if (sheet && sheet.ok !== false && sheet.character) {
        state.target.sheet = sheet;
        state.target.bodyParts = dedupeBodyParts(sheet.body_parts);
        if (!state.target.bodyParts.some((p) => p.id === state.target.partId && isTargetable(p))) {
          selectFirstTargetablePart();
        }
        summary.target = true;
      }
      if (effects) { state.target.effectSummary = effects; summary.effects = true; }

      renderProfileAndFireMode();
      renderAttackBlock();
      renderFeatures();
      renderDoll();
      renderParts();
      renderPayloadPreview();
      state.debug.refresh = summary;
      renderDebug();
    } catch (e) {
      state.debug.refresh = { error: e.message, ...summary };
      renderDebug();
      banner(refs.resolveStatus, "warn", "Attack applied, but refresh failed (server result above is still valid).");
    }
  }

  // Clean UI string rendering and body-part presentation without touching backend data.
  function uiDash(v) {
    return v === null || v === undefined || v === "" ? "-" : v;
  }
  function renderWeaponSelect() {
    const weapons = arr(state.attacker.armory?.weapons);
    refs.weaponSelect.innerHTML = weapons.length
      ? weapons.map((w) => `<option value="${esc(w.id)}" ${w.id === state.attacker.weaponId ? "selected" : ""}>${esc(w.name)} - ${esc(w.model?.weapon_class_name || w.model?.weapon_class || "")}</option>`).join("")
      : `<option value="">- no weapons -</option>`;
  }
  function renderAbilitySelect() {
    const abilities = attackAbilities();
    refs.abilitySelect.innerHTML = abilities.length
      ? abilities.map((a) => `<option value="${esc(a.id)}" ${a.id === state.attacker.abilityId ? "selected" : ""}>${esc(a.name)} - lvl ${uiDash(a.effective_level)}</option>`).join("")
      : `<option value="">- no attack abilities -</option>`;
  }
  function renderProfileAndFireMode() {
    const w = currentWeapon();
    if (!w) { refs.profileRow.innerHTML = ""; return; }
    const profiles = arr(w.profiles);
    const fireModes = arr(w.available_fire_modes.length ? w.available_fire_modes : w.active_profile?.available_fire_modes);
    const selFmId = (w.selected_fire_mode || w.active_profile?.selected_fire_mode)?.id || "";
    let html = "";
    if (profiles.length > 1) {
      html += `<label class="ra-field"><span>Weapon profile</span><select data-sel="profile">${profiles
        .map((p) => `<option value="${esc(p.id)}" ${p.id === w.active_profile_id ? "selected" : ""}>${esc(p.name || p.code || "profile")}${p.attack_type ? " - " + esc(p.attack_type) : ""}</option>`)
        .join("")}</select></label>`;
    } else if (profiles.length === 1) {
      const p = profiles[0];
      html += `<label class="ra-field"><span>Weapon profile</span><div class="ra-chip">${esc(p.name || p.code || "default")}${p.attack_type ? " - " + esc(p.attack_type) : ""}</div></label>`;
    }
    if (fireModes.length) {
      html += `<label class="ra-field"><span>Fire mode</span><select data-sel="fireMode">${fireModes
        .map((f) => `<option value="${esc(f.id)}" ${f.id === selFmId ? "selected" : ""}>${esc(f.name || f.code || "fire mode")}</option>`)
        .join("")}</select></label>`;
    }
    refs.profileRow.innerHTML = html;
  }
  function renderAttackBlock() {
    if (state.mode === "weapon") {
      const w = currentWeapon();
      if (!w) { refs.attackBlock.innerHTML = ""; return; }
      const isMelee = !w.model?.caliber;
      const mag = w.loaded_magazine || w.active_profile?.loaded_magazine || null;
      const fm = w.selected_fire_mode || w.active_profile?.selected_fire_mode || null;
      let chips = "";
      if (isMelee) {
        chips += `<span class="ra-chip">melee - str-based</span>`;
      } else {
        chips += fm ? `<span class="ra-chip">mode: ${esc(fm.name || fm.code)}</span>` : `<span class="ra-chip neg">no fire mode</span>`;
        if (mag) {
          const ammo = mag.ammo_type_name || mag.ammo_type?.name || mag.ammo_type || "-";
          const cal = mag.magazine_def?.caliber_name || mag.caliber_name || mag.caliber || "";
          chips += `<span class="ra-chip">mag ${uiDash(mag.current_rounds)} / ${uiDash(mag.capacity || mag.magazine_def?.capacity)} - ${esc(ammo)}${cal ? " - " + esc(cal) : ""}</span>`;
          if ((mag.current_rounds ?? 0) <= 0) chips += `<span class="ra-chip neg">magazine empty</span>`;
        } else {
          chips += `<span class="ra-chip neg">no magazine loaded</span>`;
        }
      }
      refs.attackBlock.innerHTML = `<div class="ra-block">${chips}</div>`;
      return;
    }
    const a = currentAbility();
    if (!a) { refs.attackBlock.innerHTML = ""; return; }
    const cost = a.resource?.cost ?? 0;
    const pool = state.attacker.pools.find((p) => p.code === a.resource?.pool_code);
    const cur = pool?.current_value ?? 0;
    const max = pool?.max_value ?? 0;
    const pct = max > 0 ? Math.round((cur / max) * 100) : 0;
    const ignore = a.level_data?.ignore_armor;
    const cd = a.current_cooldown_rounds;
    refs.attackBlock.innerHTML = `<div class="ra-block">
      <span class="ra-chip">cost k:${esc(cost)}</span>
      ${pool ? `<span class="ra-row" style="gap:6px"><span class="ra-muted">${esc(pool.name || "Energy")}</span><span class="ra-ebar"><span style="width:${pct}%"></span></span><span class="ra-mono">${cur} / ${max}</span></span>` : `<span class="ra-chip neg">resource pool not found</span>`}
      ${cd ? `<span class="ra-chip neg">cooldown ${esc(cd)}</span>` : ""}
      ${ignore ? `<span class="ra-chip">ignores armor</span>` : ""}
    </div>`;
  }
  function renderFeatures() {
    const w = currentWeapon();
    const features = arr(w?.features);
    if (state.mode !== "weapon" || !features.length) { refs.features.innerHTML = ""; return; }
    refs.features.innerHTML =
      `<div class="ra-section-title">Weapon features (read-only)</div>` +
      features.map((f) => {
        const active = f.is_active ?? f.active;
        const charges = f.current_charges ?? f.charges;
        const bits = [];
        if (charges !== undefined && charges !== null) bits.push(`charges ${charges}${f.max_charges ? `/${f.max_charges}` : ""}`);
        if (f.requires_reload) bits.push("needs reload");
        if (f.current_cooldown_rounds) bits.push(`cd ${f.current_cooldown_rounds}`);
        if (f.uses_left !== undefined && f.uses_left !== null) bits.push(`uses ${f.uses_left}`);
        return `<div class="ra-feature"><span>${esc(f.name || f.code || "feature")}</span><span class="${active ? "on" : "off"}">${active ? "active" : "inactive"}${bits.length ? " - " + esc(bits.join(" - ")) : ""}</span></div>`;
      }).join("");
  }
  function renderDoll() {
    refs.targetName.textContent = state.target.sheet?.character?.name || (state.target.id ? `${state.target.id.slice(0, 8)}...` : "Target");
    refs.doll.innerHTML = makeDoll();
  }
  function renderParts() {
    refs.parts.innerHTML = dedupeBodyParts(state.target.bodyParts)
      .map((p) => {
        const cls = ["ra-partchip"];
        const targetable = isTargetable(p);
        const drawable = Boolean(PART_GEOMETRY[normPartCode(p)]);
        if (p.id === state.target.partId) cls.push("active");
        if (!drawable) cls.push("custom");
        if (!targetable) cls.push("disabled");
        const aim = p.aim_difficulty ? ` <span class="ra-mono ra-muted">-${esc(p.aim_difficulty)}</span>` : "";
        const reason = p.destroyed ? " (destroyed)" : p.can_be_targeted === false ? " (untargetable)" : "";
        return `<span class="${cls.join(" ")}" data-part="${esc(p.id)}" data-targetable="${targetable}">${esc(p.name)}${aim}${reason}</span>`;
      })
      .join("");
  }
  function magOption(m, selId) {
    const cap = m.magazine_def?.capacity ?? m.capacity;
    const ammoName = m.ammo_type?.name || m.ammo_type_name || "-";
    const loaded = magLoadedInWeaponName(m.id);
    return `<option value="${esc(m.id)}" ${m.id === selId ? "selected" : ""}>${esc(m.name)} - ${uiDash(m.current_rounds)}/${uiDash(cap)} - ${esc(ammoName)}${loaded ? " - in " + esc(loaded) : ""}</option>`;
  }
  function ammoOption(a, selId) {
    return `<option value="${esc(a.id)}" ${a.id === selId ? "selected" : ""}>${esc(a.display_name)} - ${esc(a.ammo_type_name || a.ammo_type_code || "")} - x${uiDash(a.quantity)}</option>`;
  }
  function magRow(m) {
    const inW = magLoadedInWeaponName(m.id);
    return `<div class="ra-feature"><span>${esc(m.name)}</span><span class="ra-mono">${uiDash(m.current_rounds)}/${uiDash(m.magazine_def?.capacity ?? m.capacity)} - ${esc(m.ammo_type?.name || m.ammo_type_name || "empty")} - ${esc(m.magazine_def?.caliber_name || m.magazine_def?.caliber || "")}${inW ? " - in " + esc(inW) : ""}</span></div>`;
  }
  function ammoRow(a) {
    return `<div class="ra-feature"><span>${esc(a.display_name)}</span><span class="ra-mono">${esc(a.ammo_type_name || a.ammo_type_code || "")} - ${esc(a.caliber_name || a.caliber_code || "")} - x${uiDash(a.quantity)}</span></div>`;
  }
  function renderInventory() {
    const w = currentWeapon();
    const mags = characterMagazines();
    const ammo = ammoStockList();
    const profileName = w?.active_profile?.name || w?.active_profile?.code || "-";
    const loadedMag = w ? w.loaded_magazine || w.active_profile?.loaded_magazine : null;
    const compatMags = w ? compatibleMagazinesForWeapon(w) : mags;
    const reloadOpts = compatMags.length ? compatMags.map((m) => magOption(m, state.inv.reloadMagId)).join("") : `<option value="">- no compatible magazines -</option>`;
    const opsOpts = mags.length ? mags.map((m) => magOption(m, state.inv.opsMagId)).join("") : `<option value="">- no magazines -</option>`;
    const compatAmmo = compatibleAmmoForMagazine(magById(state.inv.opsMagId));
    const ammoOpts = compatAmmo.length ? compatAmmo.map((a) => ammoOption(a, state.inv.ammoStockId)).join("") : `<option value="">- no compatible ammo -</option>`;
    refs.inventoryBody.innerHTML = `
      ${state.attacker.inventory.fallback ? `<div class="ra-banner warn">Ammo stock read via fallback (backend get_character_inventory error 25006). Magazines/ammo shown are still server truth.</div>` : ""}
      <div class="ra-section-title" style="margin-top:0">Reload weapon - insert / replace magazine</div>
      <div class="ra-block" style="flex-direction:column;align-items:stretch;gap:8px">
        <div class="ra-muted">${w ? esc(w.name) : "-"} - profile ${esc(profileName)} - loaded ${loadedMag ? `<span class="ra-mono">${uiDash(loadedMag.current_rounds)}/${uiDash(loadedMag.capacity || loadedMag.magazine_def?.capacity)}</span> ${esc(loadedMag.ammo_type_name || loadedMag.ammo_type?.name || "")}` : "-"}</div>
        <div class="ra-row">
          <label class="ra-field"><span>Magazine to insert</span><select data-inv="reloadMag">${reloadOpts}</select></label>
          <button data-inv-action="reload" type="button" style="align-self:flex-end">Reload weapon</button>
        </div>
      </div>
      <div class="ra-section-title">Magazine rounds - load / unload</div>
      <div class="ra-block" style="flex-direction:column;align-items:stretch;gap:8px">
        <label class="ra-field"><span>Magazine</span><select data-inv="opsMag">${opsOpts}</select></label>
        <div class="ra-row">
          <label class="ra-field"><span>Ammo stock to load</span><select data-inv="ammoStock">${ammoOpts}</select></label>
          <button data-inv-action="load" type="button" class="secondary" style="align-self:flex-end">Load / Top up</button>
          <button data-inv-action="unload" type="button" class="secondary" style="align-self:flex-end">Unload all</button>
        </div>
      </div>
      <div class="ra-section-title">Magazines (${mags.length})</div>
      <div class="ra-list">${mags.length ? mags.map(magRow).join("") : `<div class="ra-muted">No magazines.</div>`}</div>
      <div class="ra-section-title">Ammo stock (${ammo.length})</div>
      <div class="ra-list">${ammo.length ? ammo.map(ammoRow).join("") : `<div class="ra-muted">No ammo in stock.</div>`}</div>
      <div class="ra-section-title">Items (${allItems().length})</div>
      <div class="ra-list">${allItems().length ? allItems().map(itemRow).join("") : `<div class="ra-muted">No items.</div>`}</div>
      <div class="ra-section-title">Use medkit - heal a body part</div>
      <div class="ra-block" style="flex-direction:column;align-items:stretch;gap:8px">
        ${healItems().length ? `
        <div class="ra-row">
          <label class="ra-field"><span>Medkit</span><select data-heal="item">${healItems().map(healItemOption).join("")}</select></label>
          <label class="ra-field"><span>Apply to</span><select data-heal="applyTo">
            <option value="attacker" ${state.heal.applyTo === "attacker" ? "selected" : ""}>Attacker (self)</option>
            <option value="target" ${state.heal.applyTo === "target" ? "selected" : ""}>Target</option>
          </select></label>
        </div>
        <label class="ra-field"><span>Body part to heal</span><select data-heal="part">${healPartOptions()}</select></label>
        <div class="ra-row">
          <button data-heal-action="use" type="button">Use medkit</button>
          <span class="ra-muted">heals 1 serious, or crit->serious, or clears minor; removes unconscious; not consumed if nothing to heal</span>
        </div>` : `<div class="ra-muted">No medkit / healing item in inventory.</div>`}
      </div>
      <div class="ra-section-title">GM tools</div>
      <div class="ra-block" style="flex-direction:column;align-items:stretch;gap:8px">
        <label class="ra-field"><span>Character</span><select data-gm="target">
          <option value="attacker" ${state.gmTarget === "attacker" ? "selected" : ""}>Attacker</option>
          <option value="target" ${state.gmTarget === "target" ? "selected" : ""}>Target</option>
        </select></label>
        <div class="ra-row">
          <button data-gm-action="heal" type="button">Heal (full)</button>
          <button data-gm-action="repair" type="button" class="secondary">Repair armor</button>
          <span class="ra-muted">heals all body parts / repairs all armor sections (Shield &amp; Special excluded)</span>
        </div>
      </div>
    `;
  }
  function renderSummary(n) {
    const data = n || {};
    const hitTxt = data.hit === true ? "HIT" : data.hit === false ? "MISS" : "-";
    const hitCls = data.hit === true ? "hit" : data.hit === false ? "miss" : "";
    const autoTxt = data.auto === "crit" ? "auto-crit" : data.auto === "fail" ? "auto-fail" : "-";
    const stat = (k, v, cls = "") => `<div class="ra-stat"><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`;
    const pending = arr(data.pendingChecks).map((c) => c.skill_code || c.type || "check").join(", ");
    refs.summary.innerHTML = [
      stat("Result", esc(hitTxt), hitCls),
      stat("Auto", esc(autoTxt), data.auto === "crit" ? "crit" : ""),
      stat("Attack total", esc(uiDash(data.attackTotal))),
      stat("Defense total", esc(uiDash(data.defenseTotal))),
      stat("Damage", `${esc(uiDash(data.damageLevel))}${data.damageDiff != null ? ` <span class="ra-mono">D${esc(data.damageDiff)}</span>` : ""}`, data.damageLevel === "critical" ? "crit" : ""),
      stat("Body part", esc(uiDash(data.targetBodyPartName))),
      stat("Ammo spent", esc(uiDash(data.ammoSpent))),
      stat("Energy spent", esc(uiDash(data.energySpent))),
      stat("Pending", esc(pending || "-")),
      stat("Combat log id", `<span class="ra-mono">${esc(data.combatLogId ? `${String(data.combatLogId).slice(0, 8)}...` : "-")}</span>`),
      stat("Target", data.targetAlive === false ? "dead" : data.targetConscious === false ? "unconscious" : "-", data.targetAlive === false ? "danger" : ""),
    ].join("");
    refs.summaryCard.classList.remove("ra-hidden");
  }
  function logResult(n) {
    if (!n) { pushLog(`<span class="ra-muted">result received (no detail)</span>`); return; }
    const autoTxt = n.auto === "crit" ? " - auto-crit" : n.auto === "fail" ? " - auto-fail" : "";
    pushLog(`<span class="who">accuracy</span> - <span class="ra-mono">${uiDash(n.attackRoll)} -> ${uiDash(n.attackTotal)}</span> vs <span class="ra-mono">${uiDash(n.defenseTotal)}</span> - ${n.hit ? "hit" : "miss"}${autoTxt}`);
    if (n.hit) pushLog(`<span class="who">damage</span> - ${esc(uiDash(n.targetBodyPartName))} - <span class="ra-mono">D ${uiDash(n.damageDiff)}</span> - ${esc(uiDash(n.damageLevel))}`);
    if (n.targetAlive === false) pushLog(`<span class="ra-neg">target is dead</span>`);
    else if (n.targetConscious === false) pushLog(`<span class="ra-neg">target is unconscious</span>`);
  }

  /* ---- events: selects, chips, distance, mode ---- */
  refs.weaponSelect.addEventListener("change", (e) => {
    state.attacker.weaponId = e.target.value;
    renderProfileAndFireMode(); renderAttackBlock(); renderFeatures(); renderPayloadPreview();
  });
  refs.abilitySelect.addEventListener("change", (e) => {
    state.attacker.abilityId = e.target.value; renderAttackBlock(); renderPayloadPreview();
  });
  refs.distance.addEventListener("input", (e) => {
    state.distance = Math.max(Number(e.target.value) || 0, 0); renderPayloadPreview();
  });
  refs.modes.addEventListener("click", (e) => {
    const m = e.target.closest("[data-mode]"); if (!m) return;
    state.mode = m.dataset.mode; renderModes(); renderAttackBlock(); renderFeatures(); renderPayloadPreview();
  });
  // backend-driven profile / fire mode switching
  refs.profileRow.addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-sel]"); if (!sel) return;
    const w = currentWeapon(); if (!w) return;
    banner(refs.resolveStatus, "info", "Applying change via backend…");
    try {
      if (sel.dataset.sel === "profile") {
        await api.weapon.switchWeaponProfile(w.id, sel.value, settings());
      } else {
        await api.weapon.switchWeaponFireMode(state.attacker.id, w.id, sel.value, settings());
      }
      const armory = await loadArmory(state.attacker.id);
      if (armory && armory.ok !== false) state.attacker.armory = armory;
      banner(refs.resolveStatus, "", "");
      renderProfileAndFireMode(); renderAttackBlock(); renderFeatures(); renderPayloadPreview();
    } catch (err) {
      banner(refs.resolveStatus, "err", `Switch failed: ${esc(err.message)}`);
      renderProfileAndFireMode();
    }
  });
  // part chips + modifier chips
  refs.combatCard.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-part]");
    if (chip) {
      if (chip.dataset.targetable === "false") return; // disabled, but still shown
      state.target.partId = chip.dataset.part;
      renderDoll(); renderParts(); renderPayloadPreview();
      return;
    }
    const mod = e.target.closest("[data-mod]");
    if (mod) {
      const m = state.modifiers.find((x) => x.id === mod.dataset.mod);
      if (m) { m.on = !m.on; renderMods(); renderPayloadPreview(); }
    }
  });

  // Inventory/magazine/medkit/GM management moved to the Character panel.

  renderDebug();
  return () => { cleanupCombatRealtimeSubscriptions(); };

  /* ---- Real-Time subscriptions: auto-refresh when body parts or equipment change ---- */
  function setupCombatRealtimeSubscriptions(attackerId, targetId) {
    cleanupCombatRealtimeSubscriptions();
    const sb = getRealtimeClient(settings());
    if (!sb) return;

    const watchedTables = [
      "odyssey_character_body_parts",
      "odyssey_character_equipment_items",
      "odyssey_character_weapons",
      "odyssey_character_weapon_profile_states",
      "odyssey_character_magazines",
      "odyssey_character_abilities",
      "odyssey_character_resource_pools",
    ];

    // Use a unique epoch suffix so re-loading combatants never reuses a subscribed channel name.
    // Deduplicate IDs so attacker === target doesn't create duplicate channels.
    const epoch = Date.now();
    for (const characterId of [...new Set([attackerId, targetId])]) {
      for (const table of watchedTables) {
        const channel = sb
          .channel(`ra:${epoch}:${table}:${characterId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table, filter: `character_id=eq.${characterId}` },
            () => { onCombatRealtimeUpdate(characterId, table); },
          )
          .subscribe();
        state.realtimeSubscriptions.push(channel);
      }
    }
  }

  function cleanupCombatRealtimeSubscriptions() {
    const sb = getRealtimeClient(settings());
    if (!sb) { state.realtimeSubscriptions = []; return; }
    for (const channel of state.realtimeSubscriptions) sb.removeChannel(channel);
    state.realtimeSubscriptions = [];
  }

  async function onCombatRealtimeUpdate(characterId, table) {
    const isAttacker = characterId === state.attacker.id;
    const isTarget = characterId === state.target.id;

    if (table === "odyssey_character_body_parts" || table === "odyssey_character_equipment_items") {
      // Refresh the relevant character's body parts (doll + parts list)
      if (isTarget) await refreshSheetFor("target").catch(() => null);
      if (isAttacker) await refreshSheetFor("attacker").catch(() => null);
    }

    if (table === "odyssey_character_weapons" || table === "odyssey_character_weapon_profile_states" || table === "odyssey_character_magazines") {
      if (isAttacker) {
        const armory = await loadArmory(state.attacker.id).catch(() => null);
        if (armory && armory.ok !== false) {
          state.attacker.armory = armory;
          renderAll();
        }
      }
    }

    if (table === "odyssey_character_abilities" || table === "odyssey_character_resource_pools") {
      if (isAttacker) {
        const abilitiesRes = await loadAbilities(state.attacker.id).catch(() => null);
        if (abilitiesRes) {
          state.attacker.abilities = arr(abilitiesRes.abilities).filter((a) => a.is_enabled !== false);
          state.attacker.pools = arr(abilitiesRes.resource_pools);
          renderAll();
        }
      }
    }
  }
}

/* ---------------- markup + refs ---------------- */
function banner(el, kind, html) {
  if (!el) return;
  if (!html) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="ra-banner ${kind}">${html}</div>`;
}

function skeleton() {
  return `
  <div class="ra-screen">
    <section class="panel">
      <div class="panel-title">Supabase Connection (Stage 5A)</div>
      <div class="ra-grid2">
        <label class="ra-field"><span>Project URL</span><input data-ref="cfgUrl" class="ra-mono" placeholder="https://xxxx.supabase.co" autocomplete="off"></label>
        <label class="ra-field"><span>anon public key</span><input data-ref="cfgKey" class="ra-mono" placeholder="eyJhbGciOi..." autocomplete="off"></label>
      </div>
      <div class="button-row">
        <button data-ref="cfgSave" type="button">Save (local) &amp; Test</button>
        <button data-ref="cfgTest" type="button" class="secondary">Test Connection</button>
        <button data-ref="cfgClear" type="button" class="secondary">Clear Local</button>
      </div>
      <p class="ra-muted">Local dev config is stored in your browser only. Inside Owlbear, room settings are used when local is empty.</p>
      <div data-ref="cfgStatus"></div>
    </section>

    <section class="panel">
      <div class="panel-title">Combat</div>
      <div class="ra-grid2">
        <label class="ra-field"><span>Attacker · character_id</span><input data-ref="attackerId" class="ra-mono" placeholder="uuid" autocomplete="off"></label>
        <label class="ra-field"><span>Target · character_id</span><input data-ref="targetId" class="ra-mono" placeholder="uuid" autocomplete="off"></label>
      </div>
      <div class="button-row">
        <button data-ref="useAttacker" type="button" class="secondary">Use selected as attacker</button>
        <button data-ref="useTarget" type="button" class="secondary">Use selected as target</button>
        <button data-ref="loadBtn" type="button">Load combatants</button>
      </div>
      <div class="ra-row" data-ref="obrContext" style="margin-top:8px"></div>
      <div data-ref="loadStatus"></div>
    </section>

    <section class="panel ra-hidden" data-ref="combatCard">
      <div class="ra-grid2">
        <div>
          <div class="ra-section-title">Mode</div>
          <div class="ra-modes" data-ref="modes">
            <div class="ra-mode active" data-mode="weapon">Weapon</div>
            <div class="ra-mode" data-mode="skill">Skill</div>
          </div>
          <div data-ref="weaponPick" style="margin-top:10px">
            <label class="ra-field"><span>Weapon</span><select data-ref="weaponSelect"></select></label>
            <div class="ra-row" data-ref="profileRow" style="margin-top:8px"></div>
          </div>
          <div data-ref="skillPick" class="ra-hidden" style="margin-top:10px">
            <label class="ra-field"><span>Ability</span><select data-ref="abilitySelect"></select></label>
          </div>
          <div data-ref="attackBlock" style="margin-top:10px"></div>
          <div data-ref="features" style="margin-top:10px"></div>
        </div>
        <div>
          <div class="ra-section-title">Target · <span data-ref="targetName"></span></div>
          <div style="display:flex;justify-content:center;margin-top:4px" data-ref="doll"></div>
          <div class="ra-section-title">Body part (aim)</div>
          <div class="ra-parts" data-ref="parts"></div>
        </div>
      </div>

      <div class="ra-section-title">Distance &amp; modifiers</div>
      <div class="ra-row">
        <label class="ra-field" style="max-width:160px"><span>Distance, m</span><input data-ref="distance" type="number" min="0" step="1" value="0" class="ra-mono"></label>
      </div>
      <div class="ra-row" data-ref="modRow" style="margin-top:8px"></div>
      <p class="ra-muted">Situational total <span class="ra-mono" data-ref="modTotal">+0</span> · distance &amp; aim are computed by the backend.</p>

      <div class="ra-section-title">Payload preview</div>
      <pre data-ref="payloadPreview">—</pre>

      <button data-ref="resolveBtn" type="button" style="margin-top:10px;width:100%">Resolve attack</button>
      <div data-ref="resolveStatus"></div>

      <div class="ra-hidden" data-ref="summaryCard">
        <div class="ra-section-title">Latest result</div>
        <div class="ra-summary" data-ref="summary"></div>
      </div>
    </section>

    <section class="panel ra-hidden ra-debug" data-ref="debugCard">
      <div class="panel-title">Stage 5A Debug</div>
      <div class="button-row" style="margin-top:0">
        <button data-ref="dbgCopyPayload" type="button" class="secondary">Copy payload JSON</button>
        <button data-ref="dbgCopyResult" type="button" class="secondary">Copy result JSON</button>
        <button data-ref="dbgClear" type="button" class="secondary">Clear debug</button>
      </div>
      <div class="ra-section-title">Last payload sent</div><pre data-ref="dbgPayload">—</pre>
      <div class="ra-section-title">Raw backend result</div><pre data-ref="dbgRaw">—</pre>
      <div class="ra-section-title">Normalized UI result</div><pre data-ref="dbgNormalized">—</pre>
      <div class="ra-section-title">Last error</div><pre data-ref="dbgError">—</pre>
      <div class="ra-section-title">Refresh-after-attack summary</div><pre data-ref="dbgRefresh">—</pre>
      <div class="ra-section-title">Last inventory action</div><pre data-ref="dbgInventory">—</pre>
    </section>

    <section class="panel">
      <div class="panel-title">Local result log</div>
      <div class="ra-log" data-ref="log"><div class="ra-muted">Empty — run Resolve attack.</div></div>
    </section>
  </div>`;
}

function queryRefs(root) {
  const refs = {};
  root.querySelectorAll("[data-ref]").forEach((el) => { refs[el.dataset.ref] = el; });
  return refs;
}
