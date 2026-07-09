import { mountBridgeShell } from "../shell/appShell.js";
import { createOdysseyRuntime } from "../runtime/createRuntime.js";
import { createTokenRealtimeSync } from "../bridge/tokenRealtimeSync.js";
import { mountPlacementScreen } from "../screens/placement/placementScreen.js";
import { mountCreatorScreen } from "./screens/creator/creatorScreen.js";
import { mountAbilityStudioScreen } from "./screens/abilityStudio/abilityStudioScreen.js";

const runtime = createOdysseyRuntime();
const tokenRealtimeSync = createTokenRealtimeSync({ runtime });
globalThis.OdysseyGmToolsBridge = runtime;
globalThis.OdysseyGmTokenSync = tokenRealtimeSync;

const root = document.getElementById("app");

if (!(root instanceof HTMLElement)) {
  throw new Error("Unable to mount Odyssey GM Tools Shell.");
}

// Tab switcher: GM Tools Shell and Placement Screen
root.innerHTML = `
  <nav class="app-nav">
    <button class="app-tab active" type="button" data-view="shell">GM Tools Shell</button>
    <button class="app-tab" type="button" data-view="creator">Creator</button>
    <button class="app-tab" type="button" data-view="placement">Placement</button>
    <button class="app-tab" type="button" data-view="ability-studio">Ability Studio</button>
  </nav>
  <div class="app-view" data-view-host="shell"></div>
  <div class="app-view hidden" data-view-host="creator"></div>
  <div class="app-view hidden" data-view-host="placement"></div>
  <div class="app-view hidden" data-view-host="ability-studio"></div>
`;

const hosts = {
  shell: root.querySelector('[data-view-host="shell"]'),
  creator: root.querySelector('[data-view-host="creator"]'),
  placement: root.querySelector('[data-view-host="placement"]'),
  "ability-studio": root.querySelector('[data-view-host="ability-studio"]'),
};

const views = {
  shell: {
    mounted: false,
    mount() {
      void mountBridgeShell({
        root: hosts.shell,
        title: "Odyssey GM Tools Shell",
        subtitle:
          "GM token placement, Supabase room settings, and token metadata reconciliation live here. Combat state remains server-authoritative.",
        runtime,
        globalName: "OdysseyGmToolsBridge",
        features: {},
        tokenRealtimeSync,
      }).catch((error) => {
        hosts.shell.innerHTML = `
          <section class="panel">
            <div class="panel-title">Odyssey GM Tools Shell</div>
            <p class="status error">Failed to initialize shell: ${String(error?.message ?? error)}</p>
          </section>
        `;
        throw error;
      });
    },
  },
  creator: {
    mounted: false,
    mount() {
      void mountCreatorScreen({ root: hosts.creator, runtime }).catch((error) => {
        hosts.creator.innerHTML = `
          <section class="panel">
            <div class="panel-title">Creator</div>
            <p class="status error">Failed to initialize creator screen: ${String(error?.message ?? error)}</p>
          </section>
        `;
        throw error;
      });
    },
  },
  placement: {
    mounted: false,
    mount() {
      mountPlacementScreen({ root: hosts.placement, runtime });
    },
  },
  "ability-studio": {
    mounted: false,
    mount() {
      mountAbilityStudioScreen({ root: hosts["ability-studio"], runtime });
    },
  },
};

function show(view) {
  for (const key of Object.keys(hosts)) {
    hosts[key].classList.toggle("hidden", key !== view);
    root.querySelector(`[data-view="${key}"]`)?.classList.toggle("active", key === view);
  }
  const target = views[view];
  if (target && !target.mounted) {
    target.mounted = true;
    target.mount();
  }
  hosts[view]?.dispatchEvent(new CustomEvent("odyssey:tabshow", { bubbles: false }));
}

root.querySelectorAll("[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => show(btn.dataset.view));
});

void tokenRealtimeSync.start().catch(() => {});

show("shell");

globalThis.addEventListener("beforeunload", () => {
  tokenRealtimeSync.stop();
});
