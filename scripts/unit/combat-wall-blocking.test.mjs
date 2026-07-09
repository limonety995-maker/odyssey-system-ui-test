import assert from "node:assert/strict";
import { createTestSuite } from "./_tinyTestRunner.mjs";
import { fixtureSet } from "./_fixtures.mjs";
import { previewPathWithWalls } from "./_mockAdapters.mjs";

const { test, run } = createTestSuite("Unit — Combat Wall Blocking");
const fx = fixtureSet();

test("no walls allows movement", () => {
  const preview = previewPathWithWalls({
    start: { x: 0, y: 0 },
    destination: { x: 2, y: 0 },
    walls: fx.walls.emptyWallMap,
  });
  assert.equal(preview.allowed, true);
});

test("wall between cells blocks movement", () => {
  const preview = previewPathWithWalls({
    start: { x: 0, y: 0 },
    destination: { x: 1, y: 0 },
    walls: fx.walls.singleVerticalWall,
  });
  assert.equal(preview.allowed, false);
  assert.deepEqual(preview.lastReachable, { x: 0, y: 0 });
});

test("each step is checked along the path", () => {
  const preview = previewPathWithWalls({
    start: { x: 0, y: 0 },
    destination: { x: 3, y: 0 },
    walls: [{ from: { x: 1, y: 0 }, to: { x: 2, y: 0 }, type: "wall" }],
  });
  assert.equal(preview.allowed, false);
  assert.deepEqual(preview.lastReachable, { x: 1, y: 0 });
});

test("diagonal cannot cut blocked corner", () => {
  const preview = previewPathWithWalls({
    start: { x: 0, y: 0 },
    destination: { x: 1, y: 1 },
    walls: fx.walls.cornerWalls,
  });
  assert.equal(preview.allowed, false);
});

test("open door allows movement", () => {
  const preview = previewPathWithWalls({
    start: { x: 0, y: 0 },
    destination: { x: 1, y: 0 },
    walls: fx.walls.doorOpenWallSet,
  });
  assert.equal(preview.allowed, true);
});

test("closed door blocks movement", () => {
  const preview = previewPathWithWalls({
    start: { x: 0, y: 0 },
    destination: { x: 1, y: 0 },
    walls: fx.walls.doorClosedWallSet,
  });
  assert.equal(preview.allowed, false);
});

test("preview stops on last reachable cell", () => {
  const preview = previewPathWithWalls({
    start: { x: 0, y: 0 },
    destination: { x: 3, y: 0 },
    walls: [{ from: { x: 1, y: 0 }, to: { x: 2, y: 0 }, type: "wall" }],
  });
  assert.deepEqual(preview.lastReachable, { x: 1, y: 0 });
});

await run();

