// Odyssey Debug Console — pure render (TEMPORARY, see debugConsoleController.js).
//
// Renders the Console body (header + filters + scrollable summary list + an
// optional detail area for the selected entry) and the small floating
// Launcher shown while the Console is closed. Pure string templates only —
// no OBR, no broadcast, no clipboard — so this file has zero coupling to the
// real HUD components (CombatHudModule.js, GunBlock.js, etc.) and stays
// trivially unit-testable.

export const FILTERS = ["ALL", "HUD", "TARGET", "GUN", "ATTACK", "ABILITIES", "RPC", "ERROR"];

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
  if (category === "abilities" || category === "quickbar") groups.add("ABILITIES");
  if (action.includes("result") || action.includes("rpc")) groups.add("RPC");
  if (entry?.success === false) groups.add("ERROR");
  return groups;
}

function entryMatchesFilter(entry, filter) {
  if (filter === "ALL") return true;
  return groupsForEntry(entry).has(filter);
}

function visibleEntries(entries, filter) {
  const list = Array.isArray(entries) ? entries : [];
  return list.filter((e) => entryMatchesFilter(e, filter));
}

/** UUID-shaped values are shown truncated even inside the Console — e.g.
 *  "char_12ab6f3e-9d21-4a10-9f20" -> "char_12ab…9f20". Short values pass
 *  through unchanged, and so does any human-readable phrase (contains
 *  whitespace — e.g. the "Not returned by server" sentinel): only long
 *  id-shaped tokens are truncated. Used for BOTH the on-screen row/detail
 *  rendering and the Copy text, so copied text never contains more than
 *  what's displayed. Object/array values (e.g. one element of a nested
 *  ValidationError.details array) are JSON-stringified rather than passed to
 *  String(), which would otherwise collapse them to the useless
 *  "[object Object]" — detailLines() below still prefers to expand such
 *  values onto their own indented lines; this fallback only matters when a
 *  caller passes an object/array straight into truncateValue() itself. */
export function truncateValue(value) {
  if (value && typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return s.length <= 80 ? s : `${s.slice(0, 76)}…`;
    } catch {
      return "[unserializable]";
    }
  }
  const s = String(value);
  if (s.length <= 20 || /\s/.test(s)) return s;
  return `${s.slice(0, 10)}…${s.slice(-4)}`;
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Compact, single-line rendering of an entry's `details` object for the
 *  summary row — safe strings only (the store's callers are responsible for
 *  never putting raw bundles/tokens/auth data in here; this just formats
 *  what's given). Truncated by CSS ellipsis in the row, never wrapped.
 *  A string `summary` field leads the row verbatim (no `summary=` prefix) —
 *  that's how structured events like attack/roll-resolution get a readable
 *  row ("HIT · 81 vs 49 · serious") — and nested objects are skipped here
 *  (they belong to the detail area, not the one-line summary). */
function formatDetailsCompact(details) {
  if (!details || typeof details !== "object") return "";
  const parts = [];
  if (typeof details.summary === "string" && details.summary) parts.push(details.summary);
  for (const [k, v] of Object.entries(details)) {
    if (v === undefined || k === "summary") continue;
    if (v && typeof v === "object") continue; // nested trace sections → detail area only
    parts.push(`${k}=${truncateValue(v)}`);
  }
  return parts.join(" ");
}

/** Full key/value lines for the detail area AND for Copy — one "key: value"
 *  string per field, values truncated the same way as the row (so Copy never
 *  contains more than what's already visible on screen). Nested objects
 *  (e.g. a roll-resolution trace's accuracy/damage/ammo sections) expand
 *  recursively with two-space indentation. Array elements that are
 *  themselves objects (e.g. a ValidationError.details array of
 *  {path, message, expected, received} issues) also expand onto their own
 *  indented "[i]:" lines instead of being joined through truncateValue —
 *  that join used to produce the useless "details: [object Object]" once an
 *  array held object entries. Arrays of plain scalars keep the old
 *  single-line join. */
export function detailLines(details, indent = "") {
  if (!details || typeof details !== "object") return [];
  const lines = [];
  for (const [k, v] of Object.entries(details)) {
    if (v === undefined) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      lines.push(`${indent}${k}:`);
      lines.push(...detailLines(v, `${indent}  `));
    } else if (Array.isArray(v)) {
      const hasObjectItem = v.some((item) => item && typeof item === "object");
      if (hasObjectItem) {
        lines.push(`${indent}${k}:`);
        v.forEach((item, i) => {
          if (item && typeof item === "object") {
            lines.push(`${indent}  [${i}]:`);
            lines.push(...detailLines(item, `${indent}    `));
          } else {
            lines.push(`${indent}  [${i}]: ${truncateValue(item)}`);
          }
        });
      } else {
        lines.push(`${indent}${k}: ${v.map((item) => truncateValue(item)).join(", ")}`);
      }
    } else {
      lines.push(`${indent}${k}: ${truncateValue(v)}`);
    }
  }
  return lines;
}

function formatTimestamp(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour12: false });
  } catch {
    return String(ts);
  }
}

/** Stable-enough identity for a stored entry within a single session — used
 *  to track row selection across re-renders (a fresh broadcast delivers a
 *  new array, never the same object references). */
export function entryKey(entry) {
  return `${entry?.timestamp ?? ""}|${entry?.category ?? ""}|${entry?.action ?? ""}`;
}

function statusLabel(entry) {
  return entry?.success === false ? "FAIL" : "OK";
}

/** Full, safe, human-readable text for ONE entry — used by "Copy event". */
export function buildEntryCopyText(entry) {
  const lines = [
    `timestamp: ${formatTimestamp(entry.timestamp)}`,
    `category: ${entry.category ?? ""}`,
    `action: ${entry.action ?? ""}`,
    `status: ${entry?.success === false ? "fail" : "ok"}`,
  ];
  const details = detailLines(entry.details);
  if (details.length) {
    lines.push("details:");
    for (const line of details) lines.push(`  ${line}`);
  }
  return lines.join("\n");
}

/** Full, safe text for every currently-VISIBLE (post-filter) entry, capped at
 *  200 — used by "Copy visible". Entries are already newest-first & capped at
 *  200 by debugLogStore itself; the slice here is a defensive belt-and-braces
 *  cap, not a second source of truth. */
export function buildVisibleCopyText(entries, filter) {
  const visible = visibleEntries(entries, filter).slice(0, 200);
  return visible.map(buildEntryCopyText).join("\n\n");
}

function entryRow(entry, selectedKey) {
  const key = entryKey(entry);
  const statusClass = entry.success === false ? "is-failure" : "is-success";
  const selectedClass = key === selectedKey ? " is-selected" : "";
  return `<li class="odc-row ${statusClass}${selectedClass}" data-odc-row-key="${esc(key)}">
    <span class="odc-cell odc-time">${esc(formatTimestamp(entry.timestamp))}</span>
    <span class="odc-cell odc-category">${esc(entry.category)}</span>
    <span class="odc-cell odc-action">${esc(entry.action)}</span>
    <span class="odc-cell odc-status">${statusLabel(entry)}</span>
    <span class="odc-cell odc-details">${esc(formatDetailsCompact(entry.details))}</span>
  </li>`;
}

function filterButton(filter, active) {
  return `<button type="button" class="odc-filter${active ? " is-active" : ""}" data-odc-filter="${filter}">${filter}</button>`;
}

function renderDetailArea(entry, copyStatus) {
  if (!entry) return "";
  const lines = detailLines(entry.details);
  const body = lines.length ? esc(lines.join("\n")) : "(no details)";
  return `<div class="odc-detail">
    <div class="odc-detail-head">
      <span class="odc-detail-title">${esc(String(entry.category).toUpperCase())} · ${esc(entry.action)} · ${statusLabel(entry)}</span>
      <span class="odc-detail-time">${esc(formatTimestamp(entry.timestamp))}</span>
    </div>
    <div class="odc-detail-body">
      <pre class="odc-detail-kv">${body}</pre>
    </div>
    <div class="odc-detail-actions">
      <button type="button" class="odc-btn" data-odc-action="copy-event">Copy event</button>
      <span class="odc-copy-status${copyStatus === "event" ? " is-visible" : ""}">Copied</span>
      <button type="button" class="odc-btn" data-odc-action="close-details">Close details</button>
    </div>
  </div>`;
}

/**
 * @param {Array<object>} entries  newest-first (debugLogStore contract)
 * @param {{filter?:string, collapsed?:boolean, selectedKey?:string|null, copyStatus?:string|null}} [view]
 */
export function renderDebugConsolePanel(entries, view = {}) {
  const filter = FILTERS.includes(view.filter) ? view.filter : "ALL";
  const collapsed = !!view.collapsed;
  const list = Array.isArray(entries) ? entries : [];
  const visible = visibleEntries(list, filter);
  const selectedKey = view.selectedKey ?? null;
  const selectedEntry = selectedKey ? list.find((e) => entryKey(e) === selectedKey) ?? null : null;

  const body = collapsed ? "" : `
    <div class="odc-filters">${FILTERS.map((f) => filterButton(f, f === filter)).join("")}</div>
    <ul class="odc-list${selectedEntry ? " odc-list--split" : ""}">
      ${visible.length ? visible.map((e) => entryRow(e, selectedKey)).join("") : `<li class="odc-empty">No entries.</li>`}
    </ul>
    ${renderDetailArea(selectedEntry, view.copyStatus ?? null)}`;

  return `<div class="odc-root">
    <div class="odc-head">
      <span class="odc-title">DEBUG CONSOLE</span>
      <span class="odc-count">${visible.length}/${list.length}</span>
      <button type="button" class="odc-btn" data-odc-action="copy-visible" title="Copy all visible entries">Copy visible</button>
      <span class="odc-copy-status${view.copyStatus === "visible" ? " is-visible" : ""}">Copied</span>
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
