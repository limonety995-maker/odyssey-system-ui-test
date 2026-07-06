# Odyssey System — Frontend Export

Версия экспорта: **v1.7.9 + Stage 5B + Stage 5C (Placement)**
Дата: 2026-06-19

> Форк для независимой UI-разработки (HUD/Quickbar): актуальная версия манифеста — см. `manifest.json`.

Этот пакет содержит полный исходный код фронтенда расширения Owlbear Rodeo для системы Odyssey.
Документ предназначен для AI-ассистента бекенд-разработчика.

---

## Структура файлов

```
frontend_export/
├── main.js                          # Точка входа: навигация + монтирование экранов
├── styles.css                       # Глобальные CSS-переменные и base styles
├── package.json                     # Зависимости: @owlbear-rodeo/sdk, @supabase/supabase-js
├── build.mjs                        # esbuild конфиг (3 бандла: main / gm-extension / character-sheet)
├── index.html                       # Оболочка расширения OBR
├── manifest.json                    # OBR manifest
│
├── api/                             # RPC-адаптеры (тонкие обёртки над callSupabaseRpc)
│   ├── characterPlacementApi.js     # ★ НОВОЕ: bundle + placement RPCs (Task 5C)
│   ├── abilityApi.js
│   ├── characterApi.js
│   ├── checksApi.js
│   ├── combatApi.js
│   ├── effectsApi.js
│   ├── equipmentApi.js
│   ├── featureApi.js
│   ├── gmApi.js
│   ├── inventoryApi.js
│   ├── logApi.js
│   └── weaponApi.js
│
├── bridge/
│   ├── supabaseBridge.js            # REST fetch к Supabase (callSupabaseRpc, fetchSupabaseRows)
│   ├── realtimeClient.js            # ★ НОВОЕ: singleton Supabase JS SDK клиент для WebSocket
│   ├── obrBridge.js                 # Owlbear Rodeo SDK обёртка
│   ├── settingsBridge.js            # Чтение/запись настроек (URL, apiKey) из OBR metadata
│   ├── tokenBridge.js               # OBR token metadata helpers
│   └── tokenRealtimeSync.js         # Real-Time синхронизация токен↔персонаж
│
├── constants/
│   ├── rpcNames.js                  # ★ ОБНОВЛЕНО: добавлен CHARACTER_PLACEMENT_RPC_NAMES
│   └── metadataKeys.js
│
├── runtime/
│   └── createRuntime.js             # ★ ОБНОВЛЕНО: добавлен api.placement + константы
│
├── screens/
│   ├── character/
│   │   ├── characterScreen.js       # ★ ОБНОВЛЕНО: мигрировано на get_character_runtime_bundle
│   │   └── characterStyles.css
│   ├── placement/                   # ★ НОВОЕ: GM Placement Screen (Task 5C)
│   │   ├── placementScreen.js
│   │   └── placementStyles.css
│   └── resolveAttack/
│       ├── resolveAttackScreen.js
│       ├── resolveAttackService.js
│       ├── resolveAttackSettings.js
│       └── resolveAttackStyles.css
│
├── shell/
│   └── appShell.js
│
└── utils/
    ├── json.js                      # escapeHtml, safe JSON helpers
    ├── errors.js
    └── diagnostics.js
```

---

## Архитектура

### Паттерн Bridge Shell

Расширение монтируется в `#app`. Каждый экран получает объект `runtime`:

```js
runtime = {
  constants: { CHARACTER_PLACEMENT_RPC_NAMES, ... },
  bridges: { obr, settings, supabase, token },
  api: {
    ability, character, checks, combat, effects, equipment,
    feature, gm, inventory, log, weapon,
    placement   // ← api/characterPlacementApi.js
  }
}
```

### Вызов RPC

Все RPC идут через `bridge/supabaseBridge.js`:

```js
callSupabaseRpc(functionName, { p_payload: { ...args } }, settings)
// settings = { url: "https://xxx.supabase.co", apiKey: "eyJ..." }
```

### Real-Time (WebSocket)

`bridge/realtimeClient.js` — singleton Supabase JS SDK клиент.
Подключается при первом вызове `getRealtimeClient(settings)`.
Используется в `characterScreen.js` и `resolveAttackScreen.js`.

---

## RPC-функции, которые вызывает фронтенд

### ★ НОВЫЕ (Stage 5B/5C) — обязательно реализовать

| RPC | Файл вызова | Описание |
|-----|-------------|----------|
| `get_character_runtime_bundle` | `characterPlacementApi.js` | Центральный read-RPC. Заменяет 4–5 отдельных вызовов. Возвращает данные персонажа по запрошенным секциям |
| `get_character_spawn_catalog` | `characterPlacementApi.js` | Каталог персонажей для GM Placement Screen |
| `get_scene_token_links` | `characterPlacementApi.js` | Активные привязки токен↔персонаж текущей сцены |
| `load_character_to_token` | `characterPlacementApi.js` | Привязать Player или заспавнить NPC к токену |
| `unbind_token_character` | `characterPlacementApi.js` | Отвязать персонажа от токена |
| `purge_active_npcs` | `characterPlacementApi.js` | Архивировать или удалить NPC_Active |

### Существующие (уже в Supabase)

| RPC | Вызывается из |
|-----|---------------|
| `get_character_rule_sheet` | `characterApi.js` (используется в resolveAttack) |
| `get_character_abilities` | `abilityApi.js` |
| `get_character_armory` | `weaponApi.js` |
| `get_character_equipment` | `equipmentApi.js` |
| `get_character_inventory` | `inventoryApi.js` |
| `get_character_effect_summary` | `effectsApi.js` |
| `roll_characteristic` / `roll_skill` / `roll_dice` | `checksApi.js` |
| `perform_attack` | `combatApi.js` |
| `gm_heal_character` | `gmApi.js` |
| `gm_repair_character_armor` | `gmApi.js` |
| `gm_update_character_attribute` | `gmApi.js` |
| `use_ability` | `abilityApi.js` |
| `odyssey_sync_character_resource_pools` | `abilityApi.js` |
| `advance_character_ability_states` | `abilityApi.js` |
| `switch_weapon_profile` / `switch_weapon_fire_mode` | `weaponApi.js` |
| `load_weapon_profile_magazine` | `weaponApi.js` |
| `activate_weapon_feature` / `deactivate_weapon_feature` | `weaponApi.js` |
| `reload_feature_resource` | `featureApi.js` |
| `create_character_equipment_item` | `equipmentApi.js` |
| `equip_character_equipment_item` / `unequip_character_equipment_item` | `equipmentApi.js` |
| `recompute_character_armor` | `equipmentApi.js` |
| `add_character_item` / `remove_character_item_quantity` | `inventoryApi.js` |
| `add_character_ammo_stock` / `remove_character_ammo_stock` | `inventoryApi.js` |
| `load_rounds_to_magazine` / `unload_rounds_from_magazine` | `inventoryApi.js` |
| `use_character_item` | `inventoryApi.js` |
| `add_character_effect` / `remove_character_effect` | `effectsApi.js` |
| `advance_character_effects` | `effectsApi.js` |
| `initialize_character_rule_defaults` | `characterApi.js` |
| `initialize_character_combat_defaults` | `characterApi.js` |

---

## Контракт: `get_character_runtime_bundle`

Самый важный новый RPC. Character Panel теперь использует только его.

### Запрос

```json
{
  "p_payload": {
    "character_id": "uuid",
    "sections": ["summary", "combat", "attributes", "skills", "equipment",
                 "inventory", "armory", "abilities", "effects"]
  }
}
```

### Ответ

```json
{
  "ok": true,
  "character": {
    "id": "uuid",
    "character_key": "vasya_pupkin",
    "display_name": "Вася Пупкин",
    "character_bucket": "player",
    "campaign_id": "uuid"
  },
  "state": {
    "is_alive": true,
    "is_conscious": true,
    "state_version": 42,
    "status_summary": "В норме"
  },
  "sections": {
    "combat": {
      "is_alive": true,
      "is_conscious": true,
      "state_version": 42,
      "status_summary": "В норме",
      "armor_summary": "...",
      "combat_flags": {},
      "body_parts": [
        {
          "part_id": "head",
          "display_name": "Голова",
          "minor": 0,
          "serious": 0,
          "critical": 0,
          "disabled": false,
          "destroyed": false,
          "armor_value": 2,
          "armor_critical": 0
        }
      ]
    },
    "attributes": [
      { "code": "strength", "value": 8, "effective_value": 8, "modifiers": [] }
    ],
    "skills": [
      { "code": "firearms", "level": 3, "base_attribute": "agility" }
    ],
    "abilities": {
      "abilities": [...],
      "resource_pools": [
        { "pool_id": "uuid", "pool_code": "stamina", "current": 10, "maximum": 10 }
      ]
    },
    "equipment": [...],
    "inventory": {
      "items": [...],
      "ammo_stock": [
        { "id": "uuid", "display_name": "9mm FMJ", "quantity": 45,
          "caliber_code": "9x19", "ammo_type_code": "fmj" }
      ],
      "magazines": [...]
    },
    "armory": {
      "weapons": [...],
      "profiles": [...],
      "weapon_features": [...]
    },
    "effects": [...],
    "token_link": null
  },
  "section_errors": {}
}
```

> **ВАЖНО:** Нет HP. Состояние персонажа определяется повреждениями по частям тела.
> Фронтенд не считает здоровье — только отображает `body_parts[*].minor/serious/critical/disabled/destroyed`
> и итоговый статус из `state.status_summary`.

---

## Контракт: `get_character_spawn_catalog`

### Запрос

```json
{
  "p_payload": {
    "campaign_id": "uuid",
    "room_id": "string",
    "scene_id": "string",
    "search": "vas",
    "buckets": ["player", "npc_template"],
    "include_active_npcs": true,
    "limit": 100,
    "offset": 0
  }
}
```

### Ответ

```json
{
  "ok": true,
  "items": [
    {
      "id": "uuid",
      "character_key": "vasya_pupkin",
      "display_name": "Вася Пупкин",
      "character_bucket": "player",
      "summary": { "status_summary": "В норме", "is_alive": true },
      "scene_link": { "token_id": "obr-token-id", "is_active": true }
    }
  ],
  "total": 12
}
```

---

## Контракт: `load_character_to_token`

### Запрос

```json
{
  "p_payload": {
    "source_character_id": "uuid",
    "token_id": "obr-token-id",
    "token_name": "Vasya",
    "token_layer": "CHARACTER",
    "campaign_id": "uuid",
    "room_id": "string",
    "scene_id": "string",
    "replace_existing_token_link": false
  }
}
```

### Ответ

```json
{
  "ok": true,
  "action": "spawned_npc",
  "character": { "id": "uuid", "display_name": "Вася (копия)" }
}
```

Возможные значения `action`: `linked_player`, `spawned_npc`, `relinked_active_npc`

---

## Контракт: `purge_active_npcs`

### Запрос

```json
{
  "p_payload": {
    "character_id": "uuid",
    "mode": "archive"
  }
}
```

`mode`:
- `archive` — безопасно скрывает NPC, история сохраняется, можно восстановить
- `hard_delete` — полностью удаляет NPC и все связанные логи / инициативу / ссылки

### Ответ

```json
{ "ok": true }
```

---

## Real-Time: таблицы с включённым Realtime

Фронтенд подписывается на изменения в этих таблицах через Supabase WebSocket.
Real-Time должен быть включён для каждой таблицы в Dashboard → Database → Replication.

| Таблица | Что обновляет на UI |
|---------|---------------------|
| `odyssey_character_body_parts` | Боевое состояние (повреждения частей тела) |
| `odyssey_character_attributes` | Атрибуты персонажа |
| `odyssey_character_equipment_items` | Снаряжение + броня |
| `odyssey_character_items` | Инвентарь (предметы) |
| `odyssey_character_weapons` | Оружие в арсенале |
| `odyssey_character_weapon_profile_states` | Режимы огня, профили оружия |
| `odyssey_character_magazines` | Магазины, снаряжение патронов |
| `odyssey_character_abilities` | Способности |
| `odyssey_character_resource_pools` | Ресурсные пулы (стамина, AP и т.д.) |
| `odyssey_token_links` | Привязки токен↔персонаж (уже в `tokenRealtimeSync.js`) |
| `odyssey_character_combat_state` | Боевое состояние для синхронизации токенов |

---

## Character Buckets

| Bucket | Описание |
|--------|----------|
| `player` | Персонаж игрока. Привязывается к токену напрямую. |
| `npc_template` | Шаблон NPC. При спавне создаётся независимая копия (`npc_active`). |
| `npc_active` | Активный NPC-клон. Существует на конкретной сцене. Можно удалить через `purge_active_npcs`. |

---

## GM Placement Screen — логика работы

Файл: `screens/placement/placementScreen.js`

1. Определяет роль через `bridges.obr.getPlayerInfo()`. Не-GM видит заглушку.
2. Подписывается на выбор токена через `bridges.obr.subscribeSelection()`.
3. При выборе токена — вызывает `get_scene_token_links` для получения текущей привязки.
4. Загружает каталог через `get_character_spawn_catalog` с фильтрами.
5. **Bind / Spawn** → `load_character_to_token`
6. **Unbind** → `unbind_token_character`
7. **Archive / Hard Delete** → `purge_active_npcs` с соответствующим `mode`

---

## Известные ограничения и баги

| Проблема | Статус |
|----------|--------|
| `get_character_inventory` возвращает ошибку 25006 | Фронтенд имеет fallback: читает `odyssey_character_ammo_stock` и `odyssey_character_items` напрямую через REST. После фикса в бекенде fallback отключится автоматически — он используется только если RPC упал. |
| `bridges.obr.subscribeSelection` / `getSceneItems` | Зависит от OBR SDK. В Placement Screen используется `subscribeSelection` для получения выбранного токена. Если OBR недоступен (dev-режим), токен не определится. |
| `tokenRealtimeSync.js` | Управляет синхронизацией token metadata ↔ Supabase. Реализован бекенд-разработчиком отдельно. Фронтенд его не вызывает напрямую — он подключается к runtime внешне. |

---

## Как запустить локально

```bash
npm install
npm run build
```

Билд создаёт три бандла:
- `assets/main.js` — основное расширение OBR
- `gm-extension/assets/main.js` — GM-расширение
- `character-sheet-extension/assets/main.js` — листок персонажа

Для разработки в OBR: загрузить расширение как Local Extension по URL `http://localhost:PORT/index.html`.
Supabase URL и API Key вводятся через вкладку Bridge Shell внутри расширения.
