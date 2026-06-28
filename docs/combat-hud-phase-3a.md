# Combat HUD — Phase 3A: Scene Selection & Active Character Binding

Phase 3A makes the HUD stop living only on DEV/mock scenarios and start reacting
to the **real Owlbear token selection**. It resolves the selected token → a
linked character, checks ownership, loads the existing runtime bundle, and drives
the five HUD modules accordingly — all without touching Supabase schema, RPCs,
RLS, gameplay, token metadata, or the multi-popover architecture.

Target selection on the map is explicitly **out of scope** (Phase 3B).

## New layer: `hud/scene/`

| File | Role | Pure? |
|------|------|------|
| `selectionState.js` | Status constants, the `deriveSelectionState` reducer, ownership rule, stale-request gate, broadcast trimming | ✅ Node-testable |
| `sceneSelectionAdapter.js` | `token id(s) → link → runtime bundle → state`, with injectable fetchers + `resolveLatest` race guard | ✅ Node-testable |
| `sceneSelectionController.js` | OBR wiring: subscribe to selection, call the adapter, broadcast, replay-on-request | ❌ imports OBR |
| `selectionView.js` | Per-module HTML for each state (Player prompts + neutral fallbacks) | ✅ Node-testable |

## Selection state model

```js
{
  status: "ready" | "loading" | "no-selection" | "multiple-selection" |
          "unlinked-token" | "not-owned" | "unavailable" | "error",
  selectedItemId: string | null,
  characterId: string | null,
  viewer: { playerId: string | null, role: "PLAYER" | "GM" | "UNKNOWN" },
  access: { canView: boolean, reason: string | null },
  runtimeBundle: object | null,   // kept internally; NEVER broadcast in full
  view: object | null,            // trimmed, render-only (ready + canView only)
  error: { code: string | null, message: string | null },
}
```

The **broadcast payload** (`buildBroadcastPayload`) strips `runtimeBundle` and
includes `view`/`characterId` **only** when `ready && canView` — so `not-owned`,
`unlinked-token`, etc. leak no character data over the wire.

## OBR / selection APIs used (SDK 3.1.0)

All through the existing `bridge/obrBridge.js`:
- `OBR.player.getSelection()` — current selected item ids.
- `OBR.player.onChange(player)` (`subscribePlayerChanges`) — selection **and**
  role changes (the player object carries `selection` + `role`).
- `OBR.player.getId()` / `getRole()` — viewer identity (`getPlayerInfo`).
- `OBR.scene.items.onChange` (`subscribeSceneItems`) — debounced, single-selection
  re-resolve so a token linked while selected refreshes (no RPC spam).
- `getRoomSceneContext()` — `room_id`/`scene_id`/`campaign_id` (SDK 3.1 has no
  `scene.id`; `room.id` is the stable proxy, as elsewhere in the codebase).
- `OBR.broadcast` (LOCAL) — `BC_HUD_SELECTION` (controller → iframes) and
  `BC_HUD_SELECTION_REQUEST` (iframe → controller, replay on mount).

## token → character

`OBR` selection id == `odyssey_token_links.token_id` (verified against the
placement flow). Resolution:
1. exactly **0** selected → `no-selection` (no backend call);
2. **>1** selected → `multiple-selection` (no backend call, no "first token");
3. exactly **1** → `get_scene_token_links({room_id, scene_id, campaign_id,
   token_id})` → active link → `character.id`. No link → `unlinked-token`.

Character id is read **only** from the token-link layer — never from token
metadata, and nothing is ever written to token metadata.

## Ownership rule

Resolved from `get_character_runtime_bundle({character_id})`:
- **Player**: `canView` ⇔ `bundle.character.owner_player_id === viewer.playerId`.
  `owner_player_name` is **never** used as an identifier.
- **GM**: may view any linked character; shows a `GM VIEW` badge. This is UI/UX
  behavior only — **not** a server authorization (a real backend security phase
  is separate).
- If the bundle does **not** return `owner_player_id` → safe `unavailable`
  (reason `OWNERSHIP_UNVERIFIABLE`); no name-based guess, no ad-hoc table query.

## Stale-request protection

`createGenerationGate()` lives in the adapter. Each `resolveLatest()` stamps a
monotonically increasing token; after the async resolve it reports
`stale = !gate.isCurrent(token)`. The controller **discards stale results** —
they never broadcast and never change the HUD. So selecting A then B, with A's
response arriving later, leaves the HUD on B. (AbortController is not used: the
shared `callSupabaseRpc` takes no signal and the backend layer must not change;
the generation gate is sufficient.)

## How modules update (no popover churn)

- The **Player** module is always open. It re-renders on every `BC_HUD_SELECTION`
  broadcast — no reopen.
- **Gun / Skills / Combat Control / Log** open only when the status **crosses
  into** `ready` and close when it **leaves** `ready` (an explicit module
  open/close — permitted). A `ready → ready` change (a different owned character)
  does **not** reopen them; they just re-render on the broadcast.
- A module opened after a selection change asks for the latest payload on mount
  (`BC_HUD_SELECTION_REQUEST`) and the controller replays it.
- Selection changes never touch the v2 layout, custom positions, Arrange HUD, or
  collapse/pill. Popover reopen still happens only on layout Save, resize,
  collapse/reopen, and explicit module open/close.

## Invalid-state UX (Player module copy)

| Status | Title | Hint |
|--------|-------|------|
| no-selection | SELECT YOUR CHARACTER | Choose a controlled token on the map |
| multiple-selection | SELECT ONE CHARACTER | Multiple tokens selected |
| unlinked-token | NO CHARACTER LINK | This token is not linked to an Odyssey character |
| not-owned | CHARACTER NOT AVAILABLE | Select one of your controlled characters |
| unavailable / error | CHARACTER DATA UNAVAILABLE | Try selecting the token again |

`?debug=1` adds the error `code: message` under the prompt (dev only). In every
non-ready state the four secondary modules are closed/muted with **no stale data**
from the previous character.

## Ready state & runtime data

In `ready`, the Player module shows the **real** bound character: name, an
`OWNED`/`GM VIEW` badge, and alive/conscious + `status_summary` from the bundle —
no fabricated values. The four ready-only modules currently render a **neutral,
clearly-labeled** fallback (`Runtime data wiring — Phase 3+`). Per the spec, a
section with no UI-ready bundle data shows a local neutral fallback rather than
inventing weapons/skills/target/ammo/statuses. Combat Control stays read-only and
shows no target (target selection is Phase 3B).

## Mock vs live

- **Standalone (no OBR)**: unchanged — the DEV/mock selector drives the modules,
  so the preview and all Phase 0–2.2.3 tests keep working.
- **Live Owlbear room**: the selection state takes priority over the mock; the
  mock is **never** silently substituted for a failed runtime bundle. If the
  Supabase backend is not configured for the room, the HUD shows a safe
  `unavailable` state (not mock data).
- Dev controls are not shown to ordinary players.

## Tests & build

```bash
npm run test:hud   # 10 + 14 + 13 + 8 + 14 + 16 = 75 pure tests
npm run build      # assets/combat-hud-overlay.js + assets/background.js
```
`scripts/combat-hud-phase3a.test.mjs` (16 cases): ready (owned), ready (GM view),
no-selection, multiple (no backend call), unlinked, not-owned (no data leak),
runtime error, missing `owner_player_id` → unavailable (no name check), the
stale-response **race** (latest wins), the generation gate, invalid → secondary
modules hidden, valid → five modules with neutral ready fallbacks, selection
never mutates the v2 layout, skills ≤10/row rule unchanged, backend-unconfigured
→ unavailable, and broadcast-payload trimming / normalize round-trip.

## Verified in standalone preview (DOM-measured)

- Standalone mock render is unaffected (`?module=player` still shows the mock
  Player; no live bind card; no console errors).
- The eight live states rendered from the source `selectionView` with real CSS:
  ready (`CONTROLLED · Vega`), GM (`GM VIEW · Scrap Raider`), and the five
  prompts with verbatim spec copy; secondary `gun` ready → `Runtime data wiring`.

(The preview screenshot tool timed out this session, and a real Owlbear room
cannot run in the dev sandbox — there is no OBR runtime. The live
multi-popover/selection behavior must be confirmed manually, per the checklist.)

## Manual Owlbear checklist (Local Extension)

1. Nothing selected → compact Player prompt; other four modules hidden.
2. One owned linked token → all five modules appear at saved positions.
3. Unlinked token → `NO CHARACTER LINK`.
4. Foreign linked token (as a player) → `CHARACTER NOT AVAILABLE` (no data shown).
5. GM selects a linked token → HUD shows `GM VIEW`.
6. Multiple tokens → `SELECT ONE CHARACTER`.
7. Rapidly switch two tokens → HUD never rolls back to the older one.
8. Custom layout is preserved across token switches.
9. Collapse → pill → reopen keeps the valid state/layout.
10. Arrange HUD works while nothing is selected.
11. Map clickable between module popovers.
12. No white scrollbars.
13. No duplicate popovers.

## Known limitations

- Faithful per-module runtime mapping (weapons/ammo, abilities, effects/modifiers,
  combat log) is deferred — ready secondaries show a neutral fallback, not real
  gameplay data (no fabrication).
- GM view is a UI affordance only; server-side authorization is a later phase.
- `scene_id` is proxied by `room_id` (SDK 3.1 limitation), matching the rest of
  the codebase.
- Live selection/popover behavior is verified by unit tests + code analysis;
  it cannot be exercised without a live Owlbear room.
