// Combat HUD — Gun block (Phase 2, read-only).
//
// Mirrors the reference: a large weapon-silhouette card on the left with a
// (read-only) dropdown caret and a fire-mode indicator, plus a narrow right
// column — magazine/ammo-type card on top, a big ammo counter below with a
// reload glyph. No real magazine swap / reload happens in Phase 2.

import { selectSelectedReloadMagazine, selectVisibleReserveMagazines } from "../core/combatHudSelectors.js";
import { weaponSvg, ICON_MAGAZINE, ICON_CARET_DOWN, ICON_RELOAD } from "./hudIcons.js";
import { panel } from "./HudPanel.js";
import { esc, tipAttr, cls } from "./hudDom.js";

function fireModeLetter(mode) {
  if (!mode) return "—";
  const m = String(mode).toLowerCase();
  if (m.startsWith("semi")) return "S";
  if (m.startsWith("burst")) return "B";
  if (m.startsWith("auto")) return "A";
  if (m.startsWith("full")) return "F";
  return String(mode).charAt(0).toUpperCase();
}

function emptyGun() {
  return panel({
    key: "gun",
    label: "Weapon",
    bodyHtml: `<div class="ohud-gun is-disabled"><div class="ohud-gun-main"><div class="ohud-muted-fill">No weapon</div></div></div>`,
  });
}

function weaponOption(option) {
  return `<button type="button" class="${cls("ohud-weapon-option", option.selected ? "is-selected" : "")}"
    data-action="select-weapon" data-weapon-id="${esc(option.id)}">
    <span class="ohud-weapon-option-name">${esc(option.name)}</span>
    ${option.type ? `<span class="ohud-weapon-option-type">${esc(option.type)}</span>` : ""}
    <span class="ohud-weapon-option-ammo">${esc(option.ammoLabel || "—")}</span>
  </button>`;
}

function reserveOption(mag, selected) {
  return `<button type="button" class="${cls("ohud-reserve-mag", selected ? "is-selected" : "")}" data-action="select-reload-mag" data-magazine-id="${esc(mag.id)}">
    <span>${esc(mag.description || mag.ammoType || "Magazine")}</span>
    <span>${Number(mag.current ?? 0)}/${Number(mag.max ?? 0)}</span>
  </button>`;
}

export function renderGunBlock(state) {
  const weapon = state?.snapshot?.weapon?.primary ?? null;
  const secondary = state?.snapshot?.weapon?.secondary ?? null;
  if (!weapon) return emptyGun();

  const mag = weapon.loadedMagazine ?? null;
  const usesMag = Boolean(weapon.usesMagazine);
  const ammoCur = mag ? Number(mag.current ?? 0) : Number(weapon.ammo?.current ?? 0);
  const ammoMax = mag ? Number(mag.max ?? 0) : Number(weapon.ammo?.max ?? 0);
  const ammoType = mag?.ammoType ?? (weapon.usesConsumable ? "item" : "—");
  const isEmpty = weapon.requiresAmmo && ammoCur <= 0;
  const reserve = selectVisibleReserveMagazines(state);
  const selectedReload = selectSelectedReloadMagazine(state);
  const reloadMag = selectedReload ?? reserve[0] ?? null;
  const canReload = Boolean(weapon.canReload) && reserve.length > 0;
  const disabled = Boolean(weapon.disabledReason) || (isEmpty && !canReload);
  const fm = fireModeLetter(weapon.currentFireMode);
  const availableWeapons = Array.isArray(state?.snapshot?.weapon?.available) ? state.snapshot.weapon.available : [];
  const selectorOpen = !!state?.ui?.weaponSelectorOpen;

  const fireModeTip = tipAttr("Fire mode", [
    `Current: ${weapon.currentFireMode ?? "—"}`,
    weapon.fireModes?.length ? `Available: ${weapon.fireModes.join(", ")}` : "",
  ]);
  const swapTip = tipAttr("Magazine / ammo", [
    "Swap available in a later phase",
    reserve.length ? `${reserve.length} compatible magazine(s) in reserve` : "No spare magazines",
  ]);

  const mainCard = `
    <div class="ohud-gun-main"${tipAttr(weapon.name, [weapon.currentFireMode ? `Mode: ${weapon.currentFireMode}` : ""])}>
      <span class="ohud-gun-name">${esc(weapon.name)}</span>
      <button type="button" class="ohud-gun-caret" data-action="toggle-weapon-list" aria-label="Choose weapon"${swapTip}>${ICON_CARET_DOWN}</button>
      <span class="ohud-gun-silhouette">${weaponSvg(weapon.svgRef)}</span>
      <span class="ohud-firemode is-readonly"${fireModeTip}><span class="ohud-firemode-knob"></span><span class="ohud-firemode-letter">${esc(fm)}</span></span>
      ${secondary ? `<span class="ohud-gun-secondary"${tipAttr("Secondary weapon", [esc(secondary.name || "")])}>2nd</span>` : ""}
    </div>`;

  const magCard = `
    <div class="ohud-mag-card${usesMag ? "" : " is-consumable"}"${swapTip}>
      <span class="ohud-mag-icon" aria-hidden="true">${usesMag ? ICON_MAGAZINE : ""}</span>
      ${usesMag ? `<span class="ohud-mag-caret is-readonly" aria-hidden="true">${ICON_CARET_DOWN}</span>` : ""}
      <span class="ohud-mag-type">${esc(ammoType)}</span>
    </div>`;

  const ammoCard = `
    <div class="ohud-ammo-card">
      <span class="ohud-ammo-head">
        <span class="ohud-ammo-label">ammo</span>
        <button type="button" class="${cls("ohud-ammo-reload", canReload ? "" : "is-off")}" data-action="reload" data-weapon-id="${esc(weapon.id)}" data-magazine-id="${esc(reloadMag?.id ?? "")}" ${canReload ? "" : "disabled"}${tipAttr("Reload", [canReload ? "Insert compatible magazine" : "No compatible magazine"])}>${ICON_RELOAD}</button>
      </span>
      <span class="${cls("ohud-ammo-count", isEmpty ? "ohud-ammo-count--empty" : "")}">
        <span class="ohud-ammo-cur">${ammoCur}</span><span class="ohud-ammo-max">/${ammoMax}</span>
      </span>
    </div>`;

  const weaponList = selectorOpen && availableWeapons.length > 1
    ? `<div class="ohud-weapon-list">${availableWeapons.map(weaponOption).join("")}</div>`
    : "";
  const visibleReserve = reserve.slice(0, 2);
  const reserveMore = reserve.length > visibleReserve.length
    ? `<div class="ohud-reserve-more">+${reserve.length - visibleReserve.length}</div>`
    : "";
  const reserveList = reserve.length
    ? `<div class="ohud-reserve-list">${visibleReserve.map((mag) => reserveOption(mag, mag.id === reloadMag?.id)).join("")}${reserveMore}</div>`
    : "";

  const body = `<div class="${cls("ohud-gun", disabled ? "is-disabled" : "")}"${disabled ? tipAttr("Weapon unavailable", [esc(weapon.disabledReason || "Out of ammo")]) : ""}>
    ${mainCard}
    <div class="ohud-gun-side">${magCard}${ammoCard}</div>
    ${weaponList}${reserveList}
  </div>`;

  return panel({ key: "gun", label: "Weapon", bodyHtml: body });
}
