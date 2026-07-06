// HUD Abilities — Phase 4.0b UI tests (Skills strip, tooltip, editor, wiring).
//
// PURE render tests over the abilities view modules + source-contract checks
// over the HUD wiring (SkillBlock fold, module click handlers, overlay route +
// controller lifecycle). Node cannot mount OBR/DOM, so the wiring is pinned by
// content the same way the combat-session suite pins its controllers.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { abilityTooltipModel, abilityTooltipLines } from "../hud/abilities/AbilityTooltip.js";
import { renderQuickbarStrip } from "../hud/abilities/QuickbarView.js";
import { renderQuickbarEditor } from "../hud/abilities/QuickbarEditorPanel.js";
import { buildDraft, unassignedActions } from "../hud/abilities/quickbarLayoutPolicy.js";
import { renderSkillBlock } from "../hud/components/SkillBlock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const read = (...seg) => fs.readFileSync(path.join(repoRoot, ...seg), "utf8").replace(/\r\n/g, "\n");
const moduleSrc = read("hud", "components", "CombatHudModule.js");
const selectionStateSrc = read("hud", "scene", "selectionState.js");
const sceneControllerSrc = read("hud", "scene", "sceneSelectionController.js");
const overlayControllerSrc = read("hud", "overlay", "combatHudOverlayController.js");
const overlayPageSrc = read("hud", "overlay", "combatHudOverlayPage.js");

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

console.log("\nAbilities & Quickbar UI (Phase 4.0b)\n");

/* ───────────────────────── fixtures ───────────────────────── */

function action(over = {}) {
  return {
    characterActionId: over.id ?? "act-1",
    definitionId: "def-1",
    sourceType: over.sourceType ?? "psi",
    type: over.type ?? "directed",
    name: over.name ?? "Mind Spike",
    shortDescription: "psi strike",
    fullDescription: over.fullDescription ?? "A focused psionic strike.",
    iconKey: "brain",
    semanticKind: over.semanticKind ?? "psi",
    targeting: over.targeting ?? { mode: "character", minTargets: 1, maxTargets: 1, allowAllies: false, allowSelf: false, requiresBodyZone: false },
    costs: over.costs ?? { main: 1, move: 0, psi: 3, charges: 0 },
    cooldown: over.cooldown ?? { current: 0, max: 2, unit: "turn" },
    state: over.state ?? { available: true, active: false, disabledReason: null, selectable: true },
    requirements: over.requirements ?? { weaponClass: null, weaponId: null, conditionSummary: null },
  };
}

function runtime(slots, actions) {
  return {
    ok: true, error: null, characterId: "char-1",
    quickActions: actions ?? [action({ id: "act-1" }), action({ id: "act-2", name: "Overclock", type: "toggle" })],
    quickbar: { slots: slots ?? [{ slotIndex: 0, characterActionId: "act-1", empty: false, missing: false }], maxSlots: 20, version: 3 },
  };
}

/* ── Tooltip (spec 16) ────────────────────────────────────────────────── */

test("16. tooltip model exposes type, description, cost, cooldown, target and the SERVER disabled reason", () => {
  const model = abilityTooltipModel(action({
    costs: { main: 1, move: 0, psi: 3, charges: 0 },
    cooldown: { current: 1, max: 2, unit: "turn" },
    state: { available: false, active: false, disabledReason: "Out of PSI", selectable: false },
  }));
  const flat = model.lines.map((l) => `${l.label}: ${l.value}`).join(" | ");
  assert.match(flat, /Type: Directed action/);
  assert.match(flat, /Cost: MAIN×1/);
  assert.match(flat, /Resource: PSI 3/);
  assert.match(flat, /Cooldown: 1\/2 turn\(s\) remaining/);
  assert.match(flat, /Target: One character/);
  assert.match(flat, /Unavailable: Out of PSI/, "server reason surfaced, never fabricated");
});

test("tooltip toggle shows Active status; available action has no Unavailable line", () => {
  const active = abilityTooltipLines(action({ type: "toggle", state: { available: true, active: true, disabledReason: null } }));
  assert.ok(active.some((l) => /Status: Active/.test(l)));
  const ok = abilityTooltipLines(action({ state: { available: true, active: false, disabledReason: null } }));
  assert.ok(!ok.some((l) => /Unavailable/.test(l)));
});

/* ── Quickbar strip render (spec 3, 8, 12, 17) ────────────────────────── */

test("3. strip renders a type marker per action type", () => {
  const html = renderQuickbarStrip(runtime([
    { slotIndex: 0, characterActionId: "a-atk", empty: false },
    { slotIndex: 1, characterActionId: "a-tgl", empty: false },
  ], [
    action({ id: "a-atk", type: "attack_technique", semanticKind: "attack" }),
    action({ id: "a-tgl", type: "toggle" }),
  ]));
  assert.match(html, /ATK/);
  assert.match(html, /TGL/);
});

test("8. an unavailable action tile is disabled in the normal HUD", () => {
  const html = renderQuickbarStrip(runtime(
    [{ slotIndex: 0, characterActionId: "act-2", empty: false }],
    [action({ id: "act-2", state: { available: false, active: false, disabledReason: "Cooldown: 2 turns" } })],
  ));
  assert.match(html, /is-disabled/);
});

test("12. a missing-reference slot renders visibly as missing", () => {
  const html = renderQuickbarStrip(runtime([{ slotIndex: 0, characterActionId: "gone", empty: false, missing: true }], [action({ id: "act-1" })]));
  assert.match(html, /is-missing/);
});

test("17. slots 0-9 render on the bottom row; slot 10+ render on an upper row (DOM order upper-first)", () => {
  const slots = [
    { slotIndex: 0, characterActionId: "act-1", empty: false },
    { slotIndex: 10, characterActionId: "act-2", empty: false },
  ];
  const html = renderQuickbarStrip(runtime(slots, [action({ id: "act-1" }), action({ id: "act-2" })]));
  const row1 = html.indexOf('data-row="1"');
  const row0 = html.indexOf('data-row="0"');
  assert.ok(row1 > -1 && row0 > -1, "both rows present");
  assert.ok(row1 < row0, "upper row (1) rendered before bottom row (0) → grows upward");
});

test("strip shows an EDIT button and empty-quickbar fallback", () => {
  assert.match(renderQuickbarStrip(runtime()), /data-action="open-quickbar-editor"/);
  const empty = renderQuickbarStrip({ ok: true, quickActions: [], quickbar: { slots: [], maxSlots: 20, version: 1 } });
  assert.match(empty, /No quickbar actions/);
});

/* ── SkillBlock fold + fallback (spec 15) ─────────────────────────────── */

test("SkillBlock renders the quickbar when snapshot.quickbar is present", () => {
  const state = {
    viewer: { role: "player" },
    snapshot: { quickbar: runtime() },
  };
  const html = renderSkillBlock(state);
  assert.match(html, /ohud-qb/);
  assert.match(html, /data-action="open-quickbar-editor"/);
});

test("15/backcompat. SkillBlock falls back to the legacy category view when no quickbar (mock path unaffected)", () => {
  const legacyState = {
    viewer: { role: "player" },
    snapshot: {}, // no quickbar
    ui: {},
  };
  // Must not throw and must not render the quickbar strip.
  const html = renderSkillBlock(legacyState);
  assert.ok(!/ohud-qb-wrap/.test(html), "no quickbar strip without runtime");
});

/* ── Editor render (spec E) ───────────────────────────────────────────── */

test("editor renders library, slots, Save/Cancel; Save disabled until dirty", () => {
  const rt = runtime();
  const draft = buildDraft(rt.quickbar.slots, new Set(rt.quickActions.map((a) => a.characterActionId)), 20);
  const library = unassignedActions(rt.quickActions, draft);
  const html = renderQuickbarEditor({ runtime: rt, draft, library, dirty: false });
  assert.match(html, /Available actions/);
  assert.match(html, /Quickbar slots/);
  assert.match(html, /data-action="qbe-save"/);
  assert.match(html, /data-action="qbe-cancel"/);
  // Save disabled when not dirty.
  assert.match(html, /data-action="qbe-save"[^>]*disabled/);
  // library cards are draggable and carry the action id.
  assert.match(html, /draggable="true"[^>]*data-qbe-action="act-2"/);
});

test("editor shows a version-conflict bar + Reload, and does not clobber silently", () => {
  const rt = runtime();
  const draft = buildDraft(rt.quickbar.slots, new Set(["act-1", "act-2"]), 20);
  const html = renderQuickbarEditor({ runtime: rt, draft, library: [], conflict: true, dirty: true });
  assert.match(html, /Layout changed on the server/);
  assert.match(html, /data-action="qbe-reload"/);
});

test("editor slot has a remove control; missing slot is flagged", () => {
  const rt = runtime([{ slotIndex: 0, characterActionId: "act-1", empty: false }], [action({ id: "act-1" })]);
  const draft = buildDraft(rt.quickbar.slots, new Set(["act-1"]), 20);
  assert.match(renderQuickbarEditor({ runtime: rt, draft, library: [], dirty: true }), /data-qbe-remove="0"/);
  const missDraft = buildDraft([{ slotIndex: 0, characterActionId: "ghost" }], new Set(["act-1"]), 20);
  assert.match(renderQuickbarEditor({ runtime: rt, draft: missDraft, library: [], dirty: true }), /is-missing/);
});

/* ── Wiring contract (spec 14, 15) ────────────────────────────────────── */

test("14. a normal click on an ability does NOT fire a combat RPC (only a benign toast)", () => {
  // The show-ability-detail handler must not send any combat-session / basic-attack
  // / execute command — it only shows a toast.
  const idx = moduleSrc.indexOf('case "show-ability-detail":');
  assert.ok(idx > -1, "handler exists");
  const block = moduleSrc.slice(idx, moduleSrc.indexOf("break;", idx));
  assert.ok(/showToast/.test(block), "shows detail toast");
  assert.ok(!/onCommand/.test(block), "never dispatches a command (no execution)");
});

test("open-quickbar-editor dispatches only the quickbar open-editor command", () => {
  const idx = moduleSrc.indexOf('case "open-quickbar-editor":');
  assert.ok(idx > -1);
  const block = moduleSrc.slice(idx, moduleSrc.indexOf("break;", idx));
  assert.ok(block.includes('feature: "quickbar"') && block.includes('type: "open-editor"'));
});

test("15. selectionState folds the abilities runtime into snapshot.quickbar (Skills only; Target/Action untouched)", () => {
  assert.ok(selectionStateSrc.includes("ephemeral.abilitiesRuntime"), "abilities runtime read");
  assert.ok(selectionStateSrc.includes("quickbar: ephemeral.abilitiesRuntime"), "folded into snapshot.quickbar");
  // The fold must not touch targeting or basicAttack.
  const foldIdx = selectionStateSrc.indexOf("quickbar: ephemeral.abilitiesRuntime");
  const around = selectionStateSrc.slice(foldIdx - 200, foldIdx + 200);
  assert.ok(!/targeting|basicAttack/.test(around), "quickbar fold is isolated from target/action state");
});

test("scene controller wires the quickbar controller (setup + selection change + ephemeral payload)", () => {
  assert.ok(sceneControllerSrc.includes("setupQuickbarController"));
  assert.ok(sceneControllerSrc.includes("quickbarController.onSelectionChanged"));
  assert.ok(sceneControllerSrc.includes("abilitiesRuntime,"), "passed into the broadcast ephemeral");
});

test("overlay controller owns the editor popover lifecycle (open/close, mode + teardown cleanup)", () => {
  assert.ok(overlayControllerSrc.includes("QUICKBAR_EDITOR_POPOVER_ID"));
  assert.ok(overlayControllerSrc.includes("setQuickbarEditorOpen"));
  assert.ok(overlayControllerSrc.includes('feature === "quickbar"'), "routes quickbar open/close");
  // Closed on collapse/editor mode and teardown (>=3 close calls).
  assert.ok((overlayControllerSrc.match(/OBR\.popover\.close\(QUICKBAR_EDITOR_POPOVER_ID\)/g) || []).length >= 3);
});

test("overlay page has a quickbar-editor route: subscribes to abilities, drag-drop, Save/Cancel/Reload", () => {
  assert.ok(overlayPageSrc.includes('moduleParam === "quickbar-editor"'));
  assert.ok(overlayPageSrc.includes("BC_HUD_ABILITIES"));
  assert.ok(overlayPageSrc.includes("assignActionToSlot") && overlayPageSrc.includes("moveSlot") && overlayPageSrc.includes("removeSlot"));
  assert.ok(overlayPageSrc.includes('type: "save-layout"'));
  assert.ok(overlayPageSrc.includes('type: "close-editor"'), "Cancel closes without save");
  assert.ok(overlayPageSrc.includes("draftToSavePayload"));
});

test("editor save sends the expected version from the layout the draft was built on", () => {
  assert.ok(overlayPageSrc.includes("expectedVersion: baseVersion"), "optimistic version travels with save");
  // Conflict handling: a server version change while editing sets conflict, not a silent overwrite.
  assert.ok(overlayPageSrc.includes("conflict = true"));
});

setTimeout(() => {
  console.log(`\nAbilities & Quickbar UI: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
