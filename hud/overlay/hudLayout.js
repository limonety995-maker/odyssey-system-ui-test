// Combat HUD — modular layout math (Phase 2.2).
//
// Pure helpers for the multi-module HUD: NO DOM, NO OBR, NO CSS — only data +
// math, shared by the background controller (computes each module popover rect),
// the per-module page mount, and the Arrange-HUD editor. Unit-tested under Node.
//
// Each of the seven HUD modules is an independent OBR popover with a stable id.
// Positions are stored NORMALISED (fractions of available travel) so they
// survive viewport resizes and always clamp on-screen. Layout is a LOCAL,
// per-browser preference: never synced to other players, Supabase, or metadata.

/** The geometry below is authored against this exact reference viewport. */
export const HUD_LAYOUT_REFERENCE_VIEWPORT = Object.freeze({ width: 1920, height: 1080 });

export const LAYOUT_VERSION = 2;
export const LAYOUT_STORAGE_KEY = "odyssey.hud.layout.v2";
/** Legacy single-HUD key (Phase 2.1). Intentionally NOT read by v2. */
export const LEGACY_PLACEMENT_KEY = "odyssey.hud.placement.v1";

// Phase 2.2.3: Target + Modifiers + Action are merged into ONE "Combat Control"
// module (composite popover). Five independent HUD modules remain.
export const HUD_MODULE_IDS = Object.freeze([
  "player", "gun", "skills", "combatControl", "log",
]);

/** Stable OBR popover ids — re-opening with the same id updates in place. */
export const HUD_MODULE_POPOVER_IDS = Object.freeze({
  player: "odyssey-hud-player",
  gun: "odyssey-hud-gun",
  skills: "odyssey-hud-skills",
  combatControl: "odyssey-hud-combat-control",
  log: "odyssey-hud-log",
});
/** Popover ids retired in 2.2.3 — the controller closes these so no stale
 *  Target/Modifiers/Action popovers survive an update. */
export const LEGACY_HUD_POPOVER_IDS = Object.freeze([
  "odyssey-hud-target", "odyssey-hud-modifiers", "odyssey-hud-action",
]);
export const GUN_WEAPON_SELECTOR_POPOVER_ID = "odyssey-hud-gun-weapon-selector";
export const GUN_MAGAZINE_SELECTOR_POPOVER_ID = "odyssey-hud-gun-magazine-selector";
export const GUN_FIRE_MODE_SELECTOR_POPOVER_ID = "odyssey-hud-gun-fire-mode-selector";
/** Phase 3E.0: GM-only Combat Tracker companion popover. */
export const GM_COMBAT_TRACKER_POPOVER_ID = "odyssey-hud-gm-combat-tracker";
export const QUICKBAR_EDITOR_POPOVER_ID = "odyssey-hud-quickbar-editor";
// The temporary Debug Console (hud/debug/*) owns its own popover ids —
// intentionally NOT declared here, so it stays fully independent/deletable.
export const HUD_EDITOR_POPOVER_ID = "odyssey-hud-editor";
export const HUD_PILL_POPOVER_ID = "odyssey-hud-pill";

/** LOCAL broadcast channels (iframe ↔ background controller). */
export const BC_HUD_LAYOUT = "com.odyssey.combat-hud/layout";
export const BC_HUD_EDITOR = "com.odyssey.combat-hud/editor";

/** Safe inset (px) from each viewport edge for normalised placement + clamping. */
export const LAYOUT_MARGIN = 16;
/** Drag snap grid (px) used by the editor. */
export const SNAP_GRID = 8;
/** Skills: max quick slots per row before wrapping to a second row. */
export const SKILLS_MAX_PER_ROW = 10;
/**
 * Safe inset (px) reserved on EACH edge of the viewport before the uniform
 * scale is computed (Priority UI Fix — Universal Responsive HUD Scaling).
 * Kept as an explicit, named parameter of the formula rather than folded
 * into computeLayoutScale's callers — currently 0 because the canonical
 * layout must render PIXEL-IDENTICAL to the pre-existing design at exactly
 * the 1920×1080 reference viewport (a hard, tested requirement — see
 * scripts/hud-responsive-layout.test.mjs), and nothing in the OBR SDK
 * surfaces a distinct "chrome-safe" area narrower than
 * OBR.viewport.getWidth()/getHeight() to justify a non-zero value today.
 * clampRect() remains the actual safety net against ever going off-screen.
 */
export const HUD_SAFE_VIEWPORT_PADDING = 0;

/**
 * EXACT designer layout at 1920×1080. These values are authoritative and must
 * NOT be "improved" via CSS grid. Intentional overlaps (player/gun,
 * action/modifiers) and the gun↔skills gap are deliberate — do not auto-fix.
 * @typedef {{left:number,bottom:number,width:number,height:number,zIndex:number}} ModuleRectDef
 */
export const DEFAULT_HUD_LAYOUT_V2 = Object.freeze({
  player:       Object.freeze({ left: 16,   bottom: 16, width: 250, height: 250, zIndex: 30 }),
  gun:          Object.freeze({ left: 126,  bottom: 16, width: 340, height: 165, zIndex: 20 }),
  skills:       Object.freeze({ left: 663,  bottom: 16, width: 600, height: 165, zIndex: 20 }),
  // Composite: Target (left 165) + Modifiers/Action (right 165). Replaces the
  // former three separate target/modifiers/action rects.
  combatControl: Object.freeze({ left: 1263, bottom: 16, width: 330, height: 165, zIndex: 20 }),
  log:          Object.freeze({ left: 1656, bottom: 16, width: 250, height: 250, zIndex: 20 }),
});

/* ----------------- small math ----------------- */

export function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Universal, isotropic scale factor from the 1920×1080 reference design area.
 * Deliberately UNCAPPED in both directions — a viewport smaller than the
 * reference shrinks the whole HUD proportionally, a larger one grows it;
 * there is no artificial minimum and no separate compact/mobile layout. Using
 * `Math.min` of the two axis ratios (never stretching X and Y independently)
 * is what keeps every module's aspect ratio and the intentional Player/Gun
 * overlap correct at any viewport.
 */
export function computeLayoutScale(vw, vh) {
  const usableWidth = Math.max(1, (Number(vw) || 0) - 2 * HUD_SAFE_VIEWPORT_PADDING);
  const usableHeight = Math.max(1, (Number(vh) || 0) - 2 * HUD_SAFE_VIEWPORT_PADDING);
  return Math.min(
    usableWidth / HUD_LAYOUT_REFERENCE_VIEWPORT.width,
    usableHeight / HUD_LAYOUT_REFERENCE_VIEWPORT.height,
  );
}

/**
 * Priority UI Fix — typography floor. `layoutScale` (computeLayoutScale
 * above) drives the module's outer transform:scale, which shrinks
 * EVERYTHING uniformly, text included. A small, named set of "critical"
 * selectors (character/weapon/target name, PSI/ammo values, MAIN/MOVE,
 * ATTACK/END TURN, armed technique name, combat log, status toast — see the
 * comment block above .ohud-cc-abtn in combatHudModule.css) instead multiply
 * their font-size by this ratio, so their ON-SCREEN size never drops below
 * today's already-shipped canonical px size, however small layoutScale gets.
 * Everything else (icons, artwork, secondary/decorative text) is untouched
 * and keeps shrinking normally — this IS "reduce secondary text first".
 *
 * At layoutScale >= 1 the ratio is exactly 1 (no behavior change — critical
 * text still grows with the rest of the HUD above the reference viewport,
 * same as before this fix). Capped at `cap` so a pathologically tiny
 * viewport can't blow critical text up without bound.
 */
export function computeCriticalTextRatio(layoutScale, cap = 3) {
  const scale = Number(layoutScale) > 0 ? Number(layoutScale) : 1;
  if (scale >= 1) return 1;
  return Math.min(cap, 1 / scale);
}

export function snapToGrid(value, grid = SNAP_GRID) {
  const g = grid || 1;
  return Math.round((Number(value) || 0) / g) * g;
}

export function rectsOverlap(a, b) {
  return a.left < b.left + b.width && a.left + a.width > b.left &&
         a.top < b.top + b.height && a.top + a.height > b.top;
}

/* ----------------- module sizing ----------------- */

/** A module's pixel size at the current viewport (uniformly scaled). */
export function moduleSize(moduleId, vw, vh) {
  const def = DEFAULT_HUD_LAYOUT_V2[moduleId];
  const scale = computeLayoutScale(vw, vh);
  return { width: Math.round(def.width * scale), height: Math.round(def.height * scale) };
}

/** Default (designer) pixel rect for a module at the current viewport. */
export function defaultModuleRect(moduleId, vw, vh) {
  const def = DEFAULT_HUD_LAYOUT_V2[moduleId];
  const scale = computeLayoutScale(vw, vh);
  const width = Math.round(def.width * scale);
  const height = Math.round(def.height * scale);
  return {
    left: Math.round(def.left * scale),
    top: Math.round((Number(vh) || 0) - def.bottom * scale - height),
    width, height, zIndex: def.zIndex,
  };
}

/* ----------------- normalised ↔ pixels ----------------- */

export function normalizedToPixels(moduleId, placement, vw, vh) {
  const { width, height } = moduleSize(moduleId, vw, vh);
  const availW = Math.max(0, (Number(vw) || 0) - width - 2 * LAYOUT_MARGIN);
  const availH = Math.max(0, (Number(vh) || 0) - height - 2 * LAYOUT_MARGIN);
  return {
    left: Math.round(LAYOUT_MARGIN + clamp01(placement && placement.x) * availW),
    top: Math.round(LAYOUT_MARGIN + clamp01(placement && placement.y) * availH),
    width, height,
    zIndex: DEFAULT_HUD_LAYOUT_V2[moduleId].zIndex,
  };
}

export function pixelsToNormalized(moduleId, left, top, vw, vh) {
  const { width, height } = moduleSize(moduleId, vw, vh);
  const availW = Math.max(0, (Number(vw) || 0) - width - 2 * LAYOUT_MARGIN);
  const availH = Math.max(0, (Number(vh) || 0) - height - 2 * LAYOUT_MARGIN);
  return {
    x: availW > 0 ? clamp01((left - LAYOUT_MARGIN) / availW) : 0,
    y: availH > 0 ? clamp01((top - LAYOUT_MARGIN) / availH) : 0,
  };
}

/** Clamp a pixel rect fully inside the viewport (size preserved). */
export function clampRect(rect, vw, vh) {
  const w = Number(vw) || 0;
  const h = Number(vh) || 0;
  return {
    ...rect,
    left: Math.max(0, Math.min(rect.left, Math.max(0, w - rect.width))),
    top: Math.max(0, Math.min(rect.top, Math.max(0, h - rect.height))),
  };
}

/** Resolve one module's on-screen pixel rect from its placement. */
export function resolveModuleRect(moduleId, placement, vw, vh) {
  const rect = placement && placement.mode === "custom"
    ? normalizedToPixels(moduleId, placement, vw, vh)
    : defaultModuleRect(moduleId, vw, vh);
  return clampRect(rect, vw, vh);
}

/** Resolve every module's pixel rect for a full layout state. */
export function resolveLayoutRects(layoutState, vw, vh) {
  const state = normalizeLayoutState(layoutState);
  const out = {};
  for (const id of HUD_MODULE_IDS) {
    out[id] = resolveModuleRect(id, state.modules[id], vw, vh);
  }
  return out;
}

/* ----------------- editor alignment guides ----------------- */

/**
 * Edge/centre alignment guides between a moving rect and the others.
 * @returns {{vertical:number[], horizontal:number[]}}
 */
export function computeAlignmentGuides(moving, others, threshold = 6) {
  const vertical = new Set();
  const horizontal = new Set();
  const mX = [moving.left, moving.left + moving.width / 2, moving.left + moving.width];
  const mY = [moving.top, moving.top + moving.height / 2, moving.top + moving.height];
  for (const o of others) {
    const oX = [o.left, o.left + o.width / 2, o.left + o.width];
    const oY = [o.top, o.top + o.height / 2, o.top + o.height];
    for (const a of mX) for (const b of oX) if (Math.abs(a - b) <= threshold) vertical.add(Math.round(b));
    for (const a of mY) for (const b of oY) if (Math.abs(a - b) <= threshold) horizontal.add(Math.round(b));
  }
  return { vertical: [...vertical], horizontal: [...horizontal] };
}

/* ----------------- skills row layout ----------------- */

/** Split N skill items into rows of at most SKILLS_MAX_PER_ROW. */
export function splitSkillRows(items, maxPerRow = SKILLS_MAX_PER_ROW) {
  const list = Array.isArray(items) ? items : [];
  const cap = Math.max(1, maxPerRow);
  const rows = [];
  for (let i = 0; i < list.length; i += cap) rows.push(list.slice(i, i + cap));
  return rows;
}

/* ----------------- layout state (storage) ----------------- */

/**
 * @typedef {{mode:"default"|"custom", x:number, y:number}} ModulePlacement
 * @typedef {{version:number, modules:Record<string, ModulePlacement>}} LayoutState
 */

export function defaultLayoutState() {
  const modules = {};
  for (const id of HUD_MODULE_IDS) modules[id] = { mode: "default", x: 0, y: 0 };
  return { version: LAYOUT_VERSION, modules };
}

/** Reset = exact designer default. */
export function resetLayoutState() {
  return defaultLayoutState();
}

/**
 * Phase 2.2.3 migration: an older v2 payload may still hold separate `target`,
 * `modifiers`, `action` placements. If there's no `combatControl` yet, seed it
 * from the old `target` position (the merged module sits where Target was);
 * if Target was default/missing, leave it absent → default Combat Control rect.
 * Legacy keys are then dropped (only HUD_MODULE_IDS are copied below).
 */
function migrateLegacyModules(modules) {
  if (!modules || modules.combatControl) return modules;
  const hasLegacy = modules.target || modules.modifiers || modules.action;
  if (!hasLegacy) return modules;
  const base = modules.target;
  if (base && base.mode === "custom" && Number.isFinite(base.x) && Number.isFinite(base.y)) {
    return { ...modules, combatControl: { mode: "custom", x: clamp01(base.x), y: clamp01(base.y) } };
  }
  return modules;
}

/** Validate an untrusted object as a v2 LayoutState, or return null. */
export function validateLayoutState(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.version !== LAYOUT_VERSION) return null;
  if (!raw.modules || typeof raw.modules !== "object") return null;
  const src = migrateLegacyModules(raw.modules);
  const out = defaultLayoutState();
  for (const id of HUD_MODULE_IDS) {
    const m = src[id];
    if (m && (m.mode === "default" || m.mode === "custom") &&
        typeof m.x === "number" && typeof m.y === "number" &&
        Number.isFinite(m.x) && Number.isFinite(m.y)) {
      out.modules[id] = { mode: m.mode, x: clamp01(m.x), y: clamp01(m.y) };
    }
  }
  return out;
}

/** Coerce anything into a complete LayoutState (invalid → default). */
export function normalizeLayoutState(state) {
  return validateLayoutState(state) ?? defaultLayoutState();
}

export function parseLayoutState(rawJson) {
  if (rawJson == null) return null;
  let obj = rawJson;
  if (typeof rawJson === "string") {
    try { obj = JSON.parse(rawJson); } catch { return null; }
  }
  return validateLayoutState(obj);
}

export function serializeLayoutState(state) {
  return JSON.stringify(normalizeLayoutState(state));
}

/** Read + validate the layout from a Storage-like object. Default on miss/invalid. */
export function readStoredLayout(storage) {
  try {
    const raw = storage && storage.getItem ? storage.getItem(LAYOUT_STORAGE_KEY) : null;
    return parseLayoutState(raw) ?? defaultLayoutState();
  } catch {
    return defaultLayoutState();
  }
}

export function writeStoredLayout(storage, state) {
  try {
    if (storage && storage.setItem) storage.setItem(LAYOUT_STORAGE_KEY, serializeLayoutState(state));
  } catch { /* ignore quota/security */ }
}

/* ----------------- draft (editor) helpers ----------------- */

/** A draft is just a LayoutState; commit returns it, cancel returns the base. */
export function commitDraft(draft) {
  return normalizeLayoutState(draft);
}
export function cancelDraft(base) {
  return normalizeLayoutState(base);
}
/** Set one module's placement in a draft (immutably). */
export function setModulePlacement(draft, moduleId, placement) {
  const next = normalizeLayoutState(draft);
  if (HUD_MODULE_IDS.includes(moduleId)) {
    next.modules[moduleId] = {
      mode: placement && placement.mode === "default" ? "default" : "custom",
      x: clamp01(placement && placement.x),
      y: clamp01(placement && placement.y),
    };
  }
  return next;
}
