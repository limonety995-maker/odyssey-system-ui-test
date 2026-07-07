// Combat HUD - Target block (Phase 3B/3C, live targeting).
//
// Shows the current targeting state from the Phase 3B target-selection
// controller. When a target is selected, the humanoid silhouette renders with
// the active zone highlighted and every body zone directly clickable.

import { selectTargetView } from "../core/combatHudSelectors.js";
import { humanoidSvg } from "./hudIcons.js";
import { panel } from "./HudPanel.js";
import { esc, tipAttr } from "./hudDom.js";
import { zoneIdToSvgPart } from "../targeting/targetProfiles.js";
import { TARGET_CROSSHAIR_ICON } from "../targeting/targetCursorSvg.js";

export function renderTargetBlock(state) {
  const tv = selectTargetView(state);

  if (!tv.hasTarget) {
    const picking = tv.isPicking;
    // Phase 4.0g: no humanoid silhouette here at all while there is no target
    // — the WHOLE area is either the "Pick target on map" button (idle) or a
    // static "Selecting target…" status (picking). Reuses the SAME existing
    // pick-target/cancel-target commands (see CombatHudModule.js) — this is
    // only a layout/markup change, never a new target-selection mechanism.
    // While picking, this is deliberately a plain <div> (no data-action at
    // all) so a stray click can never re-dispatch "pick" a second time; Esc
    // (handled once at the module level) is the only way to cancel.
    const body = picking
      ? `<div class="ohud-target is-empty ohud-target-pickarea is-picking" role="status" aria-live="polite">
          <span class="ohud-target-crosshair" aria-hidden="true">${TARGET_CROSSHAIR_ICON}</span>
          <div class="ohud-target-hint">Selecting target…</div>
          <div class="ohud-target-subhint">Press Esc to cancel</div>
        </div>`
      : `<button type="button" class="ohud-target is-empty ohud-target-pickarea" data-action="pick-target" role="button" tabindex="0" aria-label="Pick target on map">
          <span class="ohud-target-crosshair" aria-hidden="true">${TARGET_CROSSHAIR_ICON}</span>
          <div class="ohud-target-hint">Pick target on map</div>
        </button>`;
    return panel({ key: "target", label: "Target", bodyHtml: body });
  }

  const distLabel = Number.isFinite(tv.distance) ? `${tv.distance} m` : null;
  const svgPart = zoneIdToSvgPart(tv.bodyPartId);

  // Phase 4.0f (Combat Control visual pass): silhouette LEFT, a vertical text
  // column to its RIGHT — name / zone badge / Clear each on their own line, so
  // a long name never overlaps the figure and never needs to share a line with
  // the zone badge. Distance (when the server actually provides it) rides as a
  // small secondary chip next to the zone badge rather than its own row.
  const body = `<div class="ohud-target">
    <div class="ohud-figure ohud-figure--targetable">
      <div class="ohud-figure-svg">${humanoidSvg({ zones: tv.zonesMap, highlight: svgPart, targetable: true })}</div>
    </div>
    <div class="ohud-target-meta">
      <div class="ohud-target-name" title="${esc(tv.name)}">${esc(tv.name)}</div>
      <div class="ohud-target-sub">
        <span class="ohud-target-zone"${tipAttr("Aimed zone", ["Click a body zone on the silhouette"])}>${esc(tv.bodyPartLabel)}</span>
        ${distLabel ? `<span class="ohud-target-dist"${tipAttr("Distance to target", [])}>${esc(distLabel)}</span>` : ""}
      </div>
      <button type="button" class="ohud-target-clear" data-action="clear-target"${tipAttr("Clear target", [])}>Clear</button>
    </div>
  </div>`;

  return panel({ key: "target", label: "Target", bodyHtml: body });
}
