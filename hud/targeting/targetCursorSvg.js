// HUD Targeting — crosshair SVG (PURE, no OBR import).
//
// One original, HUD-friendly reticle: an outer circle + four short ticks (one
// per side), with a deliberate gap at the exact center — no bitmap, no copied
// asset. Reused in TWO places:
//   1. TARGET_CROSSHAIR_ICON — inline <svg> for the Target Area empty-state
//      placeholder (thin lines, styled via CSS `color` on the host element).
//   2. buildTargetCursorValue() — a CSS `cursor` value (custom SVG data URI +
//      hotspot + a `crosshair` fallback) applied by the OBR Tool mode while
//      target-picking is active, so the pointer over the MAP itself is
//      re-skinned without touching Owlbear's own DOM/CSS.

/** Inline reticle for the HUD placeholder — inherits color via currentColor,
 *  matching every other icon in hud/components/hudIcons.js. */
export const TARGET_CROSSHAIR_ICON =
  `<svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">` +
  `<circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="1.6"/>` +
  `<line x1="24" y1="2" x2="24" y2="10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>` +
  `<line x1="24" y1="38" x2="24" y2="46" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>` +
  `<line x1="2" y1="24" x2="10" y2="24" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>` +
  `<line x1="38" y1="24" x2="46" y2="24" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>` +
  `</svg>`;

// The exact --odyssey-cyan token value (hud/styles/combatHudTokens.css). A CSS
// `cursor` data-URI can't reference a CSS custom property, so the color is
// inlined here — kept as the SAME literal so it never silently drifts from
// the HUD accent it's meant to match.
const CURSOR_CYAN_HEX = "%2334e1d6"; // "#34e1d6" URL-encoded ("#" -> "%23")

function reticleSvgMarkup(size, colorToken) {
  const c = size / 2;
  const rOuter = size * 0.28;
  const tickStart = size * 0.03;
  const tickEnd = size * 0.22;
  const tickStart2 = size * 0.78;
  const tickEnd2 = size * 0.97;
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>` +
    `<circle cx='${c}' cy='${c}' r='${rOuter}' fill='none' stroke='${colorToken}' stroke-width='1.6'/>` +
    `<line x1='${c}' y1='${tickStart}' x2='${c}' y2='${tickEnd}' stroke='${colorToken}' stroke-width='1.6' stroke-linecap='round'/>` +
    `<line x1='${c}' y1='${tickStart2}' x2='${c}' y2='${tickEnd2}' stroke='${colorToken}' stroke-width='1.6' stroke-linecap='round'/>` +
    `<line x1='${tickStart}' y1='${c}' x2='${tickEnd}' y2='${c}' stroke='${colorToken}' stroke-width='1.6' stroke-linecap='round'/>` +
    `<line x1='${tickStart2}' y1='${c}' x2='${tickEnd2}' y2='${c}' stroke='${colorToken}' stroke-width='1.6' stroke-linecap='round'/>` +
    `</svg>`
  );
}

/**
 * Build the CSS `cursor` value used by the picking-only OBR tool mode: a
 * small reticle image (same shape as TARGET_CROSSHAIR_ICON) with a centered
 * hotspot, falling back to the native "crosshair" keyword if the browser
 * can't load the custom image for any reason.
 * @returns {string}
 */
export function buildTargetCursorValue() {
  const svg = reticleSvgMarkup(32, CURSOR_CYAN_HEX);
  return `url("data:image/svg+xml,${svg}") 16 16, crosshair`;
}

/**
 * Standalone data-URI icon for the OBR toolbar button (Tool.icons/ToolMode.icons
 * require an actual icon image — unlike the HUD's own inline <svg>, an <img>-
 * rendered icon can't rely on `currentColor`, so this bakes in the same cyan
 * accent explicitly).
 * @returns {string}
 */
export function buildTargetCursorToolIcon() {
  const svg = reticleSvgMarkup(24, CURSOR_CYAN_HEX);
  return `data:image/svg+xml,${svg}`;
}
