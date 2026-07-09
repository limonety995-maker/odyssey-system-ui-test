import assert from "node:assert/strict";
import { createTestSuite } from "./_tinyTestRunner.mjs";
import { fixtureSet } from "./_fixtures.mjs";
import { assertRejected } from "./_assertions.mjs";
import { fireWeaponMock, reloadWeaponMock } from "./_mockAdapters.mjs";

const { test, run } = createTestSuite("Unit — Ammo / Reload");
const fx = fixtureSet();

test("shot reduces ammo in magazine", () => {
  const result = fireWeaponMock({
    weapon: fx.characterWeapons.pistolLoaded,
    magazine: fx.magazines.activePistolMagazine,
  });
  assert.equal(result.magazine.current, 5);
});

test("cannot shoot with empty magazine", () => {
  const result = fireWeaponMock({
    weapon: fx.characterWeapons.pistolLoaded,
    magazine: fx.magazines.emptyPistolMagazine,
  });
  assertRejected(result, "empty_magazine");
});

test("reload swaps magazine", () => {
  const result = reloadWeaponMock({
    weapon: fx.characterWeapons.pistolLoaded,
    reserveMagazines: [fx.magazines.reservePistolMagazine],
  });
  assert.equal(result.weapon.active_magazine_id, fx.magazines.reservePistolMagazine.id);
  assert.equal(result.magazine.current, 6);
});

test("reload unavailable without reserve magazine", () => {
  const result = reloadWeaponMock({
    weapon: fx.characterWeapons.pistolLoaded,
    reserveMagazines: [],
  });
  assertRejected(result, "no_reserve_magazine");
});

await run();

