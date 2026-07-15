# Phase 4.2 — Battle Log Polish / Compact Event Lines / Expandable Details: audit

Baseline: `HEAD=bdb0fc4` (1.8.75). Continues our own HUD line only — no upstream
sync/merge/cherry-pick performed or planned.

## 1. How `BattleLogBlock.js` currently renders entries

`renderBattleLogPanel(state)` reads `state.snapshot.battleLog.entries`,
takes the first 5, and renders each via `entryRow(e)`:
- If `Array.isArray(e.details)` (our "real" entry shape) → a title line
  (`e.title`, colored hit/miss via a crude `e.outcome === 'failure' ? 'miss' :
  'hit'` check) + each `details` string as its own line, **always fully
  expanded, no click/collapse at all**.
- Else (`e.kind` present) → three legacy/mock shapes (`system`/`narrative`/
  default actor→action→target→delta) from the pre-existing Phase 0/2.1 mock
  scenario harness — dead code paths for anything our own pipeline produces
  (we never set `.kind`).

**No expand/collapse exists today.** Every entry always shows its full
`details` array. No entry has an `id`. No click handler exists for log rows
at all (confirmed: no `data-action` inside `entryRow()`'s real-entry branch).

## 2/3. What data exists in `ephemeral.combatLog` / `hudSnapshot.battleLog.entries`

Identical — `selectionState.js` folds `ephemeral.combatLog` verbatim into
`hudSnapshot.battleLog.entries` (`buildBroadcastPayload`, confirmed
unchanged since before the fork). Every entry currently has exactly:

```js
{ timestamp, type, outcome, title, details: string[], sourceCharacterId, targetCharacterId }
```

**No entry currently carries a character NAME, only raw `characterId`
UUIDs** — and `BattleLogBlock.js`'s real-entry rendering branch never reads
`sourceCharacterId`/`targetCharacterId` at all, so today's Battle Log shows
generic titles like "Attack" / "Ability used" / "Ability toggled" with zero
actor/target identification. This is the single biggest gap versus the
task's compact-line design (`"Freya attacks Raider / Torso"` requires a
resolved display name that nothing currently threads through).

**No entry has a turn/round label, a stable `id`, a machine-readable
`status`, or a `severity` field.**

## 4. Which files build log entries today

| Action | Builder | Call site (`hud/scene/sceneSelectionController.js`) |
|---|---|---|
| Weapon attack | `buildAttackLogEntry` | ~L1405 |
| Direct ability attack | `buildAttackLogEntry` (reused verbatim — same raw shape as a weapon attack, per its own comment: "Combat Log doesn't care whether the outcome came from a weapon or an ability attack") | ~L753 |
| Instant/self ability | `buildAbilityExecutionLogEntry` | ~L922 |
| Directed target ability | `buildDirectedAbilityLogEntry` | ~L1082 |
| Toggle ability | `buildToggleAbilityLogEntry` | ~L1243 |
| Reload | `buildReloadLogEntry` | 4 call sites (~L1588/1613/1633/1644 — success + 3 distinct failure paths) |
| Fire mode | `buildFireModeLogEntry` | ~L587/598 |
| **Movement** | **none** | Tactical Move's `MOVE_TOOL_EVENTS.Applied` listener (~L215) only calls `sessionController.applyExternalRuntime(...)` — never `pushLog`. No movement entry exists today. |
| **End turn** | **none** | `combatSessionController.js`'s `handleCommand("end-turn")` → `runMutation("turn-ended", ...)` only logs a Debug Console event; no callback exists for a caller (`sceneSelectionController.js`) to observe "turn ended" and push a Battle Log entry. |
| **Blocked/failed actions** | covered per-builder (every builder's `ok:false` branch already produces a `details`/`title` pair) — no separate "blocked" builder exists, and none is needed; the existing failure branches already carry the server's real denial message. |

ARMED preparation/consumption: arming itself (`toggle-armed-technique`) never
calls `pushLog` (client-only ephemeral state, no server round-trip to log).
Consumption is folded into the SAME `buildAttackLogEntry` weapon-attack path
above (the `armed_actions` array is already in the trace, just not
summarized into the compact line yet).

## 5. Does the roll trace already include everything the design wants?

**Yes — already 100% present, verbatim from the server, in
`hud/combat/attackResolutionTrace.js`** (`buildAttackResolutionTrace`/
`buildRollBreakdown`, currently used ONLY for the Debug Console's
`roll-resolution` event):

| Needed field | Existing trace field |
|---|---|
| raw d100 (attacking) | `accuracy.attackRoll` |
| raw d100 (defending) | `accuracy.defenseRoll` |
| accuracy modifiers | `accuracy.attackSkillBonus`/`attackManualBonus`/`weaponAccuracyBonus`/`fireModeAccuracyModifier`/`ammoAccuracyModifier` (attacking); `defenseManualBonus`/`defenseManualPenalty` (defending) |
| final attacking accuracy | `accuracy.attackTotal` |
| final defending accuracy | `accuracy.defenseTotal` |
| damage modifiers | `damage.ammoDamageModifier`/`meleeStrengthBonus` |
| armor/protection modifiers | `damage.armorPierceUsed`/`armorValueUsed` |
| final attacking damage | `damage.attackTotalUsed` (`damage_attack_total`) |
| final defending damage | `damage.defenseTotalUsed` (`damage_defense_total`) |
| status (hit quality) | `accuracy.hit` (boolean) + `accuracy.auto` (`'crit'\|'fail'\|null`) — together these ALREADY encode exactly the 4 statuses the design wants (see §status mapping below) |
| severity | `damage.damageLevel` (server field `damage.level`, real values confirmed in `supabase/17_combat_resolution_schema.sql`: `'no_damage'\|'minor'\|'serious'\|'critical'` — **no `'devastating'` level exists anywhere in this schema**; the task's own 4th example severity is not implementable without inventing data, so it is intentionally omitted) |

`buildRollBreakdown(trace)` already assembles `ATTACK ROLL`/`DEFENSE ROLL`/
`DAMAGE ROLL`/`DAMAGE DEFENSE` sections in almost exactly the
Accuracy/Damage/Result shape the design asks for — this phase's job is to
expose this ALREADY-COMPUTED, ALREADY-VERBATIM data to the Battle Log too
(currently Debug-Console-only), not to recompute anything.

**Status mapping** (derivable honestly from existing fields, no invention):
```
auto === 'crit' (and hit === true)  → CRIT SUCCESS
auto === 'fail'                     → CRIT FAILURE
hit === true                        → SUCCESS
hit === false                       → FAILURE
anything else / trace not ok        → neutral (non-attack entries)
```

## 6. Expand/collapse support today

None (confirmed in §1). Must be added.

## 7. Turn/round number availability

**Exists and is already used for Debug Console events** —
`hud/session/combatSessionMapper.js` maps a `roundNumber` field ("Phase 3E.0
name") onto the session object; `sceneSelectionController.js` already reads
`sessionAtRequest.roundNumber` / `reloadSession.roundNumber` for several
existing `logDebugEvent(...)` calls. **Never yet threaded into a Battle Log
entry.** This is real, honest, already-available data — turn grouping can be
implemented without fabricating anything.

## 8. Transient client-side vs server-authoritative

Entirely transient/client-side (confirmed unchanged from the existing header
comment in `combatResultLogPolicy.js`: "no Supabase persistence, no shared/
realtime distribution"). This phase does not change that — still a
local-only, in-memory log for the current HUD session.

## 9/10. Safe-to-show vs Debug-Console-only fields

Already-established, unchanged rule (existing header comments in both
`combatResultLogPolicy.js` and `attackResolutionTrace.js`): only whitelisted,
verbatim, game-visible fields ever reach the Battle Log — never raw
payload/UUID dumps/stack traces/auth data/the full runtime bundle. The
existing `attackResolutionTrace.js` trace object is ALREADY this exact
whitelist (it deliberately excludes `target_state`/`attacker_state`/
`post_attack_perks`/`pending_checks`/diagnostics) — reusing it means the
safety boundary is inherited for free, not re-derived.

**Missing today, needed for this phase, and safe to add**: character
**display names**. `hud/scene/selectionState.js`'s `buildView()` already
computes `state.view.name` (`character.display_name ?? character.character_key`)
for the acting/selected character — already player-visible identity data
(shown elsewhere in the HUD), never private. `ephemeral.targeting?.selectedTargetName`
is already resolved and already passed into `buildDirectedAbilityLogEntry`'s
`targetName` param (just not surfaced in the compact title yet). Both are
safe, already-computed, already-displayed-elsewhere values — no new PII/
private-data exposure, just wiring an existing safe value to one more place
it currently doesn't reach.

## 11. Final implementation plan

Path: **frontend/display-only, no migration, no combat-math change** —
confirmed nothing here requires new server data; every field the design asks
for already exists somewhere in the current runtime/session/trace shapes.

1. **`hud/log/battleLogEntryModel.js`** (new, pure) — the shared
   classification/formatting layer:
   - `classifyAttackStatus(trace)` → one of `success|failure|crit_success|crit_failure|neutral`.
   - `classifySeverity(trace)` → `minor|serious|critical|null` (never `devastating` — doesn't exist).
   - `buildAttackCompactText({actorName, targetName, bodyZoneLabel, turnLabel, actionLabel, trace})`
     → the `[T3] Name attacks Target / Zone — [STATUS] · Accuracy A/B · Damage A/B · [SEVERITY]` line, omitting Damage entirely when `trace.ok` is false (accuracy failed, nothing rolled) and omitting the severity badge when `damageLevel` is `no_damage`/absent.
   - `buildAccuracyBreakdown(trace)`/`buildDamageBreakdown(trace)` → thin wrappers around the EXISTING `buildRollBreakdown(trace)` (`hud/combat/attackResolutionTrace.js`), re-labeled `Accuracy`/`Damage`/`Result` per the design, not recomputed.
2. **`hud/log/combatResultLogPolicy.js`** — extend (not replace) every
   existing builder with new, optional parameters (`sourceCharacterName`,
   `targetCharacterName`, `turnLabel`, `bodyZoneLabel` where missing) that
   default to `null`/omitted when not supplied (so nothing breaks for any
   caller not yet updated); each builder additionally returns `id`,
   `status`, `severity`, `compactText`, and (for attack-shaped entries)
   `accuracy`/`damage`/`result` blocks, alongside the EXISTING `timestamp/
   type/outcome/title/details/sourceCharacterId/targetCharacterId` fields
   (kept for compatibility, nothing removed).
3. **New builders**: `buildMovementLogEntry`, `buildEndTurnLogEntry` — same
   honesty rules (omit numbers that aren't available, never invent).
4. **`hud/scene/sceneSelectionController.js`**: thread `lastState?.view?.name`
   (actor name) and the already-resolved `ephemeral.targeting?.selectedTargetName`
   (target name) and `sessionAtRequest.roundNumber`/`reloadSession.roundNumber`
   (turn label) into every existing `pushLog(...)` call. Add exactly two new,
   minimal, additive wiring points:
   - Movement: the EXISTING `MOVE_TOOL_EVENTS.Applied` listener also calls
     `pushLog(buildMovementLogEntry(...))`, using a new `distanceM` field
     added to the event payload in `movement/moveToolController.js`
     (one extra key on an already-published JS object — no movement LOGIC
     change). If `distanceM` isn't present, the entry honestly omits the
     distance clause (design's own permitted fallback).
   - End turn: a new optional `onTurnEnded` callback parameter on
     `setupCombatSessionController(...)`, invoked only when
     `runMutation("turn-ended", ...)` actually resolves `ok` — wired from
     `sceneSelectionController.js`'s existing setup call to
     `pushLog(buildEndTurnLogEntry(...))`.
5. **Expand/collapse state**: a new `ephemeral.expandedLogEntryIds` (a plain
   array of entry ids, folded into the snapshot exactly like every other
   ephemeral UI field already is), toggled by a new
   `{scope:"combat-hud", feature:"battle-log", type:"toggle-log-entry"}`
   command (dispatched from `CombatHudModule.js`'s existing click-delegation
   switch on a new `data-action="toggle-log-entry"` row). Purely local UI
   state — no server call, no runtime mutation, matches every other
   ephemeral-toggle precedent already in this codebase (`openSkillsMenu`,
   `armedActionId`, etc.).
6. **`hud/components/BattleLogBlock.js`** rewrite: compact line always
   visible (bold), status/severity badges rendered as separate small
   elements (never the whole row recolored), a details block rendered only
   when the entry's id is in `expandedLogEntryIds`, using a semantic
   `<table>`/grid for the Accuracy/Damage/Result breakdown (not an ASCII
   table). Turn grouping: entries are grouped into `<section>`s by
   `turnLabel` when present; entries without a `turnLabel` render in a
   single ungrouped list (no fake grouping).
7. **No Supabase migration.** No combat math changes. No changes to
   `hud/combat/*Policy.js`/`*Payload.js` execution logic, `hud/targeting/*`,
   or `movement/moveToolController.js`'s actual movement resolution — only
   the one additive `distanceM` display field noted above.
