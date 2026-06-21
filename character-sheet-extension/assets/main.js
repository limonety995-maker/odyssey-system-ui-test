var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/events/events.js
var require_events = __commonJS({
  "node_modules/events/events.js"(exports, module) {
    "use strict";
    var R = typeof Reflect === "object" ? Reflect : null;
    var ReflectApply = R && typeof R.apply === "function" ? R.apply : function ReflectApply2(target, receiver, args) {
      return Function.prototype.apply.call(target, receiver, args);
    };
    var ReflectOwnKeys;
    if (R && typeof R.ownKeys === "function") {
      ReflectOwnKeys = R.ownKeys;
    } else if (Object.getOwnPropertySymbols) {
      ReflectOwnKeys = function ReflectOwnKeys2(target) {
        return Object.getOwnPropertyNames(target).concat(Object.getOwnPropertySymbols(target));
      };
    } else {
      ReflectOwnKeys = function ReflectOwnKeys2(target) {
        return Object.getOwnPropertyNames(target);
      };
    }
    function ProcessEmitWarning(warning) {
      if (console && console.warn) console.warn(warning);
    }
    var NumberIsNaN = Number.isNaN || function NumberIsNaN2(value) {
      return value !== value;
    };
    function EventEmitter2() {
      EventEmitter2.init.call(this);
    }
    module.exports = EventEmitter2;
    module.exports.once = once;
    EventEmitter2.EventEmitter = EventEmitter2;
    EventEmitter2.prototype._events = void 0;
    EventEmitter2.prototype._eventsCount = 0;
    EventEmitter2.prototype._maxListeners = void 0;
    var defaultMaxListeners = 10;
    function checkListener(listener) {
      if (typeof listener !== "function") {
        throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
      }
    }
    Object.defineProperty(EventEmitter2, "defaultMaxListeners", {
      enumerable: true,
      get: function() {
        return defaultMaxListeners;
      },
      set: function(arg) {
        if (typeof arg !== "number" || arg < 0 || NumberIsNaN(arg)) {
          throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + ".");
        }
        defaultMaxListeners = arg;
      }
    });
    EventEmitter2.init = function() {
      if (this._events === void 0 || this._events === Object.getPrototypeOf(this)._events) {
        this._events = /* @__PURE__ */ Object.create(null);
        this._eventsCount = 0;
      }
      this._maxListeners = this._maxListeners || void 0;
    };
    EventEmitter2.prototype.setMaxListeners = function setMaxListeners(n) {
      if (typeof n !== "number" || n < 0 || NumberIsNaN(n)) {
        throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + ".");
      }
      this._maxListeners = n;
      return this;
    };
    function _getMaxListeners(that) {
      if (that._maxListeners === void 0)
        return EventEmitter2.defaultMaxListeners;
      return that._maxListeners;
    }
    EventEmitter2.prototype.getMaxListeners = function getMaxListeners() {
      return _getMaxListeners(this);
    };
    EventEmitter2.prototype.emit = function emit(type) {
      var args = [];
      for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
      var doError = type === "error";
      var events = this._events;
      if (events !== void 0)
        doError = doError && events.error === void 0;
      else if (!doError)
        return false;
      if (doError) {
        var er;
        if (args.length > 0)
          er = args[0];
        if (er instanceof Error) {
          throw er;
        }
        var err = new Error("Unhandled error." + (er ? " (" + er.message + ")" : ""));
        err.context = er;
        throw err;
      }
      var handler = events[type];
      if (handler === void 0)
        return false;
      if (typeof handler === "function") {
        ReflectApply(handler, this, args);
      } else {
        var len = handler.length;
        var listeners2 = arrayClone(handler, len);
        for (var i = 0; i < len; ++i)
          ReflectApply(listeners2[i], this, args);
      }
      return true;
    };
    function _addListener(target, type, listener, prepend) {
      var m;
      var events;
      var existing;
      checkListener(listener);
      events = target._events;
      if (events === void 0) {
        events = target._events = /* @__PURE__ */ Object.create(null);
        target._eventsCount = 0;
      } else {
        if (events.newListener !== void 0) {
          target.emit(
            "newListener",
            type,
            listener.listener ? listener.listener : listener
          );
          events = target._events;
        }
        existing = events[type];
      }
      if (existing === void 0) {
        existing = events[type] = listener;
        ++target._eventsCount;
      } else {
        if (typeof existing === "function") {
          existing = events[type] = prepend ? [listener, existing] : [existing, listener];
        } else if (prepend) {
          existing.unshift(listener);
        } else {
          existing.push(listener);
        }
        m = _getMaxListeners(target);
        if (m > 0 && existing.length > m && !existing.warned) {
          existing.warned = true;
          var w = new Error("Possible EventEmitter memory leak detected. " + existing.length + " " + String(type) + " listeners added. Use emitter.setMaxListeners() to increase limit");
          w.name = "MaxListenersExceededWarning";
          w.emitter = target;
          w.type = type;
          w.count = existing.length;
          ProcessEmitWarning(w);
        }
      }
      return target;
    }
    EventEmitter2.prototype.addListener = function addListener(type, listener) {
      return _addListener(this, type, listener, false);
    };
    EventEmitter2.prototype.on = EventEmitter2.prototype.addListener;
    EventEmitter2.prototype.prependListener = function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };
    function onceWrapper() {
      if (!this.fired) {
        this.target.removeListener(this.type, this.wrapFn);
        this.fired = true;
        if (arguments.length === 0)
          return this.listener.call(this.target);
        return this.listener.apply(this.target, arguments);
      }
    }
    function _onceWrap(target, type, listener) {
      var state = { fired: false, wrapFn: void 0, target, type, listener };
      var wrapped = onceWrapper.bind(state);
      wrapped.listener = listener;
      state.wrapFn = wrapped;
      return wrapped;
    }
    EventEmitter2.prototype.once = function once2(type, listener) {
      checkListener(listener);
      this.on(type, _onceWrap(this, type, listener));
      return this;
    };
    EventEmitter2.prototype.prependOnceListener = function prependOnceListener(type, listener) {
      checkListener(listener);
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };
    EventEmitter2.prototype.removeListener = function removeListener(type, listener) {
      var list, events, position, i, originalListener;
      checkListener(listener);
      events = this._events;
      if (events === void 0)
        return this;
      list = events[type];
      if (list === void 0)
        return this;
      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = /* @__PURE__ */ Object.create(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit("removeListener", type, list.listener || listener);
        }
      } else if (typeof list !== "function") {
        position = -1;
        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }
        if (position < 0)
          return this;
        if (position === 0)
          list.shift();
        else {
          spliceOne(list, position);
        }
        if (list.length === 1)
          events[type] = list[0];
        if (events.removeListener !== void 0)
          this.emit("removeListener", type, originalListener || listener);
      }
      return this;
    };
    EventEmitter2.prototype.off = EventEmitter2.prototype.removeListener;
    EventEmitter2.prototype.removeAllListeners = function removeAllListeners(type) {
      var listeners2, events, i;
      events = this._events;
      if (events === void 0)
        return this;
      if (events.removeListener === void 0) {
        if (arguments.length === 0) {
          this._events = /* @__PURE__ */ Object.create(null);
          this._eventsCount = 0;
        } else if (events[type] !== void 0) {
          if (--this._eventsCount === 0)
            this._events = /* @__PURE__ */ Object.create(null);
          else
            delete events[type];
        }
        return this;
      }
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === "removeListener") continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners("removeListener");
        this._events = /* @__PURE__ */ Object.create(null);
        this._eventsCount = 0;
        return this;
      }
      listeners2 = events[type];
      if (typeof listeners2 === "function") {
        this.removeListener(type, listeners2);
      } else if (listeners2 !== void 0) {
        for (i = listeners2.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners2[i]);
        }
      }
      return this;
    };
    function _listeners(target, type, unwrap) {
      var events = target._events;
      if (events === void 0)
        return [];
      var evlistener = events[type];
      if (evlistener === void 0)
        return [];
      if (typeof evlistener === "function")
        return unwrap ? [evlistener.listener || evlistener] : [evlistener];
      return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
    }
    EventEmitter2.prototype.listeners = function listeners2(type) {
      return _listeners(this, type, true);
    };
    EventEmitter2.prototype.rawListeners = function rawListeners(type) {
      return _listeners(this, type, false);
    };
    EventEmitter2.listenerCount = function(emitter, type) {
      if (typeof emitter.listenerCount === "function") {
        return emitter.listenerCount(type);
      } else {
        return listenerCount.call(emitter, type);
      }
    };
    EventEmitter2.prototype.listenerCount = listenerCount;
    function listenerCount(type) {
      var events = this._events;
      if (events !== void 0) {
        var evlistener = events[type];
        if (typeof evlistener === "function") {
          return 1;
        } else if (evlistener !== void 0) {
          return evlistener.length;
        }
      }
      return 0;
    }
    EventEmitter2.prototype.eventNames = function eventNames() {
      return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
    };
    function arrayClone(arr, n) {
      var copy = new Array(n);
      for (var i = 0; i < n; ++i)
        copy[i] = arr[i];
      return copy;
    }
    function spliceOne(list, index) {
      for (; index + 1 < list.length; index++)
        list[index] = list[index + 1];
      list.pop();
    }
    function unwrapListeners(arr) {
      var ret = new Array(arr.length);
      for (var i = 0; i < ret.length; ++i) {
        ret[i] = arr[i].listener || arr[i];
      }
      return ret;
    }
    function once(emitter, name) {
      return new Promise(function(resolve, reject) {
        function errorListener(err) {
          emitter.removeListener(name, resolver);
          reject(err);
        }
        function resolver() {
          if (typeof emitter.removeListener === "function") {
            emitter.removeListener("error", errorListener);
          }
          resolve([].slice.call(arguments));
        }
        ;
        eventTargetAgnosticAddListener(emitter, name, resolver, { once: true });
        if (name !== "error") {
          addErrorHandlerIfEventEmitter(emitter, errorListener, { once: true });
        }
      });
    }
    function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
      if (typeof emitter.on === "function") {
        eventTargetAgnosticAddListener(emitter, "error", handler, flags);
      }
    }
    function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
      if (typeof emitter.on === "function") {
        if (flags.once) {
          emitter.once(name, listener);
        } else {
          emitter.on(name, listener);
        }
      } else if (typeof emitter.addEventListener === "function") {
        emitter.addEventListener(name, function wrapListener(arg) {
          if (flags.once) {
            emitter.removeEventListener(name, wrapListener);
          }
          listener(arg);
        });
      } else {
        throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter);
      }
    }
  }
});

// utils/diagnostics.js
var ENTRY_LIMIT = 40;
var listeners = /* @__PURE__ */ new Set();
var entries = [];
function notify() {
  for (const listener of listeners) {
    try {
      listener(entries.slice());
    } catch (_error) {
    }
  }
}
function getDiagnosticsEntries() {
  return entries.slice();
}
function addDiagnosticEntry(level, title, details2 = "") {
  const entry = {
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    level: String(level ?? "info").trim() || "info",
    title: String(title ?? "").trim() || "Diagnostic",
    details: String(details2 ?? "").trim(),
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  entries = [entry, ...entries].slice(0, ENTRY_LIMIT);
  notify();
  return entry;
}
function clearDiagnosticsEntries() {
  entries = [];
  notify();
}
function subscribeDiagnostics(listener) {
  if (typeof listener !== "function") {
    return () => {
    };
  }
  listeners.add(listener);
  listener(getDiagnosticsEntries());
  return () => {
    listeners.delete(listener);
  };
}

// utils/errors.js
function toErrorMessage(error, fallback = "Unknown error.") {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  if (error && typeof error === "object") {
    const message = String(
      error.message ?? error.error_description ?? error.error ?? error.details ?? ""
    ).trim();
    if (message) return message;
  }
  return fallback;
}
function normalizeError(error, fallback = "Unknown error.") {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: toErrorMessage(error, fallback)
  };
}

// utils/json.js
function safeJsonParse(value, fallback = null) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}
function prettyJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value ?? "");
  }
}
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// bridge/settingsBridge.js
var settingsBridge_exports = {};
__export(settingsBridge_exports, {
  clearRoomSupabaseSettings: () => clearRoomSupabaseSettings,
  hasSupabaseSettings: () => hasSupabaseSettings,
  loadRoomSupabaseSettings: () => loadRoomSupabaseSettings,
  maskSupabaseApiKey: () => maskSupabaseApiKey,
  normalizeSupabaseSettings: () => normalizeSupabaseSettings,
  saveRoomSupabaseSettings: () => saveRoomSupabaseSettings
});

// constants/metadataKeys.js
var metadataKeys_exports = {};
__export(metadataKeys_exports, {
  EXTENSION_ID: () => EXTENSION_ID,
  ROOM_SUPABASE_SETTINGS_KEY: () => ROOM_SUPABASE_SETTINGS_KEY,
  SHELL_GLOBAL_KEY: () => SHELL_GLOBAL_KEY,
  TOKEN_LINK_KEY: () => TOKEN_LINK_KEY,
  hasTokenCharacterLink: () => hasTokenCharacterLink,
  normalizeTokenCharacterLink: () => normalizeTokenCharacterLink
});
var EXTENSION_ID = "com.codex.body-hp";
var ROOM_SUPABASE_SETTINGS_KEY = `${EXTENSION_ID}/supabaseSettings`;
var TOKEN_LINK_KEY = `${EXTENSION_ID}/link`;
var SHELL_GLOBAL_KEY = "OdysseyBridge";
function normalizeTokenCharacterLink(raw) {
  return {
    characterId: String(raw?.characterId ?? raw?.character_id ?? "").trim(),
    stateVersion: Math.max(
      0,
      Number(raw?.stateVersion ?? raw?.state_version ?? 0) || 0
    ),
    statusSummary: String(raw?.statusSummary ?? raw?.status_summary ?? "").trim(),
    updatedAt: String(raw?.updatedAt ?? raw?.updated_at ?? "").trim()
  };
}
function hasTokenCharacterLink(raw) {
  return Boolean(normalizeTokenCharacterLink(raw).characterId);
}

// bridge/obrBridge.js
var obrBridge_exports = {};
__export(obrBridge_exports, {
  OBR: () => lib_default,
  getPlayerInfo: () => getPlayerInfo,
  getRoomMetadata: () => getRoomMetadata,
  getRoomSceneContext: () => getRoomSceneContext,
  getSceneItems: () => getSceneItems,
  getSelectedOwlbearTokens: () => getSelectedOwlbearTokens,
  getSelectedTokenIds: () => getSelectedTokenIds,
  setRoomMetadata: () => setRoomMetadata,
  subscribePlayerChanges: () => subscribePlayerChanges,
  subscribeSceneItems: () => subscribeSceneItems,
  waitForObrReady: () => waitForObrReady
});

// node_modules/@owlbear-rodeo/sdk/lib/api/PlayerApi.js
var __awaiter = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var PlayerApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  get id() {
    if (!this.messageBus.userId) {
      throw Error("Unable to get user ID: not ready");
    }
    return this.messageBus.userId;
  }
  getSelection() {
    return __awaiter(this, void 0, void 0, function* () {
      const { selection } = yield this.messageBus.sendAsync("OBR_PLAYER_GET_SELECTION", {});
      return selection;
    });
  }
  select(items, replace) {
    return __awaiter(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_PLAYER_SELECT", { items, replace });
    });
  }
  deselect(items) {
    return __awaiter(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_PLAYER_DESELECT", { items });
    });
  }
  getName() {
    return __awaiter(this, void 0, void 0, function* () {
      const { name } = yield this.messageBus.sendAsync("OBR_PLAYER_GET_NAME", {});
      return name;
    });
  }
  setName(name) {
    return __awaiter(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_PLAYER_SET_NAME", { name });
    });
  }
  getColor() {
    return __awaiter(this, void 0, void 0, function* () {
      const { color } = yield this.messageBus.sendAsync("OBR_PLAYER_GET_COLOR", {});
      return color;
    });
  }
  setColor(color) {
    return __awaiter(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_PLAYER_SET_COLOR", { color });
    });
  }
  getSyncView() {
    return __awaiter(this, void 0, void 0, function* () {
      const { syncView } = yield this.messageBus.sendAsync("OBR_PLAYER_GET_SYNC_VIEW", {});
      return syncView;
    });
  }
  setSyncView(syncView) {
    return __awaiter(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_PLAYER_SET_SYNC_VIEW", { syncView });
    });
  }
  getId() {
    return __awaiter(this, void 0, void 0, function* () {
      const { id } = yield this.messageBus.sendAsync("OBR_PLAYER_GET_ID", {});
      return id;
    });
  }
  getRole() {
    return __awaiter(this, void 0, void 0, function* () {
      const { role } = yield this.messageBus.sendAsync("OBR_PLAYER_GET_ROLE", {});
      return role;
    });
  }
  getMetadata() {
    return __awaiter(this, void 0, void 0, function* () {
      const { metadata } = yield this.messageBus.sendAsync("OBR_PLAYER_GET_METADATA", {});
      return metadata;
    });
  }
  setMetadata(update) {
    return __awaiter(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_PLAYER_SET_METADATA", { update });
    });
  }
  hasPermission(permission) {
    return __awaiter(this, void 0, void 0, function* () {
      const role = yield this.getRole();
      if (role === "GM") {
        return true;
      }
      const { permissions } = yield this.messageBus.sendAsync("OBR_ROOM_GET_PERMISSIONS", {});
      return permissions.indexOf(permission) > -1;
    });
  }
  getConnectionId() {
    return __awaiter(this, void 0, void 0, function* () {
      const { connectionId } = yield this.messageBus.sendAsync("OBR_PLAYER_GET_CONNECTION_ID", {});
      return connectionId;
    });
  }
  onChange(callback) {
    const handleChange = (data) => {
      callback(data.player);
    };
    this.messageBus.send("OBR_PLAYER_SUBSCRIBE", {});
    this.messageBus.on("OBR_PLAYER_EVENT_CHANGE", handleChange);
    return () => {
      this.messageBus.send("OBR_PLAYER_UNSUBSCRIBE", {});
      this.messageBus.off("OBR_PLAYER_EVENT_CHANGE", handleChange);
    };
  }
};
var PlayerApi_default = PlayerApi;

// node_modules/@owlbear-rodeo/sdk/lib/api/ViewportApi.js
var __awaiter2 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var ViewportApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  reset() {
    return __awaiter2(this, void 0, void 0, function* () {
      const { transform } = yield this.messageBus.sendAsync("OBR_VIEWPORT_RESET", {});
      return transform;
    });
  }
  animateTo(transform) {
    return __awaiter2(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_VIEWPORT_ANIMATE_TO", { transform });
    });
  }
  animateToBounds(bounds) {
    return __awaiter2(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_VIEWPORT_ANIMATE_TO_BOUNDS", {
        bounds
      });
    });
  }
  getPosition() {
    return __awaiter2(this, void 0, void 0, function* () {
      const { position } = yield this.messageBus.sendAsync("OBR_VIEWPORT_GET_POSITION", {});
      return position;
    });
  }
  setPosition(position) {
    return __awaiter2(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_VIEWPORT_SET_POSITION", { position });
    });
  }
  getScale() {
    return __awaiter2(this, void 0, void 0, function* () {
      const { scale } = yield this.messageBus.sendAsync("OBR_VIEWPORT_GET_SCALE", {});
      return scale;
    });
  }
  setScale(scale) {
    return __awaiter2(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_VIEWPORT_SET_SCALE", { scale });
    });
  }
  getWidth() {
    return __awaiter2(this, void 0, void 0, function* () {
      const { width } = yield this.messageBus.sendAsync("OBR_VIEWPORT_GET_WIDTH", {});
      return width;
    });
  }
  getHeight() {
    return __awaiter2(this, void 0, void 0, function* () {
      const { height } = yield this.messageBus.sendAsync("OBR_VIEWPORT_GET_HEIGHT", {});
      return height;
    });
  }
  transformPoint(point) {
    return __awaiter2(this, void 0, void 0, function* () {
      const { point: transformed } = yield this.messageBus.sendAsync("OBR_VIEWPORT_TRANSFORM_POINT", { point });
      return transformed;
    });
  }
  inverseTransformPoint(point) {
    return __awaiter2(this, void 0, void 0, function* () {
      const { point: transformed } = yield this.messageBus.sendAsync("OBR_VIEWPORT_INVERSE_TRANSFORM_POINT", { point });
      return transformed;
    });
  }
};
var ViewportApi_default = ViewportApi;

// node_modules/@owlbear-rodeo/sdk/lib/messages/Message.js
function isMessage(message) {
  return typeof message.id === "string";
}

// node_modules/@owlbear-rodeo/sdk/lib/messages/MessageBus.js
var import_events = __toESM(require_events());

// node_modules/uuid/dist/esm-browser/rng.js
var getRandomValues;
var rnds8 = new Uint8Array(16);
function rng() {
  if (!getRandomValues) {
    getRandomValues = typeof crypto !== "undefined" && crypto.getRandomValues && crypto.getRandomValues.bind(crypto);
    if (!getRandomValues) {
      throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");
    }
  }
  return getRandomValues(rnds8);
}

// node_modules/uuid/dist/esm-browser/stringify.js
var byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]];
}

// node_modules/uuid/dist/esm-browser/native.js
var randomUUID = typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID.bind(crypto);
var native_default = {
  randomUUID
};

// node_modules/uuid/dist/esm-browser/v4.js
function v4(options, buf, offset) {
  if (native_default.randomUUID && !buf && !options) {
    return native_default.randomUUID();
  }
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return unsafeStringify(rnds);
}
var v4_default = v4;

// node_modules/@owlbear-rodeo/sdk/lib/messages/MessageBus.js
var MessageBus = class extends import_events.EventEmitter {
  constructor(origin, roomId) {
    super();
    this.ready = false;
    this.userId = null;
    this.ref = null;
    this.handleMessage = (event) => {
      const message = event.data;
      if (event.origin === this.targetOrigin && isMessage(message)) {
        if (message.id === "OBR_READY") {
          this.ready = true;
          const data = message.data;
          this.ref = data.ref;
          this.userId = data.userId;
        }
        this.emit(message.id, message.data);
      }
    };
    this.send = (id, data, nonce) => {
      var _a;
      if (!this.ref) {
        throw Error("Unable to send message: not ready");
      }
      (_a = window.parent) === null || _a === void 0 ? void 0 : _a.postMessage({
        id,
        data,
        ref: this.ref,
        nonce
      }, this.targetOrigin);
    };
    this.sendAsync = (id, data, timeout = 5e3) => {
      const nonce = `_${v4_default()}`;
      this.send(id, data, nonce);
      return Promise.race([
        new Promise((resolve, reject) => {
          const self = this;
          function onResponse(value) {
            self.off(`${id}_RESPONSE${nonce}`, onResponse);
            self.off(`${id}_ERROR${nonce}`, onError);
            resolve(value);
          }
          function onError(error) {
            self.off(`${id}_RESPONSE${nonce}`, onResponse);
            self.off(`${id}_ERROR${nonce}`, onError);
            reject(error);
          }
          this.on(`${id}_RESPONSE${nonce}`, onResponse);
          this.on(`${id}_ERROR${nonce}`, onError);
        }),
        ...timeout > 0 ? [
          new Promise((_, reject) => window.setTimeout(() => reject(new Error(`Message ${id} took longer than ${timeout}ms to get a result`)), timeout))
        ] : []
      ]);
    };
    this.roomId = roomId;
    this.targetOrigin = origin;
    window.addEventListener("message", this.handleMessage);
    this.setMaxListeners(100);
  }
  destroy() {
    window.removeEventListener("message", this.handleMessage);
  }
};
var MessageBus_default = MessageBus;

// node_modules/@owlbear-rodeo/sdk/lib/api/NotificationApi.js
var __awaiter3 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var NotificationApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  show(message, variant) {
    return __awaiter3(this, void 0, void 0, function* () {
      const { id } = yield this.messageBus.sendAsync("OBR_NOTIFICATION_SHOW", { message, variant });
      return id;
    });
  }
  close(id) {
    return __awaiter3(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_NOTIFICATION_CLOSE", { id });
    });
  }
};
var NotificationApi_default = NotificationApi;

// node_modules/@owlbear-rodeo/sdk/lib/api/scene/SceneFogApi.js
var __awaiter4 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var SceneFogApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  getColor() {
    return __awaiter4(this, void 0, void 0, function* () {
      const { color } = yield this.messageBus.sendAsync("OBR_SCENE_FOG_GET_COLOR", {});
      return color;
    });
  }
  setColor(color) {
    return __awaiter4(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_FOG_SET_COLOR", { color });
    });
  }
  getStrokeWidth() {
    return __awaiter4(this, void 0, void 0, function* () {
      const { strokeWidth } = yield this.messageBus.sendAsync("OBR_SCENE_FOG_GET_STROKE_WIDTH", {});
      return strokeWidth;
    });
  }
  setStrokeWidth(strokeWidth) {
    return __awaiter4(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_FOG_SET_STROKE_WIDTH", {
        strokeWidth
      });
    });
  }
  getFilled() {
    return __awaiter4(this, void 0, void 0, function* () {
      const { filled } = yield this.messageBus.sendAsync("OBR_SCENE_FOG_GET_FILLED", {});
      return filled;
    });
  }
  setFilled(filled) {
    return __awaiter4(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_FOG_SET_FILLED", { filled });
    });
  }
  onChange(callback) {
    const handleChange = (data) => {
      callback(data.fog);
    };
    this.messageBus.send("OBR_SCENE_FOG_SUBSCRIBE", {});
    this.messageBus.on("OBR_SCENE_FOG_EVENT_CHANGE", handleChange);
    return () => {
      this.messageBus.send("OBR_SCENE_FOG_UNSUBSCRIBE", {});
      this.messageBus.off("OBR_SCENE_FOG_EVENT_CHANGE", handleChange);
    };
  }
};
var SceneFogApi_default = SceneFogApi;

// node_modules/@owlbear-rodeo/sdk/lib/api/scene/SceneGridApi.js
var __awaiter5 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var SceneGridApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  getDpi() {
    return __awaiter5(this, void 0, void 0, function* () {
      const { dpi } = yield this.messageBus.sendAsync("OBR_SCENE_GRID_GET_DPI", {});
      return dpi;
    });
  }
  getScale() {
    return __awaiter5(this, void 0, void 0, function* () {
      const scale = yield this.messageBus.sendAsync("OBR_SCENE_GRID_GET_SCALE", {});
      return scale;
    });
  }
  setScale(scale) {
    return __awaiter5(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_GRID_SET_SCALE", { scale });
    });
  }
  getColor() {
    return __awaiter5(this, void 0, void 0, function* () {
      const { color } = yield this.messageBus.sendAsync("OBR_SCENE_GRID_GET_COLOR", {});
      return color;
    });
  }
  setColor(color) {
    return __awaiter5(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_GRID_SET_COLOR", { color });
    });
  }
  getOpacity() {
    return __awaiter5(this, void 0, void 0, function* () {
      const { opacity } = yield this.messageBus.sendAsync("OBR_SCENE_GRID_GET_OPACITY", {});
      return opacity;
    });
  }
  setOpacity(opacity) {
    return __awaiter5(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_GRID_SET_OPACITY", { opacity });
    });
  }
  getType() {
    return __awaiter5(this, void 0, void 0, function* () {
      const { type } = yield this.messageBus.sendAsync("OBR_SCENE_GRID_GET_TYPE", {});
      return type;
    });
  }
  setType(type) {
    return __awaiter5(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_GRID_SET_TYPE", { type });
    });
  }
  getLineType() {
    return __awaiter5(this, void 0, void 0, function* () {
      const { lineType } = yield this.messageBus.sendAsync("OBR_SCENE_GRID_GET_LINE_TYPE", {});
      return lineType;
    });
  }
  setLineType(lineType) {
    return __awaiter5(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_GRID_SET_LINE_TYPE", {
        lineType
      });
    });
  }
  getMeasurement() {
    return __awaiter5(this, void 0, void 0, function* () {
      const { measurement } = yield this.messageBus.sendAsync("OBR_SCENE_GRID_GET_MEASUREMENT", {});
      return measurement;
    });
  }
  setMeasurement(measurement) {
    return __awaiter5(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_GRID_SET_MEASUREMENT", {
        measurement
      });
    });
  }
  getLineWidth() {
    return __awaiter5(this, void 0, void 0, function* () {
      const { lineWidth } = yield this.messageBus.sendAsync("OBR_SCENE_GRID_GET_LINE_WIDTH", {});
      return lineWidth;
    });
  }
  setLineWidth(lineWidth) {
    return __awaiter5(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_GRID_SET_LINE_WIDTH", {
        lineWidth
      });
    });
  }
  snapPosition(position, snappingSensitivity, useCorners, useCenter) {
    return __awaiter5(this, void 0, void 0, function* () {
      const { position: snapped } = yield this.messageBus.sendAsync("OBR_SCENE_GRID_SNAP_POSITION", {
        position,
        snappingSensitivity,
        useCorners,
        useCenter
      });
      return snapped;
    });
  }
  getDistance(from, to) {
    return __awaiter5(this, void 0, void 0, function* () {
      const { distance } = yield this.messageBus.sendAsync("OBR_SCENE_GRID_GET_DISTANCE", { from, to });
      return distance;
    });
  }
  onChange(callback) {
    const handleChange = (data) => {
      callback(data.grid);
    };
    this.messageBus.send("OBR_SCENE_GRID_SUBSCRIBE", {});
    this.messageBus.on("OBR_SCENE_GRID_EVENT_CHANGE", handleChange);
    return () => {
      this.messageBus.send("OBR_SCENE_GRID_UNSUBSCRIBE", {});
      this.messageBus.off("OBR_SCENE_GRID_EVENT_CHANGE", handleChange);
    };
  }
};
var SceneGridApi_default = SceneGridApi;

// node_modules/@owlbear-rodeo/sdk/lib/api/scene/SceneHistoryApi.js
var __awaiter6 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var SceneHistoryApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  undo() {
    return __awaiter6(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_HISTORY_UNDO", {});
    });
  }
  redo() {
    return __awaiter6(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_HISTORY_REDO", {});
    });
  }
  canUndo() {
    return __awaiter6(this, void 0, void 0, function* () {
      const { canUndo } = yield this.messageBus.sendAsync("OBR_SCENE_HISTORY_CAN_UNDO", {});
      return canUndo;
    });
  }
  canRedo() {
    return __awaiter6(this, void 0, void 0, function* () {
      const { canRedo } = yield this.messageBus.sendAsync("OBR_SCENE_HISTORY_CAN_REDO", {});
      return canRedo;
    });
  }
};
var SceneHistoryApi_default = SceneHistoryApi;

// node_modules/immer/dist/immer.mjs
var NOTHING = Symbol.for("immer-nothing");
var DRAFTABLE = Symbol.for("immer-draftable");
var DRAFT_STATE = Symbol.for("immer-state");
var errors = true ? [
  // All error codes, starting by 0:
  function(plugin) {
    return `The plugin for '${plugin}' has not been loaded into Immer. To enable the plugin, import and call \`enable${plugin}()\` when initializing your application.`;
  },
  function(thing) {
    return `produce can only be called on things that are draftable: plain objects, arrays, Map, Set or classes that are marked with '[immerable]: true'. Got '${thing}'`;
  },
  "This object has been frozen and should not be mutated",
  function(data) {
    return "Cannot use a proxy that has been revoked. Did you pass an object from inside an immer function to an async process? " + data;
  },
  "An immer producer returned a new value *and* modified its draft. Either return a new value *or* modify the draft.",
  "Immer forbids circular references",
  "The first or second argument to `produce` must be a function",
  "The third argument to `produce` must be a function or undefined",
  "First argument to `createDraft` must be a plain object, an array, or an immerable object",
  "First argument to `finishDraft` must be a draft returned by `createDraft`",
  function(thing) {
    return `'current' expects a draft, got: ${thing}`;
  },
  "Object.defineProperty() cannot be used on an Immer draft",
  "Object.setPrototypeOf() cannot be used on an Immer draft",
  "Immer only supports deleting array indices",
  "Immer only supports setting array indices and the 'length' property",
  function(thing) {
    return `'original' expects a draft, got: ${thing}`;
  }
  // Note: if more errors are added, the errorOffset in Patches.ts should be increased
  // See Patches.ts for additional errors
] : [];
function die(error, ...args) {
  if (true) {
    const e = errors[error];
    const msg = typeof e === "function" ? e.apply(null, args) : e;
    throw new Error(`[Immer] ${msg}`);
  }
  throw new Error(
    `[Immer] minified error nr: ${error}. Full error at: https://bit.ly/3cXEKWf`
  );
}
var getPrototypeOf = Object.getPrototypeOf;
function isDraft(value) {
  return !!value && !!value[DRAFT_STATE];
}
function isDraftable(value) {
  if (!value)
    return false;
  return isPlainObject(value) || Array.isArray(value) || !!value[DRAFTABLE] || !!value.constructor?.[DRAFTABLE] || isMap(value) || isSet(value);
}
var objectCtorString = Object.prototype.constructor.toString();
var cachedCtorStrings = /* @__PURE__ */ new WeakMap();
function isPlainObject(value) {
  if (!value || typeof value !== "object")
    return false;
  const proto = Object.getPrototypeOf(value);
  if (proto === null || proto === Object.prototype)
    return true;
  const Ctor = Object.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  if (Ctor === Object)
    return true;
  if (typeof Ctor !== "function")
    return false;
  let ctorString = cachedCtorStrings.get(Ctor);
  if (ctorString === void 0) {
    ctorString = Function.toString.call(Ctor);
    cachedCtorStrings.set(Ctor, ctorString);
  }
  return ctorString === objectCtorString;
}
function each(obj, iter, strict = true) {
  if (getArchtype(obj) === 0) {
    const keys = strict ? Reflect.ownKeys(obj) : Object.keys(obj);
    keys.forEach((key) => {
      iter(key, obj[key], obj);
    });
  } else {
    obj.forEach((entry, index) => iter(index, entry, obj));
  }
}
function getArchtype(thing) {
  const state = thing[DRAFT_STATE];
  return state ? state.type_ : Array.isArray(thing) ? 1 : isMap(thing) ? 2 : isSet(thing) ? 3 : 0;
}
function has(thing, prop) {
  return getArchtype(thing) === 2 ? thing.has(prop) : Object.prototype.hasOwnProperty.call(thing, prop);
}
function get(thing, prop) {
  return getArchtype(thing) === 2 ? thing.get(prop) : thing[prop];
}
function set(thing, propOrOldValue, value) {
  const t = getArchtype(thing);
  if (t === 2)
    thing.set(propOrOldValue, value);
  else if (t === 3) {
    thing.add(value);
  } else
    thing[propOrOldValue] = value;
}
function is(x, y) {
  if (x === y) {
    return x !== 0 || 1 / x === 1 / y;
  } else {
    return x !== x && y !== y;
  }
}
function isMap(target) {
  return target instanceof Map;
}
function isSet(target) {
  return target instanceof Set;
}
function latest(state) {
  return state.copy_ || state.base_;
}
function shallowCopy(base, strict) {
  if (isMap(base)) {
    return new Map(base);
  }
  if (isSet(base)) {
    return new Set(base);
  }
  if (Array.isArray(base))
    return Array.prototype.slice.call(base);
  const isPlain = isPlainObject(base);
  if (strict === true || strict === "class_only" && !isPlain) {
    const descriptors = Object.getOwnPropertyDescriptors(base);
    delete descriptors[DRAFT_STATE];
    let keys = Reflect.ownKeys(descriptors);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const desc = descriptors[key];
      if (desc.writable === false) {
        desc.writable = true;
        desc.configurable = true;
      }
      if (desc.get || desc.set)
        descriptors[key] = {
          configurable: true,
          writable: true,
          // could live with !!desc.set as well here...
          enumerable: desc.enumerable,
          value: base[key]
        };
    }
    return Object.create(getPrototypeOf(base), descriptors);
  } else {
    const proto = getPrototypeOf(base);
    if (proto !== null && isPlain) {
      return { ...base };
    }
    const obj = Object.create(proto);
    return Object.assign(obj, base);
  }
}
function freeze(obj, deep = false) {
  if (isFrozen(obj) || isDraft(obj) || !isDraftable(obj))
    return obj;
  if (getArchtype(obj) > 1) {
    Object.defineProperties(obj, {
      set: dontMutateMethodOverride,
      add: dontMutateMethodOverride,
      clear: dontMutateMethodOverride,
      delete: dontMutateMethodOverride
    });
  }
  Object.freeze(obj);
  if (deep)
    Object.values(obj).forEach((value) => freeze(value, true));
  return obj;
}
function dontMutateFrozenCollections() {
  die(2);
}
var dontMutateMethodOverride = {
  value: dontMutateFrozenCollections
};
function isFrozen(obj) {
  if (obj === null || typeof obj !== "object")
    return true;
  return Object.isFrozen(obj);
}
var plugins = {};
function getPlugin(pluginKey) {
  const plugin = plugins[pluginKey];
  if (!plugin) {
    die(0, pluginKey);
  }
  return plugin;
}
function loadPlugin(pluginKey, implementation) {
  if (!plugins[pluginKey])
    plugins[pluginKey] = implementation;
}
var currentScope;
function getCurrentScope() {
  return currentScope;
}
function createScope(parent_, immer_) {
  return {
    drafts_: [],
    parent_,
    immer_,
    // Whenever the modified draft contains a draft from another scope, we
    // need to prevent auto-freezing so the unowned draft can be finalized.
    canAutoFreeze_: true,
    unfinalizedDrafts_: 0
  };
}
function usePatchesInScope(scope, patchListener) {
  if (patchListener) {
    getPlugin("Patches");
    scope.patches_ = [];
    scope.inversePatches_ = [];
    scope.patchListener_ = patchListener;
  }
}
function revokeScope(scope) {
  leaveScope(scope);
  scope.drafts_.forEach(revokeDraft);
  scope.drafts_ = null;
}
function leaveScope(scope) {
  if (scope === currentScope) {
    currentScope = scope.parent_;
  }
}
function enterScope(immer2) {
  return currentScope = createScope(currentScope, immer2);
}
function revokeDraft(draft) {
  const state = draft[DRAFT_STATE];
  if (state.type_ === 0 || state.type_ === 1)
    state.revoke_();
  else
    state.revoked_ = true;
}
function processResult(result, scope) {
  scope.unfinalizedDrafts_ = scope.drafts_.length;
  const baseDraft = scope.drafts_[0];
  const isReplaced = result !== void 0 && result !== baseDraft;
  if (isReplaced) {
    if (baseDraft[DRAFT_STATE].modified_) {
      revokeScope(scope);
      die(4);
    }
    if (isDraftable(result)) {
      result = finalize(scope, result);
      if (!scope.parent_)
        maybeFreeze(scope, result);
    }
    if (scope.patches_) {
      getPlugin("Patches").generateReplacementPatches_(
        baseDraft[DRAFT_STATE].base_,
        result,
        scope.patches_,
        scope.inversePatches_
      );
    }
  } else {
    result = finalize(scope, baseDraft, []);
  }
  revokeScope(scope);
  if (scope.patches_) {
    scope.patchListener_(scope.patches_, scope.inversePatches_);
  }
  return result !== NOTHING ? result : void 0;
}
function finalize(rootScope, value, path) {
  if (isFrozen(value))
    return value;
  const useStrictIteration = rootScope.immer_.shouldUseStrictIteration();
  const state = value[DRAFT_STATE];
  if (!state) {
    each(
      value,
      (key, childValue) => finalizeProperty(rootScope, state, value, key, childValue, path),
      useStrictIteration
    );
    return value;
  }
  if (state.scope_ !== rootScope)
    return value;
  if (!state.modified_) {
    maybeFreeze(rootScope, state.base_, true);
    return state.base_;
  }
  if (!state.finalized_) {
    state.finalized_ = true;
    state.scope_.unfinalizedDrafts_--;
    const result = state.copy_;
    let resultEach = result;
    let isSet2 = false;
    if (state.type_ === 3) {
      resultEach = new Set(result);
      result.clear();
      isSet2 = true;
    }
    each(
      resultEach,
      (key, childValue) => finalizeProperty(
        rootScope,
        state,
        result,
        key,
        childValue,
        path,
        isSet2
      ),
      useStrictIteration
    );
    maybeFreeze(rootScope, result, false);
    if (path && rootScope.patches_) {
      getPlugin("Patches").generatePatches_(
        state,
        path,
        rootScope.patches_,
        rootScope.inversePatches_
      );
    }
  }
  return state.copy_;
}
function finalizeProperty(rootScope, parentState, targetObject, prop, childValue, rootPath, targetIsSet) {
  if (childValue == null) {
    return;
  }
  if (typeof childValue !== "object" && !targetIsSet) {
    return;
  }
  const childIsFrozen = isFrozen(childValue);
  if (childIsFrozen && !targetIsSet) {
    return;
  }
  if (childValue === targetObject)
    die(5);
  if (isDraft(childValue)) {
    const path = rootPath && parentState && parentState.type_ !== 3 && // Set objects are atomic since they have no keys.
    !has(parentState.assigned_, prop) ? rootPath.concat(prop) : void 0;
    const res = finalize(rootScope, childValue, path);
    set(targetObject, prop, res);
    if (isDraft(res)) {
      rootScope.canAutoFreeze_ = false;
    } else
      return;
  } else if (targetIsSet) {
    targetObject.add(childValue);
  }
  if (isDraftable(childValue) && !childIsFrozen) {
    if (!rootScope.immer_.autoFreeze_ && rootScope.unfinalizedDrafts_ < 1) {
      return;
    }
    if (parentState && parentState.base_ && parentState.base_[prop] === childValue && childIsFrozen) {
      return;
    }
    finalize(rootScope, childValue);
    if ((!parentState || !parentState.scope_.parent_) && typeof prop !== "symbol" && (isMap(targetObject) ? targetObject.has(prop) : Object.prototype.propertyIsEnumerable.call(targetObject, prop)))
      maybeFreeze(rootScope, childValue);
  }
}
function maybeFreeze(scope, value, deep = false) {
  if (!scope.parent_ && scope.immer_.autoFreeze_ && scope.canAutoFreeze_) {
    freeze(value, deep);
  }
}
function createProxyProxy(base, parent) {
  const isArray = Array.isArray(base);
  const state = {
    type_: isArray ? 1 : 0,
    // Track which produce call this is associated with.
    scope_: parent ? parent.scope_ : getCurrentScope(),
    // True for both shallow and deep changes.
    modified_: false,
    // Used during finalization.
    finalized_: false,
    // Track which properties have been assigned (true) or deleted (false).
    assigned_: {},
    // The parent draft state.
    parent_: parent,
    // The base state.
    base_: base,
    // The base proxy.
    draft_: null,
    // set below
    // The base copy with any updated values.
    copy_: null,
    // Called by the `produce` function.
    revoke_: null,
    isManual_: false
  };
  let target = state;
  let traps = objectTraps;
  if (isArray) {
    target = [state];
    traps = arrayTraps;
  }
  const { revoke, proxy } = Proxy.revocable(target, traps);
  state.draft_ = proxy;
  state.revoke_ = revoke;
  return proxy;
}
var objectTraps = {
  get(state, prop) {
    if (prop === DRAFT_STATE)
      return state;
    const source = latest(state);
    if (!has(source, prop)) {
      return readPropFromProto(state, source, prop);
    }
    const value = source[prop];
    if (state.finalized_ || !isDraftable(value)) {
      return value;
    }
    if (value === peek(state.base_, prop)) {
      prepareCopy(state);
      return state.copy_[prop] = createProxy(value, state);
    }
    return value;
  },
  has(state, prop) {
    return prop in latest(state);
  },
  ownKeys(state) {
    return Reflect.ownKeys(latest(state));
  },
  set(state, prop, value) {
    const desc = getDescriptorFromProto(latest(state), prop);
    if (desc?.set) {
      desc.set.call(state.draft_, value);
      return true;
    }
    if (!state.modified_) {
      const current2 = peek(latest(state), prop);
      const currentState = current2?.[DRAFT_STATE];
      if (currentState && currentState.base_ === value) {
        state.copy_[prop] = value;
        state.assigned_[prop] = false;
        return true;
      }
      if (is(value, current2) && (value !== void 0 || has(state.base_, prop)))
        return true;
      prepareCopy(state);
      markChanged(state);
    }
    if (state.copy_[prop] === value && // special case: handle new props with value 'undefined'
    (value !== void 0 || prop in state.copy_) || // special case: NaN
    Number.isNaN(value) && Number.isNaN(state.copy_[prop]))
      return true;
    state.copy_[prop] = value;
    state.assigned_[prop] = true;
    return true;
  },
  deleteProperty(state, prop) {
    if (peek(state.base_, prop) !== void 0 || prop in state.base_) {
      state.assigned_[prop] = false;
      prepareCopy(state);
      markChanged(state);
    } else {
      delete state.assigned_[prop];
    }
    if (state.copy_) {
      delete state.copy_[prop];
    }
    return true;
  },
  // Note: We never coerce `desc.value` into an Immer draft, because we can't make
  // the same guarantee in ES5 mode.
  getOwnPropertyDescriptor(state, prop) {
    const owner = latest(state);
    const desc = Reflect.getOwnPropertyDescriptor(owner, prop);
    if (!desc)
      return desc;
    return {
      writable: true,
      configurable: state.type_ !== 1 || prop !== "length",
      enumerable: desc.enumerable,
      value: owner[prop]
    };
  },
  defineProperty() {
    die(11);
  },
  getPrototypeOf(state) {
    return getPrototypeOf(state.base_);
  },
  setPrototypeOf() {
    die(12);
  }
};
var arrayTraps = {};
each(objectTraps, (key, fn) => {
  arrayTraps[key] = function() {
    arguments[0] = arguments[0][0];
    return fn.apply(this, arguments);
  };
});
arrayTraps.deleteProperty = function(state, prop) {
  if (isNaN(parseInt(prop)))
    die(13);
  return arrayTraps.set.call(this, state, prop, void 0);
};
arrayTraps.set = function(state, prop, value) {
  if (prop !== "length" && isNaN(parseInt(prop)))
    die(14);
  return objectTraps.set.call(this, state[0], prop, value, state[0]);
};
function peek(draft, prop) {
  const state = draft[DRAFT_STATE];
  const source = state ? latest(state) : draft;
  return source[prop];
}
function readPropFromProto(state, source, prop) {
  const desc = getDescriptorFromProto(source, prop);
  return desc ? `value` in desc ? desc.value : (
    // This is a very special case, if the prop is a getter defined by the
    // prototype, we should invoke it with the draft as context!
    desc.get?.call(state.draft_)
  ) : void 0;
}
function getDescriptorFromProto(source, prop) {
  if (!(prop in source))
    return void 0;
  let proto = getPrototypeOf(source);
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (desc)
      return desc;
    proto = getPrototypeOf(proto);
  }
  return void 0;
}
function markChanged(state) {
  if (!state.modified_) {
    state.modified_ = true;
    if (state.parent_) {
      markChanged(state.parent_);
    }
  }
}
function prepareCopy(state) {
  if (!state.copy_) {
    state.copy_ = shallowCopy(
      state.base_,
      state.scope_.immer_.useStrictShallowCopy_
    );
  }
}
var Immer2 = class {
  constructor(config) {
    this.autoFreeze_ = true;
    this.useStrictShallowCopy_ = false;
    this.useStrictIteration_ = true;
    this.produce = (base, recipe, patchListener) => {
      if (typeof base === "function" && typeof recipe !== "function") {
        const defaultBase = recipe;
        recipe = base;
        const self = this;
        return function curriedProduce(base2 = defaultBase, ...args) {
          return self.produce(base2, (draft) => recipe.call(this, draft, ...args));
        };
      }
      if (typeof recipe !== "function")
        die(6);
      if (patchListener !== void 0 && typeof patchListener !== "function")
        die(7);
      let result;
      if (isDraftable(base)) {
        const scope = enterScope(this);
        const proxy = createProxy(base, void 0);
        let hasError = true;
        try {
          result = recipe(proxy);
          hasError = false;
        } finally {
          if (hasError)
            revokeScope(scope);
          else
            leaveScope(scope);
        }
        usePatchesInScope(scope, patchListener);
        return processResult(result, scope);
      } else if (!base || typeof base !== "object") {
        result = recipe(base);
        if (result === void 0)
          result = base;
        if (result === NOTHING)
          result = void 0;
        if (this.autoFreeze_)
          freeze(result, true);
        if (patchListener) {
          const p = [];
          const ip = [];
          getPlugin("Patches").generateReplacementPatches_(base, result, p, ip);
          patchListener(p, ip);
        }
        return result;
      } else
        die(1, base);
    };
    this.produceWithPatches = (base, recipe) => {
      if (typeof base === "function") {
        return (state, ...args) => this.produceWithPatches(state, (draft) => base(draft, ...args));
      }
      let patches, inversePatches;
      const result = this.produce(base, recipe, (p, ip) => {
        patches = p;
        inversePatches = ip;
      });
      return [result, patches, inversePatches];
    };
    if (typeof config?.autoFreeze === "boolean")
      this.setAutoFreeze(config.autoFreeze);
    if (typeof config?.useStrictShallowCopy === "boolean")
      this.setUseStrictShallowCopy(config.useStrictShallowCopy);
    if (typeof config?.useStrictIteration === "boolean")
      this.setUseStrictIteration(config.useStrictIteration);
  }
  createDraft(base) {
    if (!isDraftable(base))
      die(8);
    if (isDraft(base))
      base = current(base);
    const scope = enterScope(this);
    const proxy = createProxy(base, void 0);
    proxy[DRAFT_STATE].isManual_ = true;
    leaveScope(scope);
    return proxy;
  }
  finishDraft(draft, patchListener) {
    const state = draft && draft[DRAFT_STATE];
    if (!state || !state.isManual_)
      die(9);
    const { scope_: scope } = state;
    usePatchesInScope(scope, patchListener);
    return processResult(void 0, scope);
  }
  /**
   * Pass true to automatically freeze all copies created by Immer.
   *
   * By default, auto-freezing is enabled.
   */
  setAutoFreeze(value) {
    this.autoFreeze_ = value;
  }
  /**
   * Pass true to enable strict shallow copy.
   *
   * By default, immer does not copy the object descriptors such as getter, setter and non-enumrable properties.
   */
  setUseStrictShallowCopy(value) {
    this.useStrictShallowCopy_ = value;
  }
  /**
   * Pass false to use faster iteration that skips non-enumerable properties
   * but still handles symbols for compatibility.
   *
   * By default, strict iteration is enabled (includes all own properties).
   */
  setUseStrictIteration(value) {
    this.useStrictIteration_ = value;
  }
  shouldUseStrictIteration() {
    return this.useStrictIteration_;
  }
  applyPatches(base, patches) {
    let i;
    for (i = patches.length - 1; i >= 0; i--) {
      const patch = patches[i];
      if (patch.path.length === 0 && patch.op === "replace") {
        base = patch.value;
        break;
      }
    }
    if (i > -1) {
      patches = patches.slice(i + 1);
    }
    const applyPatchesImpl = getPlugin("Patches").applyPatches_;
    if (isDraft(base)) {
      return applyPatchesImpl(base, patches);
    }
    return this.produce(
      base,
      (draft) => applyPatchesImpl(draft, patches)
    );
  }
};
function createProxy(value, parent) {
  const draft = isMap(value) ? getPlugin("MapSet").proxyMap_(value, parent) : isSet(value) ? getPlugin("MapSet").proxySet_(value, parent) : createProxyProxy(value, parent);
  const scope = parent ? parent.scope_ : getCurrentScope();
  scope.drafts_.push(draft);
  return draft;
}
function current(value) {
  if (!isDraft(value))
    die(10, value);
  return currentImpl(value);
}
function currentImpl(value) {
  if (!isDraftable(value) || isFrozen(value))
    return value;
  const state = value[DRAFT_STATE];
  let copy;
  let strict = true;
  if (state) {
    if (!state.modified_)
      return state.base_;
    state.finalized_ = true;
    copy = shallowCopy(value, state.scope_.immer_.useStrictShallowCopy_);
    strict = state.scope_.immer_.shouldUseStrictIteration();
  } else {
    copy = shallowCopy(value, true);
  }
  each(
    copy,
    (key, childValue) => {
      set(copy, key, currentImpl(childValue));
    },
    strict
  );
  if (state) {
    state.finalized_ = false;
  }
  return copy;
}
function enablePatches() {
  const errorOffset = 16;
  if (true) {
    errors.push(
      'Sets cannot have "replace" patches.',
      function(op) {
        return "Unsupported patch operation: " + op;
      },
      function(path) {
        return "Cannot apply patch, path doesn't resolve: " + path;
      },
      "Patching reserved attributes like __proto__, prototype and constructor is not allowed"
    );
  }
  const REPLACE = "replace";
  const ADD = "add";
  const REMOVE = "remove";
  function generatePatches_(state, basePath, patches, inversePatches) {
    switch (state.type_) {
      case 0:
      case 2:
        return generatePatchesFromAssigned(
          state,
          basePath,
          patches,
          inversePatches
        );
      case 1:
        return generateArrayPatches(state, basePath, patches, inversePatches);
      case 3:
        return generateSetPatches(
          state,
          basePath,
          patches,
          inversePatches
        );
    }
  }
  function generateArrayPatches(state, basePath, patches, inversePatches) {
    let { base_, assigned_ } = state;
    let copy_ = state.copy_;
    if (copy_.length < base_.length) {
      ;
      [base_, copy_] = [copy_, base_];
      [patches, inversePatches] = [inversePatches, patches];
    }
    for (let i = 0; i < base_.length; i++) {
      if (assigned_[i] && copy_[i] !== base_[i]) {
        const path = basePath.concat([i]);
        patches.push({
          op: REPLACE,
          path,
          // Need to maybe clone it, as it can in fact be the original value
          // due to the base/copy inversion at the start of this function
          value: clonePatchValueIfNeeded(copy_[i])
        });
        inversePatches.push({
          op: REPLACE,
          path,
          value: clonePatchValueIfNeeded(base_[i])
        });
      }
    }
    for (let i = base_.length; i < copy_.length; i++) {
      const path = basePath.concat([i]);
      patches.push({
        op: ADD,
        path,
        // Need to maybe clone it, as it can in fact be the original value
        // due to the base/copy inversion at the start of this function
        value: clonePatchValueIfNeeded(copy_[i])
      });
    }
    for (let i = copy_.length - 1; base_.length <= i; --i) {
      const path = basePath.concat([i]);
      inversePatches.push({
        op: REMOVE,
        path
      });
    }
  }
  function generatePatchesFromAssigned(state, basePath, patches, inversePatches) {
    const { base_, copy_ } = state;
    each(state.assigned_, (key, assignedValue) => {
      const origValue = get(base_, key);
      const value = get(copy_, key);
      const op = !assignedValue ? REMOVE : has(base_, key) ? REPLACE : ADD;
      if (origValue === value && op === REPLACE)
        return;
      const path = basePath.concat(key);
      patches.push(op === REMOVE ? { op, path } : { op, path, value });
      inversePatches.push(
        op === ADD ? { op: REMOVE, path } : op === REMOVE ? { op: ADD, path, value: clonePatchValueIfNeeded(origValue) } : { op: REPLACE, path, value: clonePatchValueIfNeeded(origValue) }
      );
    });
  }
  function generateSetPatches(state, basePath, patches, inversePatches) {
    let { base_, copy_ } = state;
    let i = 0;
    base_.forEach((value) => {
      if (!copy_.has(value)) {
        const path = basePath.concat([i]);
        patches.push({
          op: REMOVE,
          path,
          value
        });
        inversePatches.unshift({
          op: ADD,
          path,
          value
        });
      }
      i++;
    });
    i = 0;
    copy_.forEach((value) => {
      if (!base_.has(value)) {
        const path = basePath.concat([i]);
        patches.push({
          op: ADD,
          path,
          value
        });
        inversePatches.unshift({
          op: REMOVE,
          path,
          value
        });
      }
      i++;
    });
  }
  function generateReplacementPatches_(baseValue, replacement, patches, inversePatches) {
    patches.push({
      op: REPLACE,
      path: [],
      value: replacement === NOTHING ? void 0 : replacement
    });
    inversePatches.push({
      op: REPLACE,
      path: [],
      value: baseValue
    });
  }
  function applyPatches_(draft, patches) {
    patches.forEach((patch) => {
      const { path, op } = patch;
      let base = draft;
      for (let i = 0; i < path.length - 1; i++) {
        const parentType = getArchtype(base);
        let p = path[i];
        if (typeof p !== "string" && typeof p !== "number") {
          p = "" + p;
        }
        if ((parentType === 0 || parentType === 1) && (p === "__proto__" || p === "constructor"))
          die(errorOffset + 3);
        if (typeof base === "function" && p === "prototype")
          die(errorOffset + 3);
        base = get(base, p);
        if (typeof base !== "object")
          die(errorOffset + 2, path.join("/"));
      }
      const type = getArchtype(base);
      const value = deepClonePatchValue(patch.value);
      const key = path[path.length - 1];
      switch (op) {
        case REPLACE:
          switch (type) {
            case 2:
              return base.set(key, value);
            case 3:
              die(errorOffset);
            default:
              return base[key] = value;
          }
        case ADD:
          switch (type) {
            case 1:
              return key === "-" ? base.push(value) : base.splice(key, 0, value);
            case 2:
              return base.set(key, value);
            case 3:
              return base.add(value);
            default:
              return base[key] = value;
          }
        case REMOVE:
          switch (type) {
            case 1:
              return base.splice(key, 1);
            case 2:
              return base.delete(key);
            case 3:
              return base.delete(patch.value);
            default:
              return delete base[key];
          }
        default:
          die(errorOffset + 1, op);
      }
    });
    return draft;
  }
  function deepClonePatchValue(obj) {
    if (!isDraftable(obj))
      return obj;
    if (Array.isArray(obj))
      return obj.map(deepClonePatchValue);
    if (isMap(obj))
      return new Map(
        Array.from(obj.entries()).map(([k, v]) => [k, deepClonePatchValue(v)])
      );
    if (isSet(obj))
      return new Set(Array.from(obj).map(deepClonePatchValue));
    const cloned = Object.create(getPrototypeOf(obj));
    for (const key in obj)
      cloned[key] = deepClonePatchValue(obj[key]);
    if (has(obj, DRAFTABLE))
      cloned[DRAFTABLE] = obj[DRAFTABLE];
    return cloned;
  }
  function clonePatchValueIfNeeded(obj) {
    if (isDraft(obj)) {
      return deepClonePatchValue(obj);
    } else
      return obj;
  }
  loadPlugin("Patches", {
    applyPatches_,
    generatePatches_,
    generateReplacementPatches_
  });
}
var immer = new Immer2();
var produce = immer.produce;
var produceWithPatches = /* @__PURE__ */ immer.produceWithPatches.bind(
  immer
);

// node_modules/@owlbear-rodeo/sdk/lib/api/scene/SceneItemsApi.js
var __awaiter7 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
enablePatches();
var SceneItemsApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  getItems(filter) {
    return __awaiter7(this, void 0, void 0, function* () {
      if (Array.isArray(filter)) {
        const { items } = yield this.messageBus.sendAsync("OBR_SCENE_ITEMS_GET_ITEMS", { ids: filter });
        return items;
      } else if (filter) {
        const { items } = yield this.messageBus.sendAsync("OBR_SCENE_ITEMS_GET_ALL_ITEMS", {});
        return items.filter(filter);
      } else {
        const { items } = yield this.messageBus.sendAsync("OBR_SCENE_ITEMS_GET_ALL_ITEMS", {});
        return items;
      }
    });
  }
  isItemArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item !== "string");
  }
  updateItems(filterOrItems, update) {
    return __awaiter7(this, void 0, void 0, function* () {
      let items;
      if (this.isItemArray(filterOrItems)) {
        items = filterOrItems;
      } else {
        items = yield this.getItems(filterOrItems);
      }
      const [nextState, patches] = produceWithPatches(items, update);
      const nextUpdates = nextState.map((item) => ({
        id: item.id,
        type: item.type
      }));
      for (const patch of patches) {
        const [index, key] = patch.path;
        if (typeof index === "number" && typeof key === "string") {
          nextUpdates[index][key] = nextState[index][key];
        }
      }
      const updates = nextUpdates.filter(
        // Ensure that there are updates besides the default ID and type
        (update2) => Object.keys(update2).length > 2
      );
      if (updates.length === 0) {
        return;
      }
      yield this.messageBus.sendAsync("OBR_SCENE_ITEMS_UPDATE_ITEMS", {
        updates
      });
    });
  }
  addItems(items) {
    return __awaiter7(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_ITEMS_ADD_ITEMS", {
        items
      });
    });
  }
  deleteItems(ids) {
    return __awaiter7(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_ITEMS_DELETE_ITEMS", {
        ids
      });
    });
  }
  getItemAttachments(ids) {
    return __awaiter7(this, void 0, void 0, function* () {
      const { items } = yield this.messageBus.sendAsync("OBR_SCENE_ITEMS_GET_ITEM_ATTACHMENTS", { ids });
      return items;
    });
  }
  getItemBounds(ids) {
    return __awaiter7(this, void 0, void 0, function* () {
      const { bounds } = yield this.messageBus.sendAsync("OBR_SCENE_ITEMS_GET_ITEM_BOUNDS", { ids });
      return bounds;
    });
  }
  onChange(callback) {
    const handleChange = (data) => {
      callback(data.items);
    };
    this.messageBus.send("OBR_SCENE_ITEMS_SUBSCRIBE", {});
    this.messageBus.on("OBR_SCENE_ITEMS_EVENT_CHANGE", handleChange);
    return () => {
      this.messageBus.send("OBR_SCENE_ITEMS_UNSUBSCRIBE", {});
      this.messageBus.off("OBR_SCENE_ITEMS_EVENT_CHANGE", handleChange);
    };
  }
};
var SceneItemsApi_default = SceneItemsApi;

// node_modules/@owlbear-rodeo/sdk/lib/api/scene/SceneLocalApi.js
var __awaiter8 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
enablePatches();
var SceneLocalApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  getItems(filter) {
    return __awaiter8(this, void 0, void 0, function* () {
      if (Array.isArray(filter)) {
        const { items } = yield this.messageBus.sendAsync("OBR_SCENE_LOCAL_GET_ITEMS", { ids: filter });
        return items;
      } else if (filter) {
        const { items } = yield this.messageBus.sendAsync("OBR_SCENE_LOCAL_GET_ALL_ITEMS", {});
        return items.filter(filter);
      } else {
        const { items } = yield this.messageBus.sendAsync("OBR_SCENE_LOCAL_GET_ALL_ITEMS", {});
        return items;
      }
    });
  }
  isItemArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item !== "string");
  }
  updateItems(filterOrItems, update, fastUpdate) {
    return __awaiter8(this, void 0, void 0, function* () {
      let items;
      if (this.isItemArray(filterOrItems)) {
        items = filterOrItems;
      } else {
        items = yield this.getItems(filterOrItems);
      }
      const [nextState, patches] = produceWithPatches(items, update);
      const nextUpdates = nextState.map((item) => ({
        id: item.id,
        type: item.type
      }));
      for (const patch of patches) {
        const [index, key] = patch.path;
        if (typeof index === "number" && typeof key === "string") {
          nextUpdates[index][key] = nextState[index][key];
        }
      }
      const updates = nextUpdates.filter(
        // Ensure that there are updates besides the default ID and type
        (update2) => Object.keys(update2).length > 2
      );
      if (updates.length === 0) {
        return;
      }
      yield this.messageBus.sendAsync("OBR_SCENE_LOCAL_UPDATE_ITEMS", {
        updates,
        fastUpdate
      });
    });
  }
  addItems(items) {
    return __awaiter8(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_LOCAL_ADD_ITEMS", {
        items
      });
    });
  }
  deleteItems(ids) {
    return __awaiter8(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_LOCAL_DELETE_ITEMS", {
        ids
      });
    });
  }
  getItemAttachments(ids) {
    return __awaiter8(this, void 0, void 0, function* () {
      const { items } = yield this.messageBus.sendAsync("OBR_SCENE_LOCAL_GET_ITEM_ATTACHMENTS", { ids });
      return items;
    });
  }
  getItemBounds(ids) {
    return __awaiter8(this, void 0, void 0, function* () {
      const { bounds } = yield this.messageBus.sendAsync("OBR_SCENE_LOCAL_GET_ITEM_BOUNDS", { ids });
      return bounds;
    });
  }
  onChange(callback) {
    const handleChange = (data) => {
      callback(data.items);
    };
    this.messageBus.send("OBR_SCENE_LOCAL_SUBSCRIBE", {});
    this.messageBus.on("OBR_SCENE_LOCAL_EVENT_CHANGE", handleChange);
    return () => {
      this.messageBus.send("OBR_SCENE_LOCAL_UNSUBSCRIBE", {});
      this.messageBus.off("OBR_SCENE_LOCAL_EVENT_CHANGE", handleChange);
    };
  }
};
var SceneLocalApi_default = SceneLocalApi;

// node_modules/@owlbear-rodeo/sdk/lib/api/scene/SceneApi.js
var __awaiter9 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var SceneApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
    this.grid = new SceneGridApi_default(messageBus2);
    this.fog = new SceneFogApi_default(messageBus2);
    this.history = new SceneHistoryApi_default(messageBus2);
    this.items = new SceneItemsApi_default(messageBus2);
    this.local = new SceneLocalApi_default(messageBus2);
  }
  isReady() {
    return __awaiter9(this, void 0, void 0, function* () {
      const { ready } = yield this.messageBus.sendAsync("OBR_SCENE_IS_READY", {});
      return ready;
    });
  }
  onReadyChange(callback) {
    const handleChange = (data) => {
      callback(data.ready);
    };
    this.messageBus.send("OBR_SCENE_READY_SUBSCRIBE", {});
    this.messageBus.on("OBR_SCENE_EVENT_READY_CHANGE", handleChange);
    return () => {
      this.messageBus.send("OBR_SCENE_READY_UNSUBSCRIBE", {});
      this.messageBus.off("OBR_SCENE_EVENT_READY_CHANGE", handleChange);
    };
  }
  getMetadata() {
    return __awaiter9(this, void 0, void 0, function* () {
      const { metadata } = yield this.messageBus.sendAsync("OBR_SCENE_GET_METADATA", {});
      return metadata;
    });
  }
  setMetadata(update) {
    return __awaiter9(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_SCENE_SET_METADATA", { update });
    });
  }
  onMetadataChange(callback) {
    const handleChange = (data) => {
      callback(data.metadata);
    };
    this.messageBus.send("OBR_SCENE_METADATA_SUBSCRIBE", {});
    this.messageBus.on("OBR_SCENE_METADATA_EVENT_CHANGE", handleChange);
    return () => {
      this.messageBus.send("OBR_SCENE_METADATA_UNSUBSCRIBE", {});
      this.messageBus.off("OBR_SCENE_METADATA_EVENT_CHANGE", handleChange);
    };
  }
};
var SceneApi_default = SceneApi;

// node_modules/@owlbear-rodeo/sdk/lib/common/normalize.js
function normalizeUrl(url) {
  return url.startsWith("http") ? url : `${window.location.origin}${url}`;
}
function normalizeIconPaths(icons) {
  return icons.map((base) => Object.assign(Object.assign({}, base), { icon: normalizeUrl(base.icon) }));
}
function normalizeUrlObject(urlObject) {
  return Object.assign(Object.assign({}, urlObject), { url: normalizeUrl(urlObject.url) });
}

// node_modules/@owlbear-rodeo/sdk/lib/api/ContextMenuApi.js
var __awaiter10 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var ContextMenuApi = class {
  constructor(messageBus2) {
    this.contextMenus = {};
    this.handleClick = (event) => {
      var _a;
      const menu = this.contextMenus[event.id];
      if (menu) {
        (_a = menu.onClick) === null || _a === void 0 ? void 0 : _a.call(menu, event.context, event.elementId);
      }
    };
    this.messageBus = messageBus2;
    messageBus2.on("OBR_CONTEXT_MENU_EVENT_CLICK", this.handleClick);
  }
  create(contextMenu) {
    return __awaiter10(this, void 0, void 0, function* () {
      this.messageBus.sendAsync("OBR_CONTEXT_MENU_CREATE", {
        id: contextMenu.id,
        shortcut: contextMenu.shortcut,
        icons: normalizeIconPaths(contextMenu.icons),
        embed: contextMenu.embed && normalizeUrlObject(contextMenu.embed)
      });
      this.contextMenus[contextMenu.id] = contextMenu;
    });
  }
  remove(id) {
    return __awaiter10(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_CONTEXT_MENU_REMOVE", { id });
      delete this.contextMenus[id];
    });
  }
};
var ContextMenuApi_default = ContextMenuApi;

// node_modules/@owlbear-rodeo/sdk/lib/api/ToolApi.js
var __awaiter11 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var ToolApi = class {
  constructor(messageBus2) {
    this.tools = {};
    this.toolActions = {};
    this.toolModes = {};
    this.handleToolClick = (event) => {
      const tool = this.tools[event.id];
      if (tool) {
        if (tool.onClick) {
          const result = tool.onClick(event.context, event.elementId);
          Promise.resolve(result).then((activate) => {
            if (activate) {
              this.messageBus.send("OBR_TOOL_ACTIVATE", {
                id: event.id
              });
            }
          });
        } else {
          this.messageBus.send("OBR_TOOL_ACTIVATE", {
            id: event.id
          });
        }
      }
    };
    this.handleToolActionClick = (event) => {
      var _a;
      const action = this.toolActions[event.id];
      if (action) {
        (_a = action.onClick) === null || _a === void 0 ? void 0 : _a.call(action, event.context, event.elementId);
      }
    };
    this.handleToolModeClick = (event) => {
      const mode = this.toolModes[event.id];
      if (mode) {
        if (mode.onClick) {
          const result = mode.onClick(event.context, event.elementId);
          Promise.resolve(result).then((activate) => {
            if (activate) {
              this.messageBus.send("OBR_TOOL_MODE_ACTIVATE", {
                toolId: event.context.activeTool,
                modeId: event.id
              });
            }
          });
        } else {
          this.messageBus.send("OBR_TOOL_MODE_ACTIVATE", {
            toolId: event.context.activeTool,
            modeId: event.id
          });
        }
      }
    };
    this.handleToolModeToolClick = (event) => {
      const mode = this.toolModes[event.id];
      if (mode) {
        if (mode.onToolClick) {
          const result = mode.onToolClick(event.context, event.event);
          Promise.resolve(result).then((select) => {
            if (select && event.event.target && !event.event.target.locked) {
              this.messageBus.sendAsync("OBR_PLAYER_SELECT", {
                items: [event.event.target.id]
              });
            }
          });
        } else {
          if (event.event.target && !event.event.target.locked) {
            this.messageBus.sendAsync("OBR_PLAYER_SELECT", {
              items: [event.event.target.id]
            });
          }
        }
      }
    };
    this.handleToolModeToolDoubleClick = (event) => {
      const mode = this.toolModes[event.id];
      if (mode) {
        if (mode.onToolDoubleClick) {
          const result = mode.onToolDoubleClick(event.context, event.event);
          Promise.resolve(result).then((select) => {
            if (select && event.event.target) {
              this.messageBus.sendAsync("OBR_PLAYER_SELECT", {
                items: [event.event.target.id]
              });
            }
          });
        } else {
          if (event.event.target) {
            this.messageBus.sendAsync("OBR_PLAYER_SELECT", {
              items: [event.event.target.id]
            });
          }
        }
      }
    };
    this.handleToolModeToolDown = (event) => {
      var _a;
      const mode = this.toolModes[event.id];
      if (mode) {
        (_a = mode.onToolDown) === null || _a === void 0 ? void 0 : _a.call(mode, event.context, event.event);
      }
    };
    this.handleToolModeToolMove = (event) => {
      var _a;
      const mode = this.toolModes[event.id];
      if (mode) {
        (_a = mode.onToolMove) === null || _a === void 0 ? void 0 : _a.call(mode, event.context, event.event);
      }
    };
    this.handleToolModeToolUp = (event) => {
      var _a;
      const mode = this.toolModes[event.id];
      if (mode) {
        (_a = mode.onToolUp) === null || _a === void 0 ? void 0 : _a.call(mode, event.context, event.event);
      }
    };
    this.handleToolModeToolDragStart = (event) => {
      var _a;
      const mode = this.toolModes[event.id];
      if (mode) {
        (_a = mode.onToolDragStart) === null || _a === void 0 ? void 0 : _a.call(mode, event.context, event.event);
      }
    };
    this.handleToolModeToolDragMove = (event) => {
      var _a;
      const mode = this.toolModes[event.id];
      if (mode) {
        (_a = mode.onToolDragMove) === null || _a === void 0 ? void 0 : _a.call(mode, event.context, event.event);
      }
    };
    this.handleToolModeToolDragEnd = (event) => {
      var _a;
      const mode = this.toolModes[event.id];
      if (mode) {
        (_a = mode.onToolDragEnd) === null || _a === void 0 ? void 0 : _a.call(mode, event.context, event.event);
      }
    };
    this.handleToolModeToolDragCancel = (event) => {
      var _a;
      const mode = this.toolModes[event.id];
      if (mode) {
        (_a = mode.onToolDragCancel) === null || _a === void 0 ? void 0 : _a.call(mode, event.context, event.event);
      }
    };
    this.handleToolModeKeyDown = (event) => {
      var _a;
      const mode = this.toolModes[event.id];
      if (mode) {
        (_a = mode.onKeyDown) === null || _a === void 0 ? void 0 : _a.call(mode, event.context, event.event);
      }
    };
    this.handleToolModeKeyUp = (event) => {
      var _a;
      const mode = this.toolModes[event.id];
      if (mode) {
        (_a = mode.onKeyUp) === null || _a === void 0 ? void 0 : _a.call(mode, event.context, event.event);
      }
    };
    this.handleToolModeActivate = (event) => {
      var _a;
      const mode = this.toolModes[event.id];
      if (mode) {
        (_a = mode.onActivate) === null || _a === void 0 ? void 0 : _a.call(mode, event.context);
      }
    };
    this.handleToolModeDeactivate = (event) => {
      var _a;
      const mode = this.toolModes[event.id];
      if (mode) {
        (_a = mode.onDeactivate) === null || _a === void 0 ? void 0 : _a.call(mode, event.context);
      }
    };
    this.messageBus = messageBus2;
    messageBus2.on("OBR_TOOL_EVENT_CLICK", this.handleToolClick);
    messageBus2.on("OBR_TOOL_ACTION_EVENT_CLICK", this.handleToolActionClick);
    messageBus2.on("OBR_TOOL_MODE_EVENT_CLICK", this.handleToolModeClick);
    messageBus2.on("OBR_TOOL_MODE_EVENT_TOOL_CLICK", this.handleToolModeToolClick);
    messageBus2.on("OBR_TOOL_MODE_EVENT_TOOL_DOUBLE_CLICK", this.handleToolModeToolDoubleClick);
    messageBus2.on("OBR_TOOL_MODE_EVENT_TOOL_DOWN", this.handleToolModeToolDown);
    messageBus2.on("OBR_TOOL_MODE_EVENT_TOOL_MOVE", this.handleToolModeToolMove);
    messageBus2.on("OBR_TOOL_MODE_EVENT_TOOL_UP", this.handleToolModeToolUp);
    messageBus2.on("OBR_TOOL_MODE_EVENT_TOOL_DRAG_START", this.handleToolModeToolDragStart);
    messageBus2.on("OBR_TOOL_MODE_EVENT_TOOL_DRAG_MOVE", this.handleToolModeToolDragMove);
    messageBus2.on("OBR_TOOL_MODE_EVENT_TOOL_DRAG_END", this.handleToolModeToolDragEnd);
    messageBus2.on("OBR_TOOL_MODE_EVENT_TOOL_DRAG_CANCEL", this.handleToolModeToolDragCancel);
    messageBus2.on("OBR_TOOL_MODE_EVENT_KEY_DOWN", this.handleToolModeKeyDown);
    messageBus2.on("OBR_TOOL_MODE_EVENT_KEY_UP", this.handleToolModeKeyUp);
    messageBus2.on("OBR_TOOL_MODE_EVENT_ACTIVATE", this.handleToolModeActivate);
    messageBus2.on("OBR_TOOL_MODE_EVENT_DEACTIVATE", this.handleToolModeDeactivate);
  }
  create(tool) {
    return __awaiter11(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_TOOL_CREATE", {
        id: tool.id,
        shortcut: tool.shortcut,
        defaultMode: tool.defaultMode,
        defaultMetadata: tool.defaultMetadata,
        icons: normalizeIconPaths(tool.icons),
        disabled: tool.disabled
      });
      this.tools[tool.id] = tool;
    });
  }
  remove(id) {
    return __awaiter11(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_TOOL_REMOVE", { id });
      delete this.tools[id];
    });
  }
  activateTool(id) {
    return __awaiter11(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_TOOL_ACTIVATE", { id });
    });
  }
  getActiveTool() {
    return __awaiter11(this, void 0, void 0, function* () {
      const { id } = yield this.messageBus.sendAsync("OBR_TOOL_GET_ACTIVE", {});
      return id;
    });
  }
  onToolChange(callback) {
    const handleChange = (data) => {
      callback(data.id);
    };
    this.messageBus.send("OBR_TOOL_ACTIVE_SUBSCRIBE", {});
    this.messageBus.on("OBR_TOOL_ACTIVE_EVENT_CHANGE", handleChange);
    return () => {
      this.messageBus.send("OBR_TOOL_ACTIVE_UNSUBSCRIBE", {});
      this.messageBus.off("OBR_TOOL_ACTIVE_EVENT_CHANGE", handleChange);
    };
  }
  getMetadata(id) {
    return __awaiter11(this, void 0, void 0, function* () {
      const { metadata } = yield this.messageBus.sendAsync("OBR_TOOL_GET_METADATA", { id });
      return metadata;
    });
  }
  setMetadata(toolId, update) {
    return __awaiter11(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_TOOL_SET_METADATA", {
        toolId,
        update
      });
    });
  }
  createAction(action) {
    return __awaiter11(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_TOOL_ACTION_CREATE", {
        id: action.id,
        shortcut: action.shortcut,
        icons: normalizeIconPaths(action.icons),
        disabled: action.disabled
      });
      this.toolActions[action.id] = action;
    });
  }
  removeAction(id) {
    return __awaiter11(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_TOOL_ACTION_REMOVE", { id });
      delete this.tools[id];
    });
  }
  createMode(mode) {
    return __awaiter11(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_TOOL_MODE_CREATE", {
        id: mode.id,
        shortcut: mode.shortcut,
        icons: normalizeIconPaths(mode.icons),
        preventDrag: mode.preventDrag,
        disabled: mode.disabled,
        cursors: mode.cursors
      });
      this.toolModes[mode.id] = mode;
    });
  }
  removeMode(id) {
    return __awaiter11(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_TOOL_MODE_REMOVE", { id });
      delete this.tools[id];
    });
  }
  activateMode(toolId, modeId) {
    return __awaiter11(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_TOOL_MODE_ACTIVATE", {
        toolId,
        modeId
      });
    });
  }
  getActiveToolMode() {
    return __awaiter11(this, void 0, void 0, function* () {
      const { id } = yield this.messageBus.sendAsync("OBR_TOOL_MODE_GET_ACTIVE", {});
      return id;
    });
  }
  onToolModeChange(callback) {
    const handleChange = (data) => {
      callback(data.id);
    };
    this.messageBus.send("OBR_TOOL_MODE_ACTIVE_SUBSCRIBE", {});
    this.messageBus.on("OBR_TOOL_MODE_ACTIVE_EVENT_CHANGE", handleChange);
    return () => {
      this.messageBus.send("OBR_TOOL_MODE_ACTIVE_UNSUBSCRIBE", {});
      this.messageBus.off("OBR_TOOL_MODE_ACTIVE_EVENT_CHANGE", handleChange);
    };
  }
};
var ToolApi_default = ToolApi;

// node_modules/@owlbear-rodeo/sdk/lib/api/PopoverApi.js
var __awaiter12 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var PopoverApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  open(popover) {
    return __awaiter12(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_POPOVER_OPEN", Object.assign({}, normalizeUrlObject(popover)));
    });
  }
  close(id) {
    return __awaiter12(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_POPOVER_CLOSE", { id });
    });
  }
  getWidth(id) {
    return __awaiter12(this, void 0, void 0, function* () {
      const { width } = yield this.messageBus.sendAsync("OBR_POPOVER_GET_WIDTH", { id });
      return width;
    });
  }
  setWidth(id, width) {
    return __awaiter12(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_POPOVER_SET_WIDTH", { id, width });
    });
  }
  getHeight(id) {
    return __awaiter12(this, void 0, void 0, function* () {
      const { height } = yield this.messageBus.sendAsync("OBR_POPOVER_GET_HEIGHT", { id });
      return height;
    });
  }
  setHeight(id, height) {
    return __awaiter12(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_POPOVER_SET_HEIGHT", { id, height });
    });
  }
};
var PopoverApi_default = PopoverApi;

// node_modules/@owlbear-rodeo/sdk/lib/api/ModalApi.js
var __awaiter13 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var ModalApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  open(modal) {
    return __awaiter13(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_MODAL_OPEN", Object.assign({}, normalizeUrlObject(modal)));
    });
  }
  close(id) {
    return __awaiter13(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_MODAL_CLOSE", { id });
    });
  }
};
var ModalApi_default = ModalApi;

// node_modules/@owlbear-rodeo/sdk/lib/api/ActionApi.js
var __awaiter14 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var ActionApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  getWidth() {
    return __awaiter14(this, void 0, void 0, function* () {
      const { width } = yield this.messageBus.sendAsync("OBR_ACTION_GET_WIDTH", {});
      return width;
    });
  }
  setWidth(width) {
    return __awaiter14(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_ACTION_SET_WIDTH", { width });
    });
  }
  getHeight() {
    return __awaiter14(this, void 0, void 0, function* () {
      const { height } = yield this.messageBus.sendAsync("OBR_ACTION_GET_HEIGHT", {});
      return height;
    });
  }
  setHeight(height) {
    return __awaiter14(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_ACTION_SET_HEIGHT", { height });
    });
  }
  getBadgeText() {
    return __awaiter14(this, void 0, void 0, function* () {
      const { badgeText } = yield this.messageBus.sendAsync("OBR_ACTION_GET_BADGE_TEXT", {});
      return badgeText;
    });
  }
  setBadgeText(badgeText) {
    return __awaiter14(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_ACTION_SET_BADGE_TEXT", { badgeText });
    });
  }
  getBadgeBackgroundColor() {
    return __awaiter14(this, void 0, void 0, function* () {
      const { badgeBackgroundColor } = yield this.messageBus.sendAsync("OBR_ACTION_GET_BADGE_BACKGROUND_COLOR", {});
      return badgeBackgroundColor;
    });
  }
  setBadgeBackgroundColor(badgeBackgroundColor) {
    return __awaiter14(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_ACTION_SET_BADGE_BACKGROUND_COLOR", {
        badgeBackgroundColor
      });
    });
  }
  getIcon() {
    return __awaiter14(this, void 0, void 0, function* () {
      const { icon } = yield this.messageBus.sendAsync("OBR_ACTION_GET_ICON", {});
      return icon;
    });
  }
  setIcon(icon) {
    return __awaiter14(this, void 0, void 0, function* () {
      const data = normalizeIconPaths([{ icon }]);
      yield this.messageBus.sendAsync("OBR_ACTION_SET_ICON", {
        icon: data[0].icon
      });
    });
  }
  getTitle() {
    return __awaiter14(this, void 0, void 0, function* () {
      const { title } = yield this.messageBus.sendAsync("OBR_ACTION_GET_TITLE", {});
      return title;
    });
  }
  setTitle(title) {
    return __awaiter14(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_ACTION_SET_TITLE", { title });
    });
  }
  isOpen() {
    return __awaiter14(this, void 0, void 0, function* () {
      const { isOpen } = yield this.messageBus.sendAsync("OBR_ACTION_GET_IS_OPEN", {});
      return isOpen;
    });
  }
  open() {
    return __awaiter14(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_ACTION_OPEN", {});
    });
  }
  close() {
    return __awaiter14(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_ACTION_CLOSE", {});
    });
  }
  onOpenChange(callback) {
    const handleChange = (data) => {
      callback(data.isOpen);
    };
    this.messageBus.send("OBR_ACTION_IS_OPEN_SUBSCRIBE", {});
    this.messageBus.on("OBR_ACTION_IS_OPEN_EVENT_CHANGE", handleChange);
    return () => {
      this.messageBus.send("OBR_IS_OPEN_ACTION_UNSUBSCRIBE", {});
      this.messageBus.off("OBR_ACTION_IS_OPEN_EVENT_CHANGE", handleChange);
    };
  }
};
var ActionApi_default = ActionApi;

// node_modules/@owlbear-rodeo/sdk/lib/api/InteractionApi.js
var __awaiter15 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
enablePatches();
var InteractionApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  startItemInteraction(baseState) {
    return __awaiter15(this, void 0, void 0, function* () {
      const { id } = yield this.messageBus.sendAsync("OBR_INTERACTION_START_ITEM_INTERACTION", { baseState });
      let prev = baseState;
      const dispatcher = (update) => {
        const [next, patches] = produceWithPatches(prev, update);
        prev = next;
        this.messageBus.send("OBR_INTERACTION_UPDATE_ITEM_INTERACTION", {
          id,
          patches
        });
        return next;
      };
      const stop = () => {
        this.messageBus.send("OBR_INTERACTION_STOP_ITEM_INTERACTION", { id });
      };
      return [dispatcher, stop];
    });
  }
};
var InteractionApi_default = InteractionApi;

// node_modules/@owlbear-rodeo/sdk/lib/api/PartyApi.js
var __awaiter16 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var PartyApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  getPlayers() {
    return __awaiter16(this, void 0, void 0, function* () {
      const { players } = yield this.messageBus.sendAsync("OBR_PARTY_GET_PLAYERS", {});
      return players;
    });
  }
  onChange(callback) {
    const handleChange = (data) => {
      callback(data.players);
    };
    this.messageBus.send("OBR_PARTY_SUBSCRIBE", {});
    this.messageBus.on("OBR_PARTY_EVENT_CHANGE", handleChange);
    return () => {
      this.messageBus.send("OBR_PARTY_UNSUBSCRIBE", {});
      this.messageBus.off("OBR_PARTY_EVENT_CHANGE", handleChange);
    };
  }
};
var PartyApi_default = PartyApi;

// node_modules/@owlbear-rodeo/sdk/lib/api/RoomApi.js
var __awaiter17 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var RoomApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  get id() {
    return this.messageBus.roomId;
  }
  getPermissions() {
    return __awaiter17(this, void 0, void 0, function* () {
      const { permissions } = yield this.messageBus.sendAsync("OBR_ROOM_GET_PERMISSIONS", {});
      return permissions;
    });
  }
  getMetadata() {
    return __awaiter17(this, void 0, void 0, function* () {
      const { metadata } = yield this.messageBus.sendAsync("OBR_ROOM_GET_METADATA", {});
      return metadata;
    });
  }
  setMetadata(update) {
    return __awaiter17(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_ROOM_SET_METADATA", { update });
    });
  }
  onMetadataChange(callback) {
    const handleChange = (data) => {
      callback(data.metadata);
    };
    this.messageBus.send("OBR_ROOM_METADATA_SUBSCRIBE", {});
    this.messageBus.on("OBR_ROOM_METADATA_EVENT_CHANGE", handleChange);
    return () => {
      this.messageBus.send("OBR_METADATA_ROOM_UNSUBSCRIBE", {});
      this.messageBus.off("OBR_ROOM_METADATA_EVENT_CHANGE", handleChange);
    };
  }
  onPermissionsChange(callback) {
    const handleChange = (data) => {
      callback(data.permissions);
    };
    this.messageBus.send("OBR_ROOM_PERMISSIONS_SUBSCRIBE", {});
    this.messageBus.on("OBR_ROOM_PERMISSIONS_EVENT_CHANGE", handleChange);
    return () => {
      this.messageBus.send("OBR_PERMISSIONS_ROOM_UNSUBSCRIBE", {});
      this.messageBus.off("OBR_ROOM_PERMISSIONS_EVENT_CHANGE", handleChange);
    };
  }
};
var RoomApi_default = RoomApi;

// node_modules/@owlbear-rodeo/sdk/lib/api/ThemeApi.js
var __awaiter18 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var ThemeApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  getTheme() {
    return __awaiter18(this, void 0, void 0, function* () {
      const { theme } = yield this.messageBus.sendAsync("OBR_THEME_GET_THEME", {});
      return theme;
    });
  }
  onChange(callback) {
    const handleChange = (data) => {
      callback(data.theme);
    };
    this.messageBus.send("OBR_THEME_SUBSCRIBE", {});
    this.messageBus.on("OBR_THEME_EVENT_CHANGE", handleChange);
    return () => {
      this.messageBus.send("OBR_THEME_UNSUBSCRIBE", {});
      this.messageBus.off("OBR_THEME_EVENT_CHANGE", handleChange);
    };
  }
};
var ThemeApi_default = ThemeApi;

// node_modules/@owlbear-rodeo/sdk/lib/api/AssetsApi.js
var __awaiter19 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var AssetsApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  uploadImages(images, typeHint) {
    return __awaiter19(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_ASSETS_UPLOAD_IMAGES", {
        images,
        typeHint
      });
    });
  }
  uploadScenes(scenes, disableShowScenes) {
    return __awaiter19(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_ASSETS_UPLOAD_SCENES", {
        scenes,
        disableShowScenes
      });
    });
  }
  downloadImages(multiple, defaultSearch, typeHint) {
    return __awaiter19(this, void 0, void 0, function* () {
      const { images } = yield this.messageBus.sendAsync("OBR_ASSETS_DOWNLOAD_IMAGES", { multiple, defaultSearch, typeHint }, -1);
      return images;
    });
  }
  downloadScenes(multiple, defaultSearch) {
    return __awaiter19(this, void 0, void 0, function* () {
      const { scenes } = yield this.messageBus.sendAsync("OBR_ASSETS_DOWNLOAD_SCENES", { multiple, defaultSearch }, -1);
      return scenes;
    });
  }
};
var AssetsApi_default = AssetsApi;

// node_modules/@owlbear-rodeo/sdk/lib/api/BroadcastApi.js
var __awaiter20 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var BroadcastApi = class {
  constructor(messageBus2) {
    this.messageBus = messageBus2;
  }
  sendMessage(channel, data, options) {
    return __awaiter20(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_BROADCAST_SEND_MESSAGE", {
        channel,
        data,
        options
      });
    });
  }
  onMessage(channel, callback) {
    this.messageBus.send("OBR_BROADCAST_SUBSCRIBE", { channel });
    this.messageBus.on(`OBR_BROADCAST_MESSAGE_${channel}`, callback);
    return () => {
      this.messageBus.send("OBR_BROADCAST_UNSUBSCRIBE", { channel });
      this.messageBus.off(`OBR_BROADCAST_MESSAGE_${channel}`, callback);
    };
  }
};
var BroadcastApi_default = BroadcastApi;

// node_modules/js-base64/base64.mjs
var _hasBuffer = typeof Buffer === "function";
var _TD = typeof TextDecoder === "function" ? new TextDecoder() : void 0;
var _TE = typeof TextEncoder === "function" ? new TextEncoder() : void 0;
var b64ch = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
var b64chs = Array.prototype.slice.call(b64ch);
var b64tab = ((a) => {
  let tab = {};
  a.forEach((c, i) => tab[c] = i);
  return tab;
})(b64chs);
var b64re = /^(?:[A-Za-z\d+\/]{4})*?(?:[A-Za-z\d+\/]{2}(?:==)?|[A-Za-z\d+\/]{3}=?)?$/;
var _fromCC = String.fromCharCode.bind(String);
var _U8Afrom = typeof Uint8Array.from === "function" ? Uint8Array.from.bind(Uint8Array) : (it) => new Uint8Array(Array.prototype.slice.call(it, 0));
var _tidyB64 = (s) => s.replace(/[^A-Za-z0-9\+\/]/g, "");
var re_btou = /[\xC0-\xDF][\x80-\xBF]|[\xE0-\xEF][\x80-\xBF]{2}|[\xF0-\xF7][\x80-\xBF]{3}/g;
var cb_btou = (cccc) => {
  switch (cccc.length) {
    case 4:
      var cp = (7 & cccc.charCodeAt(0)) << 18 | (63 & cccc.charCodeAt(1)) << 12 | (63 & cccc.charCodeAt(2)) << 6 | 63 & cccc.charCodeAt(3), offset = cp - 65536;
      return _fromCC((offset >>> 10) + 55296) + _fromCC((offset & 1023) + 56320);
    case 3:
      return _fromCC((15 & cccc.charCodeAt(0)) << 12 | (63 & cccc.charCodeAt(1)) << 6 | 63 & cccc.charCodeAt(2));
    default:
      return _fromCC((31 & cccc.charCodeAt(0)) << 6 | 63 & cccc.charCodeAt(1));
  }
};
var btou = (b) => b.replace(re_btou, cb_btou);
var atobPolyfill = (asc) => {
  asc = asc.replace(/\s+/g, "");
  if (!b64re.test(asc))
    throw new TypeError("malformed base64.");
  asc += "==".slice(2 - (asc.length & 3));
  let u24, r1, r2;
  let binArray = [];
  for (let i = 0; i < asc.length; ) {
    u24 = b64tab[asc.charAt(i++)] << 18 | b64tab[asc.charAt(i++)] << 12 | (r1 = b64tab[asc.charAt(i++)]) << 6 | (r2 = b64tab[asc.charAt(i++)]);
    if (r1 === 64) {
      binArray.push(_fromCC(u24 >> 16 & 255));
    } else if (r2 === 64) {
      binArray.push(_fromCC(u24 >> 16 & 255, u24 >> 8 & 255));
    } else {
      binArray.push(_fromCC(u24 >> 16 & 255, u24 >> 8 & 255, u24 & 255));
    }
  }
  return binArray.join("");
};
var _atob = typeof atob === "function" ? (asc) => atob(_tidyB64(asc)) : _hasBuffer ? (asc) => Buffer.from(asc, "base64").toString("binary") : atobPolyfill;
var _toUint8Array = _hasBuffer ? (a) => _U8Afrom(Buffer.from(a, "base64")) : (a) => _U8Afrom(_atob(a).split("").map((c) => c.charCodeAt(0)));
var _decode = _hasBuffer ? (a) => Buffer.from(a, "base64").toString("utf8") : _TD ? (a) => _TD.decode(_toUint8Array(a)) : (a) => btou(_atob(a));
var _unURI = (a) => _tidyB64(a.replace(/[-_]/g, (m0) => m0 == "-" ? "+" : "/"));
var decode = (src) => _decode(_unURI(src));

// node_modules/@owlbear-rodeo/sdk/lib/common/getDetails.js
function getDetails() {
  const urlSearchParams = new URLSearchParams(window.location.search);
  const ref = urlSearchParams.get("obrref");
  let origin = "";
  let roomId = "";
  if (ref) {
    const decodedRef = decode(ref);
    const parts = decodedRef.split(" ");
    if (parts.length === 2) {
      origin = parts[0];
      roomId = parts[1];
    }
  }
  return { origin, roomId };
}

// node_modules/@owlbear-rodeo/sdk/lib/types/items/Path.js
var Command;
(function(Command2) {
  Command2[Command2["MOVE"] = 0] = "MOVE";
  Command2[Command2["LINE"] = 1] = "LINE";
  Command2[Command2["QUAD"] = 2] = "QUAD";
  Command2[Command2["CONIC"] = 3] = "CONIC";
  Command2[Command2["CUBIC"] = 4] = "CUBIC";
  Command2[Command2["CLOSE"] = 5] = "CLOSE";
})(Command || (Command = {}));

// node_modules/@owlbear-rodeo/sdk/lib/index.js
var details = getDetails();
var messageBus = new MessageBus_default(details.origin, details.roomId);
var viewportApi = new ViewportApi_default(messageBus);
var playerApi = new PlayerApi_default(messageBus);
var partyApi = new PartyApi_default(messageBus);
var notificationApi = new NotificationApi_default(messageBus);
var sceneApi = new SceneApi_default(messageBus);
var contextMenuApi = new ContextMenuApi_default(messageBus);
var toolApi = new ToolApi_default(messageBus);
var popoverApi = new PopoverApi_default(messageBus);
var modalApi = new ModalApi_default(messageBus);
var actionApi = new ActionApi_default(messageBus);
var interactionApi = new InteractionApi_default(messageBus);
var roomApi = new RoomApi_default(messageBus);
var themeApi = new ThemeApi_default(messageBus);
var assetsApi = new AssetsApi_default(messageBus);
var broadcastApi = new BroadcastApi_default(messageBus);
var OBR = {
  onReady: (callback) => {
    if (messageBus.ready) {
      callback();
    } else {
      messageBus.once("OBR_READY", () => callback());
    }
  },
  get isReady() {
    return messageBus.ready;
  },
  viewport: viewportApi,
  player: playerApi,
  party: partyApi,
  notification: notificationApi,
  scene: sceneApi,
  contextMenu: contextMenuApi,
  tool: toolApi,
  popover: popoverApi,
  modal: modalApi,
  action: actionApi,
  interaction: interactionApi,
  room: roomApi,
  theme: themeApi,
  assets: assetsApi,
  broadcast: broadcastApi,
  /** True if the current site is embedded in an instance of Owlbear Rodeo */
  isAvailable: Boolean(details.origin)
};
var lib_default = OBR;

// bridge/obrBridge.js
var readyPromise = null;
function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}
function normalizePlayer(player = {}) {
  return {
    id: String(player?.id ?? "").trim(),
    name: String(player?.name ?? "").trim(),
    role: String(player?.role ?? "PLAYER").trim().toUpperCase() || "PLAYER",
    color: String(player?.color ?? "").trim(),
    selection: ensureArray(player?.selection).map((value) => String(value ?? "").trim()).filter(Boolean)
  };
}
function waitForObrReady() {
  if (!readyPromise) {
    readyPromise = new Promise((resolve) => {
      lib_default.onReady(() => resolve(lib_default));
    });
  }
  return readyPromise;
}
async function getPlayerInfo() {
  await waitForObrReady();
  const [role, id, name, selection] = await Promise.all([
    lib_default.player.getRole().catch(() => "PLAYER"),
    lib_default.player.getId().catch(() => ""),
    lib_default.player.getName().catch(() => ""),
    lib_default.player.getSelection().catch(() => [])
  ]);
  return normalizePlayer({ role, id, name, selection });
}
async function getSelectedTokenIds() {
  await waitForObrReady();
  const selection = await lib_default.player.getSelection().catch(() => []);
  return ensureArray(selection).map((value) => String(value ?? "").trim()).filter(Boolean);
}
async function getSceneItems() {
  await waitForObrReady();
  return ensureArray(await lib_default.scene.items.getItems().catch(() => []));
}
async function getSelectedOwlbearTokens() {
  const [selectionIds, items] = await Promise.all([
    getSelectedTokenIds(),
    getSceneItems()
  ]);
  const selectedSet = new Set(selectionIds);
  return items.filter((item) => selectedSet.has(String(item?.id ?? "").trim()));
}
async function getRoomMetadata() {
  await waitForObrReady();
  return await lib_default.room.getMetadata().catch(() => ({})) ?? {};
}
async function setRoomMetadata(patch) {
  await waitForObrReady();
  await lib_default.room.setMetadata(patch ?? {});
  return getRoomMetadata();
}
async function getRoomSceneContext() {
  await waitForObrReady();
  const roomId = String(lib_default.room?.id ?? "").trim();
  return {
    campaignId: roomId,
    roomId,
    sceneId: roomId
  };
}
async function subscribePlayerChanges(listener) {
  await waitForObrReady();
  let active = true;
  lib_default.player.onChange((player) => {
    if (!active) return;
    listener(normalizePlayer(player));
  });
  return () => {
    active = false;
  };
}
async function subscribeSceneItems(listener) {
  await waitForObrReady();
  let active = true;
  lib_default.scene.items.onChange((items) => {
    if (!active) return;
    listener(ensureArray(items));
  });
  return () => {
    active = false;
  };
}

// bridge/settingsBridge.js
function normalizeSupabaseSettings(raw) {
  return {
    url: String(raw?.url ?? "").trim().replace(/\/+$/, ""),
    apiKey: String(raw?.apiKey ?? raw?.anonKey ?? "").trim()
  };
}
function hasSupabaseSettings(settings) {
  const normalized = normalizeSupabaseSettings(settings);
  return Boolean(normalized.url && normalized.apiKey);
}
function maskSupabaseApiKey(value) {
  const normalized = String(value ?? "").trim();
  if (normalized.length <= 10) {
    return normalized ? "********" : "";
  }
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}
async function loadRoomSupabaseSettings() {
  const metadata = await getRoomMetadata();
  return normalizeSupabaseSettings(metadata?.[ROOM_SUPABASE_SETTINGS_KEY]);
}
async function saveRoomSupabaseSettings(settings) {
  const normalized = normalizeSupabaseSettings(settings);
  await setRoomMetadata({
    [ROOM_SUPABASE_SETTINGS_KEY]: normalized
  });
  return normalized;
}
async function clearRoomSupabaseSettings() {
  return saveRoomSupabaseSettings({
    url: "",
    apiKey: ""
  });
}

// shell/creatorMenu.js
var CREATOR_TABS = Object.freeze([
  { id: "weapons", label: "Weapons" },
  { id: "items", label: "Items" },
  { id: "calibers", label: "Calibers" },
  { id: "ammo", label: "Ammo" },
  { id: "magazines", label: "Magazines" },
  { id: "skills", label: "Skills" },
  { id: "effects", label: "Effects" },
  { id: "abilities", label: "Abilities" },
  { id: "equipment", label: "Equipment Models" }
]);
var RELOAD_MODES = Object.freeze([
  { value: "", label: "No reload item" },
  { value: "reset", label: "Reset" },
  { value: "per_charge", label: "Per Charge" }
]);
var ITEM_TYPE_OPTIONS = Object.freeze([
  { value: "resource", label: "Resource" },
  { value: "consumable", label: "Consumable" },
  { value: "medical", label: "Medical" },
  { value: "tool", label: "Tool" },
  { value: "quest", label: "Quest" },
  { value: "custom", label: "Custom" }
]);
var ITEM_USE_ACTION_OPTIONS = Object.freeze([
  { value: "none", label: "None" },
  { value: "consume", label: "Consume" },
  { value: "heal", label: "Heal" },
  { value: "reload_feature_resource", label: "Reload Feature Resource" },
  { value: "manual", label: "Manual" },
  { value: "custom", label: "Custom" }
]);
var MODIFIER_TARGET_OPTIONS = Object.freeze([
  { value: "attack_accuracy", label: "Attack Accuracy" },
  { value: "defense", label: "Defense" },
  { value: "damage", label: "Damage" },
  { value: "armor", label: "Armor" },
  { value: "action_count", label: "Action Count" },
  { value: "concentration_slots", label: "Concentration Slots" },
  { value: "movement_m", label: "Movement (m)" },
  { value: "aim_difficulty", label: "Aim Difficulty" },
  { value: "range", label: "Range" },
  { value: "attribute", label: "Attribute" },
  { value: "skill", label: "Skill" },
  { value: "custom", label: "Custom Target" }
]);
var SKILL_UI_GROUPS = Object.freeze({
  combat: Object.freeze({
    label: "Combat",
    subcategories: Object.freeze([
      { value: "melee", label: "Melee", backendCategory: "combat", maxLevel: 5 },
      { value: "ranged", label: "Ranged", backendCategory: "combat", maxLevel: 5 }
    ])
  }),
  applied: Object.freeze({
    label: "Applied",
    subcategories: Object.freeze([
      { value: "applied", label: "Applied", backendCategory: "applied", maxLevel: 5 },
      { value: "survival", label: "Survival", backendCategory: "survival", maxLevel: 5 },
      { value: "vehicle", label: "Vehicle", backendCategory: "vehicle", maxLevel: 3 },
      { value: "social", label: "Social", backendCategory: "social", maxLevel: 3 }
    ])
  }),
  passive: Object.freeze({
    label: "Passive",
    subcategories: Object.freeze([
      { value: "passive", label: "Passive", backendCategory: "passive", maxLevel: 1 }
    ])
  })
});
var SKILL_UI_GROUP_OPTIONS = Object.freeze([
  { value: "combat", label: "Combat" },
  { value: "applied", label: "Applied" },
  { value: "passive", label: "Passive" }
]);
var EFFECT_UI_CATEGORY_OPTIONS = Object.freeze([
  { value: "buff", label: "Buff" },
  { value: "debuff", label: "Debuff" },
  { value: "condition", label: "Condition" },
  { value: "recovery", label: "Recovery" },
  { value: "damage", label: "Damage" },
  { value: "utility", label: "Utility" }
]);
var EFFECT_TYPE_OPTIONS = Object.freeze([
  { value: "modifiers_flags", label: "Modifiers / Flags" },
  { value: "periodic_damage", label: "Periodic Damage" },
  { value: "periodic_heal", label: "Periodic Heal" },
  { value: "body_part_heal", label: "Body Part Heal" },
  { value: "armor_repair", label: "Armor Repair" },
  { value: "resource_restore", label: "Resource Restore" },
  { value: "custom", label: "Custom Payload" }
]);
var EFFECT_DURATION_TYPE_OPTIONS = Object.freeze([
  { value: "manual", label: "Manual" },
  { value: "rounds", label: "Rounds" },
  { value: "until_turn_start", label: "Until Turn Start" },
  { value: "until_turn_end", label: "Until Turn End" },
  { value: "scene", label: "Scene" },
  { value: "until_used", label: "Until Used" }
]);
var EFFECT_STACKING_MODE_OPTIONS = Object.freeze([
  { value: "replace", label: "Replace" },
  { value: "stack", label: "Stack" },
  { value: "highest", label: "Highest Only" },
  { value: "lowest", label: "Lowest Only" },
  { value: "unique", label: "Unique" }
]);
var EFFECT_TARGET_SCOPE_OPTIONS = Object.freeze([
  { value: "character", label: "Character" },
  { value: "selected_body_part", label: "Selected Body Part" },
  { value: "selected_armor_item", label: "Selected Armor Item" }
]);
var EFFECT_TICK_PHASE_OPTIONS = Object.freeze([
  { value: "turn_start", label: "Turn Start" },
  { value: "turn_end", label: "Turn End" }
]);
var EFFECT_AMOUNT_METRIC_OPTIONS = Object.freeze([
  { value: "points", label: "Points" },
  { value: "hp", label: "HP" },
  { value: "minor", label: "Minor" },
  { value: "serious", label: "Serious" },
  { value: "critical", label: "Critical" }
]);
var EFFECT_FLAG_OPTIONS = Object.freeze([
  { value: "helpless", label: "Helpless" },
  { value: "skip_main_action", label: "Skip Main Action" },
  { value: "skip_movement", label: "Skip Movement" },
  { value: "consumes_full_turn", label: "Consumes Full Turn" },
  { value: "suppress_movement", label: "Suppress Movement" },
  { value: "cannot_leave_cover", label: "Cannot Leave Cover" },
  { value: "requires_concentration", label: "Requires Concentration" },
  { value: "expires_after_attack", label: "Expires After Attack" },
  { value: "expires_after_turn", label: "Expires After Turn" },
  { value: "fatal_on_any_damage_if_unprotected", label: "Fatal If Unprotected" },
  { value: "custom", label: "Custom Flag" }
]);
var ABILITY_UI_KIND_OPTIONS = Object.freeze([
  { value: "attack", label: "Attack" },
  { value: "support", label: "Support" },
  { value: "defense", label: "Defense" },
  { value: "passive", label: "Passive" },
  { value: "utility", label: "Utility" }
]);
var ABILITY_SOURCE_LABEL_OPTIONS = Object.freeze([
  { value: "psionic", label: "Psionic" },
  { value: "technical", label: "Technical" }
]);
var ABILITY_RESOLUTION_OPTIONS = Object.freeze([
  { value: "attack", label: "Attack Roll" },
  { value: "apply_effect", label: "Apply Effects" },
  { value: "grant_special", label: "Grant Special" },
  { value: "narrative", label: "Narrative / Utility" }
]);
var ABILITY_TARGET_OPTIONS = Object.freeze([
  { value: "self", label: "Self" },
  { value: "character", label: "Character" },
  { value: "body_part", label: "Body Part" },
  { value: "none", label: "No Target" }
]);
var ABILITY_ATTACK_TYPE_OPTIONS = Object.freeze([
  { value: "ranged", label: "Ranged" },
  { value: "melee", label: "Melee" }
]);
var ABILITY_RANGE_MODE_OPTIONS = Object.freeze([
  { value: "none", label: "No limit in backend" },
  { value: "limited", label: "Limited distance" }
]);
function createEmptySkillDraft() {
  return {
    id: "",
    name: "",
    skillGroup: "combat",
    skillSubcategory: "melee",
    category: "combat",
    maxLevel: "5",
    mainAttributeId: "",
    secondaryAttributeId: "",
    description: ""
  };
}
function createEmptyWeaponProfileDraft(index = 0) {
  return {
    id: "",
    name: "",
    attackType: index === 0 ? "ranged" : "melee",
    weaponClassId: "",
    linkedSkillId: "",
    rangeProfileId: "",
    caliberId: "",
    accuracyModifier: "0",
    baseMeleeDamage: "0",
    armorPierce: "0",
    twoHanded: false,
    canParry: false,
    fireModeIds: [],
    magazineDefIds: [],
    isDefault: index === 0,
    dataExtraData: {}
  };
}
function createEmptyWeaponDraft() {
  return {
    id: "",
    name: "",
    description: "",
    profiles: [createEmptyWeaponProfileDraft(0)]
  };
}
function createEmptyItemDraft() {
  return {
    id: "",
    name: "",
    itemType: "consumable",
    description: "",
    isStackable: true,
    defaultQuantity: "1",
    maxStack: "",
    defaultMaxCharges: "",
    defaultCurrentCharges: "",
    useActionType: "none",
    dataExtraData: {},
    effectDataExtraData: {},
    abilityLinks: []
  };
}
function createEmptyCaliberDraft() {
  return {
    id: "",
    name: "",
    baseDamagePerRound: "0",
    description: ""
  };
}
function createEmptyAmmoDraft() {
  return {
    id: "",
    name: "",
    caliberId: "",
    damageModifier: "0",
    accuracyModifier: "0",
    armorPierce: "0",
    description: ""
  };
}
function createEmptyMagazineDraft() {
  return {
    id: "",
    name: "",
    caliberId: "",
    capacity: "1",
    description: ""
  };
}
function createEmptyEffectDraft() {
  return {
    id: "",
    name: "",
    uiCategory: "buff",
    description: "",
    defaultDurationType: "manual",
    defaultRounds: "",
    stackingMode: "replace",
    isNegative: false,
    isNarrative: false,
    effectType: "modifiers_flags",
    targetScope: "character",
    amountMetric: "minor",
    scaleBase: "0",
    scalePerLevel: "0",
    tickPhase: "turn_end",
    resourcePoolId: "",
    restoreDisabled: false,
    modifiers: [],
    flags: [],
    dataExtraData: {},
    payloadExtraData: {}
  };
}
function createEmptyAbilityEffectLinkDraft() {
  return {
    effectDefId: ""
  };
}
function createEmptyAbilityLevelDraft(level = 1) {
  return {
    id: "",
    abilityLevel: String(level),
    resourceCost: "0",
    cooldownRounds: "",
    durationRounds: "",
    attackAccuracyBonus: "0",
    attackDamageBonus: "0",
    attackArmorPierce: "0",
    ignoreArmor: false,
    specialArmorValue: "",
    specialMaxCritical: "",
    dataExtraData: {},
    effectDataExtraData: {}
  };
}
function createEmptyAbilityDraft() {
  return normalizeAbilityEditorDraft({
    id: "",
    name: "",
    uiKind: "attack",
    sourceLabel: "psionic",
    resolutionMode: getDefaultResolutionForAbilityKind("attack"),
    targetType: getDefaultTargetTypeForAbilityKind("attack", "attack"),
    attackType: "ranged",
    rangeMode: "none",
    maxDistanceM: "",
    description: "",
    effectLinks: [],
    levels: [createEmptyAbilityLevelDraft(1)],
    dataExtraData: {},
    effectDataExtraData: {}
  });
}
function createEmptyAbilityLinkDraft() {
  return {
    abilityDefId: "",
    grantMode: "activated",
    durationRoundsMode: "none",
    durationRounds: "",
    chargesMode: "none",
    charges: "",
    cooldownRoundsMode: "none",
    cooldownRounds: "",
    reloadMode: "",
    reloadItemCode: ""
  };
}
function createEmptyEquipmentDraft() {
  return {
    id: "",
    name: "",
    itemType: "armor",
    description: "",
    armorValue: "0",
    armorMaxCritical: "0",
    defaultBodyPartCode: "",
    allowedBodyPartCodes: [],
    reservedForFuture: false,
    notes: "",
    modifiers: [],
    flagsExtraData: {},
    effectDataExtraData: {},
    abilityLinks: []
  };
}
function createEmptyModifierDraft() {
  return {
    target: "attack_accuracy",
    customTarget: "",
    attributeCode: "",
    skillCode: "",
    value: "0"
  };
}
function createEmptyFlagDraft() {
  return {
    key: "helpless",
    customKey: "",
    enabled: true
  };
}
function createInitialState() {
  return {
    activeTab: "calibers",
    loading: false,
    loadingLabel: "",
    error: "",
    info: "",
    lastLoadedSettingsKey: "",
    references: null,
    loadedTabs: {
      weapons: false,
      items: false,
      calibers: false,
      ammo: false,
      magazines: false,
      skills: false,
      effects: false,
      abilities: false,
      equipment: false
    },
    filters: {
      weapons: {
        search: ""
      },
      items: {
        search: "",
        itemType: ""
      },
      calibers: {
        search: ""
      },
      ammo: {
        search: "",
        caliberId: ""
      },
      magazines: {
        search: "",
        caliberId: ""
      },
      skills: {
        search: "",
        category: ""
      },
      effects: {
        search: "",
        category: ""
      },
      abilities: {
        search: ""
      },
      equipment: {
        search: "",
        itemType: ""
      }
    },
    lists: {
      weapons: [],
      items: [],
      calibers: [],
      ammo: [],
      magazines: [],
      skills: [],
      effects: [],
      abilities: [],
      equipment: []
    },
    selectedIds: {
      weapons: "",
      items: "",
      calibers: "",
      ammo: "",
      magazines: "",
      skills: "",
      effects: "",
      abilities: "",
      equipment: ""
    },
    bundles: {
      weapons: null,
      items: null,
      calibers: null,
      ammo: null,
      magazines: null,
      skills: null,
      effects: null,
      abilities: null,
      equipment: null
    },
    drafts: {
      weapons: createEmptyWeaponDraft(),
      items: createEmptyItemDraft(),
      calibers: createEmptyCaliberDraft(),
      ammo: createEmptyAmmoDraft(),
      magazines: createEmptyMagazineDraft(),
      skills: createEmptySkillDraft(),
      effects: createEmptyEffectDraft(),
      abilities: createEmptyAbilityDraft(),
      equipment: createEmptyEquipmentDraft()
    },
    dirty: {
      weapons: false,
      items: false,
      calibers: false,
      ammo: false,
      magazines: false,
      skills: false,
      effects: false,
      abilities: false,
      equipment: false
    },
    collapsed: {
      weaponsCatalog: true,
      itemsCatalog: true,
      calibersCatalog: true,
      ammoCatalog: true,
      magazinesCatalog: true,
      skillsCatalog: true,
      effectsCatalog: true,
      abilitiesCatalog: true,
      equipmentCatalog: true,
      weaponsPayload: true,
      itemsPayload: true,
      calibersPayload: true,
      ammoPayload: true,
      magazinesPayload: true,
      skillsPayload: true,
      effectsPayload: true,
      effectsBehavior: true,
      abilitiesPayload: true,
      abilitiesLevels: false,
      equipmentPayload: true,
      equipmentDataModifiers: true
    },
    requestNonce: 0
  };
}
function cloneJson(value) {
  return safeJsonParse(JSON.stringify(value), value);
}
function coerceInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function formatCreatorError(result, fallback) {
  if (!result || result.ok !== false) {
    return fallback;
  }
  const details2 = Array.isArray(result.details) ? result.details.map((entry) => String(entry?.message ?? entry?.field ?? "").trim()).filter(Boolean) : [];
  const message = String(result.message ?? result.error ?? fallback).trim() || fallback;
  return details2.length ? `${message} ${details2.join(" | ")}` : message;
}
function slugifyName(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/_{2,}/g, "_");
}
function uniqueGeneratedCode(baseCode, existingCodes) {
  const safeBase = baseCode || "entity";
  const used = new Set((existingCodes ?? []).map((value) => String(value ?? "").trim()).filter(Boolean));
  if (!used.has(safeBase)) {
    return safeBase;
  }
  let index = 2;
  while (used.has(`${safeBase}_${index}`)) {
    index += 1;
  }
  return `${safeBase}_${index}`;
}
function nextFreeSortOrder(items) {
  const used = new Set(
    (items ?? []).map((item) => Number.parseInt(String(item?.sort_order ?? item?.sortOrder ?? ""), 10)).filter((value2) => Number.isFinite(value2) && value2 >= 0)
  );
  let value = 0;
  while (used.has(value)) {
    value += 1;
  }
  return value;
}
function getAllowedSkillBackendCategories() {
  return ["combat", "applied", "survival", "vehicle", "social", "passive"];
}
function getSkillBackendCategoriesForFilter(skillGroup) {
  switch (String(skillGroup ?? "").trim()) {
    case "combat":
      return ["combat"];
    case "applied":
      return ["applied", "survival", "vehicle", "social"];
    case "passive":
      return ["passive"];
    default:
      return getAllowedSkillBackendCategories();
  }
}
function getSkillSubcategoryConfig(skillGroup, skillSubcategory) {
  const groupConfig = SKILL_UI_GROUPS[String(skillGroup ?? "").trim()] ?? SKILL_UI_GROUPS.combat;
  return groupConfig.subcategories.find((entry) => entry.value === skillSubcategory) ?? groupConfig.subcategories[0];
}
function deriveSkillUiState(category, tags = []) {
  const normalizedCategory = String(category ?? "").trim();
  const tagList = Array.isArray(tags) ? tags.map((entry) => String(entry ?? "").trim()) : [];
  const subcategoryTag = tagList.find((entry) => entry.startsWith("skill_subcategory:"));
  const taggedSubcategory = subcategoryTag ? subcategoryTag.split(":").slice(1).join(":") : "";
  if (normalizedCategory === "combat") {
    const subcategory = taggedSubcategory === "ranged" ? "ranged" : "melee";
    return { skillGroup: "combat", skillSubcategory: subcategory };
  }
  if (["applied", "survival", "vehicle", "social"].includes(normalizedCategory)) {
    return { skillGroup: "applied", skillSubcategory: normalizedCategory };
  }
  if (normalizedCategory === "passive") {
    return { skillGroup: "passive", skillSubcategory: "passive" };
  }
  return { skillGroup: "combat", skillSubcategory: "melee" };
}
function buildSkillAutoTags(draft, references) {
  const tags = /* @__PURE__ */ new Set();
  const skillConfig = getSkillSubcategoryConfig(draft.skillGroup, draft.skillSubcategory);
  if (draft.skillGroup) tags.add(`skill_group:${String(draft.skillGroup).trim()}`);
  if (draft.skillSubcategory) tags.add(`skill_subcategory:${String(draft.skillSubcategory).trim()}`);
  if (skillConfig?.backendCategory) tags.add(String(skillConfig.backendCategory).trim());
  const attributes = Array.isArray(references?.attributes) ? references.attributes : [];
  const main = attributes.find((entry) => entry.id === draft.mainAttributeId);
  const secondary = attributes.find((entry) => entry.id === draft.secondaryAttributeId);
  if (main?.code) tags.add(String(main.code));
  if (secondary?.code) tags.add(String(secondary.code));
  return Array.from(tags);
}
function buildEquipmentAutoTags(draft) {
  const tags = /* @__PURE__ */ new Set();
  const allowedCodes = getEffectiveAllowedBodyPartCodes(draft);
  const primaryBodyPartCode = getPrimaryBodyPartCode(allowedCodes, draft.defaultBodyPartCode);
  if (draft.itemType) tags.add(String(draft.itemType).trim());
  if (primaryBodyPartCode) tags.add(primaryBodyPartCode);
  tags.add("equipable");
  if (shouldEquipToBodyPart(draft.itemType, allowedCodes, draft.defaultBodyPartCode)) tags.add("body_part");
  return Array.from(tags);
}
function deriveEffectUiCategory(category) {
  const normalized = String(category ?? "").trim().toLowerCase();
  if (EFFECT_UI_CATEGORY_OPTIONS.some((entry) => entry.value === normalized)) {
    return normalized;
  }
  switch (normalized) {
    case "combat":
    case "psionic":
    case "equipment":
    case "weapon":
    case "armor":
    case "narrative":
    case "custom":
      return "utility";
    default:
      return "utility";
  }
}
function effectCategoryIsNegative(category) {
  return ["debuff", "condition", "damage"].includes(String(category ?? "").trim().toLowerCase());
}
function getDefaultTargetScopeForEffectType(effectType) {
  switch (String(effectType ?? "").trim()) {
    case "body_part_heal":
      return "selected_body_part";
    case "armor_repair":
      return "selected_armor_item";
    default:
      return "character";
  }
}
function getDefaultMetricForEffectType(effectType) {
  switch (String(effectType ?? "").trim()) {
    case "resource_restore":
      return "points";
    case "body_part_heal":
      return "hp";
    case "armor_repair":
      return "critical";
    case "periodic_heal":
      return "hp";
    case "periodic_damage":
      return "minor";
    default:
      return "minor";
  }
}
function effectTypeUsesScale(effectType) {
  return [
    "periodic_damage",
    "periodic_heal",
    "body_part_heal",
    "armor_repair",
    "resource_restore"
  ].includes(String(effectType ?? "").trim());
}
function effectTypeUsesTickPhase(effectType) {
  return ["periodic_damage", "periodic_heal"].includes(String(effectType ?? "").trim());
}
function effectTypeUsesResourcePool(effectType) {
  return String(effectType ?? "").trim() === "resource_restore";
}
function effectTypeUsesRestoreDisabled(effectType) {
  return String(effectType ?? "").trim() === "body_part_heal";
}
function getEffectMetricOptions(effectType) {
  switch (String(effectType ?? "").trim()) {
    case "resource_restore":
      return EFFECT_AMOUNT_METRIC_OPTIONS.filter((entry) => entry.value === "points");
    case "periodic_heal":
    case "body_part_heal":
      return EFFECT_AMOUNT_METRIC_OPTIONS.filter((entry) => ["hp", "minor", "serious", "critical"].includes(entry.value));
    case "armor_repair":
      return EFFECT_AMOUNT_METRIC_OPTIONS.filter((entry) => ["minor", "serious", "critical"].includes(entry.value));
    case "periodic_damage":
      return EFFECT_AMOUNT_METRIC_OPTIONS.filter((entry) => ["minor", "serious", "critical"].includes(entry.value));
    default:
      return EFFECT_AMOUNT_METRIC_OPTIONS;
  }
}
function buildEffectAutoTags(draft) {
  const tags = /* @__PURE__ */ new Set();
  if (draft.uiCategory) tags.add(String(draft.uiCategory).trim());
  if (draft.effectType) tags.add(`effect_type:${String(draft.effectType).trim()}`);
  if (draft.targetScope) tags.add(`target_scope:${String(draft.targetScope).trim()}`);
  if (effectCategoryIsNegative(draft.uiCategory)) tags.add("negative");
  return Array.from(tags);
}
function abilityUsesAttackFields(uiKind, resolutionMode) {
  return String(uiKind ?? "").trim() === "attack" || String(resolutionMode ?? "").trim() === "attack";
}
function abilityUsesEffectLinks(resolutionMode) {
  return String(resolutionMode ?? "").trim() === "apply_effect";
}
function abilityUsesSpecialFields(resolutionMode) {
  return String(resolutionMode ?? "").trim() === "grant_special";
}
function abilityIsPassive(uiKind) {
  return String(uiKind ?? "").trim() === "passive";
}
function abilityIsTechnical(sourceLabel) {
  return String(sourceLabel ?? "").trim() === "technical";
}
function getDefaultResolutionForAbilityKind(uiKind) {
  switch (String(uiKind ?? "").trim()) {
    case "attack":
      return "attack";
    case "defense":
      return "grant_special";
    case "passive":
    case "support":
      return "apply_effect";
    case "utility":
    default:
      return "narrative";
  }
}
function getDefaultTargetTypeForAbilityKind(uiKind, resolutionMode) {
  if (abilityUsesAttackFields(uiKind, resolutionMode)) {
    return "body_part";
  }
  if (abilityIsPassive(uiKind)) {
    return "self";
  }
  if (String(resolutionMode ?? "").trim() === "grant_special") {
    return "self";
  }
  if (String(resolutionMode ?? "").trim() === "narrative") {
    return "none";
  }
  return "character";
}
function getDefaultAttackTypeForAbilityKind(uiKind) {
  return String(uiKind ?? "").trim() === "attack" ? "ranged" : "melee";
}
function getAbilityOptionLabel(options, value, fallback = "") {
  const normalized = String(value ?? "").trim();
  const match = Array.isArray(options) ? options.find((entry) => String(entry?.value ?? "").trim() === normalized) : null;
  if (match?.label) {
    return String(match.label);
  }
  return fallback || normalized;
}
function getAllowedTargetTypesForAbility(uiKind, resolutionMode) {
  if (abilityUsesAttackFields(uiKind, resolutionMode)) {
    return ["body_part"];
  }
  if (abilityUsesSpecialFields(resolutionMode)) {
    return ["self"];
  }
  if (abilityIsPassive(uiKind)) {
    return ["self"];
  }
  if (String(resolutionMode ?? "").trim() === "apply_effect") {
    return ["self", "character"];
  }
  if (String(resolutionMode ?? "").trim() === "narrative") {
    return ["none"];
  }
  return [getDefaultTargetTypeForAbilityKind(uiKind, resolutionMode)];
}
function normalizeAbilityLevels(levels, { technical = false } = {}) {
  const sourceLevels = Array.isArray(levels) && levels.length ? levels.map((entry) => ({ ...cloneJson(entry) })) : [createEmptyAbilityLevelDraft(1)];
  const effectiveLevels = technical ? [sourceLevels[0] ?? createEmptyAbilityLevelDraft(1)] : sourceLevels;
  return effectiveLevels.map((entry, index) => ({
    ...createEmptyAbilityLevelDraft(index + 1),
    ...entry,
    id: String(entry?.id ?? ""),
    abilityLevel: String(index + 1)
  }));
}
function normalizeAbilityEditorDraft(draft) {
  const uiKind = ABILITY_UI_KIND_OPTIONS.some((entry) => entry.value === String(draft?.uiKind ?? "").trim()) ? String(draft.uiKind).trim() : "utility";
  const sourceLabel = ABILITY_SOURCE_LABEL_OPTIONS.some((entry) => entry.value === String(draft?.sourceLabel ?? "").trim()) ? String(draft.sourceLabel).trim() : "technical";
  const resolutionMode = getDefaultResolutionForAbilityKind(uiKind);
  const showAttackFields = abilityUsesAttackFields(uiKind, resolutionMode);
  const attackType = showAttackFields ? ABILITY_ATTACK_TYPE_OPTIONS.some((entry) => entry.value === String(draft?.attackType ?? "").trim()) ? String(draft.attackType).trim() : getDefaultAttackTypeForAbilityKind(uiKind) : getDefaultAttackTypeForAbilityKind(uiKind);
  const allowedTargets = getAllowedTargetTypesForAbility(uiKind, resolutionMode);
  const targetType = allowedTargets.includes(String(draft?.targetType ?? "").trim()) ? String(draft.targetType).trim() : allowedTargets[0];
  const rangeMode = showAttackFields && attackType === "melee" ? "limited" : String(draft?.rangeMode ?? "").trim() === "limited" ? "limited" : "none";
  const maxDistanceM = showAttackFields && attackType === "melee" ? "2" : String(draft?.maxDistanceM ?? "").trim();
  const technical = abilityIsTechnical(sourceLabel);
  return {
    ...cloneJson(draft ?? {}),
    uiKind,
    sourceLabel,
    resolutionMode,
    targetType,
    attackType,
    rangeMode,
    maxDistanceM,
    effectLinks: Array.isArray(draft?.effectLinks) ? draft.effectLinks.map((entry) => ({ ...cloneJson(entry) })) : [],
    levels: normalizeAbilityLevels(draft?.levels, { technical }),
    dataExtraData: cloneJson(draft?.dataExtraData ?? {}),
    effectDataExtraData: cloneJson(draft?.effectDataExtraData ?? {})
  };
}
function getAbilityPayloadSummary(draft) {
  const normalized = normalizeAbilityEditorDraft(draft);
  const sourceLabel = getAbilityOptionLabel(ABILITY_SOURCE_LABEL_OPTIONS, normalized.sourceLabel, "Technical");
  const resolutionLabel = getAbilityOptionLabel(ABILITY_RESOLUTION_OPTIONS, normalized.resolutionMode, "Narrative / Utility");
  const targetLabel = getAbilityOptionLabel(ABILITY_TARGET_OPTIONS, normalized.targetType, "No Target");
  const attackTypeLabel = abilityUsesAttackFields(normalized.uiKind, normalized.resolutionMode) ? getAbilityOptionLabel(ABILITY_ATTACK_TYPE_OPTIONS, normalized.attackType, "Ranged") : "n/a";
  const levelsLabel = abilityIsTechnical(normalized.sourceLabel) ? "internal Level 1" : `${Array.isArray(normalized.levels) ? normalized.levels.length : 0} level(s)`;
  return [
    { label: "Source", value: sourceLabel },
    { label: "Resolution", value: resolutionLabel },
    { label: "Target", value: targetLabel },
    { label: "Attack Type", value: attackTypeLabel },
    { label: "Levels", value: levelsLabel }
  ];
}
function findEffectReferenceById(references, effectDefId) {
  const normalizedId = String(effectDefId ?? "").trim();
  if (!normalizedId) {
    return null;
  }
  const list = Array.isArray(references?.effects) ? references.effects : [];
  return list.find((entry) => String(entry?.id ?? "").trim() === normalizedId) ?? null;
}
function buildEffectReferenceSummary(effectReference) {
  if (!effectReference) {
    return "No effect selected yet.";
  }
  const category = String(effectReference.ui_category ?? effectReference.category ?? "").trim();
  const effectType = String(effectReference.effect_type ?? effectReference.effectType ?? "").trim();
  const targetScope = String(effectReference.target_scope ?? effectReference.targetScope ?? "").trim();
  const durationType = String(effectReference.default_duration_type ?? effectReference.defaultDurationType ?? "").trim();
  const parts = [category, effectType, targetScope, durationType].filter(Boolean);
  return parts.length ? parts.join(" / ") : "Saved effect template";
}
function buildAbilityAutoTags(draft) {
  const normalized = normalizeAbilityEditorDraft(draft);
  const tags = /* @__PURE__ */ new Set();
  if (normalized.uiKind) tags.add(`ability_kind:${String(normalized.uiKind).trim()}`);
  if (normalized.sourceLabel) tags.add(`ability_source:${String(normalized.sourceLabel).trim()}`);
  if (normalized.resolutionMode) tags.add(`ability_resolution:${String(normalized.resolutionMode).trim()}`);
  if (normalized.rangeMode) tags.add(`ability_range:${String(normalized.rangeMode).trim()}`);
  return Array.from(tags);
}
function toPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function normalizeBodyPartCodeArray(value) {
  return Array.isArray(value) ? Array.from(new Set(value.map((entry) => String(entry ?? "").trim()).filter(Boolean))) : [];
}
function suggestAllowedBodyPartCodes(defaultBodyPartCode) {
  const code = String(defaultBodyPartCode ?? "").trim().toLowerCase();
  switch (code) {
    case "head":
    case "torso":
    case "special":
      return code ? [code] : [];
    case "l_arm":
    case "r_arm":
      return ["l_arm", "r_arm", "extra_l_arm", "extra_r_arm"];
    case "l_leg":
    case "r_leg":
      return ["l_leg", "r_leg"];
    default:
      return code ? [code] : [];
  }
}
function getPrimaryBodyPartCode(allowedBodyPartCodes, fallbackCode = "") {
  const normalized = normalizeBodyPartCodeArray(allowedBodyPartCodes);
  const fallback = String(fallbackCode ?? "").trim().toLowerCase();
  if (fallback && normalized.includes(fallback)) {
    return fallback;
  }
  const preferredOrder = ["head", "torso", "l_arm", "r_arm", "l_leg", "r_leg", "special", "extra_l_arm", "extra_r_arm"];
  for (const code of preferredOrder) {
    if (normalized.includes(code)) {
      return code;
    }
  }
  return normalized[0] ?? "";
}
function getEffectiveAllowedBodyPartCodes(draft) {
  const selectedCodes = normalizeBodyPartCodeArray(draft?.allowedBodyPartCodes);
  return selectedCodes.length ? selectedCodes : suggestAllowedBodyPartCodes(draft?.defaultBodyPartCode);
}
function shouldShowProtectionSlots(itemType) {
  const type = String(itemType ?? "").trim();
  return type !== "exoskeleton" && type !== "closed_suit";
}
function shouldEquipToBodyPart(itemType, allowedBodyPartCodes = [], defaultBodyPartCode = "") {
  const type = String(itemType ?? "").trim();
  if (type === "armor" || type === "shield") {
    return true;
  }
  if (type === "implant" || type === "prosthetic") {
    return normalizeBodyPartCodeArray(allowedBodyPartCodes).length > 0 || Boolean(String(defaultBodyPartCode ?? "").trim());
  }
  return false;
}
function getEquipmentUiTypes(references) {
  return (Array.isArray(references?.equipment_item_types) ? references.equipment_item_types : []).filter((itemType) => String(itemType ?? "") !== "device");
}
function normalizeWeaponProfileDraft(profile) {
  const data = toPlainObject(profile?.data);
  return {
    id: String(profile?.id ?? ""),
    name: String(profile?.name ?? ""),
    attackType: String(profile?.attack_type ?? "ranged"),
    weaponClassId: String(profile?.weapon_class_id ?? ""),
    linkedSkillId: String(profile?.linked_skill_id ?? ""),
    rangeProfileId: String(profile?.range_profile_id ?? ""),
    caliberId: String(profile?.caliber_id ?? ""),
    accuracyModifier: String(profile?.accuracy_modifier ?? 0),
    baseMeleeDamage: String(profile?.base_melee_damage ?? 0),
    armorPierce: String(data.armor_pierce ?? 0),
    twoHanded: Boolean(data.two_handed ?? false),
    canParry: Boolean(data.can_parry ?? false),
    fireModeIds: Array.isArray(profile?.fire_mode_ids) ? profile.fire_mode_ids.map((entry) => String(entry ?? "")) : [],
    magazineDefIds: Array.isArray(profile?.magazine_def_ids) ? profile.magazine_def_ids.map((entry) => String(entry ?? "")) : [],
    isDefault: Boolean(profile?.is_default ?? false),
    dataExtraData: cloneJson(data)
  };
}
function normalizeWeaponDraft(bundle) {
  const weapon = bundle?.weapon ?? {};
  const profiles = Array.isArray(bundle?.profiles) && bundle.profiles.length ? bundle.profiles.map((entry) => normalizeWeaponProfileDraft(entry)) : [createEmptyWeaponProfileDraft(0)];
  const hasDefault = profiles.some((entry) => entry.isDefault);
  if (!hasDefault && profiles.length) {
    profiles[0].isDefault = true;
  }
  return {
    id: String(weapon.id ?? ""),
    name: String(weapon.name ?? ""),
    description: String(weapon.description ?? ""),
    profiles
  };
}
function normalizeItemDraft(bundle) {
  const item = bundle?.item_def ?? {};
  return {
    id: String(item.id ?? ""),
    name: String(item.name ?? ""),
    itemType: String(item.item_type ?? "custom"),
    description: String(item.description ?? ""),
    isStackable: Boolean(item.is_stackable ?? true),
    defaultQuantity: String(item.default_quantity ?? 1),
    maxStack: item.max_stack === null || item.max_stack === void 0 ? "" : String(item.max_stack),
    defaultMaxCharges: item.default_max_charges === null || item.default_max_charges === void 0 ? "" : String(item.default_max_charges),
    defaultCurrentCharges: item.default_current_charges === null || item.default_current_charges === void 0 ? "" : String(item.default_current_charges),
    useActionType: String(item.use_action_type ?? "none"),
    dataExtraData: cloneJson(item.data ?? {}),
    effectDataExtraData: cloneJson(item.effect_data ?? {}),
    abilityLinks: Array.isArray(bundle?.ability_links) ? bundle.ability_links.map((entry) => {
      const data = toPlainObject(entry?.data);
      return {
        abilityDefId: String(entry?.ability_def_id ?? ""),
        grantMode: String(entry?.grant_mode ?? "activated"),
        durationRoundsMode: data.duration_rounds !== void 0 && data.duration_rounds !== null ? "set" : "none",
        durationRounds: data.duration_rounds !== void 0 && data.duration_rounds !== null ? String(data.duration_rounds) : "",
        chargesMode: data.default_max_charges !== void 0 && data.default_max_charges !== null ? "set" : "none",
        charges: data.default_max_charges !== void 0 && data.default_max_charges !== null ? String(data.default_max_charges) : "",
        cooldownRoundsMode: data.cooldown_rounds !== void 0 && data.cooldown_rounds !== null ? "set" : "none",
        cooldownRounds: data.cooldown_rounds !== void 0 && data.cooldown_rounds !== null ? String(data.cooldown_rounds) : "",
        reloadMode: String(toPlainObject(data.reload).mode ?? ""),
        reloadItemCode: String(toPlainObject(data.reload).item_code ?? "")
      };
    }) : []
  };
}
function normalizeSkillDraft(bundle) {
  const skill = bundle?.skill ?? {};
  const uiState = deriveSkillUiState(skill.category, skill.tags);
  const config = getSkillSubcategoryConfig(uiState.skillGroup, uiState.skillSubcategory);
  return {
    id: String(skill.id ?? ""),
    name: String(skill.name ?? ""),
    skillGroup: uiState.skillGroup,
    skillSubcategory: uiState.skillSubcategory,
    category: String(config?.backendCategory ?? skill.category ?? "combat"),
    maxLevel: String(config?.maxLevel ?? skill.max_level ?? 5),
    mainAttributeId: String(skill.main_attribute_id ?? ""),
    secondaryAttributeId: String(skill.secondary_attribute_id ?? ""),
    description: String(skill.description ?? "")
  };
}
function normalizeCaliberDraft(bundle) {
  const caliber = bundle?.caliber ?? {};
  return {
    id: String(caliber.id ?? ""),
    name: String(caliber.name ?? ""),
    baseDamagePerRound: String(caliber.base_damage_per_round ?? 0),
    description: String(caliber.description ?? "")
  };
}
function normalizeAmmoDraft(bundle) {
  const ammoType = bundle?.ammo_type ?? {};
  return {
    id: String(ammoType.id ?? ""),
    name: String(ammoType.name ?? ""),
    caliberId: String(ammoType.caliber_id ?? ""),
    damageModifier: String(ammoType.damage_modifier ?? 0),
    accuracyModifier: String(ammoType.accuracy_modifier ?? 0),
    armorPierce: String(ammoType.armor_pierce ?? 0),
    description: String(ammoType.description ?? "")
  };
}
function normalizeMagazineDraft(bundle) {
  const magazineDef = bundle?.magazine_def ?? {};
  return {
    id: String(magazineDef.id ?? ""),
    name: String(magazineDef.name ?? ""),
    caliberId: String(magazineDef.caliber_id ?? ""),
    capacity: String(magazineDef.capacity ?? 1),
    description: String(magazineDef.description ?? "")
  };
}
function normalizeFlagDraft(entry) {
  const rawKey = String(entry?.key ?? "").trim();
  const known = EFFECT_FLAG_OPTIONS.some((option) => option.value === rawKey && option.value !== "custom") ? rawKey : "custom";
  return {
    key: known,
    customKey: known === "custom" ? rawKey : "",
    enabled: Boolean(entry?.enabled ?? entry?.value ?? true)
  };
}
function normalizeEffectDraft(bundle) {
  const effect = bundle?.effect ?? {};
  const data = toPlainObject(effect.data);
  const payload = toPlainObject(data.payload);
  const {
    modifiers: modifiersRaw,
    flags: flagsRaw,
    payload: payloadRaw,
    ...dataExtraData
  } = data;
  const {
    type: payloadTypeRaw,
    target_scope: targetScopeRaw,
    scale: scaleRaw,
    tick_phase: tickPhaseRaw,
    resource_pool_id: resourcePoolIdRaw,
    restore_disabled: restoreDisabledRaw,
    ...payloadExtraData
  } = payload;
  const scale = toPlainObject(scaleRaw);
  const effectType = EFFECT_TYPE_OPTIONS.some((entry) => entry.value === String(payloadTypeRaw ?? "").trim()) ? String(payloadTypeRaw ?? "").trim() : "modifiers_flags";
  const targetScope = EFFECT_TARGET_SCOPE_OPTIONS.some((entry) => entry.value === String(targetScopeRaw ?? "").trim()) ? String(targetScopeRaw ?? "").trim() : getDefaultTargetScopeForEffectType(effectType);
  const metricOptions = getEffectMetricOptions(effectType);
  const amountMetric = metricOptions.some((entry) => entry.value === String(scale.metric ?? "").trim()) ? String(scale.metric ?? "").trim() : getDefaultMetricForEffectType(effectType);
  return {
    id: String(effect.id ?? ""),
    name: String(effect.name ?? ""),
    uiCategory: deriveEffectUiCategory(effect.category),
    description: String(effect.description ?? ""),
    defaultDurationType: String(effect.default_duration_type ?? "manual"),
    defaultRounds: effect.default_rounds === null || effect.default_rounds === void 0 ? "" : String(effect.default_rounds),
    stackingMode: String(effect.stacking_mode ?? "replace"),
    isNegative: effectCategoryIsNegative(effect.category),
    isNarrative: false,
    effectType,
    targetScope,
    amountMetric,
    scaleBase: scale.base === null || scale.base === void 0 ? "0" : String(scale.base),
    scalePerLevel: scale.per_level === null || scale.per_level === void 0 ? "0" : String(scale.per_level),
    tickPhase: String(tickPhaseRaw ?? "turn_end"),
    resourcePoolId: String(resourcePoolIdRaw ?? ""),
    restoreDisabled: Boolean(restoreDisabledRaw),
    modifiers: Array.isArray(modifiersRaw) ? modifiersRaw.map(normalizeModifierDraft) : [],
    flags: Object.entries(toPlainObject(flagsRaw)).map(([key, value]) => normalizeFlagDraft({ key, value })),
    dataExtraData,
    payloadExtraData
  };
}
function normalizeAbilityEffectLinkDraft(entry) {
  return {
    effectDefId: String(entry?.effect_def_id ?? entry?.id ?? "")
  };
}
function normalizeAbilityLevelDraft(entry, fallbackLevel = 1) {
  const dataExtraData = toPlainObject(entry?.data);
  const effectDataExtraData = toPlainObject(entry?.effect_data);
  return {
    id: String(entry?.id ?? ""),
    abilityLevel: String(entry?.ability_level ?? fallbackLevel),
    resourceCost: String(entry?.resource_cost ?? 0),
    cooldownRounds: entry?.cooldown_rounds === null || entry?.cooldown_rounds === void 0 ? "" : String(entry.cooldown_rounds),
    durationRounds: entry?.duration_rounds === null || entry?.duration_rounds === void 0 ? "" : String(entry.duration_rounds),
    attackAccuracyBonus: String(entry?.attack_accuracy_bonus ?? 0),
    attackDamageBonus: String(entry?.attack_damage_bonus ?? 0),
    attackArmorPierce: String(entry?.attack_armor_pierce ?? 0),
    ignoreArmor: Boolean(entry?.ignore_armor),
    specialArmorValue: entry?.special_armor_value === null || entry?.special_armor_value === void 0 ? "" : String(entry.special_armor_value),
    specialMaxCritical: entry?.special_max_critical === null || entry?.special_max_critical === void 0 ? "" : String(entry.special_max_critical),
    dataExtraData,
    effectDataExtraData
  };
}
function normalizeAbilityDraft(bundle) {
  const ability = bundle?.ability ?? {};
  const abilityData = toPlainObject(ability.data);
  const rangeData = toPlainObject(abilityData.range);
  const effectLinksRaw = Array.isArray(bundle?.effect_links) ? bundle.effect_links : Array.isArray(abilityData.effect_links) ? abilityData.effect_links : [];
  const sourceLabel = String(ability.source_type ?? "").trim() === "psionic" ? "psionic" : "technical";
  const uiKind = ABILITY_UI_KIND_OPTIONS.some((entry) => entry.value === String(ability.ability_kind ?? "").trim()) ? String(ability.ability_kind ?? "").trim() : String(ability.ability_kind ?? "").trim() === "buff" ? "support" : "utility";
  const resolutionMode = ABILITY_RESOLUTION_OPTIONS.some((entry) => entry.value === String(ability.effect_mode ?? "").trim()) ? String(ability.effect_mode ?? "").trim() : getDefaultResolutionForAbilityKind(uiKind);
  const levelsRaw = Array.isArray(bundle?.levels) ? bundle.levels : [];
  const normalizedLevels = levelsRaw.length ? levelsRaw.map((entry, index) => normalizeAbilityLevelDraft(entry, index + 1)) : [createEmptyAbilityLevelDraft(1)];
  const {
    effect_links: ignoredEffectLinks,
    range: ignoredRange,
    ...dataExtraData
  } = abilityData;
  return normalizeAbilityEditorDraft({
    id: String(ability.id ?? ""),
    name: String(ability.name ?? ""),
    uiKind,
    sourceLabel,
    resolutionMode,
    targetType: ABILITY_TARGET_OPTIONS.some((entry) => entry.value === String(ability.target_type ?? "").trim()) ? String(ability.target_type ?? "").trim() : getDefaultTargetTypeForAbilityKind(uiKind, resolutionMode),
    attackType: ABILITY_ATTACK_TYPE_OPTIONS.some((entry) => entry.value === String(ability.attack_type ?? "").trim()) ? String(ability.attack_type ?? "").trim() : getDefaultAttackTypeForAbilityKind(uiKind),
    rangeMode: String(rangeData.mode ?? "").trim() === "limited" ? "limited" : "none",
    maxDistanceM: rangeData.max_distance_m === null || rangeData.max_distance_m === void 0 ? "" : String(rangeData.max_distance_m),
    description: String(ability.description ?? ""),
    effectLinks: effectLinksRaw.map(normalizeAbilityEffectLinkDraft),
    levels: normalizedLevels,
    dataExtraData,
    effectDataExtraData: toPlainObject(ability.effect_data)
  });
}
function normalizeAbilityLinkDraft(entry) {
  const data = entry?.data && typeof entry.data === "object" && !Array.isArray(entry.data) ? entry.data : {};
  const reload = data?.reload && typeof data.reload === "object" && !Array.isArray(data.reload) ? data.reload : {};
  const charges = data.default_max_charges ?? data.default_current_charges ?? data.max_charges ?? data.current_charges ?? "";
  const durationValue = data.duration_rounds;
  const cooldownValue = data.cooldown_rounds ?? data.default_cooldown_rounds;
  return {
    abilityDefId: String(entry?.ability_def_id ?? ""),
    grantMode: String(entry?.grant_mode ?? "activated"),
    durationRoundsMode: durationValue === null || durationValue === void 0 || durationValue === "" ? "none" : "set",
    durationRounds: String(durationValue ?? ""),
    chargesMode: charges === null || charges === void 0 || charges === "" ? "none" : "set",
    charges: charges === null || charges === void 0 ? "" : String(charges),
    cooldownRoundsMode: cooldownValue === null || cooldownValue === void 0 || cooldownValue === "" ? "none" : "set",
    cooldownRounds: String(cooldownValue ?? ""),
    reloadMode: String(reload.mode ?? data.reload_mode ?? ""),
    reloadItemCode: String(reload.item_code ?? data.reload_item_code ?? data.requires_reload_item_code ?? "")
  };
}
function normalizeEquipmentDraft(bundle) {
  const model = bundle?.equipment_model ?? {};
  const flags = toPlainObject(model.flags);
  const effectData = toPlainObject(model.effect_data);
  const {
    allowed_body_part_codes: allowedBodyPartCodesRaw,
    ...flagsExtraData
  } = flags;
  const {
    reserved_for_future: reservedForFutureRaw,
    notes: notesRaw,
    modifiers: modifiersRaw,
    ...effectDataExtraData
  } = effectData;
  const normalizedAllowedBodyPartCodes = normalizeBodyPartCodeArray(allowedBodyPartCodesRaw);
  return {
    id: String(model.id ?? ""),
    name: String(model.name ?? ""),
    itemType: String(model.item_type ?? "armor"),
    description: String(model.description ?? ""),
    armorValue: String(model.armor_value ?? 0),
    armorMaxCritical: String(model.armor_max_critical ?? 0),
    defaultBodyPartCode: String(model.default_body_part_code ?? ""),
    allowedBodyPartCodes: normalizedAllowedBodyPartCodes.length ? normalizedAllowedBodyPartCodes : suggestAllowedBodyPartCodes(model.default_body_part_code),
    reservedForFuture: Boolean(reservedForFutureRaw),
    notes: String(notesRaw ?? ""),
    modifiers: Array.isArray(modifiersRaw) ? modifiersRaw.map(normalizeModifierDraft) : [],
    flagsExtraData,
    effectDataExtraData,
    abilityLinks: Array.isArray(bundle?.ability_links) ? bundle.ability_links.map(normalizeAbilityLinkDraft) : []
  };
}
function normalizeModifierDraft(entry) {
  const rawTarget = String(entry?.target ?? "").trim();
  const knownTarget = MODIFIER_TARGET_OPTIONS.some((option) => option.value === rawTarget && option.value !== "custom") ? rawTarget : "custom";
  return {
    target: knownTarget,
    customTarget: knownTarget === "custom" ? rawTarget : "",
    attributeCode: String(entry?.attribute ?? ""),
    skillCode: String(entry?.skill_code ?? ""),
    value: String(entry?.value ?? 0)
  };
}
function makeSkillDuplicateDraft(source) {
  const name = String(source.name ?? "").trim();
  return {
    ...cloneJson(source),
    id: "",
    name: name ? `${name} Copy` : ""
  };
}
function makeWeaponDuplicateDraft(source) {
  const name = String(source.name ?? "").trim();
  return {
    ...cloneJson(source),
    id: "",
    name: name ? `${name} Copy` : "",
    profiles: Array.isArray(source.profiles) ? source.profiles.map((entry, index) => ({
      ...cloneJson(entry),
      id: "",
      isDefault: index === 0
    })) : [createEmptyWeaponProfileDraft(0)]
  };
}
function makeItemDuplicateDraft(source) {
  const name = String(source.name ?? "").trim();
  return {
    ...cloneJson(source),
    id: "",
    name: name ? `${name} Copy` : ""
  };
}
function makeCaliberDuplicateDraft(source) {
  const name = String(source.name ?? "").trim();
  return {
    ...cloneJson(source),
    id: "",
    name: name ? `${name} Copy` : ""
  };
}
function makeAmmoDuplicateDraft(source) {
  const name = String(source.name ?? "").trim();
  return {
    ...cloneJson(source),
    id: "",
    name: name ? `${name} Copy` : ""
  };
}
function makeMagazineDuplicateDraft(source) {
  const name = String(source.name ?? "").trim();
  return {
    ...cloneJson(source),
    id: "",
    name: name ? `${name} Copy` : ""
  };
}
function makeEffectDuplicateDraft(source) {
  const name = String(source.name ?? "").trim();
  return {
    ...cloneJson(source),
    id: "",
    name: name ? `${name} Copy` : "",
    modifiers: Array.isArray(source.modifiers) ? source.modifiers.map((entry) => ({
      ...cloneJson(entry)
    })) : [],
    flags: Array.isArray(source.flags) ? source.flags.map((entry) => ({
      ...cloneJson(entry)
    })) : [],
    dataExtraData: cloneJson(source.dataExtraData ?? {}),
    payloadExtraData: cloneJson(source.payloadExtraData ?? {})
  };
}
function makeAbilityDuplicateDraft(source) {
  const name = String(source.name ?? "").trim();
  return normalizeAbilityEditorDraft({
    ...cloneJson(source),
    id: "",
    name: name ? `${name} Copy` : "",
    effectLinks: Array.isArray(source.effectLinks) ? source.effectLinks.map((entry) => ({ ...cloneJson(entry) })) : [],
    levels: Array.isArray(source.levels) ? source.levels.map((entry, index) => ({
      ...cloneJson(entry),
      id: "",
      abilityLevel: String(index + 1)
    })) : [createEmptyAbilityLevelDraft(1)],
    dataExtraData: cloneJson(source.dataExtraData ?? {}),
    effectDataExtraData: cloneJson(source.effectDataExtraData ?? {})
  });
}
function makeEquipmentDuplicateDraft(source) {
  const name = String(source.name ?? "").trim();
  return {
    ...cloneJson(source),
    id: "",
    name: name ? `${name} Copy` : "",
    flagsExtraData: cloneJson(source.flagsExtraData ?? {}),
    effectDataExtraData: cloneJson(source.effectDataExtraData ?? {}),
    modifiers: Array.isArray(source.modifiers) ? source.modifiers.map((entry) => ({
      ...cloneJson(entry)
    })) : [],
    abilityLinks: Array.isArray(source.abilityLinks) ? source.abilityLinks.map((entry) => ({
      ...cloneJson(entry)
    })) : []
  };
}
function generatedSkillPreview(draft, references, state) {
  const list = Array.isArray(state?.lists?.skills) ? state.lists.skills : [];
  const existingCodes = list.map((item) => item?.code);
  const code = uniqueGeneratedCode(slugifyName(draft.name), existingCodes);
  const tags = buildSkillAutoTags(draft, references);
  const sortOrder = draft.id ? Number.parseInt(String(state?.bundles?.skills?.skill?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list);
  return { code, tags, sortOrder };
}
function generatedWeaponPreview(draft, state) {
  const list = Array.isArray(state?.lists?.weapons) ? state.lists.weapons : [];
  const existingCodes = list.map((item) => item?.code);
  const code = uniqueGeneratedCode(slugifyName(draft.name), existingCodes);
  const tags = ["weapon"];
  const sortOrder = draft.id ? Number.parseInt(String(state?.bundles?.weapons?.weapon?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list);
  return { code, tags, sortOrder };
}
function generatedItemPreview(draft, state) {
  const list = Array.isArray(state?.lists?.items) ? state.lists.items : [];
  const existingCodes = list.map((item) => item?.code);
  const code = uniqueGeneratedCode(slugifyName(draft.name), existingCodes);
  const tags = [
    "item",
    String(draft.itemType ?? "").trim(),
    draft.isStackable ? "stackable" : "single",
    String(draft.useActionType ?? "").trim() ? `use:${String(draft.useActionType ?? "").trim()}` : ""
  ].filter(Boolean);
  const sortOrder = draft.id ? Number.parseInt(String(state?.bundles?.items?.item_def?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list);
  return { code, tags, sortOrder };
}
function generatedCaliberPreview(draft, state) {
  const list = Array.isArray(state?.lists?.calibers) ? state.lists.calibers : [];
  const existingCodes = list.map((item) => item?.code);
  const code = uniqueGeneratedCode(slugifyName(draft.name), existingCodes);
  const tags = ["caliber"];
  const sortOrder = draft.id ? Number.parseInt(String(state?.bundles?.calibers?.caliber?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list);
  return { code, tags, sortOrder };
}
function generatedAmmoPreview(draft, state, references) {
  const list = Array.isArray(state?.lists?.ammo) ? state.lists.ammo : [];
  const caliberCode = String(
    (Array.isArray(references?.calibers) ? references.calibers : []).find((entry) => entry.id === draft.caliberId)?.code ?? ""
  ).trim();
  const existingCodes = list.filter((item) => String(item?.caliber_id ?? "") === String(draft.caliberId ?? "")).map((item) => item?.code);
  const codeBase = caliberCode ? `${slugifyName(draft.name)}_${caliberCode}` : slugifyName(draft.name);
  const code = uniqueGeneratedCode(codeBase, existingCodes);
  const tags = ["ammo", caliberCode ? `caliber:${caliberCode}` : ""].filter(Boolean);
  const sortOrder = draft.id ? Number.parseInt(String(state?.bundles?.ammo?.ammo_type?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list);
  return { code, tags, sortOrder };
}
function generatedMagazinePreview(draft, state, references) {
  const list = Array.isArray(state?.lists?.magazines) ? state.lists.magazines : [];
  const caliberCode = String(
    (Array.isArray(references?.calibers) ? references.calibers : []).find((entry) => entry.id === draft.caliberId)?.code ?? ""
  ).trim();
  const existingCodes = list.map((item) => item?.code);
  const codeBase = caliberCode ? `${slugifyName(draft.name)}_${caliberCode}` : slugifyName(draft.name);
  const code = uniqueGeneratedCode(codeBase, existingCodes);
  const tags = ["magazine", caliberCode ? `caliber:${caliberCode}` : ""].filter(Boolean);
  const sortOrder = draft.id ? Number.parseInt(String(state?.bundles?.magazines?.magazine_def?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list);
  return { code, tags, sortOrder };
}
function generatedEffectPreview(draft, state) {
  const list = Array.isArray(state?.lists?.effects) ? state.lists.effects : [];
  const existingCodes = list.map((item) => item?.code);
  const code = uniqueGeneratedCode(slugifyName(draft.name), existingCodes);
  const tags = buildEffectAutoTags(draft);
  const sortOrder = draft.id ? Number.parseInt(String(state?.bundles?.effects?.effect?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list);
  return { code, tags, sortOrder };
}
function generatedAbilityPreview(draft, state) {
  const list = Array.isArray(state?.lists?.abilities) ? state.lists.abilities : [];
  const existingCodes = list.map((item) => item?.code);
  const code = uniqueGeneratedCode(slugifyName(draft.name), existingCodes);
  const tags = buildAbilityAutoTags(draft);
  const sortOrder = draft.id ? Number.parseInt(String(state?.bundles?.abilities?.ability?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list);
  return { code, tags, sortOrder };
}
function generatedEquipmentPreview(draft, state) {
  const list = Array.isArray(state?.lists?.equipment) ? state.lists.equipment : [];
  const existingCodes = list.map((item) => item?.code);
  const code = uniqueGeneratedCode(slugifyName(draft.name), existingCodes);
  const tags = buildEquipmentAutoTags(draft);
  const sortOrder = draft.id ? Number.parseInt(String(state?.bundles?.equipment?.equipment_model?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list);
  return { code, tags, sortOrder };
}
function buildAbilityLinkPayload(link, index) {
  const grantMode = String(link.grantMode ?? "activated").trim() || "activated";
  const isPassive = grantMode === "passive";
  const durationMode = String(link.durationRoundsMode ?? "").trim() || "none";
  const chargesMode = String(link.chargesMode ?? "").trim() || "none";
  const cooldownMode = String(link.cooldownRoundsMode ?? "").trim() || "none";
  const charges = String(link.charges ?? "").trim();
  const cooldown = String(link.cooldownRounds ?? "").trim();
  const duration = String(link.durationRounds ?? "").trim();
  const reloadMode = String(link.reloadMode ?? "").trim();
  const reloadItemCode = String(link.reloadItemCode ?? "").trim();
  const data = {};
  if (durationMode === "set" && duration !== "") {
    data.duration_rounds = coerceInteger(duration, 0);
  }
  if (chargesMode === "set" && charges !== "") {
    const value = coerceInteger(charges, 0);
    data.default_current_charges = value;
    data.default_max_charges = value;
  }
  if (cooldownMode === "set" && cooldown !== "") {
    data.cooldown_rounds = coerceInteger(cooldown, 0);
  }
  if (reloadMode) {
    data.reload = { mode: reloadMode };
    if (reloadItemCode) {
      data.reload.item_code = reloadItemCode;
    }
  }
  return {
    ability_def_id: String(link.abilityDefId ?? "").trim(),
    grant_mode: grantMode,
    is_enabled: isPassive,
    sort_order: index,
    data
  };
}
function buildFlagPayload(entry) {
  const key = String(entry?.key ?? "").trim() === "custom" ? String(entry?.customKey ?? "").trim() : String(entry?.key ?? "").trim();
  if (!key) {
    return null;
  }
  return [key, Boolean(entry?.enabled)];
}
function buildSkillPayload(draft, auto) {
  const skillConfig = getSkillSubcategoryConfig(draft.skillGroup, draft.skillSubcategory);
  return {
    id: draft.id || void 0,
    code: String(auto.code ?? "").trim(),
    name: String(draft.name ?? "").trim(),
    category: String(skillConfig?.backendCategory ?? draft.category ?? "combat").trim() || "combat",
    max_level: coerceInteger(skillConfig?.maxLevel ?? draft.maxLevel, 5),
    main_attribute_id: String(draft.mainAttributeId ?? "").trim() || null,
    secondary_attribute_id: String(draft.secondaryAttributeId ?? "").trim() || null,
    sort_order: auto.sortOrder,
    description: String(draft.description ?? ""),
    tags: auto.tags
  };
}
function buildWeaponPayload(draft, auto, references) {
  const profiles = Array.isArray(draft.profiles) && draft.profiles.length ? draft.profiles.map((entry, index) => ({
    ...cloneJson(entry),
    isDefault: index === (draft.profiles.findIndex((profile) => profile.isDefault) >= 0 ? draft.profiles.findIndex((profile) => profile.isDefault) : 0)
  })) : [createEmptyWeaponProfileDraft(0)];
  const defaultProfile = profiles.find((entry) => entry.isDefault) ?? profiles[0];
  const meleeFireModeId = String((Array.isArray(references?.fire_modes) ? references.fire_modes : []).find((entry) => entry.code === "melee_strike")?.id ?? "");
  const meleeWeaponClassId = String((Array.isArray(references?.weapon_classes) ? references.weapon_classes : []).find((entry) => entry.code === "melee_weapon")?.id ?? "");
  const meleeRangeProfileId = String((Array.isArray(references?.range_profiles) ? references.range_profiles : []).find((entry) => entry.code === "melee_profile")?.id ?? "");
  const payloadProfiles = profiles.map((profile, index) => {
    const attackType = String(profile.attackType ?? "ranged").trim() === "melee" ? "melee" : "ranged";
    const data = toPlainObject(cloneJson(profile.dataExtraData));
    data.armor_pierce = coerceInteger(profile.armorPierce, 0);
    data.two_handed = Boolean(profile.twoHanded);
    if (attackType === "melee") {
      data.can_parry = Boolean(profile.canParry);
    } else {
      delete data.can_parry;
    }
    const fireModeIds = attackType === "melee" ? meleeFireModeId ? [meleeFireModeId] : [] : Array.from(new Set((Array.isArray(profile.fireModeIds) ? profile.fireModeIds : []).map((entry) => String(entry ?? "").trim()).filter(Boolean)));
    const magazineDefIds = attackType === "ranged" ? Array.from(new Set((Array.isArray(profile.magazineDefIds) ? profile.magazineDefIds : []).map((entry) => String(entry ?? "").trim()).filter(Boolean))) : [];
    const caliberId = attackType === "ranged" ? String(profile.caliberId ?? "").trim() : null;
    const profileCodeBase = slugifyName(profile.name) || `${attackType}_profile_${index + 1}`;
    const priorProfileCodes = profiles.slice(0, index).map((entry, earlierIndex) => slugifyName(entry.name) || `${String(entry.attackType ?? "ranged").trim() === "melee" ? "melee" : "ranged"}_profile_${earlierIndex + 1}`);
    return {
      id: profile.id || void 0,
      code: uniqueGeneratedCode(profileCodeBase, priorProfileCodes),
      name: String(profile.name ?? "").trim(),
      description: "",
      attack_type: attackType,
      weapon_class_id: attackType === "melee" ? String(profile.weaponClassId ?? "").trim() || meleeWeaponClassId || null : String(profile.weaponClassId ?? "").trim() || null,
      linked_skill_id: String(profile.linkedSkillId ?? "").trim() || null,
      caliber_id: caliberId,
      range_profile_id: attackType === "melee" ? String(profile.rangeProfileId ?? "").trim() || meleeRangeProfileId || null : String(profile.rangeProfileId ?? "").trim() || null,
      accuracy_modifier: coerceInteger(profile.accuracyModifier, 0),
      base_melee_damage: coerceInteger(profile.baseMeleeDamage, 0),
      is_default: Boolean(profile.isDefault),
      sort_order: index * 10,
      data,
      tags: [
        "weapon_profile",
        `attack_type:${attackType}`,
        attackType === "ranged" && caliberId ? `caliber:${String((Array.isArray(references?.calibers) ? references.calibers : []).find((entry) => entry.id === caliberId)?.code ?? "")}` : ""
      ].filter(Boolean),
      fire_mode_ids: fireModeIds,
      magazine_def_ids: magazineDefIds
    };
  });
  const resolvedDefaultProfile = payloadProfiles.find((entry) => entry.is_default) ?? payloadProfiles[0] ?? {};
  return {
    id: draft.id || void 0,
    code: String(auto.code ?? "").trim(),
    name: String(draft.name ?? "").trim(),
    weapon_class_id: resolvedDefaultProfile.weapon_class_id ?? null,
    linked_skill_id: resolvedDefaultProfile.linked_skill_id ?? null,
    caliber_id: resolvedDefaultProfile.attack_type === "ranged" ? resolvedDefaultProfile.caliber_id ?? null : null,
    range_profile_id: resolvedDefaultProfile.range_profile_id ?? null,
    base_accuracy_bonus: coerceInteger(defaultProfile?.accuracyModifier, 0),
    base_melee_damage: coerceInteger(defaultProfile?.baseMeleeDamage, 0),
    description: String(draft.description ?? ""),
    sort_order: auto.sortOrder,
    tags: auto.tags,
    profiles: payloadProfiles,
    feature_links: [],
    ability_links: []
  };
}
function buildItemPayload(draft, auto) {
  return {
    id: draft.id || void 0,
    code: String(auto.code ?? "").trim(),
    name: String(draft.name ?? "").trim(),
    item_type: String(draft.itemType ?? "custom").trim() || "custom",
    description: String(draft.description ?? ""),
    is_stackable: Boolean(draft.isStackable),
    default_quantity: Math.max(0, coerceInteger(draft.defaultQuantity, 1)),
    max_stack: draft.isStackable && String(draft.maxStack ?? "").trim() !== "" ? Math.max(1, coerceInteger(draft.maxStack, 1)) : null,
    default_max_charges: String(draft.defaultMaxCharges ?? "").trim() !== "" ? Math.max(0, coerceInteger(draft.defaultMaxCharges, 0)) : null,
    default_current_charges: String(draft.defaultCurrentCharges ?? "").trim() !== "" ? Math.max(0, coerceInteger(draft.defaultCurrentCharges, 0)) : null,
    use_action_type: String(draft.useActionType ?? "none").trim() || "none",
    effect_data: toPlainObject(cloneJson(draft.effectDataExtraData)),
    data: toPlainObject(cloneJson(draft.dataExtraData)),
    sort_order: auto.sortOrder,
    tags: auto.tags,
    ability_links: (Array.isArray(draft.abilityLinks) ? draft.abilityLinks : []).filter((entry) => String(entry?.abilityDefId ?? "").trim()).map((entry, index) => buildAbilityLinkPayload(entry, index))
  };
}
function buildCaliberPayload(draft, auto) {
  return {
    id: draft.id || void 0,
    code: String(auto.code ?? "").trim(),
    name: String(draft.name ?? "").trim(),
    base_damage_per_round: coerceInteger(draft.baseDamagePerRound, 0),
    description: String(draft.description ?? ""),
    sort_order: auto.sortOrder,
    tags: auto.tags
  };
}
function buildAmmoPayload(draft, auto) {
  return {
    id: draft.id || void 0,
    code: String(auto.code ?? "").trim(),
    caliber_id: String(draft.caliberId ?? "").trim(),
    name: String(draft.name ?? "").trim(),
    damage_modifier: coerceInteger(draft.damageModifier, 0),
    accuracy_modifier: coerceInteger(draft.accuracyModifier, 0),
    armor_pierce: coerceInteger(draft.armorPierce, 0),
    description: String(draft.description ?? ""),
    sort_order: auto.sortOrder,
    tags: auto.tags
  };
}
function buildMagazinePayload(draft, auto) {
  return {
    id: draft.id || void 0,
    code: String(auto.code ?? "").trim(),
    caliber_id: String(draft.caliberId ?? "").trim(),
    name: String(draft.name ?? "").trim(),
    capacity: Math.max(1, coerceInteger(draft.capacity, 1)),
    description: String(draft.description ?? ""),
    sort_order: auto.sortOrder,
    tags: auto.tags
  };
}
function buildEffectPayload(draft, auto) {
  const data = toPlainObject(cloneJson(draft.dataExtraData));
  const payload = toPlainObject(cloneJson(draft.payloadExtraData));
  const modifiers = (Array.isArray(draft.modifiers) ? draft.modifiers : []).map(buildModifierPayload).filter(Boolean);
  const flags = Object.fromEntries(
    (Array.isArray(draft.flags) ? draft.flags : []).map(buildFlagPayload).filter(Boolean)
  );
  if (modifiers.length) {
    data.modifiers = modifiers;
  } else {
    delete data.modifiers;
  }
  if (Object.keys(flags).length) {
    data.flags = flags;
  } else {
    delete data.flags;
  }
  const effectType = String(draft.effectType ?? "modifiers_flags").trim() || "modifiers_flags";
  if (effectType === "modifiers_flags") {
    delete data.payload;
  } else {
    payload.type = effectType;
    payload.target_scope = String(draft.targetScope ?? getDefaultTargetScopeForEffectType(effectType)).trim() || getDefaultTargetScopeForEffectType(effectType);
    if (effectTypeUsesScale(effectType)) {
      payload.scale = {
        base: coerceInteger(draft.scaleBase, 0),
        per_level: coerceInteger(draft.scalePerLevel, 0),
        metric: String(draft.amountMetric ?? getDefaultMetricForEffectType(effectType)).trim() || getDefaultMetricForEffectType(effectType)
      };
    } else {
      delete payload.scale;
    }
    if (effectTypeUsesTickPhase(effectType)) {
      payload.tick_phase = String(draft.tickPhase ?? "turn_end").trim() || "turn_end";
    } else {
      delete payload.tick_phase;
    }
    if (effectTypeUsesResourcePool(effectType)) {
      payload.resource_pool_id = String(draft.resourcePoolId ?? "").trim() || null;
    } else {
      delete payload.resource_pool_id;
    }
    if (effectTypeUsesRestoreDisabled(effectType)) {
      payload.restore_disabled = Boolean(draft.restoreDisabled);
    } else {
      delete payload.restore_disabled;
    }
    data.payload = payload;
  }
  return {
    id: draft.id || void 0,
    code: String(auto.code ?? "").trim(),
    name: String(draft.name ?? "").trim(),
    category: String(draft.uiCategory ?? "utility").trim() || "utility",
    description: String(draft.description ?? ""),
    default_duration_type: String(draft.defaultDurationType ?? "manual").trim() || "manual",
    default_rounds: String(draft.defaultDurationType ?? "manual") === "rounds" ? coerceInteger(draft.defaultRounds, 1) : null,
    stacking_mode: String(draft.stackingMode ?? "replace").trim() || "replace",
    is_negative: effectCategoryIsNegative(draft.uiCategory),
    is_narrative: false,
    sort_order: auto.sortOrder,
    tags: auto.tags,
    data
  };
}
function buildAbilityLevelPayload(levelDraft, fallbackLevel) {
  const options = arguments[2] ?? {};
  const showResourceCost = Boolean(options.showResourceCost);
  const showDuration = Boolean(options.showDuration);
  const showAttackFields = Boolean(options.showAttackFields);
  const showSpecialFields = Boolean(options.showSpecialFields);
  return {
    id: levelDraft.id || void 0,
    ability_level: coerceInteger(levelDraft.abilityLevel, fallbackLevel),
    resource_cost: showResourceCost ? coerceInteger(levelDraft.resourceCost, 0) : 0,
    cooldown_rounds: null,
    range_profile_id: null,
    attack_accuracy_bonus: showAttackFields ? coerceInteger(levelDraft.attackAccuracyBonus, 0) : 0,
    attack_damage_bonus: showAttackFields ? coerceInteger(levelDraft.attackDamageBonus, 0) : 0,
    attack_armor_pierce: showAttackFields ? coerceInteger(levelDraft.attackArmorPierce, 0) : 0,
    ignore_armor: false,
    special_armor_value: showSpecialFields && String(levelDraft.specialArmorValue ?? "").trim() !== "" ? coerceInteger(levelDraft.specialArmorValue, 0) : null,
    special_max_critical: showSpecialFields && String(levelDraft.specialMaxCritical ?? "").trim() !== "" ? coerceInteger(levelDraft.specialMaxCritical, 0) : null,
    duration_rounds: showDuration && String(levelDraft.durationRounds ?? "").trim() !== "" ? coerceInteger(levelDraft.durationRounds, 0) : null,
    data: toPlainObject(cloneJson(levelDraft.dataExtraData)),
    effect_data: toPlainObject(cloneJson(levelDraft.effectDataExtraData))
  };
}
function buildAbilityPayload(draft, auto) {
  const normalizedDraft = normalizeAbilityEditorDraft(draft);
  const uiKind = String(normalizedDraft.uiKind ?? "utility").trim() || "utility";
  const sourceLabel = String(normalizedDraft.sourceLabel ?? "technical").trim() || "technical";
  const resolutionMode = String(normalizedDraft.resolutionMode ?? getDefaultResolutionForAbilityKind(uiKind)).trim() || getDefaultResolutionForAbilityKind(uiKind);
  const targetType = String(normalizedDraft.targetType ?? getDefaultTargetTypeForAbilityKind(uiKind, resolutionMode)).trim() || getDefaultTargetTypeForAbilityKind(uiKind, resolutionMode);
  const attackType = abilityUsesAttackFields(uiKind, resolutionMode) ? String(normalizedDraft.attackType ?? getDefaultAttackTypeForAbilityKind(uiKind)).trim() || getDefaultAttackTypeForAbilityKind(uiKind) : null;
  const sourceType = sourceLabel === "psionic" ? "psionic" : "equipment";
  const abilityKind = uiKind === "support" ? "support" : uiKind;
  const activationType = abilityIsPassive(uiKind) ? "passive" : "manual";
  const data = toPlainObject(cloneJson(normalizedDraft.dataExtraData));
  const effectData = toPlainObject(cloneJson(normalizedDraft.effectDataExtraData));
  const showSpecialFields = abilityUsesSpecialFields(resolutionMode);
  const showAttackFields = abilityUsesAttackFields(uiKind, resolutionMode) && !showSpecialFields;
  const showResourceCost = !abilityIsTechnical(sourceLabel);
  const showDuration = !abilityIsTechnical(sourceLabel) && !showSpecialFields;
  if (attackType === "melee") {
    data.range = {
      mode: "limited",
      max_distance_m: 2
    };
  } else if (String(normalizedDraft.rangeMode ?? "").trim() === "limited" && String(normalizedDraft.maxDistanceM ?? "").trim() !== "") {
    data.range = {
      mode: "limited",
      max_distance_m: coerceInteger(normalizedDraft.maxDistanceM, 0)
    };
  } else {
    delete data.range;
  }
  if (abilityUsesEffectLinks(resolutionMode)) {
    data.effect_links = (Array.isArray(normalizedDraft.effectLinks) ? normalizedDraft.effectLinks : []).map((entry) => String(entry?.effectDefId ?? "").trim()).filter(Boolean).map((effectDefId, index) => ({
      effect_def_id: effectDefId,
      sort_order: index
    }));
  } else {
    delete data.effect_links;
  }
  data.creator_source_label = sourceLabel;
  const levels = abilityIsTechnical(sourceLabel) ? [buildAbilityLevelPayload(
    Array.isArray(normalizedDraft.levels) && normalizedDraft.levels[0] ? normalizedDraft.levels[0] : createEmptyAbilityLevelDraft(1),
    1,
    { showResourceCost, showDuration, showAttackFields, showSpecialFields }
  )] : (Array.isArray(normalizedDraft.levels) ? normalizedDraft.levels : []).map((entry, index) => buildAbilityLevelPayload(
    entry,
    index + 1,
    { showResourceCost, showDuration, showAttackFields, showSpecialFields }
  )).sort((left, right) => coerceInteger(left.ability_level, 0) - coerceInteger(right.ability_level, 0));
  return {
    id: normalizedDraft.id || void 0,
    code: String(auto.code ?? "").trim(),
    name: String(normalizedDraft.name ?? "").trim(),
    ability_kind: abilityKind,
    source_type: sourceType,
    activation_type: activationType,
    target_type: targetType,
    effect_mode: resolutionMode,
    attack_type: attackType,
    linked_skill_id: null,
    resource_mode: sourceLabel === "psionic" ? "pool" : "none",
    resource_pool_code: sourceLabel === "psionic" ? "psionic_energy" : null,
    resource_item_code: null,
    description: String(normalizedDraft.description ?? ""),
    data,
    effect_data: effectData,
    tags: auto.tags,
    sort_order: auto.sortOrder,
    levels,
    effect_links: abilityUsesEffectLinks(resolutionMode) ? Array.isArray(data.effect_links) ? data.effect_links : [] : []
  };
}
function buildEquipmentPayload(draft, auto) {
  const showProtectionSlots = shouldShowProtectionSlots(draft.itemType);
  const selectedAllowedCodes = normalizeBodyPartCodeArray(draft.allowedBodyPartCodes);
  const suggestedAllowedCodes = suggestAllowedBodyPartCodes(draft.defaultBodyPartCode);
  const effectiveAllowedCodes = selectedAllowedCodes.length ? selectedAllowedCodes : suggestedAllowedCodes;
  const canEquipToBodyPart = shouldEquipToBodyPart(draft.itemType, effectiveAllowedCodes, draft.defaultBodyPartCode);
  const primaryBodyPartCode = showProtectionSlots ? getPrimaryBodyPartCode(effectiveAllowedCodes, draft.defaultBodyPartCode) : "";
  const flags = toPlainObject(cloneJson(draft.flagsExtraData));
  const effectData = toPlainObject(cloneJson(draft.effectDataExtraData));
  const finalAllowedCodes = canEquipToBodyPart ? effectiveAllowedCodes : [];
  if (canEquipToBodyPart && finalAllowedCodes.length) {
    flags.allowed_body_part_codes = finalAllowedCodes;
  } else {
    delete flags.allowed_body_part_codes;
  }
  delete flags.protects_helpless_execution;
  if (draft.reservedForFuture) {
    effectData.reserved_for_future = true;
  } else {
    delete effectData.reserved_for_future;
  }
  if (String(draft.notes ?? "").trim()) {
    effectData.notes = String(draft.notes ?? "").trim();
  } else {
    delete effectData.notes;
  }
  const modifiers = (Array.isArray(draft.modifiers) ? draft.modifiers : []).map(buildModifierPayload).filter(Boolean);
  if (modifiers.length) {
    effectData.modifiers = modifiers;
  } else {
    delete effectData.modifiers;
  }
  return {
    id: draft.id || void 0,
    code: String(auto.code ?? "").trim(),
    name: String(draft.name ?? "").trim(),
    item_type: String(draft.itemType ?? "armor").trim() || "armor",
    description: String(draft.description ?? ""),
    armor_value: coerceInteger(draft.armorValue, 0),
    armor_max_minor: 0,
    armor_max_serious: 0,
    armor_max_critical: coerceInteger(draft.armorMaxCritical, 0),
    default_body_part_code: primaryBodyPartCode || null,
    can_equip: true,
    can_equip_to_body_part: canEquipToBodyPart,
    sort_order: auto.sortOrder,
    tags: auto.tags,
    flags,
    effect_data: effectData,
    ability_links: (Array.isArray(draft.abilityLinks) ? draft.abilityLinks : []).filter((entry) => String(entry?.abilityDefId ?? "").trim()).map((entry, index) => buildAbilityLinkPayload(entry, index))
  };
}
function buildModifierPayload(entry) {
  const target = String(entry?.target ?? "").trim() || "attack_accuracy";
  const resolvedTarget = target === "custom" ? String(entry?.customTarget ?? "").trim() : target;
  if (!resolvedTarget) {
    return null;
  }
  const payload = {
    target: resolvedTarget,
    value: coerceInteger(entry?.value, 0)
  };
  if (resolvedTarget === "attribute") {
    const attributeCode = String(entry?.attributeCode ?? "").trim();
    if (!attributeCode) {
      return null;
    }
    payload.attribute = attributeCode;
  }
  if (resolvedTarget === "skill") {
    const skillCode = String(entry?.skillCode ?? "").trim();
    if (!skillCode) {
      return null;
    }
    payload.skill_code = skillCode;
  }
  return payload;
}
function extractEntityBundle(result) {
  if (result?.entity?.ok) {
    return result.entity;
  }
  if (result?.ok) {
    return result;
  }
  return null;
}
function buildTabButtons(activeTab) {
  return CREATOR_TABS.map(
    (tab) => `
        <button
          type="button"
          class="creator-tab${activeTab === tab.id ? " active" : ""}"
          data-creator-tab="${tab.id}"
        >${escapeHtml(tab.label)}</button>
      `
  ).join("");
}
function buildCaliberFilterMarkup(state) {
  return `
    <div class="creator-toolbar">
      <label class="field-stack">
        <span>Search</span>
        <input data-creator-filter-search="calibers" type="text" value="${escapeHtml(state.filters.calibers.search)}" placeholder="code, name, tags">
      </label>
      <div class="creator-filter-actions">
        <button type="button" class="secondary" data-creator-action="applyFilters">Apply Filters</button>
        <button type="button" class="secondary" data-creator-action="refreshList">Refresh</button>
      </div>
    </div>
  `;
}
function buildWeaponFilterMarkup(state) {
  return `
    <div class="creator-toolbar">
      <label class="field-stack">
        <span>Search</span>
        <input data-creator-filter-search="weapons" type="text" value="${escapeHtml(state.filters.weapons.search)}" placeholder="code, name, class, caliber">
      </label>
      <div class="creator-filter-actions">
        <button type="button" class="secondary" data-creator-action="applyFilters">Apply Filters</button>
        <button type="button" class="secondary" data-creator-action="refreshList">Refresh</button>
      </div>
    </div>
  `;
}
function buildItemFilterMarkup(state) {
  const typeOptions = ['<option value="">All item types</option>'].concat(
    ITEM_TYPE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${state.filters.items.itemType === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
  ).join("");
  return `
    <div class="creator-toolbar">
      <label class="field-stack">
        <span>Search</span>
        <input data-creator-filter-search="items" type="text" value="${escapeHtml(state.filters.items.search)}" placeholder="code, name, type, tags">
      </label>
      <label class="field-stack">
        <span>Item Type</span>
        <select data-creator-filter-item-type="items">
          ${typeOptions}
        </select>
      </label>
      <div class="creator-filter-actions">
        <button type="button" class="secondary" data-creator-action="applyFilters">Apply Filters</button>
        <button type="button" class="secondary" data-creator-action="refreshList">Refresh</button>
      </div>
    </div>
  `;
}
function buildAmmoFilterMarkup(state, references) {
  const calibers = Array.isArray(references?.calibers) ? references.calibers : [];
  const options = ['<option value="">All calibers</option>'];
  for (const caliber of calibers) {
    options.push(
      `<option value="${escapeHtml(caliber.id)}"${state.filters.ammo.caliberId === caliber.id ? " selected" : ""}>${escapeHtml(caliber.name || caliber.code)}</option>`
    );
  }
  return `
    <div class="creator-toolbar">
      <label class="field-stack">
        <span>Search</span>
        <input data-creator-filter-search="ammo" type="text" value="${escapeHtml(state.filters.ammo.search)}" placeholder="code, name, tags">
      </label>
      <label class="field-stack">
        <span>Caliber</span>
        <select data-creator-filter-caliber="ammo">
          ${options.join("")}
        </select>
      </label>
      <div class="creator-filter-actions">
        <button type="button" class="secondary" data-creator-action="applyFilters">Apply Filters</button>
        <button type="button" class="secondary" data-creator-action="refreshList">Refresh</button>
      </div>
    </div>
  `;
}
function buildMagazineFilterMarkup(state, references) {
  const calibers = Array.isArray(references?.calibers) ? references.calibers : [];
  const options = ['<option value="">All calibers</option>'];
  for (const caliber of calibers) {
    options.push(
      `<option value="${escapeHtml(caliber.id)}"${state.filters.magazines.caliberId === caliber.id ? " selected" : ""}>${escapeHtml(caliber.name || caliber.code)}</option>`
    );
  }
  return `
    <div class="creator-toolbar">
      <label class="field-stack">
        <span>Search</span>
        <input data-creator-filter-search="magazines" type="text" value="${escapeHtml(state.filters.magazines.search)}" placeholder="code, name, tags">
      </label>
      <label class="field-stack">
        <span>Caliber</span>
        <select data-creator-filter-caliber="magazines">
          ${options.join("")}
        </select>
      </label>
      <div class="creator-filter-actions">
        <button type="button" class="secondary" data-creator-action="applyFilters">Apply Filters</button>
        <button type="button" class="secondary" data-creator-action="refreshList">Refresh</button>
      </div>
    </div>
  `;
}
function buildSkillFilterMarkup(state, references) {
  const selected = state.filters.skills.category;
  const options = [
    '<option value="">All groups</option>',
    ...SKILL_UI_GROUP_OPTIONS.map(
      (group) => `<option value="${escapeHtml(group.value)}"${selected === group.value ? " selected" : ""}>${escapeHtml(group.label)}</option>`
    )
  ];
  return `
    <div class="creator-toolbar">
      <label class="field-stack">
        <span>Search</span>
        <input data-creator-filter-search="skills" type="text" value="${escapeHtml(state.filters.skills.search)}" placeholder="code, name, tags">
      </label>
      <label class="field-stack">
        <span>Group</span>
        <select data-creator-filter-category="skills">
          ${options.join("")}
        </select>
      </label>
      <div class="creator-filter-actions">
        <button type="button" class="secondary" data-creator-action="applyFilters">Apply Filters</button>
        <button type="button" class="secondary" data-creator-action="refreshList">Refresh</button>
      </div>
    </div>
  `;
}
function buildEffectFilterMarkup(state) {
  const selected = state.filters.effects.category;
  const options = [
    '<option value="">All categories</option>',
    ...EFFECT_UI_CATEGORY_OPTIONS.map(
      (category) => `<option value="${escapeHtml(category.value)}"${selected === category.value ? " selected" : ""}>${escapeHtml(category.label)}</option>`
    )
  ];
  return `
    <div class="creator-toolbar">
      <label class="field-stack">
        <span>Search</span>
        <input data-creator-filter-search="effects" type="text" value="${escapeHtml(state.filters.effects.search)}" placeholder="code, name, tags">
      </label>
      <label class="field-stack">
        <span>Category</span>
        <select data-creator-filter-category="effects">
          ${options.join("")}
        </select>
      </label>
      <div class="creator-filter-actions">
        <button type="button" class="secondary" data-creator-action="applyFilters">Apply Filters</button>
        <button type="button" class="secondary" data-creator-action="refreshList">Refresh</button>
      </div>
    </div>
  `;
}
function buildAbilityFilterMarkup(state) {
  return `
    <div class="creator-toolbar">
      <label class="field-stack">
        <span>Search</span>
        <input data-creator-filter-search="abilities" type="text" value="${escapeHtml(state.filters.abilities.search)}" placeholder="code, name, tags">
      </label>
      <div class="creator-filter-actions">
        <button type="button" class="secondary" data-creator-action="applyFilters">Apply Filters</button>
        <button type="button" class="secondary" data-creator-action="refreshList">Refresh</button>
      </div>
    </div>
  `;
}
function buildEquipmentFilterMarkup(state, references) {
  const selected = state.filters.equipment.itemType;
  const types = getEquipmentUiTypes(references);
  const options = [
    '<option value="">All item types</option>',
    ...types.map(
      (itemType) => `<option value="${escapeHtml(itemType)}"${selected === itemType ? " selected" : ""}>${escapeHtml(itemType)}</option>`
    )
  ];
  return `
    <div class="creator-toolbar">
      <label class="field-stack">
        <span>Search</span>
        <input data-creator-filter-search="equipment" type="text" value="${escapeHtml(state.filters.equipment.search)}" placeholder="code, name, tags">
      </label>
      <label class="field-stack">
        <span>Item Type</span>
        <select data-creator-filter-item-type="equipment">
          ${options.join("")}
        </select>
      </label>
      <div class="creator-filter-actions">
        <button type="button" class="secondary" data-creator-action="applyFilters">Apply Filters</button>
        <button type="button" class="secondary" data-creator-action="refreshList">Refresh</button>
      </div>
    </div>
  `;
}
function buildListMarkup(kind, items, selectedId) {
  if (!items.length) {
    return `<div class="creator-empty">No ${kind === "weapons" ? "weapon models" : kind === "items" ? "item definitions" : kind === "calibers" ? "calibers" : kind === "ammo" ? "ammo definitions" : kind === "magazines" ? "magazine definitions" : kind === "skills" ? "skills" : kind === "effects" ? "effects" : kind === "abilities" ? "abilities" : "equipment models"} found for the current filter.</div>`;
  }
  return items.map((item) => {
    const isActive = selectedId && selectedId === item.id;
    const meta = kind === "weapons" ? [
      item.weapon_class_name || item.weapon_class_code || "no class",
      item.caliber_name || item.caliber_code || "melee / mixed",
      `${item.profile_count ?? 0} profile(s)`
    ] : kind === "items" ? [
      item.item_type || "no type",
      item.is_stackable ? "stackable" : "single"
    ] : kind === "calibers" ? [
      `base damage ${item.base_damage_per_round ?? 0}`,
      Array.isArray(item.tags) && item.tags.length ? item.tags.join(", ") : "auto tags"
    ] : kind === "ammo" ? [
      item.caliber_name || item.caliber_code || "no caliber",
      `dmg ${item.damage_modifier ?? 0}`,
      `acc ${item.accuracy_modifier ?? 0}`,
      `ap ${item.armor_pierce ?? 0}`
    ] : kind === "magazines" ? [
      item.caliber_name || item.caliber_code || "no caliber",
      `capacity ${item.capacity ?? 0}`
    ] : kind === "skills" ? (() => {
      const uiState = deriveSkillUiState(item.category, item.tags);
      return [
        `${uiState.skillGroup} / ${uiState.skillSubcategory}`,
        item.main_attribute_name || item.main_attribute_code || "no main attribute",
        item.secondary_attribute_name || item.secondary_attribute_code || "no secondary attribute"
      ];
    })() : kind === "effects" ? [
      deriveEffectUiCategory(item.category),
      item.default_duration_type || "manual",
      item.stacking_mode || "replace"
    ] : kind === "abilities" ? [
      item.ability_kind || "utility",
      item.source_type === "psionic" ? "psionic" : "technical",
      item.effect_mode || "narrative"
    ] : [
      item.item_type || "unknown",
      item.default_body_part_code || "no body part",
      `armor ${item.armor_value ?? 0}`
    ];
    return `
        <button
          type="button"
          class="creator-list-item${isActive ? " active" : ""}"
          data-creator-open="${escapeHtml(kind)}:${escapeHtml(item.id)}"
        >
          <span class="creator-list-title">${escapeHtml(item.name || item.code || "Unnamed")}</span>
          <span class="creator-list-code">${escapeHtml(item.code || "")}</span>
          <span class="creator-list-meta">${escapeHtml(meta.join(" | "))}</span>
        </button>
      `;
  }).join("");
}
function buildAttributeOptions(references, selectedValue) {
  const attributes = Array.isArray(references?.attributes) ? references.attributes : [];
  const options = ['<option value="">None</option>'];
  for (const attribute of attributes) {
    options.push(
      `<option value="${escapeHtml(attribute.id)}"${selectedValue === attribute.id ? " selected" : ""}>${escapeHtml(attribute.name || attribute.code || attribute.id)}</option>`
    );
  }
  return options.join("");
}
function buildSkillIdOptions(references, selectedValue, { categories = [] } = {}) {
  const allowed = Array.isArray(categories) && categories.length ? new Set(categories) : null;
  const skills = (Array.isArray(references?.skills) ? references.skills : []).filter((skill) => !allowed || allowed.has(String(skill?.category ?? "").trim()));
  const options = ['<option value="">Select skill</option>'];
  for (const skill of skills) {
    options.push(
      `<option value="${escapeHtml(skill.id)}"${selectedValue === skill.id ? " selected" : ""}>${escapeHtml(skill.name || skill.code || skill.id)}${skill.category ? ` | ${escapeHtml(skill.category)}` : ""}</option>`
    );
  }
  return options.join("");
}
function buildCaliberOptions(references, selectedValue) {
  const calibers = Array.isArray(references?.calibers) ? references.calibers : [];
  const options = ['<option value="">Select caliber</option>'];
  for (const caliber of calibers) {
    options.push(
      `<option value="${escapeHtml(caliber.id)}"${selectedValue === caliber.id ? " selected" : ""}>${escapeHtml(caliber.name || caliber.code || caliber.id)}${caliber.base_damage_per_round !== void 0 ? ` | base ${escapeHtml(String(caliber.base_damage_per_round))}` : ""}</option>`
    );
  }
  return options.join("");
}
function buildWeaponClassOptions(references, selectedValue, { attackType = "" } = {}) {
  const attack = String(attackType ?? "").trim();
  const classes = (Array.isArray(references?.weapon_classes) ? references.weapon_classes : []).filter((entry) => attack === "melee" ? String(entry?.code ?? "").trim() === "melee_weapon" : String(entry?.code ?? "").trim() !== "melee_weapon");
  const options = ['<option value="">Select weapon class</option>'];
  for (const weaponClass of classes) {
    options.push(
      `<option value="${escapeHtml(weaponClass.id)}"${selectedValue === weaponClass.id ? " selected" : ""}>${escapeHtml(weaponClass.name || weaponClass.code || weaponClass.id)}</option>`
    );
  }
  return options.join("");
}
function buildRangeProfileOptions(references, selectedValue, { attackType = "" } = {}) {
  const attack = String(attackType ?? "").trim();
  const profiles = (Array.isArray(references?.range_profiles) ? references.range_profiles : []).filter((entry) => attack === "melee" ? String(entry?.code ?? "").trim() === "melee_profile" : String(entry?.code ?? "").trim() !== "melee_profile");
  const options = ['<option value="">Select range profile</option>'];
  for (const rangeProfile of profiles) {
    options.push(
      `<option value="${escapeHtml(rangeProfile.id)}"${selectedValue === rangeProfile.id ? " selected" : ""}>${escapeHtml(rangeProfile.name || rangeProfile.code || rangeProfile.id)}</option>`
    );
  }
  return options.join("");
}
function buildItemTypeOptions(selectedValue) {
  return ITEM_TYPE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${selectedValue === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
}
function buildItemUseActionOptions(selectedValue) {
  return ITEM_USE_ACTION_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${selectedValue === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
}
function buildWeaponFireModeCheckboxMarkup(references, profile, index) {
  const selectedSet = new Set((Array.isArray(profile.fireModeIds) ? profile.fireModeIds : []).map((entry) => String(entry ?? "")));
  const modes = (Array.isArray(references?.fire_modes) ? references.fire_modes : []).filter((entry) => String(entry?.code ?? "").trim() !== "melee_strike");
  if (!modes.length) {
    return `<div class="creator-empty">No ranged fire modes found.</div>`;
  }
  return modes.map((mode) => `
      <label class="creator-check-pill">
        <input
          data-creator-weapon-profile-fire-mode="${escapeHtml(mode.id)}"
          data-weapon-profile-index="${escapeHtml(String(index))}"
          type="checkbox"
          ${selectedSet.has(mode.id) ? " checked" : ""}
        >
        <span>${escapeHtml(mode.name || mode.code)}${mode.accuracy_modifier ? ` | acc ${escapeHtml(String(mode.accuracy_modifier))}` : ""}</span>
      </label>
    `).join("");
}
function buildWeaponMagazineCheckboxMarkup(references, profile, index) {
  const selectedSet = new Set((Array.isArray(profile.magazineDefIds) ? profile.magazineDefIds : []).map((entry) => String(entry ?? "")));
  const caliberId = String(profile.caliberId ?? "").trim();
  const magazines = (Array.isArray(references?.magazine_definitions) ? references.magazine_definitions : []).filter((entry) => !caliberId || String(entry?.caliber_id ?? "").trim() === caliberId);
  if (!magazines.length) {
    return `<div class="creator-empty">No magazine definitions for this caliber yet.</div>`;
  }
  return magazines.map((magazine) => `
      <label class="creator-check-pill">
        <input
          data-creator-weapon-profile-magazine="${escapeHtml(magazine.id)}"
          data-weapon-profile-index="${escapeHtml(String(index))}"
          type="checkbox"
          ${selectedSet.has(magazine.id) ? " checked" : ""}
        >
        <span>${escapeHtml(magazine.name || magazine.code)}${magazine.capacity !== void 0 ? ` | cap ${escapeHtml(String(magazine.capacity))}` : ""}</span>
      </label>
    `).join("");
}
function buildResourcePoolOptions(references, selectedValue) {
  const pools = Array.isArray(references?.resource_pools) ? references.resource_pools : [];
  const options = ['<option value="">Select resource</option>'];
  for (const pool of pools) {
    options.push(
      `<option value="${escapeHtml(pool.id)}"${selectedValue === pool.id ? " selected" : ""}>${escapeHtml(pool.name || pool.code || pool.id)}</option>`
    );
  }
  return options.join("");
}
function buildBodyPartCheckboxMarkup(references, selectedCodes) {
  const selectedSet = new Set(normalizeBodyPartCodeArray(selectedCodes));
  const bodyParts = Array.isArray(references?.body_part_definitions) ? references.body_part_definitions : [];
  if (!bodyParts.length) {
    return `<div class="creator-empty">No body part definitions found.</div>`;
  }
  return bodyParts.map((part) => `
      <label class="creator-check-pill">
        <input data-creator-body-part-code="${escapeHtml(part.code)}" type="checkbox"${selectedSet.has(part.code) ? " checked" : ""}>
        <span>${escapeHtml(part.name || part.code)}</span>
      </label>
    `).join("");
}
function buildAbilityOptions(references, selectedValue, selectedIds = []) {
  const abilities = Array.isArray(references?.abilities) ? references.abilities : [];
  const selectedSet = new Set((selectedIds ?? []).filter(Boolean));
  const options = ['<option value="">Select ability</option>'];
  for (const ability of abilities) {
    const disabled = selectedSet.has(ability.id) && selectedValue !== ability.id;
    options.push(
      `<option value="${escapeHtml(ability.id)}"${selectedValue === ability.id ? " selected" : ""}${disabled ? " disabled" : ""}>${escapeHtml(ability.name || ability.code)}${ability.ability_kind ? ` | ${escapeHtml(ability.ability_kind)}` : ""}</option>`
    );
  }
  return options.join("");
}
function buildItemOptions(references, selectedValue) {
  const items = Array.isArray(references?.itemDefinitions) ? references.itemDefinitions : [];
  const options = ['<option value="">No reload item</option>'];
  for (const item of items) {
    options.push(
      `<option value="${escapeHtml(item.code)}"${selectedValue === item.code ? " selected" : ""}>${escapeHtml(item.name || item.code)}${item.item_type ? ` | ${escapeHtml(item.item_type)}` : ""}</option>`
    );
  }
  return options.join("");
}
function buildEffectOptions(references, selectedValue, selectedIds = []) {
  const effects = Array.isArray(references?.effects) ? references.effects : [];
  const selectedSet = new Set((selectedIds ?? []).filter(Boolean));
  const options = ['<option value="">Select effect</option>'];
  for (const effect of effects) {
    const disabled = selectedSet.has(effect.id) && selectedValue !== effect.id;
    options.push(
      `<option value="${escapeHtml(effect.id)}"${selectedValue === effect.id ? " selected" : ""}${disabled ? " disabled" : ""}>${escapeHtml(effect.name || effect.code)}${effect.category ? ` | ${escapeHtml(effect.category)}` : ""}</option>`
    );
  }
  return options.join("");
}
function buildModifierTargetOptions(selectedValue) {
  return MODIFIER_TARGET_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${selectedValue === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
}
function buildSkillCodeOptions(references, selectedValue) {
  const skills = Array.isArray(references?.skills) ? references.skills : [];
  const options = ['<option value="">Select skill</option>'];
  for (const skill of skills) {
    options.push(
      `<option value="${escapeHtml(skill.code)}"${selectedValue === skill.code ? " selected" : ""}>${escapeHtml(skill.name || skill.code)}${skill.category ? ` | ${escapeHtml(skill.category)}` : ""}</option>`
    );
  }
  return options.join("");
}
function buildCatalogSection({
  title,
  count,
  collapsed,
  action,
  bodyMarkup
}) {
  return `
    <aside class="creator-sidebar">
      <button type="button" class="creator-collapse-toggle" data-creator-action="${escapeHtml(action)}" aria-expanded="${collapsed ? "false" : "true"}">
        <span>${escapeHtml(title)}</span>
        <span class="creator-inline-compact">
          <span class="creator-count">${escapeHtml(String(count))}</span>
          <span class="creator-collapse-icon">${collapsed ? "+" : "-"}</span>
        </span>
      </button>
      ${collapsed ? "" : `<div class="creator-list">${bodyMarkup}</div>`}
    </aside>
  `;
}
function buildDisclosureSection({
  title,
  collapsed,
  action,
  summary = "",
  actionsMarkup = "",
  bodyMarkup = ""
}) {
  return `
    <div class="creator-section-card">
      <div class="creator-section-head">
        <button type="button" class="creator-section-toggle" data-creator-action="${escapeHtml(action)}" aria-expanded="${collapsed ? "false" : "true"}">
          <span>${escapeHtml(title)}</span>
          ${summary ? `<span class="muted">${escapeHtml(summary)}</span>` : ""}
          <span class="creator-collapse-icon">${collapsed ? "+" : "-"}</span>
        </button>
        ${actionsMarkup}
      </div>
      ${collapsed ? "" : bodyMarkup}
    </div>
  `;
}
function buildOptionalNumberField({
  label,
  field,
  index,
  value,
  mode
}) {
  const selectedMode = String(mode ?? "").trim() || "none";
  return `
    <div class="creator-small-stack">
      <span>${escapeHtml(label)}</span>
      <div class="creator-mini-grid">
        <select data-creator-link-input="${field}Mode" data-link-index="${index}">
          <option value="none"${selectedMode === "none" ? " selected" : ""}>None</option>
          <option value="set"${selectedMode === "set" ? " selected" : ""}>Set</option>
        </select>
        <input data-creator-link-input="${field}" data-link-index="${index}" type="number" min="0" value="${escapeHtml(value)}"${selectedMode === "set" ? "" : " disabled"}>
      </div>
    </div>
  `;
}
function buildModifierEditorMarkup(draft, references) {
  const modifiers = Array.isArray(draft.modifiers) ? draft.modifiers : [];
  if (!modifiers.length) {
    return `<div class="creator-empty">No modifiers yet. Add one if this model should grant a passive or active numeric effect.</div>`;
  }
  return modifiers.map((modifier, index) => {
    const resolvedTarget = String(modifier.target ?? "attack_accuracy");
    return `
        <div class="creator-link-card" data-creator-modifier-row="${index}">
          <div class="creator-link-head">
            <strong>Modifier ${index + 1}</strong>
            <button type="button" class="secondary" data-creator-modifier-remove="${index}">Remove</button>
          </div>
          <div class="field-grid creator-grid-3">
            <label class="field-stack">
              <span>Target</span>
              <select data-creator-modifier-input="target" data-modifier-index="${index}">
                ${buildModifierTargetOptions(resolvedTarget)}
              </select>
            </label>
            ${resolvedTarget === "attribute" ? `
              <label class="field-stack">
                <span>Attribute</span>
                <select data-creator-modifier-input="attributeCode" data-modifier-index="${index}">
                  ${buildAttributeOptions(references, modifier.attributeCode)}
                </select>
              </label>
            ` : resolvedTarget === "skill" ? `
              <label class="field-stack">
                <span>Skill</span>
                <select data-creator-modifier-input="skillCode" data-modifier-index="${index}">
                  ${buildSkillCodeOptions(references, modifier.skillCode)}
                </select>
              </label>
            ` : resolvedTarget === "custom" ? `
              <label class="field-stack">
                <span>Custom Target</span>
                <input data-creator-modifier-input="customTarget" data-modifier-index="${index}" type="text" value="${escapeHtml(modifier.customTarget)}" placeholder="custom_target">
              </label>
            ` : `
              <div class="creator-auto-meta creator-small-meta">
                <div><strong>Resolved Target:</strong> ${escapeHtml(resolvedTarget)}</div>
              </div>
            `}
            <label class="field-stack">
              <span>Value</span>
              <input data-creator-modifier-input="value" data-modifier-index="${index}" type="number" value="${escapeHtml(modifier.value)}">
            </label>
          </div>
        </div>
      `;
  }).join("");
}
function buildFlagOptions(selectedValue) {
  return EFFECT_FLAG_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${selectedValue === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
}
function buildFlagEditorMarkup(draft) {
  const flags = Array.isArray(draft.flags) ? draft.flags : [];
  if (!flags.length) {
    return `<div class="creator-empty">No flags yet. Add one if this effect should set a combat or control state.</div>`;
  }
  return flags.map((flag, index) => {
    const resolvedKey = String(flag.key ?? "helpless");
    return `
        <div class="creator-link-card" data-creator-flag-row="${index}">
          <div class="creator-link-head">
            <strong>Flag ${index + 1}</strong>
            <button type="button" class="secondary" data-creator-flag-remove="${index}">Remove</button>
          </div>
          <div class="field-grid creator-grid-3">
            <label class="field-stack">
              <span>Flag</span>
              <select data-creator-flag-input="key" data-flag-index="${index}">
                ${buildFlagOptions(resolvedKey)}
              </select>
            </label>
            ${resolvedKey === "custom" ? `
              <label class="field-stack">
                <span>Custom Key</span>
                <input data-creator-flag-input="customKey" data-flag-index="${index}" type="text" value="${escapeHtml(flag.customKey)}" placeholder="custom_flag">
              </label>
            ` : `
              <div class="creator-auto-meta creator-small-meta">
                <div><strong>Resolved Key:</strong> ${escapeHtml(resolvedKey)}</div>
              </div>
            `}
            <label class="field-stack">
              <span>Enabled</span>
              <input data-creator-flag-input="enabled" data-flag-index="${index}" type="checkbox"${flag.enabled ? " checked" : ""}>
            </label>
          </div>
        </div>
      `;
  }).join("");
}
function buildWeaponProfileEditorMarkup(state, references, profile, index) {
  const attackType = String(profile.attackType ?? "ranged").trim() === "melee" ? "melee" : "ranged";
  const isRanged = attackType === "ranged";
  const defaultChecked = Boolean(profile.isDefault);
  return `
    <div class="creator-link-card" data-creator-weapon-profile-row="${index}">
      <div class="creator-link-head">
        <strong>Profile ${index + 1}</strong>
        <div class="creator-inline-compact">
          <label class="toggle-inline creator-toggle-card">
            <input type="radio" name="creator-weapon-default-profile" data-creator-weapon-profile-input="isDefault" data-weapon-profile-index="${index}"${defaultChecked ? " checked" : ""}>
            <span>Default</span>
          </label>
          <button type="button" class="secondary" data-creator-weapon-profile-remove="${index}"${state.drafts.weapons.profiles.length > 1 ? "" : " disabled"}>Remove</button>
        </div>
      </div>
      <div class="field-grid creator-grid-3">
        <label class="field-stack">
          <span>Name</span>
          <input data-creator-weapon-profile-input="name" data-weapon-profile-index="${index}" type="text" value="${escapeHtml(profile.name)}" placeholder="${attackType === "melee" ? "Bayonet Strike" : "Rifle Shot"}">
        </label>
        <label class="field-stack">
          <span>Attack Type</span>
          <select data-creator-weapon-profile-input="attackType" data-weapon-profile-index="${index}">
            <option value="ranged"${attackType === "ranged" ? " selected" : ""}>Ranged</option>
            <option value="melee"${attackType === "melee" ? " selected" : ""}>Melee</option>
          </select>
        </label>
        <label class="field-stack">
          <span>Combat Skill</span>
          <select data-creator-weapon-profile-input="linkedSkillId" data-weapon-profile-index="${index}">
            ${buildSkillIdOptions(references, profile.linkedSkillId, { categories: ["combat"] })}
          </select>
        </label>
      </div>
      <div class="field-grid creator-grid-3">
        <label class="field-stack">
          <span>Weapon Class</span>
          <select data-creator-weapon-profile-input="weaponClassId" data-weapon-profile-index="${index}">
            ${buildWeaponClassOptions(references, profile.weaponClassId, { attackType })}
          </select>
        </label>
        <label class="field-stack">
          <span>${isRanged ? "Accuracy Bonus" : "Attack Bonus"}</span>
          <input data-creator-weapon-profile-input="accuracyModifier" data-weapon-profile-index="${index}" type="number" value="${escapeHtml(profile.accuracyModifier)}">
        </label>
        <label class="field-stack">
          <span>Armor Pierce</span>
          <input data-creator-weapon-profile-input="armorPierce" data-weapon-profile-index="${index}" type="number" value="${escapeHtml(profile.armorPierce)}">
        </label>
      </div>
      ${isRanged ? `
        <div class="field-grid creator-grid-3">
          <label class="field-stack">
            <span>Caliber</span>
            <select data-creator-weapon-profile-input="caliberId" data-weapon-profile-index="${index}">
              ${buildCaliberOptions(references, profile.caliberId)}
            </select>
          </label>
          <label class="field-stack">
            <span>Range Profile</span>
            <select data-creator-weapon-profile-input="rangeProfileId" data-weapon-profile-index="${index}">
              ${buildRangeProfileOptions(references, profile.rangeProfileId, { attackType })}
            </select>
          </label>
          <label class="toggle-inline creator-toggle-card">
            <input data-creator-weapon-profile-input="twoHanded" data-weapon-profile-index="${index}" type="checkbox"${profile.twoHanded ? " checked" : ""}>
            <span>Two-handed</span>
          </label>
        </div>
        <div class="creator-links-block">
          <div class="creator-links-head">
            <span>Fire Modes</span>
          </div>
          <div class="creator-check-grid">
            ${buildWeaponFireModeCheckboxMarkup(references, profile, index)}
          </div>
        </div>
        <div class="creator-links-block">
          <div class="creator-links-head">
            <span>Compatible Magazines</span>
          </div>
          <div class="creator-check-grid">
            ${buildWeaponMagazineCheckboxMarkup(references, profile, index)}
          </div>
        </div>
      ` : `
        <div class="field-grid creator-grid-3">
          <label class="field-stack">
            <span>Base Melee Damage</span>
            <input data-creator-weapon-profile-input="baseMeleeDamage" data-weapon-profile-index="${index}" type="number" min="0" value="${escapeHtml(profile.baseMeleeDamage)}">
          </label>
          <label class="toggle-inline creator-toggle-card">
            <input data-creator-weapon-profile-input="canParry" data-weapon-profile-index="${index}" type="checkbox"${profile.canParry ? " checked" : ""}>
            <span>Can parry</span>
          </label>
          <label class="toggle-inline creator-toggle-card">
            <input data-creator-weapon-profile-input="twoHanded" data-weapon-profile-index="${index}" type="checkbox"${profile.twoHanded ? " checked" : ""}>
            <span>Two-handed</span>
          </label>
        </div>
        <div class="creator-auto-meta creator-small-meta">
          <div><strong>Range profile:</strong> melee profile (auto)</div>
          <div><strong>Fire mode:</strong> melee_strike (auto)</div>
        </div>
      `}
    </div>
  `;
}
function buildWeaponEditorMarkup(state, references) {
  const draft = state.drafts.weapons;
  const auto = generatedWeaponPreview(draft, state);
  const payloadPreview = prettyJson(buildWeaponPayload(draft, auto, references));
  return `
    <div class="creator-editor-head">
      <div>
        <div class="creator-editor-title">${escapeHtml(draft.name || "New Weapon Draft")}</div>
        <div class="muted">${draft.id ? "Editing saved definition." : "Draft is local until Save."}</div>
      </div>
      <div class="creator-pill${state.dirty.weapons ? " dirty" : ""}" data-creator-dirty-pill="weapons">${state.dirty.weapons ? "Unsaved" : "Saved / clean"}</div>
    </div>
    <div class="button-row">
      <button type="button" data-creator-action="newDraft">Create New</button>
      <button type="button" class="secondary" data-creator-action="duplicateDraft">Duplicate</button>
      <button type="button" data-creator-action="saveDraft">Save</button>
      <button type="button" class="secondary" data-creator-action="reloadSelected"${draft.id ? "" : " disabled"}>Reload</button>
      <button type="button" class="secondary" data-creator-action="deleteSelected"${draft.id ? "" : " disabled"}>Delete</button>
    </div>
    <form class="creator-form" data-creator-form="weapons">
      <label class="field-stack">
        <span>Name</span>
        <input data-creator-input="name" type="text" value="${escapeHtml(draft.name)}" placeholder="Frontier Rifle">
      </label>
      <div class="field-grid creator-grid-2">
        <label class="field-stack">
          <span>Description</span>
          <textarea data-creator-input="description" rows="4" placeholder="Short GM-facing description">${escapeHtml(draft.description)}</textarea>
        </label>
        <div class="creator-auto-meta">
          <div><strong>Auto code:</strong> ${escapeHtml(auto.code)}</div>
          <div><strong>Auto sort:</strong> ${escapeHtml(String(auto.sortOrder))}</div>
          <div><strong>Auto tags:</strong> ${escapeHtml(auto.tags.join(", "))}</div>
        </div>
      </div>
      <div class="creator-links-block">
        <div class="creator-links-head">
          <span>Profiles</span>
          <button type="button" data-creator-action="addWeaponProfile">Add Profile</button>
        </div>
        ${(Array.isArray(draft.profiles) ? draft.profiles : []).map((profile, index) => buildWeaponProfileEditorMarkup(state, references, profile, index)).join("")}
      </div>
      ${buildDisclosureSection({
    title: "Payload Preview",
    collapsed: Boolean(state.collapsed.weaponsPayload),
    action: "toggleWeaponsPayload",
    bodyMarkup: `
          <label class="field-stack">
            <textarea rows="20" readonly>${escapeHtml(payloadPreview)}</textarea>
          </label>
        `
  })}
    </form>
  `;
}
function buildItemEditorMarkup(state, references) {
  const draft = state.drafts.items;
  const auto = generatedItemPreview(draft, state);
  const payloadPreview = prettyJson(buildItemPayload(draft, auto));
  return `
    <div class="creator-editor-head">
      <div>
        <div class="creator-editor-title">${escapeHtml(draft.name || "New Item Draft")}</div>
        <div class="muted">${draft.id ? "Editing saved definition." : "Draft is local until Save."}</div>
      </div>
      <div class="creator-pill${state.dirty.items ? " dirty" : ""}" data-creator-dirty-pill="items">${state.dirty.items ? "Unsaved" : "Saved / clean"}</div>
    </div>
    <div class="button-row">
      <button type="button" data-creator-action="newDraft">Create New</button>
      <button type="button" class="secondary" data-creator-action="duplicateDraft">Duplicate</button>
      <button type="button" data-creator-action="saveDraft">Save</button>
      <button type="button" class="secondary" data-creator-action="reloadSelected"${draft.id ? "" : " disabled"}>Reload</button>
      <button type="button" class="secondary" data-creator-action="deleteSelected"${draft.id ? "" : " disabled"}>Delete</button>
    </div>
    <form class="creator-form" data-creator-form="items">
      <label class="field-stack">
        <span>Name</span>
        <input data-creator-input="name" type="text" value="${escapeHtml(draft.name)}" placeholder="Field Medkit">
      </label>
      <div class="field-grid creator-grid-3">
        <label class="field-stack">
          <span>Item Type</span>
          <select data-creator-input="itemType">${buildItemTypeOptions(draft.itemType)}</select>
        </label>
        <label class="field-stack">
          <span>Use Action</span>
          <select data-creator-input="useActionType">${buildItemUseActionOptions(draft.useActionType)}</select>
        </label>
        <label class="toggle-inline creator-toggle-card">
          <input data-creator-input="isStackable" type="checkbox"${draft.isStackable ? " checked" : ""}>
          <span>Stackable</span>
        </label>
      </div>
      <div class="field-grid creator-grid-4">
        <label class="field-stack">
          <span>Default Quantity</span>
          <input data-creator-input="defaultQuantity" type="number" min="0" value="${escapeHtml(draft.defaultQuantity)}">
        </label>
        <label class="field-stack">
          <span>Max Stack</span>
          <input data-creator-input="maxStack" type="number" min="1" value="${escapeHtml(draft.maxStack)}"${draft.isStackable ? "" : " disabled"} placeholder="blank = none">
        </label>
        <label class="field-stack">
          <span>Default Max Charges</span>
          <input data-creator-input="defaultMaxCharges" type="number" min="0" value="${escapeHtml(draft.defaultMaxCharges)}" placeholder="blank = none">
        </label>
        <label class="field-stack">
          <span>Default Current Charges</span>
          <input data-creator-input="defaultCurrentCharges" type="number" min="0" value="${escapeHtml(draft.defaultCurrentCharges)}" placeholder="blank = none">
        </label>
      </div>
      <div class="field-grid creator-grid-2">
        <label class="field-stack">
          <span>Description</span>
          <textarea data-creator-input="description" rows="4" placeholder="Short GM-facing description">${escapeHtml(draft.description)}</textarea>
        </label>
        <div class="creator-auto-meta">
          <div><strong>Auto code:</strong> ${escapeHtml(auto.code)}</div>
          <div><strong>Auto sort:</strong> ${escapeHtml(String(auto.sortOrder))}</div>
          <div><strong>Auto tags:</strong> ${escapeHtml(auto.tags.join(", "))}</div>
        </div>
      </div>
      <div class="creator-links-block">
        <div class="creator-links-head">
          <span>Ability Links</span>
          <button type="button" data-creator-action="addItemAbilityLink">Add Ability Link</button>
        </div>
        ${buildAbilityLinksEditorMarkup(draft, references)}
      </div>
      ${buildDisclosureSection({
    title: "Payload Preview",
    collapsed: Boolean(state.collapsed.itemsPayload),
    action: "toggleItemsPayload",
    bodyMarkup: `
          <label class="field-stack">
            <textarea rows="16" readonly>${escapeHtml(payloadPreview)}</textarea>
          </label>
        `
  })}
    </form>
  `;
}
function buildCaliberEditorMarkup(state) {
  const draft = state.drafts.calibers;
  const auto = generatedCaliberPreview(draft, state);
  return `
    <div class="creator-editor-head">
      <div>
        <div class="creator-editor-title">${escapeHtml(draft.name || "New Caliber Draft")}</div>
        <div class="muted">${draft.id ? "Editing saved definition." : "Draft is local until Save."}</div>
      </div>
      <div class="creator-pill${state.dirty.calibers ? " dirty" : ""}" data-creator-dirty-pill="calibers">${state.dirty.calibers ? "Unsaved" : "Saved / clean"}</div>
    </div>
    <div class="button-row">
      <button type="button" data-creator-action="newDraft">Create New</button>
      <button type="button" class="secondary" data-creator-action="duplicateDraft">Duplicate</button>
      <button type="button" data-creator-action="saveDraft">Save</button>
      <button type="button" class="secondary" data-creator-action="reloadSelected"${draft.id ? "" : " disabled"}>Reload</button>
      <button type="button" class="secondary" data-creator-action="deleteSelected"${draft.id ? "" : " disabled"}>Delete</button>
    </div>
    <form class="creator-form" data-creator-form="calibers">
      <label class="field-stack">
        <span>Name</span>
        <input data-creator-input="name" type="text" value="${escapeHtml(draft.name)}" placeholder="Small Caliber">
      </label>
      <div class="field-grid creator-grid-2">
        <label class="field-stack">
          <span>Base Damage Per Round</span>
          <input data-creator-input="baseDamagePerRound" type="number" min="0" value="${escapeHtml(draft.baseDamagePerRound)}">
        </label>
        <div class="creator-auto-meta">
          <div><strong>Auto code:</strong> ${escapeHtml(auto.code)}</div>
          <div><strong>Auto sort:</strong> ${escapeHtml(String(auto.sortOrder))}</div>
          <div><strong>Auto tags:</strong> ${escapeHtml(auto.tags.join(", "))}</div>
        </div>
      </div>
      <label class="field-stack">
        <span>Description</span>
        <textarea data-creator-input="description" rows="4" placeholder="Short GM-facing description">${escapeHtml(draft.description)}</textarea>
      </label>
      ${buildDisclosureSection({
    title: "Payload Preview",
    collapsed: Boolean(state.collapsed.calibersPayload),
    action: "toggleCalibersPayload",
    bodyMarkup: `
          <label class="field-stack">
            <textarea rows="10" readonly>${escapeHtml(prettyJson(buildCaliberPayload(draft, auto)))}</textarea>
          </label>
        `
  })}
    </form>
  `;
}
function buildAmmoEditorMarkup(state, references) {
  const draft = state.drafts.ammo;
  const auto = generatedAmmoPreview(draft, state, references);
  return `
    <div class="creator-editor-head">
      <div>
        <div class="creator-editor-title">${escapeHtml(draft.name || "New Ammo Draft")}</div>
        <div class="muted">${draft.id ? "Editing saved definition." : "Draft is local until Save."}</div>
      </div>
      <div class="creator-pill${state.dirty.ammo ? " dirty" : ""}" data-creator-dirty-pill="ammo">${state.dirty.ammo ? "Unsaved" : "Saved / clean"}</div>
    </div>
    <div class="button-row">
      <button type="button" data-creator-action="newDraft">Create New</button>
      <button type="button" class="secondary" data-creator-action="duplicateDraft">Duplicate</button>
      <button type="button" data-creator-action="saveDraft">Save</button>
      <button type="button" class="secondary" data-creator-action="reloadSelected"${draft.id ? "" : " disabled"}>Reload</button>
      <button type="button" class="secondary" data-creator-action="deleteSelected"${draft.id ? "" : " disabled"}>Delete</button>
    </div>
    <form class="creator-form" data-creator-form="ammo">
      <label class="field-stack">
        <span>Name</span>
        <input data-creator-input="name" type="text" value="${escapeHtml(draft.name)}" placeholder="Standard Small Caliber Ammo">
      </label>
      <div class="field-grid creator-grid-2">
        <label class="field-stack">
          <span>Caliber</span>
          <select data-creator-input="caliberId">${buildCaliberOptions(references, draft.caliberId)}</select>
        </label>
        <div class="creator-auto-meta">
          <div><strong>Auto code:</strong> ${escapeHtml(auto.code)}</div>
          <div><strong>Auto sort:</strong> ${escapeHtml(String(auto.sortOrder))}</div>
          <div><strong>Auto tags:</strong> ${escapeHtml(auto.tags.join(", "))}</div>
        </div>
      </div>
      <div class="field-grid creator-grid-3">
        <label class="field-stack">
          <span>Damage Modifier</span>
          <input data-creator-input="damageModifier" type="number" value="${escapeHtml(draft.damageModifier)}">
        </label>
        <label class="field-stack">
          <span>Accuracy Modifier</span>
          <input data-creator-input="accuracyModifier" type="number" value="${escapeHtml(draft.accuracyModifier)}">
        </label>
        <label class="field-stack">
          <span>Armor Pierce Modifier</span>
          <input data-creator-input="armorPierce" type="number" value="${escapeHtml(draft.armorPierce)}">
        </label>
      </div>
      <label class="field-stack">
        <span>Description</span>
        <textarea data-creator-input="description" rows="4" placeholder="Short GM-facing description">${escapeHtml(draft.description)}</textarea>
      </label>
      ${buildDisclosureSection({
    title: "Payload Preview",
    collapsed: Boolean(state.collapsed.ammoPayload),
    action: "toggleAmmoPayload",
    bodyMarkup: `
          <label class="field-stack">
            <textarea rows="12" readonly>${escapeHtml(prettyJson(buildAmmoPayload(draft, auto)))}</textarea>
          </label>
        `
  })}
    </form>
  `;
}
function buildMagazineEditorMarkup(state, references) {
  const draft = state.drafts.magazines;
  const auto = generatedMagazinePreview(draft, state, references);
  return `
    <div class="creator-editor-head">
      <div>
        <div class="creator-editor-title">${escapeHtml(draft.name || "New Magazine Draft")}</div>
        <div class="muted">${draft.id ? "Editing saved definition." : "Draft is local until Save."}</div>
      </div>
      <div class="creator-pill${state.dirty.magazines ? " dirty" : ""}" data-creator-dirty-pill="magazines">${state.dirty.magazines ? "Unsaved" : "Saved / clean"}</div>
    </div>
    <div class="button-row">
      <button type="button" data-creator-action="newDraft">Create New</button>
      <button type="button" class="secondary" data-creator-action="duplicateDraft">Duplicate</button>
      <button type="button" data-creator-action="saveDraft">Save</button>
      <button type="button" class="secondary" data-creator-action="reloadSelected"${draft.id ? "" : " disabled"}>Reload</button>
      <button type="button" class="secondary" data-creator-action="deleteSelected"${draft.id ? "" : " disabled"}>Delete</button>
    </div>
    <form class="creator-form" data-creator-form="magazines">
      <label class="field-stack">
        <span>Name</span>
        <input data-creator-input="name" type="text" value="${escapeHtml(draft.name)}" placeholder="Frontier Pistol Magazine">
      </label>
      <div class="field-grid creator-grid-2">
        <label class="field-stack">
          <span>Caliber</span>
          <select data-creator-input="caliberId">${buildCaliberOptions(references, draft.caliberId)}</select>
        </label>
        <div class="creator-auto-meta">
          <div><strong>Auto code:</strong> ${escapeHtml(auto.code)}</div>
          <div><strong>Auto sort:</strong> ${escapeHtml(String(auto.sortOrder))}</div>
          <div><strong>Auto tags:</strong> ${escapeHtml(auto.tags.join(", "))}</div>
        </div>
      </div>
      <div class="field-grid creator-grid-2">
        <label class="field-stack">
          <span>Capacity</span>
          <input data-creator-input="capacity" type="number" min="1" value="${escapeHtml(draft.capacity)}">
        </label>
        <div class="creator-auto-meta creator-small-meta">
          <div><strong>Runtime rule:</strong> one magazine holds one ammo type at a time.</div>
          <div><strong>Partial load:</strong> allowed by default.</div>
        </div>
      </div>
      <label class="field-stack">
        <span>Description</span>
        <textarea data-creator-input="description" rows="4" placeholder="Short GM-facing description">${escapeHtml(draft.description)}</textarea>
      </label>
      ${buildDisclosureSection({
    title: "Payload Preview",
    collapsed: Boolean(state.collapsed.magazinesPayload),
    action: "toggleMagazinesPayload",
    bodyMarkup: `
          <label class="field-stack">
            <textarea rows="10" readonly>${escapeHtml(prettyJson(buildMagazinePayload(draft, auto)))}</textarea>
          </label>
        `
  })}
    </form>
  `;
}
function buildSkillEditorMarkup(state, references) {
  const draft = state.drafts.skills;
  const auto = generatedSkillPreview(draft, references, state);
  const groupOptions = SKILL_UI_GROUP_OPTIONS.map((group) => `<option value="${escapeHtml(group.value)}"${draft.skillGroup === group.value ? " selected" : ""}>${escapeHtml(group.label)}</option>`).join("");
  const subcategoryOptions = SKILL_UI_GROUPS[draft.skillGroup]?.subcategories ?? SKILL_UI_GROUPS.combat.subcategories;
  const subcategoryMarkup = subcategoryOptions.map((subcategory) => `<option value="${escapeHtml(subcategory.value)}"${draft.skillSubcategory === subcategory.value ? " selected" : ""}>${escapeHtml(`${subcategory.label} | max ${subcategory.maxLevel}`)}</option>`).join("");
  return `
    <div class="creator-editor-head">
      <div>
        <div class="creator-editor-title">${escapeHtml(draft.name || "New Skill Draft")}</div>
        <div class="muted">${draft.id ? "Editing saved definition." : "Draft is local until Save."}</div>
      </div>
      <div class="creator-pill${state.dirty.skills ? " dirty" : ""}" data-creator-dirty-pill="skills">${state.dirty.skills ? "Unsaved" : "Saved / clean"}</div>
    </div>
    <div class="button-row">
      <button type="button" data-creator-action="newDraft">Create New</button>
      <button type="button" class="secondary" data-creator-action="duplicateDraft">Duplicate</button>
      <button type="button" data-creator-action="saveDraft">Save</button>
      <button type="button" class="secondary" data-creator-action="reloadSelected"${draft.id ? "" : " disabled"}>Reload</button>
      <button type="button" class="secondary" data-creator-action="deleteSelected"${draft.id ? "" : " disabled"}>Delete</button>
    </div>
    <form class="creator-form" data-creator-form="skills">
      <label class="field-stack">
        <span>Name</span>
        <input data-creator-input="name" type="text" value="${escapeHtml(draft.name)}" placeholder="Frontier Melee">
      </label>
      <div class="field-grid creator-grid-4">
        <label class="field-stack">
          <span>Group</span>
          <select data-creator-input="skillGroup">${groupOptions}</select>
        </label>
        <label class="field-stack">
          <span>Subcategory</span>
          <select data-creator-input="skillSubcategory">${subcategoryMarkup}</select>
        </label>
        <label class="field-stack">
          <span>Main Attribute</span>
          <select data-creator-input="mainAttributeId">${buildAttributeOptions(references, draft.mainAttributeId)}</select>
        </label>
        <label class="field-stack">
          <span>Secondary Attribute</span>
          <select data-creator-input="secondaryAttributeId">${buildAttributeOptions(references, draft.secondaryAttributeId)}</select>
        </label>
      </div>
      <label class="field-stack">
        <span>Description</span>
        <textarea data-creator-input="description" rows="4" placeholder="Short GM-facing description">${escapeHtml(draft.description)}</textarea>
      </label>
      ${buildDisclosureSection({
    title: "Payload Preview",
    collapsed: Boolean(state.collapsed.skillsPayload),
    action: "toggleSkillsPayload",
    bodyMarkup: `
          <label class="field-stack">
            <textarea rows="10" readonly>${escapeHtml(prettyJson(buildSkillPayload(draft, auto)))}</textarea>
          </label>
        `
  })}
    </form>
  `;
}
function buildEffectEditorMarkup(state, references) {
  const draft = state.drafts.effects;
  const auto = generatedEffectPreview(draft, state);
  const categoryOptions = EFFECT_UI_CATEGORY_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${draft.uiCategory === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  const effectTypeOptions = EFFECT_TYPE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${draft.effectType === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  const durationOptions = EFFECT_DURATION_TYPE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${draft.defaultDurationType === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  const stackingOptions = EFFECT_STACKING_MODE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${draft.stackingMode === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  const targetScopeOptions = EFFECT_TARGET_SCOPE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${draft.targetScope === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  const metricOptions = getEffectMetricOptions(draft.effectType).map((option) => `<option value="${escapeHtml(option.value)}"${draft.amountMetric === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  const tickPhaseOptions = EFFECT_TICK_PHASE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${draft.tickPhase === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  const behaviorCollapsed = Boolean(state.collapsed.effectsBehavior);
  const payloadCollapsed = Boolean(state.collapsed.effectsPayload);
  return `
    <div class="creator-editor-head">
      <div>
        <div class="creator-editor-title">${escapeHtml(draft.name || "New Effect Draft")}</div>
        <div class="muted">${draft.id ? "Editing saved definition." : "Draft is local until Save."}</div>
      </div>
      <div class="creator-pill${state.dirty.effects ? " dirty" : ""}" data-creator-dirty-pill="effects">${state.dirty.effects ? "Unsaved" : "Saved / clean"}</div>
    </div>
    <div class="button-row">
      <button type="button" data-creator-action="newDraft">Create New</button>
      <button type="button" class="secondary" data-creator-action="duplicateDraft">Duplicate</button>
      <button type="button" data-creator-action="saveDraft">Save</button>
      <button type="button" class="secondary" data-creator-action="reloadSelected"${draft.id ? "" : " disabled"}>Reload</button>
      <button type="button" class="secondary" data-creator-action="deleteSelected"${draft.id ? "" : " disabled"}>Delete</button>
    </div>
    <form class="creator-form" data-creator-form="effects">
      <label class="field-stack">
        <span>Name</span>
        <input data-creator-input="name" type="text" value="${escapeHtml(draft.name)}" placeholder="Hemostatic Surge">
      </label>
      <div class="field-grid creator-grid-4">
        <label class="field-stack">
          <span>Category</span>
          <select data-creator-input="uiCategory">${categoryOptions}</select>
        </label>
        <label class="field-stack">
          <span>Effect Type</span>
          <select data-creator-input="effectType">${effectTypeOptions}</select>
        </label>
        <label class="field-stack">
          <span>Duration</span>
          <select data-creator-input="defaultDurationType">${durationOptions}</select>
        </label>
        <label class="field-stack">
          <span>Stacking Mode</span>
          <select data-creator-input="stackingMode">${stackingOptions}</select>
        </label>
      </div>
      <div class="field-grid creator-grid-1">
        <label class="field-stack">
          <span>Default Rounds</span>
          <input data-creator-input="defaultRounds" type="number" min="0" value="${escapeHtml(draft.defaultRounds)}"${draft.defaultDurationType === "rounds" ? "" : " disabled"}>
        </label>
      </div>
      <label class="field-stack">
        <span>Description</span>
        <textarea data-creator-input="description" rows="4" placeholder="Short GM-facing description">${escapeHtml(draft.description)}</textarea>
      </label>
      ${buildDisclosureSection({
    title: "Behavior",
    collapsed: behaviorCollapsed,
    action: "toggleEffectsBehavior",
    actionsMarkup: `
          <div class="button-row compact">
            <button type="button" class="secondary" data-creator-action="addModifier">Add Modifier</button>
            <button type="button" class="secondary" data-creator-action="addFlag">Add Flag</button>
          </div>
        `,
    bodyMarkup: `
          <div class="field-grid creator-grid-2">
            <label class="field-stack">
              <span>Target Scope</span>
              <select data-creator-input="targetScope">${targetScopeOptions}</select>
            </label>
            ${effectTypeUsesTickPhase(draft.effectType) ? `
              <label class="field-stack">
                <span>Tick Phase</span>
                <select data-creator-input="tickPhase">${tickPhaseOptions}</select>
              </label>
            ` : `
              <div class="creator-auto-meta creator-small-meta">
                <div><strong>Tick Phase:</strong> not used by this effect type.</div>
              </div>
            `}
          </div>
          ${effectTypeUsesScale(draft.effectType) ? `
            <div class="field-grid creator-grid-4">
              <label class="field-stack">
                <span>Base</span>
                <input data-creator-input="scaleBase" type="number" value="${escapeHtml(draft.scaleBase)}">
              </label>
              <label class="field-stack">
                <span>Per Level</span>
                <input data-creator-input="scalePerLevel" type="number" value="${escapeHtml(draft.scalePerLevel)}">
              </label>
              <label class="field-stack">
                <span>Metric</span>
                <select data-creator-input="amountMetric">${metricOptions}</select>
              </label>
              ${effectTypeUsesResourcePool(draft.effectType) ? `
                <label class="field-stack">
                  <span>Resource Pool</span>
                  <select data-creator-input="resourcePoolId">${buildResourcePoolOptions(references, draft.resourcePoolId)}</select>
                </label>
              ` : effectTypeUsesRestoreDisabled(draft.effectType) ? `
                <label class="field-stack">
                  <span>Restore Disabled</span>
                  <input data-creator-input="restoreDisabled" type="checkbox"${draft.restoreDisabled ? " checked" : ""}>
                </label>
              ` : `
                <div class="creator-auto-meta creator-small-meta">
                  <div><strong>Scale:</strong> base + per_level</div>
                </div>
              `}
            </div>
          ` : `
            <div class="creator-auto-meta creator-small-meta">
              <div><strong>Scale:</strong> not used by this effect type.</div>
            </div>
          `}
          <div class="field-grid creator-grid-2">
            <div>
              <strong>Modifiers</strong>
              ${buildModifierEditorMarkup(draft, references)}
            </div>
            <div>
              <strong>Flags</strong>
              ${buildFlagEditorMarkup(draft)}
            </div>
          </div>
        `
  })}
      ${buildDisclosureSection({
    title: "Payload Preview",
    collapsed: payloadCollapsed,
    action: "toggleEffectsPayload",
    bodyMarkup: `
          <label class="field-stack">
            <textarea rows="14" readonly>${escapeHtml(prettyJson(buildEffectPayload(draft, auto)))}</textarea>
          </label>
        `
  })}
    </form>
  `;
}
function buildAbilityEffectLinksEditorMarkup(draft, references) {
  const links = Array.isArray(draft.effectLinks) ? draft.effectLinks : [];
  const selectedIds = links.map((entry) => entry.effectDefId).filter(Boolean);
  if (!links.length) {
    return `<div class="creator-empty">No effect links yet. Add one if this ability should apply saved effect templates.</div>`;
  }
  return links.map((link, index) => `
      <div class="creator-link-card" data-creator-ability-effect-row="${index}">
        <div class="creator-link-head">
          <strong>Effect Link ${index + 1}</strong>
          <button type="button" class="secondary" data-creator-ability-effect-remove="${index}">Remove</button>
        </div>
        <label class="field-stack">
          <span>Effect Template</span>
          <select data-creator-ability-effect-input="effectDefId" data-ability-effect-index="${index}">
            ${buildEffectOptions(references, link.effectDefId, selectedIds)}
          </select>
        </label>
        <div class="creator-auto-meta creator-small-meta">
          <div><strong>Summary:</strong> ${escapeHtml(buildEffectReferenceSummary(findEffectReferenceById(references, link.effectDefId)))}</div>
        </div>
      </div>
    `).join("");
}
function buildAbilitySingleLevelFields(level, index, {
  isTechnical = false,
  showResourceCost = true,
  showDuration = true,
  showAttackFields = false,
  showSpecialFields = false
} = {}) {
  return `
    <div class="field-grid creator-grid-4">
      ${!isTechnical ? `
        <label class="field-stack">
          <span>Level</span>
          <input data-creator-ability-level-input="abilityLevel" data-ability-level-index="${index}" type="number" min="1" max="5" value="${escapeHtml(level.abilityLevel)}">
        </label>
      ` : `
        <div class="creator-auto-meta creator-small-meta">
          <div><strong>Level:</strong> internal Level 1 only</div>
        </div>
      `}
      ${showResourceCost ? `
        <label class="field-stack">
          <span>Resource Cost</span>
          <input data-creator-ability-level-input="resourceCost" data-ability-level-index="${index}" type="number" min="0" value="${escapeHtml(level.resourceCost)}">
        </label>
      ` : ""}
      ${showDuration ? `
        <label class="field-stack">
          <span>Duration</span>
          <input data-creator-ability-level-input="durationRounds" data-ability-level-index="${index}" type="number" min="0" value="${escapeHtml(level.durationRounds)}" placeholder="blank = none">
        </label>
      ` : ""}
    </div>
    ${showAttackFields ? `
      <div class="field-grid creator-grid-3">
        <label class="field-stack">
          <span>Attack Accuracy</span>
          <input data-creator-ability-level-input="attackAccuracyBonus" data-ability-level-index="${index}" type="number" value="${escapeHtml(level.attackAccuracyBonus)}">
        </label>
        <label class="field-stack">
          <span>Attack Damage</span>
          <input data-creator-ability-level-input="attackDamageBonus" data-ability-level-index="${index}" type="number" value="${escapeHtml(level.attackDamageBonus)}">
        </label>
        <label class="field-stack">
          <span>Armor Pierce</span>
          <input data-creator-ability-level-input="attackArmorPierce" data-ability-level-index="${index}" type="number" value="${escapeHtml(level.attackArmorPierce)}">
        </label>
      </div>
    ` : ""}
    ${showSpecialFields ? `
      <div class="field-grid creator-grid-2">
        <label class="field-stack">
          <span>Special Armor</span>
          <input data-creator-ability-level-input="specialArmorValue" data-ability-level-index="${index}" type="number" min="0" value="${escapeHtml(level.specialArmorValue)}" placeholder="blank = none">
        </label>
        <label class="field-stack">
          <span>Special Max Critical</span>
          <input data-creator-ability-level-input="specialMaxCritical" data-ability-level-index="${index}" type="number" min="0" value="${escapeHtml(level.specialMaxCritical)}" placeholder="blank = none">
        </label>
      </div>
    ` : ""}
  `;
}
function buildAbilityLevelsEditorMarkup(draft) {
  const normalizedDraft = normalizeAbilityEditorDraft(draft);
  const levels = Array.isArray(normalizedDraft.levels) ? normalizedDraft.levels : [createEmptyAbilityLevelDraft(1)];
  const isTechnical = abilityIsTechnical(normalizedDraft.sourceLabel);
  const showSpecialFields = abilityUsesSpecialFields(normalizedDraft.resolutionMode);
  const showAttackFields = abilityUsesAttackFields(normalizedDraft.uiKind, normalizedDraft.resolutionMode) && !showSpecialFields;
  const showResourceCost = !isTechnical;
  const showDuration = !isTechnical && !showSpecialFields;
  if (isTechnical) {
    const level = levels[0] ?? createEmptyAbilityLevelDraft(1);
    return `
      <div class="creator-link-card" data-creator-ability-level-row="0">
        <div class="creator-link-head">
          <strong>Technical Settings</strong>
        </div>
        ${buildAbilitySingleLevelFields(level, 0, { isTechnical: true, showResourceCost, showDuration, showAttackFields, showSpecialFields })}
      </div>
    `;
  }
  return levels.map((level, index) => `
      <div class="creator-link-card" data-creator-ability-level-row="${index}">
        <div class="creator-link-head">
          <strong>Level ${escapeHtml(level.abilityLevel || String(index + 1))}</strong>
          <button type="button" class="secondary" data-creator-ability-level-remove="${index}"${levels.length > 1 ? "" : " disabled"}>Remove</button>
        </div>
        ${buildAbilitySingleLevelFields(level, index, { showResourceCost, showDuration, showAttackFields, showSpecialFields })}
      </div>
    `).join("");
}
function buildAbilityEditorMarkup(state, references) {
  const draft = normalizeAbilityEditorDraft(state.drafts.abilities);
  const auto = generatedAbilityPreview(draft, state);
  const kindOptions = ABILITY_UI_KIND_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${draft.uiKind === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  const sourceOptions = ABILITY_SOURCE_LABEL_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${draft.sourceLabel === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  const allowedTargetTypes = getAllowedTargetTypesForAbility(draft.uiKind, draft.resolutionMode);
  const targetOptions = ABILITY_TARGET_OPTIONS.filter((option) => allowedTargetTypes.includes(option.value)).map((option) => `<option value="${escapeHtml(option.value)}"${draft.targetType === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  const attackTypeOptions = ABILITY_ATTACK_TYPE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${draft.attackType === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  const rangeModeOptions = ABILITY_RANGE_MODE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${draft.rangeMode === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  const payloadCollapsed = Boolean(state.collapsed.abilitiesPayload);
  const levelsCollapsed = Boolean(state.collapsed.abilitiesLevels);
  const showSpecialFields = abilityUsesSpecialFields(draft.resolutionMode);
  const showAttackFields = abilityUsesAttackFields(draft.uiKind, draft.resolutionMode) && !showSpecialFields;
  const showEffectLinks = abilityUsesEffectLinks(draft.resolutionMode);
  const hideRangeForMelee = showAttackFields && String(draft.attackType ?? "").trim() === "melee";
  const summaryItems = getAbilityPayloadSummary(draft);
  return `
    <div class="creator-editor-head">
      <div>
        <div class="creator-editor-title">${escapeHtml(draft.name || "New Ability Draft")}</div>
        <div class="muted">${draft.id ? "Editing saved definition." : "Draft is local until Save."}</div>
      </div>
      <div class="creator-pill${state.dirty.abilities ? " dirty" : ""}" data-creator-dirty-pill="abilities">${state.dirty.abilities ? "Unsaved" : "Saved / clean"}</div>
    </div>
    <div class="button-row">
      <button type="button" data-creator-action="newDraft">Create New</button>
      <button type="button" class="secondary" data-creator-action="duplicateDraft">Duplicate</button>
      <button type="button" data-creator-action="saveDraft">Save</button>
      <button type="button" class="secondary" data-creator-action="reloadSelected"${draft.id ? "" : " disabled"}>Reload</button>
      <button type="button" class="secondary" data-creator-action="deleteSelected"${draft.id ? "" : " disabled"}>Delete</button>
    </div>
    <form class="creator-form" data-creator-form="abilities">
      <label class="field-stack">
        <span>Name</span>
        <input data-creator-input="name" type="text" value="${escapeHtml(draft.name)}" placeholder="Etheric Lattice">
      </label>
      <div class="field-grid creator-grid-4">
        <label class="field-stack">
          <span>Category</span>
          <select data-creator-input="uiKind">${kindOptions}</select>
        </label>
        <label class="field-stack">
          <span>Source</span>
          <select data-creator-input="sourceLabel">${sourceOptions}</select>
        </label>
        <div class="field-stack">
          <span>Resolution</span>
          <div class="creator-auto-meta creator-small-meta">
            <div><strong>Auto:</strong> ${escapeHtml(getAbilityOptionLabel(ABILITY_RESOLUTION_OPTIONS, draft.resolutionMode, "Narrative / Utility"))}</div>
          </div>
        </div>
        ${allowedTargetTypes.length <= 1 ? `
          <div class="field-stack">
            <span>Target</span>
            <div class="creator-auto-meta creator-small-meta">
            <div><strong>Target:</strong> ${escapeHtml(getAbilityOptionLabel(ABILITY_TARGET_OPTIONS, draft.targetType, "No Target"))}</div>
            </div>
          </div>
        ` : `
          <label class="field-stack">
            <span>Target</span>
            <select data-creator-input="targetType">${targetOptions}</select>
          </label>
        `}
      </div>
      <div class="creator-auto-meta">
        ${summaryItems.map((item) => `<div><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</div>`).join("")}
      </div>
      <div class="field-grid creator-grid-3">
        ${showAttackFields ? `
          <label class="field-stack">
            <span>Attack Type</span>
            <select data-creator-input="attackType">${attackTypeOptions}</select>
          </label>
        ` : `
            <div class="creator-auto-meta creator-small-meta">
              <div><strong>Attack Type:</strong> not used by this ability.</div>
            </div>
        `}
        ${hideRangeForMelee ? `
          <div class="creator-auto-meta creator-small-meta">
            <div><strong>Range:</strong> melee uses fixed 2m.</div>
          </div>
        ` : `
          <label class="field-stack">
            <span>Range</span>
            <select data-creator-input="rangeMode">${rangeModeOptions}</select>
          </label>
        `}
        ${hideRangeForMelee ? `
          <div class="creator-auto-meta creator-small-meta">
            <div><strong>Max Distance:</strong> 2m fixed.</div>
          </div>
        ` : `
          <label class="field-stack">
            <span>Max Distance (m)</span>
            <input data-creator-input="maxDistanceM" type="number" min="0" value="${escapeHtml(draft.maxDistanceM)}"${draft.rangeMode === "limited" ? "" : " disabled"} placeholder="blank = no limit">
          </label>
        `}
      </div>
      <label class="field-stack">
        <span>Description</span>
        <textarea data-creator-input="description" rows="4" placeholder="Short GM-facing description">${escapeHtml(draft.description)}</textarea>
      </label>
      ${showEffectLinks ? `
        <div class="creator-links-block">
          <div class="creator-links-head">
            <span>Effect Links</span>
            <button type="button" data-creator-action="addAbilityEffectLink">Add Effect</button>
          </div>
          ${buildAbilityEffectLinksEditorMarkup(draft, references)}
        </div>
      ` : `
        <div class="creator-auto-meta creator-small-meta">
          <div><strong>Effect Links:</strong> this resolution mode does not apply effect templates.</div>
        </div>
      `}
      ${buildDisclosureSection({
    title: abilityIsTechnical(draft.sourceLabel) ? "Technical Settings" : "Levels",
    collapsed: levelsCollapsed,
    action: "toggleAbilitiesLevels",
    summary: abilityIsTechnical(draft.sourceLabel) ? "single internal runtime block" : `${Array.isArray(draft.levels) ? draft.levels.length : 0} level(s)`,
    actionsMarkup: abilityIsTechnical(draft.sourceLabel) ? "" : `
            <div class="button-row compact">
              <button type="button" class="secondary" data-creator-action="addAbilityLevel">Add Level</button>
              <button type="button" class="secondary" data-creator-action="fillAbilityLevels">Fill 1-5</button>
              <button type="button" class="secondary" data-creator-action="copyAbilityLevelsDown">Copy Level Down</button>
              <button type="button" class="secondary" data-creator-action="clearAbilityLevels">Clear Levels</button>
            </div>
          `,
    bodyMarkup: buildAbilityLevelsEditorMarkup(draft)
  })}
      ${buildDisclosureSection({
    title: "Payload Preview",
    collapsed: payloadCollapsed,
    action: "toggleAbilitiesPayload",
    bodyMarkup: `
          <div class="creator-auto-meta">
            ${summaryItems.map((item) => `<div><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</div>`).join("")}
          </div>
          <label class="field-stack">
            <textarea rows="16" readonly>${escapeHtml(prettyJson(buildAbilityPayload(draft, auto)))}</textarea>
          </label>
        `
  })}
    </form>
  `;
}
function buildAbilityLinksEditorMarkup(draft, references) {
  const links = Array.isArray(draft.abilityLinks) ? draft.abilityLinks : [];
  const selectedIds = links.map((entry) => entry.abilityDefId).filter(Boolean);
  if (!links.length) {
    return `<div class="creator-empty">No ability links yet. Add one to connect an existing ability to this equipment model.</div>`;
  }
  return links.map((link, index) => {
    const passive = link.grantMode === "passive";
    const reloadMode = String(link.reloadMode ?? "");
    return `
        <div class="creator-link-card" data-creator-link-row="${index}">
          <div class="creator-link-head">
            <strong>Ability Link ${index + 1}</strong>
            <button type="button" class="secondary" data-creator-link-remove="${index}">Remove</button>
          </div>
          <div class="field-grid creator-grid-2">
            <label class="field-stack">
              <span>Ability</span>
              <select data-creator-link-input="abilityDefId" data-link-index="${index}">
                ${buildAbilityOptions(references, link.abilityDefId, selectedIds)}
              </select>
            </label>
            <label class="field-stack">
              <span>Grant Mode</span>
              <select data-creator-link-input="grantMode" data-link-index="${index}">
                <option value="activated"${link.grantMode === "activated" ? " selected" : ""}>Active</option>
                <option value="passive"${passive ? " selected" : ""}>Passive</option>
              </select>
            </label>
          </div>
          ${passive ? `
            <div class="creator-auto-meta creator-small-meta">
              <div><strong>Passive:</strong> always active while the equipment is equipped.</div>
            </div>
          ` : `
            <div class="field-grid creator-grid-2">
              ${buildOptionalNumberField({
      label: "Duration",
      field: "durationRounds",
      index,
      value: link.durationRounds,
      mode: link.durationRoundsMode
    })}
              ${buildOptionalNumberField({
      label: "Charges",
      field: "charges",
      index,
      value: link.charges,
      mode: link.chargesMode
    })}
              ${buildOptionalNumberField({
      label: "Cooldown",
      field: "cooldownRounds",
      index,
      value: link.cooldownRounds,
      mode: link.cooldownRoundsMode
    })}
              <div class="creator-small-stack">
                <span>Reload</span>
                <div class="creator-mini-grid creator-mini-grid-wide">
                  <select data-creator-link-input="reloadMode" data-link-index="${index}">
                    ${RELOAD_MODES.map((mode) => `<option value="${escapeHtml(mode.value)}"${reloadMode === mode.value ? " selected" : ""}>${escapeHtml(mode.label)}</option>`).join("")}
                  </select>
                  <select data-creator-link-input="reloadItemCode" data-link-index="${index}"${reloadMode ? "" : " disabled"}>
                    ${buildItemOptions(references, link.reloadItemCode)}
                  </select>
                </div>
              </div>
            </div>
          `}
        </div>
      `;
  }).join("");
}
function buildEquipmentEditorMarkup(state, references) {
  const draft = state.drafts.equipment;
  const auto = generatedEquipmentPreview(draft, state);
  const types = getEquipmentUiTypes(references);
  const showProtectionSlots = shouldShowProtectionSlots(draft.itemType);
  const allowedBodyPartCodes = getEffectiveAllowedBodyPartCodes(draft);
  const advancedFlagsCount = Object.keys(toPlainObject(draft.flagsExtraData)).length;
  const advancedEffectDataCount = Object.keys(toPlainObject(draft.effectDataExtraData)).length;
  const payloadCollapsed = Boolean(state.collapsed.equipmentPayload);
  const dataModifiersCollapsed = Boolean(state.collapsed.equipmentDataModifiers);
  const typeOptions = types.map((itemType) => `<option value="${escapeHtml(itemType)}"${draft.itemType === itemType ? " selected" : ""}>${escapeHtml(itemType)}</option>`).join("");
  const payloadPreview = (() => {
    try {
      return prettyJson(buildEquipmentPayload(draft, auto));
    } catch (_error) {
      return prettyJson({ draft });
    }
  })();
  return `
    <div class="creator-editor-head">
      <div>
        <div class="creator-editor-title">${escapeHtml(draft.name || "New Equipment Draft")}</div>
        <div class="muted">${draft.id ? "Editing saved definition." : "Draft is local until Save."}</div>
      </div>
      <div class="creator-pill${state.dirty.equipment ? " dirty" : ""}" data-creator-dirty-pill="equipment">${state.dirty.equipment ? "Unsaved" : "Saved / clean"}</div>
    </div>
    <div class="button-row">
      <button type="button" data-creator-action="newDraft">Create New</button>
      <button type="button" class="secondary" data-creator-action="duplicateDraft">Duplicate</button>
      <button type="button" data-creator-action="saveDraft">Save</button>
      <button type="button" class="secondary" data-creator-action="reloadSelected"${draft.id ? "" : " disabled"}>Reload</button>
      <button type="button" class="secondary" data-creator-action="deleteSelected"${draft.id ? "" : " disabled"}>Delete</button>
    </div>
    <form class="creator-form" data-creator-form="equipment">
      <label class="field-stack">
        <span>Name</span>
        <input data-creator-input="name" type="text" value="${escapeHtml(draft.name)}" placeholder="Frontier Plate">
      </label>
      <div class="field-grid creator-grid-3">
        <label class="field-stack">
          <span>Item Type</span>
          <select data-creator-input="itemType">${typeOptions}</select>
        </label>
        <label class="field-stack">
          <span>Armor Value</span>
          <input data-creator-input="armorValue" type="number" value="${escapeHtml(draft.armorValue)}">
        </label>
        <label class="field-stack">
          <span>Armor Max Critical</span>
          <input data-creator-input="armorMaxCritical" type="number" value="${escapeHtml(draft.armorMaxCritical)}">
        </label>
      </div>
      <label class="field-stack">
        <span>Description</span>
        <textarea data-creator-input="description" rows="4" placeholder="Short GM-facing description">${escapeHtml(draft.description)}</textarea>
      </label>
      ${showProtectionSlots ? `
      <div class="creator-section-card">
        <div class="creator-section-head">
          <strong>Protection Slots</strong>
          <span class="muted">Structured creator fields instead of raw JSON.</span>
        </div>
        <div class="field-stack">
          <span>Allowed Body Parts</span>
          <div class="creator-check-grid">
            ${buildBodyPartCheckboxMarkup(references, allowedBodyPartCodes)}
          </div>
        </div>
        ${advancedFlagsCount || advancedEffectDataCount ? `
          <div class="creator-auto-meta creator-small-meta">
            ${advancedFlagsCount ? `<div><strong>Preserved extra flags:</strong> ${escapeHtml(String(advancedFlagsCount))}</div>` : ""}
            ${advancedEffectDataCount ? `<div><strong>Preserved extra data keys:</strong> ${escapeHtml(String(advancedEffectDataCount))}</div>` : ""}
          </div>
        ` : ""}
      </div>
      ` : ""}
      ${buildDisclosureSection({
    title: "Data & Modifiers",
    collapsed: dataModifiersCollapsed,
    action: "toggleEquipmentDataModifiers",
    summary: draft.modifiers?.length ? `${draft.modifiers.length} modifier(s)` : draft.notes || draft.reservedForFuture ? "configured" : "",
    actionsMarkup: `<button type="button" data-creator-action="addModifier">Add Modifier</button>`,
    bodyMarkup: `
          <div class="field-grid creator-grid-2">
            <label class="toggle-inline creator-toggle-card">
              <input data-creator-input="reservedForFuture" type="checkbox"${draft.reservedForFuture ? " checked" : ""}>
              <span>Reserved for future logic</span>
            </label>
          </div>
          <label class="field-stack">
            <span>Notes</span>
            <textarea data-creator-input="notes" rows="4" placeholder="Optional backend note for GM / future implementation">${escapeHtml(draft.notes)}</textarea>
          </label>
          <div class="creator-links-block">
            ${buildModifierEditorMarkup(draft, references)}
          </div>
        `
  })}
      <div class="creator-links-block">
        <div class="creator-links-head">
          <span>Ability Links</span>
          <button type="button" data-creator-action="addAbilityLink">Add Ability Link</button>
        </div>
        ${buildAbilityLinksEditorMarkup(draft, references)}
      </div>
      ${buildDisclosureSection({
    title: "Payload Preview",
    collapsed: payloadCollapsed,
    action: "toggleEquipmentPayload",
    bodyMarkup: `
          <label class="field-stack">
            <textarea rows="12" readonly>${escapeHtml(payloadPreview)}</textarea>
          </label>
        `
  })}
    </form>
  `;
}
function buildPanelMarkup(state, access) {
  if (!access.isGm) {
    return `
      <section class="panel">
        <div class="panel-title">Creator Menu</div>
        <p class="muted">Creator tools are GM-only. Players should not edit catalog definitions from this surface.</p>
      </section>
    `;
  }
  if (!access.configured) {
    return `
      <section class="panel">
        <div class="panel-title">Creator Menu</div>
        <p class="muted">Configure Supabase room settings above, then the creator tabs for Weapons, Items, Calibers, Ammo, Magazines, Skills, Effects, Abilities, and Equipment Models will unlock here.</p>
      </section>
    `;
  }
  const references = state.references ?? {};
  const listMarkup = state.activeTab === "weapons" ? buildListMarkup("weapons", state.lists.weapons, state.selectedIds.weapons) : state.activeTab === "items" ? buildListMarkup("items", state.lists.items, state.selectedIds.items) : state.activeTab === "skills" ? buildListMarkup("skills", state.lists.skills, state.selectedIds.skills) : state.activeTab === "calibers" ? buildListMarkup("calibers", state.lists.calibers, state.selectedIds.calibers) : state.activeTab === "ammo" ? buildListMarkup("ammo", state.lists.ammo, state.selectedIds.ammo) : state.activeTab === "magazines" ? buildListMarkup("magazines", state.lists.magazines, state.selectedIds.magazines) : state.activeTab === "effects" ? buildListMarkup("effects", state.lists.effects, state.selectedIds.effects) : state.activeTab === "abilities" ? buildListMarkup("abilities", state.lists.abilities, state.selectedIds.abilities) : buildListMarkup("equipment", state.lists.equipment, state.selectedIds.equipment);
  const filtersMarkup = state.activeTab === "weapons" ? buildWeaponFilterMarkup(state) : state.activeTab === "items" ? buildItemFilterMarkup(state) : state.activeTab === "calibers" ? buildCaliberFilterMarkup(state) : state.activeTab === "ammo" ? buildAmmoFilterMarkup(state, references) : state.activeTab === "magazines" ? buildMagazineFilterMarkup(state, references) : state.activeTab === "skills" ? buildSkillFilterMarkup(state, references) : state.activeTab === "effects" ? buildEffectFilterMarkup(state) : state.activeTab === "abilities" ? buildAbilityFilterMarkup(state) : buildEquipmentFilterMarkup(state, references);
  const editorMarkup = state.activeTab === "weapons" ? buildWeaponEditorMarkup(state, references) : state.activeTab === "items" ? buildItemEditorMarkup(state, references) : state.activeTab === "calibers" ? buildCaliberEditorMarkup(state) : state.activeTab === "ammo" ? buildAmmoEditorMarkup(state, references) : state.activeTab === "magazines" ? buildMagazineEditorMarkup(state, references) : state.activeTab === "skills" ? buildSkillEditorMarkup(state, references) : state.activeTab === "effects" ? buildEffectEditorMarkup(state, references) : state.activeTab === "abilities" ? buildAbilityEditorMarkup(state, references) : buildEquipmentEditorMarkup(state, references);
  const catalogCollapsed = state.activeTab === "weapons" ? Boolean(state.collapsed.weaponsCatalog) : state.activeTab === "items" ? Boolean(state.collapsed.itemsCatalog) : state.activeTab === "calibers" ? Boolean(state.collapsed.calibersCatalog) : state.activeTab === "ammo" ? Boolean(state.collapsed.ammoCatalog) : state.activeTab === "magazines" ? Boolean(state.collapsed.magazinesCatalog) : state.activeTab === "skills" ? Boolean(state.collapsed.skillsCatalog) : state.activeTab === "effects" ? Boolean(state.collapsed.effectsCatalog) : state.activeTab === "abilities" ? Boolean(state.collapsed.abilitiesCatalog) : Boolean(state.collapsed.equipmentCatalog);
  const catalogMarkup = buildCatalogSection({
    title: state.activeTab === "weapons" ? "Weapon Catalog" : state.activeTab === "items" ? "Item Catalog" : state.activeTab === "calibers" ? "Caliber Catalog" : state.activeTab === "ammo" ? "Ammo Catalog" : state.activeTab === "magazines" ? "Magazine Catalog" : state.activeTab === "skills" ? "Skill Catalog" : state.activeTab === "effects" ? "Effect Catalog" : state.activeTab === "abilities" ? "Ability Catalog" : "Equipment Catalog",
    count: state.activeTab === "weapons" ? state.lists.weapons.length : state.activeTab === "items" ? state.lists.items.length : state.activeTab === "calibers" ? state.lists.calibers.length : state.activeTab === "ammo" ? state.lists.ammo.length : state.activeTab === "magazines" ? state.lists.magazines.length : state.activeTab === "skills" ? state.lists.skills.length : state.activeTab === "effects" ? state.lists.effects.length : state.activeTab === "abilities" ? state.lists.abilities.length : state.lists.equipment.length,
    collapsed: catalogCollapsed,
    action: state.activeTab === "weapons" ? "toggleWeaponsCatalog" : state.activeTab === "items" ? "toggleItemsCatalog" : state.activeTab === "calibers" ? "toggleCalibersCatalog" : state.activeTab === "ammo" ? "toggleAmmoCatalog" : state.activeTab === "magazines" ? "toggleMagazinesCatalog" : state.activeTab === "skills" ? "toggleSkillsCatalog" : state.activeTab === "effects" ? "toggleEffectsCatalog" : state.activeTab === "abilities" ? "toggleAbilitiesCatalog" : "toggleEquipmentCatalog",
    bodyMarkup: listMarkup
  });
  return `
    <section class="panel creator-panel">
      <div class="panel-title">Creator Menu</div>
      <p class="panel-note">Drafts stay local in the UI until you press Save. Code, tags, and sort order are generated automatically to keep catalog work fast for the GM.</p>
      <nav class="creator-tabs">${buildTabButtons(state.activeTab)}</nav>
      ${filtersMarkup}
      ${state.error ? `<div class="creator-banner error">${escapeHtml(state.error)}</div>` : ""}
      ${state.info ? `<div class="creator-banner info">${escapeHtml(state.info)}</div>` : ""}
      ${state.loading ? `<div class="creator-banner info">Loading: ${escapeHtml(state.loadingLabel || "working...")}</div>` : ""}
      <div class="creator-layout">
        ${catalogMarkup}
        <div class="creator-editor">
          ${editorMarkup}
        </div>
      </div>
    </section>
  `;
}
function readCaliberDraftFromDom(root2, fallbackDraft = createEmptyCaliberDraft()) {
  const form = root2.querySelector('[data-creator-form="calibers"]');
  if (!(form instanceof HTMLElement)) {
    return cloneJson(fallbackDraft);
  }
  const query = (field) => form.querySelector(`[data-creator-input="${field}"]`);
  return {
    id: String(form.dataset.creatorEntityId ?? ""),
    name: String(query("name")?.value ?? fallbackDraft.name ?? ""),
    baseDamagePerRound: String(query("baseDamagePerRound")?.value ?? fallbackDraft.baseDamagePerRound ?? "0"),
    description: String(query("description")?.value ?? fallbackDraft.description ?? "")
  };
}
function readWeaponDraftFromDom(root2, fallbackDraft = createEmptyWeaponDraft()) {
  const form = root2.querySelector('[data-creator-form="weapons"]');
  if (!(form instanceof HTMLElement)) {
    return cloneJson(fallbackDraft);
  }
  const query = (field) => form.querySelector(`[data-creator-input="${field}"]`);
  const profileRows = Array.from(form.querySelectorAll("[data-creator-weapon-profile-row]"));
  const profiles = profileRows.length ? profileRows.map((row, index) => {
    const rowIndex = String(row.getAttribute("data-creator-weapon-profile-row") ?? index);
    const fallbackProfile = Array.isArray(fallbackDraft.profiles) ? fallbackDraft.profiles[Number.parseInt(rowIndex, 10)] ?? createEmptyWeaponProfileDraft(index) : createEmptyWeaponProfileDraft(index);
    const profileQuery = (field) => form.querySelector(`[data-creator-weapon-profile-input="${field}"][data-weapon-profile-index="${rowIndex}"]`);
    const attackType = String(profileQuery("attackType")?.value ?? fallbackProfile.attackType ?? "ranged").trim() === "melee" ? "melee" : "ranged";
    const fireModeIds = Array.from(form.querySelectorAll(`[data-creator-weapon-profile-fire-mode][data-weapon-profile-index="${rowIndex}"]:checked`)).map((entry) => String(entry.getAttribute("data-creator-weapon-profile-fire-mode") ?? "").trim()).filter(Boolean);
    const magazineDefIds = Array.from(form.querySelectorAll(`[data-creator-weapon-profile-magazine][data-weapon-profile-index="${rowIndex}"]:checked`)).map((entry) => String(entry.getAttribute("data-creator-weapon-profile-magazine") ?? "").trim()).filter(Boolean);
    return {
      id: String(fallbackProfile.id ?? ""),
      name: String(profileQuery("name")?.value ?? fallbackProfile.name ?? ""),
      attackType,
      weaponClassId: String(profileQuery("weaponClassId")?.value ?? fallbackProfile.weaponClassId ?? ""),
      linkedSkillId: String(profileQuery("linkedSkillId")?.value ?? fallbackProfile.linkedSkillId ?? ""),
      rangeProfileId: String(profileQuery("rangeProfileId")?.value ?? fallbackProfile.rangeProfileId ?? ""),
      caliberId: String(profileQuery("caliberId")?.value ?? fallbackProfile.caliberId ?? ""),
      accuracyModifier: String(profileQuery("accuracyModifier")?.value ?? fallbackProfile.accuracyModifier ?? "0"),
      baseMeleeDamage: String(profileQuery("baseMeleeDamage")?.value ?? fallbackProfile.baseMeleeDamage ?? "0"),
      armorPierce: String(profileQuery("armorPierce")?.value ?? fallbackProfile.armorPierce ?? "0"),
      twoHanded: Boolean(profileQuery("twoHanded")?.checked ?? fallbackProfile.twoHanded ?? false),
      canParry: attackType === "melee" ? Boolean(profileQuery("canParry")?.checked ?? fallbackProfile.canParry ?? false) : false,
      fireModeIds,
      magazineDefIds,
      isDefault: Boolean(profileQuery("isDefault")?.checked ?? fallbackProfile.isDefault ?? false),
      dataExtraData: cloneJson(fallbackProfile.dataExtraData ?? {})
    };
  }) : cloneJson(fallbackDraft.profiles ?? [createEmptyWeaponProfileDraft(0)]);
  if (profiles.length && !profiles.some((entry) => entry.isDefault)) {
    profiles[0].isDefault = true;
  }
  return {
    id: String(form.dataset.creatorEntityId ?? ""),
    name: String(query("name")?.value ?? fallbackDraft.name ?? ""),
    description: String(query("description")?.value ?? fallbackDraft.description ?? ""),
    profiles
  };
}
function readItemDraftFromDom(root2, fallbackDraft = createEmptyItemDraft()) {
  const form = root2.querySelector('[data-creator-form="items"]');
  if (!(form instanceof HTMLElement)) {
    return cloneJson(fallbackDraft);
  }
  const query = (field) => form.querySelector(`[data-creator-input="${field}"]`);
  const linkRows = Array.from(form.querySelectorAll("[data-creator-link-row]"));
  const abilityLinks = linkRows.length ? linkRows.map((row) => {
    const index = String(row.getAttribute("data-creator-link-row") ?? "");
    const fallbackLink = Array.isArray(fallbackDraft.abilityLinks) ? fallbackDraft.abilityLinks[Number.parseInt(index, 10)] ?? createEmptyAbilityLinkDraft() : createEmptyAbilityLinkDraft();
    const linkQuery = (field) => form.querySelector(`[data-creator-link-input="${field}"][data-link-index="${index}"]`);
    return {
      abilityDefId: String(linkQuery("abilityDefId")?.value ?? fallbackLink.abilityDefId ?? ""),
      grantMode: String(linkQuery("grantMode")?.value ?? fallbackLink.grantMode ?? "activated"),
      durationRoundsMode: String(linkQuery("durationRoundsMode")?.value ?? fallbackLink.durationRoundsMode ?? "none"),
      durationRounds: String(linkQuery("durationRounds")?.value ?? fallbackLink.durationRounds ?? ""),
      chargesMode: String(linkQuery("chargesMode")?.value ?? fallbackLink.chargesMode ?? "none"),
      charges: String(linkQuery("charges")?.value ?? fallbackLink.charges ?? ""),
      cooldownRoundsMode: String(linkQuery("cooldownRoundsMode")?.value ?? fallbackLink.cooldownRoundsMode ?? "none"),
      cooldownRounds: String(linkQuery("cooldownRounds")?.value ?? fallbackLink.cooldownRounds ?? ""),
      reloadMode: String(linkQuery("reloadMode")?.value ?? fallbackLink.reloadMode ?? ""),
      reloadItemCode: String(linkQuery("reloadItemCode")?.value ?? fallbackLink.reloadItemCode ?? "")
    };
  }) : cloneJson(fallbackDraft.abilityLinks ?? []);
  return {
    id: String(form.dataset.creatorEntityId ?? ""),
    name: String(query("name")?.value ?? fallbackDraft.name ?? ""),
    itemType: String(query("itemType")?.value ?? fallbackDraft.itemType ?? "custom"),
    useActionType: String(query("useActionType")?.value ?? fallbackDraft.useActionType ?? "none"),
    isStackable: Boolean(query("isStackable")?.checked ?? fallbackDraft.isStackable ?? true),
    defaultQuantity: String(query("defaultQuantity")?.value ?? fallbackDraft.defaultQuantity ?? "1"),
    maxStack: String(query("maxStack")?.value ?? fallbackDraft.maxStack ?? ""),
    defaultMaxCharges: String(query("defaultMaxCharges")?.value ?? fallbackDraft.defaultMaxCharges ?? ""),
    defaultCurrentCharges: String(query("defaultCurrentCharges")?.value ?? fallbackDraft.defaultCurrentCharges ?? ""),
    description: String(query("description")?.value ?? fallbackDraft.description ?? ""),
    abilityLinks
  };
}
function readAmmoDraftFromDom(root2, fallbackDraft = createEmptyAmmoDraft()) {
  const form = root2.querySelector('[data-creator-form="ammo"]');
  if (!(form instanceof HTMLElement)) {
    return cloneJson(fallbackDraft);
  }
  const query = (field) => form.querySelector(`[data-creator-input="${field}"]`);
  return {
    id: String(form.dataset.creatorEntityId ?? ""),
    name: String(query("name")?.value ?? fallbackDraft.name ?? ""),
    caliberId: String(query("caliberId")?.value ?? fallbackDraft.caliberId ?? ""),
    damageModifier: String(query("damageModifier")?.value ?? fallbackDraft.damageModifier ?? "0"),
    accuracyModifier: String(query("accuracyModifier")?.value ?? fallbackDraft.accuracyModifier ?? "0"),
    armorPierce: String(query("armorPierce")?.value ?? fallbackDraft.armorPierce ?? "0"),
    description: String(query("description")?.value ?? fallbackDraft.description ?? "")
  };
}
function readMagazineDraftFromDom(root2, fallbackDraft = createEmptyMagazineDraft()) {
  const form = root2.querySelector('[data-creator-form="magazines"]');
  if (!(form instanceof HTMLElement)) {
    return cloneJson(fallbackDraft);
  }
  const query = (field) => form.querySelector(`[data-creator-input="${field}"]`);
  return {
    id: String(form.dataset.creatorEntityId ?? ""),
    name: String(query("name")?.value ?? fallbackDraft.name ?? ""),
    caliberId: String(query("caliberId")?.value ?? fallbackDraft.caliberId ?? ""),
    capacity: String(query("capacity")?.value ?? fallbackDraft.capacity ?? "1"),
    description: String(query("description")?.value ?? fallbackDraft.description ?? "")
  };
}
function readSkillDraftFromDom(root2) {
  const form = root2.querySelector('[data-creator-form="skills"]');
  if (!(form instanceof HTMLElement)) {
    return createEmptySkillDraft();
  }
  const query = (field) => form.querySelector(`[data-creator-input="${field}"]`);
  const skillGroup = String(query("skillGroup")?.value ?? "combat");
  const skillConfig = getSkillSubcategoryConfig(skillGroup, String(query("skillSubcategory")?.value ?? ""));
  return {
    id: String(form.dataset.creatorEntityId ?? ""),
    name: String(query("name")?.value ?? ""),
    skillGroup,
    skillSubcategory: String(skillConfig.value ?? "melee"),
    category: String(skillConfig.backendCategory ?? "combat"),
    maxLevel: String(skillConfig.maxLevel ?? 5),
    mainAttributeId: String(query("mainAttributeId")?.value ?? ""),
    secondaryAttributeId: String(query("secondaryAttributeId")?.value ?? ""),
    description: String(query("description")?.value ?? "")
  };
}
function readEffectDraftFromDom(root2, fallbackDraft = createEmptyEffectDraft()) {
  const form = root2.querySelector('[data-creator-form="effects"]');
  if (!(form instanceof HTMLElement)) {
    return cloneJson(fallbackDraft);
  }
  const query = (field) => form.querySelector(`[data-creator-input="${field}"]`);
  const modifierRows = Array.from(form.querySelectorAll("[data-creator-modifier-row]"));
  const modifiers = modifierRows.length ? modifierRows.map((row) => {
    const index = String(row.getAttribute("data-creator-modifier-row") ?? "");
    const fallbackModifier = Array.isArray(fallbackDraft.modifiers) ? fallbackDraft.modifiers[Number.parseInt(index, 10)] ?? createEmptyModifierDraft() : createEmptyModifierDraft();
    const modifierQuery = (field) => form.querySelector(`[data-creator-modifier-input="${field}"][data-modifier-index="${index}"]`);
    return {
      target: String(modifierQuery("target")?.value ?? fallbackModifier.target ?? "attack_accuracy"),
      customTarget: String(modifierQuery("customTarget")?.value ?? fallbackModifier.customTarget ?? ""),
      attributeCode: String(modifierQuery("attributeCode")?.value ?? fallbackModifier.attributeCode ?? ""),
      skillCode: String(modifierQuery("skillCode")?.value ?? fallbackModifier.skillCode ?? ""),
      value: String(modifierQuery("value")?.value ?? fallbackModifier.value ?? "0")
    };
  }) : cloneJson(fallbackDraft.modifiers ?? []);
  const flagRows = Array.from(form.querySelectorAll("[data-creator-flag-row]"));
  const flags = flagRows.length ? flagRows.map((row) => {
    const index = String(row.getAttribute("data-creator-flag-row") ?? "");
    const fallbackFlag = Array.isArray(fallbackDraft.flags) ? fallbackDraft.flags[Number.parseInt(index, 10)] ?? createEmptyFlagDraft() : createEmptyFlagDraft();
    const flagQuery = (field) => form.querySelector(`[data-creator-flag-input="${field}"][data-flag-index="${index}"]`);
    return {
      key: String(flagQuery("key")?.value ?? fallbackFlag.key ?? "helpless"),
      customKey: String(flagQuery("customKey")?.value ?? fallbackFlag.customKey ?? ""),
      enabled: Boolean(flagQuery("enabled")?.checked ?? fallbackFlag.enabled ?? true)
    };
  }) : cloneJson(fallbackDraft.flags ?? []);
  const effectType = String(query("effectType")?.value ?? fallbackDraft.effectType ?? "modifiers_flags");
  return {
    id: String(form.dataset.creatorEntityId ?? ""),
    name: String(query("name")?.value ?? ""),
    uiCategory: String(query("uiCategory")?.value ?? fallbackDraft.uiCategory ?? "utility"),
    description: String(query("description")?.value ?? fallbackDraft.description ?? ""),
    defaultDurationType: String(query("defaultDurationType")?.value ?? fallbackDraft.defaultDurationType ?? "manual"),
    defaultRounds: String(query("defaultRounds")?.value ?? fallbackDraft.defaultRounds ?? ""),
    stackingMode: String(query("stackingMode")?.value ?? fallbackDraft.stackingMode ?? "replace"),
    isNegative: Boolean(query("isNegative")?.checked ?? fallbackDraft.isNegative),
    isNarrative: Boolean(query("isNarrative")?.checked ?? fallbackDraft.isNarrative),
    effectType,
    targetScope: String(query("targetScope")?.value ?? fallbackDraft.targetScope ?? getDefaultTargetScopeForEffectType(effectType)),
    amountMetric: String(query("amountMetric")?.value ?? fallbackDraft.amountMetric ?? getDefaultMetricForEffectType(effectType)),
    scaleBase: String(query("scaleBase")?.value ?? fallbackDraft.scaleBase ?? "0"),
    scalePerLevel: String(query("scalePerLevel")?.value ?? fallbackDraft.scalePerLevel ?? "0"),
    tickPhase: String(query("tickPhase")?.value ?? fallbackDraft.tickPhase ?? "turn_end"),
    resourcePoolId: String(query("resourcePoolId")?.value ?? fallbackDraft.resourcePoolId ?? ""),
    restoreDisabled: Boolean(query("restoreDisabled")?.checked ?? fallbackDraft.restoreDisabled),
    modifiers,
    flags,
    dataExtraData: cloneJson(fallbackDraft.dataExtraData ?? {}),
    payloadExtraData: cloneJson(fallbackDraft.payloadExtraData ?? {})
  };
}
function readAbilityDraftFromDom(root2, fallbackDraft = createEmptyAbilityDraft()) {
  const form = root2.querySelector('[data-creator-form="abilities"]');
  if (!(form instanceof HTMLElement)) {
    return cloneJson(fallbackDraft);
  }
  const query = (field) => form.querySelector(`[data-creator-input="${field}"]`);
  const effectLinks = Array.from(form.querySelectorAll("[data-creator-ability-effect-row]")).map((row) => {
    const index = String(row.getAttribute("data-creator-ability-effect-row") ?? "");
    const fallbackLink = Array.isArray(fallbackDraft.effectLinks) ? fallbackDraft.effectLinks[Number.parseInt(index, 10)] ?? createEmptyAbilityEffectLinkDraft() : createEmptyAbilityEffectLinkDraft();
    const effectQuery = (field) => form.querySelector(`[data-creator-ability-effect-input="${field}"][data-ability-effect-index="${index}"]`);
    return {
      effectDefId: String(effectQuery("effectDefId")?.value ?? fallbackLink.effectDefId ?? "")
    };
  });
  const levelRows = Array.from(form.querySelectorAll("[data-creator-ability-level-row]"));
  const levels = levelRows.length ? levelRows.map((row, index) => {
    const rowIndex = String(row.getAttribute("data-creator-ability-level-row") ?? index);
    const fallbackLevel = Array.isArray(fallbackDraft.levels) ? fallbackDraft.levels[Number.parseInt(rowIndex, 10)] ?? createEmptyAbilityLevelDraft(index + 1) : createEmptyAbilityLevelDraft(index + 1);
    const levelQuery = (field) => form.querySelector(`[data-creator-ability-level-input="${field}"][data-ability-level-index="${rowIndex}"]`);
    return {
      id: String(fallbackLevel.id ?? ""),
      abilityLevel: String(levelQuery("abilityLevel")?.value ?? fallbackLevel.abilityLevel ?? String(index + 1)),
      resourceCost: String(levelQuery("resourceCost")?.value ?? fallbackLevel.resourceCost ?? "0"),
      durationRounds: String(levelQuery("durationRounds")?.value ?? fallbackLevel.durationRounds ?? ""),
      attackAccuracyBonus: String(levelQuery("attackAccuracyBonus")?.value ?? fallbackLevel.attackAccuracyBonus ?? "0"),
      attackDamageBonus: String(levelQuery("attackDamageBonus")?.value ?? fallbackLevel.attackDamageBonus ?? "0"),
      attackArmorPierce: String(levelQuery("attackArmorPierce")?.value ?? fallbackLevel.attackArmorPierce ?? "0"),
      specialArmorValue: String(levelQuery("specialArmorValue")?.value ?? fallbackLevel.specialArmorValue ?? ""),
      specialMaxCritical: String(levelQuery("specialMaxCritical")?.value ?? fallbackLevel.specialMaxCritical ?? ""),
      dataExtraData: cloneJson(fallbackLevel.dataExtraData ?? {}),
      effectDataExtraData: cloneJson(fallbackLevel.effectDataExtraData ?? {})
    };
  }) : cloneJson(fallbackDraft.levels ?? [createEmptyAbilityLevelDraft(1)]);
  const uiKind = String(query("uiKind")?.value ?? fallbackDraft.uiKind ?? "utility");
  const resolutionMode = String(query("resolutionMode")?.value ?? fallbackDraft.resolutionMode ?? getDefaultResolutionForAbilityKind(uiKind));
  const attackType = String(query("attackType")?.value ?? fallbackDraft.attackType ?? getDefaultAttackTypeForAbilityKind(uiKind));
  const isMelee = attackType === "melee";
  return normalizeAbilityEditorDraft({
    id: String(form.dataset.creatorEntityId ?? ""),
    name: String(query("name")?.value ?? ""),
    uiKind,
    sourceLabel: String(query("sourceLabel")?.value ?? fallbackDraft.sourceLabel ?? "technical"),
    resolutionMode,
    targetType: String(query("targetType")?.value ?? fallbackDraft.targetType ?? getDefaultTargetTypeForAbilityKind(uiKind, resolutionMode)),
    attackType,
    rangeMode: isMelee ? "limited" : String(query("rangeMode")?.value ?? fallbackDraft.rangeMode ?? "none"),
    maxDistanceM: isMelee ? "2" : String(query("maxDistanceM")?.value ?? fallbackDraft.maxDistanceM ?? ""),
    description: String(query("description")?.value ?? fallbackDraft.description ?? ""),
    effectLinks,
    levels,
    dataExtraData: cloneJson(fallbackDraft.dataExtraData ?? {}),
    effectDataExtraData: cloneJson(fallbackDraft.effectDataExtraData ?? {})
  });
}
function readEquipmentDraftFromDom(root2, fallbackDraft = createEmptyEquipmentDraft()) {
  const form = root2.querySelector('[data-creator-form="equipment"]');
  if (!(form instanceof HTMLElement)) {
    return cloneJson(fallbackDraft);
  }
  const query = (field) => form.querySelector(`[data-creator-input="${field}"]`);
  const bodyPartCodes = Array.from(form.querySelectorAll("[data-creator-body-part-code]:checked")).map((entry) => String(entry.getAttribute("data-creator-body-part-code") ?? "").trim()).filter(Boolean);
  const abilityLinks = Array.from(form.querySelectorAll("[data-creator-link-row]")).map((row) => {
    const index = String(row.getAttribute("data-creator-link-row") ?? "");
    const fallbackLink = Array.isArray(fallbackDraft.abilityLinks) ? fallbackDraft.abilityLinks[Number.parseInt(index, 10)] ?? createEmptyAbilityLinkDraft() : createEmptyAbilityLinkDraft();
    const linkQuery = (field) => form.querySelector(`[data-creator-link-input="${field}"][data-link-index="${index}"]`);
    const grantMode = String(linkQuery("grantMode")?.value ?? "activated");
    return {
      abilityDefId: String(linkQuery("abilityDefId")?.value ?? ""),
      grantMode,
      durationRoundsMode: String(linkQuery("durationRoundsMode")?.value ?? fallbackLink.durationRoundsMode ?? "none"),
      durationRounds: String(linkQuery("durationRounds")?.value ?? fallbackLink.durationRounds ?? ""),
      chargesMode: String(linkQuery("chargesMode")?.value ?? fallbackLink.chargesMode ?? "none"),
      charges: String(linkQuery("charges")?.value ?? fallbackLink.charges ?? ""),
      cooldownRoundsMode: String(linkQuery("cooldownRoundsMode")?.value ?? fallbackLink.cooldownRoundsMode ?? "none"),
      cooldownRounds: String(linkQuery("cooldownRounds")?.value ?? fallbackLink.cooldownRounds ?? ""),
      reloadMode: String(linkQuery("reloadMode")?.value ?? fallbackLink.reloadMode ?? ""),
      reloadItemCode: String(linkQuery("reloadItemCode")?.value ?? fallbackLink.reloadItemCode ?? "")
    };
  });
  const modifierRows = Array.from(form.querySelectorAll("[data-creator-modifier-row]"));
  const modifiers = modifierRows.length ? modifierRows.map((row) => {
    const index = String(row.getAttribute("data-creator-modifier-row") ?? "");
    const fallbackModifier = Array.isArray(fallbackDraft.modifiers) ? fallbackDraft.modifiers[Number.parseInt(index, 10)] ?? createEmptyModifierDraft() : createEmptyModifierDraft();
    const modifierQuery = (field) => form.querySelector(`[data-creator-modifier-input="${field}"][data-modifier-index="${index}"]`);
    return {
      target: String(modifierQuery("target")?.value ?? fallbackModifier.target ?? "attack_accuracy"),
      customTarget: String(modifierQuery("customTarget")?.value ?? fallbackModifier.customTarget ?? ""),
      attributeCode: String(modifierQuery("attributeCode")?.value ?? fallbackModifier.attributeCode ?? ""),
      skillCode: String(modifierQuery("skillCode")?.value ?? fallbackModifier.skillCode ?? ""),
      value: String(modifierQuery("value")?.value ?? fallbackModifier.value ?? "0")
    };
  }) : cloneJson(fallbackDraft.modifiers ?? []);
  return {
    id: String(form.dataset.creatorEntityId ?? ""),
    name: String(query("name")?.value ?? ""),
    itemType: String(query("itemType")?.value ?? "armor"),
    description: String(query("description")?.value ?? ""),
    armorValue: String(query("armorValue")?.value ?? "0"),
    armorMaxCritical: String(query("armorMaxCritical")?.value ?? "0"),
    defaultBodyPartCode: getPrimaryBodyPartCode(bodyPartCodes, fallbackDraft.defaultBodyPartCode ?? ""),
    allowedBodyPartCodes: bodyPartCodes.length ? bodyPartCodes : cloneJson(fallbackDraft.allowedBodyPartCodes ?? []),
    reservedForFuture: query("reservedForFuture") ? Boolean(query("reservedForFuture")?.checked) : Boolean(fallbackDraft.reservedForFuture),
    notes: String(query("notes")?.value ?? fallbackDraft.notes ?? ""),
    modifiers,
    flagsExtraData: cloneJson(fallbackDraft.flagsExtraData ?? {}),
    effectDataExtraData: cloneJson(fallbackDraft.effectDataExtraData ?? {}),
    abilityLinks
  };
}
function updateDirtyPill(root2, kind, isDirty) {
  const pill = root2.querySelector(`[data-creator-dirty-pill="${kind}"]`);
  if (!(pill instanceof HTMLElement)) {
    return;
  }
  pill.textContent = isDirty ? "Unsaved" : "Saved / clean";
  pill.classList.toggle("dirty", Boolean(isDirty));
}
function mountCreatorMenu({
  root: root2,
  runtime: runtime2,
  getPlayer,
  getSettings,
  onDiagnostic = () => {
  }
}) {
  const state = createInitialState();
  function getAccess() {
    const player = getPlayer();
    const settings = getSettings();
    return {
      player,
      settings,
      isGm: player?.role === "GM",
      configured: hasSupabaseSettings(settings),
      settingsKey: hasSupabaseSettings(settings) ? `${settings.url}::${settings.apiKey}` : ""
    };
  }
  function captureActiveDraft() {
    if (state.activeTab === "weapons") {
      state.drafts.weapons = readWeaponDraftFromDom(root2, state.drafts.weapons);
    } else if (state.activeTab === "items") {
      state.drafts.items = readItemDraftFromDom(root2, state.drafts.items);
    } else if (state.activeTab === "calibers") {
      state.drafts.calibers = readCaliberDraftFromDom(root2, state.drafts.calibers);
    } else if (state.activeTab === "ammo") {
      state.drafts.ammo = readAmmoDraftFromDom(root2, state.drafts.ammo);
    } else if (state.activeTab === "magazines") {
      state.drafts.magazines = readMagazineDraftFromDom(root2, state.drafts.magazines);
    } else if (state.activeTab === "skills") {
      state.drafts.skills = readSkillDraftFromDom(root2);
    } else if (state.activeTab === "effects") {
      state.drafts.effects = readEffectDraftFromDom(root2, state.drafts.effects);
    } else if (state.activeTab === "abilities") {
      state.drafts.abilities = readAbilityDraftFromDom(root2, state.drafts.abilities);
    } else {
      state.drafts.equipment = readEquipmentDraftFromDom(root2, state.drafts.equipment);
    }
  }
  function clearMessages() {
    state.error = "";
    state.info = "";
  }
  function resetLoadedData({ keepTab = true } = {}) {
    const activeTab = keepTab ? state.activeTab : "calibers";
    state.references = null;
    state.loadedTabs = { weapons: false, items: false, calibers: false, ammo: false, magazines: false, skills: false, effects: false, abilities: false, equipment: false };
    state.lists = { weapons: [], items: [], calibers: [], ammo: [], magazines: [], skills: [], effects: [], abilities: [], equipment: [] };
    state.selectedIds = { weapons: "", items: "", calibers: "", ammo: "", magazines: "", skills: "", effects: "", abilities: "", equipment: "" };
    state.bundles = { weapons: null, items: null, calibers: null, ammo: null, magazines: null, skills: null, effects: null, abilities: null, equipment: null };
    state.drafts = {
      weapons: createEmptyWeaponDraft(),
      items: createEmptyItemDraft(),
      calibers: createEmptyCaliberDraft(),
      ammo: createEmptyAmmoDraft(),
      magazines: createEmptyMagazineDraft(),
      skills: createEmptySkillDraft(),
      effects: createEmptyEffectDraft(),
      abilities: createEmptyAbilityDraft(),
      equipment: createEmptyEquipmentDraft()
    };
    state.dirty = { weapons: false, items: false, calibers: false, ammo: false, magazines: false, skills: false, effects: false, abilities: false, equipment: false };
    state.activeTab = activeTab;
  }
  function render() {
    const access = getAccess();
    root2.innerHTML = buildPanelMarkup(state, access);
    const form = root2.querySelector(`[data-creator-form="${state.activeTab}"]`);
    if (form instanceof HTMLElement) {
      form.dataset.creatorEntityId = state.drafts[state.activeTab].id || "";
      form.addEventListener("input", () => {
        captureActiveDraft();
        state.dirty[state.activeTab] = true;
        clearMessages();
        updateDirtyPill(root2, state.activeTab, true);
      });
      form.addEventListener("change", (event) => {
        captureActiveDraft();
        state.dirty[state.activeTab] = true;
        clearMessages();
        updateDirtyPill(root2, state.activeTab, true);
        const target = event.target;
        if (target instanceof HTMLElement && (target.hasAttribute("data-creator-input") && ["skillGroup", "effectType", "defaultDurationType", "uiKind", "sourceLabel", "resolutionMode", "rangeMode", "attackType", "targetType", "caliberId", "itemType", "useActionType", "isStackable"].includes(String(target.getAttribute("data-creator-input"))) || target.hasAttribute("data-creator-link-input") && ["grantMode", "reloadMode", "durationRoundsMode", "chargesMode", "cooldownRoundsMode"].includes(String(target.getAttribute("data-creator-link-input"))) || target.hasAttribute("data-creator-modifier-input") || target.hasAttribute("data-creator-flag-input") || target.hasAttribute("data-creator-ability-effect-input") || target.hasAttribute("data-creator-ability-level-input") || target.hasAttribute("data-creator-weapon-profile-input") || target.hasAttribute("data-creator-weapon-profile-fire-mode") || target.hasAttribute("data-creator-weapon-profile-magazine"))) {
          render();
        }
      });
    }
    root2.querySelectorAll("[data-creator-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        captureActiveDraft();
        state.activeTab = button.dataset.creatorTab;
        clearMessages();
        render();
        void ensureReadyForActiveTab();
      });
    });
    root2.querySelectorAll("[data-creator-open]").forEach((button) => {
      button.addEventListener("click", () => {
        const [kind, id] = String(button.dataset.creatorOpen ?? "").split(":");
        if (!kind || !id) return;
        captureActiveDraft();
        void openRecord(kind, id);
      });
    });
    root2.querySelectorAll("[data-creator-link-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        captureActiveDraft();
        const index = Number.parseInt(String(button.dataset.creatorLinkRemove ?? ""), 10);
        if (!Number.isFinite(index)) return;
        if (state.activeTab === "items") {
          state.drafts.items.abilityLinks.splice(index, 1);
          state.dirty.items = true;
        } else {
          state.drafts.equipment.abilityLinks.splice(index, 1);
          state.dirty.equipment = true;
        }
        clearMessages();
        render();
      });
    });
    root2.querySelectorAll("[data-creator-ability-effect-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        captureActiveDraft();
        const index = Number.parseInt(String(button.dataset.creatorAbilityEffectRemove ?? ""), 10);
        if (!Number.isFinite(index)) return;
        state.drafts.abilities.effectLinks.splice(index, 1);
        state.dirty.abilities = true;
        clearMessages();
        render();
      });
    });
    root2.querySelectorAll("[data-creator-ability-level-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        captureActiveDraft();
        const index = Number.parseInt(String(button.dataset.creatorAbilityLevelRemove ?? ""), 10);
        if (!Number.isFinite(index)) return;
        if (Array.isArray(state.drafts.abilities.levels) && state.drafts.abilities.levels.length > 1) {
          state.drafts.abilities.levels.splice(index, 1);
          state.drafts.abilities.levels = state.drafts.abilities.levels.map((entry, levelIndex) => ({
            ...entry,
            abilityLevel: String(levelIndex + 1)
          }));
          state.dirty.abilities = true;
          clearMessages();
          render();
        }
      });
    });
    root2.querySelectorAll("[data-creator-weapon-profile-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        captureActiveDraft();
        const index = Number.parseInt(String(button.dataset.creatorWeaponProfileRemove ?? ""), 10);
        if (!Number.isFinite(index)) return;
        if (Array.isArray(state.drafts.weapons.profiles) && state.drafts.weapons.profiles.length > 1) {
          state.drafts.weapons.profiles.splice(index, 1);
          if (!state.drafts.weapons.profiles.some((entry) => entry.isDefault) && state.drafts.weapons.profiles.length) {
            state.drafts.weapons.profiles[0].isDefault = true;
          }
          state.dirty.weapons = true;
          clearMessages();
          render();
        }
      });
    });
    root2.querySelectorAll("[data-creator-modifier-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        captureActiveDraft();
        const index = Number.parseInt(String(button.dataset.creatorModifierRemove ?? ""), 10);
        if (!Number.isFinite(index)) return;
        if (state.activeTab === "effects") {
          state.drafts.effects.modifiers.splice(index, 1);
          state.dirty.effects = true;
        } else {
          state.drafts.equipment.modifiers.splice(index, 1);
          state.dirty.equipment = true;
        }
        clearMessages();
        render();
      });
    });
    root2.querySelectorAll("[data-creator-flag-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        captureActiveDraft();
        const index = Number.parseInt(String(button.dataset.creatorFlagRemove ?? ""), 10);
        if (!Number.isFinite(index)) return;
        state.drafts.effects.flags.splice(index, 1);
        state.dirty.effects = true;
        clearMessages();
        render();
      });
    });
    root2.querySelectorAll("[data-creator-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.creatorAction;
        switch (action) {
          case "applyFilters":
            captureActiveDraft();
            applyFiltersFromDom();
            void refreshActiveList();
            break;
          case "refreshList":
            captureActiveDraft();
            void refreshActiveList({ forceRefs: true });
            break;
          case "toggleSkillsCatalog":
            captureActiveDraft();
            state.collapsed.skillsCatalog = !state.collapsed.skillsCatalog;
            render();
            break;
          case "toggleWeaponsCatalog":
            captureActiveDraft();
            state.collapsed.weaponsCatalog = !state.collapsed.weaponsCatalog;
            render();
            break;
          case "toggleItemsCatalog":
            captureActiveDraft();
            state.collapsed.itemsCatalog = !state.collapsed.itemsCatalog;
            render();
            break;
          case "toggleCalibersCatalog":
            captureActiveDraft();
            state.collapsed.calibersCatalog = !state.collapsed.calibersCatalog;
            render();
            break;
          case "toggleAmmoCatalog":
            captureActiveDraft();
            state.collapsed.ammoCatalog = !state.collapsed.ammoCatalog;
            render();
            break;
          case "toggleMagazinesCatalog":
            captureActiveDraft();
            state.collapsed.magazinesCatalog = !state.collapsed.magazinesCatalog;
            render();
            break;
          case "toggleEquipmentCatalog":
            captureActiveDraft();
            state.collapsed.equipmentCatalog = !state.collapsed.equipmentCatalog;
            render();
            break;
          case "toggleEffectsCatalog":
            captureActiveDraft();
            state.collapsed.effectsCatalog = !state.collapsed.effectsCatalog;
            render();
            break;
          case "toggleAbilitiesCatalog":
            captureActiveDraft();
            state.collapsed.abilitiesCatalog = !state.collapsed.abilitiesCatalog;
            render();
            break;
          case "toggleSkillsPayload":
            captureActiveDraft();
            state.collapsed.skillsPayload = !state.collapsed.skillsPayload;
            render();
            break;
          case "toggleWeaponsPayload":
            captureActiveDraft();
            state.collapsed.weaponsPayload = !state.collapsed.weaponsPayload;
            render();
            break;
          case "toggleItemsPayload":
            captureActiveDraft();
            state.collapsed.itemsPayload = !state.collapsed.itemsPayload;
            render();
            break;
          case "toggleCalibersPayload":
            captureActiveDraft();
            state.collapsed.calibersPayload = !state.collapsed.calibersPayload;
            render();
            break;
          case "toggleAmmoPayload":
            captureActiveDraft();
            state.collapsed.ammoPayload = !state.collapsed.ammoPayload;
            render();
            break;
          case "toggleMagazinesPayload":
            captureActiveDraft();
            state.collapsed.magazinesPayload = !state.collapsed.magazinesPayload;
            render();
            break;
          case "toggleEffectsPayload":
            captureActiveDraft();
            state.collapsed.effectsPayload = !state.collapsed.effectsPayload;
            render();
            break;
          case "toggleEffectsBehavior":
            captureActiveDraft();
            state.collapsed.effectsBehavior = !state.collapsed.effectsBehavior;
            render();
            break;
          case "toggleAbilitiesPayload":
            captureActiveDraft();
            state.collapsed.abilitiesPayload = !state.collapsed.abilitiesPayload;
            render();
            break;
          case "toggleAbilitiesLevels":
            captureActiveDraft();
            state.collapsed.abilitiesLevels = !state.collapsed.abilitiesLevels;
            render();
            break;
          case "toggleEquipmentPayload":
            captureActiveDraft();
            state.collapsed.equipmentPayload = !state.collapsed.equipmentPayload;
            render();
            break;
          case "toggleEquipmentDataModifiers":
            captureActiveDraft();
            state.collapsed.equipmentDataModifiers = !state.collapsed.equipmentDataModifiers;
            render();
            break;
          case "newDraft":
            captureActiveDraft();
            createNewDraft();
            break;
          case "duplicateDraft":
            captureActiveDraft();
            duplicateDraft();
            break;
          case "saveDraft":
            captureActiveDraft();
            void saveDraft();
            break;
          case "reloadSelected":
            captureActiveDraft();
            void reloadSelected();
            break;
          case "deleteSelected":
            captureActiveDraft();
            void deleteSelected();
            break;
          case "addAbilityLink":
            captureActiveDraft();
            state.drafts.equipment.abilityLinks.push(createEmptyAbilityLinkDraft());
            state.dirty.equipment = true;
            clearMessages();
            render();
            break;
          case "addItemAbilityLink":
            captureActiveDraft();
            state.drafts.items.abilityLinks.push(createEmptyAbilityLinkDraft());
            state.dirty.items = true;
            clearMessages();
            render();
            break;
          case "addWeaponProfile":
            captureActiveDraft();
            state.drafts.weapons.profiles.push(createEmptyWeaponProfileDraft(state.drafts.weapons.profiles.length));
            state.dirty.weapons = true;
            clearMessages();
            render();
            break;
          case "addAbilityEffectLink":
            captureActiveDraft();
            state.drafts.abilities.effectLinks.push(createEmptyAbilityEffectLinkDraft());
            state.dirty.abilities = true;
            clearMessages();
            render();
            break;
          case "addAbilityLevel":
            captureActiveDraft();
            state.drafts.abilities.levels.push(createEmptyAbilityLevelDraft((state.drafts.abilities.levels?.length ?? 0) + 1));
            state.drafts.abilities = normalizeAbilityEditorDraft(state.drafts.abilities);
            state.dirty.abilities = true;
            state.collapsed.abilitiesLevels = false;
            clearMessages();
            render();
            break;
          case "fillAbilityLevels":
            captureActiveDraft();
            {
              const existingLevels = Array.isArray(state.drafts.abilities.levels) ? state.drafts.abilities.levels : [];
              const nextLevels = [];
              for (let index = 0; index < 5; index += 1) {
                const sourceLevel = existingLevels[index] ?? existingLevels[existingLevels.length - 1] ?? createEmptyAbilityLevelDraft(index + 1);
                nextLevels.push({
                  ...cloneJson(sourceLevel),
                  id: index < existingLevels.length ? String(sourceLevel?.id ?? "") : "",
                  abilityLevel: String(index + 1)
                });
              }
              state.drafts.abilities.levels = nextLevels;
              state.drafts.abilities = normalizeAbilityEditorDraft(state.drafts.abilities);
              state.dirty.abilities = true;
              state.collapsed.abilitiesLevels = false;
              clearMessages();
              render();
            }
            break;
          case "copyAbilityLevelsDown":
            captureActiveDraft();
            {
              const existingLevels = Array.isArray(state.drafts.abilities.levels) && state.drafts.abilities.levels.length ? state.drafts.abilities.levels.map((entry) => ({ ...cloneJson(entry) })) : [createEmptyAbilityLevelDraft(1)];
              const nextLevels = existingLevels.map((entry, index) => {
                if (index === 0) {
                  return {
                    ...cloneJson(entry),
                    abilityLevel: "1"
                  };
                }
                return {
                  ...cloneJson(existingLevels[index - 1]),
                  id: String(entry?.id ?? ""),
                  abilityLevel: String(index + 1)
                };
              });
              state.drafts.abilities.levels = nextLevels;
              state.drafts.abilities = normalizeAbilityEditorDraft(state.drafts.abilities);
              state.dirty.abilities = true;
              state.collapsed.abilitiesLevels = false;
              clearMessages();
              render();
            }
            break;
          case "clearAbilityLevels":
            captureActiveDraft();
            state.drafts.abilities.levels = [createEmptyAbilityLevelDraft(1)];
            state.drafts.abilities = normalizeAbilityEditorDraft(state.drafts.abilities);
            state.dirty.abilities = true;
            state.collapsed.abilitiesLevels = false;
            clearMessages();
            render();
            break;
          case "addModifier":
            captureActiveDraft();
            if (state.activeTab === "effects") {
              state.drafts.effects.modifiers.push(createEmptyModifierDraft());
              state.dirty.effects = true;
              state.collapsed.effectsBehavior = false;
            } else {
              state.drafts.equipment.modifiers.push(createEmptyModifierDraft());
              state.dirty.equipment = true;
              state.collapsed.equipmentDataModifiers = false;
            }
            clearMessages();
            render();
            break;
          case "addFlag":
            captureActiveDraft();
            state.drafts.effects.flags.push(createEmptyFlagDraft());
            state.dirty.effects = true;
            state.collapsed.effectsBehavior = false;
            clearMessages();
            render();
            break;
          default:
            break;
        }
      });
    });
  }
  function applyFiltersFromDom() {
    if (state.activeTab === "weapons") {
      const search = root2.querySelector('[data-creator-filter-search="weapons"]');
      state.filters.weapons.search = String(search?.value ?? "").trim();
    } else if (state.activeTab === "items") {
      const search = root2.querySelector('[data-creator-filter-search="items"]');
      const itemType = root2.querySelector('[data-creator-filter-item-type="items"]');
      state.filters.items.search = String(search?.value ?? "").trim();
      state.filters.items.itemType = String(itemType?.value ?? "").trim();
    } else if (state.activeTab === "calibers") {
      const search = root2.querySelector('[data-creator-filter-search="calibers"]');
      state.filters.calibers.search = String(search?.value ?? "").trim();
    } else if (state.activeTab === "ammo") {
      const search = root2.querySelector('[data-creator-filter-search="ammo"]');
      const caliber = root2.querySelector('[data-creator-filter-caliber="ammo"]');
      state.filters.ammo.search = String(search?.value ?? "").trim();
      state.filters.ammo.caliberId = String(caliber?.value ?? "").trim();
    } else if (state.activeTab === "magazines") {
      const search = root2.querySelector('[data-creator-filter-search="magazines"]');
      const caliber = root2.querySelector('[data-creator-filter-caliber="magazines"]');
      state.filters.magazines.search = String(search?.value ?? "").trim();
      state.filters.magazines.caliberId = String(caliber?.value ?? "").trim();
    } else if (state.activeTab === "skills") {
      const search = root2.querySelector('[data-creator-filter-search="skills"]');
      const category = root2.querySelector('[data-creator-filter-category="skills"]');
      state.filters.skills.search = String(search?.value ?? "").trim();
      state.filters.skills.category = String(category?.value ?? "").trim();
    } else if (state.activeTab === "effects") {
      const search = root2.querySelector('[data-creator-filter-search="effects"]');
      const category = root2.querySelector('[data-creator-filter-category="effects"]');
      state.filters.effects.search = String(search?.value ?? "").trim();
      state.filters.effects.category = String(category?.value ?? "").trim();
    } else if (state.activeTab === "abilities") {
      const search = root2.querySelector('[data-creator-filter-search="abilities"]');
      state.filters.abilities.search = String(search?.value ?? "").trim();
    } else {
      const search = root2.querySelector('[data-creator-filter-search="equipment"]');
      const itemType = root2.querySelector('[data-creator-filter-item-type="equipment"]');
      state.filters.equipment.search = String(search?.value ?? "").trim();
      state.filters.equipment.itemType = String(itemType?.value ?? "").trim();
    }
  }
  async function loadReferenceData(settings) {
    const [referenceResult, itemDefinitions, effectDefinitions] = await Promise.all([
      runtime2.api.creator.getCreatorReferenceData(settings),
      runtime2.bridges.supabase.fetchSupabaseRows(
        "odyssey_item_defs?select=id,code,name,item_type&order=name.asc",
        settings,
        "Unable to load item definition reference data."
      ).catch(() => []),
      runtime2.api.creator.listEffects({ search: null, categories: [] }, settings).catch(() => ({ ok: true, items: [] }))
    ]);
    if (!referenceResult?.ok) {
      throw new Error(formatCreatorError(referenceResult, "Unable to load creator reference data."));
    }
    return {
      ...referenceResult,
      itemDefinitions: Array.isArray(itemDefinitions) ? itemDefinitions : [],
      effects: effectDefinitions?.ok && Array.isArray(effectDefinitions.items) ? effectDefinitions.items : []
    };
  }
  async function ensureReadyForActiveTab({ forceRefs = false } = {}) {
    const access = getAccess();
    if (!access.isGm || !access.configured) {
      return;
    }
    if (state.lastLoadedSettingsKey && state.lastLoadedSettingsKey !== access.settingsKey) {
      resetLoadedData();
    }
    const shouldLoadRefs = forceRefs || !state.references || state.lastLoadedSettingsKey !== access.settingsKey;
    const shouldLoadList = shouldLoadRefs || !state.loadedTabs[state.activeTab];
    if (!shouldLoadRefs && !shouldLoadList) {
      return;
    }
    const requestId = ++state.requestNonce;
    state.loading = true;
    state.loadingLabel = shouldLoadRefs ? "reference data and catalog" : "catalog";
    clearMessages();
    render();
    try {
      if (shouldLoadRefs) {
        state.references = await loadReferenceData(access.settings);
        if (requestId !== state.requestNonce) return;
        state.lastLoadedSettingsKey = access.settingsKey;
      }
      await loadListForTab(state.activeTab, access.settings, requestId);
      if (requestId !== state.requestNonce) return;
      state.loading = false;
      render();
    } catch (error) {
      if (requestId !== state.requestNonce) return;
      state.loading = false;
      state.error = toErrorMessage(error, "Unable to load creator data.");
      onDiagnostic("error", "Creator load failed", state.error);
      render();
    }
  }
  async function loadListForTab(kind, settings, requestId = state.requestNonce) {
    let result = null;
    if (kind === "weapons") {
      const filters = state.filters.weapons;
      result = await runtime2.api.creator.listWeapons(
        {
          search: filters.search || null
        },
        settings
      );
    } else if (kind === "items") {
      const filters = state.filters.items;
      result = await runtime2.api.creator.listItemDefs(
        {
          search: filters.search || null
        },
        settings
      );
    } else if (kind === "calibers") {
      const filters = state.filters.calibers;
      result = await runtime2.api.creator.listCalibers(
        {
          search: filters.search || null
        },
        settings
      );
    } else if (kind === "ammo") {
      const filters = state.filters.ammo;
      result = await runtime2.api.creator.listAmmoTypes(
        {
          search: filters.search || null
        },
        settings
      );
    } else if (kind === "magazines") {
      const filters = state.filters.magazines;
      result = await runtime2.api.creator.listMagazineDefs(
        {
          search: filters.search || null
        },
        settings
      );
    } else if (kind === "skills") {
      const filters = state.filters.skills;
      result = await runtime2.api.creator.listSkills(
        {
          search: filters.search || null,
          categories: getSkillBackendCategoriesForFilter(filters.category)
        },
        settings
      );
    } else if (kind === "effects") {
      const filters = state.filters.effects;
      result = await runtime2.api.creator.listEffects(
        {
          search: filters.search || null,
          categories: filters.category ? [filters.category] : []
        },
        settings
      );
    } else if (kind === "abilities") {
      const filters = state.filters.abilities;
      result = await runtime2.api.creator.listAbilities(
        {
          search: filters.search || null
        },
        settings
      );
    } else {
      const filters = state.filters.equipment;
      result = await runtime2.api.creator.listEquipmentModels(
        {
          search: filters.search || null,
          itemTypes: filters.itemType ? [filters.itemType] : []
        },
        settings
      );
    }
    if (requestId !== state.requestNonce) return;
    if (!result?.ok) {
      throw new Error(formatCreatorError(result, "Unable to load catalog list."));
    }
    state.lists[kind] = kind === "skills" ? (Array.isArray(result.items) ? result.items : []).filter((item) => getAllowedSkillBackendCategories().includes(String(item?.category ?? ""))) : kind === "items" ? (Array.isArray(result.items) ? result.items : []).filter((item) => !state.filters.items.itemType || String(item?.item_type ?? "") === state.filters.items.itemType) : kind === "ammo" ? (Array.isArray(result.items) ? result.items : []).filter((item) => !state.filters.ammo.caliberId || String(item?.caliber_id ?? "") === state.filters.ammo.caliberId) : kind === "magazines" ? (Array.isArray(result.items) ? result.items : []).filter((item) => !state.filters.magazines.caliberId || String(item?.caliber_id ?? "") === state.filters.magazines.caliberId) : kind === "effects" ? Array.isArray(result.items) ? result.items : [] : kind === "abilities" ? Array.isArray(result.items) ? result.items : [] : kind === "equipment" ? (Array.isArray(result.items) ? result.items : []).filter((item) => String(item?.item_type ?? "") !== "device") : Array.isArray(result.items) ? result.items : [];
    state.loadedTabs[kind] = true;
    if (state.selectedIds[kind] && !state.lists[kind].some((item) => item.id === state.selectedIds[kind])) {
      state.selectedIds[kind] = "";
      state.bundles[kind] = null;
      state.drafts[kind] = kind === "weapons" ? createEmptyWeaponDraft() : kind === "items" ? createEmptyItemDraft() : kind === "calibers" ? createEmptyCaliberDraft() : kind === "ammo" ? createEmptyAmmoDraft() : kind === "magazines" ? createEmptyMagazineDraft() : kind === "skills" ? createEmptySkillDraft() : kind === "effects" ? createEmptyEffectDraft() : kind === "abilities" ? createEmptyAbilityDraft() : createEmptyEquipmentDraft();
      state.dirty[kind] = false;
    }
  }
  async function refreshActiveList({ forceRefs = false } = {}) {
    const access = getAccess();
    if (!access.isGm || !access.configured) {
      return;
    }
    const requestId = ++state.requestNonce;
    state.loading = true;
    state.loadingLabel = forceRefs ? "reference data and current list" : "current list";
    clearMessages();
    render();
    try {
      if (forceRefs) {
        state.references = await loadReferenceData(access.settings);
        state.lastLoadedSettingsKey = access.settingsKey;
      }
      await loadListForTab(state.activeTab, access.settings, requestId);
      state.loading = false;
      state.info = `${state.activeTab === "weapons" ? "Weapon" : state.activeTab === "items" ? "Item" : state.activeTab === "calibers" ? "Caliber" : state.activeTab === "ammo" ? "Ammo" : state.activeTab === "magazines" ? "Magazine" : state.activeTab === "skills" ? "Skill" : state.activeTab === "effects" ? "Effect" : state.activeTab === "abilities" ? "Ability" : "Equipment"} catalog refreshed.`;
      render();
    } catch (error) {
      state.loading = false;
      state.error = toErrorMessage(error, "Unable to refresh creator list.");
      onDiagnostic("error", "Creator refresh failed", state.error);
      render();
    }
  }
  async function openRecord(kind, id) {
    const access = getAccess();
    if (!access.isGm || !access.configured) {
      return;
    }
    const requestId = ++state.requestNonce;
    state.loading = true;
    state.loadingLabel = `loading ${kind === "weapons" ? "weapon model" : kind === "items" ? "item definition" : kind === "calibers" ? "caliber" : kind === "ammo" ? "ammo definition" : kind === "magazines" ? "magazine definition" : kind === "skills" ? "skill" : kind === "effects" ? "effect" : kind === "abilities" ? "ability" : "equipment model"}`;
    clearMessages();
    render();
    try {
      const result = kind === "weapons" ? await runtime2.api.creator.getWeapon(id, access.settings) : kind === "items" ? await runtime2.api.creator.getItemDef(id, access.settings) : kind === "skills" ? await runtime2.api.creator.getSkill(id, access.settings) : kind === "calibers" ? await runtime2.api.creator.getCaliber(id, access.settings) : kind === "ammo" ? await runtime2.api.creator.getAmmoType(id, access.settings) : kind === "magazines" ? await runtime2.api.creator.getMagazineDef(id, access.settings) : kind === "effects" ? await runtime2.api.creator.getEffect(id, access.settings) : kind === "abilities" ? await runtime2.api.creator.getAbility(id, access.settings) : await runtime2.api.creator.getEquipmentModel(id, access.settings);
      if (requestId !== state.requestNonce) return;
      if (!result?.ok) {
        throw new Error(formatCreatorError(result, "Unable to load creator record."));
      }
      state.selectedIds[kind] = id;
      state.bundles[kind] = result;
      state.drafts[kind] = kind === "weapons" ? normalizeWeaponDraft(result) : kind === "items" ? normalizeItemDraft(result) : kind === "calibers" ? normalizeCaliberDraft(result) : kind === "ammo" ? normalizeAmmoDraft(result) : kind === "magazines" ? normalizeMagazineDraft(result) : kind === "skills" ? normalizeSkillDraft(result) : kind === "effects" ? normalizeEffectDraft(result) : kind === "abilities" ? normalizeAbilityDraft(result) : normalizeEquipmentDraft(result);
      state.dirty[kind] = false;
      state.loading = false;
      state.info = `${kind === "weapons" ? "Weapon" : kind === "items" ? "Item" : kind === "calibers" ? "Caliber" : kind === "ammo" ? "Ammo" : kind === "magazines" ? "Magazine" : kind === "skills" ? "Skill" : kind === "effects" ? "Effect" : kind === "abilities" ? "Ability" : "Equipment model"} loaded into draft.`;
      render();
    } catch (error) {
      if (requestId !== state.requestNonce) return;
      state.loading = false;
      state.error = toErrorMessage(error, "Unable to open creator record.");
      onDiagnostic("error", "Creator open failed", state.error);
      render();
    }
  }
  function createNewDraft() {
    clearMessages();
    if (state.activeTab === "weapons") {
      state.selectedIds.weapons = "";
      state.bundles.weapons = null;
      state.drafts.weapons = createEmptyWeaponDraft();
      state.dirty.weapons = false;
      state.info = "New weapon draft created.";
    } else if (state.activeTab === "items") {
      state.selectedIds.items = "";
      state.bundles.items = null;
      state.drafts.items = createEmptyItemDraft();
      state.dirty.items = false;
      state.info = "New item draft created.";
    } else if (state.activeTab === "calibers") {
      state.selectedIds.calibers = "";
      state.bundles.calibers = null;
      state.drafts.calibers = createEmptyCaliberDraft();
      state.dirty.calibers = false;
      state.info = "New caliber draft created.";
    } else if (state.activeTab === "ammo") {
      state.selectedIds.ammo = "";
      state.bundles.ammo = null;
      state.drafts.ammo = createEmptyAmmoDraft();
      state.dirty.ammo = false;
      state.info = "New ammo draft created.";
    } else if (state.activeTab === "magazines") {
      state.selectedIds.magazines = "";
      state.bundles.magazines = null;
      state.drafts.magazines = createEmptyMagazineDraft();
      state.dirty.magazines = false;
      state.info = "New magazine draft created.";
    } else if (state.activeTab === "skills") {
      state.selectedIds.skills = "";
      state.bundles.skills = null;
      state.drafts.skills = createEmptySkillDraft();
      state.dirty.skills = false;
      state.info = "New skill draft created.";
    } else if (state.activeTab === "effects") {
      state.selectedIds.effects = "";
      state.bundles.effects = null;
      state.drafts.effects = createEmptyEffectDraft();
      state.dirty.effects = false;
      state.info = "New effect draft created.";
    } else if (state.activeTab === "abilities") {
      state.selectedIds.abilities = "";
      state.bundles.abilities = null;
      state.drafts.abilities = createEmptyAbilityDraft();
      state.dirty.abilities = false;
      state.info = "New ability draft created.";
    } else {
      state.selectedIds.equipment = "";
      state.bundles.equipment = null;
      state.drafts.equipment = createEmptyEquipmentDraft();
      state.dirty.equipment = false;
      state.info = "New equipment draft created.";
    }
    render();
  }
  function duplicateDraft() {
    clearMessages();
    if (state.activeTab === "weapons") {
      state.selectedIds.weapons = "";
      state.bundles.weapons = null;
      state.drafts.weapons = makeWeaponDuplicateDraft(state.drafts.weapons);
      state.dirty.weapons = true;
      state.info = "Weapon draft duplicated as a new record.";
    } else if (state.activeTab === "items") {
      state.selectedIds.items = "";
      state.bundles.items = null;
      state.drafts.items = makeItemDuplicateDraft(state.drafts.items);
      state.dirty.items = true;
      state.info = "Item draft duplicated as a new record.";
    } else if (state.activeTab === "calibers") {
      state.selectedIds.calibers = "";
      state.bundles.calibers = null;
      state.drafts.calibers = makeCaliberDuplicateDraft(state.drafts.calibers);
      state.dirty.calibers = true;
      state.info = "Caliber draft duplicated as a new record.";
    } else if (state.activeTab === "ammo") {
      state.selectedIds.ammo = "";
      state.bundles.ammo = null;
      state.drafts.ammo = makeAmmoDuplicateDraft(state.drafts.ammo);
      state.dirty.ammo = true;
      state.info = "Ammo draft duplicated as a new record.";
    } else if (state.activeTab === "magazines") {
      state.selectedIds.magazines = "";
      state.bundles.magazines = null;
      state.drafts.magazines = makeMagazineDuplicateDraft(state.drafts.magazines);
      state.dirty.magazines = true;
      state.info = "Magazine draft duplicated as a new record.";
    } else if (state.activeTab === "skills") {
      state.selectedIds.skills = "";
      state.bundles.skills = null;
      state.drafts.skills = makeSkillDuplicateDraft(state.drafts.skills);
      state.dirty.skills = true;
      state.info = "Skill draft duplicated as a new record.";
    } else if (state.activeTab === "effects") {
      state.selectedIds.effects = "";
      state.bundles.effects = null;
      state.drafts.effects = makeEffectDuplicateDraft(state.drafts.effects);
      state.dirty.effects = true;
      state.info = "Effect draft duplicated as a new record.";
    } else if (state.activeTab === "abilities") {
      state.selectedIds.abilities = "";
      state.bundles.abilities = null;
      state.drafts.abilities = makeAbilityDuplicateDraft(state.drafts.abilities);
      state.dirty.abilities = true;
      state.info = "Ability draft duplicated as a new record.";
    } else {
      state.selectedIds.equipment = "";
      state.bundles.equipment = null;
      state.drafts.equipment = makeEquipmentDuplicateDraft(state.drafts.equipment);
      state.dirty.equipment = true;
      state.info = "Equipment draft duplicated as a new record.";
    }
    render();
  }
  async function buildSavePayload(kind, draft, settings) {
    if (kind === "weapons") {
      const allWeapons = await runtime2.api.creator.listWeapons({ search: null }, settings);
      if (!allWeapons?.ok) {
        throw new Error(formatCreatorError(allWeapons, "Unable to calculate automatic weapon fields."));
      }
      const list2 = Array.isArray(allWeapons.items) ? allWeapons.items : [];
      const existingCodes2 = list2.filter((item) => item.id !== draft.id).map((item) => item.code);
      const auto2 = {
        code: uniqueGeneratedCode(slugifyName(draft.name), existingCodes2),
        sortOrder: draft.id ? Number.parseInt(String(state.bundles.weapons?.weapon?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list2),
        tags: ["weapon"]
      };
      return buildWeaponPayload(draft, auto2, state.references);
    }
    if (kind === "items") {
      const allItems = await runtime2.api.creator.listItemDefs({ search: null }, settings);
      if (!allItems?.ok) {
        throw new Error(formatCreatorError(allItems, "Unable to calculate automatic item fields."));
      }
      const list2 = Array.isArray(allItems.items) ? allItems.items : [];
      const existingCodes2 = list2.filter((item) => item.id !== draft.id).map((item) => item.code);
      const auto2 = {
        code: uniqueGeneratedCode(slugifyName(draft.name), existingCodes2),
        sortOrder: draft.id ? Number.parseInt(String(state.bundles.items?.item_def?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list2),
        tags: [
          String(draft.itemType ?? "").trim(),
          String(draft.useActionType ?? "").trim() && String(draft.useActionType ?? "").trim() !== "none" ? `use:${String(draft.useActionType ?? "").trim()}` : "",
          draft.isStackable ? "stackable" : "single"
        ].filter(Boolean)
      };
      return buildItemPayload(draft, auto2);
    }
    if (kind === "calibers") {
      const allCalibers = await runtime2.api.creator.listCalibers({ search: null }, settings);
      if (!allCalibers?.ok) {
        throw new Error(formatCreatorError(allCalibers, "Unable to calculate automatic caliber fields."));
      }
      const list2 = Array.isArray(allCalibers.items) ? allCalibers.items : [];
      const existingCodes2 = list2.filter((item) => item.id !== draft.id).map((item) => item.code);
      const auto2 = {
        code: uniqueGeneratedCode(slugifyName(draft.name), existingCodes2),
        sortOrder: draft.id ? Number.parseInt(String(state.bundles.calibers?.caliber?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list2),
        tags: ["caliber"]
      };
      return buildCaliberPayload(draft, auto2);
    }
    if (kind === "ammo") {
      const allAmmo = await runtime2.api.creator.listAmmoTypes({ search: null }, settings);
      if (!allAmmo?.ok) {
        throw new Error(formatCreatorError(allAmmo, "Unable to calculate automatic ammo fields."));
      }
      const list2 = Array.isArray(allAmmo.items) ? allAmmo.items : [];
      const caliberCode = String(
        (Array.isArray(state.references?.calibers) ? state.references.calibers : []).find((entry) => entry.id === draft.caliberId)?.code ?? ""
      ).trim();
      const existingCodes2 = list2.filter((item) => item.id !== draft.id && String(item?.caliber_id ?? "") === String(draft.caliberId ?? "")).map((item) => item.code);
      const auto2 = {
        code: uniqueGeneratedCode(caliberCode ? `${slugifyName(draft.name)}_${caliberCode}` : slugifyName(draft.name), existingCodes2),
        sortOrder: draft.id ? Number.parseInt(String(state.bundles.ammo?.ammo_type?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list2),
        tags: ["ammo", caliberCode ? `caliber:${caliberCode}` : ""].filter(Boolean)
      };
      return buildAmmoPayload(draft, auto2);
    }
    if (kind === "magazines") {
      const allMagazines = await runtime2.api.creator.listMagazineDefs({ search: null }, settings);
      if (!allMagazines?.ok) {
        throw new Error(formatCreatorError(allMagazines, "Unable to calculate automatic magazine fields."));
      }
      const list2 = Array.isArray(allMagazines.items) ? allMagazines.items : [];
      const caliberCode = String(
        (Array.isArray(state.references?.calibers) ? state.references.calibers : []).find((entry) => entry.id === draft.caliberId)?.code ?? ""
      ).trim();
      const existingCodes2 = list2.filter((item) => item.id !== draft.id).map((item) => item.code);
      const auto2 = {
        code: uniqueGeneratedCode(caliberCode ? `${slugifyName(draft.name)}_${caliberCode}` : slugifyName(draft.name), existingCodes2),
        sortOrder: draft.id ? Number.parseInt(String(state.bundles.magazines?.magazine_def?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list2),
        tags: ["magazine", caliberCode ? `caliber:${caliberCode}` : ""].filter(Boolean)
      };
      return buildMagazinePayload(draft, auto2);
    }
    if (kind === "skills") {
      const allSkills = await runtime2.api.creator.listSkills({ search: null, categories: [] }, settings);
      if (!allSkills?.ok) {
        throw new Error(formatCreatorError(allSkills, "Unable to calculate automatic skill fields."));
      }
      const referenceScope = state.references ?? {};
      const list2 = Array.isArray(allSkills.items) ? allSkills.items : [];
      const existingCodes2 = list2.filter((item) => item.id !== draft.id).map((item) => item.code);
      const auto2 = {
        code: uniqueGeneratedCode(slugifyName(draft.name), existingCodes2),
        sortOrder: draft.id ? Number.parseInt(String(state.bundles.skills?.skill?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list2),
        tags: buildSkillAutoTags(draft, referenceScope)
      };
      return buildSkillPayload(draft, auto2);
    }
    if (kind === "effects") {
      const allEffects = await runtime2.api.creator.listEffects({ search: null, categories: [] }, settings);
      if (!allEffects?.ok) {
        throw new Error(formatCreatorError(allEffects, "Unable to calculate automatic effect fields."));
      }
      const list2 = Array.isArray(allEffects.items) ? allEffects.items : [];
      const existingCodes2 = list2.filter((item) => item.id !== draft.id).map((item) => item.code);
      const auto2 = {
        code: uniqueGeneratedCode(slugifyName(draft.name), existingCodes2),
        sortOrder: draft.id ? Number.parseInt(String(state.bundles.effects?.effect?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list2),
        tags: buildEffectAutoTags(draft)
      };
      return buildEffectPayload(draft, auto2);
    }
    if (kind === "abilities") {
      const allAbilities = await runtime2.api.creator.listAbilities({ search: null }, settings);
      if (!allAbilities?.ok) {
        throw new Error(formatCreatorError(allAbilities, "Unable to calculate automatic ability fields."));
      }
      const list2 = Array.isArray(allAbilities.items) ? allAbilities.items : [];
      const existingCodes2 = list2.filter((item) => item.id !== draft.id).map((item) => item.code);
      const auto2 = {
        code: uniqueGeneratedCode(slugifyName(draft.name), existingCodes2),
        sortOrder: draft.id ? Number.parseInt(String(state.bundles.abilities?.ability?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list2),
        tags: buildAbilityAutoTags(draft)
      };
      return buildAbilityPayload(draft, auto2);
    }
    const allEquipment = await runtime2.api.creator.listEquipmentModels({ search: null, itemTypes: [] }, settings);
    if (!allEquipment?.ok) {
      throw new Error(formatCreatorError(allEquipment, "Unable to calculate automatic equipment fields."));
    }
    const list = Array.isArray(allEquipment.items) ? allEquipment.items : [];
    const existingCodes = list.filter((item) => item.id !== draft.id).map((item) => item.code);
    const auto = {
      code: uniqueGeneratedCode(slugifyName(draft.name), existingCodes),
      sortOrder: draft.id ? Number.parseInt(String(state.bundles.equipment?.equipment_model?.sort_order ?? 0), 10) || 0 : nextFreeSortOrder(list),
      tags: buildEquipmentAutoTags(draft)
    };
    return buildEquipmentPayload(draft, auto);
  }
  async function saveDraft() {
    const access = getAccess();
    if (!access.isGm || !access.configured) {
      return;
    }
    clearMessages();
    state.loading = true;
    state.loadingLabel = "saving draft";
    render();
    try {
      const draft = state.activeTab === "weapons" ? state.drafts.weapons : state.activeTab === "items" ? state.drafts.items : state.activeTab === "skills" ? state.drafts.skills : state.activeTab === "calibers" ? state.drafts.calibers : state.activeTab === "ammo" ? state.drafts.ammo : state.activeTab === "magazines" ? state.drafts.magazines : state.activeTab === "effects" ? state.drafts.effects : state.activeTab === "abilities" ? state.drafts.abilities : state.drafts.equipment;
      const payload = await buildSavePayload(state.activeTab, draft, access.settings);
      const result = state.activeTab === "weapons" ? await runtime2.api.creator.upsertWeapon(payload, access.settings) : state.activeTab === "items" ? await runtime2.api.creator.upsertItemDef(payload, access.settings) : state.activeTab === "calibers" ? await runtime2.api.creator.upsertCaliber(payload, access.settings) : state.activeTab === "ammo" ? await runtime2.api.creator.upsertAmmoType(payload, access.settings) : state.activeTab === "magazines" ? await runtime2.api.creator.upsertMagazineDef(payload, access.settings) : state.activeTab === "skills" ? await runtime2.api.creator.upsertSkill(payload, access.settings) : state.activeTab === "effects" ? await runtime2.api.creator.upsertEffect(payload, access.settings) : state.activeTab === "abilities" ? await runtime2.api.creator.upsertAbility(payload, access.settings) : await runtime2.api.creator.upsertEquipmentModel(payload, access.settings);
      if (!result?.ok) {
        throw new Error(formatCreatorError(result, "Unable to save draft."));
      }
      const bundle = extractEntityBundle(result);
      if (!bundle?.ok) {
        throw new Error("Save succeeded but the returned entity bundle was incomplete.");
      }
      if (state.activeTab === "weapons") {
        state.selectedIds.weapons = String(result.entity_id ?? "");
        state.bundles.weapons = bundle;
        state.drafts.weapons = normalizeWeaponDraft(bundle);
        state.dirty.weapons = false;
      } else if (state.activeTab === "items") {
        state.selectedIds.items = String(result.entity_id ?? "");
        state.bundles.items = bundle;
        state.drafts.items = normalizeItemDraft(bundle);
        state.dirty.items = false;
      } else if (state.activeTab === "calibers") {
        state.selectedIds.calibers = String(result.entity_id ?? "");
        state.bundles.calibers = bundle;
        state.drafts.calibers = normalizeCaliberDraft(bundle);
        state.dirty.calibers = false;
      } else if (state.activeTab === "ammo") {
        state.selectedIds.ammo = String(result.entity_id ?? "");
        state.bundles.ammo = bundle;
        state.drafts.ammo = normalizeAmmoDraft(bundle);
        state.dirty.ammo = false;
      } else if (state.activeTab === "magazines") {
        state.selectedIds.magazines = String(result.entity_id ?? "");
        state.bundles.magazines = bundle;
        state.drafts.magazines = normalizeMagazineDraft(bundle);
        state.dirty.magazines = false;
      } else if (state.activeTab === "skills") {
        state.selectedIds.skills = String(result.entity_id ?? "");
        state.bundles.skills = bundle;
        state.drafts.skills = normalizeSkillDraft(bundle);
        state.dirty.skills = false;
      } else if (state.activeTab === "effects") {
        state.selectedIds.effects = String(result.entity_id ?? "");
        state.bundles.effects = bundle;
        state.drafts.effects = normalizeEffectDraft(bundle);
        state.dirty.effects = false;
      } else if (state.activeTab === "abilities") {
        state.selectedIds.abilities = String(result.entity_id ?? "");
        state.bundles.abilities = bundle;
        state.drafts.abilities = normalizeAbilityDraft(bundle);
        state.dirty.abilities = false;
      } else {
        state.selectedIds.equipment = String(result.entity_id ?? "");
        state.bundles.equipment = bundle;
        state.drafts.equipment = normalizeEquipmentDraft(bundle);
        state.dirty.equipment = false;
      }
      await loadListForTab(state.activeTab, access.settings);
      state.loading = false;
      state.info = `${state.activeTab === "weapons" ? "Weapon" : state.activeTab === "items" ? "Item" : state.activeTab === "calibers" ? "Caliber" : state.activeTab === "ammo" ? "Ammo" : state.activeTab === "magazines" ? "Magazine" : state.activeTab === "skills" ? "Skill" : state.activeTab === "effects" ? "Effect" : state.activeTab === "abilities" ? "Ability" : "Equipment model"} saved to Supabase.`;
      onDiagnostic("info", "Creator save complete", state.info);
      render();
    } catch (error) {
      state.loading = false;
      state.error = toErrorMessage(error, "Unable to save draft.");
      onDiagnostic("error", "Creator save failed", state.error);
      render();
    }
  }
  async function reloadSelected() {
    const id = state.selectedIds[state.activeTab];
    if (!id) {
      return;
    }
    await openRecord(state.activeTab, id);
  }
  async function deleteSelected() {
    const access = getAccess();
    const id = state.selectedIds[state.activeTab];
    if (!access.isGm || !access.configured || !id) {
      return;
    }
    const label = state.activeTab === "weapons" ? "weapon model" : state.activeTab === "items" ? "item definition" : state.activeTab === "calibers" ? "caliber" : state.activeTab === "ammo" ? "ammo definition" : state.activeTab === "magazines" ? "magazine definition" : state.activeTab === "skills" ? "skill" : state.activeTab === "effects" ? "effect" : state.activeTab === "abilities" ? "ability" : "equipment model";
    if (!globalThis.confirm(`Delete this ${label} definition from the catalog?`)) {
      return;
    }
    clearMessages();
    state.loading = true;
    state.loadingLabel = `deleting ${label}`;
    render();
    try {
      const result = state.activeTab === "weapons" ? await runtime2.api.creator.deleteWeapon(id, access.settings) : state.activeTab === "items" ? await runtime2.api.creator.deleteItemDef(id, access.settings) : state.activeTab === "calibers" ? await runtime2.api.creator.deleteCaliber(id, access.settings) : state.activeTab === "ammo" ? await runtime2.api.creator.deleteAmmoType(id, access.settings) : state.activeTab === "magazines" ? await runtime2.api.creator.deleteMagazineDef(id, access.settings) : state.activeTab === "skills" ? await runtime2.api.creator.deleteSkill(id, access.settings) : state.activeTab === "effects" ? await runtime2.api.creator.deleteEffect(id, access.settings) : state.activeTab === "abilities" ? await runtime2.api.creator.deleteAbility(id, access.settings) : await runtime2.api.creator.deleteEquipmentModel(id, access.settings);
      if (!result?.ok) {
        throw new Error(formatCreatorError(result, `Unable to delete ${label}.`));
      }
      if (state.activeTab === "weapons") {
        state.selectedIds.weapons = "";
        state.bundles.weapons = null;
        state.drafts.weapons = createEmptyWeaponDraft();
        state.dirty.weapons = false;
      } else if (state.activeTab === "items") {
        state.selectedIds.items = "";
        state.bundles.items = null;
        state.drafts.items = createEmptyItemDraft();
        state.dirty.items = false;
      } else if (state.activeTab === "calibers") {
        state.selectedIds.calibers = "";
        state.bundles.calibers = null;
        state.drafts.calibers = createEmptyCaliberDraft();
        state.dirty.calibers = false;
      } else if (state.activeTab === "ammo") {
        state.selectedIds.ammo = "";
        state.bundles.ammo = null;
        state.drafts.ammo = createEmptyAmmoDraft();
        state.dirty.ammo = false;
      } else if (state.activeTab === "magazines") {
        state.selectedIds.magazines = "";
        state.bundles.magazines = null;
        state.drafts.magazines = createEmptyMagazineDraft();
        state.dirty.magazines = false;
      } else if (state.activeTab === "skills") {
        state.selectedIds.skills = "";
        state.bundles.skills = null;
        state.drafts.skills = createEmptySkillDraft();
        state.dirty.skills = false;
      } else if (state.activeTab === "effects") {
        state.selectedIds.effects = "";
        state.bundles.effects = null;
        state.drafts.effects = createEmptyEffectDraft();
        state.dirty.effects = false;
      } else if (state.activeTab === "abilities") {
        state.selectedIds.abilities = "";
        state.bundles.abilities = null;
        state.drafts.abilities = createEmptyAbilityDraft();
        state.dirty.abilities = false;
      } else {
        state.selectedIds.equipment = "";
        state.bundles.equipment = null;
        state.drafts.equipment = createEmptyEquipmentDraft();
        state.dirty.equipment = false;
      }
      await loadListForTab(state.activeTab, access.settings);
      state.loading = false;
      state.info = `${label[0].toUpperCase()}${label.slice(1)} deleted from the catalog.`;
      onDiagnostic("info", "Creator delete complete", state.info);
      render();
    } catch (error) {
      state.loading = false;
      state.error = toErrorMessage(error, `Unable to delete ${label}.`);
      onDiagnostic("error", "Creator delete failed", state.error);
      render();
    }
  }
  const controller = {
    syncAccess() {
      const access = getAccess();
      if (state.lastLoadedSettingsKey && state.lastLoadedSettingsKey !== access.settingsKey) {
        resetLoadedData();
      }
      render();
      void ensureReadyForActiveTab();
    },
    refresh() {
      render();
      void ensureReadyForActiveTab({ forceRefs: true });
    }
  };
  render();
  void ensureReadyForActiveTab();
  return controller;
}

// bridge/tokenBridge.js
var tokenBridge_exports = {};
__export(tokenBridge_exports, {
  clearTokenCharacterLink: () => clearTokenCharacterLink,
  getSelectedTokenCharacterLinks: () => getSelectedTokenCharacterLinks,
  getTokenCharacterLink: () => getTokenCharacterLink,
  setTokenCharacterLink: () => setTokenCharacterLink
});
function resolveTokenId(tokenOrId) {
  if (typeof tokenOrId === "string") {
    return tokenOrId.trim();
  }
  return String(tokenOrId?.id ?? "").trim();
}
function getTokenCharacterLink(token) {
  return normalizeTokenCharacterLink(token?.metadata?.[TOKEN_LINK_KEY]);
}
async function setTokenCharacterLink(tokenOrId, characterId, fields = {}) {
  await waitForObrReady();
  const tokenId = resolveTokenId(tokenOrId);
  const normalized = normalizeTokenCharacterLink({
    characterId,
    ...fields,
    updatedAt: fields.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString()
  });
  await lib_default.scene.items.updateItems([tokenId], (items) => {
    for (const item of items) {
      item.metadata ?? (item.metadata = {});
      item.metadata[TOKEN_LINK_KEY] = normalized;
    }
  });
  return normalized;
}
async function clearTokenCharacterLink(tokenOrId) {
  await waitForObrReady();
  const tokenId = resolveTokenId(tokenOrId);
  await lib_default.scene.items.updateItems([tokenId], (items) => {
    for (const item of items) {
      item.metadata ?? (item.metadata = {});
      delete item.metadata[TOKEN_LINK_KEY];
    }
  });
}
async function getSelectedTokenCharacterLinks() {
  const tokens = await getSelectedOwlbearTokens();
  return tokens.map((token) => ({
    token,
    link: getTokenCharacterLink(token)
  }));
}

// bridge/supabaseBridge.js
var supabaseBridge_exports = {};
__export(supabaseBridge_exports, {
  callSupabaseRpc: () => callSupabaseRpc,
  deactivateTokenLinkRecord: () => deactivateTokenLinkRecord,
  fetchSupabaseRows: () => fetchSupabaseRows,
  fetchTokenLinks: () => fetchTokenLinks,
  mutateSupabaseRows: () => mutateSupabaseRows,
  testSupabaseConnection: () => testSupabaseConnection,
  upsertTokenLinkRecord: () => upsertTokenLinkRecord
});
function getSupabaseSettingsOrThrow(settings) {
  const normalized = normalizeSupabaseSettings(settings);
  if (!normalized.url) {
    throw new Error("Supabase URL is not configured.");
  }
  if (!normalized.apiKey) {
    throw new Error("Supabase public key is not configured.");
  }
  return normalized;
}
function buildHeaders(apiKey, method, extraHeaders = {}, prefer = "return=representation") {
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    ...extraHeaders
  };
  if (method !== "GET" && method !== "HEAD" && prefer) {
    headers.Prefer = prefer;
  }
  return headers;
}
async function parseSupabaseResponse(response, fallbackMessage) {
  const rawText = await response.text();
  const body = safeJsonParse(rawText, rawText || null);
  if (!response.ok) {
    throw new Error(
      toErrorMessage(body, fallbackMessage || "Supabase request failed.")
    );
  }
  return body;
}
async function requestSupabase(path, options = {}) {
  const {
    method = "GET",
    body,
    settings,
    headers = {},
    prefer = "return=representation",
    fallbackMessage = "Supabase request failed."
  } = options;
  const { url, apiKey } = getSupabaseSettingsOrThrow(settings);
  const requestInit = {
    method,
    headers: buildHeaders(apiKey, method, headers, prefer)
  };
  if (body !== void 0) {
    requestInit.body = JSON.stringify(body);
    requestInit.headers["Content-Type"] = "application/json";
  }
  try {
    const response = await fetch(`${url}/rest/v1/${path}`, requestInit);
    return await parseSupabaseResponse(response, fallbackMessage);
  } catch (error) {
    addDiagnosticEntry(
      "error",
      "Supabase request failed",
      `${method} ${path}: ${toErrorMessage(error)}`
    );
    throw error;
  }
}
async function callSupabaseRpc(functionName, payload, settings) {
  return requestSupabase(`rpc/${functionName}`, {
    method: "POST",
    body: payload ?? {},
    settings,
    fallbackMessage: `Supabase RPC ${functionName} failed.`
  });
}
async function fetchSupabaseRows(path, settings, fallbackMessage = "Supabase query failed.") {
  return requestSupabase(path, {
    method: "GET",
    settings,
    fallbackMessage
  });
}
async function mutateSupabaseRows(path, body, settings, options = {}) {
  return requestSupabase(path, {
    method: options.method ?? "POST",
    body,
    settings,
    prefer: options.prefer ?? "return=representation",
    fallbackMessage: options.fallbackMessage ?? "Supabase mutation failed.",
    headers: options.headers ?? {}
  });
}
async function testSupabaseConnection(settings) {
  const rows = await fetchSupabaseRows(
    "odyssey_characters?select=id&limit=1",
    settings,
    "Unable to query Supabase connection test."
  );
  return {
    ok: true,
    sampleRowCount: Array.isArray(rows) ? rows.length : 0
  };
}
async function fetchTokenLinks(roomId, sceneId = "", settings) {
  const params = [
    "select=*",
    `room_id=eq.${encodeURIComponent(String(roomId ?? "").trim())}`,
    `scene_id=eq.${encodeURIComponent(String(sceneId ?? "").trim())}`,
    "is_active=eq.true"
  ].join("&");
  const rows = await fetchSupabaseRows(
    `odyssey_token_links?${params}`,
    settings,
    "Unable to load token links from Supabase."
  );
  return Array.isArray(rows) ? rows : [];
}
async function upsertTokenLinkRecord(payload, settings) {
  const row = {
    campaign_id: String(payload?.campaign_id ?? "").trim(),
    room_id: String(payload?.room_id ?? "").trim(),
    scene_id: String(payload?.scene_id ?? "").trim(),
    token_id: String(payload?.token_id ?? "").trim(),
    character_id: String(payload?.character_id ?? "").trim(),
    character_key: String(payload?.character_key ?? "").trim(),
    token_name: String(payload?.token_name ?? "").trim(),
    token_layer: String(payload?.token_layer ?? "CHARACTER").trim(),
    is_active: payload?.is_active !== false,
    last_seen_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const rows = await mutateSupabaseRows(
    "odyssey_token_links?on_conflict=room_id,scene_id,token_id",
    [row],
    settings,
    {
      prefer: "resolution=merge-duplicates,return=representation",
      fallbackMessage: "Unable to upsert token link in Supabase."
    }
  );
  return Array.isArray(rows) ? rows[0] ?? null : rows;
}
async function deactivateTokenLinkRecord(roomId, sceneId, tokenId, settings) {
  return mutateSupabaseRows(
    `odyssey_token_links?room_id=eq.${encodeURIComponent(String(roomId ?? "").trim())}&scene_id=eq.${encodeURIComponent(String(sceneId ?? "").trim())}&token_id=eq.${encodeURIComponent(String(tokenId ?? "").trim())}`,
    {
      is_active: false,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    },
    settings,
    {
      method: "PATCH",
      fallbackMessage: "Unable to deactivate token link in Supabase."
    }
  );
}

// shell/appShell.js
function describeRole(role) {
  return role === "GM" ? "GM" : "Player";
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
    ["Supabase Key", settings.apiKey ? maskSupabaseApiKey(settings.apiKey) : "Missing"]
  ];
}
function buildSelectedTokenRows(tokens) {
  if (!tokens.length) {
    return '<div class="list-item"><div class="list-item-title">No tokens selected.</div><div class="muted">Select tokens on the Owlbear scene to inspect their minimal metadata links.</div></div>';
  }
  return tokens.map((token) => {
    const link = getTokenCharacterLink(token);
    const title = token?.name ? String(token.name) : `Token ${String(token?.id ?? "").slice(0, 8)}`;
    const details2 = [
      `id: ${String(token?.id ?? "").trim() || "unknown"}`,
      `character_id: ${link.characterId || "not linked"}`,
      `state_version: ${link.stateVersion}`,
      `status_summary: ${link.statusSummary || "none"}`
    ];
    return `
        <div class="list-item">
          <div class="list-item-title">${escapeHtml(title)}</div>
          <div class="muted">${escapeHtml(details2.join(" | "))}</div>
        </div>
      `;
  }).join("");
}
function buildModuleRows(runtime2) {
  const sections = [
    ["Bridges", Object.keys(runtime2.bridges ?? {})],
    ["APIs", Object.keys(runtime2.api ?? {})],
    ["Constants", Object.keys(runtime2.constants ?? {})]
  ];
  return sections.map(([label, values]) => `
      <div class="list-item">
        <div class="list-item-title">${escapeHtml(label)}</div>
        <div class="muted">${escapeHtml((values ?? []).join(", ") || "None")}</div>
      </div>
    `).join("");
}
function buildDiagnosticsRows(entries2) {
  if (!entries2.length) {
    return '<div class="list-item"><div class="muted">No diagnostics yet.</div></div>';
  }
  return entries2.map((entry) => `
      <div class="list-item">
        <div class="list-item-title">${escapeHtml(entry.title)}</div>
        <div class="muted">${escapeHtml(entry.level.toUpperCase())} | ${escapeHtml(formatTimestamp(entry.createdAt))}</div>
        ${entry.details ? `<pre>${escapeHtml(entry.details)}</pre>` : ""}
      </div>
    `).join("");
}
async function mountBridgeShell({
  root: root2,
  title,
  subtitle,
  runtime: runtime2,
  globalName = "OdysseyBridge",
  features = {},
  tokenRealtimeSync = null
}) {
  if (!(root2 instanceof HTMLElement)) {
    throw new Error("Shell root element is missing.");
  }
  await waitForObrReady();
  root2.innerHTML = createShellMarkup(title, subtitle);
  const refs = {
    owlbearStatus: root2.querySelector('[data-field="owlbearStatus"]'),
    playerRole: root2.querySelector('[data-field="playerRole"]'),
    supabaseStatus: root2.querySelector('[data-field="supabaseStatus"]'),
    bridgeStatus: root2.querySelector('[data-field="bridgeStatus"]'),
    supabaseUrl: root2.querySelector('[data-field="supabaseUrl"]'),
    supabaseKey: root2.querySelector('[data-field="supabaseKey"]'),
    connectionHint: root2.querySelector('[data-field="connectionHint"]'),
    contextList: root2.querySelector('[data-field="contextList"]'),
    selectedTokens: root2.querySelector('[data-field="selectedTokens"]'),
    moduleList: root2.querySelector('[data-field="moduleList"]'),
    diagnostics: root2.querySelector('[data-field="diagnostics"]'),
    creatorHost: root2.querySelector('[data-field="creatorHost"]')
  };
  const buttons = {
    saveSettings: root2.querySelector('[data-action="saveSettings"]'),
    clearSettings: root2.querySelector('[data-action="clearSettings"]'),
    testConnection: root2.querySelector('[data-action="testConnection"]'),
    refreshShell: root2.querySelector('[data-action="refreshShell"]'),
    clearDiagnostics: root2.querySelector('[data-action="clearDiagnostics"]')
  };
  const state = {
    ready: true,
    player: await getPlayerInfo(),
    roomContext: await getRoomSceneContext(),
    settings: await loadRoomSupabaseSettings(),
    selectedTokens: await getSelectedOwlbearTokens(),
    connectionTest: null
  };
  const creatorController = features?.creatorTools && refs.creatorHost instanceof HTMLElement ? mountCreatorMenu({
    root: refs.creatorHost,
    runtime: runtime2,
    getPlayer: () => state.player,
    getSettings: () => state.settings,
    onDiagnostic: (level, titleText, details2) => addDiagnosticEntry(level, titleText, details2)
  }) : null;
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
    refs.connectionHint.textContent = configured ? `Room settings are configured. ${canManageRoomSettings ? "GM can update them here." : "Only GM can modify them."}` : `Room settings are missing. ${canManageRoomSettings ? "Enter URL and key, then save them to room metadata." : "Ask the GM to configure them."}`;
    refs.contextList.innerHTML = buildContextRows(state).map(
      ([label, value]) => `
          <div class="list-item compact">
            <div class="list-item-title">${escapeHtml(label)}</div>
            <div class="muted">${escapeHtml(value)}</div>
          </div>
        `
    ).join("");
    refs.selectedTokens.innerHTML = buildSelectedTokenRows(state.selectedTokens);
    refs.moduleList.innerHTML = buildModuleRows(runtime2);
    buttons.saveSettings.disabled = !canManageRoomSettings;
    buttons.clearSettings.disabled = !canManageRoomSettings;
    refs.supabaseUrl.disabled = !canManageRoomSettings;
    refs.supabaseKey.disabled = !canManageRoomSettings;
  }
  const unsubscribeDiagnostics = subscribeDiagnostics((entries2) => {
    refs.diagnostics.innerHTML = buildDiagnosticsRows(entries2);
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
        apiKey: refs.supabaseKey.value
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
      apiKey: refs.supabaseKey.value
    });
    try {
      const result = await testSupabaseConnection(draft);
      state.connectionTest = result;
      addDiagnosticEntry(
        "info",
        "Supabase connection test passed",
        `Sample rows returned: ${result.sampleRowCount}`
      );
      render();
    } catch (error) {
      state.connectionTest = {
        ok: false,
        message: toErrorMessage(error, "Supabase connection test failed.")
      };
      addDiagnosticEntry(
        "error",
        "Supabase connection test failed",
        state.connectionTest.message
      );
      render();
    }
  });
  buttons.refreshShell.addEventListener("click", () => {
    void refreshSnapshot().then(() => {
      addDiagnosticEntry("info", "Shell status refreshed");
    }).catch((error) => {
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
  globalThis[globalName] = runtime2;
  addDiagnosticEntry(
    "info",
    `${title} ready`,
    `Bridge shell loaded. Global runtime is available as window.${globalName}.`
  );
  return () => {
    unsubscribeDiagnostics();
  };
}

// constants/rpcNames.js
var CHARACTER_RPC_NAMES = Object.freeze({
  getCharacterRuleSheet: "get_character_rule_sheet",
  initializeCharacterRuleDefaults: "initialize_character_rule_defaults",
  initializeCharacterCombatDefaults: "initialize_character_combat_defaults",
  getCharacterSpawnCatalog: "get_character_spawn_catalog",
  getRoomTokenLinks: "get_room_token_links",
  deactivateTokenLink: "deactivate_token_link",
  loadCharacterToToken: "load_character_to_token"
});
var CHECK_RPC_NAMES = Object.freeze({
  rollCharacteristic: "roll_characteristic",
  rollSkill: "roll_skill",
  rollDice: "roll_dice"
});
var ABILITY_RPC_NAMES = Object.freeze({
  getCharacterAbilities: "get_character_abilities",
  syncCharacterResourcePools: "odyssey_sync_character_resource_pools",
  useAbility: "use_ability",
  advanceCharacterAbilityStates: "advance_character_ability_states"
});
var FEATURE_RPC_NAMES = Object.freeze({
  reloadFeatureResource: "reload_feature_resource"
});
var WEAPON_RPC_NAMES = Object.freeze({
  getCharacterArmory: "get_character_armory",
  switchWeaponProfile: "switch_weapon_profile",
  switchWeaponFireMode: "switch_weapon_fire_mode",
  loadWeaponProfileMagazine: "load_weapon_profile_magazine",
  activateWeaponFeature: "activate_weapon_feature",
  deactivateWeaponFeature: "deactivate_weapon_feature",
  getCharacterWeaponFeatures: "get_character_weapon_features"
});
var COMBAT_RPC_NAMES = Object.freeze({
  performAttack: "perform_attack"
});
var GM_RPC_NAMES = Object.freeze({
  healCharacter: "gm_heal_character",
  repairCharacterArmor: "gm_repair_character_armor",
  updateCharacterAttribute: "gm_update_character_attribute"
});
var EFFECT_RPC_NAMES = Object.freeze({
  getCharacterEffectSummary: "get_character_effect_summary",
  getEffectiveCharacterStats: "get_effective_character_stats",
  addCharacterEffect: "add_character_effect",
  removeCharacterEffect: "remove_character_effect",
  advanceCharacterEffects: "advance_character_effects"
});
var EQUIPMENT_RPC_NAMES = Object.freeze({
  getCharacterArmorSummary: "get_character_armor_summary",
  getCharacterEquipment: "get_character_equipment",
  recomputeCharacterArmor: "recompute_character_armor",
  createCharacterEquipmentItem: "create_character_equipment_item",
  equipCharacterEquipmentItem: "equip_character_equipment_item",
  unequipCharacterEquipmentItem: "unequip_character_equipment_item",
  updateCharacterEquipmentItem: "update_character_equipment_item"
});
var INVENTORY_RPC_NAMES = Object.freeze({
  getCharacterInventory: "get_character_inventory",
  addCharacterItem: "add_character_item",
  removeCharacterItemQuantity: "remove_character_item_quantity",
  getCharacterItemQuantity: "get_character_item_quantity",
  addCharacterAmmoStock: "add_character_ammo_stock",
  removeCharacterAmmoStock: "remove_character_ammo_stock",
  loadRoundsToMagazine: "load_rounds_to_magazine",
  unloadRoundsFromMagazine: "unload_rounds_from_magazine",
  useCharacterItem: "use_character_item"
});
var CHARACTER_PLACEMENT_RPC_NAMES = Object.freeze({
  getCharacterSpawnCatalog: "get_character_spawn_catalog",
  getCharacterRuntimeBundle: "get_character_runtime_bundle",
  getSceneTokenLinks: "get_scene_token_links",
  loadCharacterToToken: "load_character_to_token",
  unbindTokenCharacter: "unbind_token_character",
  purgeActiveNpcs: "purge_active_npcs"
});
var CREATOR_RPC_NAMES = Object.freeze({
  getCreatorReferenceData: "get_creator_reference_data",
  listWeapons: "creator_list_weapons",
  getWeapon: "creator_get_weapon",
  upsertWeapon: "creator_upsert_weapon",
  deleteWeapon: "creator_delete_weapon",
  listItemDefs: "creator_list_item_defs",
  getItemDef: "creator_get_item_def",
  upsertItemDef: "creator_upsert_item_def",
  deleteItemDef: "creator_delete_item_def",
  listCalibers: "creator_list_calibers",
  getCaliber: "creator_get_caliber",
  upsertCaliber: "creator_upsert_caliber",
  deleteCaliber: "creator_delete_caliber",
  listAmmoTypes: "creator_list_ammo_types",
  getAmmoType: "creator_get_ammo_type",
  upsertAmmoType: "creator_upsert_ammo_type",
  deleteAmmoType: "creator_delete_ammo_type",
  listMagazineDefs: "creator_list_magazine_defs",
  getMagazineDef: "creator_get_magazine_def",
  upsertMagazineDef: "creator_upsert_magazine_def",
  deleteMagazineDef: "creator_delete_magazine_def",
  listSkills: "creator_list_skills",
  getSkill: "creator_get_skill",
  upsertSkill: "creator_upsert_skill",
  deleteSkill: "creator_delete_skill",
  listEffects: "creator_list_effects",
  getEffect: "creator_get_effect",
  upsertEffect: "creator_upsert_effect",
  deleteEffect: "creator_delete_effect",
  listAbilities: "creator_list_abilities",
  getAbility: "creator_get_ability",
  upsertAbility: "creator_upsert_ability",
  deleteAbility: "creator_delete_ability",
  listEquipmentModels: "creator_list_equipment_models",
  getEquipmentModel: "creator_get_equipment_model",
  upsertEquipmentModel: "creator_upsert_equipment_model",
  deleteEquipmentModel: "creator_delete_equipment_model"
});

// api/abilityApi.js
var abilityApi_exports = {};
__export(abilityApi_exports, {
  advanceCharacterAbilityStates: () => advanceCharacterAbilityStates,
  getCharacterAbilities: () => getCharacterAbilities,
  syncCharacterResourcePools: () => syncCharacterResourcePools,
  useAbility: () => useAbility
});
function getCharacterAbilities(characterId, settings) {
  return callSupabaseRpc(
    ABILITY_RPC_NAMES.getCharacterAbilities,
    { p_character_id: characterId },
    settings
  );
}
function syncCharacterResourcePools(characterId, settings) {
  return callSupabaseRpc(
    ABILITY_RPC_NAMES.syncCharacterResourcePools,
    { p_character_id: characterId },
    settings
  );
}
function useAbility(payload, settings) {
  return callSupabaseRpc(
    ABILITY_RPC_NAMES.useAbility,
    { p_payload: payload },
    settings
  );
}
function advanceCharacterAbilityStates(characterId, settings) {
  return callSupabaseRpc(
    ABILITY_RPC_NAMES.advanceCharacterAbilityStates,
    { p_character_id: characterId },
    settings
  );
}

// api/characterApi.js
var characterApi_exports = {};
__export(characterApi_exports, {
  deactivateTokenLink: () => deactivateTokenLink,
  getCharacterRuleSheet: () => getCharacterRuleSheet,
  getRoomTokenLinks: () => getRoomTokenLinks,
  initializeCharacterCombatDefaults: () => initializeCharacterCombatDefaults,
  initializeCharacterRuleDefaults: () => initializeCharacterRuleDefaults,
  listCharacters: () => listCharacters,
  loadCharacterToToken: () => loadCharacterToToken
});
function getCharacterRuleSheet(characterId, settings) {
  return callSupabaseRpc(
    CHARACTER_RPC_NAMES.getCharacterRuleSheet,
    { p_character_id: characterId },
    settings
  );
}
function initializeCharacterRuleDefaults(characterId, settings) {
  return callSupabaseRpc(
    CHARACTER_RPC_NAMES.initializeCharacterRuleDefaults,
    { p_character_id: characterId },
    settings
  );
}
function initializeCharacterCombatDefaults(characterId, settings) {
  return callSupabaseRpc(
    CHARACTER_RPC_NAMES.initializeCharacterCombatDefaults,
    { p_character_id: characterId },
    settings
  );
}
function listCharacters(settings, { includeDeleted = false } = {}) {
  const query = [
    "select=id,character_key,character_bucket,source_template_key,enabled,owner_player_id,owner_player_name,is_deleted",
    "order=character_bucket.asc,character_key.asc"
  ];
  if (!includeDeleted) {
    query.push("is_deleted=eq.false");
  }
  return fetchSupabaseRows(
    `odyssey_characters?${query.join("&")}`,
    settings,
    "Unable to load character catalog."
  );
}
function getRoomTokenLinks(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_RPC_NAMES.getRoomTokenLinks,
    payload ?? {},
    settings
  );
}
function deactivateTokenLink(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_RPC_NAMES.deactivateTokenLink,
    payload ?? {},
    settings
  );
}
function loadCharacterToToken(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_RPC_NAMES.loadCharacterToToken,
    payload ?? {},
    settings
  );
}

// api/checksApi.js
var checksApi_exports = {};
__export(checksApi_exports, {
  rollCharacteristic: () => rollCharacteristic,
  rollDice: () => rollDice,
  rollSkill: () => rollSkill
});
function rollCharacteristic(payload, settings) {
  return callSupabaseRpc(
    CHECK_RPC_NAMES.rollCharacteristic,
    { p_payload: payload },
    settings
  );
}
function rollSkill(payload, settings) {
  return callSupabaseRpc(
    CHECK_RPC_NAMES.rollSkill,
    { p_payload: payload },
    settings
  );
}
function rollDice(expression, reason = null, settings) {
  return callSupabaseRpc(
    CHECK_RPC_NAMES.rollDice,
    {
      p_payload: {
        expression,
        reason
      }
    },
    settings
  );
}

// api/featureApi.js
var featureApi_exports = {};
__export(featureApi_exports, {
  reloadFeatureResource: () => reloadFeatureResource
});
function reloadFeatureResource(payload, settings) {
  return callSupabaseRpc(
    FEATURE_RPC_NAMES.reloadFeatureResource,
    { p_payload: payload },
    settings
  );
}

// api/weaponApi.js
var weaponApi_exports = {};
__export(weaponApi_exports, {
  activateWeaponFeature: () => activateWeaponFeature,
  deactivateWeaponFeature: () => deactivateWeaponFeature,
  getCharacterArmory: () => getCharacterArmory,
  getCharacterWeaponFeatures: () => getCharacterWeaponFeatures,
  loadWeaponProfileMagazine: () => loadWeaponProfileMagazine,
  switchWeaponFireMode: () => switchWeaponFireMode,
  switchWeaponProfile: () => switchWeaponProfile
});
function getCharacterArmory(characterId, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.getCharacterArmory,
    { p_character_id: characterId },
    settings
  );
}
function switchWeaponProfile(characterWeaponId, profileId, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.switchWeaponProfile,
    {
      p_character_weapon_id: characterWeaponId,
      p_profile_id: profileId
    },
    settings
  );
}
function switchWeaponFireMode(characterId, weaponId, fireModeId, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.switchWeaponFireMode,
    {
      p_character_id: characterId,
      p_weapon_id: weaponId,
      p_fire_mode_id: fireModeId
    },
    settings
  );
}
function loadWeaponProfileMagazine(payload, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.loadWeaponProfileMagazine,
    { p_payload: payload },
    settings
  );
}
function activateWeaponFeature(payload, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.activateWeaponFeature,
    { p_payload: payload },
    settings
  );
}
function deactivateWeaponFeature(featureStateId, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.deactivateWeaponFeature,
    { p_state_id: featureStateId },
    settings
  );
}
function getCharacterWeaponFeatures(characterWeaponId, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.getCharacterWeaponFeatures,
    { p_character_weapon_id: characterWeaponId },
    settings
  );
}

// api/combatApi.js
var combatApi_exports = {};
__export(combatApi_exports, {
  performAttack: () => performAttack
});
function performAttack(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.performAttack,
    { p_payload: payload },
    settings
  );
}

// api/gmApi.js
var gmApi_exports = {};
__export(gmApi_exports, {
  gmHealCharacter: () => gmHealCharacter,
  gmRepairCharacterArmor: () => gmRepairCharacterArmor,
  gmUpdateCharacterAttribute: () => gmUpdateCharacterAttribute
});
function gmHealCharacter(characterId, settings) {
  return callSupabaseRpc(
    GM_RPC_NAMES.healCharacter,
    { p_payload: { character_id: characterId } },
    settings
  );
}
function gmRepairCharacterArmor(characterId, settings) {
  return callSupabaseRpc(
    GM_RPC_NAMES.repairCharacterArmor,
    { p_payload: { character_id: characterId } },
    settings
  );
}
function gmUpdateCharacterAttribute(payload, settings) {
  return callSupabaseRpc(
    GM_RPC_NAMES.updateCharacterAttribute,
    { p_payload: payload },
    settings
  );
}

// api/effectsApi.js
var effectsApi_exports = {};
__export(effectsApi_exports, {
  addCharacterEffect: () => addCharacterEffect,
  advanceCharacterEffects: () => advanceCharacterEffects,
  getCharacterEffectSummary: () => getCharacterEffectSummary,
  getEffectiveCharacterStats: () => getEffectiveCharacterStats,
  removeCharacterEffect: () => removeCharacterEffect
});
function getCharacterEffectSummary(characterId, settings) {
  return callSupabaseRpc(
    EFFECT_RPC_NAMES.getCharacterEffectSummary,
    { p_character_id: characterId },
    settings
  );
}
function getEffectiveCharacterStats(characterId, settings) {
  return callSupabaseRpc(
    EFFECT_RPC_NAMES.getEffectiveCharacterStats,
    { p_character_id: characterId },
    settings
  );
}
function addCharacterEffect(payload, settings) {
  return callSupabaseRpc(
    EFFECT_RPC_NAMES.addCharacterEffect,
    { p_payload: payload },
    settings
  );
}
function removeCharacterEffect(effectId, settings) {
  return callSupabaseRpc(
    EFFECT_RPC_NAMES.removeCharacterEffect,
    { p_effect_id: effectId },
    settings
  );
}
function advanceCharacterEffects(characterId, settings) {
  return callSupabaseRpc(
    EFFECT_RPC_NAMES.advanceCharacterEffects,
    { p_character_id: characterId },
    settings
  );
}

// api/equipmentApi.js
var equipmentApi_exports = {};
__export(equipmentApi_exports, {
  createCharacterEquipmentItem: () => createCharacterEquipmentItem,
  equipCharacterEquipmentItem: () => equipCharacterEquipmentItem,
  getCharacterArmorSummary: () => getCharacterArmorSummary,
  getCharacterEquipment: () => getCharacterEquipment,
  recomputeCharacterArmor: () => recomputeCharacterArmor,
  unequipCharacterEquipmentItem: () => unequipCharacterEquipmentItem,
  updateCharacterEquipmentItem: () => updateCharacterEquipmentItem
});
function getCharacterArmorSummary(characterId, settings) {
  return callSupabaseRpc(
    EQUIPMENT_RPC_NAMES.getCharacterArmorSummary,
    { p_character_id: characterId },
    settings
  );
}
function getCharacterEquipment(characterId, settings) {
  return callSupabaseRpc(
    EQUIPMENT_RPC_NAMES.getCharacterEquipment,
    { p_character_id: characterId },
    settings
  );
}
function recomputeCharacterArmor(characterId, settings) {
  return callSupabaseRpc(
    EQUIPMENT_RPC_NAMES.recomputeCharacterArmor,
    { p_character_id: characterId },
    settings
  );
}
function createCharacterEquipmentItem(payload, settings) {
  return callSupabaseRpc(
    EQUIPMENT_RPC_NAMES.createCharacterEquipmentItem,
    { p_payload: payload },
    settings
  );
}
function equipCharacterEquipmentItem(equipmentItemId, bodyPartId, settings) {
  return callSupabaseRpc(
    EQUIPMENT_RPC_NAMES.equipCharacterEquipmentItem,
    {
      p_item_id: equipmentItemId,
      p_body_part_id: bodyPartId
    },
    settings
  );
}
function unequipCharacterEquipmentItem(equipmentItemId, settings) {
  return callSupabaseRpc(
    EQUIPMENT_RPC_NAMES.unequipCharacterEquipmentItem,
    { p_item_id: equipmentItemId },
    settings
  );
}
function updateCharacterEquipmentItem(payload, settings) {
  return callSupabaseRpc(
    EQUIPMENT_RPC_NAMES.updateCharacterEquipmentItem,
    { p_payload: payload },
    settings
  );
}

// api/inventoryApi.js
var inventoryApi_exports = {};
__export(inventoryApi_exports, {
  addCharacterAmmoStock: () => addCharacterAmmoStock,
  addCharacterItem: () => addCharacterItem,
  getCharacterInventory: () => getCharacterInventory,
  getCharacterItemQuantity: () => getCharacterItemQuantity,
  loadRoundsToMagazine: () => loadRoundsToMagazine,
  removeCharacterAmmoStock: () => removeCharacterAmmoStock,
  removeCharacterItemQuantity: () => removeCharacterItemQuantity,
  unloadRoundsFromMagazine: () => unloadRoundsFromMagazine,
  useCharacterItem: () => useCharacterItem
});
function getCharacterInventory(characterId, settings) {
  return callSupabaseRpc(
    INVENTORY_RPC_NAMES.getCharacterInventory,
    { p_character_id: characterId },
    settings
  );
}
function addCharacterItem(payload, settings) {
  return callSupabaseRpc(
    INVENTORY_RPC_NAMES.addCharacterItem,
    { p_payload: payload },
    settings
  );
}
function removeCharacterItemQuantity(characterId, itemCode, quantity, settings) {
  return callSupabaseRpc(
    INVENTORY_RPC_NAMES.removeCharacterItemQuantity,
    {
      p_character_id: characterId,
      p_item_code: itemCode,
      p_quantity: quantity
    },
    settings
  );
}
function getCharacterItemQuantity(characterId, itemCode, settings) {
  return callSupabaseRpc(
    INVENTORY_RPC_NAMES.getCharacterItemQuantity,
    {
      p_character_id: characterId,
      p_item_code: itemCode
    },
    settings
  );
}
function addCharacterAmmoStock(payload, settings) {
  return callSupabaseRpc(
    INVENTORY_RPC_NAMES.addCharacterAmmoStock,
    { p_payload: payload },
    settings
  );
}
function removeCharacterAmmoStock(ammoStockId, quantity, settings) {
  return callSupabaseRpc(
    INVENTORY_RPC_NAMES.removeCharacterAmmoStock,
    {
      p_ammo_stock_id: ammoStockId,
      p_quantity: quantity
    },
    settings
  );
}
function loadRoundsToMagazine(payload, settings) {
  return callSupabaseRpc(
    INVENTORY_RPC_NAMES.loadRoundsToMagazine,
    { p_payload: payload },
    settings
  );
}
function unloadRoundsFromMagazine(payload, settings) {
  return callSupabaseRpc(
    INVENTORY_RPC_NAMES.unloadRoundsFromMagazine,
    { p_payload: payload },
    settings
  );
}
function useCharacterItem(payload, settings) {
  return callSupabaseRpc(
    INVENTORY_RPC_NAMES.useCharacterItem,
    { p_payload: payload },
    settings
  );
}

// api/logApi.js
var logApi_exports = {};
__export(logApi_exports, {
  getCombatLogEntries: () => getCombatLogEntries
});
function getCombatLogEntries({ roomId = "", encounterId = "", limit = 50 } = {}, settings) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const params = [
    "select=id,created_at,event_type,message,data,actor_character_id,target_character_id,room_id,scene_id,encounter_id",
    "order=created_at.desc",
    `limit=${safeLimit}`
  ];
  if (roomId) {
    params.push(`room_id=eq.${encodeURIComponent(String(roomId).trim())}`);
  }
  if (encounterId) {
    params.push(`encounter_id=eq.${encodeURIComponent(String(encounterId).trim())}`);
  }
  return fetchSupabaseRows(
    `odyssey_combat_log?${params.join("&")}`,
    settings,
    "Unable to load combat log rows."
  );
}

// api/characterPlacementApi.js
var characterPlacementApi_exports = {};
__export(characterPlacementApi_exports, {
  getCharacterRuntimeBundle: () => getCharacterRuntimeBundle,
  getCharacterSpawnCatalog: () => getCharacterSpawnCatalog,
  getSceneTokenLinks: () => getSceneTokenLinks,
  loadCharacterToToken: () => loadCharacterToToken2,
  purgeActiveNpcs: () => purgeActiveNpcs,
  unbindTokenCharacter: () => unbindTokenCharacter
});
function getCharacterSpawnCatalog(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.getCharacterSpawnCatalog,
    { p_payload: payload ?? {} },
    settings
  );
}
function getCharacterRuntimeBundle(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.getCharacterRuntimeBundle,
    { p_payload: payload ?? {} },
    settings
  );
}
function getSceneTokenLinks(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.getSceneTokenLinks,
    { p_payload: payload ?? {} },
    settings
  );
}
function loadCharacterToToken2(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.loadCharacterToToken,
    { p_payload: payload ?? {} },
    settings
  );
}
function unbindTokenCharacter(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.unbindTokenCharacter,
    { p_payload: payload ?? {} },
    settings
  );
}
function purgeActiveNpcs(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.purgeActiveNpcs,
    { p_payload: payload ?? {} },
    settings
  );
}

// api/creatorApi.js
var creatorApi_exports = {};
__export(creatorApi_exports, {
  deleteAbility: () => deleteAbility,
  deleteAmmoType: () => deleteAmmoType,
  deleteCaliber: () => deleteCaliber,
  deleteEffect: () => deleteEffect,
  deleteEquipmentModel: () => deleteEquipmentModel,
  deleteItemDef: () => deleteItemDef,
  deleteMagazineDef: () => deleteMagazineDef,
  deleteSkill: () => deleteSkill,
  deleteWeapon: () => deleteWeapon,
  getAbility: () => getAbility,
  getAmmoType: () => getAmmoType,
  getCaliber: () => getCaliber,
  getCreatorReferenceData: () => getCreatorReferenceData,
  getEffect: () => getEffect,
  getEquipmentModel: () => getEquipmentModel,
  getItemDef: () => getItemDef,
  getMagazineDef: () => getMagazineDef,
  getSkill: () => getSkill,
  getWeapon: () => getWeapon,
  listAbilities: () => listAbilities,
  listAmmoTypes: () => listAmmoTypes,
  listCalibers: () => listCalibers,
  listEffects: () => listEffects,
  listEquipmentModels: () => listEquipmentModels,
  listItemDefs: () => listItemDefs,
  listMagazineDefs: () => listMagazineDefs,
  listSkills: () => listSkills,
  listWeapons: () => listWeapons,
  upsertAbility: () => upsertAbility,
  upsertAmmoType: () => upsertAmmoType,
  upsertCaliber: () => upsertCaliber,
  upsertEffect: () => upsertEffect,
  upsertEquipmentModel: () => upsertEquipmentModel,
  upsertItemDef: () => upsertItemDef,
  upsertMagazineDef: () => upsertMagazineDef,
  upsertSkill: () => upsertSkill,
  upsertWeapon: () => upsertWeapon
});
function getCreatorReferenceData(settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getCreatorReferenceData,
    {},
    settings
  );
}
function listWeapons({ search = null } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listWeapons,
    {
      p_search: search || null
    },
    settings
  );
}
function getWeapon(weaponModelId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getWeapon,
    { p_weapon_model_id: weaponModelId },
    settings
  );
}
function upsertWeapon(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertWeapon,
    { p_payload: payload },
    settings
  );
}
function deleteWeapon(weaponModelId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteWeapon,
    { p_weapon_model_id: weaponModelId },
    settings
  );
}
function listItemDefs({ search = null } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listItemDefs,
    {
      p_search: search || null
    },
    settings
  );
}
function getItemDef(itemDefId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getItemDef,
    { p_item_def_id: itemDefId },
    settings
  );
}
function upsertItemDef(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertItemDef,
    { p_payload: payload },
    settings
  );
}
function deleteItemDef(itemDefId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteItemDef,
    { p_item_def_id: itemDefId },
    settings
  );
}
function listCalibers({ search = null } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listCalibers,
    {
      p_search: search || null
    },
    settings
  );
}
function getCaliber(caliberId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getCaliber,
    { p_caliber_id: caliberId },
    settings
  );
}
function upsertCaliber(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertCaliber,
    { p_payload: payload },
    settings
  );
}
function deleteCaliber(caliberId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteCaliber,
    { p_caliber_id: caliberId },
    settings
  );
}
function listAmmoTypes({ search = null } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listAmmoTypes,
    {
      p_search: search || null
    },
    settings
  );
}
function getAmmoType(ammoTypeId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getAmmoType,
    { p_ammo_type_id: ammoTypeId },
    settings
  );
}
function upsertAmmoType(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertAmmoType,
    { p_payload: payload },
    settings
  );
}
function deleteAmmoType(ammoTypeId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteAmmoType,
    { p_ammo_type_id: ammoTypeId },
    settings
  );
}
function listMagazineDefs({ search = null } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listMagazineDefs,
    {
      p_search: search || null
    },
    settings
  );
}
function getMagazineDef(magazineDefId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getMagazineDef,
    { p_magazine_def_id: magazineDefId },
    settings
  );
}
function upsertMagazineDef(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertMagazineDef,
    { p_payload: payload },
    settings
  );
}
function deleteMagazineDef(magazineDefId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteMagazineDef,
    { p_magazine_def_id: magazineDefId },
    settings
  );
}
function listSkills({ search = null, categories = [] } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listSkills,
    {
      p_search: search || null,
      p_categories: Array.isArray(categories) ? categories : []
    },
    settings
  );
}
function getSkill(skillId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getSkill,
    { p_skill_def_id: skillId },
    settings
  );
}
function upsertSkill(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertSkill,
    { p_payload: payload },
    settings
  );
}
function deleteSkill(skillId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteSkill,
    { p_skill_def_id: skillId },
    settings
  );
}
function listEffects({ search = null, categories = [] } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listEffects,
    {
      p_search: search || null,
      p_categories: Array.isArray(categories) ? categories : []
    },
    settings
  );
}
function getEffect(effectId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getEffect,
    { p_effect_def_id: effectId },
    settings
  );
}
function upsertEffect(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertEffect,
    { p_payload: payload },
    settings
  );
}
function deleteEffect(effectId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteEffect,
    { p_effect_def_id: effectId },
    settings
  );
}
function listAbilities({ search = null } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listAbilities,
    {
      p_search: search || null
    },
    settings
  );
}
function getAbility(abilityId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getAbility,
    { p_ability_def_id: abilityId },
    settings
  );
}
function upsertAbility(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertAbility,
    { p_payload: payload },
    settings
  );
}
function deleteAbility(abilityId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteAbility,
    { p_ability_def_id: abilityId },
    settings
  );
}
function listEquipmentModels({ search = null, itemTypes = [] } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listEquipmentModels,
    {
      p_search: search || null,
      p_item_types: Array.isArray(itemTypes) ? itemTypes : []
    },
    settings
  );
}
function getEquipmentModel(equipmentModelId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getEquipmentModel,
    { p_equipment_model_id: equipmentModelId },
    settings
  );
}
function upsertEquipmentModel(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertEquipmentModel,
    { p_payload: payload },
    settings
  );
}
function deleteEquipmentModel(equipmentModelId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteEquipmentModel,
    { p_equipment_model_id: equipmentModelId },
    settings
  );
}

// runtime/createRuntime.js
function createOdysseyRuntime() {
  return {
    constants: {
      ...metadataKeys_exports,
      CHARACTER_RPC_NAMES,
      CHECK_RPC_NAMES,
      ABILITY_RPC_NAMES,
      FEATURE_RPC_NAMES,
      WEAPON_RPC_NAMES,
      COMBAT_RPC_NAMES,
      GM_RPC_NAMES,
      EFFECT_RPC_NAMES,
      EQUIPMENT_RPC_NAMES,
      INVENTORY_RPC_NAMES,
      CHARACTER_PLACEMENT_RPC_NAMES,
      CREATOR_RPC_NAMES
    },
    bridges: {
      obr: obrBridge_exports,
      settings: settingsBridge_exports,
      supabase: supabaseBridge_exports,
      token: tokenBridge_exports
    },
    api: {
      ability: abilityApi_exports,
      character: characterApi_exports,
      checks: checksApi_exports,
      feature: featureApi_exports,
      weapon: weaponApi_exports,
      combat: combatApi_exports,
      gm: gmApi_exports,
      effects: effectsApi_exports,
      equipment: equipmentApi_exports,
      inventory: inventoryApi_exports,
      log: logApi_exports,
      placement: characterPlacementApi_exports,
      creator: creatorApi_exports
    }
  };
}

// character-sheet-extension/main.js
var runtime = createOdysseyRuntime();
globalThis.OdysseyCharacterSheetBridge = runtime;
var root = document.getElementById("app");
if (!(root instanceof HTMLElement)) {
  throw new Error("Unable to mount Odyssey Character Sheet Shell.");
}
void mountBridgeShell({
  root,
  title: "Odyssey Character Sheet Shell",
  subtitle: "Legacy character sheet editing flow has been removed. This surface now exposes only the shared bridge foundation for future UI slices.",
  runtime,
  globalName: "OdysseyCharacterSheetBridge"
}).catch((error) => {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-title">Odyssey Character Sheet Shell</div>
      <p class="status error">Failed to initialize shell: ${String(error?.message ?? error)}</p>
    </section>
  `;
  throw error;
});
