// Odyssey Debug Console — tests for the temporary, fully-isolated hud/debug/*
// diagnostics popover (replaces the old ?debug=1 DebugLogPanel companion).
//
// Pure logic only (rect math, panel rendering, isolation contracts) — same
// constraint as the rest of this suite: no OBR SDK mocking, so behavior that
// only OBR.onReady/OBR.popover can exercise is instead verified as static
// isolation contracts (distinct ids/channels, no coupling imports, no
// persistence calls anywhere in the source).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEBUG_CONSOLE_POPOVER_ID,
  DEBUG_LAUNCHER_POPOVER_ID,
  CONSOLE_WIDTH,
  MARGIN,
  consoleRect,
  launcherRect,
} from "../hud/debug/debugConsoleLayout.js";
import {
  BC_DEBUG_CONSOLE_ENTRIES,
  BC_DEBUG_CONSOLE_REQUEST,
  BC_DEBUG_CONSOLE_COMMAND,
} from "../hud/debug/debugConsoleConstants.js";
import { renderDebugConsolePanel, renderDebugLauncher, groupsForEntry, truncateValue, FILTERS } from "../hud/debug/DebugConsolePanel.js";
import { HUD_MODULE_POPOVER_IDS } from "../hud/overlay/hudLayout.js";
import { BC_HUD_SELECTION, BC_HUD_COMMAND } from "../hud/overlay/overlayConstants.js";
import { initDebugLog, clearDebugLog, logDebugEvent, getDebugLogEntries } from "../hud/debug/debugLogStore.js";
import { renderBattleLogPanel } from "../hud/components/BattleLogBlock.js";
import { buildBroadcastPayload } from "../hud/scene/selectionState.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.error(`  FAIL ${name}\n      ${err.message}`);
  }
}

function readSource(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

console.log("\nOdyssey Debug Console\n");

// ── 1. Popover ids never collide with the 5 main HUD modules ───────────────

test("1. Debug Console / launcher popover ids are distinct from every main HUD module popover id", () => {
  const mainIds = Object.values(HUD_MODULE_POPOVER_IDS);
  assert.ok(!mainIds.includes(DEBUG_CONSOLE_POPOVER_ID));
  assert.ok(!mainIds.includes(DEBUG_LAUNCHER_POPOVER_ID));
  assert.notEqual(DEBUG_CONSOLE_POPOVER_ID, DEBUG_LAUNCHER_POPOVER_ID);
});

// ── 2. Broadcast channels never collide with the real HUD's channels ───────

test("2. Debug Console broadcast channels are distinct from the real HUD's overlay channels", () => {
  const hudChannels = [BC_HUD_SELECTION, BC_HUD_COMMAND];
  for (const ch of [BC_DEBUG_CONSOLE_ENTRIES, BC_DEBUG_CONSOLE_REQUEST, BC_DEBUG_CONSOLE_COMMAND]) {
    assert.ok(!hudChannels.includes(ch));
  }
});

// ── 3. Positioning: top-right, within the required width band, and it never
//      reasons about (or reuses) the main HUD's own rect math ─────────────

test("3. Console width is within the required 360-440px band and sits top-right regardless of viewport size", () => {
  assert.ok(CONSOLE_WIDTH >= 360 && CONSOLE_WIDTH <= 440);
  for (const vw of [800, 1280, 1920, 3840]) {
    const rect = consoleRect(vw);
    assert.equal(rect.top, MARGIN, "always anchored to the top");
    assert.ok(rect.left + rect.width <= vw, "never overflows the viewport to the right");
    assert.ok(Math.abs(vw - (rect.left + rect.width)) <= MARGIN, "right edge sits flush against the top-right margin");
  }
});

test("Launcher rect is also top-right and distinct in size from the Console", () => {
  const rect = launcherRect(1280);
  assert.ok(rect.width < CONSOLE_WIDTH);
  assert.equal(rect.top, MARGIN);
});

test("4. Debug Console layout math never imports or calls the main HUD's module-rect resolver", () => {
  const src = readSource("hud/debug/debugConsoleLayout.js");
  assert.ok(!/resolveModuleRect|hudLayout\.js|HUD_MODULE_POPOVER_IDS/.test(src));
});

// ── 5. Isolation: the controller doesn't touch main-HUD state or ids ───────

test("5. debugConsoleController.js never IMPORTS from hud/overlay/hudLayout.js or overlayConstants.js (comments may still mention them by name)", () => {
  const src = readSource("hud/debug/debugConsoleController.js");
  const importLines = src.split("\n").filter((l) => /^\s*import /.test(l));
  for (const line of importLines) {
    assert.ok(!line.includes("hudLayout.js"), `unexpected import: ${line}`);
    assert.ok(!line.includes("overlayConstants.js"), `unexpected import: ${line}`);
  }
});

test("6. combatHudOverlayController.js only WRITES into debugLogStore — it never IMPORTS the Debug Console's own files", () => {
  const src = readSource("hud/overlay/combatHudOverlayController.js");
  const importLines = src.split("\n").filter((l) => /^\s*import /.test(l));
  assert.ok(importLines.some((l) => l.includes("debugLogStore.js")));
  assert.ok(!importLines.some((l) => /debugConsoleController|debugConsolePage|DebugConsolePanel|debugConsoleLayout|debugConsoleConstants/.test(l)));
});

test("7. background.js integration is minimal: import + a single startDebugConsole() call, nothing else debug-shaped", () => {
  const src = readSource("background.js");
  assert.ok(src.includes('from "./hud/debug/debugConsoleController.js"'));
  assert.ok(/\bstartDebugConsole\(\)/.test(src));
});

// ── 8. Never persists anywhere ──────────────────────────────────────────────

test("8. no file under hud/debug/ imports Supabase, uses localStorage, or writes OBR scene/room metadata", () => {
  const dir = path.join(repoRoot, "hud", "debug");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
  assert.ok(files.length > 0);
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    const importLines = src.split("\n").filter((l) => /^\s*import /.test(l));
    assert.ok(!importLines.some((l) => /supabase/i.test(l)), `${f} must not import Supabase`);
    assert.ok(!/localStorage\s*\./.test(src), `${f} must not use localStorage`);
    assert.ok(!/scene\.setMetadata|room\.setMetadata|setItemMetadata/.test(src), `${f} must not write OBR metadata`);
  }
});

// ── 9-11. Old ?debug=1 companion system is fully gone ───────────────────────

test("9. Log Block never renders a DEBUG button or debug-log affordance, regardless of state.ui", () => {
  const baseState = { snapshot: { battleLog: { entries: [] } } };
  const html1 = renderBattleLogPanel(baseState);
  const html2 = renderBattleLogPanel({ ...baseState, ui: { debugEnabled: true } });
  for (const html of [html1, html2]) {
    assert.ok(!html.includes("DEBUG"));
    assert.ok(!html.includes("toggle-debug-log"));
  }
});

test("10. selectionState.buildBroadcastPayload's ui object no longer carries a debugEnabled gate", () => {
  const payload = buildBroadcastPayload(
    { status: "ready", selectedItemId: "t1", characterId: "c1", viewer: {}, access: {}, view: {} },
    { debugEnabled: true },
  );
  assert.ok(!Object.prototype.hasOwnProperty.call(payload.ui, "debugEnabled"));
});

test("11. selectionView.js no longer threads a debugEnabled field into the synthetic ui object", () => {
  const src = readSource("hud/scene/selectionView.js");
  assert.ok(!src.includes("debugEnabled"));
});

test("12. sceneSelectionController.js no longer calls initDebugLog — only debugConsoleController.js enables the store", () => {
  const sceneSrc = readSource("hud/scene/sceneSelectionController.js");
  const consoleSrc = readSource("hud/debug/debugConsoleController.js");
  assert.ok(!sceneSrc.includes("initDebugLog"));
  assert.ok(consoleSrc.includes("initDebugLog(true)"));
});

test("hud/components/DebugLogPanel.js has been deleted", () => {
  assert.ok(!fs.existsSync(path.join(repoRoot, "hud", "components", "DebugLogPanel.js")));
});

// ── 13. Required log events are covered by real call sites ─────────────────

test("13. every minimum-required event category/action is logged from somewhere in the app", () => {
  const combined = [
    readSource("hud/debug/debugConsoleController.js"),
    readSource("hud/scene/sceneSelectionController.js"),
    readSource("hud/overlay/combatHudOverlayController.js"),
    readSource("hud/targeting/targetSelectionController.js"),
  ].join("\n");
  const required = [
    "initialized", "source-token-selected", "source-character-resolved", "source-character-unavailable",
    "picking-started", "target-selected", "zone-selected", "target-body-zone-refresh-result", "target-cleared",
    "selected", "reload-requested", "reload-result", "requested", "blocked", "payload-prepared", "result",
    "source-refresh-result", "unexpected-exception", "module-opened", "module-closed",
  ];
  for (const action of required) {
    assert.ok(combined.includes(action), `missing required debug event action: ${action}`);
  }
});

// ── 14. Panel rendering: header controls, row shape, ordering, filters ─────

function sampleEntries() {
  return [
    { timestamp: 3000, category: "attack", action: "result", details: { ok: true, characterId: "char_12ab6f3e9d21-9f20" }, success: true },
    { timestamp: 2000, category: "magazine", action: "reload-result", details: { error: "JAMMED" }, success: false },
    { timestamp: 1000, category: "hud", action: "initialized", details: {}, success: true },
  ];
}

test("14a. Console renders header (title/Clear/Collapse/×) plus filter buttons ALL|HUD|TARGET|GUN|ATTACK|RPC|ERROR", () => {
  const html = renderDebugConsolePanel(sampleEntries(), { filter: "ALL" });
  assert.ok(html.includes("DEBUG CONSOLE"));
  assert.ok(html.includes('data-odc-action="clear"'));
  assert.ok(html.includes('data-odc-action="toggle-collapse"'));
  assert.ok(html.includes('data-odc-action="close"'));
  for (const f of FILTERS) assert.ok(html.includes(`data-odc-filter="${f}"`));
});

test("14b. Each row shows timestamp | category | action | status | compact details, newest first", () => {
  const html = renderDebugConsolePanel(sampleEntries(), { filter: "ALL" });
  const firstRowIdx = html.indexOf("odc-row");
  const secondRowIdx = html.indexOf("odc-row", firstRowIdx + 1);
  assert.ok(html.indexOf("result") < html.indexOf("reload-result"), "newest (ts=3000) rendered before ts=2000");
  assert.ok(html.indexOf("reload-result") < html.indexOf("initialized"), "ts=2000 rendered before ts=1000");
  assert.ok(secondRowIdx > firstRowIdx);
  assert.ok(html.includes("FAIL"));
  assert.ok(html.includes("OK"));
});

test("14c. UUID-shaped detail values are truncated for display (never the raw long id)", () => {
  const long = "char_12ab6f3e-9d21-4a10-9f20-ffffffffffff";
  const shown = truncateValue(long);
  assert.ok(shown.length < long.length);
  assert.ok(shown.includes("…"));
  const html = renderDebugConsolePanel([{ timestamp: 1, category: "attack", action: "result", details: { characterId: long }, success: true }], {});
  assert.ok(!html.includes(long));
});

test("14d. Filtering is view-only: it changes what's rendered, never the input array", () => {
  const entries = sampleEntries();
  const before = JSON.stringify(entries);
  renderDebugConsolePanel(entries, { filter: "GUN" });
  assert.equal(JSON.stringify(entries), before, "entries array must be untouched by rendering/filtering");
  const htmlGun = renderDebugConsolePanel(entries, { filter: "GUN" });
  const htmlAll = renderDebugConsolePanel(entries, { filter: "ALL" });
  assert.ok(htmlGun.includes("1/3"), "GUN filter narrows the visible count");
  assert.ok(htmlAll.includes("3/3"));
});

test("14e. A failed entry is groupable under both its own category AND ERROR", () => {
  const groups = groupsForEntry({ category: "magazine", action: "reload-result", success: false });
  assert.ok(groups.has("GUN"));
  assert.ok(groups.has("ERROR"));
  assert.ok(groups.has("RPC"));
});

test("14f. Collapsed view hides the filter bar and entry list but keeps the header controls", () => {
  const html = renderDebugConsolePanel(sampleEntries(), { collapsed: true });
  assert.ok(html.includes("DEBUG CONSOLE"));
  assert.ok(!html.includes("odc-filters"));
  assert.ok(!html.includes("odc-list"));
});

test("14g. Launcher renders a single reopen-labelled control, independent of Console markup", () => {
  const html = renderDebugLauncher();
  assert.ok(html.includes('data-odc-action="reopen"'));
  assert.ok(!html.includes("DEBUG CONSOLE"));
});

// ── 15. Clear only touches the in-memory store, nothing else ───────────────

test("15. Clear (via debugLogStore.clearDebugLog) only empties the in-memory array — no other side effects to verify", () => {
  initDebugLog(true);
  clearDebugLog();
  logDebugEvent("hud", "initialized", {});
  logDebugEvent("attack", "requested", {});
  assert.equal(getDebugLogEntries().length, 2);
  clearDebugLog();
  assert.equal(getDebugLogEntries().length, 0);
  initDebugLog(false);
});

setTimeout(() => {
  console.log(`\nOdyssey Debug Console: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
