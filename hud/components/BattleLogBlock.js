// Combat HUD — Battle Log panel (Phase 2 · 2.1, read-only; polished Phase 4.2).
//
// In the 2.1 composition the Battle Log is NOT a permanent block. The control
// strip holds a small LOG toggle; when on, this floating panel renders the 3–5
// most recent PUBLIC entries (no hidden HP / armour / dice math). It uses the
// same overlay (no second OBR popover, no backend).
//
// Phase 4.2: entries built by hud/log/combatResultLogPolicy.js now carry a
// compact one-line summary (`compactText`) plus a machine-readable
// `status`/`severity` and an expanded Accuracy/Damage/Result `breakdown` —
// all derived verbatim from the server's own trace (see
// hud/log/battleLogEntryModel.js). This panel:
//   - always shows the compact line (bold, single line);
//   - shows the full breakdown / detail lines only once the entry is
//     expanded (click/Enter/Space) — local UI state only, never a server
//     call, never mutates combat runtime;
//   - groups entries into sections by `turnLabel` when the server actually
//     returned round data, never a fake grouping otherwise;
//   - NEVER shows raw payload JSON, RPC bodies, UUIDs, stack traces, or any
//     GM-only/hidden field — that is the Debug Console's job, not this one's.

import { selectCompactBattleLog } from "../core/combatHudSelectors.js";
import { statusLabel, severityLabel } from "../log/battleLogEntryModel.js";
import { ICON_CARET_DOWN } from "./hudIcons.js";
import { esc } from "./hudDom.js";

// Local-only UI state: which entries are currently expanded. Same treatment
// as CombatHudLayout.js's own `battleLogOpen` (open/close the whole panel) —
// a plain closure Set, never round-tripped through the background controller.
const expandedIds = new Set();

/** Toggle one entry's expanded state; callers re-render after calling this
 *  (see CombatHudLayout.js / CombatHudModule.js's `toggle-log-entry` case). */
export function toggleLogEntryExpanded(entryId) {
  const id = String(entryId ?? "").trim();
  if (!id) return;
  if (expandedIds.has(id)) expandedIds.delete(id);
  else expandedIds.add(id);
}

/** Result delta accent: misses muted, hits/damage read as a positive event. */
function deltaClass(delta) {
  const d = String(delta || "").toLowerCase();
  if (!d) return "neutral";
  if (d.includes("miss")) return "miss";
  return "hit";
}

/** A Phase 4.2 entry has a real compact line to render; older/other shapes
 *  (e.g. fire-mode, which has no compact-line spec) fall back to the
 *  legacy always-expanded title+details rendering below. */
function isCompactEntry(e) {
  return !!e && typeof e.compactText === "string" && e.compactText.length > 0;
}

function badgeClassFor(bracketText, e) {
  if (e.status && bracketText === `[${statusLabel(e.status)}]`) {
    return `ohud-log-badge--${String(e.status).replace(/_/g, "-")}`;
  }
  if (e.severity && bracketText === `[${severityLabel(e.severity)}]`) {
    return `ohud-log-sev--${e.severity}`;
  }
  if (bracketText === "[ON]") return "ohud-log-badge--success";
  if (bracketText === "[OFF]") return "ohud-log-badge--failure";
  return null;
}

/** Split "<who> — <badge> · <badge> · ..." into the plain lead-in and its
 *  individual badge/clause segments — never re-derives the numbers, only
 *  re-colours tokens the server-driven model already produced. */
function splitCompact(text) {
  const idx = text.indexOf(" — ");
  if (idx === -1) return { who: text, badges: [] };
  return { who: text.slice(0, idx), badges: text.slice(idx + 3).split(" · ") };
}

function compactLineHtml(e) {
  const { who, badges } = splitCompact(e.compactText);
  if (!badges.length) return esc(who);
  const badgeHtml = badges
    .map((b) => {
      const cls = badgeClassFor(b, e);
      return `<span class="ohud-log-badge${cls ? ` ${cls}` : "-plain"}">${esc(b)}</span>`;
    })
    .join(" · ");
  return `${esc(who)} — ${badgeHtml}`;
}

/** Expanded Accuracy/Damage/Result table for an attack-shaped entry —
 *  re-labels the SAME fields battleLogEntryModel.js already assembled, no
 *  new math. Falls back to the plain detail lines for any entry that has no
 *  breakdown (ability/toggle/reload/movement/end-turn). */
function detailsHtml(e) {
  if (!e.breakdown) {
    if (!Array.isArray(e.details) || !e.details.length) return "";
    return `<div class="ohud-log-details">${e.details.map((d) => `<div class="ohud-log-result-detail">${esc(d)}</div>`).join("")}</div>`;
  }
  const b = e.breakdown;
  const rows = [
    ["Accuracy", b.accuracy?.attacking, b.accuracy?.defending],
    ...(b.damage ? [["Damage", b.damage.attacking, b.damage.defending]] : []),
    ["Result", b.result?.attacking, b.result?.defending],
  ];
  return `<div class="ohud-log-details"><table class="ohud-log-table">
    <thead><tr><th scope="col"></th><th scope="col">Attacking</th><th scope="col">Defending</th></tr></thead>
    <tbody>${rows.map(([label, a, d]) => `<tr><th scope="row">${esc(label)}</th><td>${esc(a ?? "—")}</td><td>${esc(d ?? "—")}</td></tr>`).join("")}</tbody>
  </table></div>`;
}

function compactEntryRow(e) {
  const id = String(e.id ?? "").trim();
  const expanded = id && expandedIds.has(id);
  return `<li class="ohud-log-row ohud-log-row--result">
    <button type="button" class="ohud-log-compact" data-action="toggle-log-entry" data-log-entry-id="${esc(id)}" aria-expanded="${expanded}">${compactLineHtml(e)}</button>
    ${expanded ? detailsHtml(e) : ""}
  </li>`;
}

function entryRow(e) {
  if (isCompactEntry(e)) return compactEntryRow(e);
  // Legacy / no-compact-line shapes (Phase 3D.1 fire-mode entries, and any
  // future shape that doesn't carry compactText): title + all details,
  // always shown — unchanged from the pre-4.2 behaviour.
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

/** Group ADJACENT entries sharing the same real `turnLabel` under one
 *  heading; entries without a turnLabel (legacy shapes, or a server that
 *  didn't return round data) stay in their own ungrouped run — never a
 *  fabricated section. */
function groupByTurn(entries) {
  const groups = [];
  for (const e of entries) {
    const label = e?.turnLabel ?? null;
    const last = groups[groups.length - 1];
    if (label && last && last.turnLabel === label) last.entries.push(e);
    else groups.push({ turnLabel: label, entries: [e] });
  }
  return groups;
}

function turnHeading(turnLabel) {
  const round = /^T(\d+)$/.exec(turnLabel)?.[1];
  return round ? `Turn ${round}` : turnLabel;
}

function renderGroups(groups) {
  return groups
    .map((g) => {
      const rows = `<ul class="ohud-log-rows">${g.entries.map(entryRow).join("")}</ul>`;
      if (!g.turnLabel) return rows;
      return `<section class="ohud-log-turn-group">
        <div class="ohud-log-turn-label">${esc(turnHeading(g.turnLabel))}</div>
        ${rows}
      </section>`;
    })
    .join("");
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
  const body = entries.length
    ? `<div class="ohud-log-list">${renderGroups(groupByTurn(entries))}</div>`
    : `<div class="ohud-log-empty">No combat log yet.</div>`;
  return `<section class="ohud-panel ohud-log-panel" data-block="log">
    <div class="ohud-panel-head">
      <span class="ohud-panel-label">Battle Log</span>
      <button type="button" class="ohud-icon-btn" data-action="toggle-log" aria-label="Close log">${ICON_CARET_DOWN}</button>
    </div>
    ${body}
  </section>`;
}
