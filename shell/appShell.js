import { addDiagnosticEntry, clearDiagnosticsEntries, subscribeDiagnostics } from "../utils/diagnostics.js";
import { normalizeError, toErrorMessage } from "../utils/errors.js";
import { escapeHtml } from "../utils/json.js";
import { mountCreatorMenu } from "./creatorMenu.js";
import {
  getPlayerInfo,
  getRoomSceneContext,
  getSelectedOwlbearTokens,
  subscribePlayerChanges,
  subscribeSceneItems,
  waitForObrReady,
} from "../bridge/obrBridge.js";
import {
  loadRoomSupabaseSettings,
  saveRoomSupabaseSettings,
  clearRoomSupabaseSettings,
  hasSupabaseSettings,
  maskSupabaseApiKey,
  normalizeSupabaseSettings,
} from "../bridge/settingsBridge.js";
import { getTokenCharacterLink, setTokenCharacterLink } from "../bridge/tokenBridge.js";
import { testSupabaseConnection } from "../bridge/supabaseBridge.js";

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function describeRole(role) {
  return role === "GM" ? "GM" : "Player";
}

function describeBucket(bucket) {
  switch (String(bucket ?? "").trim()) {
    case "player":
      return "Player";
    case "npc_template":
      return "NPC Template";
    case "npc_active":
      return "NPC Active";
    default:
      return "Unknown";
  }
}

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString();
}

function createShellMarkup(title, subtitle) {
  return `
    <header class="shell-header">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p class="shell-subtitle">${escapeHtml(subtitle)}</p>
      </div>
      <div class="shell-pill">Stage 5 Token Flow</div>
    </header>

    <section class="panel">
      <div class="panel-title">Status</div>
      <div class="status-grid">
        <div class="status-card">
          <span class="status-label">Owlbear</span>
          <strong data-field="owlbearStatus">Connecting...</strong>
        </div>
        <div class="status-card">
          <span class="status-label">Player Role</span>
          <strong data-field="playerRole">...</strong>
        </div>
        <div class="status-card">
          <span class="status-label">Supabase Settings</span>
          <strong data-field="supabaseStatus">...</strong>
        </div>
        <div class="status-card">
          <span class="status-label">Database Bridge</span>
          <strong data-field="bridgeStatus">Ready</strong>
        </div>
      </div>
      <p class="panel-note">The extension stays a thin Owlbear client: RPCs own validation, cloning, token-link records, and character state.</p>
    </section>

    <section class="panel">
      <div class="panel-title">Supabase Connection</div>
      <div class="field-grid">
        <label class="field-stack">
          <span>Supabase URL</span>
          <input data-field="supabaseUrl" type="text" placeholder="https://project.supabase.co" autocomplete="off" spellcheck="false">
        </label>
        <label class="field-stack">
          <span>Public API Key</span>
          <input data-field="supabaseKey" type="password" placeholder="sb_publishable_..." autocomplete="off" spellcheck="false">
        </label>
      </div>
      <div class="button-row">
        <button data-action="saveSettings" type="button">Save Room Settings</button>
        <button data-action="clearSettings" type="button" class="secondary">Clear</button>
        <button data-action="testConnection" type="button" class="secondary">Test Supabase Connection</button>
        <button data-action="refreshShell" type="button" class="secondary">Refresh Status</button>
      </div>
      <p class="muted" data-field="connectionHint">Room-level Supabase settings are not configured yet.</p>
    </section>

    <section class="panel">
      <div class="panel-title">Owlbear Context</div>
      <div class="list" data-field="contextList"></div>
    </section>

    <section class="panel">
      <div class="panel-title">Selected Tokens</div>
      <div class="list" data-field="selectedTokens"></div>
    </section>

    <section class="panel">
      <div class="panel-title">Available Bridge Modules</div>
      <div class="list" data-field="moduleList"></div>
    </section>

    <div data-field="creatorHost"></div>

    <section class="panel">
      <div class="panel-title">Diagnostics</div>
      <div class="button-row">
        <button data-action="clearDiagnostics" type="button" class="secondary">Clear Diagnostics</button>
      </div>
      <div class="diagnostic-log" data-field="diagnostics"></div>
    </section>
  `;
}

function buildContextRows(state) {
  const settings = normalizeSupabaseSettings(state.settings);
  return [
    ["Room ID", state.roomContext.roomId || "Unavailable"],
    ["Scene ID", state.roomContext.sceneId || "Unavailable"],
    ["Player", state.player.name || "Unnamed player"],
    ["Selected Count", String(state.selectedTokens.length)],
    ["Supabase URL", settings.url || "Missing"],
    ["Supabase Key", settings.apiKey ? maskSupabaseApiKey(settings.apiKey) : "Missing"],
  ];
}

function buildSelectedTokenRows(tokens) {
  if (!tokens.length) {
    return '<div class="list-item"><div class="list-item-title">No tokens selected.</div><div class="muted">Select tokens on the Owlbear scene to inspect their minimal metadata links.</div></div>';
  }
  return tokens
    .map((token) => {
      const link = getTokenCharacterLink(token);
      const title = token?.name ? String(token.name) : `Token ${String(token?.id ?? "").slice(0, 8)}`;
      const details = [
        `id: ${String(token?.id ?? "").trim() || "unknown"}`,
        `character_id: ${link.characterId || "not linked"}`,
        `state_version: ${link.stateVersion}`,
        `status_summary: ${link.statusSummary || "none"}`,
      ];
      return `
        <div class="list-item">
          <div class="list-item-title">${escapeHtml(title)}</div>
          <div class="muted">${escapeHtml(details.join(" | "))}</div>
        </div>
      `;
    })
    .join("");
}

function buildModuleRows(runtime) {
  const sections = [
    ["Bridges", Object.keys(runtime.bridges ?? {})],
    ["APIs", Object.keys(runtime.api ?? {})],
    ["Constants", Object.keys(runtime.constants ?? {})],
  ];
  return sections
    .map(([label, values]) => `
      <div class="list-item">
        <div class="list-item-title">${escapeHtml(label)}</div>
        <div class="muted">${escapeHtml((values ?? []).join(", ") || "None")}</div>
      </div>
    `)
    .join("");
}

function buildDiagnosticsRows(entries) {
  if (!entries.length) {
    return '<div class="list-item"><div class="muted">No diagnostics yet.</div></div>';
  }
  return entries
    .map((entry) => `
      <div class="list-item">
        <div class="list-item-title">${escapeHtml(entry.title)}</div>
        <div class="muted">${escapeHtml(entry.level.toUpperCase())} | ${escapeHtml(formatTimestamp(entry.createdAt))}</div>
        ${entry.details ? `<pre>${escapeHtml(entry.details)}</pre>` : ""}
      </div>
    `)
    .join("");
}

export async function mountBridgeShell({
  root,
  title,
  subtitle,
  runtime,
  globalName = "OdysseyBridge",
  features = {},
  tokenRealtimeSync = null,
}) {
  if (!(root instanceof HTMLElement)) {
    throw new Error("Shell root element is missing.");
  }

  await waitForObrReady();

  root.innerHTML = createShellMarkup(title, subtitle);

  const refs = {
    owlbearStatus: root.querySelector('[data-field="owlbearStatus"]'),
    playerRole: root.querySelector('[data-field="playerRole"]'),
    supabaseStatus: root.querySelector('[data-field="supabaseStatus"]'),
    bridgeStatus: root.querySelector('[data-field="bridgeStatus"]'),
    supabaseUrl: root.querySelector('[data-field="supabaseUrl"]'),
    supabaseKey: root.querySelector('[data-field="supabaseKey"]'),
    connectionHint: root.querySelector('[data-field="connectionHint"]'),
    contextList: root.querySelector('[data-field="contextList"]'),
    selectedTokens: root.querySelector('[data-field="selectedTokens"]'),
    moduleList: root.querySelector('[data-field="moduleList"]'),
    diagnostics: root.querySelector('[data-field="diagnostics"]'),
    creatorHost: root.querySelector('[data-field="creatorHost"]'),
  };

  const buttons = {
    saveSettings: root.querySelector('[data-action="saveSettings"]'),
    clearSettings: root.querySelector('[data-action="clearSettings"]'),
    testConnection: root.querySelector('[data-action="testConnection"]'),
    refreshShell: root.querySelector('[data-action="refreshShell"]'),
    clearDiagnostics: root.querySelector('[data-action="clearDiagnostics"]'),
  };

  const state = {
    ready: true,
    player: await getPlayerInfo(),
    roomContext: await getRoomSceneContext(),
    settings: await loadRoomSupabaseSettings(),
    selectedTokens: await getSelectedOwlbearTokens(),
    connectionTest: null,
  };

  const creatorController = features?.creatorTools && refs.creatorHost instanceof HTMLElement
    ? mountCreatorMenu({
        root: refs.creatorHost,
        runtime,
        getPlayer: () => state.player,
        getSettings: () => state.settings,
        onDiagnostic: (level, titleText, details) => addDiagnosticEntry(level, titleText, details),
      })
    : null;

  function syncSettingsInputs() {
    if (refs.supabaseUrl instanceof HTMLInputElement) {
      refs.supabaseUrl.value = state.settings.url;
    }
    if (refs.supabaseKey instanceof HTMLInputElement) {
      refs.supabaseKey.value = state.settings.apiKey;
    }
  }

  function render() {
    const role = describeRole(state.player.role);
    const configured = hasSupabaseSettings(state.settings);
    const canManageRoomSettings = state.player.role === "GM";

    refs.owlbearStatus.textContent = state.ready ? "Connected" : "Not ready";
    refs.playerRole.textContent = role;
    refs.supabaseStatus.textContent = configured ? "Configured" : "Missing";
    refs.bridgeStatus.textContent = state.connectionTest?.ok === false ? "Error" : "Ready";
    refs.connectionHint.textContent = configured
      ? `Room settings are configured. ${canManageRoomSettings ? "GM can update them here." : "Only GM can modify them."}`
      : `Room settings are missing. ${canManageRoomSettings ? "Enter URL and key, then save them to room metadata." : "Ask the GM to configure them."}`;

    refs.contextList.innerHTML = buildContextRows(state)
      .map(
        ([label, value]) => `
          <div class="list-item compact">
            <div class="list-item-title">${escapeHtml(label)}</div>
            <div class="muted">${escapeHtml(value)}</div>
          </div>
        `,
      )
      .join("");
    refs.selectedTokens.innerHTML = buildSelectedTokenRows(state.selectedTokens);
    refs.moduleList.innerHTML = buildModuleRows(runtime);
    buttons.saveSettings.disabled = !canManageRoomSettings;
    buttons.clearSettings.disabled = !canManageRoomSettings;
    refs.supabaseUrl.disabled = !canManageRoomSettings;
    refs.supabaseKey.disabled = !canManageRoomSettings;
  }

  const unsubscribeDiagnostics = subscribeDiagnostics((entries) => {
    refs.diagnostics.innerHTML = buildDiagnosticsRows(entries);
  });

  syncSettingsInputs();
  render();

  async function refreshSnapshot() {
    state.player = await getPlayerInfo();
    state.roomContext = await getRoomSceneContext();
    state.settings = await loadRoomSupabaseSettings();
    state.selectedTokens = await getSelectedOwlbearTokens();
    syncSettingsInputs();
    render();
    creatorController?.syncAccess();
  }

  buttons.saveSettings.addEventListener("click", async () => {
    if (state.player.role !== "GM") {
      addDiagnosticEntry("warn", "Room settings are GM-only", "Only the GM should update room-level Supabase settings.");
      return;
    }
    try {
      state.settings = await saveRoomSupabaseSettings({
        url: refs.supabaseUrl.value,
        apiKey: refs.supabaseKey.value,
      });
      state.connectionTest = null;
      addDiagnosticEntry("info", "Room Supabase settings saved", state.settings.url || "Configured without URL.");
      render();
      creatorController?.syncAccess();
    } catch (error) {
      const normalized = normalizeError(error, "Unable to save room Supabase settings.");
      addDiagnosticEntry("error", normalized.name || "Save failed", normalized.message);
    }
  });

  buttons.clearSettings.addEventListener("click", async () => {
    if (state.player.role !== "GM") {
      addDiagnosticEntry("warn", "Room settings are GM-only", "Only the GM should clear room-level Supabase settings.");
      return;
    }
    try {
      state.settings = await clearRoomSupabaseSettings();
      state.connectionTest = null;
      syncSettingsInputs();
      addDiagnosticEntry("info", "Room Supabase settings cleared");
      if (tokenRealtimeSync?.reconcileNow) {
        await tokenRealtimeSync.reconcileNow("settings-cleared");
      }
      render();
      creatorController?.syncAccess();
    } catch (error) {
      addDiagnosticEntry("error", "Clear failed", toErrorMessage(error, "Unable to clear room Supabase settings."));
    }
  });

  buttons.testConnection.addEventListener("click", async () => {
    const draft = normalizeSupabaseSettings({
      url: refs.supabaseUrl.value,
      apiKey: refs.supabaseKey.value,
    });
    try {
      const result = await testSupabaseConnection(draft);
      state.connectionTest = result;
      addDiagnosticEntry(
        "info",
        "Supabase connection test passed",
        `Sample rows returned: ${result.sampleRowCount}`,
      );
      render();
    } catch (error) {
      state.connectionTest = {
        ok: false,
        message: toErrorMessage(error, "Supabase connection test failed."),
      };
      addDiagnosticEntry(
        "error",
        "Supabase connection test failed",
        state.connectionTest.message,
      );
      render();
    }
  });

  buttons.refreshShell.addEventListener("click", () => {
    void refreshSnapshot()
      .then(() => {
        addDiagnosticEntry("info", "Shell status refreshed");
      })
      .catch((error) => {
        addDiagnosticEntry("error", "Refresh failed", toErrorMessage(error, "Unable to refresh shell state."));
      });
  });

  buttons.clearDiagnostics.addEventListener("click", () => {
    clearDiagnosticsEntries();
  });

  void subscribePlayerChanges(async (player) => {
    state.player = player;
    state.selectedTokens = await getSelectedOwlbearTokens().catch(() => state.selectedTokens);
    render();
    creatorController?.syncAccess();
  });

  void subscribeSceneItems(async () => {
    state.selectedTokens = await getSelectedOwlbearTokens().catch(() => state.selectedTokens);
    render();
  });

  globalThis[globalName] = runtime;
  addDiagnosticEntry(
    "info",
    `${title} ready`,
    `Bridge shell loaded. Global runtime is available as window.${globalName}.`,
  );

  return () => {
    unsubscribeDiagnostics();
  };
}
