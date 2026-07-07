// Priority UI Fix — Universal Responsive HUD Scaling.
//
// PURE tests over hud/overlay/hudLayout.js's projection math across the 8
// required viewports, plus source-contract checks over
// combatHudOverlayController.js (viewport polling / single coherent update —
// an OBR-SDK-importing background-context file, tested the same way
// combat-session.test.mjs/attack-technique-armed.test.mjs already test such
// files: by reading the source text, never by importing/executing it) and
// hud/components/CombatHudModule.js (the internal-canvas transform).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  HUD_LAYOUT_REFERENCE_VIEWPORT,
  DEFAULT_HUD_LAYOUT_V2,
  HUD_MODULE_IDS,
  LAYOUT_STORAGE_KEY,
  computeLayoutScale,
  defaultModuleRect,
  moduleSize,
  normalizedToPixels,
  pixelsToNormalized,
  clampRect,
  resolveModuleRect,
  rectsOverlap,
  defaultLayoutState,
  setModulePlacement,
  readStoredLayout,
  writeStoredLayout,
  serializeLayoutState,
} from "../hud/overlay/hudLayout.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const read = (...seg) => fs.readFileSync(path.join(repoRoot, ...seg), "utf8").replace(/\r\n/g, "\n");
const controllerSrc = read("hud", "overlay", "combatHudOverlayController.js");
const moduleSrc = read("hud", "components", "CombatHudModule.js");

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

function fakeStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}

console.log("\nPriority UI Fix — Universal Responsive HUD Scaling\n");

/* ── The 8 required viewports (section I) ──────────────────────────────── */

const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720 },
  { name: "1366x768", w: 1366, h: 768 },
  { name: "1536x864", w: 1536, h: 864 },
  { name: "1600x900", w: 1600, h: 900 },
  { name: "1920x1080 (reference)", w: 1920, h: 1080 },
  { name: "2560x1440", w: 2560, h: 1440 },
  { name: "3440x1440 ultrawide", w: 3440, h: 1440 },
  { name: "3840x2160 4K", w: 3840, h: 2160 },
];

const { width: RW, height: RH } = HUD_LAYOUT_REFERENCE_VIEWPORT;

/* ── 1/9/10. One uniform scale factor drives every module's every dimension ── */

test("1/9/10. every module's width, height, and left all scale by the EXACT SAME factor at every required viewport", () => {
  for (const { name, w, h } of VIEWPORTS) {
    const scale = computeLayoutScale(w, h);
    for (const id of HUD_MODULE_IDS) {
      const def = DEFAULT_HUD_LAYOUT_V2[id];
      const rect = defaultModuleRect(id, w, h);
      const size = moduleSize(id, w, h);
      assert.equal(rect.width, Math.round(def.width * scale), `${name} ${id}.width`);
      assert.equal(rect.height, Math.round(def.height * scale), `${name} ${id}.height`);
      assert.equal(rect.left, Math.round(def.left * scale), `${name} ${id}.left uses the same scale as width/height`);
      assert.deepEqual(size, { width: rect.width, height: rect.height }, `${name} ${id}: moduleSize and defaultModuleRect agree — one source of truth for outer popover dims AND the internal-canvas transform ratio`);
    }
  }
});

/* ── 2/3/4. Uncapped in both directions, no artificial minimum ─────────── */

test("2. scale is never capped at 1 — viewports above the reference upscale", () => {
  for (const { name, w, h } of VIEWPORTS) {
    if (w > RW && h > RH) {
      assert.ok(computeLayoutScale(w, h) > 1, `${name} must upscale (>1)`);
    }
  }
  assert.ok(computeLayoutScale(2560, 1440) > 1);
  assert.ok(computeLayoutScale(3840, 2160) > 1);
});

test("3. the HUD shrinks below the 1920×1080 reference", () => {
  for (const w of [1280, 1366, 1536, 1600]) {
    const scale = computeLayoutScale(w, Math.round(w * (9 / 16)));
    assert.ok(scale < 1, `${w} width must shrink the HUD`);
    assert.ok(scale > 0, "never a zero or negative scale, however small the viewport");
  }
});

test("4. the HUD grows above the 1920×1080 reference — including ultrawide, where height is the limiting axis", () => {
  assert.ok(computeLayoutScale(2560, 1440) > 1);
  assert.ok(computeLayoutScale(3840, 2160) > 1);
  const ultrawideScale = computeLayoutScale(3440, 1440);
  assert.ok(ultrawideScale > 1, "ultrawide still upscales — the HUD is not left tiny just because width is huge");
  assert.ok(Math.abs(ultrawideScale - (1440 / RH)) < 1e-9, "height (not the huge width) is the limiting axis on ultrawide — no stretching to fill the extra horizontal space");
});

/* ── 5. Every projected rect stays inside the safe viewport ────────────── */

test("5. every module's rect stays fully inside its own viewport, at every required resolution", () => {
  for (const { name, w, h } of VIEWPORTS) {
    for (const id of HUD_MODULE_IDS) {
      const rect = resolveModuleRect(id, { mode: "default" }, w, h);
      assert.ok(rect.left >= 0 && rect.left + rect.width <= w, `${name} ${id} x within [0,${w}]`);
      assert.ok(rect.top >= 0 && rect.top + rect.height <= h, `${name} ${id} y within [0,${h}]`);
    }
  }
});

/* ── 6/7. Only the intentional Player/Gun overlap; no others ──────────── */

test("6/7. Player/Gun keep their intentional overlap; Skills/CombatControl/Log never overlap each other, at every required resolution", () => {
  for (const { name, w, h } of VIEWPORTS) {
    const rects = {};
    for (const id of HUD_MODULE_IDS) rects[id] = resolveModuleRect(id, { mode: "default" }, w, h);

    assert.ok(rectsOverlap(rects.player, rects.gun), `${name}: player/gun must still overlap`);

    const nonOverlapping = ["skills", "combatControl", "log"];
    for (let i = 0; i < nonOverlapping.length; i++) {
      for (let j = i + 1; j < nonOverlapping.length; j++) {
        assert.ok(
          !rectsOverlap(rects[nonOverlapping[i]], rects[nonOverlapping[j]]),
          `${name}: ${nonOverlapping[i]} and ${nonOverlapping[j]} must not overlap`,
        );
      }
    }
    // And none of those three ever overlap Player or Gun either — the ONLY
    // permitted intersection anywhere in the composition is player/gun.
    for (const id of nonOverlapping) {
      assert.ok(!rectsOverlap(rects[id], rects.player), `${name}: ${id} must not overlap player`);
      assert.ok(!rectsOverlap(rects[id], rects.gun), `${name}: ${id} must not overlap gun`);
    }
  }
});

/* ── 8. Logical layout proportions never change ────────────────────────── */

test("8. each module's own aspect ratio (width/height) is identical to the canonical design at every viewport — uniform scale never stretches one axis independently", () => {
  for (const { name, w, h } of VIEWPORTS) {
    for (const id of HUD_MODULE_IDS) {
      const def = DEFAULT_HUD_LAYOUT_V2[id];
      const rect = defaultModuleRect(id, w, h);
      const canonicalRatio = def.width / def.height;
      const projectedRatio = rect.width / rect.height;
      // Width/height each round to the nearest px independently, so a couple
      // of percent of drift at small absolute sizes is expected rounding
      // noise, not a real stretch — this catches an actual independent-axis
      // stretch (which would be a much larger, systematic deviation).
      assert.ok(Math.abs(canonicalRatio - projectedRatio) / canonicalRatio < 0.03, `${name} ${id} aspect ratio drifted (${canonicalRatio} vs ${projectedRatio})`);
    }
  }
});

/* ── 11. Exact canonical match at 1920×1080 ─────────────────────────────── */

test("11. at exactly 1920×1080, every projected rect matches the canonical layout byte-for-byte", () => {
  assert.equal(computeLayoutScale(RW, RH), 1);
  for (const id of HUD_MODULE_IDS) {
    const def = DEFAULT_HUD_LAYOUT_V2[id];
    assert.deepEqual(defaultModuleRect(id, RW, RH), {
      left: def.left,
      top: RH - def.bottom - def.height,
      width: def.width,
      height: def.height,
      zIndex: def.zIndex,
    }, `${id} must be pixel-identical to the canonical design at the reference viewport`);
  }
});

/* ── 12. Resize small → large → small re-derives correctly, statelessly ── */

test("12. resizing small → large → small produces the exact same result each time it revisits a size — pure recomputation, no drift, no need to reopen the room", () => {
  const small = defaultModuleRect("combatControl", 1280, 720);
  const large = defaultModuleRect("combatControl", 3840, 2160);
  const smallAgain = defaultModuleRect("combatControl", 1280, 720);
  assert.deepEqual(small, smallAgain, "returning to the same viewport size gives byte-identical geometry — no accumulated drift");
  assert.notDeepEqual(small, large, "sanity: the two sizes are actually different");
});

/* ── 13/14. Stored layout is logical, never viewport/scale-specific ────── */

test("13. an existing stored (pre-this-feature) layout is read purely as logical normalized fractions and projects correctly at every viewport", () => {
  const store = fakeStorage({
    [LAYOUT_STORAGE_KEY]: JSON.stringify({ version: 2, modules: { ...defaultLayoutState().modules, log: { mode: "custom", x: 0.5, y: 0.5 } } }),
  });
  const layout = readStoredLayout(store);
  assert.equal(layout.modules.log.mode, "custom");
  for (const { w, h } of VIEWPORTS) {
    const rect = resolveModuleRect("log", layout.modules.log, w, h);
    assert.ok(rect.left >= 0 && rect.left + rect.width <= w, `log stays on-screen at ${w}x${h}`);
    assert.ok(rect.top >= 0 && rect.top + rect.height <= h);
  }
});

test("14. the persisted layout NEVER contains a scale, width, height, or viewport field — only mode/x/y per module", () => {
  const layout = setModulePlacement(defaultLayoutState(), "skills", { mode: "custom", x: 0.42, y: 0.13 });
  const serialized = JSON.parse(serializeLayoutState(layout));
  for (const id of HUD_MODULE_IDS) {
    assert.deepEqual(Object.keys(serialized.modules[id]).sort(), ["mode", "x", "y"]);
  }
  assert.ok(!("scale" in serialized), "no top-level scale field either");
  const store = fakeStorage();
  writeStoredLayout(store, layout);
  assert.ok(!/scale|viewport|vw|vh/i.test(store.getItem(LAYOUT_STORAGE_KEY)), "the raw persisted JSON string never mentions scale/viewport at all");
});

/* ── 15/16. Arrange HUD: pointer coords → logical, never scaled screen px ── */

test("15/16. pixelsToNormalized (what the Arrange HUD editor's drag handler calls on every pointermove) returns a viewport-independent fraction, and normalizedToPixels round-trips it back correctly at both a tiny and a huge viewport", () => {
  for (const { name, w, h } of [{ name: "1280x720", w: 1280, h: 720 }, { name: "3840x2160", w: 3840, h: 2160 }]) {
    const start = { mode: "custom", x: 0.3, y: 0.75 };
    const px = normalizedToPixels("gun", start, w, h);
    // The editor's own drag handler clamps to on-screen pixels before storing —
    // mirrored here with the same clampRect() it actually calls.
    const clamped = clampRect(px, w, h);
    const back = pixelsToNormalized("gun", clamped.left, clamped.top, w, h);
    assert.ok(Math.abs(back.x - start.x) < 0.01, `${name} x round-trips (${back.x} ~ ${start.x})`);
    assert.ok(Math.abs(back.y - start.y) < 0.01, `${name} y round-trips (${back.y} ~ ${start.y})`);
    // And the stored fraction itself never encodes screen pixels or a scale —
    // it's a plain 0..1 number regardless of how large px.left/px.top were.
    assert.ok(back.x >= 0 && back.x <= 1 && back.y >= 0 && back.y <= 1);
  }
});

/* ── 17. Central controller: single poll loop, one coherent update, no leaks ── */

test("17. combatHudOverlayController.js owns exactly ONE viewport-poll interval, registered for cleanup exactly once — no duplicate timers, no listener leak on repeated start/stop", () => {
  const pollFnIdx = controllerSrc.indexOf("function startViewportPoll()");
  assert.ok(pollFnIdx > -1, "the central poll function exists");
  const setIntervalCount = (controllerSrc.match(/setInterval\(/g) ?? []).length;
  assert.equal(setIntervalCount, 1, "exactly one setInterval call in the whole controller — one poll loop, not one per module");
  const clearIntervalCount = (controllerSrc.match(/clearInterval\(/g) ?? []).length;
  assert.ok(clearIntervalCount >= 1, "the interval is cleared somewhere (cleanup), so stop/restart never leaks a second timer");
  assert.ok(controllerSrc.includes("if (pollTimer) return;"), "starting the poll twice is a no-op — guards against a duplicate loop");
});

test("17b. a single applyMode() call re-flows the WHOLE layout on viewport change — not a separate reposition path per module", () => {
  const idx = controllerSrc.indexOf("pollTimer = setInterval(");
  assert.ok(idx > -1);
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("}, VIEWPORT_POLL_MS)"));
  assert.match(block, /await applyMode\(\)/, "one coherent re-flow call per detected size change");
});

test("controller derives the internal-canvas scale param from the SAME computeLayoutScale used for the outer popover rect — one shared source of truth, not two independently-tuned numbers", () => {
  const idx = controllerSrc.indexOf('params.set("scale"');
  assert.ok(idx > -1, "pageUrl() seeds a scale param");
  assert.match(controllerSrc.slice(idx - 40, idx + 80), /computeLayoutScale\(lastVW, lastVH\)/);
});

/* ── Internal canvas: canonical size + matching transform ──────────────── */

test("CombatHudModule.js sizes each of the 5 canonical modules to its OWN canonical (unscaled) pixel dimensions and applies transform:scale with a top-left origin — content never re-authored per viewport, only visually scaled", () => {
  assert.match(moduleSrc, /el\.style\.width = `\$\{canonical\.width\}px`/);
  assert.match(moduleSrc, /el\.style\.height = `\$\{canonical\.height\}px`/);
  assert.match(moduleSrc, /el\.style\.transform = `scale\(\$\{scale\}\)`/);
  assert.match(moduleSrc, /el\.style\.transformOrigin = "top left"/);
  assert.ok(!/CSS\.zoom|\.style\.zoom/.test(moduleSrc), "never uses the non-standard CSS zoom property");
});

test("companion selector panels (weapon/magazine/fire-mode — no entry in DEFAULT_HUD_LAYOUT_V2) are never touched by the canvas-scaling change — `canonical` is undefined for them, so the whole scaling block is skipped", () => {
  for (const companionId of ["gun-weapon-selector", "gun-magazine-selector", "gun-fire-mode-selector"]) {
    assert.equal(DEFAULT_HUD_LAYOUT_V2[companionId], undefined, `${companionId} intentionally has no canonical rect`);
  }
});

console.log("");
setTimeout(() => {
  console.log(`\nPriority UI Fix — Universal Responsive HUD Scaling: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
