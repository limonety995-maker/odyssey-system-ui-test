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
    function arrayClone(arr2, n) {
      var copy = new Array(n);
      for (var i = 0; i < n; ++i)
        copy[i] = arr2[i];
      return copy;
    }
    function spliceOne(list, index) {
      for (; index + 1 < list.length; index++)
        list[index] = list[index + 1];
      list.pop();
    }
    function unwrapListeners(arr2) {
      var ret = new Array(arr2.length);
      for (var i = 0; i < ret.length; ++i) {
        ret[i] = arr2[i].listener || arr2[i];
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

// bridge/obrBridge.js
var obrBridge_exports = {};
__export(obrBridge_exports, {
  OBR: () => lib_default,
  activateTool: () => activateTool,
  activateToolMode: () => activateToolMode,
  getActiveTool: () => getActiveTool,
  getActiveToolMode: () => getActiveToolMode,
  getPlayerInfo: () => getPlayerInfo,
  getRoomMetadata: () => getRoomMetadata,
  getRoomSceneContext: () => getRoomSceneContext,
  getSceneGrid: () => getSceneGrid,
  getSceneItems: () => getSceneItems,
  getSelectedOwlbearTokens: () => getSelectedOwlbearTokens,
  getSelectedTokenIds: () => getSelectedTokenIds,
  setRoomMetadata: () => setRoomMetadata,
  snapScenePosition: () => snapScenePosition,
  subscribePlayerChanges: () => subscribePlayerChanges,
  subscribeSceneItems: () => subscribeSceneItems,
  subscribeToolChanges: () => subscribeToolChanges,
  subscribeToolModeChanges: () => subscribeToolModeChanges,
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
function unsafeStringify(arr2, offset = 0) {
  return byteToHex[arr2[offset + 0]] + byteToHex[arr2[offset + 1]] + byteToHex[arr2[offset + 2]] + byteToHex[arr2[offset + 3]] + "-" + byteToHex[arr2[offset + 4]] + byteToHex[arr2[offset + 5]] + "-" + byteToHex[arr2[offset + 6]] + byteToHex[arr2[offset + 7]] + "-" + byteToHex[arr2[offset + 8]] + byteToHex[arr2[offset + 9]] + "-" + byteToHex[arr2[offset + 10]] + byteToHex[arr2[offset + 11]] + byteToHex[arr2[offset + 12]] + byteToHex[arr2[offset + 13]] + byteToHex[arr2[offset + 14]] + byteToHex[arr2[offset + 15]];
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
      const mode2 = this.toolModes[event.id];
      if (mode2) {
        if (mode2.onClick) {
          const result = mode2.onClick(event.context, event.elementId);
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
      const mode2 = this.toolModes[event.id];
      if (mode2) {
        if (mode2.onToolClick) {
          const result = mode2.onToolClick(event.context, event.event);
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
      const mode2 = this.toolModes[event.id];
      if (mode2) {
        if (mode2.onToolDoubleClick) {
          const result = mode2.onToolDoubleClick(event.context, event.event);
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
      const mode2 = this.toolModes[event.id];
      if (mode2) {
        (_a = mode2.onToolDown) === null || _a === void 0 ? void 0 : _a.call(mode2, event.context, event.event);
      }
    };
    this.handleToolModeToolMove = (event) => {
      var _a;
      const mode2 = this.toolModes[event.id];
      if (mode2) {
        (_a = mode2.onToolMove) === null || _a === void 0 ? void 0 : _a.call(mode2, event.context, event.event);
      }
    };
    this.handleToolModeToolUp = (event) => {
      var _a;
      const mode2 = this.toolModes[event.id];
      if (mode2) {
        (_a = mode2.onToolUp) === null || _a === void 0 ? void 0 : _a.call(mode2, event.context, event.event);
      }
    };
    this.handleToolModeToolDragStart = (event) => {
      var _a;
      const mode2 = this.toolModes[event.id];
      if (mode2) {
        (_a = mode2.onToolDragStart) === null || _a === void 0 ? void 0 : _a.call(mode2, event.context, event.event);
      }
    };
    this.handleToolModeToolDragMove = (event) => {
      var _a;
      const mode2 = this.toolModes[event.id];
      if (mode2) {
        (_a = mode2.onToolDragMove) === null || _a === void 0 ? void 0 : _a.call(mode2, event.context, event.event);
      }
    };
    this.handleToolModeToolDragEnd = (event) => {
      var _a;
      const mode2 = this.toolModes[event.id];
      if (mode2) {
        (_a = mode2.onToolDragEnd) === null || _a === void 0 ? void 0 : _a.call(mode2, event.context, event.event);
      }
    };
    this.handleToolModeToolDragCancel = (event) => {
      var _a;
      const mode2 = this.toolModes[event.id];
      if (mode2) {
        (_a = mode2.onToolDragCancel) === null || _a === void 0 ? void 0 : _a.call(mode2, event.context, event.event);
      }
    };
    this.handleToolModeKeyDown = (event) => {
      var _a;
      const mode2 = this.toolModes[event.id];
      if (mode2) {
        (_a = mode2.onKeyDown) === null || _a === void 0 ? void 0 : _a.call(mode2, event.context, event.event);
      }
    };
    this.handleToolModeKeyUp = (event) => {
      var _a;
      const mode2 = this.toolModes[event.id];
      if (mode2) {
        (_a = mode2.onKeyUp) === null || _a === void 0 ? void 0 : _a.call(mode2, event.context, event.event);
      }
    };
    this.handleToolModeActivate = (event) => {
      var _a;
      const mode2 = this.toolModes[event.id];
      if (mode2) {
        (_a = mode2.onActivate) === null || _a === void 0 ? void 0 : _a.call(mode2, event.context);
      }
    };
    this.handleToolModeDeactivate = (event) => {
      var _a;
      const mode2 = this.toolModes[event.id];
      if (mode2) {
        (_a = mode2.onDeactivate) === null || _a === void 0 ? void 0 : _a.call(mode2, event.context);
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
  createMode(mode2) {
    return __awaiter11(this, void 0, void 0, function* () {
      yield this.messageBus.sendAsync("OBR_TOOL_MODE_CREATE", {
        id: mode2.id,
        shortcut: mode2.shortcut,
        icons: normalizeIconPaths(mode2.icons),
        preventDrag: mode2.preventDrag,
        disabled: mode2.disabled,
        cursors: mode2.cursors
      });
      this.toolModes[mode2.id] = mode2;
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

// node_modules/@owlbear-rodeo/sdk/lib/builders/GenericItemBuilder.js
var GenericItemBuilder = class {
  constructor(player) {
    this._item = {
      createdUserId: player.id,
      id: v4_default(),
      name: "Item",
      zIndex: Date.now(),
      lastModified: (/* @__PURE__ */ new Date()).toISOString(),
      lastModifiedUserId: player.id,
      locked: false,
      metadata: {},
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      type: "ITEM",
      visible: true,
      layer: "POPOVER"
    };
  }
  createdUserId(createdUserId) {
    this._item.createdUserId = createdUserId;
    return this.self();
  }
  id(id) {
    this._item.id = id;
    return this.self();
  }
  name(name) {
    this._item.name = name;
    return this.self();
  }
  description(description) {
    this._item.description = description;
    return this.self();
  }
  lastModified(lastModified) {
    this._item.lastModified = lastModified;
    return this.self();
  }
  zIndex(zIndex) {
    this._item.zIndex = zIndex;
    return this.self();
  }
  lastModifiedUserId(lastModifiedUserId) {
    this._item.lastModifiedUserId = lastModifiedUserId;
    return this.self();
  }
  locked(locked) {
    this._item.locked = locked;
    return this.self();
  }
  metadata(metadata) {
    this._item.metadata = metadata;
    return this.self();
  }
  position(position) {
    this._item.position = position;
    return this.self();
  }
  rotation(rotation) {
    this._item.rotation = rotation;
    return this.self();
  }
  scale(scale) {
    this._item.scale = scale;
    return this.self();
  }
  visible(visible) {
    this._item.visible = visible;
    return this.self();
  }
  attachedTo(attachedTo) {
    this._item.attachedTo = attachedTo;
    return this.self();
  }
  layer(layer) {
    this._item.layer = layer;
    return this.self();
  }
  disableHit(disable) {
    this._item.disableHit = disable;
    return this.self();
  }
  disableAutoZIndex(disable) {
    this._item.disableAutoZIndex = disable;
    return this.self();
  }
  disableAttachmentBehavior(disable) {
    this._item.disableAttachmentBehavior = disable;
    return this.self();
  }
  self() {
    return this;
  }
};

// node_modules/@owlbear-rodeo/sdk/lib/builders/LineBuilder.js
var LineBuilder = class extends GenericItemBuilder {
  constructor(player) {
    super(player);
    this._style = {
      strokeColor: "black",
      strokeOpacity: 1,
      strokeWidth: 5,
      strokeDash: []
    };
    this._startPosition = { x: 0, y: 0 };
    this._endPosition = { x: 0, y: 0 };
    this._item.layer = "DRAWING";
    this._item.name = "Line";
  }
  style(style) {
    this._style = style;
    return this.self();
  }
  strokeColor(strokeColor) {
    this._style.strokeColor = strokeColor;
    return this.self();
  }
  strokeOpacity(strokeOpacity) {
    this._style.strokeOpacity = strokeOpacity;
    return this.self();
  }
  strokeWidth(strokeWidth) {
    this._style.strokeWidth = strokeWidth;
    return this.self();
  }
  strokeDash(strokeDash) {
    this._style.strokeDash = strokeDash;
    return this.self();
  }
  startPosition(startPosition) {
    this._startPosition = startPosition;
    return this.self();
  }
  endPosition(endPosition) {
    this._endPosition = endPosition;
    return this.self();
  }
  build() {
    return Object.assign(Object.assign({}, this._item), { type: "LINE", startPosition: this._startPosition, endPosition: this._endPosition, style: this._style });
  }
};

// node_modules/@owlbear-rodeo/sdk/lib/builders/TextBuilder.js
var TextBuilder = class extends GenericItemBuilder {
  constructor(player) {
    super(player);
    this._text = {
      richText: [
        {
          type: "paragraph",
          children: [{ text: "" }]
        }
      ],
      plainText: "",
      style: {
        padding: 0,
        fontFamily: "Roboto",
        fontSize: 16,
        fontWeight: 400,
        textAlign: "LEFT",
        textAlignVertical: "TOP",
        fillColor: "white",
        fillOpacity: 1,
        strokeColor: "white",
        strokeOpacity: 1,
        strokeWidth: 0,
        lineHeight: 1.5
      },
      type: "RICH",
      width: "AUTO",
      height: "AUTO"
    };
    this._item.layer = "TEXT";
    this._item.name = "Text";
  }
  text(text) {
    this._text = text;
    return this.self();
  }
  width(width) {
    this._text.width = width;
    return this.self();
  }
  height(height) {
    this._text.height = height;
    return this.self();
  }
  richText(richText) {
    this._text.richText = richText;
    return this.self();
  }
  plainText(plainText) {
    this._text.plainText = plainText;
    return this.self();
  }
  textType(textType) {
    this._text.type = textType;
    return this.self();
  }
  padding(padding) {
    this._text.style.padding = padding;
    return this.self();
  }
  fontFamily(fontFamily) {
    this._text.style.fontFamily = fontFamily;
    return this.self();
  }
  fontSize(fontSize) {
    this._text.style.fontSize = fontSize;
    return this.self();
  }
  fontWeight(fontWeight) {
    this._text.style.fontWeight = fontWeight;
    return this.self();
  }
  textAlign(textAlign) {
    this._text.style.textAlign = textAlign;
    return this.self();
  }
  textAlignVertical(textAlignVertical) {
    this._text.style.textAlignVertical = textAlignVertical;
    return this.self();
  }
  fillColor(fillColor) {
    this._text.style.fillColor = fillColor;
    return this.self();
  }
  fillOpacity(fillOpacity) {
    this._text.style.fillOpacity = fillOpacity;
    return this.self();
  }
  strokeColor(strokeColor) {
    this._text.style.strokeColor = strokeColor;
    return this.self();
  }
  strokeOpacity(strokeOpacity) {
    this._text.style.strokeOpacity = strokeOpacity;
    return this.self();
  }
  strokeWidth(strokeWidth) {
    this._text.style.strokeWidth = strokeWidth;
    return this.self();
  }
  lineHeight(lineHeight) {
    this._text.style.lineHeight = lineHeight;
    return this.self();
  }
  build() {
    return Object.assign(Object.assign({}, this._item), { type: "TEXT", text: this._text });
  }
};

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
function buildLine() {
  return new LineBuilder(playerApi);
}
function buildText() {
  return new TextBuilder(playerApi);
}
var lib_default = OBR;

// constants/metadataKeys.js
var metadataKeys_exports = {};
__export(metadataKeys_exports, {
  EXTENSION_ID: () => EXTENSION_ID,
  ROOM_CONTEXT_KEY: () => ROOM_CONTEXT_KEY,
  ROOM_SUPABASE_SETTINGS_KEY: () => ROOM_SUPABASE_SETTINGS_KEY,
  SHELL_GLOBAL_KEY: () => SHELL_GLOBAL_KEY,
  TOKEN_LINK_KEY: () => TOKEN_LINK_KEY,
  hasTokenCharacterLink: () => hasTokenCharacterLink,
  normalizeTokenCharacterLink: () => normalizeTokenCharacterLink
});
var EXTENSION_ID = "com.codex.body-hp";
var ROOM_SUPABASE_SETTINGS_KEY = `${EXTENSION_ID}/supabaseSettings`;
var ROOM_CONTEXT_KEY = `${EXTENSION_ID}/roomContext`;
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
async function getSceneGrid() {
  await waitForObrReady();
  const [type, measurement, dpi, scale] = await Promise.all([
    lib_default.scene.grid.getType().catch(() => "SQUARE"),
    lib_default.scene.grid.getMeasurement().catch(() => "CHEBYSHEV"),
    lib_default.scene.grid.getDpi().catch(() => 0),
    lib_default.scene.grid.getScale().catch(() => null)
  ]);
  return { type, measurement, dpi, scale };
}
async function snapScenePosition(position, snappingSensitivity = 1, useCorners = false, useCenter = false) {
  await waitForObrReady();
  return lib_default.scene.grid.snapPosition(
    position,
    snappingSensitivity,
    useCorners,
    useCenter
  );
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
function firstNonEmptyText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}
function normalizeStoredRoomContext(metadata, roomId) {
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  const scoped = meta[ROOM_CONTEXT_KEY] && typeof meta[ROOM_CONTEXT_KEY] === "object" ? meta[ROOM_CONTEXT_KEY] : {};
  const campaignId = firstNonEmptyText(
    scoped.campaignId,
    scoped.campaign_id,
    meta.campaignId,
    meta.campaign_id,
    meta.odysseyCampaignId,
    meta.odyssey_campaign_id,
    roomId
  );
  const sceneId = firstNonEmptyText(
    scoped.sceneId,
    scoped.scene_id,
    meta.sceneId,
    meta.scene_id,
    meta.odysseySceneId,
    meta.odyssey_scene_id,
    roomId
  );
  return {
    campaignId,
    roomId,
    sceneId
  };
}
async function getRoomSceneContext() {
  await waitForObrReady();
  const roomId = String(lib_default.room?.id ?? "").trim();
  const metadata = await getRoomMetadata();
  return normalizeStoredRoomContext(metadata, roomId);
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
async function activateTool(toolId) {
  await waitForObrReady();
  return lib_default.tool.activateTool(toolId);
}
async function activateToolMode(toolId, modeId) {
  await waitForObrReady();
  return lib_default.tool.activateMode(toolId, modeId);
}
async function getActiveTool() {
  await waitForObrReady();
  return lib_default.tool.getActiveTool().catch(() => "");
}
async function getActiveToolMode() {
  await waitForObrReady();
  return lib_default.tool.getActiveToolMode().catch(() => "");
}
async function subscribeToolChanges(listener) {
  await waitForObrReady();
  let active = true;
  lib_default.tool.onToolChange((toolId) => {
    if (!active) return;
    listener(String(toolId ?? "").trim());
  });
  return () => {
    active = false;
  };
}
async function subscribeToolModeChanges(listener) {
  await waitForObrReady();
  let active = true;
  lib_default.tool.onToolModeChange((modeId) => {
    if (!active) return;
    listener(String(modeId ?? "").trim());
  });
  return () => {
    active = false;
  };
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

// hud/overlay/hudPlacement.js
var DEFAULT_PLACEMENT = Object.freeze({ mode: "default", x: 0, y: 1 });
function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
function clampPlacement(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PLACEMENT };
  const mode2 = raw.mode === "custom" ? "custom" : "default";
  if (mode2 === "default") return { ...DEFAULT_PLACEMENT };
  return { mode: "custom", x: clamp01(raw.x), y: clamp01(raw.y) };
}
function serializePlacement(placement) {
  return JSON.stringify(clampPlacement(placement));
}

// hud/overlay/overlayConstants.js
var OVERLAY_HTML = "combat-hud-overlay.html";
var BC_HUD_UI_STATE = "com.odyssey.combat-hud/ui-state";
var BC_HUD_SELECTION = "com.odyssey.combat-hud/selection";
var BC_HUD_SELECTION_REQUEST = "com.odyssey.combat-hud/selection-request";
var BC_HUD_COMMAND = "com.odyssey.combat-hud/command";
var BC_HUD_TARGETING = "com.odyssey.combat-hud/targeting";
var BC_HUD_TARGETING_REQUEST = "com.odyssey.combat-hud/targeting-request";
var BC_HUD_TARGETING_COMMAND = "com.odyssey.combat-hud/targeting-command";
var PLAYER_W = 144;
var PLAYER_HEIGHT = 146;
var RAIL_GAP = 10;
var GUN_W = 240;
var SKILLS_W = 430;
var TARGET_W = 100;
var MODACT_W = 126;
var RAIL_W = GUN_W + SKILLS_W + TARGET_W + MODACT_W + RAIL_GAP * 3;
var HUD_PAD_X = 16;
var HUD_TOP_STRIP = 16;
var HUD_GAP_MAX = 235;
var EXPANDED_HEIGHT = HUD_TOP_STRIP + PLAYER_HEIGHT + 4;
var EXPANDED_MAX_WIDTH = PLAYER_W + HUD_GAP_MAX + RAIL_W + HUD_PAD_X;
var ANCHOR_ORIGIN = Object.freeze({ horizontal: "LEFT", vertical: "BOTTOM" });
var TRANSFORM_ORIGIN = Object.freeze({ horizontal: "LEFT", vertical: "BOTTOM" });
var DEFAULT_HUD_UI_STATE = Object.freeze({
  isHudCollapsed: false,
  mockScenarioId: "A",
  viewerRole: "player",
  selectedTokenId: null,
  hudPlacement: { ...DEFAULT_PLACEMENT }
});
var HUD_UI_PARAM_KEYS = Object.freeze({
  collapsed: "collapsed",
  scenario: "scenario",
  role: "role",
  token: "token",
  placement: "placement"
});
var HUD_RENDER_PARAM_KEYS = Object.freeze({ vw: "vw", vh: "vh", gap: "gap" });
function serializeHudUiState(ui) {
  const src = ui && typeof ui === "object" ? ui : {};
  const params = new URLSearchParams();
  params.set(HUD_UI_PARAM_KEYS.collapsed, src.isHudCollapsed ? "1" : "0");
  params.set(HUD_UI_PARAM_KEYS.scenario, src.mockScenarioId != null ? String(src.mockScenarioId) : "");
  params.set(HUD_UI_PARAM_KEYS.role, src.viewerRole === "gm" ? "gm" : "player");
  params.set(HUD_UI_PARAM_KEYS.token, src.selectedTokenId == null ? "" : String(src.selectedTokenId));
  params.set(HUD_UI_PARAM_KEYS.placement, serializePlacement(src.hudPlacement));
  return params.toString();
}
function normalizeHudUiState(partial) {
  const p = partial && typeof partial === "object" ? partial : {};
  return {
    isHudCollapsed: typeof p.isHudCollapsed === "boolean" ? p.isHudCollapsed : DEFAULT_HUD_UI_STATE.isHudCollapsed,
    mockScenarioId: p.mockScenarioId != null && p.mockScenarioId !== "" ? String(p.mockScenarioId) : DEFAULT_HUD_UI_STATE.mockScenarioId,
    viewerRole: p.viewerRole === "gm" ? "gm" : "player",
    selectedTokenId: Object.prototype.hasOwnProperty.call(p, "selectedTokenId") ? p.selectedTokenId : DEFAULT_HUD_UI_STATE.selectedTokenId,
    hudPlacement: clampPlacement(p.hudPlacement ?? DEFAULT_HUD_UI_STATE.hudPlacement)
  };
}

// api/characterPlacementApi.js
var characterPlacementApi_exports = {};
__export(characterPlacementApi_exports, {
  assignCharacterOwner: () => assignCharacterOwner,
  clearCharacterOwner: () => clearCharacterOwner,
  getCharacterQuickbar: () => getCharacterQuickbar,
  getCharacterRuntimeBundle: () => getCharacterRuntimeBundle,
  getCharacterSpawnCatalog: () => getCharacterSpawnCatalog,
  getSceneTokenLinks: () => getSceneTokenLinks,
  loadCharacterToToken: () => loadCharacterToToken,
  purgeActiveNpcs: () => purgeActiveNpcs,
  saveCharacterQuickbar: () => saveCharacterQuickbar,
  unbindTokenCharacter: () => unbindTokenCharacter
});

// constants/rpcNames.js
var CHARACTER_RPC_NAMES = Object.freeze({
  getCharacterRuleSheet: "get_character_rule_sheet",
  initializeCharacterRuleDefaults: "initialize_character_rule_defaults",
  initializeCharacterCombatDefaults: "initialize_character_combat_defaults",
  // Legacy token-link RPCs still used by tokenRealtimeSync and older GM flows.
  getRoomTokenLinks: "get_room_token_links",
  deactivateTokenLink: "deactivate_token_link"
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
  performAttack: "perform_attack",
  moveCharacter: "combat_move_character",
  syncPositionsFromOwlbear: "combat_sync_positions_from_owlbear",
  startEncounter: "combat_start_encounter",
  addParticipant: "combat_add_participant",
  removeParticipant: "combat_remove_participant",
  reorderInitiative: "combat_reorder_initiative",
  endTurn: "combat_end_turn",
  skipTurn: "combat_skip_turn",
  forceNextTurn: "combat_force_next_turn",
  endEncounter: "combat_end_encounter",
  getActiveRuntime: "combat_get_active_runtime",
  markCharacterDead: "combat_mark_character_dead",
  convertActionToMove: "combat_convert_action_to_move",
  spendMove: "combat_spend_move",
  executeAction: "combat_execute_action",
  getCombatLog: "combat_get_log",
  grantReactionAction: "combat_grant_reaction_action"
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
var PERK_RPC_NAMES = Object.freeze({
  getCharacterPerks: "get_character_perks",
  getCharacterAvailablePerks: "get_character_available_perks",
  grantCharacterPerk: "grant_character_perk",
  useCharacterPerk: "use_character_perk"
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
  purgeActiveNpcs: "purge_active_npcs",
  assignCharacterOwner: "assign_character_owner",
  clearCharacterOwner: "clear_character_owner",
  getCharacterQuickbar: "get_character_quickbar",
  saveCharacterQuickbar: "save_character_quickbar"
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
  listPerks: "creator_list_perks",
  getPerk: "creator_get_perk",
  upsertPerk: "creator_upsert_perk",
  deletePerk: "creator_delete_perk",
  listEquipmentModels: "creator_list_equipment_models",
  getEquipmentModel: "creator_get_equipment_model",
  upsertEquipmentModel: "creator_upsert_equipment_model",
  deleteEquipmentModel: "creator_delete_equipment_model"
});

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

// bridge/supabaseBridge.js
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
function isSupabaseDebugEnabled() {
  try {
    if (globalThis.localStorage?.getItem("odyssey.debug") === "1") return true;
  } catch (_error) {
  }
  try {
    return /[?&](odysseyDebug|debugRpc)=1(?:&|$)/i.test(
      String(globalThis.location?.search ?? "")
    );
  } catch (_error) {
    return false;
  }
}
function logSupabaseDebug(message, payload) {
  if (!isSupabaseDebugEnabled()) return;
  if (payload === void 0) {
    console.info(message);
    return;
  }
  console.info(message, payload);
}
async function parseSupabaseResponse(response, fallbackMessage, requestId = "") {
  logSupabaseDebug(`[Odyssey RPC ${requestId}] response headers received`, {
    status: response.status,
    ok: response.ok
  });
  const rawText = await response.text();
  logSupabaseDebug(`[Odyssey RPC ${requestId}] response body read`, {
    bytes: rawText.length
  });
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
  const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const requestInit = {
    method,
    headers: buildHeaders(apiKey, method, headers, prefer)
  };
  if (body !== void 0) {
    requestInit.body = JSON.stringify(body);
    requestInit.headers["Content-Type"] = "application/json";
  }
  try {
    logSupabaseDebug(`[Odyssey RPC ${requestId}] request prepared`, {
      method,
      path
    });
    logSupabaseDebug(`[Odyssey RPC ${requestId}] fetch starting`);
    const fetchPromise = fetch(`${url}/rest/v1/${path}`, requestInit);
    logSupabaseDebug(`[Odyssey RPC ${requestId}] fetch promise created`);
    const response = await fetchPromise;
    return await parseSupabaseResponse(response, fallbackMessage, requestId);
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
async function fetchTokenLinks(roomIdOrPayload, sceneId = "", settings) {
  const payload = roomIdOrPayload && typeof roomIdOrPayload === "object" ? roomIdOrPayload : {
    room_id: String(roomIdOrPayload ?? "").trim(),
    scene_id: String(sceneId ?? "").trim()
  };
  const result = await callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.getSceneTokenLinks,
    payload,
    settings
  );
  return Array.isArray(result?.links) ? result.links : [];
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
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.unbindTokenCharacter,
    {
      room_id: String(roomId ?? "").trim(),
      scene_id: String(sceneId ?? "").trim(),
      token_id: String(tokenId ?? "").trim()
    },
    settings
  );
}

// api/characterPlacementApi.js
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
function assignCharacterOwner(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.assignCharacterOwner,
    { p_payload: payload ?? {} },
    settings
  );
}
function clearCharacterOwner(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.clearCharacterOwner,
    { p_payload: payload ?? {} },
    settings
  );
}
function getCharacterQuickbar(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.getCharacterQuickbar,
    { p_payload: payload ?? {} },
    settings
  );
}
function saveCharacterQuickbar(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.saveCharacterQuickbar,
    { p_payload: payload ?? {} },
    settings
  );
}
function loadCharacterToToken(payload, settings) {
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
  addParticipant: () => addParticipant,
  convertActionToMove: () => convertActionToMove,
  endEncounter: () => endEncounter,
  endTurn: () => endTurn,
  executeAction: () => executeAction,
  forceNextTurn: () => forceNextTurn,
  getActiveRuntime: () => getActiveRuntime,
  getCombatLog: () => getCombatLog,
  grantReactionAction: () => grantReactionAction,
  markCharacterDead: () => markCharacterDead,
  moveCharacter: () => moveCharacter,
  performAttack: () => performAttack,
  removeParticipant: () => removeParticipant,
  reorderInitiative: () => reorderInitiative,
  skipTurn: () => skipTurn,
  spendMove: () => spendMove,
  startEncounter: () => startEncounter,
  syncPositionsFromOwlbear: () => syncPositionsFromOwlbear
});
function performAttack(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.performAttack,
    { p_payload: payload },
    settings
  );
}
function moveCharacter(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.moveCharacter,
    { p_payload: payload ?? {} },
    settings
  );
}
function syncPositionsFromOwlbear(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.syncPositionsFromOwlbear,
    { p_payload: payload ?? {} },
    settings
  );
}
function startEncounter(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.startEncounter,
    { p_payload: payload ?? {} },
    settings
  );
}
function addParticipant(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.addParticipant,
    { p_payload: payload ?? {} },
    settings
  );
}
function removeParticipant(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.removeParticipant,
    { p_payload: payload ?? {} },
    settings
  );
}
function reorderInitiative(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.reorderInitiative,
    { p_payload: payload ?? {} },
    settings
  );
}
function endTurn(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.endTurn,
    { p_payload: payload ?? {} },
    settings
  );
}
function skipTurn(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.skipTurn,
    { p_payload: payload ?? {} },
    settings
  );
}
function forceNextTurn(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.forceNextTurn,
    { p_payload: payload ?? {} },
    settings
  );
}
function endEncounter(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.endEncounter,
    { p_payload: payload ?? {} },
    settings
  );
}
function getActiveRuntime(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.getActiveRuntime,
    { p_payload: payload ?? {} },
    settings
  );
}
function markCharacterDead(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.markCharacterDead,
    { p_payload: payload ?? {} },
    settings
  );
}
function convertActionToMove(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.convertActionToMove,
    { p_payload: payload ?? {} },
    settings
  );
}
function spendMove(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.spendMove,
    { p_payload: payload ?? {} },
    settings
  );
}
function executeAction(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.executeAction,
    { p_payload: payload ?? {} },
    settings
  );
}
function getCombatLog(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.getCombatLog,
    { p_payload: payload ?? {} },
    settings
  );
}
function grantReactionAction(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.grantReactionAction,
    { p_payload: payload ?? {} },
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

// hud/scene/reloadPolicy.js
function resolveReloadMagazineId(command, ephemeral, weapon) {
  const raw = command?.magazineId ?? ephemeral?.selectedReloadMagazineId ?? weapon?.reserveMagazines?.[0]?.id ?? "";
  const trimmed = String(raw).trim();
  return trimmed || null;
}
function isReloadRpcOk(result) {
  return result?.ok !== false;
}
function normalizeReloadRpcResult(result) {
  const ok = isReloadRpcOk(result);
  return {
    ok,
    error: ok ? null : result?.error ?? null,
    message: result?.message ?? null
  };
}

// hud/scene/fireModePolicy.js
function resolveFireModeUpdatePath(weapon) {
  if (!weapon?.id || !weapon?.activeProfileId) return "unavailable";
  return "server";
}
function normalizeFireModeRpcResult(error) {
  if (!error) return { ok: true, error: null, message: null };
  return {
    ok: false,
    error: "RPC_EXCEPTION",
    message: String(error?.message ?? error ?? "Fire mode switch failed.")
  };
}

// hud/combat/basicAttackPolicy.js
var BASIC_ATTACK_BLOCK_REASON = Object.freeze({
  noCharacter: "No character loaded.",
  inFlight: "Attack is resolving.",
  noWeapon: "No active weapon.",
  noTarget: "Select a target.",
  targetNotLinked: "Target has no linked character.",
  selfTarget: "Cannot target yourself.",
  noZone: "Select a body zone.",
  zoneUnresolved: "Target body zone data unavailable."
});
function blocked(reason) {
  return { uiAllowed: false, uiBlockReason: reason };
}
var ALLOWED = Object.freeze({ uiAllowed: true, uiBlockReason: null });
function evaluateBasicAttack(ctx = {}) {
  const {
    sourceCharacterId = null,
    weaponId = null,
    targetTokenId = null,
    targetCharacterId = null,
    bodyZoneId = null,
    resolvedBodyPartId = null,
    inFlight = false
  } = ctx;
  if (!sourceCharacterId) return blocked(BASIC_ATTACK_BLOCK_REASON.noCharacter);
  if (inFlight) return blocked(BASIC_ATTACK_BLOCK_REASON.inFlight);
  if (!weaponId) return blocked(BASIC_ATTACK_BLOCK_REASON.noWeapon);
  if (!targetTokenId && !targetCharacterId) return blocked(BASIC_ATTACK_BLOCK_REASON.noTarget);
  if (!targetCharacterId) return blocked(BASIC_ATTACK_BLOCK_REASON.targetNotLinked);
  if (String(targetCharacterId) === String(sourceCharacterId)) return blocked(BASIC_ATTACK_BLOCK_REASON.selfTarget);
  if (!bodyZoneId) return blocked(BASIC_ATTACK_BLOCK_REASON.noZone);
  if (!resolvedBodyPartId) return blocked(BASIC_ATTACK_BLOCK_REASON.zoneUnresolved);
  return ALLOWED;
}
function buildAttackRequestSignature(ctx = {}) {
  return `${ctx.sourceCharacterId ?? ""}|${ctx.weaponId ?? ""}|${ctx.targetCharacterId ?? ""}`;
}
function isAttackResultStale(requestCtx, currentCtx) {
  return buildAttackRequestSignature(requestCtx) !== buildAttackRequestSignature(currentCtx);
}

// screens/resolveAttack/resolveAttackService.js
var ValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
};
var ERROR_MESSAGES = Object.freeze({
  // characters / targets
  CHARACTER_NOT_FOUND: "Attacker character was not found.",
  TARGET_NOT_FOUND: "Target character was not found.",
  INVALID_TARGET: "Invalid target for this attack.",
  // body parts
  BODY_PART_NOT_FOUND: "Target body part was not found or cannot be targeted.",
  TARGET_BODY_PART_NOT_FOUND: "Target body part was not found.",
  BODY_PART_DESTROYED: "That body part is already destroyed \u2014 choose another.",
  // weapon model / profile
  WEAPON_NOT_FOUND: "Weapon was not found for the attacker.",
  INVALID_WEAPON_MODEL: "Weapon model linked to the weapon was not found.",
  INVALID_PROFILE: "Selected weapon profile is invalid.",
  PROFILE_NOT_FOUND: "Weapon profile was not found.",
  NO_ACTIVE_PROFILE: "Weapon has no active profile.",
  // fire mode
  INVALID_FIRE_MODE: "Fire mode is missing or not allowed for this weapon.",
  FIRE_MODE_NOT_ALLOWED: "This fire mode is not allowed for the weapon.",
  FIRE_MODE_NOT_ALLOWED_FOR_ACTIVE_PROFILE: "This fire mode is not allowed for the active profile.",
  // magazine / ammo
  NO_MAGAZINE: "Weapon requires a loaded magazine.",
  INVALID_MAGAZINE: "Loaded magazine is invalid or incompatible.",
  MAGAZINE_EMPTY: "The loaded magazine is empty.",
  NO_AMMO: "Not enough ammunition to fire.",
  MAGAZINE_HAS_DIFFERENT_AMMO_TYPE: "Magazine ammo type does not match.",
  CALIBER_MISMATCH: "Magazine caliber does not match the weapon.",
  // features
  WEAPON_FEATURE_NOT_AVAILABLE: "That weapon feature is not available right now.",
  MISSING_RELOAD_ITEM: "Missing the item required to reload this feature.",
  // abilities / resources
  ABILITY_NOT_FOUND: "Ability was not found or is disabled.",
  INVALID_ABILITY: "Invalid ability for this action.",
  INVALID_ATTACK_TYPE: "This ability cannot be used as an attack.",
  ABILITY_NOT_AVAILABLE_FOR_WEAPON_PROFILE: "This weapon ability is not available for the current weapon profile.",
  ABILITY_ON_COOLDOWN: "Ability is on cooldown.",
  NO_ENERGY: "Not enough energy for this ability.",
  NOT_ENOUGH_RESOURCE: "Not enough resource to use this ability.",
  RESOURCE_POOL_NOT_FOUND: "Resource pool was not found.",
  WEAPON_ABILITY_SOURCE_NOT_AVAILABLE: "This weapon ability is no longer available on its source weapon.",
  // ammo stock / magazine loading
  AMMO_STOCK_NOT_FOUND: "Ammo stock was not found.",
  OWNER_MISMATCH: "Magazine and ammo stock belong to different characters.",
  MAGAZINE_FULL: "Magazine is already full.",
  NOT_ENOUGH_AMMO_STOCK: "Not enough ammo in stock.",
  NOT_ENOUGH_MAGAZINE_ROUNDS: "Magazine does not contain that many rounds.",
  INVALID_QUANTITY: "Invalid quantity.",
  MAGAZINE_INCOMPATIBLE: "Magazine is not compatible with this weapon profile.",
  // consumable items / healing (use_character_item)
  ITEM_NOT_FOUND: "Item was not found.",
  ITEM_NOT_AVAILABLE: "Item is not available (none left).",
  ITEM_OWNERSHIP_MISMATCH: "Item belongs to another character.",
  ITEM_ACTION_NOT_SUPPORTED: "This item cannot be used this way.",
  BODY_PART_TARGET_MISMATCH: "Body part does not belong to that character.",
  NO_HEALABLE_DAMAGE: "Nothing to heal on that body part.",
  // GM tools
  CHARACTER_ID_REQUIRED: "A character must be selected.",
  // equipment / armor
  BODY_PART_NOT_ALLOWED: "This item can't be equipped to that body part.",
  EQUIPMENT_ITEM_NOT_FOUND: "Equipment item was not found.",
  ALREADY_EQUIPPED: "This item is already equipped.",
  SLOT_OCCUPIED: "That body part already has equipment in this slot."
});
function describeError(code, fallback) {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return fallback || "The attack could not be performed.";
}
function splitManualModifiers(modifiers = []) {
  let bonus = 0;
  let penalty = 0;
  for (const m of modifiers) {
    if (!m || m.auto || m.on === false) continue;
    const value = Number(m.value) || 0;
    if (value > 0) bonus += value;
    else if (value < 0) penalty += -value;
  }
  return { manual_attack_bonus: bonus, manual_attack_penalty: penalty };
}
function requireId(value, message) {
  const id = String(value || "").trim();
  if (!id) throw new ValidationError(message);
  return id;
}
function buildAttackPayload(ctx = {}) {
  const mode2 = ctx.mode === "skill" ? "skill" : "weapon";
  const payload = {
    attacker_character_id: requireId(ctx.attackerCharacterId, "No attacker selected."),
    target_character_id: requireId(ctx.targetCharacterId, "No target selected."),
    target_body_part_id: requireId(ctx.targetBodyPartId, "No target body part selected."),
    distance_m: Math.max(Number(ctx.distanceM) || 0, 0),
    attack_context: splitManualModifiers(ctx.modifiers)
  };
  if (mode2 === "skill") {
    payload.character_ability_id = requireId(ctx.abilityId, "No ability selected.");
  } else {
    payload.weapon_id = requireId(ctx.weaponId, "No weapon selected.");
  }
  for (const [key, value] of Object.entries({
    room_id: ctx.roomId,
    campaign_id: ctx.campaignId,
    scene_id: ctx.sceneId,
    encounter_id: ctx.encounterId,
    actor_token_id: ctx.actorTokenId,
    target_token_id: ctx.targetTokenId
  })) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) payload[key] = trimmed;
  }
  return payload;
}
function firstDefined(...values) {
  for (const v of values) if (v !== void 0 && v !== null) return v;
  return null;
}
function asArray(v) {
  return Array.isArray(v) ? v : [];
}
function normalizeResult(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const attack = r.attack && typeof r.attack === "object" ? r.attack : {};
  const defense = r.defense && typeof r.defense === "object" ? r.defense : {};
  const damage = r.damage && typeof r.damage === "object" ? r.damage : {};
  const bodyPart = r.body_part && typeof r.body_part === "object" ? r.body_part : {};
  const magazine = r.magazine && typeof r.magazine === "object" ? r.magazine : {};
  const resource = r.resource && typeof r.resource === "object" ? r.resource : {};
  const targetState = r.target_state && typeof r.target_state === "object" ? r.target_state : {};
  const weaponEffects = r.weapon_effects && typeof r.weapon_effects === "object" ? r.weapon_effects : {};
  return {
    ok: r.ok !== false,
    hit: typeof r.hit === "boolean" ? r.hit : null,
    auto: firstDefined(r.auto),
    // 'crit' | 'fail' | null
    attackType: firstDefined(r.attack_type),
    attackRoll: firstDefined(attack.roll, r.attack_roll),
    attackTotal: firstDefined(attack.total, r.attack_total),
    defenseTotal: firstDefined(defense.total, r.defense_total),
    damageLevel: firstDefined(damage.level, r.damage_level),
    damageDiff: firstDefined(damage.diff, r.damage_diff),
    criticalDelta: firstDefined(damage.critical_delta, r.critical_delta),
    bodyCriticalDelta: firstDefined(damage.body_critical_delta, r.body_critical_delta),
    targetBodyPartName: firstDefined(bodyPart.name, r.target_body_part_name),
    bodyPart: Object.keys(bodyPart).length ? bodyPart : null,
    ammoSpent: firstDefined(magazine.bullets_spent, r.bullets_spent),
    ammoRemaining: firstDefined(magazine.remaining_rounds, r.remaining_magazine_rounds),
    energySpent: firstDefined(resource.spent, resource.cost, resource.amount_spent),
    energyRemaining: firstDefined(resource.remaining, resource.current_value),
    feature: firstDefined(r.feature),
    armor: firstDefined(bodyPart.effective_armor, r.effective_armor, r.armor),
    armorPierceUsed: firstDefined(
      damage.armor_pierce_used,
      damage.total_armor_pierce,
      r.armor_pierce_used,
      weaponEffects.armor_pierce
    ),
    armorValueUsed: firstDefined(damage.armor_value_used, bodyPart.armor_value),
    effectiveArmor: firstDefined(damage.effective_armor, bodyPart.effective_armor, r.effective_armor),
    weaponEffects: Object.keys(weaponEffects).length ? weaponEffects : null,
    pendingChecks: asArray(firstDefined(r.pending_checks, r.pending_saves, [])),
    targetAlive: typeof targetState.is_alive === "boolean" ? targetState.is_alive : null,
    targetConscious: typeof targetState.is_conscious === "boolean" ? targetState.is_conscious : null,
    combatLogId: firstDefined(r.log_id, r.combat_log_id)
  };
}
async function resolveAttack(ctx, deps) {
  const payload = buildAttackPayload(ctx);
  let raw;
  try {
    raw = await deps.performAttack(payload);
  } catch (error) {
    return {
      ok: false,
      payload,
      raw: error?.details ?? null,
      normalized: null,
      code: error?.code ?? null,
      error: error?.message || "Network or RPC error."
    };
  }
  if (!raw || raw.ok === false) {
    const code = raw?.error ?? null;
    return {
      ok: false,
      payload,
      raw: raw ?? null,
      normalized: raw ? normalizeResult(raw) : null,
      code,
      error: raw?.message || describeError(code)
    };
  }
  return { ok: true, payload, raw, normalized: normalizeResult(raw), code: null, error: null };
}

// hud/combat/basicAttackPayload.js
function buildBasicAttackCtx(input = {}) {
  const room = input.roomContext ?? {};
  return {
    mode: "weapon",
    attackerCharacterId: input.sourceCharacterId,
    targetCharacterId: input.targetCharacterId,
    targetBodyPartId: input.bodyPartId,
    distanceM: input.distance ?? 0,
    weaponId: input.weaponId,
    // Basic Weapon Attack v1 wires no modifier UI to the payload — see the
    // report's Modifiers section. An empty list matches
    // splitManualModifiers([]) => { manual_attack_bonus: 0, manual_attack_penalty: 0 },
    // i.e. "no manual modifier", never a fabricated bonus/penalty.
    modifiers: [],
    roomId: room.roomId,
    campaignId: room.campaignId,
    sceneId: room.sceneId,
    encounterId: room.encounterId,
    actorTokenId: room.actorTokenId,
    targetTokenId: room.targetTokenId
  };
}

// hud/models/combatHudContracts.js
var HUD_STATUS = Object.freeze({
  idle: "idle",
  loading: "loading",
  ready: "ready",
  empty: "empty",
  error: "error"
});
var HUD_SOURCE = Object.freeze({
  mock: "mock",
  supabase: "supabase"
});
var VIEWER_ROLES = Object.freeze({
  player: "player",
  gm: "gm"
});
var TOKEN_KINDS = Object.freeze({
  player: "player",
  npc: "npc",
  turret: "turret",
  mech: "mech",
  other: "other"
});
var ZONE_STATES = Object.freeze({
  healthy: "healthy",
  wounded: "wounded",
  serious: "serious",
  critical: "critical",
  disabled: "disabled"
});
var ZONE_STATE_ORDER = Object.freeze([
  ZONE_STATES.healthy,
  ZONE_STATES.wounded,
  ZONE_STATES.serious,
  ZONE_STATES.critical,
  ZONE_STATES.disabled
]);
var COMBAT_STATUS = Object.freeze({
  inactive: "inactive",
  active: "active",
  ended: "ended"
});
var SKILL_TYPES = Object.freeze({
  attackTechnique: "attackTechnique",
  targetedAbility: "targetedAbility",
  instantAbility: "instantAbility",
  toggleAbility: "toggleAbility",
  itemAction: "itemAction"
});
var SKILL_SOURCES = Object.freeze({
  perk: "perk",
  psionic: "psionic",
  implant: "implant",
  item: "item"
});
var ACTION_COSTS = Object.freeze({
  free: "FREE",
  move: "MOVE",
  main: "MAIN",
  turn: "TURN"
});
var COLOR_SEMANTICS = Object.freeze({
  attack: "attack",
  neutral: "neutral",
  psionic: "psionic",
  implant: "implant",
  intervention: "intervention",
  positive: "positive",
  negative: "negative"
});
var TARGETING_MODES = Object.freeze({
  none: "none",
  token: "token",
  multipleTokens: "multipleTokens",
  point: "point"
});
var MODIFIER_KINDS = Object.freeze({
  passive: "passive",
  active: "active",
  narrative: "narrative"
});
var MODIFIER_POLARITY = Object.freeze({
  positive: "positive",
  negative: "negative",
  neutral: "neutral"
});
var LOG_ENTRY_KINDS = Object.freeze({
  action: "action",
  system: "system",
  narrative: "narrative"
});
var EMPTY_REASONS = Object.freeze({
  noToken: "NO_TOKEN_SELECTED",
  noCharacterLink: "TOKEN_HAS_NO_CHARACTER",
  notOwner: "CHARACTER_NOT_CONTROLLED_BY_VIEWER"
});
var EMPTY_REASON_TEXT = Object.freeze({
  [EMPTY_REASONS.noToken]: "No token selected.",
  [EMPTY_REASONS.noCharacterLink]: "Selected token is not linked to a character.",
  [EMPTY_REASONS.notOwner]: "You do not control this character."
});
function createInactiveCombatSession() {
  return {
    id: null,
    status: COMBAT_STATUS.inactive,
    round: 0,
    currentParticipantId: null,
    participants: [],
    isViewerTurn: false
  };
}

// hud/runtime/runtimeBundleMapper.js
function str(v) {
  const s = String(v ?? "").trim();
  return s || null;
}
function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function bool(v, fallback = false) {
  return v === null || v === void 0 ? fallback : Boolean(v);
}
function arr(v) {
  return Array.isArray(v) ? v : [];
}
function sectionsOf(bundle) {
  return bundle?.sections && typeof bundle.sections === "object" ? bundle.sections : {};
}
function section(bundle, key) {
  const sections = sectionsOf(bundle);
  return sections[key] ?? bundle?.[key] ?? null;
}
function hasValue(v) {
  return v !== null && v !== void 0 && v !== "";
}
function normalizePartId(bp) {
  const raw = str(bp?.zone_id) ?? str(bp?.part_key) ?? str(bp?.code) ?? str(bp?.id) ?? "unknown";
  const v = raw.toLowerCase();
  const aliases = {
    head: "head",
    torso: "torso",
    body: "torso",
    chest: "torso",
    left_arm: "l_arm",
    l_arm: "l_arm",
    arm_left: "l_arm",
    right_arm: "r_arm",
    r_arm: "r_arm",
    arm_right: "r_arm",
    left_leg: "l_leg",
    l_leg: "l_leg",
    leg_left: "l_leg",
    right_leg: "r_leg",
    r_leg: "r_leg",
    leg_right: "r_leg"
  };
  return aliases[v] ?? v;
}
function zoneStateFromBodyPart(bp) {
  if (bool(bp?.destroyed) || bool(bp?.disabled)) return ZONE_STATES.disabled;
  if (num(bp?.critical) > 0) return ZONE_STATES.critical;
  if (num(bp?.serious) > 0) return ZONE_STATES.serious;
  if (num(bp?.minor) > 0) return ZONE_STATES.wounded;
  return ZONE_STATES.healthy;
}
var ZONE_LABELS = Object.freeze({
  head: "Head",
  torso: "Torso",
  l_arm: "Left Arm",
  r_arm: "Right Arm",
  l_leg: "Left Leg",
  r_leg: "Right Leg"
});
function mapZones(bodyParts) {
  if (!Array.isArray(bodyParts) || bodyParts.length === 0) return [];
  return bodyParts.map((bp) => {
    const id = normalizePartId(bp);
    return {
      id,
      label: str(bp?.name) ?? ZONE_LABELS[id] ?? id,
      state: zoneStateFromBodyPart(bp),
      canBeTargeted: bp?.can_be_targeted === false ? false : !bool(bp?.disabled) && !bool(bp?.destroyed)
    };
  });
}
function normalizePolarity(p) {
  const v = String(p ?? "").toLowerCase();
  if (v === "positive") return MODIFIER_POLARITY.positive;
  if (v === "negative") return MODIFIER_POLARITY.negative;
  return MODIFIER_POLARITY.neutral;
}
function mapEffect(ef) {
  return {
    id: str(ef?.id) ?? `ef-${Math.random().toString(36).slice(2)}`,
    name: str(ef?.effect_name) ?? str(ef?.name) ?? "Unknown effect",
    polarity: normalizePolarity(ef?.polarity),
    durationTurns: ef?.remaining_turns != null ? num(ef.remaining_turns) : null,
    description: str(ef?.description) ?? ""
  };
}
function mapEntity(bundle) {
  const char = bundle?.character ?? {};
  const state = bundle?.state ?? {};
  const combat = section(bundle, "combat") ?? {};
  const abilities = section(bundle, "abilities") ?? {};
  const flags = combat?.combat_flags ?? state?.combat_flags ?? {};
  const shieldCur = num(combat.shield_current ?? state.shield_current, 0);
  const shieldMax = num(combat.shield_max ?? state.shield_max, 0);
  const psiPool = arr(abilities?.resource_pools).find((pool) => {
    const code = String(pool?.code ?? pool?.resource_pool_code ?? "").toLowerCase();
    const name = String(pool?.name ?? "").toLowerCase();
    const source = String(pool?.source_type ?? "").toLowerCase();
    return code.includes("psi") || code.includes("psion") || name.includes("psi") || name.includes("\u043F\u0441\u0438") || source.includes("psion");
  });
  const psiCurrentRaw = combat.psi_current ?? state.psi_current ?? psiPool?.current_value ?? psiPool?.current;
  const psiMaxRaw = combat.psi_max ?? state.psi_max ?? psiPool?.max_value ?? psiPool?.max;
  const psiCur = hasValue(psiCurrentRaw) ? num(psiCurrentRaw, 0) : null;
  const psiMax = hasValue(psiMaxRaw) ? num(psiMaxRaw, 0) : null;
  const zones = mapZones(combat.body_parts ?? []);
  const effectsSection = section(bundle, "effects");
  const effects = Array.isArray(effectsSection) ? effectsSection.map(mapEffect) : [];
  return {
    summary: {
      id: str(char.id) ?? str(char.character_key) ?? "unknown",
      name: str(char.display_name) ?? str(char.character_key) ?? "Unknown",
      icon: null,
      characterType: "player",
      ownerPlayerId: str(char.owner_player_id),
      svgRef: "humanoid"
    },
    zones,
    shield: { current: shieldCur, max: shieldMax },
    armorByZone: [],
    psi: { current: psiCur, max: psiMax },
    actions: {
      main: !bool(flags?.main_action_spent, false),
      move: !bool(flags?.move_action_spent, false)
    },
    // All DB effects shown as status chips in the Player block.
    statuses: effects,
    effects: [],
    flags: {
      alive: bool(state.is_alive ?? combat.is_alive, true),
      conscious: bool(state.is_conscious ?? combat.is_conscious, true)
    },
    mech: null,
    pilot: null
  };
}
var EQUIPPED_FLAGS = ["is_equipped", "is_active", "is_primary", "equipped", "active"];
function hasEquippedFlag(w) {
  return !!w && EQUIPPED_FLAGS.some((k) => w[k] === true);
}
function pickActiveWeapon(armory, selectedWeaponId = null) {
  if (!armory || typeof armory !== "object") return null;
  const weapons = Array.isArray(armory.weapons) ? armory.weapons.filter(Boolean) : [];
  const selected = selectedWeaponId ? weapons.find((w) => str(w?.id) === selectedWeaponId) : null;
  if (selected) return selected;
  if (armory.equipped_weapon && typeof armory.equipped_weapon === "object") {
    return armory.equipped_weapon;
  }
  if (weapons.length === 0) return null;
  return weapons.find(hasEquippedFlag) ?? weapons[0];
}
function rawMagCaliberCode(m) {
  return str(m?.magazine_def?.caliber) ?? str(m?.caliber);
}
function readMagazine(mag) {
  if (!mag || typeof mag !== "object") return null;
  const max = num(mag.capacity ?? mag.magazine_def?.capacity ?? mag.max_rounds ?? mag.max, 0);
  const current2 = num(mag.current_rounds ?? mag.current, 0);
  const ammoType = str(mag.ammo_type_name) ?? str(mag.ammo_type?.name) ?? str(mag.ammo_type_key) ?? str(typeof mag.ammo_type === "string" ? mag.ammo_type : null) ?? "\u2014";
  const caliber = str(mag.magazine_def?.caliber) ?? str(mag.caliber) ?? str(mag.magazine_def?.caliber_name) ?? str(mag.caliber_name) ?? "";
  const caliberLabel = str(mag.magazine_def?.caliber_name) ?? str(mag.caliber_name) ?? caliber ?? "";
  return {
    id: str(mag.id) ?? `mag-${Math.random().toString(36).slice(2)}`,
    ammoType,
    description: str(mag.ammo_type_name) ?? str(mag.name) ?? "",
    current: current2,
    max,
    caliber,
    caliberLabel
  };
}
function readFireModes(w) {
  const objs = Array.isArray(w.available_fire_modes) && w.available_fire_modes.length ? w.available_fire_modes : Array.isArray(w.active_profile?.available_fire_modes) ? w.active_profile.available_fire_modes : [];
  if (objs.length) {
    return objs.map((m) => str(m?.name) ?? str(m?.code) ?? str(m)).filter(Boolean);
  }
  if (Array.isArray(w.fire_modes)) return w.fire_modes.map((m) => str(m)).filter(Boolean);
  return [];
}
function readCurrentFireMode(w) {
  const fm = w.selected_fire_mode ?? w.active_profile?.selected_fire_mode ?? null;
  if (fm && typeof fm === "object") return str(fm.name) ?? str(fm.code);
  return str(w.current_fire_mode);
}
function readFireModeOption(m) {
  if (!m || typeof m !== "object") return null;
  const id = str(m.id);
  if (!id) return null;
  const code = str(m.code);
  return { id, code, name: str(m.name) ?? code ?? id };
}
function readFireMode(w) {
  const rawAvailable = Array.isArray(w.available_fire_modes) && w.available_fire_modes.length ? w.available_fire_modes : Array.isArray(w.active_profile?.available_fire_modes) ? w.active_profile.available_fire_modes : [];
  const available = rawAvailable.map(readFireModeOption).filter(Boolean);
  const rawSelected = w.selected_fire_mode ?? w.active_profile?.selected_fire_mode ?? null;
  const selected = readFireModeOption(rawSelected);
  const isApplicable = available.length > 0;
  return {
    selectedId: selected?.id ?? null,
    selectedCode: selected?.code ?? null,
    selectedName: selected?.name ?? null,
    available,
    isApplicable,
    // A single available mode is shown read-only (no selector); 2+ makes it
    // interactive — see GunBlock.js / spec section B.
    isSelectable: isApplicable && available.length > 1
  };
}
function weaponSvgRef(w) {
  const cls = String(
    w.model?.weapon_class_name ?? w.model?.weapon_class ?? w.weapon_type_key ?? w.weapon_type ?? ""
  ).toLowerCase();
  if (/pistol|handgun|sidearm|revolver/.test(cls)) return "pistol";
  return "rifle";
}
function readReserveMagazines(armory, w, loadedMag) {
  const mags = Array.isArray(armory?.magazines) ? armory.magazines : [];
  const weaponCaliber = str(w.model?.caliber) ?? str(w.caliber);
  const loadedId = loadedMag?.id ?? null;
  if (mags.length) {
    return mags.filter((m) => m && (str(m.id) ?? null) !== loadedId).filter((m) => !weaponCaliber || !rawMagCaliberCode(m) || rawMagCaliberCode(m) === weaponCaliber).map(readMagazine).filter(Boolean);
  }
  if (Array.isArray(w.reserve_magazines) && w.reserve_magazines.length) {
    return w.reserve_magazines.filter((m) => m && (str(m.id) ?? null) !== loadedId).map(readMagazine).filter(Boolean);
  }
  const profileMags = Array.isArray(w.compatible_magazines) && w.compatible_magazines.length ? w.compatible_magazines : Array.isArray(w.active_profile?.compatible_magazines) ? w.active_profile.compatible_magazines : [];
  if (!profileMags.length) return [];
  return profileMags.filter((m) => m && (str(m.id) ?? null) !== loadedId).map(readMagazine).filter(Boolean);
}
function mapWeapon(armory, selectedWeaponId = null) {
  const w = pickActiveWeapon(armory, selectedWeaponId);
  if (!w) return null;
  const isMelee = !str(w.model?.caliber) && !str(w.caliber);
  const rawMag = w.loaded_magazine ?? w.active_profile?.loaded_magazine ?? null;
  const loadedMag = readMagazine(rawMag);
  const fireModes = readFireModes(w);
  const currentFireMode = readCurrentFireMode(w) ?? fireModes[0] ?? null;
  const reserve = readReserveMagazines(armory, w, loadedMag);
  const usesMagazine = w.uses_magazine != null ? bool(w.uses_magazine) : !isMelee;
  const requiresAmmo = w.requires_ammo != null ? bool(w.requires_ammo) : !isMelee;
  const usesConsumable = bool(w.uses_consumable, false);
  const canReload = w.can_reload != null ? bool(w.can_reload) : !isMelee && reserve.length > 0;
  return {
    id: str(w.id) ?? "wpn-unknown",
    name: str(w.name) ?? str(w.weapon_name) ?? "Unknown Weapon",
    activeProfileId: str(w.active_profile?.id) ?? str(w.active_profile_id),
    svgRef: weaponSvgRef(w),
    fireModes,
    currentFireMode,
    fireMode: readFireMode(w),
    usesMagazine,
    usesConsumable,
    requiresAmmo,
    loadedMagazine: loadedMag,
    reserveMagazines: reserve,
    ammo: {
      current: loadedMag ? loadedMag.current : num(w.ammo_current, 0),
      max: loadedMag ? loadedMag.max : num(w.ammo_max, 0)
    },
    reloadCandidateId: reserve[0]?.id ?? null,
    canReload,
    disabledReason: str(w.disabled_reason)
  };
}
function buildCanonicalArmory(armory, inventory) {
  const base = armory && typeof armory === "object" && armory.ok !== false ? armory : null;
  if (!base || !Array.isArray(base.weapons)) return null;
  const invMags = Array.isArray(inventory?.magazines) ? inventory.magazines : [];
  const armoryMags = Array.isArray(base.magazines) ? base.magazines : [];
  return {
    ...base,
    // Inventory magazines win (physical character magazines); armory.magazines is
    // the tolerant fallback when inventory is unavailable / errored.
    magazines: invMags.length ? invMags : armoryMags
  };
}
function normalizeEnum(v, validSet, fallback) {
  const s = String(v ?? "");
  return validSet.has(s) ? s : fallback;
}
var VALID_SKILL_TYPES = new Set(Object.values(SKILL_TYPES));
var VALID_SKILL_SOURCES = new Set(Object.values(SKILL_SOURCES));
var VALID_COLORS = new Set(Object.values(COLOR_SEMANTICS));
var VALID_TARGETING = new Set(Object.values(TARGETING_MODES));
var VALID_COSTS = new Set(Object.values(ACTION_COSTS));
function mapSkillSource(v) {
  const source = String(v ?? "").toLowerCase();
  if (source.includes("psion")) return SKILL_SOURCES.psionic;
  if (source.includes("implant") || source.includes("prosthetic") || source.includes("equipment") || source.includes("device")) {
    return SKILL_SOURCES.implant;
  }
  if (source.includes("item")) return SKILL_SOURCES.item;
  return SKILL_SOURCES.perk;
}
function mapWeaponOption(armory, weapon, selectedWeaponId) {
  const vm = mapWeapon({ ...armory, weapons: [weapon] }, str(weapon?.id));
  const cls = str(weapon?.model?.weapon_class_name) ?? str(weapon?.model?.weapon_class);
  const mag = vm?.loadedMagazine ?? null;
  return {
    id: str(weapon?.id) ?? "wpn-unknown",
    name: str(weapon?.name) ?? str(weapon?.weapon_name) ?? "Unknown Weapon",
    type: cls,
    selected: vm?.id === selectedWeaponId,
    ammoLabel: mag ? `${mag.current}/${mag.max}` : vm?.requiresAmmo ? "no magazine" : "\u2014"
  };
}
function mapWeaponInventory(armory, selectedWeaponId) {
  const weapons = arr(armory?.weapons);
  return weapons.map((weapon) => mapWeaponOption(armory, weapon, selectedWeaponId));
}
function mapSkillColor(v) {
  const source = String(v ?? "").toLowerCase();
  if (source.includes("psion")) return COLOR_SEMANTICS.psionic;
  if (source.includes("implant") || source.includes("prosthetic") || source.includes("equipment") || source.includes("device")) {
    return COLOR_SEMANTICS.implant;
  }
  if (source.includes("weapon") || source.includes("attack")) return COLOR_SEMANTICS.attack;
  if (source.includes("positive") || source.includes("aid")) return COLOR_SEMANTICS.positive;
  return COLOR_SEMANTICS.neutral;
}
function normalizeActionCost(v) {
  const raw = String(v ?? "MAIN").toUpperCase();
  if (raw === "0" || raw === "FREE") return ACTION_COSTS.free;
  if (raw === "MOVE" || raw === "MV") return ACTION_COSTS.move;
  if (raw === "TURN") return ACTION_COSTS.turn;
  return normalizeEnum(raw, VALID_COSTS, ACTION_COSTS.main);
}
function mapSkillAction(qa) {
  const resourceCost = qa?.resource?.cost ?? qa?.resource_cost ?? null;
  const source = qa?.source_type ?? qa?.source;
  return {
    id: str(qa?.id) ?? `sk-${Math.random().toString(36).slice(2)}`,
    name: str(qa?.ability_name) ?? str(qa?.name) ?? "Unknown",
    type: normalizeEnum(qa?.ability_type ?? qa?.type, VALID_SKILL_TYPES, SKILL_TYPES.instantAbility),
    source: normalizeEnum(source, VALID_SKILL_SOURCES, mapSkillSource(source)),
    icon: str(qa?.icon_key) ?? str(qa?.icon) ?? "bolt",
    color: normalizeEnum(qa?.color_key ?? qa?.color, VALID_COLORS, mapSkillColor(source)),
    actionCost: normalizeActionCost(qa?.action_cost),
    resourceCost: resourceCost != null && Number(resourceCost) > 0 ? { type: str(qa?.resource?.pool_code) ?? "resource", amount: num(resourceCost, 0) } : null,
    cooldownTurns: num(qa?.cooldown_remaining_turns ?? qa?.cooldown_remaining ?? qa?.current_cooldown_rounds, 0),
    weaponRequirements: Array.isArray(qa?.weapon_requirements) ? qa.weapon_requirements.map(String) : [],
    targeting: normalizeEnum(qa?.targeting_mode ?? qa?.targeting, VALID_TARGETING, TARGETING_MODES.none),
    allowsMultipleTargets: bool(qa?.allows_multiple_targets, false),
    usesPoint: bool(qa?.uses_point, false),
    radius: qa?.radius != null ? num(qa.radius) : null,
    isToggled: bool(qa?.is_toggled, false),
    disabledReason: str(qa?.disabled_reason) ?? (qa?.is_enabled === false ? "Disabled" : null),
    tooltip: str(qa?.tooltip) ?? str(qa?.description) ?? str(qa?.level_data?.effect_data?.summary) ?? ""
  };
}
function mapSkills(abilitiesSection) {
  if (!abilitiesSection || typeof abilitiesSection !== "object") {
    return { library: [], quickSlots: [] };
  }
  const rawActions = Array.isArray(abilitiesSection.quick_actions) ? abilitiesSection.quick_actions : arr(abilitiesSection.abilities).filter((ability) => {
    const kind = String(ability?.ability_kind ?? "").toLowerCase();
    const activation = String(ability?.activation_type ?? "").toLowerCase();
    return ability?.is_hidden !== true && ability?.is_enabled !== false && kind !== "passive" && activation !== "passive";
  });
  const rawSlots = Array.isArray(abilitiesSection.quickbar_slots ?? abilitiesSection.quickbar) ? abilitiesSection.quickbar_slots ?? abilitiesSection.quickbar : [];
  const library = rawActions.map(mapSkillAction);
  const idSet = new Set(library.map((sk) => sk.id));
  const slotsSource = rawSlots.length ? rawSlots : library.map((sk, index) => ({ slot_index: index, ability_id: sk.id }));
  const quickSlots = slotsSource.map((s) => {
    const sid = str(s?.ability_id ?? s?.skill_id ?? s?.action_id);
    return {
      index: num(s?.slot_index ?? s?.index, 0),
      skillId: sid && idSet.has(sid) ? sid : null
    };
  }).sort((a, b) => a.index - b.index);
  return { library, quickSlots };
}
function mapModifiers(_bundle) {
  return { passive: [], active: [], narrative: [] };
}
function mapCombatSession() {
  return createInactiveCombatSession();
}
function mapBattleLog(bundle) {
  const log = section(bundle, "battle_log") ?? section(bundle, "log") ?? section(bundle, "combat_log");
  const entries2 = Array.isArray(log?.entries) ? log.entries : Array.isArray(log) ? log : [];
  return {
    entries: entries2.map((entry, index) => ({
      id: str(entry?.id) ?? `log-${index}`,
      sequence: num(entry?.sequence ?? index, index),
      kind: str(entry?.kind) ?? "system",
      actor: str(entry?.actor) ?? str(entry?.actor_name) ?? "",
      action: str(entry?.action) ?? str(entry?.message) ?? str(entry?.summary) ?? "",
      target: str(entry?.target) ?? str(entry?.target_name) ?? "",
      delta: str(entry?.delta) ?? "",
      summary: str(entry?.summary) ?? str(entry?.message) ?? "",
      detail: str(entry?.detail) ?? ""
    }))
  };
}
function isMapperDebugEnabled() {
  try {
    if (globalThis.localStorage?.getItem("odyssey.debug") === "1") return true;
  } catch (_e) {
  }
  try {
    return /[?&](odysseyDebug|debugHud)=1(?:&|$)/i.test(String(globalThis.location?.search ?? ""));
  } catch (_e) {
    return false;
  }
}
function logWeaponDiagnostics(bundle, weaponVM) {
  if (!isMapperDebugEnabled()) return;
  try {
    const armory = bundle?.armory ?? null;
    const raw = pickActiveWeapon(armory);
    const detectedActiveWeaponPath = !armory ? "no armory section" : armory.equipped_weapon ? "armory.equipped_weapon" : Array.isArray(armory.weapons) && armory.weapons.length ? armory.weapons.some(hasEquippedFlag) ? "armory.weapons[explicit-flag]" : "armory.weapons[0]" : "armory.weapons empty";
    console.info("[combatHud/mapper] weapon diagnostics", {
      runtimeArmoryKeys: armory && typeof armory === "object" ? Object.keys(armory) : null,
      weaponsCount: Array.isArray(armory?.weapons) ? armory.weapons.length : null,
      detectedActiveWeaponPath,
      rawWeaponKeys: raw && typeof raw === "object" ? Object.keys(raw) : null,
      mappedWeapon: weaponVM ? {
        name: weaponVM.name,
        svgRef: weaponVM.svgRef,
        currentFireMode: weaponVM.currentFireMode,
        ammo: weaponVM.ammo,
        hasMagazine: !!weaponVM.loadedMagazine,
        reserve: weaponVM.reserveMagazines.length
      } : null
    });
  } catch (_e) {
  }
}
function mapBundleToHudSnapshot(bundle, options = {}) {
  const empty = {
    entity: null,
    weapon: { primary: null, secondary: null },
    skills: { library: [], quickSlots: [] },
    combatSession: createInactiveCombatSession(),
    modifiers: { passive: [], active: [], narrative: [] },
    battleLog: { entries: [] }
  };
  if (!bundle || typeof bundle !== "object") return empty;
  let entity = null;
  try {
    entity = mapEntity(bundle);
  } catch (_e) {
    entity = null;
  }
  let weaponPrimary = null;
  const armory = section(bundle, "armory");
  const selectedWeaponId = str(options.selectedWeaponId) ?? null;
  try {
    weaponPrimary = armory ? mapWeapon(armory, selectedWeaponId) : null;
  } catch (_e) {
    weaponPrimary = null;
  }
  let skills = { library: [], quickSlots: [] };
  try {
    skills = mapSkills(section(bundle, "abilities"));
  } catch (_e) {
    skills = { library: [], quickSlots: [] };
  }
  let modifiers = { passive: [], active: [], narrative: [] };
  try {
    modifiers = mapModifiers(bundle);
  } catch (_e) {
    modifiers = { passive: [], active: [], narrative: [] };
  }
  logWeaponDiagnostics({ ...bundle, armory }, weaponPrimary);
  return {
    entity,
    weapon: {
      primary: weaponPrimary,
      secondary: null,
      available: armory ? mapWeaponInventory(armory, weaponPrimary?.id ?? selectedWeaponId) : []
    },
    skills,
    combatSession: mapCombatSession(),
    modifiers,
    battleLog: mapBattleLog(bundle)
  };
}
function buildRuntimeDebugSummary(bundle, hudSnapshot = null, context = {}) {
  const sections = sectionsOf(bundle);
  const armory = section(bundle, "armory");
  const abilities = section(bundle, "abilities");
  const effects = section(bundle, "effects");
  const combat = section(bundle, "combat");
  const weaponCount = arr(armory?.weapons).length + (armory?.equipped_weapon ? 1 : 0);
  const quickActionCount = Array.isArray(abilities?.quick_actions) ? abilities.quick_actions.length : arr(abilities?.abilities).filter((ability) => {
    const kind = String(ability?.ability_kind ?? "").toLowerCase();
    const activation = String(ability?.activation_type ?? "").toLowerCase();
    return ability?.is_hidden !== true && ability?.is_enabled !== false && kind !== "passive" && activation !== "passive";
  }).length;
  const topLevelKeys = bundle && typeof bundle === "object" ? Object.keys(bundle).filter((key) => !key.startsWith("__")).sort() : [];
  const missing = [];
  if (!armory) missing.push("armory section missing");
  else if (weaponCount === 0) missing.push("armory has no weapons");
  if (!abilities) missing.push("abilities section missing");
  else if (quickActionCount === 0) missing.push("no quick actions");
  if (!combat) missing.push("combat section missing");
  if (hudSnapshot?.entity?.psi?.current == null || hudSnapshot?.entity?.psi?.max == null) {
    missing.push("psi resource path missing");
  }
  return {
    selectionStatus: context.selectionStatus ?? null,
    selectedTokenId: context.selectedTokenId ?? null,
    characterId: context.characterId ?? bundle?.character?.id ?? null,
    requestedSections: arr(bundle?.__hudDebug?.requestedSections ?? context.requestedSections),
    returnedTopLevelKeys: topLevelKeys,
    returnedSections: {
      summary: !!bundle?.character || !!sections.summary,
      combat: !!combat,
      armory: !!armory,
      abilities: !!abilities,
      effects: Array.isArray(effects)
    },
    mapper: {
      player: hudSnapshot?.entity ? "populated" : "empty",
      weaponCount,
      activeWeaponFound: !!hudSnapshot?.weapon?.primary,
      quickActionCount,
      effectCount: Array.isArray(effects) ? effects.length : 0
    },
    broadcast: {
      hudSnapshotPresent: !!hudSnapshot,
      gunState: hudSnapshot?.weapon?.primary ? "ready" : "empty",
      skillsState: hudSnapshot?.skills?.library?.length ? "ready" : "empty"
    },
    reason: missing[0] ?? null
  };
}

// hud/scene/selectionState.js
var SELECTION_STATUS = Object.freeze({
  ready: "ready",
  loading: "loading",
  noSelection: "no-selection",
  multipleSelection: "multiple-selection",
  unlinkedToken: "unlinked-token",
  notOwned: "not-owned",
  unavailable: "unavailable",
  error: "error"
});
var ACCESS_REASON = Object.freeze({
  noToken: "NO_TOKEN_SELECTED",
  multipleTokens: "MULTIPLE_TOKENS_SELECTED",
  noLink: "TOKEN_HAS_NO_CHARACTER",
  notOwner: "CHARACTER_NOT_CONTROLLED_BY_VIEWER",
  ownershipUnverifiable: "OWNERSHIP_UNVERIFIABLE",
  backendUnconfigured: "BACKEND_UNCONFIGURED",
  runtimeUnavailable: "RUNTIME_UNAVAILABLE"
});
var PRIMARY_MODULE_ID = "player";
var SECONDARY_MODULE_IDS = Object.freeze(["gun", "skills", "combatControl", "log"]);
function isReadyStatus(status) {
  return status === SELECTION_STATUS.ready;
}
function normalizeSelectionIds(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const v of raw) {
    const s = String(v ?? "").trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}
function normalizeViewer(raw) {
  const playerId = String(raw?.playerId ?? raw?.id ?? "").trim() || null;
  let role = String(raw?.role ?? "").trim().toUpperCase();
  if (role !== "PLAYER" && role !== "GM") role = "UNKNOWN";
  return { playerId, role };
}
function emptyState(status, viewer, reason, extra) {
  return {
    status,
    selectedItemId: null,
    characterId: null,
    viewer: normalizeViewer(viewer),
    access: { canView: false, reason: reason ?? null },
    runtimeBundle: null,
    view: null,
    error: { code: null, message: null },
    ...extra
  };
}
function createInitialSelectionState(viewer) {
  return emptyState(SELECTION_STATUS.loading, viewer, null);
}
function buildView(bundle, viewer) {
  const character = bundle?.character ?? {};
  const state = bundle?.state ?? {};
  const ownerId = String(character.owner_player_id ?? "").trim() || null;
  return {
    name: String(character.display_name ?? character.character_key ?? "").trim() || null,
    characterKey: character.character_key ?? null,
    ownerName: String(character.owner_player_name ?? "").trim() || null,
    ownerPlayerId: ownerId,
    gmView: viewer.role === "GM",
    isAlive: state.is_alive !== false,
    isConscious: state.is_conscious !== false,
    statusSummary: String(state.status_summary ?? "").trim() || null
  };
}
function deriveSelectionState(input) {
  const viewer = normalizeViewer(input?.viewer);
  const ids = normalizeSelectionIds(input?.selectionIds);
  const single = ids.length === 1 ? ids[0] : null;
  if (input?.failure) {
    const f = input.failure;
    return emptyState(f.status === "unavailable" ? SELECTION_STATUS.unavailable : SELECTION_STATUS.error, viewer, f.code, {
      selectedItemId: single,
      characterId: input?.link?.characterId ?? null,
      error: { code: f.code ?? null, message: f.message ?? null }
    });
  }
  if (ids.length === 0) return emptyState(SELECTION_STATUS.noSelection, viewer, ACCESS_REASON.noToken);
  if (ids.length > 1) return emptyState(SELECTION_STATUS.multipleSelection, viewer, ACCESS_REASON.multipleTokens);
  const link = input?.link ?? null;
  if (!link || !link.characterId) {
    return emptyState(SELECTION_STATUS.unlinkedToken, viewer, ACCESS_REASON.noLink, { selectedItemId: single });
  }
  const bundle = input?.bundle ?? null;
  if (!bundle || bundle.ok === false) {
    return emptyState(SELECTION_STATUS.unavailable, viewer, ACCESS_REASON.runtimeUnavailable, {
      selectedItemId: single,
      characterId: link.characterId,
      error: { code: bundle?.error ?? ACCESS_REASON.runtimeUnavailable, message: bundle?.message ?? null }
    });
  }
  const ownerId = String(bundle.character?.owner_player_id ?? "").trim() || null;
  if (viewer.role === "GM") {
    return readyState(viewer, single, link.characterId, bundle);
  }
  if (!ownerId) {
    return emptyState(SELECTION_STATUS.unavailable, viewer, ACCESS_REASON.ownershipUnverifiable, {
      selectedItemId: single,
      characterId: link.characterId,
      error: { code: ACCESS_REASON.ownershipUnverifiable, message: "Runtime bundle did not provide owner_player_id." }
    });
  }
  if (ownerId !== viewer.playerId) {
    return emptyState(SELECTION_STATUS.notOwned, viewer, ACCESS_REASON.notOwner, {
      selectedItemId: single,
      characterId: link.characterId
    });
  }
  return readyState(viewer, single, link.characterId, bundle);
}
function readyState(viewer, selectedItemId, characterId, bundle) {
  return {
    status: SELECTION_STATUS.ready,
    selectedItemId,
    characterId,
    viewer,
    access: { canView: true, reason: null },
    runtimeBundle: bundle,
    view: buildView(bundle, viewer),
    error: { code: null, message: null }
  };
}
function buildReloadDebugInfo(hudSnapshot, ephemeral) {
  const weapon = hudSnapshot?.weapon?.primary ?? null;
  const reserve = Array.isArray(weapon?.reserveMagazines) ? weapon.reserveMagazines : [];
  const insertedId = weapon?.loadedMagazine?.id ?? null;
  const selectedId = ephemeral.selectedReloadMagazineId ?? null;
  const selectedMag = selectedId ? reserve.find((m) => m.id === selectedId) ?? null : null;
  const profileId = weapon?.activeProfileId ?? null;
  const candidateMagId = resolveReloadMagazineId(null, ephemeral, weapon);
  let reloadUiAllowed = true;
  let reloadUiBlockReason = null;
  if (!weapon) {
    reloadUiAllowed = false;
    reloadUiBlockReason = "NO_WEAPON";
  } else if (!weapon.usesMagazine) {
    reloadUiAllowed = false;
    reloadUiBlockReason = "WEAPON_DOES_NOT_USE_MAGAZINE";
  } else if (!weapon.id) {
    reloadUiAllowed = false;
    reloadUiBlockReason = "MISSING_WEAPON_ID";
  } else if (!profileId) {
    reloadUiAllowed = false;
    reloadUiBlockReason = "MISSING_PROFILE_ID";
  } else if (!candidateMagId) {
    reloadUiAllowed = false;
    reloadUiBlockReason = "NO_ELIGIBLE_MAGAZINE";
  }
  return {
    selectedWeaponId: weapon?.id ?? null,
    selectedWeaponProfileId: profileId,
    selectedReloadMagazineId: candidateMagId,
    selectedReloadMagazine: selectedMag ? {
      rounds: selectedMag.current,
      capacity: selectedMag.max,
      caliber: selectedMag.caliber,
      isInserted: selectedMag.id === insertedId,
      isCompatible: true
      // present in the eligibility-filtered reserve list
    } : null,
    reloadUiAllowed,
    reloadUiBlockReason,
    reloadPayload: weapon?.id && profileId && candidateMagId ? { character_weapon_id: weapon.id, profile_id: profileId, character_magazine_id: candidateMagId } : null,
    reloadRpcResult: ephemeral.reloadRpcResult ?? null
  };
}
function buildFireModeDebugInfo(hudSnapshot, ephemeral) {
  const weapon = hudSnapshot?.weapon?.primary ?? null;
  const fireMode = weapon?.fireMode ?? null;
  return {
    selectedWeaponId: weapon?.id ?? null,
    activeProfileId: weapon?.activeProfileId ?? null,
    fireModeApplicable: !!fireMode?.isApplicable,
    selectedFireModeId: fireMode?.selectedId ?? null,
    selectedFireModeCode: fireMode?.selectedCode ?? null,
    availableFireModeIds: Array.isArray(fireMode?.available) ? fireMode.available.map((m) => m.id) : [],
    fireModeSelectorOpen: !!ephemeral.fireModeSelectorOpen,
    fireModeUpdatePath: resolveFireModeUpdatePath(weapon),
    fireModeLastResult: ephemeral.fireModeRpcResult ?? null
  };
}
function buildBasicAttackEvalCtx(characterId, hudSnapshot, ephemeral) {
  const weapon = hudSnapshot?.weapon?.primary ?? null;
  const targeting = ephemeral.targeting ?? {};
  return {
    sourceCharacterId: characterId ?? null,
    weaponId: weapon?.id ?? null,
    targetTokenId: Array.isArray(targeting.selectedTargetIds) ? targeting.selectedTargetIds[0] ?? null : null,
    targetCharacterId: targeting.selectedTargetCharacterId ?? null,
    bodyZoneId: targeting.selectedBodyPartId ?? null,
    resolvedBodyPartId: targeting.resolvedBodyPartId ?? null,
    inFlight: !!ephemeral.basicAttackInFlight
  };
}
function buildBasicAttackDebugInfo(characterId, hudSnapshot, ephemeral) {
  const weapon = hudSnapshot?.weapon?.primary ?? null;
  const evalCtx = buildBasicAttackEvalCtx(characterId, hudSnapshot, ephemeral);
  const evalResult = evaluateBasicAttack(evalCtx);
  let payload = null;
  if (evalResult.uiAllowed) {
    try {
      payload = buildAttackPayload(buildBasicAttackCtx({
        sourceCharacterId: evalCtx.sourceCharacterId,
        weaponId: evalCtx.weaponId,
        targetCharacterId: evalCtx.targetCharacterId,
        bodyPartId: evalCtx.resolvedBodyPartId,
        distance: ephemeral.targeting?.distance ?? 0
      }));
    } catch (_e) {
      payload = null;
    }
  }
  return {
    sourceCharacterId: evalCtx.sourceCharacterId,
    targetTokenId: evalCtx.targetTokenId,
    targetCharacterId: evalCtx.targetCharacterId,
    weaponId: evalCtx.weaponId,
    profileId: weapon?.activeProfileId ?? null,
    selectedFireModeId: weapon?.fireMode?.selectedId ?? null,
    bodyZone: evalCtx.bodyZoneId,
    distance: ephemeral.targeting?.distance ?? null,
    uiAllowed: evalResult.uiAllowed,
    uiBlockReason: evalResult.uiBlockReason,
    payload,
    inFlight: evalCtx.inFlight,
    result: ephemeral.basicAttackResult ?? { ok: null, error: null, message: null }
  };
}
function buildBroadcastPayload(state, ephemeral = {}) {
  const s = state ?? createInitialSelectionState(null);
  const ready = s.status === SELECTION_STATUS.ready && s.access?.canView === true;
  const activeIntent = ephemeral.activeIntent ?? (ephemeral.preparedAction?.kind === "skill" && ephemeral.preparedAction?.id ? { kind: "skill", id: ephemeral.preparedAction.id } : { kind: "weapon-attack", weaponId: ephemeral.selectedWeaponId ?? null });
  let hudSnapshot = null;
  if (ready && s.runtimeBundle) {
    try {
      hudSnapshot = mapBundleToHudSnapshot(s.runtimeBundle, ephemeral);
    } catch (_e) {
    }
  }
  const debug = ready && s.runtimeBundle ? buildRuntimeDebugSummary(s.runtimeBundle, hudSnapshot, {
    selectionStatus: s.status,
    selectedTokenId: s.selectedItemId ?? null,
    characterId: s.characterId ?? null
  }) : null;
  if (debug) {
    const weapon = hudSnapshot?.weapon?.primary ?? null;
    const inserted = weapon?.loadedMagazine ?? null;
    debug.live = {
      activeCharacterId: s.characterId ?? null,
      selectedWeaponId: ephemeral.selectedWeaponId ?? weapon?.id ?? null,
      weaponSelectorOpen: !!ephemeral.weaponSelectorOpen,
      selectedWeaponResolved: !!weapon,
      insertedMagazine: {
        present: !!inserted,
        rounds: inserted ? Number(inserted.current ?? 0) : null,
        capacity: inserted ? Number(inserted.max ?? 0) : null
      },
      compatibleReserveMagazineCount: Array.isArray(weapon?.reserveMagazines) ? weapon.reserveMagazines.length : 0,
      targetingMode: ephemeral.targeting?.mode ?? "none",
      sourceTokenId: s.selectedItemId ?? null,
      selectedObrTokenId: s.selectedItemId ?? null,
      resolvedTargetTokenId: Array.isArray(ephemeral.targeting?.selectedTargetIds) ? ephemeral.targeting.selectedTargetIds[0] ?? null : null
    };
    if (ephemeral.debugEnabled) {
      debug.reload = buildReloadDebugInfo(hudSnapshot, ephemeral);
      debug.fireMode = buildFireModeDebugInfo(hudSnapshot, ephemeral);
      debug.basicAttack = buildBasicAttackDebugInfo(s.characterId, hudSnapshot, ephemeral);
    }
  }
  const basicAttackEval = ready ? evaluateBasicAttack(buildBasicAttackEvalCtx(s.characterId, hudSnapshot, ephemeral)) : { uiAllowed: false, uiBlockReason: "No character loaded." };
  return {
    status: s.status,
    selectedItemId: s.selectedItemId ?? null,
    characterId: ready ? s.characterId ?? null : null,
    viewer: { playerId: s.viewer?.playerId ?? null, role: s.viewer?.role ?? "UNKNOWN" },
    access: { canView: !!s.access?.canView, reason: s.access?.reason ?? null },
    view: ready ? s.view ?? null : null,
    // Normalized HUD view models — block renderers use this; full bundle is NOT included.
    hudSnapshot: ready ? hudSnapshot : null,
    ui: {
      selectedWeaponId: ephemeral.selectedWeaponId ?? null,
      selectedReloadMagazineId: ephemeral.selectedReloadMagazineId ?? null,
      weaponSelectorOpen: !!ephemeral.weaponSelectorOpen,
      fireModeSelectorOpen: !!ephemeral.fireModeSelectorOpen,
      preparedAction: ephemeral.preparedAction ?? null,
      targeting: ephemeral.targeting ?? null,
      commandStatus: ephemeral.commandStatus ?? null,
      activeIntent,
      basicAttack: {
        inFlight: !!ephemeral.basicAttackInFlight,
        uiAllowed: basicAttackEval.uiAllowed,
        uiBlockReason: basicAttackEval.uiBlockReason
      }
    },
    debug: ready ? debug : null,
    error: { code: s.error?.code ?? null, message: s.error?.message ?? null }
  };
}
function createGenerationGate() {
  let current2 = 0;
  return {
    next() {
      current2 += 1;
      return current2;
    },
    isCurrent(token) {
      return token === current2;
    },
    get current() {
      return current2;
    }
  };
}

// hud/scene/sceneSelectionAdapter.js
function errMessage(err) {
  return String((err && (err.message || err)) ?? "Unknown error");
}
function pickLink(res, tokenId) {
  const links = Array.isArray(res?.links) ? res.links : [];
  const match = links.find(
    (l) => String(l?.token_id ?? "").trim() === tokenId && l?.is_active !== false
  );
  if (!match || !match.character || !match.character.id) return null;
  return {
    characterId: String(match.character.id).trim() || null,
    characterName: match.character.display_name ?? null,
    raw: match
  };
}
function createSceneSelectionAdapter(deps) {
  const {
    fetchSceneTokenLink,
    fetchCharacterBundle,
    getViewer,
    backendConfigured = true
  } = deps ?? {};
  const gate = createGenerationGate();
  async function resolve(selectionIds) {
    const ids = normalizeSelectionIds(selectionIds);
    const viewer = typeof getViewer === "function" ? getViewer() : null;
    if (!backendConfigured) {
      return deriveSelectionState({
        viewer,
        selectionIds: ids,
        failure: {
          status: "unavailable",
          code: ACCESS_REASON.backendUnconfigured,
          message: "Supabase backend is not configured for this room."
        }
      });
    }
    if (ids.length !== 1) return deriveSelectionState({ viewer, selectionIds: ids });
    const tokenId = ids[0];
    let link = null;
    try {
      const res = await fetchSceneTokenLink(tokenId);
      if (res && res.ok === false) {
        return deriveSelectionState({
          viewer,
          selectionIds: ids,
          failure: { status: "error", code: "LINK_FETCH_FAILED", message: res.message || "Scene token links unavailable." }
        });
      }
      link = pickLink(res, tokenId);
    } catch (err) {
      return deriveSelectionState({
        viewer,
        selectionIds: ids,
        failure: { status: "error", code: "LINK_FETCH_FAILED", message: errMessage(err) }
      });
    }
    if (!link || !link.characterId) {
      return deriveSelectionState({ viewer, selectionIds: ids, link: link || null });
    }
    let bundle = null;
    try {
      bundle = await fetchCharacterBundle(link.characterId);
    } catch (err) {
      return deriveSelectionState({
        viewer,
        selectionIds: ids,
        link,
        failure: { status: "error", code: "RUNTIME_FETCH_FAILED", message: errMessage(err) }
      });
    }
    return deriveSelectionState({ viewer, selectionIds: ids, link, bundle });
  }
  async function resolveLatest(selectionIds) {
    const token = gate.next();
    const state = await resolve(selectionIds);
    return { stale: !gate.isCurrent(token), state };
  }
  return { resolve, resolveLatest, SELECTION_STATUS };
}

// hud/scene/sceneSelectionController.js
var SCENE_RERESOLVE_DEBOUNCE_MS = 600;
var HUD_RUNTIME_SECTIONS = Object.freeze(["summary", "combat", "armory", "abilities", "effects"]);
function setupSceneSelection(hooks = {}) {
  if (typeof lib_default === "undefined" || lib_default.isAvailable === false) return () => {
  };
  const onSelectionState = typeof hooks.onSelectionState === "function" ? hooks.onSelectionState : null;
  const shouldDeferSelection = typeof hooks.shouldDeferSelection === "function" ? hooks.shouldDeferSelection : () => false;
  let disposed = false;
  let lastPayload = null;
  let lastState = null;
  let sceneTimer = null;
  let currentSelectionIds = [];
  const ephemeral = {
    characterId: null,
    selectedWeaponId: null,
    selectedReloadMagazineId: null,
    weaponSelectorOpen: false,
    preparedAction: null,
    targeting: { mode: "none", selectedTargetIds: [], selectedBodyPartId: "torso" },
    commandStatus: null,
    // Raw { ok, error, message } from the last loadWeaponProfileMagazine RPC
    // call, so ?debug=1 can show the server's actual verdict — see
    // buildReloadDebugInfo() in selectionState.js.
    reloadRpcResult: null,
    // Fire Mode v1: companion-popover open flag (ephemeral, like
    // weaponSelectorOpen) + the last switch_weapon_fire_mode outcome for
    // ?debug=1 — see buildFireModeDebugInfo() in selectionState.js. There is
    // NO ephemeral "selected fire mode id" override: the current mode always
    // comes fresh from armory (weapon.fireMode.selectedId), so switching
    // weapons away and back never carries a mode over from a different weapon.
    fireModeSelectorOpen: false,
    fireModeRpcResult: null,
    // Basic Weapon Attack v1: true only for the duration of an in-flight
    // perform_attack call — blocks double-submit (see handleCommand's
    // "execute" branch) and disables the Action button client-side.
    basicAttackInFlight: false,
    // Last outcome for ?debug=1 / the commandStatus toast — never a
    // fabricated hit/miss/damage, only what buildBasicAttackDebugInfo()
    // forwards from the real server response or exception.
    basicAttackResult: null
  };
  let debugEnabled = false;
  try {
    debugEnabled = new URLSearchParams(window.location.search).get("debug") === "1";
  } catch (_e) {
    debugEnabled = false;
  }
  const cleanups2 = [];
  function broadcast(payload) {
    try {
      lib_default.broadcast.sendMessage(BC_HUD_SELECTION, payload, { destination: "LOCAL" });
    } catch (_e) {
    }
  }
  async function init() {
    const [player, context, settings] = await Promise.all([
      getPlayerInfo(),
      getRoomSceneContext(),
      loadRoomSupabaseSettings()
    ]);
    if (disposed) return;
    let viewer = normalizeViewer({ playerId: player.id, role: player.role });
    const configured = hasSupabaseSettings(settings);
    const adapter = createSceneSelectionAdapter({
      backendConfigured: configured,
      getViewer: () => viewer,
      fetchSceneTokenLink: (tokenId) => getSceneTokenLinks(
        { room_id: context.roomId, scene_id: context.sceneId, campaign_id: context.campaignId, token_id: tokenId },
        settings
      ),
      fetchCharacterBundle: async (characterId) => {
        const [bundle, armory, inventory] = await Promise.all([
          getCharacterRuntimeBundle(
            { character_id: characterId, sections: HUD_RUNTIME_SECTIONS },
            settings
          ),
          getCharacterArmory(characterId, settings).catch(() => null),
          getCharacterInventory(characterId, settings).catch(() => null)
        ]);
        if (!bundle || typeof bundle !== "object") return bundle;
        const merged = { ...bundle, __hudDebug: { requestedSections: HUD_RUNTIME_SECTIONS } };
        const canonicalArmory = buildCanonicalArmory(armory, inventory);
        if (canonicalArmory) {
          merged.armory = canonicalArmory;
          if (merged.sections && typeof merged.sections === "object") {
            merged.sections = { ...merged.sections, armory: canonicalArmory };
          }
        }
        return merged;
      }
    });
    function resetEphemeralForCharacter(characterId) {
      if (ephemeral.characterId === characterId) return;
      ephemeral.characterId = characterId ?? null;
      ephemeral.selectedWeaponId = null;
      ephemeral.selectedReloadMagazineId = null;
      ephemeral.weaponSelectorOpen = false;
      ephemeral.preparedAction = null;
      ephemeral.targeting = { mode: "none", selectedTargetIds: [], selectedBodyPartId: "torso" };
      ephemeral.commandStatus = null;
      ephemeral.reloadRpcResult = null;
      ephemeral.fireModeSelectorOpen = false;
      ephemeral.fireModeRpcResult = null;
      ephemeral.basicAttackResult = null;
    }
    function buildEphemeralForPayload() {
      const prepared = ephemeral.preparedAction;
      const activeIntent = prepared?.kind === "skill" && prepared.id ? { kind: "skill", id: prepared.id } : { kind: "weapon-attack", weaponId: ephemeral.selectedWeaponId };
      return {
        selectedWeaponId: ephemeral.selectedWeaponId,
        selectedReloadMagazineId: ephemeral.selectedReloadMagazineId,
        weaponSelectorOpen: ephemeral.weaponSelectorOpen,
        preparedAction: ephemeral.preparedAction,
        targeting: ephemeral.targeting,
        commandStatus: ephemeral.commandStatus,
        activeIntent,
        debugEnabled,
        reloadRpcResult: ephemeral.reloadRpcResult,
        fireModeSelectorOpen: ephemeral.fireModeSelectorOpen,
        fireModeRpcResult: ephemeral.fireModeRpcResult,
        basicAttackInFlight: ephemeral.basicAttackInFlight,
        basicAttackResult: ephemeral.basicAttackResult
      };
    }
    function publishState(state) {
      lastPayload = buildBroadcastPayload(state, buildEphemeralForPayload());
      broadcast(lastPayload);
      return lastPayload;
    }
    async function refetchCurrent() {
      if (currentSelectionIds.length === 1) await resolveAndPublish(currentSelectionIds);
      else if (lastState) publishState(lastState);
    }
    function applyTargetingPayload(payload) {
      const target = payload?.target && typeof payload.target === "object" ? payload.target : null;
      ephemeral.targeting = {
        mode: payload?.mode === "picking" ? "picking" : "none",
        selectedTargetIds: target?.tokenId ? [String(target.tokenId)] : [],
        selectedTargetName: target?.displayName ?? null,
        // NOTE: selectedBodyPartId here is the WIRE ZONE CODE (e.g. "TORSO"),
        // an existing, unchanged field used for display/highlight. The REAL
        // per-character body-part uuid perform_attack needs is the separate
        // resolvedBodyPartId field below — never conflate the two.
        selectedBodyPartId: target?.selectedZoneId ?? "torso",
        selectedTargetCharacterId: target?.characterId ?? null,
        resolvedBodyPartId: target?.resolvedBodyPartId ?? null,
        distance: Number.isFinite(Number(target?.distance?.value)) ? Number(target.distance.value) : null,
        error: payload?.error ?? null
      };
      if (lastState) publishState(lastState);
    }
    async function handleCommand(command) {
      if (!command || typeof command !== "object") return;
      if (!lastPayload || lastPayload.status !== "ready") return;
      if (command?.scope === "combat-hud" && command?.feature === "fire-mode") {
        const fmType = String(command.type ?? "");
        if (fmType === "toggle-selector") {
          ephemeral.fireModeSelectorOpen = !ephemeral.fireModeSelectorOpen;
          if (lastState) publishState(lastState);
          return;
        }
        if (fmType === "close-selector") {
          ephemeral.fireModeSelectorOpen = false;
          if (lastState) publishState(lastState);
          return;
        }
        if (fmType === "select") {
          const weapon = lastPayload.hudSnapshot?.weapon?.primary ?? null;
          const weaponId = weapon?.id ?? null;
          const profileId = weapon?.activeProfileId ?? null;
          const fireModeId = String(command.fireModeId ?? "").trim() || null;
          ephemeral.fireModeSelectorOpen = false;
          ephemeral.commandStatus = null;
          if (!weaponId || !profileId || !fireModeId) {
            ephemeral.commandStatus = { type: "error", message: "Fire mode switch unavailable: missing weapon, profile, or mode." };
            ephemeral.fireModeRpcResult = { ok: false, error: "MISSING_FIELDS", message: "weaponId/profileId/fireModeId missing before RPC call." };
            if (lastState) publishState(lastState);
            return;
          }
          try {
            await switchWeaponFireMode(ephemeral.characterId, weaponId, fireModeId, settings);
            ephemeral.fireModeRpcResult = normalizeFireModeRpcResult(null);
            ephemeral.commandStatus = { type: "ok", message: "Fire mode changed." };
            await refetchCurrent();
          } catch (error) {
            const normalized = normalizeFireModeRpcResult(error);
            ephemeral.fireModeRpcResult = normalized;
            ephemeral.commandStatus = { type: "error", message: normalized.message || "Fire mode switch failed." };
            if (lastState) publishState(lastState);
          }
          return;
        }
        return;
      }
      if (command?.scope === "combat-hud" && command?.feature === "basic-attack") {
        const baType = String(command.type ?? "");
        if (baType !== "execute") return;
        if (ephemeral.basicAttackInFlight) return;
        const weapon = lastPayload.hudSnapshot?.weapon?.primary ?? null;
        const targeting = ephemeral.targeting ?? {};
        const evalCtx = {
          sourceCharacterId: ephemeral.characterId,
          weaponId: weapon?.id ?? null,
          targetTokenId: targeting.selectedTargetIds?.[0] ?? null,
          targetCharacterId: targeting.selectedTargetCharacterId ?? null,
          bodyZoneId: targeting.selectedBodyPartId ?? null,
          resolvedBodyPartId: targeting.resolvedBodyPartId ?? null,
          inFlight: false
        };
        const evalResult = evaluateBasicAttack(evalCtx);
        ephemeral.commandStatus = null;
        if (!evalResult.uiAllowed) {
          ephemeral.commandStatus = { type: "error", message: evalResult.uiBlockReason };
          ephemeral.basicAttackResult = { ok: false, error: "PRECONDITION_FAILED", message: evalResult.uiBlockReason };
          if (lastState) publishState(lastState);
          return;
        }
        const requestCtx = { sourceCharacterId: evalCtx.sourceCharacterId, weaponId: evalCtx.weaponId, targetCharacterId: evalCtx.targetCharacterId };
        const ctx = buildBasicAttackCtx({
          sourceCharacterId: evalCtx.sourceCharacterId,
          weaponId: evalCtx.weaponId,
          targetCharacterId: evalCtx.targetCharacterId,
          bodyPartId: evalCtx.resolvedBodyPartId,
          distance: targeting.distance ?? 0
        });
        ephemeral.basicAttackInFlight = true;
        if (lastState) publishState(lastState);
        let outcome;
        try {
          outcome = await resolveAttack(ctx, { performAttack: (payload) => performAttack(payload, settings) });
        } catch (error) {
          outcome = { ok: false, payload: null, raw: null, normalized: null, code: null, error: String(error?.message ?? error ?? "Attack failed.") };
        }
        ephemeral.basicAttackInFlight = false;
        const currentCtx = {
          sourceCharacterId: ephemeral.characterId,
          weaponId: lastPayload.hudSnapshot?.weapon?.primary?.id ?? null,
          targetCharacterId: ephemeral.targeting?.selectedTargetCharacterId ?? null
        };
        const stale = isAttackResultStale(requestCtx, currentCtx);
        ephemeral.basicAttackResult = { ok: outcome.ok, error: outcome.code ?? null, message: outcome.error ?? null };
        if (stale) {
          if (lastState) publishState(lastState);
          return;
        }
        if (outcome.ok) {
          ephemeral.commandStatus = { type: "ok", message: "Attack resolved." };
          try {
            lib_default.broadcast.sendMessage(BC_HUD_TARGETING_COMMAND, { type: "clear" }, { destination: "LOCAL" });
          } catch (_e) {
          }
          await refetchCurrent();
        } else {
          ephemeral.commandStatus = { type: "error", message: outcome.error || "Attack failed." };
          await refetchCurrent();
        }
        return;
      }
      const type = String(command.type ?? "");
      ephemeral.commandStatus = null;
      if (type === "select-weapon") {
        ephemeral.selectedWeaponId = String(command.weaponId ?? "").trim() || null;
        ephemeral.selectedReloadMagazineId = null;
        ephemeral.reloadRpcResult = null;
        ephemeral.weaponSelectorOpen = false;
        ephemeral.fireModeSelectorOpen = false;
        ephemeral.fireModeRpcResult = null;
        if (lastState) publishState(lastState);
        return;
      }
      if (type === "toggle-weapon-selector") {
        ephemeral.weaponSelectorOpen = !ephemeral.weaponSelectorOpen;
        if (lastState) publishState(lastState);
        return;
      }
      if (type === "close-weapon-selector") {
        ephemeral.weaponSelectorOpen = false;
        if (lastState) publishState(lastState);
        return;
      }
      if (type === "select-reload-mag") {
        ephemeral.selectedReloadMagazineId = String(command.magazineId ?? "").trim() || null;
        if (lastState) publishState(lastState);
        return;
      }
      if (type === "prepare-skill") {
        const skillId = String(command.skillId ?? "").trim();
        ephemeral.preparedAction = ephemeral.preparedAction?.id === skillId ? null : { kind: "skill", id: skillId };
        if (lastState) publishState(lastState);
        return;
      }
      if (type === "pick-target" || type === "cancel-target" || type === "clear-target" || type === "select-target-zone") {
        return;
      }
      if (type === "reload") {
        const weapon = lastPayload.hudSnapshot?.weapon?.primary ?? null;
        const weaponId = String(command.weaponId ?? weapon?.id ?? "").trim();
        const magazineId = resolveReloadMagazineId(command, ephemeral, weapon) ?? "";
        const profileId = weapon?.activeProfileId ?? weapon?.active_profile_id ?? weapon?.profileId ?? null;
        if (!weaponId || !magazineId || !profileId) {
          ephemeral.commandStatus = { type: "error", message: "Reload unavailable: missing weapon profile or magazine." };
          ephemeral.reloadRpcResult = { ok: false, error: "MISSING_FIELDS", message: "weaponId/profileId/magazineId missing before RPC call." };
          if (lastState) publishState(lastState);
          return;
        }
        try {
          const result = await loadWeaponProfileMagazine(
            { character_weapon_id: weaponId, profile_id: profileId, character_magazine_id: magazineId },
            settings
          );
          const normalized = normalizeReloadRpcResult(result);
          ephemeral.reloadRpcResult = normalized;
          if (normalized.ok) {
            ephemeral.commandStatus = { type: "ok", message: "Reloaded." };
            ephemeral.selectedReloadMagazineId = null;
            await refetchCurrent();
          } else {
            ephemeral.commandStatus = { type: "error", message: normalized.message || normalized.error || "Reload failed." };
            if (lastState) publishState(lastState);
          }
        } catch (error) {
          ephemeral.reloadRpcResult = { ok: false, error: "RPC_EXCEPTION", message: String(error?.message ?? error ?? "Reload failed.") };
          ephemeral.commandStatus = { type: "error", message: String(error?.message ?? error ?? "Reload failed.") };
          if (lastState) publishState(lastState);
        }
      }
    }
    async function resolveAndPublish(selectionIds) {
      if (shouldDeferSelection()) return;
      currentSelectionIds = Array.isArray(selectionIds) ? selectionIds.slice() : [];
      const { stale, state } = await adapter.resolveLatest(selectionIds);
      if (disposed || stale) return;
      if (state.status !== "ready") resetEphemeralForCharacter(null);
      else resetEphemeralForCharacter(state.characterId ?? null);
      lastState = state;
      const payload = publishState(state);
      if (onSelectionState) {
        try {
          await onSelectionState(payload);
        } catch (_e) {
        }
      }
    }
    await resolveAndPublish(player.selection);
    cleanups2.push(await subscribePlayerChanges((p) => {
      viewer = normalizeViewer({ playerId: p.id, role: p.role });
      if (shouldDeferSelection()) return;
      void resolveAndPublish(p.selection);
    }));
    cleanups2.push(await subscribeSceneItems(() => {
      if (sceneTimer) clearTimeout(sceneTimer);
      sceneTimer = setTimeout(() => {
        if (shouldDeferSelection()) return;
        lib_default.player.getSelection().then((sel) => {
          if (Array.isArray(sel) && sel.length === 1) return resolveAndPublish(sel);
        }).catch(() => {
        });
      }, SCENE_RERESOLVE_DEBOUNCE_MS);
    }));
    cleanups2.push(lib_default.broadcast.onMessage(BC_HUD_SELECTION_REQUEST, () => {
      if (lastPayload) broadcast(lastPayload);
    }));
    cleanups2.push(lib_default.broadcast.onMessage(BC_HUD_COMMAND, (event) => {
      void handleCommand(event?.data).catch(() => {
      });
    }));
    cleanup.applyTargetingPayload = applyTargetingPayload;
  }
  lib_default.onReady(() => {
    if (disposed) return;
    void init().catch((error) => {
      console.error("[combatHud/scene] selection setup failed", error);
    });
  });
  function cleanup() {
    disposed = true;
    if (sceneTimer) {
      clearTimeout(sceneTimer);
      sceneTimer = null;
    }
    for (const fn of cleanups2.splice(0)) {
      try {
        fn();
      } catch (_e) {
      }
    }
  }
  cleanup.applyTargetingPayload = () => {
  };
  return cleanup;
}

// hud/targeting/targetProfiles.js
var DEFAULT_PROFILE_ID = "humanoid";
var HUMANOID_PROFILE = Object.freeze({
  id: "humanoid",
  zones: Object.freeze([
    Object.freeze({ id: "HEAD", label: "Head" }),
    Object.freeze({ id: "TORSO", label: "Torso" }),
    Object.freeze({ id: "LEFT_ARM", label: "Left arm" }),
    Object.freeze({ id: "RIGHT_ARM", label: "Right arm" }),
    Object.freeze({ id: "LEFT_LEG", label: "Left leg" }),
    Object.freeze({ id: "RIGHT_LEG", label: "Right leg" })
  ]),
  defaultZoneId: "TORSO"
});
var PROFILES = Object.freeze({
  humanoid: HUMANOID_PROFILE
});
function getTargetProfile(profileId) {
  return PROFILES[String(profileId ?? "")] ?? HUMANOID_PROFILE;
}
function getDefaultZoneId(profileId) {
  return getTargetProfile(profileId).defaultZoneId;
}
function isValidZoneId(profileId, zoneId) {
  return getTargetProfile(profileId).zones.some((z) => z.id === zoneId);
}
var ZONE_TO_SVG_PART = Object.freeze({
  HEAD: "head",
  TORSO: "torso",
  LEFT_ARM: "l_arm",
  RIGHT_ARM: "r_arm",
  LEFT_LEG: "l_leg",
  RIGHT_LEG: "r_leg"
});
var SVG_PART_TO_ZONE = Object.freeze(
  Object.fromEntries(Object.entries(ZONE_TO_SVG_PART).map(([zoneId, svgPart]) => [svgPart, zoneId]))
);
function svgPartToZoneId(svgPart) {
  return SVG_PART_TO_ZONE[String(svgPart ?? "")] ?? null;
}

// hud/targeting/targetBodyZones.js
function mapTargetBodyZones(bundle) {
  const combat = bundle?.sections?.combat ?? bundle?.combat ?? null;
  const bodyParts = Array.isArray(combat?.body_parts) ? combat.body_parts : [];
  const out = [];
  for (const bp of bodyParts) {
    const bodyPartId = String(bp?.id ?? "").trim();
    if (!bodyPartId) continue;
    const zoneId = svgPartToZoneId(normalizePartId(bp));
    if (!zoneId) continue;
    const canBeTargeted = bp?.can_be_targeted === false ? false : !(bp?.disabled || bp?.destroyed);
    out.push({ zoneId, bodyPartId, canBeTargeted });
  }
  return out;
}
function resolveBodyPartId(bodyZones, zoneId) {
  if (!Array.isArray(bodyZones) || !zoneId) return null;
  return bodyZones.find((z) => z.zoneId === zoneId)?.bodyPartId ?? null;
}

// hud/targeting/targetSelectionState.js
var TARGETING_MODE = Object.freeze({
  idle: "idle",
  picking: "picking"
});
var TARGETING_ERROR = Object.freeze({
  noSource: "NO_READY_SOURCE",
  selfTarget: "CANNOT_TARGET_SELF",
  notLinked: "TOKEN_NOT_LINKED",
  noToken: "NO_TOKEN",
  fetchFailed: "TARGET_LINK_FETCH_FAILED"
});
function str2(v) {
  const s = String(v ?? "").trim();
  return s || null;
}
function normalizeSource(raw) {
  return {
    tokenId: str2(raw?.tokenId),
    characterId: str2(raw?.characterId),
    characterName: str2(raw?.characterName)
  };
}
function isSourceReady(source) {
  return Boolean(source && source.tokenId && source.characterId);
}
function noError() {
  return { code: null, message: null };
}
function createInitialTargetState() {
  return {
    mode: TARGETING_MODE.idle,
    source: { tokenId: null, characterId: null, characterName: null },
    target: null,
    error: noError()
  };
}
function startPicking(state) {
  const s = state ?? createInitialTargetState();
  if (!isSourceReady(s.source)) {
    return { ...s, mode: TARGETING_MODE.idle, error: { code: TARGETING_ERROR.noSource, message: null } };
  }
  if (s.mode === TARGETING_MODE.picking) return s;
  return { ...s, mode: TARGETING_MODE.picking, error: noError() };
}
function cancelPicking(state) {
  const s = state ?? createInitialTargetState();
  if (s.mode !== TARGETING_MODE.picking) return s;
  return { ...s, mode: TARGETING_MODE.idle };
}
function applyResolvedTarget(state, candidate) {
  const s = state ?? createInitialTargetState();
  if (!candidate || !str2(candidate.tokenId)) return s;
  const profileId = str2(candidate.profileId) ?? DEFAULT_PROFILE_ID;
  return {
    ...s,
    mode: TARGETING_MODE.idle,
    target: {
      tokenId: String(candidate.tokenId),
      characterId: str2(candidate.characterId),
      displayName: str2(candidate.displayName) ?? "Target",
      profileId,
      selectedZoneId: getDefaultZoneId(profileId),
      distance: normalizeDistance(candidate.distance),
      // Basic Weapon Attack v1: the target's own body-part row ids (zoneId →
      // uuid), needed to satisfy perform_attack's target_body_part_id
      // contract. Fetched via the existing get_character_runtime_bundle RPC
      // ("combat" section only — see targetBodyZones.js). NEVER broadcast as
      // a raw list (see buildTargetingBroadcast below) — only the resolved id
      // for the CURRENTLY selected zone ever leaves this module.
      bodyZones: Array.isArray(candidate.bodyZones) ? candidate.bodyZones : []
    },
    error: noError()
  };
}
function clearTarget(state) {
  const s = state ?? createInitialTargetState();
  return { ...s, mode: TARGETING_MODE.idle, target: null, error: noError() };
}
function selectZone(state, zoneId) {
  const s = state ?? createInitialTargetState();
  if (!s.target) return s;
  const id = str2(zoneId);
  if (!id || !isValidZoneId(s.target.profileId, id)) return s;
  if (s.target.selectedZoneId === id) return s;
  return { ...s, target: { ...s.target, selectedZoneId: id } };
}
function applySource(state, rawSource) {
  const s = state ?? createInitialTargetState();
  const source = normalizeSource(rawSource);
  const prevCharId = s.source?.characterId ?? null;
  const nextCharId = source.characterId ?? null;
  const characterChanged = nextCharId !== prevCharId;
  const ready = isSourceReady(source);
  if (!characterChanged && ready) {
    return { ...s, source };
  }
  return {
    ...s,
    mode: TARGETING_MODE.idle,
    source,
    target: null,
    error: noError()
  };
}
function normalizeDistance(distance) {
  if (!distance || typeof distance !== "object") return null;
  const value = Number(distance.value);
  const unit = str2(distance.unit);
  if (!Number.isFinite(value) || !unit) return null;
  return { value, unit };
}
function validateCandidate({ tokenId, sourceTokenId } = {}) {
  const id = str2(tokenId);
  if (!id) return { ok: false, code: TARGETING_ERROR.noToken };
  if (id === str2(sourceTokenId)) return { ok: false, code: TARGETING_ERROR.selfTarget };
  return { ok: true };
}
function extractTokenLink(linkResult, tokenId) {
  if (!linkResult || linkResult.ok === false) return null;
  const links = Array.isArray(linkResult.links) ? linkResult.links : [];
  const match = links.find(
    (l) => String(l?.token_id ?? "") === String(tokenId) && l?.is_active !== false
  );
  if (!match || !match.character) return null;
  return {
    characterId: str2(match.character.id),
    characterName: str2(match.character.display_name) ?? str2(match.character.name)
  };
}
function buildTargetingBroadcast(state) {
  const s = state ?? createInitialTargetState();
  return {
    mode: s.mode === TARGETING_MODE.picking ? TARGETING_MODE.picking : TARGETING_MODE.idle,
    source: {
      tokenId: s.source?.tokenId ?? null,
      characterId: s.source?.characterId ?? null,
      characterName: s.source?.characterName ?? null
    },
    target: s.target ? {
      tokenId: s.target.tokenId,
      characterId: s.target.characterId ?? null,
      displayName: s.target.displayName,
      profileId: s.target.profileId,
      selectedZoneId: s.target.selectedZoneId,
      distance: s.target.distance ?? null,
      // Resolved fresh from bodyZones on every broadcast (never stale) —
      // the raw bodyZones list itself is NOT shipped over the wire.
      resolvedBodyPartId: resolveBodyPartId(s.target.bodyZones, s.target.selectedZoneId)
    } : null,
    error: { code: s.error?.code ?? null, message: s.error?.message ?? null }
  };
}
function createTargetGenerationGate() {
  let current2 = 0;
  return {
    next() {
      current2 += 1;
      return current2;
    },
    isCurrent(token) {
      return token === current2;
    },
    get current() {
      return current2;
    }
  };
}

// movement/gridMath.js
var SQRT3 = Math.sqrt(3);
function normalizeObrGridType(value) {
  switch (String(value ?? "").trim().toUpperCase()) {
    case "SQUARE":
      return "square";
    case "HEX_VERTICAL":
      return "hex_vertical";
    case "HEX_HORIZONTAL":
      return "hex_horizontal";
    default:
      return "";
  }
}
function normalizeDistanceMode(gridType, measurement) {
  const tacticalType = normalizeObrGridType(gridType);
  if (tacticalType === "hex_vertical" || tacticalType === "hex_horizontal") {
    return "hex";
  }
  switch (String(measurement ?? "").trim().toUpperCase()) {
    case "CHEBYSHEV":
      return "chebyshev";
    case "MANHATTAN":
      return "manhattan";
    default:
      return "";
  }
}
function normalizeTacticalGridSettings(raw) {
  if (!raw || typeof raw !== "object") return null;
  const gridType = String(raw.grid_type ?? raw.gridType ?? "").trim().toLowerCase();
  const distanceMode = String(raw.distance_mode ?? raw.distanceMode ?? "").trim().toLowerCase();
  const gridDpi = Number(raw.grid_dpi ?? raw.gridDpi ?? 0) || 0;
  const metersPerCell = Number(raw.meters_per_cell ?? raw.metersPerCell ?? 1) || 1;
  const anchorX = Number(raw.anchor_scene_x ?? raw.anchorSceneX ?? 0) || 0;
  const anchorY = Number(raw.anchor_scene_y ?? raw.anchorSceneY ?? 0) || 0;
  if (!gridType || !distanceMode || gridDpi <= 0 || metersPerCell <= 0) {
    return null;
  }
  return {
    gridType,
    distanceMode,
    gridDpi,
    metersPerCell,
    anchor: { x: anchorX, y: anchorY },
    updatedAt: String(raw.updated_at ?? raw.updatedAt ?? "").trim()
  };
}
function cubeRound({ x, y, z }) {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }
  return { x: rx, y: ry, z: rz };
}
function axialRound(q, r) {
  const cube = cubeRound({ x: q, y: -q - r, z: r });
  return { q: cube.x, r: cube.z };
}
function sceneToCell(grid, position) {
  const settings = normalizeTacticalGridSettings(grid);
  if (!settings || !position) return null;
  const x = (Number(position.x) || 0) - settings.anchor.x;
  const y = (Number(position.y) || 0) - settings.anchor.y;
  if (settings.gridType === "square") {
    return {
      q: Math.round(x / settings.gridDpi),
      r: Math.round(y / settings.gridDpi)
    };
  }
  if (settings.gridType === "hex_vertical") {
    const size = settings.gridDpi / SQRT3;
    const q = (SQRT3 / 3 * x - 1 / 3 * y) / size;
    const r = 2 / 3 * y / size;
    return axialRound(q, r);
  }
  if (settings.gridType === "hex_horizontal") {
    const size = settings.gridDpi / SQRT3;
    const q = 2 / 3 * x / size;
    const r = (-1 / 3 * x + SQRT3 / 3 * y) / size;
    return axialRound(q, r);
  }
  return null;
}
function computeDistanceCells(grid, fromCell, toCell) {
  const settings = normalizeTacticalGridSettings(grid);
  if (!settings || !fromCell || !toCell) return 0;
  const fromQ = Number(fromCell.q ?? fromCell.cell_q ?? 0) || 0;
  const fromR = Number(fromCell.r ?? fromCell.cell_r ?? 0) || 0;
  const toQ = Number(toCell.q ?? toCell.cell_q ?? 0) || 0;
  const toR = Number(toCell.r ?? toCell.cell_r ?? 0) || 0;
  const dx = Math.abs(toQ - fromQ);
  const dy = Math.abs(toR - fromR);
  if (settings.gridType === "square") {
    return settings.distanceMode === "manhattan" ? dx + dy : Math.max(dx, dy);
  }
  return (dx + dy + Math.abs(toQ + toR - (fromQ + fromR))) / 2;
}

// hud/targeting/targetDistance.js
function parseGridScale(scale) {
  if (scale && typeof scale === "object" && scale.parsed) {
    const multiplier = Number(scale.parsed.multiplier);
    const unit = String(scale.parsed.unit ?? "").trim();
    if (Number.isFinite(multiplier) && multiplier > 0 && unit) {
      return { multiplier, unit };
    }
  }
  const raw = String((scale && typeof scale === "object" ? scale.raw : scale) ?? "").trim();
  const match = raw.match(/^([\d.]+)\s*([^\d\s].*)$/);
  if (match) {
    const multiplier = Number(match[1]);
    const unit = String(match[2]).trim();
    if (Number.isFinite(multiplier) && multiplier > 0 && unit) {
      return { multiplier, unit };
    }
  }
  return null;
}
function computeTargetDistance(grid, fromPos, toPos) {
  if (!grid || !fromPos || !toPos) return null;
  const gridType = normalizeObrGridType(grid.type);
  const distanceMode = normalizeDistanceMode(grid.type, grid.measurement);
  const dpi = Number(grid.dpi);
  if (!gridType || !distanceMode || !(dpi > 0)) return null;
  const scale = parseGridScale(grid.scale);
  if (!scale) return null;
  const settings = {
    grid_type: gridType,
    distance_mode: distanceMode,
    grid_dpi: dpi,
    meters_per_cell: scale.multiplier,
    anchor_scene_x: 0,
    anchor_scene_y: 0
  };
  const fromCell = sceneToCell(settings, fromPos);
  const toCell = sceneToCell(settings, toPos);
  if (!fromCell || !toCell) return null;
  const cells = computeDistanceCells(settings, fromCell, toCell);
  const value = Math.round(cells * scale.multiplier * 100) / 100;
  return { value, unit: scale.unit };
}

// hud/targeting/targetSelectionAdapter.js
function createTargetSelectionAdapter(deps = {}) {
  const fetchSceneTokenLink = deps.fetchSceneTokenLink;
  const getTokenSummary = typeof deps.getTokenSummary === "function" ? deps.getTokenSummary : null;
  const getGrid = typeof deps.getGrid === "function" ? deps.getGrid : null;
  const fetchTargetBodyZones = typeof deps.fetchTargetBodyZones === "function" ? deps.fetchTargetBodyZones : null;
  const getSourceContext = typeof deps.getSourceContext === "function" ? deps.getSourceContext : () => ({});
  const gate = createTargetGenerationGate();
  async function resolve(tokenId) {
    const source = getSourceContext() ?? {};
    const base = validateCandidate({ tokenId, sourceTokenId: source.tokenId });
    if (!base.ok) return base;
    let linkResult;
    try {
      linkResult = await fetchSceneTokenLink(tokenId);
    } catch (error) {
      return { ok: false, code: TARGETING_ERROR.fetchFailed, message: error?.message ?? null };
    }
    const link = extractTokenLink(linkResult, tokenId);
    if (!link) return { ok: false, code: TARGETING_ERROR.notLinked };
    let summary = null;
    if (getTokenSummary) {
      try {
        summary = await getTokenSummary(tokenId);
      } catch (_e) {
        summary = null;
      }
    }
    const displayName = link.characterName || summary?.displayName || "Target";
    let distance = null;
    try {
      if (getGrid && summary?.position && source.tokenId) {
        const [grid, srcSummary] = await Promise.all([
          Promise.resolve(getGrid()),
          getTokenSummary ? getTokenSummary(source.tokenId) : Promise.resolve(null)
        ]);
        if (grid && srcSummary?.position) {
          distance = computeTargetDistance(grid, srcSummary.position, summary.position);
        }
      }
    } catch (_e) {
      distance = null;
    }
    let bodyZones = [];
    if (fetchTargetBodyZones && link.characterId) {
      try {
        bodyZones = await fetchTargetBodyZones(link.characterId);
      } catch (_e) {
        bodyZones = [];
      }
    }
    return {
      ok: true,
      candidate: {
        tokenId: String(tokenId),
        characterId: link.characterId ?? null,
        displayName,
        profileId: DEFAULT_PROFILE_ID,
        distance,
        bodyZones
      }
    };
  }
  async function resolveLatest(tokenId) {
    const token = gate.next();
    const result = await resolve(tokenId);
    return { stale: !gate.isCurrent(token), result };
  }
  return { resolve, resolveLatest };
}

// hud/targeting/targetSelectionController.js
function setupTargetSelection(options = {}) {
  if (typeof lib_default === "undefined" || lib_default.isAvailable === false) {
    return { cleanup: () => {
    }, isPicking: () => false, handleActiveSelection: () => {
    } };
  }
  const onTargetingState = typeof options.onTargetingState === "function" ? options.onTargetingState : null;
  let disposed = false;
  let state = createInitialTargetState();
  let adapter = null;
  let restoreInProgress = false;
  const cleanups2 = [];
  function broadcast() {
    const payload = buildTargetingBroadcast(state);
    try {
      lib_default.broadcast.sendMessage(BC_HUD_TARGETING, payload, { destination: "LOCAL" });
    } catch (_e) {
    }
    if (onTargetingState) {
      try {
        onTargetingState(payload);
      } catch (_e) {
      }
    }
  }
  function commit(next) {
    if (next === state) return;
    state = next;
    broadcast();
  }
  async function restoreSourceSelection() {
    const sourceTokenId = state.source?.tokenId;
    if (!sourceTokenId) return;
    restoreInProgress = true;
    try {
      await lib_default.player.select([sourceTokenId], true);
    } catch (_e) {
    }
    restoreInProgress = false;
  }
  function onPick() {
    commit(startPicking(state));
  }
  async function onCancel() {
    if (state.mode !== TARGETING_MODE.picking) return;
    commit(cancelPicking(state));
    await restoreSourceSelection();
  }
  function onClear() {
    commit(clearTarget(state));
  }
  function onSelectZone(zoneId) {
    commit(selectZone(state, zoneId));
  }
  function handleTargetingCommand(cmd) {
    switch (cmd?.type) {
      case "pick":
        onPick();
        break;
      case "cancel":
        void onCancel();
        break;
      case "clear":
        onClear();
        break;
      case "selectZone":
        onSelectZone(cmd.zoneId);
        break;
      default:
        break;
    }
  }
  async function resolveCandidate(tokenId) {
    if (!adapter) return;
    const { stale, result } = await adapter.resolveLatest(tokenId);
    if (disposed || stale) return;
    if (state.mode !== TARGETING_MODE.picking) return;
    if (!result.ok) {
      commit(cancelPicking({ ...state, error: { code: result.code, message: result.message ?? null } }));
      await restoreSourceSelection();
      return;
    }
    commit(applyResolvedTarget(state, result.candidate));
    await restoreSourceSelection();
  }
  function handleActiveSelection(payload) {
    if (disposed) return;
    const ready = payload && payload.status === "ready" && payload.access?.canView === true;
    const source = ready ? {
      tokenId: payload.selectedItemId ?? null,
      characterId: payload.characterId ?? null,
      characterName: payload.view?.name ?? null
    } : { tokenId: null, characterId: null, characterName: null };
    commit(applySource(state, source));
  }
  async function init() {
    const [context, settings] = await Promise.all([
      getRoomSceneContext(),
      loadRoomSupabaseSettings()
    ]);
    if (disposed) return;
    adapter = createTargetSelectionAdapter({
      fetchSceneTokenLink: (tokenId) => getSceneTokenLinks(
        { room_id: context.roomId, scene_id: context.sceneId, campaign_id: context.campaignId, token_id: tokenId },
        settings
      ),
      getTokenSummary: async (tokenId) => {
        const items = await getSceneItems();
        const item = items.find((i) => String(i?.id ?? "") === String(tokenId));
        if (!item) return null;
        return { displayName: String(item.name ?? ""), position: item.position ?? null };
      },
      getGrid: () => getSceneGrid(),
      // Basic Weapon Attack v1: resolve the target's OWN body-part zone→uuid
      // map via the existing get_character_runtime_bundle RPC, "combat"
      // section only (see targetBodyZones.js for exactly why and what is
      // discarded). Best-effort — a failure just leaves bodyZones empty.
      fetchTargetBodyZones: async (characterId) => {
        const bundle = await getCharacterRuntimeBundle({ character_id: characterId, sections: ["combat"] }, settings);
        return mapTargetBodyZones(bundle);
      },
      getSourceContext: () => state.source ?? {}
    });
    cleanups2.push(await subscribePlayerChanges((p) => {
      if (disposed || restoreInProgress) return;
      if (state.mode !== TARGETING_MODE.picking) return;
      const ids = Array.isArray(p.selection) ? p.selection.map((v) => String(v ?? "").trim()).filter(Boolean) : [];
      if (ids.length !== 1) return;
      const tokenId = ids[0];
      if (tokenId === state.source?.tokenId) return;
      void resolveCandidate(tokenId);
    }));
    cleanups2.push(lib_default.broadcast.onMessage(BC_HUD_TARGETING_REQUEST, () => broadcast()));
    broadcast();
  }
  lib_default.onReady(() => {
    if (disposed) return;
    cleanups2.push(lib_default.broadcast.onMessage(BC_HUD_TARGETING_COMMAND, (event) => {
      handleTargetingCommand(event?.data ?? {});
    }));
    void init().catch((error) => {
      console.error("[combatHud/targeting] setup failed", error);
    });
  });
  return {
    cleanup() {
      disposed = true;
      for (const fn of cleanups2.splice(0)) {
        try {
          fn();
        } catch (_e) {
        }
      }
    },
    isPicking: () => state.mode === TARGETING_MODE.picking,
    handleActiveSelection
  };
}

// hud/core/combatHudSelectors.js
function selectVisibleReserveMagazines(state) {
  const weapon = state?.snapshot?.weapon?.primary ?? null;
  if (!weapon || !weapon.usesMagazine) return [];
  const loaded = weapon.loadedMagazine ?? null;
  const loadedId = loaded?.id ?? null;
  const loadedCaliber = loaded?.caliber ?? null;
  const reserve = Array.isArray(weapon.reserveMagazines) ? weapon.reserveMagazines : [];
  return reserve.filter((mag) => {
    if (!mag) return false;
    if (mag.id === loadedId) return false;
    if ((mag.current ?? 0) <= 0) return false;
    if (loadedCaliber && mag.caliber !== loadedCaliber) return false;
    return true;
  });
}
var BODY_PART_LABELS = Object.freeze({
  head: "HEAD",
  torso: "TORSO",
  l_arm: "L.ARM",
  r_arm: "R.ARM",
  l_leg: "L.LEG",
  r_leg: "R.LEG"
});

// hud/overlay/hudLayout.js
var HUD_LAYOUT_REFERENCE_VIEWPORT = Object.freeze({ width: 1920, height: 1080 });
var LAYOUT_VERSION = 2;
var HUD_MODULE_IDS = Object.freeze([
  "player",
  "gun",
  "skills",
  "combatControl",
  "log"
]);
var HUD_MODULE_POPOVER_IDS = Object.freeze({
  player: "odyssey-hud-player",
  gun: "odyssey-hud-gun",
  skills: "odyssey-hud-skills",
  combatControl: "odyssey-hud-combat-control",
  log: "odyssey-hud-log"
});
var LEGACY_HUD_POPOVER_IDS = Object.freeze([
  "odyssey-hud-target",
  "odyssey-hud-modifiers",
  "odyssey-hud-action"
]);
var GUN_WEAPON_SELECTOR_POPOVER_ID = "odyssey-hud-gun-weapon-selector";
var GUN_MAGAZINE_SELECTOR_POPOVER_ID = "odyssey-hud-gun-magazine-selector";
var GUN_FIRE_MODE_SELECTOR_POPOVER_ID = "odyssey-hud-gun-fire-mode-selector";
var HUD_EDITOR_POPOVER_ID = "odyssey-hud-editor";
var HUD_PILL_POPOVER_ID = "odyssey-hud-pill";
var BC_HUD_LAYOUT = "com.odyssey.combat-hud/layout";
var BC_HUD_EDITOR = "com.odyssey.combat-hud/editor";
var LAYOUT_MARGIN = 16;
var COMPACT_LAYOUT_BREAKPOINT = 1100;
var DEFAULT_HUD_LAYOUT_V2 = Object.freeze({
  player: Object.freeze({ left: 16, bottom: 16, width: 250, height: 250, zIndex: 30 }),
  gun: Object.freeze({ left: 126, bottom: 16, width: 340, height: 165, zIndex: 20 }),
  skills: Object.freeze({ left: 663, bottom: 16, width: 600, height: 165, zIndex: 20 }),
  // Composite: Target (left 165) + Modifiers/Action (right 165). Replaces the
  // former three separate target/modifiers/action rects.
  combatControl: Object.freeze({ left: 1263, bottom: 16, width: 330, height: 165, zIndex: 20 }),
  log: Object.freeze({ left: 1656, bottom: 16, width: 250, height: 250, zIndex: 20 })
});
function clamp012(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function computeLayoutScale(vw, vh) {
  const w = Math.max(1, Number(vw) || 0);
  const h = Math.max(1, Number(vh) || 0);
  return Math.min(w / HUD_LAYOUT_REFERENCE_VIEWPORT.width, h / HUD_LAYOUT_REFERENCE_VIEWPORT.height, 1);
}
function isCompactViewport(vw) {
  return (Number(vw) || 0) < COMPACT_LAYOUT_BREAKPOINT;
}
function moduleSize(moduleId, vw, vh) {
  if (isCompactViewport(vw)) return compactModuleSize(moduleId, vw);
  const def = DEFAULT_HUD_LAYOUT_V2[moduleId];
  const scale = computeLayoutScale(vw, vh);
  return { width: Math.round(def.width * scale), height: Math.round(def.height * scale) };
}
function defaultModuleRect(moduleId, vw, vh) {
  if (isCompactViewport(vw)) return compactModuleRect(moduleId, vw, vh);
  const def = DEFAULT_HUD_LAYOUT_V2[moduleId];
  const scale = computeLayoutScale(vw, vh);
  const width = Math.round(def.width * scale);
  const height = Math.round(def.height * scale);
  return {
    left: Math.round(def.left * scale),
    top: Math.round((Number(vh) || 0) - def.bottom * scale - height),
    width,
    height,
    zIndex: def.zIndex
  };
}
function normalizedToPixels(moduleId, placement, vw, vh) {
  const { width, height } = moduleSize(moduleId, vw, vh);
  const availW = Math.max(0, (Number(vw) || 0) - width - 2 * LAYOUT_MARGIN);
  const availH = Math.max(0, (Number(vh) || 0) - height - 2 * LAYOUT_MARGIN);
  return {
    left: Math.round(LAYOUT_MARGIN + clamp012(placement && placement.x) * availW),
    top: Math.round(LAYOUT_MARGIN + clamp012(placement && placement.y) * availH),
    width,
    height,
    zIndex: DEFAULT_HUD_LAYOUT_V2[moduleId].zIndex
  };
}
function clampRect(rect, vw, vh) {
  const w = Number(vw) || 0;
  const h = Number(vh) || 0;
  return {
    ...rect,
    left: Math.max(0, Math.min(rect.left, Math.max(0, w - rect.width))),
    top: Math.max(0, Math.min(rect.top, Math.max(0, h - rect.height)))
  };
}
function resolveModuleRect(moduleId, placement, vw, vh) {
  const rect = placement && placement.mode === "custom" ? normalizedToPixels(moduleId, placement, vw, vh) : defaultModuleRect(moduleId, vw, vh);
  return clampRect(rect, vw, vh);
}
var COMPACT_SIZES = {
  player: { width: 150, height: 150 },
  gun: { width: 190, height: 92 },
  skills: { width: 300, height: 92 },
  target: { width: 92, height: 92 },
  modifiers: { width: 92, height: 92 },
  action: { width: 120, height: 34 },
  log: { width: 180, height: 140 }
};
function compactModuleSize(moduleId, vw) {
  const s = COMPACT_SIZES[moduleId];
  const maxW = Math.max(80, (Number(vw) || 0) - 2 * LAYOUT_MARGIN);
  return { width: Math.min(s.width, maxW), height: s.height };
}
function compactModuleRect(moduleId, vw, vh) {
  const w = Number(vw) || 0;
  const h = Number(vh) || 0;
  let x = LAYOUT_MARGIN;
  let rowTopFromBottom = LAYOUT_MARGIN;
  let rowHeight = 0;
  for (const id of HUD_MODULE_IDS) {
    const size = compactModuleSize(id, vw);
    if (x + size.width + LAYOUT_MARGIN > w && x > LAYOUT_MARGIN) {
      rowTopFromBottom += rowHeight + 8;
      x = LAYOUT_MARGIN;
      rowHeight = 0;
    }
    if (id === moduleId) {
      const top = Math.max(0, h - rowTopFromBottom - size.height);
      return clampRect({ left: x, top, width: size.width, height: size.height, zIndex: DEFAULT_HUD_LAYOUT_V2[moduleId].zIndex }, vw, vh);
    }
    x += size.width + 8;
    rowHeight = Math.max(rowHeight, size.height);
  }
  return clampRect({ left: LAYOUT_MARGIN, top: LAYOUT_MARGIN, ...compactModuleSize(moduleId, vw), zIndex: 20 }, vw, vh);
}
function defaultLayoutState() {
  const modules = {};
  for (const id of HUD_MODULE_IDS) modules[id] = { mode: "default", x: 0, y: 0 };
  return { version: LAYOUT_VERSION, modules };
}
function migrateLegacyModules(modules) {
  if (!modules || modules.combatControl) return modules;
  const hasLegacy = modules.target || modules.modifiers || modules.action;
  if (!hasLegacy) return modules;
  const base = modules.target;
  if (base && base.mode === "custom" && Number.isFinite(base.x) && Number.isFinite(base.y)) {
    return { ...modules, combatControl: { mode: "custom", x: clamp012(base.x), y: clamp012(base.y) } };
  }
  return modules;
}
function validateLayoutState(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.version !== LAYOUT_VERSION) return null;
  if (!raw.modules || typeof raw.modules !== "object") return null;
  const src = migrateLegacyModules(raw.modules);
  const out = defaultLayoutState();
  for (const id of HUD_MODULE_IDS) {
    const m = src[id];
    if (m && (m.mode === "default" || m.mode === "custom") && typeof m.x === "number" && typeof m.y === "number" && Number.isFinite(m.x) && Number.isFinite(m.y)) {
      out.modules[id] = { mode: m.mode, x: clamp012(m.x), y: clamp012(m.y) };
    }
  }
  return out;
}
function normalizeLayoutState(state) {
  return validateLayoutState(state) ?? defaultLayoutState();
}

// hud/overlay/hudPopoverLifecycle.js
var SECONDARY_SET = new Set(SECONDARY_MODULE_IDS);
function moduleShouldBeOpen(mode2, status, id) {
  if (mode2 !== "modules") return false;
  if (id === PRIMARY_MODULE_ID) return true;
  if (SECONDARY_SET.has(id)) return isReadyStatus(status);
  return true;
}
function secondaryReconcileAction(prevStatus, nextStatus) {
  const wasReady = isReadyStatus(prevStatus);
  const nowReady = isReadyStatus(nextStatus);
  if (wasReady === nowReady) return "none";
  return nowReady ? "open" : "close";
}
function characterChangeClosesCompanions(prevCharId, nextCharId) {
  return (prevCharId ?? null) !== (nextCharId ?? null);
}
var COMPANION_SELECTOR_WIDTH = 210;
var ROW_HEIGHT = 22;
var ROW_GAP = 4;
var PANEL_CHROME_HEIGHT = 27;
var MIN_HEIGHT = 56;
var MAX_HEIGHT = 220;
function computeCompanionSelectorHeight(rowCount) {
  const rows = Math.max(1, Number(rowCount) || 0);
  const rowsHeight = rows * ROW_HEIGHT + (rows - 1) * ROW_GAP;
  const total = PANEL_CHROME_HEIGHT + rowsHeight;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, total));
}

// hud/overlay/combatHudOverlayController.js
var VIEWPORT_POLL_MS = 600;
var PILL_W = 150;
var PILL_H = 44;
var COMPANION_POPOVER_W = 280;
var OPEN_ORDER = [...HUD_MODULE_IDS].sort(
  (a, b) => DEFAULT_HUD_LAYOUT_V2[a].zIndex - DEFAULT_HUD_LAYOUT_V2[b].zIndex
);
var started = false;
var lastVW = 0;
var lastVH = 0;
var lastUiState = { ...DEFAULT_HUD_UI_STATE };
var lastLayout = defaultLayoutState();
var mode = "modules";
var pollTimer = null;
var lastSelectionStatus = SELECTION_STATUS.loading;
var sceneCleanup = null;
var targetSelection = null;
var gunWeaponSelectorOpen = false;
var gunMagazineSelectorOpen = false;
var gunFireModeSelectorOpen = false;
var lastActiveCharacterId = null;
var lastSelectionPayload = null;
var cleanups = [];
var SECONDARY_SET2 = new Set(SECONDARY_MODULE_IDS);
function moduleShouldBeOpen2(id) {
  return moduleShouldBeOpen(mode, lastSelectionStatus, id);
}
function isCollapsed() {
  return Boolean(lastUiState.isHudCollapsed);
}
function placementsEqual(a, b) {
  if (!a || !b) return a === b;
  if (a.mode !== b.mode) return false;
  return Math.abs((a.x || 0) - (b.x || 0)) < 1e-4 && Math.abs((a.y || 0) - (b.y || 0)) < 1e-4;
}
function layoutsEqual(a, b) {
  if (!a || !b || !a.modules || !b.modules) return false;
  return HUD_MODULE_IDS.every((id) => placementsEqual(a.modules[id], b.modules[id]));
}
async function readViewport() {
  const [vw, vh] = await Promise.all([lib_default.viewport.getWidth(), lib_default.viewport.getHeight()]);
  lastVW = vw;
  lastVH = vh;
  return { vw, vh };
}
function baseHref() {
  return typeof window !== "undefined" ? window.location.href : "";
}
function pageUrl(moduleId) {
  const params = new URLSearchParams(serializeHudUiState(lastUiState));
  params.set("module", moduleId);
  params.set("vw", String(Math.round(lastVW)));
  params.set("vh", String(Math.round(lastVH)));
  try {
    const baseParams = new URL(baseHref()).searchParams;
    if (baseParams.get("debug") === "1") params.set("debug", "1");
  } catch (_e) {
  }
  try {
    const url = new URL(OVERLAY_HTML, baseHref());
    url.search = params.toString();
    return url.toString();
  } catch {
    return `${OVERLAY_HTML}?${params.toString()}`;
  }
}
function paramsForRect(rect) {
  return {
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
    anchorReference: "POSITION",
    anchorPosition: { left: rect.left, top: rect.top },
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    hidePaper: true,
    disableClickAway: true,
    marginThreshold: 0
  };
}
function moduleRect(moduleId) {
  return resolveModuleRect(moduleId, lastLayout.modules[moduleId], lastVW, lastVH);
}
async function openModule(moduleId) {
  const rect = moduleRect(moduleId);
  await lib_default.popover.open({
    id: HUD_MODULE_POPOVER_IDS[moduleId],
    url: pageUrl(moduleId),
    ...paramsForRect(rect)
  });
}
function companionPopoverRectAboveGun(width = COMPANION_POPOVER_W, height = 200) {
  if (!lastLayout.modules?.gun) return null;
  const gunRect = moduleRect("gun");
  const gap = 4;
  return {
    left: Math.max(0, gunRect.left + (gunRect.width - width) / 2),
    top: Math.max(0, gunRect.top - height - gap),
    width,
    height
  };
}
function visibleReserveMagazineCount() {
  const hudSnapshot = lastSelectionPayload?.hudSnapshot ?? null;
  if (!hudSnapshot) return 0;
  return selectVisibleReserveMagazines({ snapshot: hudSnapshot }).length;
}
function magazineSelectorRect() {
  const height = computeCompanionSelectorHeight(visibleReserveMagazineCount());
  return companionPopoverRectAboveGun(COMPANION_SELECTOR_WIDTH, height);
}
function visibleFireModeCount() {
  const fireMode = lastSelectionPayload?.hudSnapshot?.weapon?.primary?.fireMode ?? null;
  return Array.isArray(fireMode?.available) ? fireMode.available.length : 0;
}
function fireModeSelectorRect() {
  const height = computeCompanionSelectorHeight(visibleFireModeCount());
  return companionPopoverRectAboveGun(COMPANION_SELECTOR_WIDTH, height);
}
async function setGunWeaponSelectorOpen(open) {
  const next = Boolean(open);
  if (next === gunWeaponSelectorOpen) return;
  gunWeaponSelectorOpen = next;
  if (mode !== "modules") return;
  if (next) {
    const rect = companionPopoverRectAboveGun();
    if (rect) {
      try {
        await lib_default.popover.open({
          id: GUN_WEAPON_SELECTOR_POPOVER_ID,
          url: pageUrl("gun-weapon-selector"),
          ...paramsForRect(rect)
        });
      } catch (_e) {
      }
    }
  } else {
    try {
      await lib_default.popover.close(GUN_WEAPON_SELECTOR_POPOVER_ID);
    } catch (_e) {
    }
  }
}
async function setGunMagazineSelectorOpen(open) {
  const next = Boolean(open);
  if (next === gunMagazineSelectorOpen) return;
  gunMagazineSelectorOpen = next;
  if (mode !== "modules") return;
  if (next) {
    const rect = magazineSelectorRect();
    if (rect) {
      try {
        await lib_default.popover.open({
          id: GUN_MAGAZINE_SELECTOR_POPOVER_ID,
          url: pageUrl("gun-magazine-selector"),
          ...paramsForRect(rect)
        });
      } catch (_e) {
      }
    }
  } else {
    try {
      await lib_default.popover.close(GUN_MAGAZINE_SELECTOR_POPOVER_ID);
    } catch (_e) {
    }
  }
}
async function setGunFireModeSelectorOpen(open) {
  const next = Boolean(open);
  if (next === gunFireModeSelectorOpen) return;
  gunFireModeSelectorOpen = next;
  if (mode !== "modules") return;
  if (next) {
    const rect = fireModeSelectorRect();
    if (rect) {
      try {
        await lib_default.popover.open({
          id: GUN_FIRE_MODE_SELECTOR_POPOVER_ID,
          url: pageUrl("gun-fire-mode-selector"),
          ...paramsForRect(rect)
        });
      } catch (_e) {
      }
    }
  } else {
    try {
      await lib_default.popover.close(GUN_FIRE_MODE_SELECTOR_POPOVER_ID);
    } catch (_e) {
    }
  }
}
async function closeAllCompanionSelectors() {
  try {
    await setGunWeaponSelectorOpen(false);
  } catch (_e) {
  }
  try {
    await setGunMagazineSelectorOpen(false);
  } catch (_e) {
  }
  try {
    await setGunFireModeSelectorOpen(false);
  } catch (_e) {
  }
}
function sendTargetingCommand(command) {
  try {
    lib_default.broadcast.sendMessage(BC_HUD_TARGETING_COMMAND, command, { destination: "LOCAL" });
  } catch (_e) {
  }
}
async function openVisibleModules() {
  for (const id of OPEN_ORDER) {
    if (!moduleShouldBeOpen2(id)) continue;
    try {
      await openModule(id);
    } catch (_e) {
    }
  }
}
async function reconcileSecondaryModules(prevStatus, nextStatus) {
  if (mode !== "modules") return;
  const action = secondaryReconcileAction(prevStatus, nextStatus);
  if (action === "none") return;
  for (const id of OPEN_ORDER) {
    if (!SECONDARY_SET2.has(id)) continue;
    try {
      if (action === "open") await openModule(id);
      else await lib_default.popover.close(HUD_MODULE_POPOVER_IDS[id]);
    } catch (_e) {
    }
  }
}
async function closeAllModules() {
  for (const id of HUD_MODULE_IDS) {
    try {
      await lib_default.popover.close(HUD_MODULE_POPOVER_IDS[id]);
    } catch (_e) {
    }
  }
}
async function closeLegacyPopovers() {
  for (const id of LEGACY_HUD_POPOVER_IDS) {
    try {
      await lib_default.popover.close(id);
    } catch (_e) {
    }
  }
}
async function openChangedModules(prev, next) {
  const changed = OPEN_ORDER.filter(
    (id) => moduleShouldBeOpen2(id) && !placementsEqual(prev.modules[id], next.modules[id])
  );
  for (const id of changed) {
    try {
      await openModule(id);
    } catch (_e) {
    }
  }
}
async function openEditor() {
  const rect = { left: 0, top: 0, width: lastVW, height: lastVH };
  await lib_default.popover.open({ id: HUD_EDITOR_POPOVER_ID, url: pageUrl("editor"), ...paramsForRect(rect) });
}
async function closeEditorPopover() {
  try {
    await lib_default.popover.close(HUD_EDITOR_POPOVER_ID);
  } catch (_e) {
  }
}
function pillRect() {
  const p = moduleRect("player");
  return clampRect({ left: p.left, top: p.top + p.height - PILL_H, width: PILL_W, height: PILL_H, zIndex: 50 }, lastVW, lastVH);
}
async function openPill() {
  await lib_default.popover.open({ id: HUD_PILL_POPOVER_ID, url: pageUrl("pill"), ...paramsForRect(pillRect()) });
}
async function closePill() {
  try {
    await lib_default.popover.close(HUD_PILL_POPOVER_ID);
  } catch (_e) {
  }
}
async function applyMode() {
  if (mode === "collapsed") {
    gunWeaponSelectorOpen = false;
    gunMagazineSelectorOpen = false;
    gunFireModeSelectorOpen = false;
    await lib_default.popover.close(GUN_WEAPON_SELECTOR_POPOVER_ID).catch(() => {
    });
    await lib_default.popover.close(GUN_MAGAZINE_SELECTOR_POPOVER_ID).catch(() => {
    });
    await lib_default.popover.close(GUN_FIRE_MODE_SELECTOR_POPOVER_ID).catch(() => {
    });
    await closeEditorPopover();
    await closeAllModules();
    await openPill();
  } else if (mode === "editor") {
    gunWeaponSelectorOpen = false;
    gunMagazineSelectorOpen = false;
    gunFireModeSelectorOpen = false;
    await lib_default.popover.close(GUN_WEAPON_SELECTOR_POPOVER_ID).catch(() => {
    });
    await lib_default.popover.close(GUN_MAGAZINE_SELECTOR_POPOVER_ID).catch(() => {
    });
    await lib_default.popover.close(GUN_FIRE_MODE_SELECTOR_POPOVER_ID).catch(() => {
    });
    await closePill();
    await closeAllModules();
    await openEditor();
  } else {
    await closePill();
    await closeEditorPopover();
    await openVisibleModules();
  }
}
function startViewportPoll() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    try {
      const { vw, vh } = { vw: await lib_default.viewport.getWidth(), vh: await lib_default.viewport.getHeight() };
      if (vw === lastVW && vh === lastVH) return;
      lastVW = vw;
      lastVH = vh;
      await applyMode();
    } catch (_e) {
    }
  }, VIEWPORT_POLL_MS);
  cleanups.push(() => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });
}
function setupCombatHudOverlay() {
  if (started) return;
  if (typeof lib_default === "undefined" || lib_default.isAvailable === false) return;
  started = true;
  lib_default.onReady(async () => {
    try {
      await readViewport();
      await closeLegacyPopovers();
      mode = isCollapsed() ? "collapsed" : "modules";
      await applyMode();
      startViewportPoll();
      targetSelection = setupTargetSelection({
        onTargetingState: (payload) => {
          try {
            sceneCleanup?.applyTargetingPayload?.(payload);
          } catch (_e) {
          }
        }
      });
      sceneCleanup = setupSceneSelection({
        shouldDeferSelection: () => targetSelection?.isPicking?.() === true,
        onSelectionState: async (payload) => {
          lastSelectionPayload = payload ?? null;
          try {
            targetSelection?.handleActiveSelection?.(payload);
          } catch (_e) {
          }
          try {
            const nextCharId = payload?.characterId ?? null;
            if (characterChangeClosesCompanions(lastActiveCharacterId, nextCharId)) {
              lastActiveCharacterId = nextCharId;
              await closeAllCompanionSelectors();
            }
          } catch (_e) {
          }
          const prev = lastSelectionStatus;
          lastSelectionStatus = payload?.status ?? SELECTION_STATUS.loading;
          await reconcileSecondaryModules(prev, lastSelectionStatus);
        }
      });
      cleanups.push(lib_default.broadcast.onMessage(BC_HUD_UI_STATE, async (event) => {
        const next = normalizeHudUiState(event?.data);
        const collapseChanged = next.isHudCollapsed !== lastUiState.isHudCollapsed;
        lastUiState = { ...lastUiState, ...next };
        if (collapseChanged) {
          mode = isCollapsed() ? "collapsed" : "modules";
          if (isCollapsed()) {
            gunWeaponSelectorOpen = false;
            gunMagazineSelectorOpen = false;
            gunFireModeSelectorOpen = false;
          }
          await applyMode();
        }
      }));
      cleanups.push(lib_default.broadcast.onMessage(BC_HUD_COMMAND, async (event) => {
        const data = event?.data ?? {};
        if (data?.scope === "combat-hud" && data?.feature === "fire-mode") {
          const fmType = String(data.type ?? "");
          if (fmType === "toggle-selector") await setGunFireModeSelectorOpen(!gunFireModeSelectorOpen);
          else if (fmType === "select" || fmType === "close-selector") await setGunFireModeSelectorOpen(false);
          return;
        }
        const type = String(data.type ?? "");
        if (type === "toggle-weapon-selector") await setGunWeaponSelectorOpen(!gunWeaponSelectorOpen);
        else if (type === "close-weapon-selector") await setGunWeaponSelectorOpen(false);
        else if (type === "select-weapon") {
          await setGunWeaponSelectorOpen(false);
          await setGunFireModeSelectorOpen(false);
        } else if (type === "toggle-magazine-selector") await setGunMagazineSelectorOpen(!gunMagazineSelectorOpen);
        else if (type === "select-reload-mag") await setGunMagazineSelectorOpen(false);
        else if (type === "reload") {
          await setGunWeaponSelectorOpen(false);
          await setGunMagazineSelectorOpen(false);
        }
        if (type === "pick-target") sendTargetingCommand({ type: "pick" });
        else if (type === "cancel-target") sendTargetingCommand({ type: "cancel" });
        else if (type === "clear-target") sendTargetingCommand({ type: "clear" });
        else if (type === "select-target-zone") sendTargetingCommand({ type: "selectZone", zoneId: data.zoneId });
      }));
      cleanups.push(lib_default.broadcast.onMessage(BC_HUD_EDITOR, async (event) => {
        const open = Boolean(event?.data && event.data.open);
        if (open && mode !== "editor") {
          mode = "editor";
          await applyMode();
        } else if (!open && mode === "editor") {
          mode = "modules";
          await applyMode();
        }
      }));
      cleanups.push(lib_default.broadcast.onMessage(BC_HUD_LAYOUT, async (event) => {
        const next = normalizeLayoutState(event?.data);
        if (layoutsEqual(next, lastLayout)) return;
        const prev = lastLayout;
        lastLayout = next;
        if (mode === "modules") await openChangedModules(prev, next);
      }));
    } catch (error) {
      console.error("[combatHud/overlay] setup failed", error);
      started = false;
    }
  });
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
  loadCharacterToToken: () => loadCharacterToToken2
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
function loadCharacterToToken2(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.loadCharacterToToken,
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

// api/perkApi.js
var perkApi_exports = {};
__export(perkApi_exports, {
  getCharacterAvailablePerks: () => getCharacterAvailablePerks,
  getCharacterPerks: () => getCharacterPerks,
  grantCharacterPerk: () => grantCharacterPerk,
  useCharacterPerk: () => useCharacterPerk
});
function getCharacterPerks(payload, settings) {
  return callSupabaseRpc(
    PERK_RPC_NAMES.getCharacterPerks,
    { p_payload: payload },
    settings
  );
}
function getCharacterAvailablePerks(payload, settings) {
  return callSupabaseRpc(
    PERK_RPC_NAMES.getCharacterAvailablePerks,
    { p_payload: payload },
    settings
  );
}
function grantCharacterPerk(payload, settings) {
  return callSupabaseRpc(
    PERK_RPC_NAMES.grantCharacterPerk,
    { p_payload: payload },
    settings
  );
}
function useCharacterPerk(payload, settings) {
  return callSupabaseRpc(
    PERK_RPC_NAMES.useCharacterPerk,
    { p_payload: payload },
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

// api/logApi.js
var logApi_exports = {};
__export(logApi_exports, {
  getCombatLogEntries: () => getCombatLogEntries,
  getCombatLogRows: () => getCombatLogRows
});
function getCombatLogEntries({
  roomId = "",
  encounterId = "",
  actor_player_id = "",
  actor_is_gm = false,
  limit = 50
} = {}, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.getCombatLog,
    {
      p_payload: {
        room_id: roomId,
        encounter_id: encounterId,
        actor_player_id,
        actor_is_gm,
        limit
      }
    },
    settings
  );
}
function getCombatLogRows(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.getCombatLog,
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
  deletePerk: () => deletePerk,
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
  getPerk: () => getPerk,
  getSkill: () => getSkill,
  getWeapon: () => getWeapon,
  listAbilities: () => listAbilities,
  listAmmoTypes: () => listAmmoTypes,
  listCalibers: () => listCalibers,
  listEffects: () => listEffects,
  listEquipmentModels: () => listEquipmentModels,
  listItemDefs: () => listItemDefs,
  listMagazineDefs: () => listMagazineDefs,
  listPerks: () => listPerks,
  listSkills: () => listSkills,
  listWeapons: () => listWeapons,
  upsertAbility: () => upsertAbility,
  upsertAmmoType: () => upsertAmmoType,
  upsertCaliber: () => upsertCaliber,
  upsertEffect: () => upsertEffect,
  upsertEquipmentModel: () => upsertEquipmentModel,
  upsertItemDef: () => upsertItemDef,
  upsertMagazineDef: () => upsertMagazineDef,
  upsertPerk: () => upsertPerk,
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
function listPerks({
  search = null,
  linkedSkillId = null,
  perkType = null,
  resolutionMode = null
} = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listPerks,
    {
      p_search: search || null,
      p_linked_skill_id: linkedSkillId || null,
      p_perk_type: perkType || null,
      p_resolution_mode: resolutionMode || null
    },
    settings
  );
}
function getPerk(perkDefId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getPerk,
    { p_perk_def_id: perkDefId },
    settings
  );
}
function upsertPerk(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertPerk,
    { p_payload: payload },
    settings
  );
}
function deletePerk(perkDefId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deletePerk,
    { p_perk_def_id: perkDefId },
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
      PERK_RPC_NAMES,
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
      perk: perkApi_exports,
      equipment: equipmentApi_exports,
      inventory: inventoryApi_exports,
      log: logApi_exports,
      placement: characterPlacementApi_exports,
      creator: creatorApi_exports
    }
  };
}

// movement/moveToolBridge.js
var MOVE_TOOL_CHANNEL = "odyssey:tactical-move";
var TACTICAL_MOVE_TOOL_ID = "com.odyssey-system/tactical-move";
var TACTICAL_MOVE_MODE_ID = "com.odyssey-system/tactical-move/move-character";
var MOVE_TOOL_COMMANDS = Object.freeze({
  ActivateSelected: "ACTIVATE_SELECTED",
  Cancel: "CANCEL",
  RequestStatus: "REQUEST_STATUS"
});
var MOVE_TOOL_EVENTS = Object.freeze({
  Status: "STATUS",
  Activated: "ACTIVATED",
  Cancelled: "CANCELLED",
  Applied: "APPLIED",
  Error: "ERROR"
});
async function publishMoveToolEvent(type, payload = {}, destination = "LOCAL") {
  await waitForObrReady();
  await lib_default.broadcast.sendMessage(
    MOVE_TOOL_CHANNEL,
    { type, payload },
    { destination }
  );
}
async function subscribeMoveToolMessages(listener) {
  await waitForObrReady();
  let active = true;
  const unsubscribe = lib_default.broadcast.onMessage(MOVE_TOOL_CHANNEL, (event) => {
    if (!active) return;
    const data = event?.data ?? {};
    listener({
      type: String(data?.type ?? "").trim(),
      payload: data?.payload ?? {},
      connectionId: event?.connectionId ?? ""
    });
  });
  return () => {
    active = false;
    unsubscribe?.();
  };
}

// movement/moveToolController.js
var MOVE_TOOL_ICON_URL = "https://odyssey-services.github.io/Odyssey_System/icon.svg?v=1.8.29";
function createToolIcon() {
  return MOVE_TOOL_ICON_URL;
}
function ensureArray2(value) {
  return Array.isArray(value) ? value : [];
}
function createInitialState() {
  return {
    player: null,
    settings: null,
    active: false,
    pending: false,
    encounterId: "",
    tokenId: "",
    characterId: "",
    characterName: "",
    stateVersion: 0,
    movementVersion: 0,
    moveCurrent: 0,
    moveMax: 0,
    grid: null,
    originCell: null,
    originScene: null,
    preview: null,
    previewCreated: false
  };
}
function buildStatus(state, extras = {}) {
  const preview = state.preview ?? null;
  return {
    active: state.active,
    pending: state.pending,
    encounterId: state.encounterId,
    tokenId: state.tokenId,
    characterId: state.characterId,
    characterName: state.characterName,
    moveCurrent: state.moveCurrent,
    moveMax: state.moveMax,
    stateVersion: state.stateVersion,
    movementVersion: state.movementVersion,
    tacticalGrid: state.grid,
    preview: preview ? {
      cell_q: preview.cell.q,
      cell_r: preview.cell.r,
      scene_x: preview.scene.x,
      scene_y: preview.scene.y,
      distanceCells: preview.distanceCells,
      moveCostM: preview.moveCostM,
      remainingMoveM: preview.remainingMoveM,
      inRange: preview.inRange
    } : null,
    ...extras
  };
}
function extractParticipant(runtime, characterId, tokenId) {
  const participants = ensureArray2(runtime?.visible_participants);
  return participants.find((participant) => {
    const participantCharacterId = String(participant?.character_id ?? "").trim();
    const participantTokenId = String(participant?.token_id ?? "").trim();
    return participantCharacterId && participantCharacterId === characterId || participantTokenId && tokenId && participantTokenId === tokenId;
  }) ?? null;
}
function resolvePreviewIds(playerId = "") {
  const safe = String(playerId || "viewer").replace(/[^a-z0-9_-]/gi, "_");
  return {
    lineId: `odyssey-move-preview-line-${safe}`,
    labelId: `odyssey-move-preview-label-${safe}`
  };
}
function buildPreviewLabel(preview) {
  if (!preview) return "";
  if (!preview.inRange) {
    return `${preview.moveCostM} m | \u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E MOVE`;
  }
  return `${preview.moveCostM} m | \u043E\u0441\u0442\u0430\u043B\u043E\u0441\u044C ${preview.remainingMoveM} m`;
}
function buildLineItem(ids, from, to) {
  return buildLine().id(ids.lineId).name("Odyssey Move Preview").layer("POINTER").locked(true).disableHit(true).startPosition(from).endPosition(to).strokeColor("#ff6b6b").strokeOpacity(0.95).strokeWidth(6).strokeDash([10, 8]).build();
}
function buildLabelItem(ids, preview) {
  return buildText().id(ids.labelId).name("Odyssey Move Preview Label").layer("TEXT").locked(true).disableHit(true).position({ x: preview.scene.x + 10, y: preview.scene.y - 16 }).plainText(buildPreviewLabel(preview)).fontSize(18).fontWeight(700).padding(8).textAlign("LEFT").textAlignVertical("MIDDLE").fillColor(preview.inRange ? "#b9ffd1" : "#ffd5d5").fillOpacity(1).strokeColor("#08111f").strokeOpacity(0.85).strokeWidth(5).build();
}
function setupTacticalMoveTool({ runtime }) {
  const combatApi = runtime?.api?.combat;
  if (!combatApi) {
    addDiagnosticEntry("error", "Tactical move init failed", "Combat API is unavailable.");
    return {
      dispose() {
      }
    };
  }
  const state = createInitialState();
  const ids = { lineId: "", labelId: "" };
  let unsubscribeBroadcast = null;
  let unsubscribeSceneItems = null;
  let disposed = false;
  async function notify2(message, variant = "INFO") {
    try {
      await lib_default.notification.show(message, variant);
    } catch {
    }
  }
  async function publishStatus(extras = {}) {
    try {
      await publishMoveToolEvent(MOVE_TOOL_EVENTS.Status, buildStatus(state, extras));
    } catch {
    }
  }
  async function clearPreview() {
    if (!ids.lineId || !ids.labelId) return;
    try {
      await lib_default.scene.local.deleteItems([ids.lineId, ids.labelId]);
    } catch {
    }
    state.preview = null;
    state.previewCreated = false;
  }
  async function updatePreview(preview) {
    state.preview = preview;
    if (!ids.lineId || !ids.labelId) {
      const nextIds = resolvePreviewIds(state.player?.id);
      ids.lineId = nextIds.lineId;
      ids.labelId = nextIds.labelId;
    }
    const line = buildLineItem(ids, state.originScene, preview.scene);
    const label = buildLabelItem(ids, preview);
    try {
      if (!state.previewCreated) {
        await lib_default.scene.local.addItems([line, label]);
        state.previewCreated = true;
      } else {
        await lib_default.scene.local.updateItems([ids.lineId, ids.labelId], (items) => {
          for (const item of items) {
            if (item.id === ids.lineId && item.type === "LINE") {
              item.startPosition = line.startPosition;
              item.endPosition = line.endPosition;
              item.style = line.style;
            }
            if (item.id === ids.labelId && item.type === "TEXT") {
              item.position = label.position;
              item.text = label.text;
              item.metadata = label.metadata;
            }
          }
        });
      }
    } catch (error) {
      const normalized = normalizeError(error, "Unable to update move preview.");
      addDiagnosticEntry("error", "Move preview failed", normalized.message);
    }
    await publishStatus();
  }
  async function loadRuntimeForSelection(tokenId = "") {
    state.settings = await loadRoomSupabaseSettings();
    if (!hasSupabaseSettings(state.settings)) {
      throw new Error("Supabase room settings are not configured.");
    }
    state.player = await getPlayerInfo();
    const roomContext = await getRoomSceneContext();
    const runtimeResponse = await combatApi.getActiveRuntime(
      {
        campaign_id: roomContext.campaignId,
        room_id: roomContext.roomId,
        scene_id: roomContext.sceneId,
        actor_player_id: state.player.id,
        actor_is_gm: state.player.role === "GM",
        include_hidden: state.player.role === "GM"
      },
      state.settings
    );
    if (runtimeResponse?.ok === false) {
      throw new Error(runtimeResponse?.message || "Unable to read active encounter runtime.");
    }
    return { roomContext, runtimeResponse };
  }
  async function prepareFromSelectedToken(reason = "manual", commandPayload = {}) {
    const selectedTokens = await getSelectedOwlbearTokens();
    if (selectedTokens.length !== 1) {
      await clearPreview();
      state.active = false;
      state.pending = false;
      const message = "Select exactly one token before using Move.";
      await publishStatus({ error: message, reason });
      await publishMoveToolEvent(MOVE_TOOL_EVENTS.Error, {
        message,
        reason,
        characterId: String(commandPayload.characterId ?? "").trim(),
        tokenId: String(commandPayload.tokenId ?? "").trim()
      });
      await notify2(message, "WARNING");
      return false;
    }
    const token = selectedTokens[0];
    const selectedTokenId = String(token?.id ?? "").trim();
    if (commandPayload.tokenId && String(commandPayload.tokenId).trim() !== selectedTokenId) {
      const message = "Selected token changed before Move could start.";
      state.active = false;
      state.pending = false;
      await clearPreview();
      await publishStatus({ error: message, reason });
      await publishMoveToolEvent(MOVE_TOOL_EVENTS.Error, {
        message,
        reason,
        tokenId: selectedTokenId,
        characterId: String(commandPayload.characterId ?? "").trim()
      });
      await notify2(message, "WARNING");
      return false;
    }
    try {
      const { runtimeResponse } = await loadRuntimeForSelection(selectedTokenId);
      const encounter = runtimeResponse?.encounter;
      if (!encounter?.id) {
        throw new Error("No active combat exists for this scene.");
      }
      const participant = ensureArray2(
        runtimeResponse?.visible_participants
      ).find((row) => String(row?.token_id ?? "").trim() === selectedTokenId) ?? null;
      if (!participant) {
        throw new Error("The selected token is not an active combat participant.");
      }
      const characterId = String(
        participant.character_id ?? ""
      ).trim();
      if (!characterId) {
        throw new Error("The selected combat participant has no character ID.");
      }
      if (commandPayload.characterId && String(commandPayload.characterId).trim() !== characterId) {
        throw new Error("The selected token does not match the active character panel.");
      }
      if (!participant?.control?.allowed) {
        throw new Error("You cannot control this character right now.");
      }
      if (!participant?.is_current_turn) {
        throw new Error("It is not this character's turn.");
      }
      const tacticalGrid = normalizeTacticalGridSettings(runtimeResponse?.tactical_grid);
      if (!tacticalGrid) {
        throw new Error("The tactical grid has not been synced by the GM yet.");
      }
      const originPosition = participant?.position ?? null;
      if (!originPosition) {
        throw new Error("This token position has not been synced by the GM yet.");
      }
      state.active = true;
      state.pending = false;
      state.encounterId = String(encounter.id ?? "").trim();
      state.tokenId = String(participant.token_id ?? token.id ?? "").trim();
      state.characterId = characterId;
      state.characterName = String(participant.display_name ?? token.name ?? characterId).trim();
      state.stateVersion = Number(runtimeResponse?.state_version ?? encounter?.state_version ?? 0) || 0;
      state.movementVersion = Number(participant?.movement_version ?? 0) || 0;
      state.moveCurrent = Number(participant?.move_current ?? 0) || 0;
      state.moveMax = Number(participant?.move_max ?? 0) || 0;
      state.grid = tacticalGrid;
      state.originCell = {
        q: Number(originPosition.cell_q ?? 0) || 0,
        r: Number(originPosition.cell_r ?? 0) || 0
      };
      state.originScene = {
        x: Number(originPosition.scene_x ?? token.position?.x ?? 0) || 0,
        y: Number(originPosition.scene_y ?? token.position?.y ?? 0) || 0
      };
      await clearPreview();
      await publishStatus({ reason });
      await publishMoveToolEvent(MOVE_TOOL_EVENTS.Activated, buildStatus(state, { reason }));
      return true;
    } catch (error) {
      const message = toErrorMessage(error, "Unable to prepare movement for the selected token.");
      state.active = false;
      state.pending = false;
      await clearPreview();
      await publishStatus({ error: message, reason });
      await publishMoveToolEvent(MOVE_TOOL_EVENTS.Error, {
        message,
        reason,
        tokenId: selectedTokenId,
        characterId: String(commandPayload.characterId ?? "").trim()
      });
      await notify2(message, "WARNING");
      return false;
    }
  }
  function buildPreviewFromPosition(snappedPosition) {
    if (!state.active || !state.grid || !state.originCell || !state.originScene) return null;
    const cell = sceneToCell(state.grid, snappedPosition);
    if (!cell) return null;
    const distanceCells = computeDistanceCells(state.grid, state.originCell, cell);
    const moveCostM = distanceCells * state.grid.metersPerCell;
    const remainingMoveM = state.moveCurrent - moveCostM;
    return {
      cell,
      scene: { x: Number(snappedPosition.x) || 0, y: Number(snappedPosition.y) || 0 },
      distanceCells,
      moveCostM,
      remainingMoveM,
      inRange: remainingMoveM >= 0
    };
  }
  async function applyMove(preview) {
    if (!preview || !state.active || state.pending) return;
    state.pending = true;
    await publishStatus();
    try {
      const result = await combatApi.moveCharacter(
        {
          encounter_id: state.encounterId,
          character_id: state.characterId,
          token_id: state.tokenId,
          expected_state_version: state.stateVersion,
          expected_movement_version: state.movementVersion,
          actor_player_id: state.player?.id ?? "",
          actor_is_gm: state.player?.role === "GM",
          destination: {
            cell_q: preview.cell.q,
            cell_r: preview.cell.r,
            scene_x: preview.scene.x,
            scene_y: preview.scene.y
          }
        },
        state.settings
      );
      if (!result || result.ok === false) {
        const message = String(result?.message ?? result?.error ?? "Unable to move character.");
        if (result?.runtime) {
          const participant = extractParticipant(result.runtime, state.characterId, state.tokenId);
          if (participant?.position) {
            state.stateVersion = Number(result.runtime?.state_version ?? state.stateVersion) || state.stateVersion;
            state.movementVersion = Number(participant.movement_version ?? state.movementVersion) || state.movementVersion;
            state.moveCurrent = Number(participant.move_current ?? state.moveCurrent) || state.moveCurrent;
            state.moveMax = Number(participant.move_max ?? state.moveMax) || state.moveMax;
            state.originCell = {
              q: Number(participant.position.cell_q ?? state.originCell?.q ?? 0) || 0,
              r: Number(participant.position.cell_r ?? state.originCell?.r ?? 0) || 0
            };
            state.originScene = {
              x: Number(participant.position.scene_x ?? state.originScene?.x ?? 0) || 0,
              y: Number(participant.position.scene_y ?? state.originScene?.y ?? 0) || 0
            };
          }
        }
        await clearPreview();
        state.pending = false;
        await publishStatus({ error: message });
        await publishMoveToolEvent(MOVE_TOOL_EVENTS.Error, { message, code: result?.error ?? "" });
        await notify2(message, result?.error === "STATE_VERSION_CONFLICT" ? "WARNING" : "ERROR");
        return;
      }
      const nextPosition = result?.position ?? {};
      await lib_default.scene.items.updateItems([state.tokenId], (items) => {
        for (const item of items) {
          item.position = {
            x: Number(nextPosition.scene_x ?? preview.scene.x) || 0,
            y: Number(nextPosition.scene_y ?? preview.scene.y) || 0
          };
        }
      });
      state.originCell = {
        q: Number(nextPosition.cell_q ?? preview.cell.q) || 0,
        r: Number(nextPosition.cell_r ?? preview.cell.r) || 0
      };
      state.originScene = {
        x: Number(nextPosition.scene_x ?? preview.scene.x) || 0,
        y: Number(nextPosition.scene_y ?? preview.scene.y) || 0
      };
      state.moveCurrent = Number(result.move_current ?? state.moveCurrent) || 0;
      state.movementVersion = Number(result.movement_version ?? state.movementVersion) || 0;
      state.stateVersion = Number(result.state_version ?? state.stateVersion) || 0;
      state.pending = false;
      await clearPreview();
      await publishStatus({ applied: true });
      await publishMoveToolEvent(MOVE_TOOL_EVENTS.Applied, {
        ...buildStatus(state, { applied: true }),
        runtime: result.runtime ?? null
      });
      await notify2(
        result.move_cost_m > 0 ? `${state.characterName} moved ${result.move_cost_m} m.` : `${state.characterName} position confirmed.`,
        "SUCCESS"
      );
    } catch (error) {
      state.pending = false;
      await clearPreview();
      const normalized = normalizeError(error, "Unable to move character.");
      addDiagnosticEntry("error", "Move RPC failed", normalized.message);
      await publishStatus({ error: normalized.message });
      await publishMoveToolEvent(MOVE_TOOL_EVENTS.Error, { message: normalized.message });
      await notify2(normalized.message, "ERROR");
    }
  }
  async function cancelMove(reason = "cancelled") {
    state.active = false;
    state.pending = false;
    await clearPreview();
    await publishStatus({ reason });
    await publishMoveToolEvent(MOVE_TOOL_EVENTS.Cancelled, { reason });
  }
  async function handleToolMove(_context, event) {
    if (!state.active || state.pending || !state.grid) return;
    const snapped = await snapScenePosition(event.pointerPosition, 1);
    const preview = buildPreviewFromPosition(snapped);
    if (!preview) return;
    await updatePreview(preview);
  }
  async function handleToolClick(_context, event) {
    if (!state.active || state.pending || !state.grid) {
      return;
    }
    const snapped = await snapScenePosition(event.pointerPosition, 1);
    const preview = buildPreviewFromPosition(snapped);
    if (!preview) return;
    if (!preview.inRange) {
      await updatePreview(preview);
      await notify2("\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E MOVE", "WARNING");
      return;
    }
    await applyMove(preview);
  }
  async function handleToolActivate() {
    await prepareFromSelectedToken("tool-activate");
  }
  async function handleToolDeactivate() {
    await cancelMove("tool-deactivate");
  }
  async function handleSceneItemsChanged(items) {
    if (!state.active || !state.tokenId) return;
    const exists = ensureArray2(items).some((item) => String(item?.id ?? "").trim() === state.tokenId);
    if (!exists) {
      await cancelMove("token-missing");
    }
  }
  async function handleBroadcastMessage(message) {
    switch (message.type) {
      case MOVE_TOOL_COMMANDS.RequestStatus:
        await publishStatus({ reason: "status-request" });
        break;
      case MOVE_TOOL_COMMANDS.Cancel:
        await cancelMove("broadcast-cancel");
        break;
      case MOVE_TOOL_COMMANDS.ActivateSelected:
        if (await prepareFromSelectedToken(
          "broadcast-activate",
          message.payload ?? {}
        )) {
          await lib_default.tool.activateTool(TACTICAL_MOVE_TOOL_ID);
          await lib_default.tool.activateMode(TACTICAL_MOVE_TOOL_ID, TACTICAL_MOVE_MODE_ID);
        }
        break;
      default:
        break;
    }
  }
  async function registerTool() {
    await waitForObrReady();
    ids.lineId = resolvePreviewIds((await getPlayerInfo())?.id).lineId;
    ids.labelId = resolvePreviewIds((await getPlayerInfo())?.id).labelId;
    try {
      await lib_default.tool.removeMode(TACTICAL_MOVE_MODE_ID);
    } catch {
    }
    try {
      await lib_default.tool.remove(TACTICAL_MOVE_TOOL_ID);
    } catch {
    }
    await lib_default.tool.createMode({
      id: TACTICAL_MOVE_MODE_ID,
      icons: [{ icon: createToolIcon(), label: "Tactical Move" }],
      onToolMove: handleToolMove,
      onToolClick: handleToolClick,
      onActivate: handleToolActivate,
      onDeactivate: handleToolDeactivate,
      onKeyDown: async (_context, event) => {
        if (event.key === "Escape") {
          await cancelMove("escape");
        }
      }
    });
    await lib_default.tool.create({
      id: TACTICAL_MOVE_TOOL_ID,
      icons: [{ icon: createToolIcon(), label: "Tactical Move" }],
      defaultMode: TACTICAL_MOVE_MODE_ID,
      defaultMetadata: { extension: "odyssey" }
    });
    addDiagnosticEntry("info", "Tactical move tool ready", `tool=${TACTICAL_MOVE_TOOL_ID} mode=${TACTICAL_MOVE_MODE_ID}`);
  }
  async function start() {
    try {
      await registerTool();
      unsubscribeBroadcast = await subscribeMoveToolMessages(
        handleBroadcastMessage
      );
      unsubscribeSceneItems = await subscribeSceneItems(
        handleSceneItemsChanged
      );
      await publishStatus({
        ready: true,
        toolRegistered: true
      });
    } catch (error) {
      const normalized = normalizeError(
        error,
        "Unable to initialize tactical move tool."
      );
      console.error(
        "[Odyssey] Tactical move tool registration failed:",
        normalized
      );
      addDiagnosticEntry("error", "Tactical move init failed", normalized.message);
      await publishMoveToolEvent(
        MOVE_TOOL_EVENTS.Error,
        {
          source: "tool-registration",
          message: normalized.message
        },
        "LOCAL"
      );
      await notify2(
        `Tactical Move registration failed: ${normalized.message}`,
        "ERROR"
      );
    }
  }
  void start();
  return {
    async dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeBroadcast?.();
      unsubscribeSceneItems?.();
      await cancelMove("dispose");
      try {
        await lib_default.tool.removeMode(TACTICAL_MOVE_MODE_ID);
      } catch {
      }
      try {
        await lib_default.tool.remove(TACTICAL_MOVE_TOOL_ID);
      } catch {
      }
    }
  };
}

// background.js
async function bootstrapBackgroundShell() {
  const runtime = createOdysseyRuntime();
  setupCombatHudOverlay();
  setupTacticalMoveTool({ runtime });
  await waitForObrReady();
  const [player, roomContext, settings] = await Promise.all([
    getPlayerInfo(),
    getRoomSceneContext(),
    loadRoomSupabaseSettings()
  ]);
  globalThis.OdysseyBackgroundBridge = {
    runtime,
    player,
    roomContext,
    settings,
    supabaseConfigured: hasSupabaseSettings(settings)
  };
  addDiagnosticEntry(
    "info",
    "Background shell ready",
    `role=${player.role || "PLAYER"} room=${roomContext.roomId || "unknown"}`
  );
}
void bootstrapBackgroundShell().catch((error) => {
  addDiagnosticEntry(
    "error",
    "Background shell failed",
    String(error?.message ?? error)
  );
  throw error;
});
