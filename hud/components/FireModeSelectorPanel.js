// Combat HUD — Fire Mode Selector companion popover (Fire Mode v1).
//
// Ephemeral popover that opens above the Gun module when the player clicks the
// fire-mode control. Shows the weapon's available fire modes (from the active
// weapon profile); each is clickable and broadcasts a namespaced
// { scope:"combat-hud", feature:"fire-mode", type:"select", fireModeId }
// command. The popover closes after selection or on Escape (see
// CombatHudModule.js / combatHudOverlayController.js).

import { esc, cls } from "./hudDom.js";
import { panel } from "./HudPanel.js";

function fireModeOption(mode, selected) {
  const code = mode.code ? mode.code.toUpperCase() : "—";
  return `<button type="button" class="${cls("ohud-firemode-option", selected ? "is-selected" : "")}"
    data-action="select-fire-mode" data-fire-mode-id="${esc(mode.id)}" title="${esc(mode.name)} — ${esc(code)}">
    <span class="ohud-firemode-option-name">${esc(mode.name)}</span>
    <span class="ohud-firemode-option-code">${esc(code)}</span>
  </button>`;
}

export function renderFireModeSelectorPanel(state) {
  // No live snapshot yet → controlled loading state, never a false "no modes".
  if (!state || !state.snapshot || !state.snapshot.weapon) {
    return panel({
      key: "gun-fire-mode-selector",
      label: "Fire Mode",
      bodyHtml: `<div class="ohud-firemode-list is-loading">Loading fire modes…</div>`,
    });
  }

  const weapon = state.snapshot.weapon.primary ?? null;
  const fireMode = weapon?.fireMode ?? null;
  const available = Array.isArray(fireMode?.available) ? fireMode.available : [];

  if (!available.length) {
    return panel({
      key: "gun-fire-mode-selector",
      label: "Fire Mode",
      bodyHtml: `<div class="ohud-firemode-list is-empty">No fire modes available</div>`,
    });
  }

  const selectedId = fireMode?.selectedId ?? null;
  const body = `<div class="ohud-firemode-list">${available.map((m) => fireModeOption(m, m.id === selectedId)).join("")}</div>`;
  return panel({ key: "gun-fire-mode-selector", label: "Fire Mode", bodyHtml: body });
}
