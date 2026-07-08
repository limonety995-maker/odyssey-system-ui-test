// Phase 4.1A.2 — Skills Block Runtime States & Ability Details.
//
// PURE render/logic tests over deriveSlotAvailability, the extended
// abilityRuntimeMapper fields, QuickbarView's slot markup, and
// AbilityDetailCard's content — plus source-contract checks over
// quickbarDetailCardController.js/CombatHudModule.js (DOM-touching, tested
// the same way every other OBR/DOM file in this suite is: reading the
// source text, never executing it in plain Node) and migration 101 (SQL,
// mirrors combat-session.test.mjs's own pattern for migration source).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mapQuickAction } from "../hud/abilities/abilityRuntimeMapper.js";
import { deriveSlotAvailability, SLOT_AVAILABILITY } from "../hud/abilities/abilityAvailabilityPolicy.js";
import { renderQuickbarStrip } from "../hud/abilities/QuickbarView.js";
import { renderAbilityDetailCard } from "../hud/abilities/AbilityDetailCard.js";
import { abilityTooltipModel } from "../hud/abilities/AbilityTooltip.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const read = (...seg) => fs.readFileSync(path.join(repoRoot, ...seg), "utf8").replace(/\r\n/g, "\n");
const sql101 = read("supabase", "101_quickbar_execution_availability.sql");
const controllerSrc = read("hud", "abilities", "quickbarDetailCardController.js");
const moduleSrc = read("hud", "components", "CombatHudModule.js");
const layoutCss = read("hud", "components", "combatHudLayout.css");
const selectionStateSrc = read("hud", "scene", "selectionState.js");

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

console.log("\nPhase 4.1A.2 — Skills Block Runtime States & Ability Details\n");

/* ── fixtures ─────────────────────────────────────────────────────────── */

function rawAction(over = {}) {
  return {
    characterActionId: over.id ?? "act-1",
    definitionId: "def-1",
    sourceType: over.sourceType ?? "psi",
    type: over.type ?? "attack_technique",
    name: over.name ?? "Ethric Strike",
    fullDescription: "Materialized psionic force projected against a target body part.",
    iconKey: "brain",
    semanticKind: over.semanticKind ?? "attack",
    targeting: over.targeting ?? { mode: "body_part", minTargets: 1, maxTargets: 1, allowAllies: false, allowSelf: false, requiresBodyZone: true },
    costs: over.costs ?? { main: 1, move: 0, psi: 1, charges: 0 },
    cooldown: over.cooldown ?? { current: 0, max: 0, unit: "turn" },
    state: over.state ?? { available: true, active: false, disabledReason: null, selectable: true, executionAvailable: true, executionReason: null, resourceSufficient: true },
    requirements: over.requirements ?? { weaponClass: null, weaponId: null, conditionSummary: null },
  };
}
function action(over = {}) {
  return mapQuickAction(rawAction(over));
}

function runtime(actions, slots) {
  return {
    ok: true, error: null, characterId: "char-1",
    quickActions: actions,
    quickbar: { slots: slots ?? actions.map((a, i) => ({ slotIndex: i, characterActionId: a.characterActionId, empty: false })), maxSlots: 20, version: 3 },
  };
}

/* ── 8. executionAvailable/executionReason are canonical (mapper) ──────── */

test("8. mapQuickAction copies executionAvailable/executionReason/resourceSufficient verbatim from the server row — never derived from the ability's name", () => {
  const mapped = mapQuickAction(rawAction({
    name: "Ethric Strike",
    state: { available: false, active: false, disabledReason: "Attack effect is not supported yet", selectable: false, executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true },
  }));
  assert.equal(mapped.state.executionAvailable, false);
  assert.equal(mapped.state.executionReason, "ACTION_EFFECT_NOT_IMPLEMENTED");
  // Renamed to something else entirely — the mapper must still trust the
  // server's executionAvailable/executionReason fields, proving it never
  // keys off action.name anywhere.
  const renamed = mapQuickAction(rawAction({
    name: "Totally Different Name",
    state: { available: false, active: false, disabledReason: "Attack effect is not supported yet", selectable: false, executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true },
  }));
  assert.equal(renamed.state.executionAvailable, false);
  assert.equal(renamed.state.executionReason, "ACTION_EFFECT_NOT_IMPLEMENTED");
});

test("8b. migration 101 derives executionAvailable/executionReason from odyssey_ability_level_defs columns (attack_damage_bonus/attack_armor_pierce/ignore_armor) — never from ad.name", () => {
  const execIdx = sql101.indexOf("as unsupported_effect");
  assert.ok(execIdx > -1);
  const block = sql101.slice(sql101.lastIndexOf("select (", execIdx), execIdx);
  assert.match(block, /ald\.attack_damage_bonus/);
  assert.match(block, /ald\.attack_armor_pierce/);
  assert.match(block, /ald\.ignore_armor/);
  assert.ok(!/ad\.name/.test(sql101.slice(sql101.indexOf("'executionAvailable'"), sql101.indexOf("'executionReason'") + 200)), "the executionAvailable/executionReason fields never reference the ability's display name");
  assert.ok(sql101.includes("'ACTION_EFFECT_NOT_IMPLEMENTED'"));
});

test("migration 101 also feeds cooldown and resource sufficiency into available/disabledReason — previously display-only", () => {
  assert.match(sql101, /and coalesce\(ca\.current_cooldown_rounds, 0\) <= 0/);
  assert.match(sql101, /and not coalesce\(res\.insufficient_pool, false\)/);
  assert.match(sql101, /and not coalesce\(res\.insufficient_charges, false\)/);
  assert.ok(sql101.includes("'resourceSufficient'"), "a structural boolean the client can read without parsing disabledReason text");
});

/* ── 5/6/7. cooldown / insufficient-resource / unsupported categorization ── */

test("5. a technique on cooldown categorizes as 'cooldown' and cannot be armed (available:false)", () => {
  const a = action({ cooldown: { current: 2, max: 3, unit: "turn" }, state: { available: false, disabledReason: "Cooldown: 2 turns", executionAvailable: true, executionReason: null, resourceSufficient: true, selectable: false, active: false } });
  assert.equal(deriveSlotAvailability(a, false), SLOT_AVAILABILITY.cooldown);
  assert.equal(a.state.available, false, "cooldown must make the ability unarmable, not just display-only");
});

test("6. an insufficient-PSI technique categorizes as 'insufficient_resource' and cannot be armed", () => {
  const a = action({ state: { available: false, disabledReason: "Not enough psi", executionAvailable: true, executionReason: null, resourceSufficient: false, selectable: false, active: false } });
  assert.equal(deriveSlotAvailability(a, false), SLOT_AVAILABILITY.insufficientResource);
  assert.equal(a.state.available, false);
});

test("7. a technique with an unsupported effect categorizes as 'unsupported', outranks cooldown/resource, and cannot be armed", () => {
  const a = action({
    cooldown: { current: 2, max: 3, unit: "turn" },
    state: { available: false, disabledReason: "Attack effect is not supported yet", executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: false, selectable: false, active: false },
  });
  assert.equal(deriveSlotAvailability(a, false), SLOT_AVAILABILITY.unsupported, "unsupported takes priority even when also on cooldown / resource-short");
});

test("4/armed priority: an armed technique always categorizes as 'armed', even if it has since gone invalid", () => {
  const invalidButArmed = action({ state: { available: false, disabledReason: "Attack effect is not supported yet", executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true, selectable: false, active: false } });
  assert.equal(deriveSlotAvailability(invalidButArmed, true), SLOT_AVAILABILITY.armed);
});

test("ready: an available technique with no cooldown/resource/effect issue categorizes as 'ready'", () => {
  assert.equal(deriveSlotAvailability(action(), false), SLOT_AVAILABILITY.ready);
});

test("a disabled-flag/dead/skip-turn reason (available:false, none of the structured signals set) categorizes as the generic 'unavailable'", () => {
  const a = action({ state: { available: false, disabledReason: "Ability is disabled", executionAvailable: true, executionReason: null, resourceSufficient: true, selectable: false, active: false } });
  assert.equal(deriveSlotAvailability(a, false), SLOT_AVAILABILITY.unavailable);
});

/* ── 1/2/3/4. Slot rendering: empty→editor, non-technique→detail, technique arm/disarm, armed marker ── */

test("1. an empty slot still dispatches open-quickbar-editor — unaffected by this phase", () => {
  const html = renderQuickbarStrip(runtime([action()], [{ slotIndex: 0, characterActionId: null, empty: true }]));
  assert.match(html, /data-action="open-quickbar-editor"/);
});

test("2. a filled non-attack_technique slot still dispatches show-ability-detail (never toggle-armed-technique), and never gets an is-armed/ARMED marker", () => {
  const html = renderQuickbarStrip(runtime([action({ type: "directed" })]));
  assert.match(html, /data-action="show-ability-detail"/);
  assert.ok(!html.includes("toggle-armed-technique"));
  assert.ok(!html.includes("is-armed"));
});

test("3. an occupied attack_technique slot still dispatches toggle-armed-technique — arm/disarm click wiring unchanged", () => {
  const html = renderQuickbarStrip(runtime([action()]));
  assert.match(html, /data-action="toggle-armed-technique"/);
});

test("4. an armed technique's slot carries is-armed, data-slot-state=\"armed\", and a readable ARMED text marker (not just the border)", () => {
  const html = renderQuickbarStrip(runtime([action()]), { armedActionId: "act-1" });
  assert.match(html, /class="[^"]*\bis-armed\b[^"]*"[^>]*data-slot-state="armed"/);
  assert.match(html, /ohud-qb-state--armed">ARMED</);
});

test("cooldown/insufficient-resource/unsupported slots render is-disabled + the matching data-slot-state + their own compact marker (CD n / resource label / lock icon), without touching the click wiring", () => {
  const cd = renderQuickbarStrip(runtime([action({ cooldown: { current: 2, max: 3, unit: "turn" }, state: { available: false, disabledReason: "Cooldown: 2 turns", executionAvailable: true, executionReason: null, resourceSufficient: true, selectable: false, active: false } })]));
  assert.match(cd, /is-disabled/);
  assert.match(cd, /data-slot-state="cooldown"/);
  assert.match(cd, /ohud-qb-cd">2</);

  const res = renderQuickbarStrip(runtime([action({ costs: { main: 1, move: 0, psi: 3, charges: 0 }, state: { available: false, disabledReason: "Not enough psi", executionAvailable: true, executionReason: null, resourceSufficient: false, selectable: false, active: false } })]));
  assert.match(res, /data-slot-state="insufficient_resource"/);
  assert.match(res, /ohud-qb-state--resource">PSI 3/);

  // Phase 4.1B.0: an attack_technique with executionReason:
  // ACTION_EFFECT_NOT_IMPLEMENTED is now direct-attack-eligible (see
  // scripts/direct-ability-attack.test.mjs test 5) — it no longer renders
  // through this "locked/unsupported" path in the quickbar. This scenario
  // uses a non-technique type instead, to keep exercising the ORIGINAL,
  // still-fully-valid "unsupported" lock-icon rendering for actions that
  // stay on the show-ability-detail (never execute/arm) click path.
  const unsup = renderQuickbarStrip(runtime([action({ type: "directed", state: { available: false, disabledReason: "Attack effect is not supported yet", executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true, selectable: false, active: false } })]));
  assert.match(unsup, /data-slot-state="unsupported"/);
  assert.match(unsup, /ohud-qb-state--lock/);
  assert.match(unsup, /data-action="show-ability-detail"/);
  // Click wiring for the two still-armable technique slots is untouched.
  for (const html of [cd, res]) assert.match(html, /data-action="toggle-armed-technique"/);
});

/* ── 9/10. Detail card content: human-readable, no raw ids/JSON/internal data ── */

test("9. the detail card shows the canonical executionReason as human-readable text, never the raw code", () => {
  // Phase 4.1B.0: an attack_technique with this exact executionReason is now
  // direct-attack-eligible (see scripts/direct-ability-attack.test.mjs test
  // 8/deriveDirectAttackAvailability) and shows its OWN status text instead —
  // this test uses a non-technique type to keep exercising the ORIGINAL,
  // still-fully-valid "unsupported executionReason" text mapping for actions
  // that are not direct-attack-eligible.
  const a = action({ type: "directed", state: { available: false, disabledReason: "Attack effect is not supported yet", executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true, selectable: false, active: false } });
  const html = renderAbilityDetailCard(a);
  assert.match(html, /Attack effect is not supported yet\./);
  assert.ok(!html.includes("ACTION_EFFECT_NOT_IMPLEMENTED"), "the raw code itself is never shown");
  assert.match(html, />Status:/, "labeled Status, not Unavailable, for an execution-reason case");
});

test("10. the detail card never shows internal ids, raw effect JSON, or fields outside AbilityTooltip's whitelist", () => {
  const a = action();
  const html = renderAbilityDetailCard(a);
  assert.ok(!html.includes(a.characterActionId), "characterActionId never rendered");
  assert.ok(!html.includes(a.definitionId), "definitionId never rendered");
  assert.ok(!/[{}]/.test(html.replace(/style="[^"]*"/g, "")), "no raw JSON braces leak into the card body");
});

test("the detail card shows the armed status line when opts.armed is true, and the model's own status when it isn't", () => {
  const armedHtml = renderAbilityDetailCard(action(), { armed: true });
  assert.match(armedHtml, /Prepared for next attack/);
  const plainHtml = renderAbilityDetailCard(action(), { armed: false });
  assert.ok(!plainHtml.includes("Prepared for next attack"));
});

test("the detail card's empty-state never crashes on null and shows an honest placeholder", () => {
  const html = renderAbilityDetailCard(null);
  assert.match(html, /No action selected\./);
});

/* ── 11. Hover/focus never triggers arm/disarm; click still does ───────── */

test("11. hover/focus handlers only ever call detailCard.scheduleOpen — never integration.onCommand — so they can't interfere with click's arm/disarm", () => {
  for (const fnName of ["onSlotDetailOver", "onSlotDetailFocusIn"]) {
    const idx = moduleSrc.indexOf(`function ${fnName}(`);
    assert.ok(idx > -1, `${fnName} exists`);
    const block = moduleSrc.slice(idx, moduleSrc.indexOf("\n  }", idx));
    assert.ok(block.includes("detailCard.scheduleOpen"), `${fnName} schedules the card`);
    assert.ok(!block.includes("onCommand"), `${fnName} never dispatches a command`);
  }
});

test("the toggle-armed-technique click case is unchanged by the hover/focus wiring — same is-disabled/is-armed gate as before", () => {
  const idx = moduleSrc.indexOf('case "toggle-armed-technique":');
  const block = moduleSrc.slice(idx, moduleSrc.indexOf("case \"disarm-technique\"", idx));
  assert.ok(block.includes('classList.contains("is-armed")'));
  assert.ok(block.includes('classList.contains("is-disabled")'));
  assert.ok(block.includes('type: "toggle-armed"'));
});

/* ── 12. Safe dismiss: grace timer + cancelClose on card re-entry ──────── */

test("12. the detail card controller exposes scheduleClose/cancelClose (grace-period close, not instant) — see ability-detail-card-placement.test.mjs for where the grace window itself now lives (the background controller, since the card is its own popover)", () => {
  assert.match(controllerSrc, /function scheduleClose\(\)/);
  assert.match(controllerSrc, /function cancelClose\(\)/);
  assert.match(controllerSrc, /sendCommand\(\{ type: "maybe-hide" \}\)/);
  assert.match(controllerSrc, /sendCommand\(\{ type: "cancel-hide" \}\)/);
});

test("keyboard focus keeps the card open the same way hover does (focusin schedules, focusout schedules a close) — a tabbed-to slot behaves consistently with a hovered one", () => {
  assert.match(moduleSrc, /el\.addEventListener\("focusin", onSlotDetailFocusIn\)/);
  assert.match(moduleSrc, /el\.addEventListener\("focusout", onSlotDetailFocusOut\)/);
});

test("the detail card controller is torn down on unmount — no leaked listeners/timers across module remounts", () => {
  const unmountIdx = moduleSrc.indexOf("unmount()");
  const block = moduleSrc.slice(unmountIdx, moduleSrc.indexOf("},", unmountIdx));
  assert.ok(block.includes("detailCard.destroy()"));
  assert.ok(block.includes("onSlotDetailOver") && block.includes("onSlotDetailFocusOut"));
});

/* ── 13. Slot numbering / row layout unaffected ─────────────────────────── */

test("13. slot row layout (1-10 top, 11-20 bottom) is untouched — new states render inside the SAME row structure", () => {
  const slots = [];
  for (let i = 0; i < 12; i++) slots.push({ slotIndex: i, characterActionId: i === 10 ? "act-1" : null, empty: i !== 10 });
  const html = renderQuickbarStrip(runtime([action({ id: "act-1" })], slots));
  assert.match(html, /data-row="0"[^]*data-row="1"/);
});

/* ── 15. ARMED panel never shows a stale entry after disarm ─────────────── */

test("15. selectionState only folds an ARMED modifiers.active entry when ephemeral.armedActionId is actually set — disarming (armedActionId becomes null) means no stale entry is folded", () => {
  const idx = selectionStateSrc.indexOf("const armedActionId = ephemeral.armedActionId");
  assert.ok(idx > -1);
  const block = selectionStateSrc.slice(idx, idx + 400);
  assert.match(block, /if \(armedActionId\) \{/, "the whole armed-modifier fold is gated on a non-null armedActionId — null (disarmed) folds nothing");
});

/* ── 17. Responsive typography floors for slot markers + detail card ───── */

test("17. slot state markers (.ohud-qb-cd/.ohud-qb-active/.ohud-qb-state) use --ohud-slot-marker-ratio, a SEPARATE, tighter-capped instance of computeCriticalTextRatio than the main critical-text-ratio", () => {
  for (const selector of [".ohud-qb-cd {", ".ohud-qb-active {", ".ohud-qb-state {"]) {
    const idx = layoutCss.indexOf(selector);
    assert.ok(idx > -1, `${selector} exists`);
    const rule = layoutCss.slice(idx, layoutCss.indexOf("}", idx));
    assert.match(rule, /font-size:\s*calc\(var\(--ohud-font-10\) \* var\(--ohud-slot-marker-ratio, 1\)\)/);
  }
  assert.match(moduleSrc, /computeCriticalTextRatio\(scale,\s*1\.5\)/, "the slot-marker ratio uses a tighter cap than the default (3x)");
});

test("17b. the Ability Detail Card's name/body text meet the section-G floors (16px name, 14px body — the original 14px/12px floors +2px typography pass) via a scoped override — the Quickbar Editor's own (unscoped) rule is untouched", () => {
  assert.match(layoutCss, /\.ohud-qbe-desc--card \.ohud-qbe-desc-name \{ font-size: var\(--ohud-font-14\); \}/);
  assert.match(layoutCss, /\.ohud-qbe-desc--card \.ohud-qbe-desc-text,\s*\n\.ohud-qbe-desc--card \.ohud-qbe-desc-pill,\s*\n\.ohud-qbe-desc--card \.ohud-qbe-desc-status \{ font-size: var\(--ohud-font-12\); \}/);
  // The base (editor) rule is unchanged — still its original, smaller size.
  assert.match(layoutCss, /^\.ohud-qbe-desc-name \{ font-size: var\(--ohud-font-13\)/m);
});

test("the detail card is its own companion popover (bug fix) — it never reads the module-canvas typography ratio variables, since it isn't wrapped in that transform at all; see ability-detail-card-placement.test.mjs for the full architecture coverage", () => {
  assert.ok(!controllerSrc.includes("--ohud-critical-text-ratio") && !controllerSrc.includes("--ohud-slot-marker-ratio"));
});

console.log("");
setTimeout(() => {
  console.log(`\nPhase 4.1A.2 — Skills Block Runtime States & Ability Details: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
