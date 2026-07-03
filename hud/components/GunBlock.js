// Combat HUD - Gun block (Phase 3, live weapon/magazine/ammo).
//
// Stable gun module showing weapon name + silhouette + fire mode (left) and
// magazine + ammo state (right). Weapon/magazine selectors are companion
// popovers, not part of this block.

import { selectVisibleReserveMagazines, selectSelectedReloadMagazine } from "../core/combatHudSelectors.js";
import { weaponSvg, ICON_MAGAZINE, ICON_CARET_DOWN, ICON_RELOAD } from "./hudIcons.js";
import { panel } from "./HudPanel.js";
import { esc, tipAttr, cls } from "./hudDom.js";

// Fire Mode v1 — the small fire-mode badge in the weapon-main card:
//   - no modes / not applicable (melee, cold weapons) → render nothing at all;
//   - exactly one mode → plain read-only label (no click, no selector);
//   - 2+ modes → interactive button opening the fire-mode companion popover.
// Never fabricates AUTO/SEMI/BURST — only real data from weapon.fireMode
// (see hud/runtime/runtimeBundleMapper.js readFireMode()).
function renderFireModeControl(weapon) {
  const fm = weapon.fireMode;
  if (!fm || !fm.isApplicable) return "";
  const label = (fm.selectedCode || fm.selectedName || "").toUpperCase();
  const tip = tipAttr("Fire mode", [esc(fm.selectedName || fm.selectedCode || "")]);

  if (!fm.isSelectable) {
    return `<span class="ohud-firemode is-readonly"${tip}>
      <span class="ohud-firemode-knob"></span><span class="ohud-firemode-letter">${esc(label)}</span>
    </span>`;
  }

  return `<button type="button" class="ohud-firemode is-selectable" data-action="toggle-fire-mode-selector" aria-label="Choose fire mode"${tip}>
    <span class="ohud-firemode-knob"></span><span class="ohud-firemode-letter">${esc(label)}</span><span class="ohud-firemode-caret" aria-hidden="true">${ICON_CARET_DOWN}</span>
  </button>`;
}

function emptyGun() {
  return panel({
    key: "gun",
    label: "Weapon",
    bodyHtml: `<div class="ohud-gun is-disabled"><div class="ohud-gun-main"><div class="ohud-muted-fill">No weapon</div></div></div>`,
  });
}

export function renderGunBlock(state) {
  const weapon = state?.snapshot?.weapon?.primary ?? null;
  const secondary = state?.snapshot?.weapon?.secondary ?? null;
  if (!weapon) return emptyGun();

  const mag = weapon.loadedMagazine ?? null;
  const ammoCur = mag ? Number(mag.current ?? 0) : Number(weapon.ammo?.current ?? 0);
  const reserve = selectVisibleReserveMagazines(state);
  const selectedReload = selectSelectedReloadMagazine(state);
  const reloadMag = selectedReload ?? reserve[0] ?? null;
  const canReload = Boolean(weapon.canReload) && reserve.length > 0;
  const isEmpty = weapon.requiresAmmo && ammoCur <= 0;
  const disabled = Boolean(weapon.disabledReason) || (isEmpty && !canReload);

  const mainCard = `
    <div class="ohud-gun-main"${tipAttr(weapon.name, [weapon.currentFireMode ? `Mode: ${weapon.currentFireMode}` : ""])}>
      <span class="ohud-gun-name">${esc(weapon.name)}</span>
      <button type="button" class="ohud-gun-caret" data-action="toggle-weapon-selector" aria-label="Choose weapon" title="Select a different weapon">${ICON_CARET_DOWN}</button>
      <span class="ohud-gun-silhouette">${weaponSvg(weapon.svgRef)}</span>
      ${renderFireModeControl(weapon)}
      ${secondary ? `<span class="ohud-gun-secondary"${tipAttr("Secondary weapon", [esc(secondary.name || "")])}>2nd</span>` : ""}
    </div>`;

  const body = `<div class="${cls("ohud-gun", disabled ? "is-disabled" : "")}"${disabled ? tipAttr("Weapon unavailable", [esc(weapon.disabledReason || "Out of ammo")]) : ""}>
    ${mainCard}
    <div class="ohud-gun-side">${renderMagazineCard(weapon, reserve, reloadMag)}${renderAmmoCard(weapon, mag, isEmpty, canReload, reloadMag)}</div>
  </div>`;

  return panel({ key: "gun", label: "Weapon", bodyHtml: body });
}

// The small magazine card shows ONLY the selected spare (reload candidate) —
// never the inserted magazine's ammo type. The ammo card below is the only
// place the inserted magazine's rounds are shown; the two must never mix.
function renderMagazineCard(weapon, reserve, reloadMag) {
  const usesMag = Boolean(weapon.usesMagazine);
  const spareLabel = reloadMag ? (reloadMag.ammoType ?? reloadMag.caliberLabel ?? "—") : "—";

  return `<div class="ohud-mag-card${usesMag ? "" : " is-consumable"}">
    <span class="ohud-mag-icon" aria-hidden="true">${usesMag ? ICON_MAGAZINE : ""}</span>
    ${usesMag && reserve.length > 0 ? `<button type="button" class="ohud-mag-selector-btn" data-action="toggle-magazine-selector" aria-label="Choose magazine" title="Select spare magazine">${ICON_CARET_DOWN}</button>` : ""}
    <span class="ohud-mag-type"${tipAttr("Selected spare magazine", [esc(spareLabel)])}>${esc(spareLabel)}</span>
  </div>`;
}

function renderAmmoCard(weapon, mag, isEmpty, canReload, reloadMag) {
  let ammoDisplay = "—";
  if (mag && (mag.current || mag.max)) {
    ammoDisplay = `${Number(mag.current ?? 0)}/${Number(mag.max ?? 0)}`;
  } else if (!mag && weapon.ammo && (weapon.ammo.current || weapon.ammo.max)) {
    ammoDisplay = `${Number(weapon.ammo.current ?? 0)}/${Number(weapon.ammo.max ?? 0)}`;
  }

  return `<div class="ohud-ammo-card">
    <span class="ohud-ammo-head">
      <span class="ohud-ammo-label">ammo</span>
      <button type="button" class="${cls("ohud-ammo-reload", canReload ? "" : "is-off")}" data-action="reload" data-weapon-id="${esc(weapon.id)}" data-magazine-id="${esc(reloadMag?.id ?? "")}" ${canReload ? "" : "disabled"} title="${canReload ? "Insert compatible magazine" : "No compatible magazine"}">${ICON_RELOAD}</button>
    </span>
    <span class="${cls("ohud-ammo-count", isEmpty ? "ohud-ammo-count--empty" : "")}">
      <span>${esc(ammoDisplay)}</span>
    </span>
  </div>`;
}
