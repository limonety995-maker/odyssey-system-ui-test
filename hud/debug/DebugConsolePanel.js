// Odyssey Debug Console — pure render (TEMPORARY, see debugConsoleController.js).
//
// Renders the Console body (header + filters + scrollable entry list) and the
// small floating Launcher shown while the Console is closed. Pure string
// templates only — no OBR, no broadcast — so this file has zero coupling to
// the real HUD components (CombatHudModule.js, GunBlock.js, etc.).

export const FILTERS = ["ALL", "HUD", "TARGET", "GUN", "ATTACK", "RPC", "ERROR"];

/** Which filter groups a stored entry belongs to (an entry can match more than
 *  one — e.g. a failed reload is both GUN and ERROR). View-only: never
 *  mutates the entry or the store. */
export function groupsForEntry(entry) {
  const groups = new Set();
  const category = String(entry?.category ?? "");
  const action = String(entry?.action ?? "");
  if (category === "hud" || category === "popover" || category === "selection" || category === "routing") groups.add("HUD");
  if (category === "targeting") groups.add("TARGET");
  if (category === "refresh") { groups.add("TARGET"); groups.add("ATTACK"); }
  if (category === "weapon" || category === "magazine" || category === "fire-mode") groups.add("GUN");
  if (category === "attack") groups.add("ATTACK");
  if (action.includes("result") || action.includes("rpc")) groups.add("RPC");
  if (entry?.success === false) groups.add("ERROR");
  return groups;
}

function entryMatchesFilter(entry, filter) {
  if (filter === "ALL") return true;
  return groupsForEntry(entry).has(filter);
}

/** UUID-shaped values are shown truncated even inside the Console — e.g.
 *  "char_12ab6f3e-9d21-4a10-9f20" -> "char_12ab…9f20". Short values pass
 *  through unchanged. */
export function truncateValue(value) {
  const s = String(value);
  if (s.length <= 20) return s;
  return `${s.slice(0, 10)}…${s.slice(-4)}`;
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Compact, single-line rendering of an entry's `details` object — safe
 *  strings only (the store's callers are responsible for never putting raw
 *  bundles/tokens/auth data in here; this just formats what's given). */
function formatDetails(details) {
  if (!details || typeof details !== "object") return "";
  const parts = Object.entries(details)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${truncateValue(v)}`);
  return parts.join(" ");
}

function formatTimestamp(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour12: false });
  } catch {
    return String(ts);
  }
}

function entryRow(entry) {
  const statusClass = entry.success === false ? "is-failure" : "is-success";
  const statusLabel = entry.success === false ? "FAIL" : "OK";
  return `<li class="odc-row ${statusClass}">
    <span class="odc-cell odc-time">${esc(formatTimestamp(entry.timestamp))}</span>
    <span class="odc-cell odc-category">${esc(entry.category)}</span>
    <span class="odc-cell odc-action">${esc(entry.action)}</span>
    <span class="odc-cell odc-status">${statusLabel}</span>
    <span class="odc-cell odc-details">${esc(formatDetails(entry.details))}</span>
  </li>`;
}

function filterButton(filter, active) {
  return `<button type="button" class="odc-filter${active ? " is-active" : ""}" data-odc-filter="${filter}">${filter}</button>`;
}

/**
 * @param {Array<object>} entries  newest-first (debugLogStore contract)
 * @param {{filter?:string, collapsed?:boolean}} [view]
 */
export function renderDebugConsolePanel(entries, view = {}) {
  const filter = FILTERS.includes(view.filter) ? view.filter : "ALL";
  const collapsed = !!view.collapsed;
  const list = Array.isArray(entries) ? entries : [];
  const visible = list.filter((e) => entryMatchesFilter(e, filter));

  const body = collapsed ? "" : `
    <div class="odc-filters">${FILTERS.map((f) => filterButton(f, f === filter)).join("")}</div>
    <ul class="odc-list">
      ${visible.length ? visible.map(entryRow).join("") : `<li class="odc-empty">No entries.</li>`}
    </ul>`;

  return `<div class="odc-root">
    <div class="odc-head">
      <span class="odc-title">DEBUG CONSOLE</span>
      <span class="odc-count">${visible.length}/${list.length}</span>
      <button type="button" class="odc-btn" data-odc-action="clear" title="Clear entries">Clear</button>
      <button type="button" class="odc-btn" data-odc-action="toggle-collapse" title="Collapse/Expand">${collapsed ? "Expand" : "Collapse"}</button>
      <button type="button" class="odc-btn odc-close" data-odc-action="close" aria-label="Close Debug Console" title="Close">×</button>
    </div>
    ${body}
  </div>`;
}

export function renderDebugLauncher() {
  return `<button type="button" class="odc-launcher" data-odc-action="reopen" title="Open Odyssey Debug Console">DEBUG</button>`;
}
