// Combat HUD — Battle Log panel (Phase 2 · 2.1, read-only).
//
// In the 2.1 composition the Battle Log is NOT a permanent block. The control
// strip holds a small LOG toggle; when on, this floating panel renders the 3–5
// most recent PUBLIC entries (no hidden HP / armour / dice math). It uses the
// same overlay (no second OBR popover, no backend).

import { selectCompactBattleLog } from "../core/combatHudSelectors.js";
import { ICON_CARET_DOWN } from "./hudIcons.js";
import { esc } from "./hudDom.js";

/** Result delta accent: misses muted, hits/damage read as a positive event. */
function deltaClass(delta) {
  const d = String(delta || "").toLowerCase();
  if (!d) return "neutral";
  if (d.includes("miss")) return "miss";
  return "hit";
}

function entryRow(e) {
  // Phase 3D.1: a real, server-result-only combat log entry (attack/reload/
  // fire-mode) — see hud/log/combatResultLogPolicy.js. Distinct shape from the
  // Phase 0 mock entries below (kind/actor/action/target/delta); rendered as a
  // title line + short safe detail lines, never a fabricated dice/damage value.
  if (Array.isArray(e.details)) {
    const accent = e.outcome === "failure" ? "miss" : "hit";
    return `<li class="ohud-log-row ohud-log-row--result">
      <div class="ohud-log-result-title ohud-log-delta--${accent}">${esc(e.title)}</div>
      ${e.details.map((d) => `<div class="ohud-log-result-detail">${esc(d)}</div>`).join("")}
    </li>`;
  }
  if (e.kind === "system") {
    return `<li class="ohud-log-row ohud-log-row--system">▸ ${esc(e.action || e.summary)}</li>`;
  }
  if (e.kind === "narrative") {
    return `<li class="ohud-log-row ohud-log-row--narr">${esc(e.actor ? `${e.actor}: ` : "")}${esc(e.action || e.summary)}</li>`;
  }
  return `<li class="ohud-log-row">
    <span class="ohud-log-actor">${esc(e.actor)}</span>
    <span class="ohud-log-act">${esc(e.action)}</span>
    ${e.target ? `<span class="ohud-log-arrow">›</span><span class="ohud-log-target">${esc(e.target)}</span>` : ""}
    ${e.delta ? `<span class="ohud-log-delta ohud-log-delta--${deltaClass(e.delta)}">${esc(e.delta)}</span>` : ""}
  </li>`;
}

/** Real combat-result entries (see combatResultLogPolicy.js) are already
 *  stored NEWEST FIRST — take the first 5 directly, never reorder them.
 *  Legacy/mock entries (oldest-first) keep using the existing, tested
 *  selectCompactBattleLog() contract (documented "newest last"). */
function selectRecentLogEntries(state) {
  const raw = state?.snapshot?.battleLog?.entries ?? [];
  if (raw.length && Array.isArray(raw[0]?.details)) return raw.slice(0, 5);
  return selectCompactBattleLog(state);
}

export function renderBattleLogPanel(state) {
  const entries = selectRecentLogEntries(state);
  const list = entries.length
    ? `<ul class="ohud-log-list">${entries.map(entryRow).join("")}</ul>`
    : `<div class="ohud-log-empty">No combat log yet.</div>`;
  return `<section class="ohud-panel ohud-log-panel" data-block="log">
    <div class="ohud-panel-head">
      <span class="ohud-panel-label">Battle Log</span>
      <button type="button" class="ohud-icon-btn" data-action="toggle-log" aria-label="Close log">${ICON_CARET_DOWN}</button>
    </div>
    ${list}
  </section>`;
}
