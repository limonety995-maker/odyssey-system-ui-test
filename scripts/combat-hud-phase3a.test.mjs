// Combat HUD — Phase 3A verification (scene selection + active character binding).
//
// Pure: no DOM, no OBR, no Supabase, no real fetch. Fake fetchers (incl. delayed
// promises for the stale-response race) drive the pure adapter + state reducer.
//   node scripts/combat-hud-phase3a.test.mjs

import assert from "node:assert/strict";

import {
  SELECTION_STATUS,
  ACCESS_REASON,
  SECONDARY_MODULE_IDS,
  deriveSelectionState,
  buildBroadcastPayload,
  normalizeSelectionPayload,
  normalizeViewer,
  createGenerationGate,
} from "../hud/scene/selectionState.js";
import { createSceneSelectionAdapter } from "../hud/scene/sceneSelectionAdapter.js";
import { renderSelectionModule } from "../hud/scene/selectionView.js";
import {
  splitSkillRows,
  defaultLayoutState,
  setModulePlacement,
  writeStoredLayout,
  readStoredLayout,
} from "../hud/overlay/hudLayout.js";

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => { passed += 1; console.log(`  ✓ ${name}`); })
    .catch((error) => { failed += 1; failures.push({ name, error }); console.error(`  ✗ ${name}\n      ${error.message}`); });
}

function fakeStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, _map: map };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const PLAYER = { playerId: "p1", role: "PLAYER" };
const GM = { playerId: "gm1", role: "GM" };

/** A scene-token-links result with one active link for `tokenId`. */
function linkResult(tokenId, characterId = "c1", name = "Vega") {
  return { ok: true, links: [{ token_id: tokenId, is_active: true, character: { id: characterId, display_name: name } }] };
}
/** A runtime bundle with the given owner. */
function bundle({ owner = "p1", ownerName = "Alice", name = "Vega", alive = true, conscious = true } = {}) {
  return {
    ok: true,
    character: { owner_player_id: owner, owner_player_name: ownerName, display_name: name, character_key: "VEGA" },
    state: { is_alive: alive, is_conscious: conscious, status_summary: "Alive | Conscious" },
  };
}

function makeAdapter({ viewer = PLAYER, link, runtime, backendConfigured = true, onLink, onBundle } = {}) {
  return createSceneSelectionAdapter({
    backendConfigured,
    getViewer: () => viewer,
    fetchSceneTokenLink: async (tokenId) => { if (onLink) onLink(tokenId); return typeof link === "function" ? link(tokenId) : (link ?? linkResult(tokenId)); },
    fetchCharacterBundle: async (characterId) => { if (onBundle) onBundle(characterId); return typeof runtime === "function" ? runtime(characterId) : (runtime ?? bundle()); },
  });
}

console.log("\nCombat HUD — Phase 3A verification\n");

test("1. one selected linked owned token → ready", async () => {
  const a = makeAdapter({ viewer: PLAYER, runtime: bundle({ owner: "p1" }) });
  const s = await a.resolve(["tokenA"]);
  assert.equal(s.status, SELECTION_STATUS.ready);
  assert.equal(s.access.canView, true);
  assert.equal(s.characterId, "c1");
  assert.equal(s.view.name, "Vega");
  assert.equal(s.view.gmView, false);
});

test("2. one selected linked token (GM) → ready + GM view", async () => {
  const a = makeAdapter({ viewer: GM, runtime: bundle({ owner: "someoneElse" }) });
  const s = await a.resolve(["tokenA"]);
  assert.equal(s.status, SELECTION_STATUS.ready);
  assert.equal(s.access.canView, true);
  assert.equal(s.view.gmView, true);
});

test("3. nothing selected → no-selection", async () => {
  const a = makeAdapter();
  const s = await a.resolve([]);
  assert.equal(s.status, SELECTION_STATUS.noSelection);
  assert.equal(s.access.reason, ACCESS_REASON.noToken);
});

test("4. multiple tokens → multiple-selection (no backend call)", async () => {
  let linkCalls = 0;
  const a = makeAdapter({ onLink: () => { linkCalls += 1; } });
  const s = await a.resolve(["a", "b"]);
  assert.equal(s.status, SELECTION_STATUS.multipleSelection);
  assert.equal(linkCalls, 0, "must not query the backend for a multi-selection");
});

test("5. token without a link → unlinked-token", async () => {
  const a = makeAdapter({ link: { ok: true, links: [] } });
  const s = await a.resolve(["tokenA"]);
  assert.equal(s.status, SELECTION_STATUS.unlinkedToken);
  assert.equal(s.access.reason, ACCESS_REASON.noLink);
});

test("6. foreign character for a player → not-owned (no data revealed)", async () => {
  const a = makeAdapter({ viewer: PLAYER, runtime: bundle({ owner: "p2" }) });
  const s = await a.resolve(["tokenA"]);
  assert.equal(s.status, SELECTION_STATUS.notOwned);
  assert.equal(s.access.canView, false);
  const payload = buildBroadcastPayload(s);
  assert.equal(payload.view, null, "not-owned must not broadcast character data");
  assert.equal(payload.characterId, null, "not-owned must not leak character id");
});

test("7. runtime API error → error", async () => {
  const a = makeAdapter({ runtime: () => { throw new Error("boom"); } });
  const s = await a.resolve(["tokenA"]);
  assert.ok(s.status === SELECTION_STATUS.error || s.status === SELECTION_STATUS.unavailable);
  assert.equal(s.error.code, "RUNTIME_FETCH_FAILED");
});

test("8. bundle without owner_player_id → unavailable (no name-based check)", async () => {
  const noOwner = { ok: true, character: { owner_player_name: "Alice", display_name: "Vega" }, state: {} };
  const a = makeAdapter({ viewer: { playerId: "Alice", role: "PLAYER" }, runtime: noOwner });
  const s = await a.resolve(["tokenA"]);
  assert.equal(s.status, SELECTION_STATUS.unavailable, "must not match by owner_player_name even if it equals the viewer id");
  assert.equal(s.access.reason, ACCESS_REASON.ownershipUnverifiable);
});

test("9. race: late response for an old selection is discarded (latest wins)", async () => {
  // tokenA resolves SLOW, tokenB resolves FAST. We start A then B.
  const a = createSceneSelectionAdapter({
    backendConfigured: true,
    getViewer: () => PLAYER,
    fetchSceneTokenLink: async (tokenId) => linkResult(tokenId, tokenId === "A" ? "cA" : "cB", tokenId),
    fetchCharacterBundle: async (characterId) => { await wait(characterId === "cA" ? 60 : 5); return bundle({ owner: "p1", name: characterId }); },
  });
  const pA = a.resolveLatest(["A"]); // generation 1 (slow)
  const pB = a.resolveLatest(["B"]); // generation 2 (fast)
  const [rA, rB] = await Promise.all([pA, pB]);
  assert.equal(rB.stale, false, "newest selection (B) must be current");
  assert.equal(rA.stale, true, "older selection (A) must be discarded");
  assert.equal(rB.state.view.name, "cB");
});

test("9b. generation gate isolates concurrent epochs", () => {
  const gate = createGenerationGate();
  const t1 = gate.next();
  const t2 = gate.next();
  assert.equal(gate.isCurrent(t1), false);
  assert.equal(gate.isCurrent(t2), true);
});

test("10. invalid selection hides Gun / Skills / Combat Control / Log", () => {
  for (const status of [SELECTION_STATUS.noSelection, SELECTION_STATUS.notOwned, SELECTION_STATUS.unlinkedToken, SELECTION_STATUS.unavailable]) {
    const payload = buildBroadcastPayload(deriveSelectionState({ viewer: PLAYER, selectionIds: status === SELECTION_STATUS.noSelection ? [] : ["t"], link: status === SELECTION_STATUS.unlinkedToken ? null : { characterId: "c1" }, bundle: status === SELECTION_STATUS.notOwned ? bundle({ owner: "p2" }) : (status === SELECTION_STATUS.unavailable ? { ok: false } : undefined) }));
    for (const id of SECONDARY_MODULE_IDS) {
      assert.ok(renderSelectionModule(id, payload).includes("ohud-panel--muted"), `${id} muted for ${status}`);
    }
  }
  // Player always renders a prompt (never blank) for non-ready states.
  const noSel = buildBroadcastPayload(deriveSelectionState({ viewer: PLAYER, selectionIds: [] }));
  assert.ok(renderSelectionModule("player", noSel).includes("SELECT YOUR CHARACTER"));
});

test("11. valid selection — player shows real name; secondaries use real blocks, no mock data", () => {
  const payload = buildBroadcastPayload(deriveSelectionState({ viewer: PLAYER, selectionIds: ["t"], link: { characterId: "c1" }, bundle: bundle({ owner: "p1" }) }));
  // Player: shows name from the runtime bundle (Phase 3A.1: via renderPlayerBlock).
  assert.ok(renderSelectionModule("player", payload).includes("Vega"), "player shows name");
  for (const id of SECONDARY_MODULE_IDS) {
    const html = renderSelectionModule(id, payload);
    // Open (not muted) when ready.
    assert.ok(!html.includes("ohud-panel--muted"), `${id} not muted when ready`);
    // Phase 3A.1: real block renderers replace the old placeholder.
    assert.ok(!html.includes("Runtime data wiring"), `${id} no Phase-3+ placeholder`);
    // No fabricated mock values (minimal bundle has no armory/abilities).
    assert.ok(!html.includes("AR-7"),          `${id} no mock weapon name`);
    assert.ok(!html.includes("Precision Shot"), `${id} no mock skill name`);
  }
});

test("12. selection updates never touch the v2 layout localStorage", async () => {
  const store = fakeStorage();
  let layout = setModulePlacement(defaultLayoutState(), "combatControl", { mode: "custom", x: 0.4, y: 0.3 });
  writeStoredLayout(store, layout);
  const before = store.getItem("odyssey.hud.layout.v2");
  // Resolve several selections through the adapter.
  const a = makeAdapter({ viewer: PLAYER, runtime: bundle({ owner: "p1" }) });
  await a.resolveLatest(["tokenA"]);
  await a.resolveLatest([]);
  await a.resolveLatest(["tokenB"]);
  assert.equal(store.getItem("odyssey.hud.layout.v2"), before, "layout storage must be untouched by selection");
  assert.deepEqual(readStoredLayout(store).modules.combatControl, { mode: "custom", x: 0.4, y: 0.3 });
  // The selection state carries no layout/module-position fields.
  const s = await a.resolve(["tokenA"]);
  assert.equal(s.modules, undefined);
  assert.equal(buildBroadcastPayload(s).modules, undefined);
});

test("13. skills rule unchanged: ≤10 in row 1, 11+ wrap to a second row", () => {
  const ten = Array.from({ length: 10 }, (_, i) => i);
  assert.equal(splitSkillRows(ten).length, 1);
  assert.equal(splitSkillRows(ten)[0].length, 10);
  const eleven = Array.from({ length: 11 }, (_, i) => i);
  const rows = splitSkillRows(eleven);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, 10);
  assert.equal(rows[1].length, 1);
});

test("14. backend unconfigured → unavailable (never silently mock)", async () => {
  const a = makeAdapter({ backendConfigured: false });
  const s = await a.resolve(["tokenA"]);
  assert.equal(s.status, SELECTION_STATUS.unavailable);
  assert.equal(s.access.reason, ACCESS_REASON.backendUnconfigured);
});

test("15. broadcast payload trims the runtime bundle; normalize round-trips", () => {
  const s = deriveSelectionState({ viewer: PLAYER, selectionIds: ["t"], link: { characterId: "c1" }, bundle: bundle({ owner: "p1" }) });
  assert.ok(s.runtimeBundle, "internal state keeps the bundle");
  const payload = buildBroadcastPayload(s);
  assert.equal(payload.runtimeBundle, undefined, "wire payload must not carry the full bundle");
  assert.equal(payload.view.name, "Vega");
  const round = normalizeSelectionPayload(payload);
  assert.equal(round.status, SELECTION_STATUS.ready);
  assert.equal(round.view.name, "Vega");
  assert.equal(normalizeSelectionPayload(null), null);
  assert.equal(normalizeViewer({ role: "gm" }).role, "GM");
  assert.equal(normalizeViewer({}).role, "UNKNOWN");
});

// Summary (deferred so all async tests settle first).
setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    for (const f of failures) { console.error(`FAILED: ${f.name}`); console.error(f.error); }
    process.exit(1);
  }
}, 300);
