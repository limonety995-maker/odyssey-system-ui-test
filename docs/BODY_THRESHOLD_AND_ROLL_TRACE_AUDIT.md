# Body-threshold and combat-roll-trace audit

Priority Bugfix Pack: "Body Thresholds, Debug Roll Trace, Target Ring, HUD
Typography". This audit follows the real active code path — no assumption is
made from naming alone.

**Status note:** both of the fixes this section covers (the body-threshold
policy and the Debug Console raw-vs-modified trace) were already implemented
correctly in an earlier session of this same bugfix pack (see the prior
commits `fix(hud): respect body critical-damage thresholds` and `fix(debug):
display raw combat rolls and modified totals`, both already on `main`). This
audit re-verifies that current, already-shipped state against this task's
exact requirements and closes the two test gaps the requirements newly call
out (see §Tests below); it does not re-do the fix.

## Part 1 — Body-part destroyed-state threshold

### 1. Where target runtime body-zone data enters the HUD

`hud/targeting/targetBodyZones.js`'s `mapTargetBodyZones(bundle)` — the
target's body parts arrive via the EXISTING `get_character_runtime_bundle`
RPC, requested with `sections:["combat"]` only, from
`hud/targeting/targetSelectionAdapter.js`/`targetSelectionController.js`. No
new RPC. The source's OWN silhouette gets the same body-part rows through
`hud/runtime/runtimeBundleMapper.js`'s `mapZones()`.

### 2. Exact field for current critical damage

`body_parts[].critical` (an integer wound COUNT — there is no current/max HP
on a body part; see `bodyConditionPolicy.js`'s header comment, verified
against `supabase/odyssey_supabase.sql`'s `odyssey_character_body_parts`
table and the same combat body_parts JSON builder used throughout the file).

### 3. Exact field for critical damage threshold

`body_parts[].max_critical` — confirmed present in the client-facing combat
body_parts payload (`supabase/odyssey_supabase.sql`, the `get_character_rule_sheet`
body_parts builder used by the combat runtime bundle: `'max_critical',
b.max_critical` alongside `'critical', b.critical`, `'disabled', b.disabled`,
`'destroyed', b.destroyed`).

### 4. Whether a separate destroyed/disabled flag exists

Yes — `body_parts[].destroyed` and `body_parts[].disabled`, both booleans.
Audited (SQL): every live perform-attack critical-damage branch does:

```sql
if v_body_critical_delta > 0 then
  v_new_critical := coalesce(v_target_part.critical, 0) + v_body_critical_delta;
  v_new_disabled := true;                          -- set on ANY critical hit
  if v_new_critical >= coalesce(v_target_part.max_critical, 0) then
    v_new_destroyed := true;                        -- only at/above the real threshold
    v_new_disabled := true;
  end if;
end if;
```

So `disabled` is **not** threshold-gated (true the moment any critical wound
lands), while `destroyed` **is** always threshold-gated
(`critical >= max_critical`). The same "disabled set early, destroyed
threshold-gated" pattern recurs identically in the corresponding heal branch
(`v_new_disabled := v_new_critical > 0;`).

### 5. Where the wrong mapping used to happen (now fixed)

`hud/targeting/bodyConditionPolicy.js`'s `evaluateBodyCondition(bp)` used to
do `if (bp.destroyed || bp.disabled) return disabled;` — trusting the
unreliable `disabled` flag directly, which is exactly what made
critical=1/max_critical=2 render as fully destroyed. It now computes the
canonical rule itself:

```js
const hasThreshold = Number.isFinite(maxCritical) && maxCritical > 0;
if (hasThreshold) {
  if (critical >= maxCritical) return build(BODY_CONDITION_STATE.disabled);
} else if (bp.destroyed) {
  return build(BODY_CONDITION_STATE.disabled); // destroyed alone IS reliable — always threshold-gated
}
// critical > 0 (below threshold) falls through to "critical" — never "disabled"
```

A bare `disabled` flag is never trusted on its own anywhere in this function.

### 6. Whether body damage and armor damage are mixed

No. `evaluateBodyCondition` reads only `critical`/`serious`/`minor`/
`max_critical`/`destroyed` (body fields). Armor fields
(`armor_value`/`armor_critical`/`armor_max_critical`/`armor_destroyed`) are a
completely separate track, never read by this function — confirmed by a
dedicated regression test ("armor condition never overwrites body-part
destruction state", `scripts/body-critical-threshold.test.mjs`).

### 7. Which UI component paints the Combat Control doll state

`hud/targeting/targetBodyZones.js`'s `mapTargetBodyZones()` calls
`evaluateBodyCondition()` per body part and produces `{ state, colorToken,
label, zoneState }`; `buildTargetZonesMap()` turns that into the
`{svgPartId: ZONE_STATES value}` map that `hudIcons.humanoidSvg({zones})`
actually paints inside `TargetBlock.js`'s Combat Control target figure. The
SOURCE's own silhouette (`PlayerBlock.js`) goes through the identical
`evaluateBodyCondition()` via `runtimeBundleMapper.js`'s
`zoneStateFromBodyPart()` — one shared policy, two silhouettes.

### 8. Final fixed state policy

| condition | state |
|---|---|
| `critical >= max_critical` (real threshold reached) | `disabled` (destroyed, red-adjacent dark tone) |
| `max_critical` missing/0, but `destroyed === true` | `disabled` (fallback — `destroyed` alone is always threshold-gated server-side) |
| `max_critical` missing/0, `destroyed` not true | falls through to critical/serious/minor/healthy — never fabricated as destroyed |
| `critical > 0` but below threshold | `critical` ("critical but still functional") |
| `serious > 0`, no critical | `serious` |
| `minor > 0`, no serious/critical | `minor` |
| none of the above | `healthy` |
| no body-part data at all (null/denied fetch) | `unknown` |

No database change was needed — `max_critical` was already present in the
runtime bundle; the bug was entirely in the client trusting the wrong server
field.

## Part 2 — Debug Console raw-vs-modified roll trace

### Where raw values are lost or misrendered

Traced the full chain: `combat RPC result` → `hud/combat/basicAttackPayload.js`'s
`resolveAttack()` → `hud/combat/attackResolutionTrace.js`'s
`buildAttackResolutionTrace()` → `buildRollResolutionDetails()` →
`hud/debug/DebugConsolePanel.js`'s `detailLines()`/`renderDetailArea()`.

**Finding: raw values were never lost.** `buildAttackResolutionTrace()`
already copied BOTH the raw/base roll (`attack.roll`, `defense.roll`) and the
final server-computed total (`attack.total`, `defense.total`) verbatim from
`perform_attack`'s response — confirmed by `scripts/attack-roll-trace.test.mjs`
tests 1-2 (already green, unaffected by this pass). The armed-technique
(ability) attack path shares this exact same normalizer — `attack-technique-armed.test.mjs`
imports `attackResolutionTrace.js` too, there is no separate ability
resolver/normalizer.

The actual bug was purely presentational: `DebugConsolePanel.js`'s
`detailLines()` is a generic flat key/value dump (`accuracy: { attackRoll:
47, attackTotal: 71, attackSkillBonus: 20, ... } `) with no grouping and no
explicit "raw vs final" separation, and no assembled modifier-breakdown
string — a reader had to manually diff two unrelated-looking numbers buried
among a dozen other fields to notice a modifier was even applied.

### Fixed shape

`buildRollBreakdown(trace)` (new, in `attackResolutionTrace.js`) regroups the
SAME already-present trace fields — no new server call, no combat math, no
reconstructed raw value — into four categories, included in
`buildRollResolutionDetails()`'s `rollBreakdown` field alongside (not
replacing) the existing full `accuracy`/`damage`/`ammo` sections:

```js
{
  "ATTACK ROLL":    { Roll: 47, "With modifiers": 71, Modifiers: "Skill +20, Weapon +4" },
  "DEFENSE ROLL":   { Roll: 39, "With modifiers": 49, Modifiers: "Manual +10" },
  "DAMAGE ROLL":    { Roll: 8,  "With modifiers": 89, Modifiers: "Ammo +0, Melee +0" },
  "DAMAGE DEFENSE": { Roll: 6,  "With modifiers": 55, Modifiers: "Armor pierce -3" },
}
```

Labels follow the project's existing convention (`Roll`/`With
modifiers`/`Modifiers`) rather than the task's illustrative `Base:`/`Roll:`
wording for damage categories specifically — the task explicitly allows this
("Exact labels may follow project conventions... must always make clear:
raw/base value, final modified value, modifier list"), and a single
consistent label set across all four categories is clearer than mixing
`Roll:`/`Base:` for what is structurally the identical shape. A category with
neither value ever returned (e.g. a failed attack) produces no line at all —
never a fabricated 0. A modifier the server genuinely returned as `0` is
still shown, honestly, as `0`.

No migration was needed — the server already returned every value used here.

## Tests

Both areas already had dedicated, currently-green test files from the prior
session (`scripts/body-critical-threshold.test.mjs`,
`scripts/debug-console-roll-breakdown.test.mjs`), which already covered this
task's own required matrix:

- threshold 1/critical 0 → not destroyed; threshold 1/critical 1 → destroyed
- threshold 2/critical 0/1/2 → not destroyed / critical-but-functional / destroyed
- threshold 3/critical 2/3 → critical-but-functional / destroyed
- serious damage alone ≠ destroyed; armor damage ≠ destroyed body part
- missing threshold ≠ destroyed
- target silhouette updates after a fresh authoritative combat result, and
  the selected target/body zone is preserved when still valid — both already
  covered by `scripts/hud-lifecycle-fixes.test.mjs`'s
  `refreshTargetBodyZones()` tests ("a successful attack does NOT call
  clearTarget — target + zone survive")
- attack/defense/damage/damage-defense raw-vs-final separation, positive/
  negative modifiers, zero-modifier honesty, no fabricated raw

This pass adds the one genuinely new test each area's requirements called
out that wasn't yet covered: an explicit test that an **armed-technique
(ability) attack** produces the identical `buildRollBreakdown` shape as a
plain weapon attack (`debug-console-roll-breakdown.test.mjs` test 11).
