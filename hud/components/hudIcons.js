// Combat HUD — inline SVG icon set (Phase 2).
//
// All icons are ORIGINAL, simple geometric shapes. No external assets, no
// raster images, no copied game art. Single-colour icons use `currentColor`
// so the CSS `color` of the host element drives the accent. Body/vehicle
// silhouettes expose per-zone classes (`ohud-zone ohud-zone--<state>`) so the
// stylesheet maps semantic condition → token colour.

import { zoneStateClass } from "./hudLayoutModel.js";
import { tipAttr } from "./hudDom.js";

/* ----------------- small UI glyphs ----------------- */

export const ICON_MARK = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 2l8 10-8 10-8-10z" fill="currentColor"/></svg>`;

export const ICON_CARET_DOWN = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 9l6 7 6-7z" fill="currentColor"/></svg>`;
export const ICON_CARET_UP = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 15l6-7 6 7z" fill="currentColor"/></svg>`;

export const ICON_PENCIL = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 16.5L15 5.5l3.5 3.5L7.5 20H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M13.5 7l3.5 3.5" stroke="currentColor" stroke-width="1.6"/></svg>`;

export const ICON_RELOAD = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M20 4v4h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const ICON_LOG = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 4h14v16H5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 9h8M8 12h8M8 15h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

/** Drag grip — six dots (matches the reference handle). */
export const ICON_GRIP = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></g></svg>`;

/** Grid / layout — opens the Arrange-HUD editor. */
export const ICON_GRID = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></g></svg>`;

/** Padlock — compact unsupported/unavailable quickbar-slot state marker
 *  (Phase 4.1A.2). Same muted, non-alarming style as the other glyphs here —
 *  never a red/damage-style icon. */
export const ICON_LOCK = `<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;

/** Shield outline (target/defence indicator). */
export const ICON_SHIELD = `<svg viewBox="0 0 24 28" width="100%" height="100%" aria-hidden="true"><path d="M12 2l9 3v8c0 6-4 9-9 11-5-2-9-5-9-11V5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

/** Magazine block (rounded, with a feed-lip notch). */
export const ICON_MAGAZINE = `<svg viewBox="0 0 40 64" width="100%" height="100%" aria-hidden="true"><rect x="9" y="6" width="22" height="50" rx="5" fill="currentColor"/><rect x="13" y="2" width="14" height="7" rx="2.5" fill="currentColor"/></svg>`;

/* ----------------- weapon silhouettes ----------------- */

/**
 * Weapon silhouette by svgRef. Light cool-blue fill via `currentColor`
 * (host sets color: var(--odyssey-hud-weapon)).
 */
export function weaponSvg(svgRef) {
  if (svgRef === "pistol") {
    return `<svg viewBox="0 0 200 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d="M18 40h140l12 6v16h-58l-6 10-18 0-4-10H40l-6 22H18l4-30-4-2z" fill="currentColor"/>
    </svg>`;
  }
  // default: marksman rifle
  return `<svg viewBox="0 0 360 150" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <!-- receiver + barrel -->
    <rect x="40" y="58" width="250" height="20" rx="5" fill="currentColor"/>
    <rect x="280" y="62" width="70" height="9" rx="4" fill="currentColor"/>
    <!-- stock -->
    <path d="M10 56h40v26H22l-12-8z" fill="currentColor"/>
    <!-- optic -->
    <rect x="150" y="40" width="60" height="14" rx="4" fill="currentColor"/>
    <rect x="170" y="30" width="22" height="12" rx="3" fill="currentColor"/>
    <!-- magazine -->
    <path d="M150 78l8 34h26l4-34z" fill="currentColor"/>
    <!-- grip -->
    <path d="M96 78l-10 34h22l6-34z" fill="currentColor"/>
    <!-- handguard underline -->
    <rect x="210" y="78" width="70" height="8" rx="4" fill="currentColor"/>
  </svg>`;
}

/* ----------------- skill icons ----------------- */

const SKILL_ICONS = {
  star: `<path d="M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6L12 16.9 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="currentColor"/>`,
  burst: `<path d="M12 2l1.8 4.4L18 4.5l-1.5 4.2 4.5 1L17 12l4 2.3-4.5 1L18 19.5l-4.2-1.9L12 22l-1.8-4.4L6 19.5l1.5-4.2-4.5-1L7 12 3 9.7l4.5-1L6 4.5l4.2 1.9z" fill="currentColor"/><circle cx="12" cy="12" r="3" fill="var(--odyssey-bg-deep)"/>`,
  scope: `<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  psi: `<path d="M7 4h2v6a3 3 0 1 0 6 0V4h2v6a5 5 0 0 1-4 4.9V20h-2v-5.1A5 5 0 0 1 7 10z" fill="currentColor"/>`,
  cube: `<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 3v18M4 7.5l8 4.5 8-4.5" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  arrowup: `<path d="M12 4v13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 9l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="19" r="2.4" fill="currentColor"/>`,
  grenade: `<circle cx="12" cy="14" r="6.5" fill="currentColor"/><rect x="10" y="3" width="4" height="4" rx="1" fill="currentColor"/><path d="M14 4h4v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  injector: `<path d="M5 19l8-8 3 3-8 8H5z" fill="currentColor"/><path d="M14 8l4-4 2 2-4 4z" fill="currentColor"/>`,
  cloak: `<path d="M12 3c4 2 6 5 6 9 0 5-3 8-6 9-3-1-6-4-6-9 0-4 2-7 6-9z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 11c1.5 1.5 4.5 1.5 6 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  bolt: `<path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="currentColor"/>`,
  shieldtri: `<path d="M12 4l7 3v6c0 4-3 6-7 7-4-1-7-3-7-7V7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
  arc: `<path d="M12 5a7 7 0 1 1-5 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/>`,
};

/**
 * A skill tile icon by its `icon` name with sensible aliases. Falls back to a
 * neutral dot for unknown names.
 */
export function skillIconSvg(name) {
  const key = String(name || "").toLowerCase();
  const alias = {
    "arrow-up": "arrowup", "mind": "psi", "psionic": "psi",
    "explosion": "burst", "sunburst": "burst", "shield": "shieldtri",
    "cooldown": "arc", "reload": "arc",
  };
  const inner = SKILL_ICONS[key] ?? SKILL_ICONS[alias[key]] ?? `<circle cx="12" cy="12" r="6" fill="currentColor"/>`;
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">${inner}</svg>`;
}

/* ----------------- entity silhouettes ----------------- */

function zoneAttr(zoneId, zonesMap, neutral) {
  // `neutral` is an explicit request for a placeholder/ghost silhouette (e.g.
  // "no target selected yet") — healthy is correct there, it isn't real data.
  // Otherwise a zone missing from the map means its condition genuinely isn't
  // known yet (or the fetch was denied) — it must render as "unknown", never
  // a false "healthy".
  const stateName = neutral ? "healthy" : (zonesMap?.[zoneId] ?? "unknown");
  return zoneStateClass(stateName);
}

const SVG_PART_TO_ZONE_ID = Object.freeze({
  head: "HEAD",
  torso: "TORSO",
  l_arm: "LEFT_ARM",
  r_arm: "RIGHT_ARM",
  l_leg: "LEFT_LEG",
  r_leg: "RIGHT_LEG",
});

const SVG_PART_LABEL = Object.freeze({
  head: "Head",
  torso: "Torso",
  l_arm: "Left arm",
  r_arm: "Right arm",
  l_leg: "Left leg",
  r_leg: "Right leg",
});

/**
 * Humanoid silhouette with six targetable zones. Each zone is filled by its
 * condition class. `highlight` outlines the selected target zone (the outline
 * never hides the fill colour — it's a stroke, not a fill override).
 * When `targetable` is true, each silhouette part becomes the zone picker.
 * `zoneTips` (Player Block only — see PlayerBlock.js's authorization gate)
 * attaches a real numeric hover tooltip per zone via the existing generic
 * Tooltip.js infra (data-tip-title/data-tip-lines) — never shown for a
 * Target Block silhouette.
 * @param {{ zones?:Record<string,string>, highlight?:(string|null), neutral?:boolean,
 *           targetable?:boolean, zoneTips?:(Record<string,string[]>|null) }} [opts]
 */
export function humanoidSvg(opts = {}) {
  const { zones = {}, highlight = null, neutral = false, targetable = false, zoneTips = null } = opts;
  const z = (id) => `ohud-zone ohud-zone--${zoneAttr(id, zones, neutral)}${highlight === id ? " is-target" : ""}${targetable ? " ohud-zone--clickable" : ""}`;
  const tipFor = (id) => (zoneTips && Array.isArray(zoneTips[id]) && zoneTips[id].length)
    ? tipAttr(SVG_PART_LABEL[id], zoneTips[id])
    : "";
  const a = (id) => targetable
    ? ` data-zone="${id}" data-action="select-target-zone" data-zone-id="${SVG_PART_TO_ZONE_ID[id]}" role="button" tabindex="0" aria-label="${SVG_PART_LABEL[id]}"${tipFor(id)}`
    : ` data-zone="${id}"${tipFor(id)}`;
  return `<svg viewBox="0 0 120 150" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="${targetable ? "false" : "true"}" class="ohud-silhouette">
    <circle cx="60" cy="24" r="16" class="${z("head")}"${a("head")}/>
    <rect x="42" y="44" width="36" height="46" rx="11" class="${z("torso")}"${a("torso")}/>
    <rect x="24" y="48" width="14" height="40" rx="7" class="${z("l_arm")}"${a("l_arm")}/>
    <rect x="82" y="48" width="14" height="40" rx="7" class="${z("r_arm")}"${a("r_arm")}/>
    <rect x="45" y="94" width="14" height="44" rx="7" class="${z("l_leg")}"${a("l_leg")}/>
    <rect x="61" y="94" width="14" height="44" rx="7" class="${z("r_leg")}"${a("r_leg")}/>
  </svg>`;
}

/**
 * Simplified mech silhouette. Maps a couple of contract zones to coloured
 * plates; the rest use the neutral chassis tone.
 * @param {{ zones?:Record<string,string> }} [opts]
 */
export function mechSvg(opts = {}) {
  const { zones = {} } = opts;
  const z = (id) => `ohud-zone ohud-zone--${zoneAttr(id, zones, false)}`;
  return `<svg viewBox="0 0 120 150" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" class="ohud-silhouette">
    <rect x="46" y="10" width="28" height="20" rx="5" class="${z("m_head")}" data-zone="m_head"/>
    <path d="M36 34h48l6 40H30z" class="${z("m_core")}" data-zone="m_core"/>
    <rect x="14" y="38" width="18" height="46" rx="6" class="${z("m_l_arm")}" data-zone="m_l_arm"/>
    <rect x="88" y="38" width="18" height="46" rx="6" class="${z("m_r_arm")}" data-zone="m_r_arm"/>
    <path d="M40 78h16v60H38z" class="${z("m_legs")}" data-zone="m_legs"/>
    <path d="M64 78h16l-2 60H64z" class="${z("m_legs")}"/>
  </svg>`;
}

/**
 * Turret / non-humanoid silhouette (base + housing + barrel + sensor).
 * @param {{ zones?:Record<string,string> }} [opts]
 */
export function turretSvg(opts = {}) {
  const { zones = {} } = opts;
  const z = (id) => `ohud-zone ohud-zone--${zoneAttr(id, zones, false)}`;
  return `<svg viewBox="0 0 120 150" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" class="ohud-silhouette">
    <ellipse cx="60" cy="132" rx="38" ry="10" class="${z("base")}" data-zone="base"/>
    <rect x="50" y="78" width="20" height="50" rx="6" class="${z("base")}"/>
    <rect x="34" y="50" width="52" height="34" rx="10" class="${z("housing")}" data-zone="housing"/>
    <rect x="80" y="58" width="34" height="10" rx="5" class="${z("barrel")}" data-zone="barrel"/>
    <circle cx="48" cy="44" r="8" class="${z("sensor")}" data-zone="sensor"/>
  </svg>`;
}

/** Pick the right silhouette for an entity summary. */
export function entitySilhouetteSvg(summary, opts = {}) {
  const ref = summary?.svgRef ?? "humanoid";
  if (ref === "mech") return mechSvg(opts);
  if (ref === "turret") return turretSvg(opts);
  return humanoidSvg(opts);
}
