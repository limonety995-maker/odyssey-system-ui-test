var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
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
        var listeners = arrayClone(handler, len);
        for (var i = 0; i < len; ++i)
          ReflectApply(listeners[i], this, args);
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
      var listeners, events, i;
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
      listeners = events[type];
      if (typeof listeners === "function") {
        this.removeListener(type, listeners);
      } else if (listeners !== void 0) {
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
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
    EventEmitter2.prototype.listeners = function listeners(type) {
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

// hud/styles/combatHudTokens.css
var combatHudTokens_default = "/*\r\n * Combat HUD \u2014 design tokens (Phase 0, palette refreshed for Phase 2).\r\n *\r\n * Semantic custom properties ONLY. No layout, no component rules \u2014 those live\r\n * in hud/components/combatHudLayout.css and hud/overlay/combatHudOverlay.css.\r\n * JavaScript must never hard-code colours; it stores semantic state names\r\n * (see hud/models/combatHudContracts.js) and the UI maps state \u2192 token here.\r\n *\r\n * Scope: variables are declared on a `.odyssey-hud` root class so the HUD's\r\n * theme cannot leak into the existing popup screens (Resolve Attack, etc.).\r\n *\r\n * The palette follows the approved Phase 2 references: a dark sci-fi MMORPG\r\n * panel \u2014 deep navy surfaces, thin blue-grey borders, bright colours reserved\r\n * for game-state accents only.\r\n */\r\n\r\n.odyssey-hud {\r\n  /* ---- Raw palette (approved Phase 2 reference) ---- */\r\n  --odyssey-bg-deep: #0e1320;\r\n  --odyssey-panel-base: #16203a;\r\n  --odyssey-panel-raised: #1a2236;\r\n  --odyssey-panel-hover: #232e47;\r\n  --odyssey-line: #3a4a66;\r\n  --odyssey-line-soft: #283448;\r\n\r\n  --odyssey-ink: #eaf0ff;\r\n  --odyssey-ink-muted: #9fb0d0;\r\n  --odyssey-ink-dim: #6b7a9c;\r\n\r\n  --odyssey-purple: #a78bfa;\r\n  --odyssey-purple-strong: #8b5cf6;\r\n  --odyssey-purple-panel: #26215c;\r\n  --odyssey-cyan: #34e1d6;\r\n  --odyssey-yellow: #ffc24b;\r\n  --odyssey-orange: #f59042;\r\n  --odyssey-red: #ff5c6c;\r\n  --odyssey-green: #4ade80;\r\n  --odyssey-steel: #aecbf0;     /* light cool blue \u2014 weapon / vehicle silhouettes */\r\n\r\n  /* ---- Semantic surfaces (names kept stable since Phase 0/1A) ---- */\r\n  --odyssey-hud-bg: rgba(14, 19, 32, 0.94);\r\n  --odyssey-hud-panel: rgba(22, 32, 58, 0.96);\r\n  --odyssey-hud-panel-raised: rgba(26, 34, 54, 0.98);\r\n  --odyssey-hud-panel-hover: #232e47;\r\n  --odyssey-hud-border: rgba(120, 142, 184, 0.30);\r\n  --odyssey-hud-border-strong: rgba(150, 172, 214, 0.55);\r\n\r\n  /* ---- Text ---- */\r\n  --odyssey-hud-text: var(--odyssey-ink);\r\n  --odyssey-hud-muted: var(--odyssey-ink-muted);\r\n  --odyssey-hud-dim: var(--odyssey-ink-dim);\r\n\r\n  /* ---- Generic valence ---- */\r\n  --odyssey-hud-positive: var(--odyssey-green);\r\n  --odyssey-hud-negative: var(--odyssey-red);\r\n  --odyssey-hud-warning: var(--odyssey-yellow);\r\n\r\n  /* ---- Action / ability semantics (spec colour language) ---- */\r\n  --odyssey-hud-attack: var(--odyssey-red);          /* red \u2014 attacking / hostile     */\r\n  --odyssey-hud-neutral: #8593b0;                    /* cool grey \u2014 defensive / util  */\r\n  --odyssey-hud-psionic: var(--odyssey-purple);      /* purple \u2014 psionics             */\r\n  --odyssey-hud-implant: var(--odyssey-cyan);        /* cyan \u2014 implants / tech        */\r\n  --odyssey-hud-intervention: var(--odyssey-yellow); /* gold \u2014 intervention           */\r\n\r\n  /* ---- State / availability ---- */\r\n  --odyssey-hud-state-active: var(--odyssey-green);\r\n  --odyssey-hud-state-unavailable: var(--odyssey-red);\r\n  --odyssey-hud-disabled: rgba(159, 176, 208, 0.22);\r\n\r\n  /* ---- Body zone condition scale (healthy \u2192 disabled) ---- */\r\n  /* healthy is a MUTED COOL tone (not green) per the spec. */\r\n  --odyssey-hud-zone-healthy: #6e7da0;\r\n  --odyssey-hud-zone-wounded: var(--odyssey-yellow);\r\n  --odyssey-hud-zone-serious: var(--odyssey-orange);\r\n  --odyssey-hud-zone-critical: var(--odyssey-red);\r\n  --odyssey-hud-zone-disabled: #39414f;\r\n  /* Combat data missing/denied (e.g. a target refresh blocked by RLS) \u2014 a\r\n   * distinct dim hatch-like grey, never the same as healthy. */\r\n  --odyssey-hud-zone-unknown: #2a3040;\r\n\r\n  /* ---- Resources ---- */\r\n  --odyssey-hud-shield: #5b9be0;\r\n  --odyssey-hud-psi: var(--odyssey-purple);\r\n  --odyssey-hud-weapon: var(--odyssey-steel);\r\n\r\n  /* ---- Elevation & geometry ---- */\r\n  --odyssey-hud-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);\r\n  --odyssey-hud-shadow-soft: 0 4px 14px rgba(0, 0, 0, 0.35);\r\n  --odyssey-hud-radius: 14px;       /* outer panels */\r\n  --odyssey-hud-radius-inner: 10px; /* nested cards / tiles */\r\n  --odyssey-hud-radius-chip: 9px;\r\n}\r\n";

// hud/overlay/combatHudOverlay.css
var combatHudOverlay_default = '/*\r\n * Combat HUD overlay \u2014 frame + collapsed pill (Phase 2.1).\r\n *\r\n * The popover iframe is sized tightly to the HUD by the background controller,\r\n * so the HUD fills it. NOTHING here may scroll vertically \u2014 overflow:hidden on\r\n * every level kills the native scrollbar seen in earlier builds. The only\r\n * permitted scroll is inside the expanded Battle Log list (see layout CSS).\r\n */\r\n\r\n*,\r\n*::before,\r\n*::after { box-sizing: border-box; }\r\n\r\nhtml, body {\r\n  height: 100%;\r\n  margin: 0;\r\n  overflow: hidden;            /* no native scrollbar */\r\n}\r\nbody {\r\n  background: transparent;\r\n  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\r\n  color: var(--odyssey-hud-text, #eaf0ff);\r\n}\r\n\r\n#root { height: 100%; overflow: hidden; }\r\n\r\n/* The popover rect IS the HUD footprint; the HUD fills it. */\r\n.ohud-overlay {\r\n  height: 100%;\r\n  width: 100%;\r\n  overflow: hidden;\r\n  background: transparent;\r\n}\r\n\r\n/* ===================== Collapsed pill ===================== */\r\n.ohud-overlay.is-collapsed {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n}\r\n.ohud-pill {\r\n  display: inline-flex; align-items: center; gap: 8px;\r\n  padding: 8px 14px; cursor: pointer;\r\n  font: inherit; font-size: 12px; font-weight: 700; letter-spacing: 1px;\r\n  color: var(--odyssey-hud-text);\r\n  background: var(--odyssey-hud-bg); border: 1px solid var(--odyssey-hud-border-strong);\r\n  border-radius: 20px; box-shadow: var(--odyssey-hud-shadow);\r\n  backdrop-filter: blur(7px); -webkit-backdrop-filter: blur(7px);\r\n}\r\n.ohud-pill:hover { border-color: var(--odyssey-purple); }\r\n.ohud-pill .ohud-mark { color: var(--odyssey-purple); display: inline-flex; }\r\n.ohud-pill-label { line-height: 1; }\r\n';

// hud/components/combatHudLayout.css
var combatHudLayout_default = `/*\r
 * Combat HUD \u2014 Phase 2.1 layout & module styles.\r
 *\r
 * Bottom-left composition: a tall PlayerBlock, a responsive gap, then a compact\r
 * combat rail (Gun \xB7 Skills \xB7 Target \xB7 Mod+Action). A thin top strip holds the\r
 * drag grip + dev + LOG + collapse. Scoped under .ohud-hud; consumes semantic\r
 * tokens from combatHudTokens.css. No raw colours from JS, no native scrollbar.\r
 */\r
\r
/* ===================== Shell ===================== */\r
.ohud-hud {\r
  position: relative;\r
  width: 100%;\r
  height: 100%;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 2px;\r
  padding: 2px 6px 4px;\r
  overflow: hidden;                 /* no native scrollbar \u2014 content fits */\r
  color: var(--odyssey-hud-text);\r
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\r
  font-size: 12px;\r
  --ohud-gap: 200px;\r
}\r
.ohud-hud.is-dragging { user-select: none; }\r
.ohud-hud.is-dragging, .ohud-hud.is-dragging * { cursor: grabbing !important; }\r
\r
/* ---- top control strip (thin) ---- */\r
.ohud-controls {\r
  display: flex; align-items: center; gap: 8px;\r
  height: 16px; flex: 0 0 16px; padding: 0 2px;\r
}\r
.ohud-grip {\r
  display: inline-flex; align-items: center; justify-content: center;\r
  width: 22px; height: 14px; padding: 0; cursor: grab; touch-action: none;\r
  color: var(--odyssey-hud-muted);\r
  background: var(--odyssey-panel-base); border: 1px solid var(--odyssey-hud-border);\r
  border-radius: 5px;\r
}\r
.ohud-grip:hover { color: var(--odyssey-hud-text); border-color: var(--odyssey-hud-border-strong); }\r
.ohud-fallback {\r
  font-size: 9px; font-weight: 700; color: var(--odyssey-hud-warning);\r
  border: 1px dashed var(--odyssey-hud-warning); border-radius: 5px; padding: 0 6px;\r
}\r
.ohud-controls-right { margin-left: auto; display: flex; align-items: center; gap: 6px; }\r
.ohud-icon-btn {\r
  display: inline-flex; align-items: center; justify-content: center;\r
  width: 22px; height: 14px; padding: 0 2px; cursor: pointer;\r
  color: var(--odyssey-hud-muted);\r
  background: var(--odyssey-panel-base); border: 1px solid var(--odyssey-hud-border);\r
  border-radius: 5px;\r
}\r
.ohud-icon-btn:hover { color: var(--odyssey-hud-text); border-color: var(--odyssey-hud-border-strong); }\r
.ohud-icon-btn.is-on { color: var(--odyssey-cyan); border-color: var(--odyssey-cyan); }\r
\r
.ohud-dev { display: inline-flex; align-items: center; gap: 6px; }\r
.ohud-dev.is-open .ohud-icon-btn { color: var(--odyssey-purple); border-color: var(--odyssey-purple); }\r
.ohud-dev-strip { display: inline-flex; align-items: center; gap: 5px; }\r
.ohud-select {\r
  font: inherit; font-size: 10px; color: var(--odyssey-hud-text);\r
  background: var(--odyssey-panel-base); border: 1px solid var(--odyssey-hud-border);\r
  border-radius: 5px; padding: 1px 4px; cursor: pointer;\r
}\r
.ohud-chip {\r
  font: inherit; font-size: 10px; color: var(--odyssey-hud-muted);\r
  background: var(--odyssey-panel-base); border: 1px solid var(--odyssey-hud-border);\r
  border-radius: 10px; padding: 1px 8px; cursor: pointer;\r
}\r
.ohud-chip.is-on { background: var(--odyssey-purple-strong); border-color: var(--odyssey-purple-strong); color: #fff; }\r
\r
/* ===================== Main composition ===================== */\r
.ohud-main {\r
  flex: 1 1 auto; min-height: 0;\r
  display: flex; align-items: flex-end; gap: var(--ohud-gap);\r
}\r
.ohud-main--state { align-items: stretch; }\r
.ohud-rail {\r
  flex: 1 1 auto; min-width: 0;\r
  display: flex; align-items: flex-end; gap: 10px;\r
}\r
\r
/* ===================== Panel frame ===================== */\r
.ohud-panel {\r
  display: flex; flex-direction: column; gap: 4px; min-width: 0; min-height: 0;\r
  background: var(--odyssey-hud-panel);\r
  border: 1px solid var(--odyssey-hud-border);\r
  border-radius: var(--odyssey-hud-radius);\r
  box-shadow: var(--odyssey-hud-shadow-soft);\r
  padding: 6px 8px;\r
}\r
.ohud-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 11px; }\r
.ohud-panel-label { font-size: 10px; font-weight: 700; letter-spacing: 0.3px; color: var(--odyssey-hud-dim); }\r
.ohud-panel-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }\r
.ohud-muted-fill { color: var(--odyssey-hud-dim); font-size: 11px; display: grid; place-items: center; flex: 1; }\r
\r
/* block footprints (desktop) */\r
.ohud-panel--player { flex: 0 0 144px; height: 146px; }\r
.ohud-panel--gun { flex: 0 0 240px; height: 95px; }\r
.ohud-panel--skills { flex: 1 1 auto; min-width: 280px; height: 95px; }\r
.ohud-panel--target { flex: 0 0 100px; height: 95px; }\r
.ohud-panel--modact { flex: 0 0 126px; height: 95px; }\r
\r
/* accent text colours */\r
.ohud-accent--attack { color: var(--odyssey-hud-attack); }\r
.ohud-accent--psionic { color: var(--odyssey-hud-psionic); }\r
.ohud-accent--implant { color: var(--odyssey-hud-implant); }\r
.ohud-accent--intervention { color: var(--odyssey-hud-intervention); }\r
.ohud-accent--positive { color: var(--odyssey-hud-positive); }\r
.ohud-accent--negative { color: var(--odyssey-hud-negative); }\r
.ohud-accent--neutral { color: var(--odyssey-hud-neutral); }\r
\r
/* ===================== Body zones (silhouettes) ===================== */\r
.ohud-silhouette { display: block; }\r
.ohud-zone { transition: fill 120ms ease; }\r
.ohud-zone--healthy { fill: var(--odyssey-hud-zone-healthy); }\r
.ohud-zone--wounded { fill: var(--odyssey-hud-zone-wounded); }\r
.ohud-zone--serious { fill: var(--odyssey-hud-zone-serious); }\r
.ohud-zone--critical { fill: var(--odyssey-hud-zone-critical); }\r
.ohud-zone--disabled { fill: var(--odyssey-hud-zone-disabled); }\r
/* Combat data missing/denied \u2014 never the same as healthy (Phase 3D.1). */\r
.ohud-zone--unknown { fill: var(--odyssey-hud-zone-unknown); }\r
/* Selection outline is a STROKE, not a fill override \u2014 it must never hide\r
 * the zone's actual condition colour underneath. */\r
.ohud-zone.is-target { stroke: var(--odyssey-cyan); stroke-width: 2.5; }\r
\r
/* ===================== Player block ===================== */\r
.ohud-turn {\r
  font-size: 8.5px; font-weight: 800; letter-spacing: 0.4px; padding: 1px 6px; border-radius: 7px;\r
  border: 1px solid transparent; white-space: nowrap;\r
}\r
.ohud-turn--active { color: #06210f; background: var(--odyssey-hud-state-active); }\r
.ohud-turn--waiting { color: #2a1c00; background: var(--odyssey-hud-warning); }\r
.ohud-turn--gm { color: #fff; background: var(--odyssey-purple-strong); }\r
.ohud-turn--idle { color: var(--odyssey-hud-muted); border-color: var(--odyssey-hud-border); }\r
/* Phase 3E.0: server round number shown next to the turn label in combat. */\r
.ohud-turn-round {\r
  font-size: 8.5px; font-weight: 800; letter-spacing: 0.4px; padding: 1px 5px; border-radius: 7px;\r
  margin-right: 3px; color: var(--odyssey-hud-muted); border: 1px solid var(--odyssey-hud-border);\r
  white-space: nowrap;\r
}\r
\r
/* Phase 3E.0: compact END TURN button inside the Action strip. */\r
.ohud-endturn-btn {\r
  flex: 0 0 auto; margin-left: 4px; padding: 0 7px;\r
  font-size: 9px; font-weight: 800; letter-spacing: 0.4px;\r
  color: #2a1c00; background: var(--odyssey-hud-warning);\r
  border: 1px solid transparent; border-radius: 6px; cursor: pointer;\r
}\r
.ohud-endturn-btn[disabled] { opacity: 0.5; cursor: default; }\r
\r
/* Phase 3E.0: GM-only COMBAT button in the Mod header. */\r
.ohud-cc-combat-btn {\r
  margin-left: auto; padding: 0 6px; font-size: 8.5px; font-weight: 800; letter-spacing: 0.4px;\r
  color: #fff; background: var(--odyssey-purple-strong);\r
  border: 1px solid transparent; border-radius: 6px; cursor: pointer;\r
}\r
\r
/* Phase 3E.0: GM Combat Tracker companion popover. */\r
.ohud-gmct { display: flex; flex-direction: column; height: 100%; overflow: hidden; }\r
.ohud-gmct .ohud-panel-head { flex: 0 0 auto; display: flex; align-items: baseline; gap: 8px; }\r
.ohud-gmct-current { font-size: 10px; color: var(--odyssey-hud-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\r
.ohud-gmct-candidates { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 6px 8px; display: flex; flex-direction: column; gap: 4px; }\r
.ohud-gmct-candidate { display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer; }\r
.ohud-gmct-candidate .ohud-gmct-name { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\r
.ohud-gmct-tag { font-size: 8.5px; font-weight: 800; color: var(--odyssey-hud-muted); border: 1px solid var(--odyssey-hud-border); border-radius: 6px; padding: 0 4px; }\r
.ohud-gmct-tag.is-skip { color: #2a1c00; background: var(--odyssey-hud-warning); border-color: transparent; }\r
.ohud-gmct-list { list-style: none; margin: 0; padding: 4px 8px; flex: 1 1 auto; min-height: 0; overflow-y: auto; }\r
.ohud-gmct-row { display: flex; align-items: baseline; gap: 6px; padding: 2px 0; font-size: 11px; }\r
.ohud-gmct-row.is-current { color: var(--odyssey-hud-state-active); font-weight: 700; }\r
.ohud-gmct-row.is-skipped { opacity: 0.55; }\r
.ohud-gmct-marker { width: 10px; flex: 0 0 auto; }\r
.ohud-gmct-row .ohud-gmct-name { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\r
.ohud-gmct-init { flex: 0 0 auto; font-weight: 700; }\r
.ohud-gmct-actions { flex: 0 0 auto; display: flex; gap: 6px; padding: 6px 8px; border-top: 1px solid var(--odyssey-hud-border); }\r
.ohud-gmct-btn {\r
  flex: 1 1 auto; padding: 4px 6px; font-size: 10px; font-weight: 700;\r
  color: var(--odyssey-hud-text); background: transparent;\r
  border: 1px solid var(--odyssey-hud-border); border-radius: 6px; cursor: pointer;\r
}\r
.ohud-gmct-btn.is-primary { color: #06210f; background: var(--odyssey-hud-state-active); border-color: transparent; }\r
.ohud-gmct-btn.is-danger { color: #fff; background: var(--odyssey-hud-danger, #a33); border-color: transparent; }\r
.ohud-gmct-btn[disabled] { opacity: 0.5; cursor: default; }\r
.ohud-gmct-denied { padding: 12px; color: var(--odyssey-hud-muted); }\r
.ohud-gmct-empty { padding: 8px 0; color: var(--odyssey-hud-muted); font-size: 11px; }\r
\r
.ohud-player-grid { display: grid; grid-template-columns: 46px 1fr; gap: 7px; align-items: center; flex: 1; min-height: 0; }\r
.ohud-figure { position: relative; width: 46px; height: 100%; min-height: 50px; display: grid; place-items: center; }\r
.ohud-figure-svg { width: 100%; height: 100%; }\r
.ohud-figure-shield {\r
  position: absolute; right: -4px; bottom: 0; width: 16px; height: 18px;\r
  color: var(--odyssey-hud-shield); opacity: 0.85;\r
}\r
.ohud-figure--ghost { opacity: 0.4; }\r
\r
.ohud-player-stats { display: flex; flex-direction: column; gap: 4px; min-width: 0; }\r
.ohud-player-name {\r
  font-size: 12px; font-weight: 700; color: var(--odyssey-hud-text);\r
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\r
}\r
.ohud-res { display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: 5px; }\r
.ohud-res-label { font-size: 8px; font-weight: 700; color: var(--odyssey-hud-dim); }\r
.ohud-res-track { height: 6px; border-radius: 3px; background: var(--odyssey-line-soft); overflow: hidden; }\r
.ohud-res-fill { display: block; height: 100%; border-radius: 3px; }\r
.ohud-res--shield .ohud-res-fill { background: var(--odyssey-hud-shield); }\r
.ohud-res--psi .ohud-res-fill { background: var(--odyssey-hud-psi); }\r
.ohud-res-num { font-size: 10px; font-weight: 700; color: var(--odyssey-hud-text); font-variant-numeric: tabular-nums; }\r
.ohud-res-max { color: var(--odyssey-hud-dim); font-weight: 600; }\r
\r
.ohud-pips { display: flex; gap: 4px; }\r
.ohud-pip { font-size: 8px; font-weight: 800; padding: 1px 6px; border-radius: 5px; border: 1px solid var(--odyssey-hud-border); }\r
.ohud-pip.is-on { color: #06210f; background: var(--odyssey-hud-state-active); border-color: transparent; }\r
.ohud-pip.is-off { color: var(--odyssey-hud-dim); }\r
\r
.ohud-pilot { display: flex; align-items: center; gap: 5px; padding: 2px 6px; border-radius: 7px;\r
  background: var(--odyssey-purple-panel); border: 1px solid rgba(167, 139, 250, 0.4); }\r
.ohud-pilot-tag { font-size: 7.5px; font-weight: 800; letter-spacing: 0.8px; color: var(--odyssey-purple); }\r
.ohud-pilot-name { font-size: 10px; color: var(--odyssey-hud-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\r
.ohud-pilot-psi { margin-left: auto; font-size: 9px; color: var(--odyssey-purple); }\r
\r
.ohud-statuses { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; }\r
.ohud-chip-status {\r
  display: inline-flex; align-items: center; gap: 3px; max-width: 100%;\r
  font-size: 8.5px; padding: 1px 5px 1px 2px; border-radius: 8px;\r
  border: 1px solid var(--odyssey-hud-border); background: var(--odyssey-panel-base); color: var(--odyssey-hud-muted);\r
}\r
.ohud-chip-dot { width: 12px; height: 12px; border-radius: 50%; display: grid; place-items: center; font-size: 7px; font-weight: 800; color: #0a0e18; }\r
.ohud-chip-status--positive .ohud-chip-dot { background: var(--odyssey-hud-positive); }\r
.ohud-chip-status--negative .ohud-chip-dot { background: var(--odyssey-hud-negative); }\r
.ohud-chip-status--neutral .ohud-chip-dot { background: var(--odyssey-hud-neutral); }\r
.ohud-chip-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\r
.ohud-chip-status--more { color: var(--odyssey-hud-dim); padding: 1px 6px; font-weight: 700; }\r
\r
/* ===================== Gun block ===================== */\r
.ohud-gun { display: grid; grid-template-columns: 1fr 70px; gap: 7px; flex: 1; min-height: 0; }\r
.ohud-gun.is-disabled { opacity: 0.55; }\r
.ohud-gun-main {\r
  position: relative; border-radius: var(--odyssey-hud-radius-inner);\r
  border: 1.5px solid var(--odyssey-hud-border-strong);\r
  background: var(--odyssey-bg-deep); min-width: 0; overflow: hidden;\r
}\r
.ohud-gun-name { position: absolute; top: 4px; left: 8px; font-size: 9px; color: var(--odyssey-hud-muted); }\r
.ohud-gun-caret { position: absolute; top: 3px; right: 5px; color: var(--odyssey-hud-muted); display: inline-flex; }\r
.ohud-gun-silhouette { position: absolute; inset: 13px 8px 10px; color: var(--odyssey-hud-weapon); display: block; }\r
.ohud-gun-silhouette svg { width: 100%; height: 100%; }\r
.ohud-firemode {\r
  position: absolute; right: 6px; bottom: 5px; display: inline-flex; align-items: center; gap: 4px;\r
  padding: 1px 6px 1px 2px; border-radius: 10px; max-width: calc(100% - 12px);\r
  background: var(--odyssey-panel-base); border: 1px solid var(--odyssey-hud-border);\r
  color: inherit; font: inherit;\r
}\r
.ohud-firemode-knob { width: 9px; height: 9px; border-radius: 50%; background: var(--odyssey-hud-muted); flex: 0 0 auto; }\r
.ohud-firemode-letter {\r
  font-size: 9px; font-weight: 700; color: var(--odyssey-hud-text); letter-spacing: 0.4px;\r
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\r
}\r
/* Interactive variant (2+ fire modes) \u2014 opens the fire-mode companion popover.\r
 * A single mode stays the plain read-only span above; no modes \u2192 not rendered\r
 * at all (see GunBlock.js renderFireModeControl). */\r
.ohud-firemode.is-selectable { cursor: pointer; }\r
.ohud-firemode.is-selectable:hover { border-color: var(--odyssey-purple); }\r
.ohud-firemode-caret { display: inline-flex; width: 8px; height: 8px; color: var(--odyssey-hud-muted); flex: 0 0 auto; }\r
.ohud-firemode-caret svg { width: 100%; height: 100%; }\r
.ohud-gun-secondary { position: absolute; left: 6px; bottom: 5px; font-size: 8px; font-weight: 700; color: var(--odyssey-hud-muted); border: 1px solid var(--odyssey-hud-border); border-radius: 6px; padding: 0 5px; }\r
\r
.ohud-gun-side { display: grid; grid-template-rows: 1fr 1fr; gap: 6px; min-width: 0; }\r
.ohud-mag-card { position: relative; display: flex; align-items: center; gap: 3px; border-radius: var(--odyssey-hud-radius-inner);\r
  border: 1px solid var(--odyssey-hud-border); background: var(--odyssey-panel-base); padding: 2px 5px; }\r
.ohud-mag-icon { width: 13px; height: 20px; color: var(--odyssey-steel); display: inline-flex; }\r
.ohud-mag-icon svg { width: 100%; height: 100%; }\r
.ohud-mag-caret { position: absolute; top: 2px; right: 3px; color: var(--odyssey-hud-muted); }\r
.ohud-mag-type { margin-left: auto; font-size: 9px; font-weight: 700; color: var(--odyssey-hud-text); }\r
.ohud-ammo-card { display: flex; flex-direction: column; justify-content: center; border-radius: var(--odyssey-hud-radius-inner);\r
  border: 1px solid var(--odyssey-hud-border); background: var(--odyssey-panel-base); padding: 2px 6px; }\r
.ohud-ammo-head { display: flex; align-items: center; justify-content: space-between; }\r
.ohud-ammo-label { font-size: 8px; letter-spacing: 0.5px; color: var(--odyssey-hud-dim); }\r
.ohud-ammo-reload { color: var(--odyssey-hud-muted); display: inline-flex; }\r
.ohud-ammo-reload.is-off { opacity: 0.35; }\r
.ohud-ammo-count { font-weight: 800; line-height: 1; color: var(--odyssey-hud-text); font-variant-numeric: tabular-nums; }\r
.ohud-ammo-cur { font-size: clamp(22px, 2.2vw, 28px); }\r
.ohud-ammo-max { font-size: 11px; color: var(--odyssey-hud-dim); }\r
.ohud-ammo-count--empty .ohud-ammo-cur { color: var(--odyssey-hud-negative); }\r
\r
/* ===================== Skill block ===================== */\r
.ohud-panel--skills .ohud-panel-body { justify-content: flex-end; }\r
.ohud-skill-groups { display: flex; align-items: flex-end; gap: 14px; flex-wrap: nowrap; overflow: hidden; }\r
.ohud-skill-group { display: flex; flex-direction: column; gap: 3px; min-width: 0; }\r
.ohud-group-cap { font-size: 10px; font-weight: 700; }\r
.ohud-group-tiles { display: flex; gap: 6px; }\r
.ohud-slot {\r
  position: relative; width: clamp(44px, 3.4vw, 54px); height: clamp(44px, 3.4vw, 54px);\r
  border-radius: var(--odyssey-hud-radius-inner);\r
  border: 1.5px solid var(--odyssey-hud-border);\r
  background: var(--odyssey-bg-deep);\r
  display: grid; place-items: center; color: var(--odyssey-hud-neutral);\r
}\r
.ohud-slot-icon { width: 58%; height: 58%; display: inline-flex; }\r
.ohud-slot-icon svg { width: 100%; height: 100%; }\r
.ohud-accent--attack.ohud-slot { border-color: var(--odyssey-hud-attack); color: var(--odyssey-hud-attack); }\r
.ohud-accent--psionic.ohud-slot { border-color: var(--odyssey-purple); color: var(--odyssey-purple); }\r
.ohud-accent--implant.ohud-slot { border-color: var(--odyssey-cyan); color: var(--odyssey-cyan); }\r
.ohud-accent--positive.ohud-slot { border-color: var(--odyssey-green); color: var(--odyssey-green); }\r
.ohud-accent--neutral.ohud-slot { border-color: var(--odyssey-hud-border-strong); color: var(--odyssey-hud-neutral); }\r
.ohud-slot.is-disabled { opacity: 0.42; filter: grayscale(0.4); }\r
.ohud-slot.is-selected { box-shadow: 0 0 0 2px var(--odyssey-cyan); }\r
.ohud-slot.is-toggled { background: rgba(167, 139, 250, 0.16); }\r
.ohud-slot-cost { position: absolute; left: 3px; bottom: 2px; font-size: 8px; font-weight: 800; color: var(--odyssey-hud-dim); }\r
.ohud-slot-res { position: absolute; right: 3px; bottom: 2px; font-size: 8px; font-weight: 800; color: var(--odyssey-purple); }\r
.ohud-slot-cd { position: absolute; top: 2px; right: 3px; font-size: 9px; font-weight: 800; color: var(--odyssey-hud-warning); }\r
.ohud-slot-toggle { position: absolute; top: 3px; left: 3px; width: 6px; height: 6px; border-radius: 50%; background: var(--odyssey-purple); }\r
\r
/* ===================== Target block ===================== */\r
.ohud-target { display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1; min-height: 0; justify-content: center; }\r
.ohud-target .ohud-figure { width: 42px; }\r
.ohud-target-meta { text-align: center; min-width: 0; width: 100%; }\r
.ohud-target-name { font-size: 10px; font-weight: 700; color: var(--odyssey-hud-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\r
.ohud-target-zone { display: inline-block; margin-top: 1px; font-size: 8px; font-weight: 800; letter-spacing: 0.5px;\r
  color: var(--odyssey-cyan); border: 1px solid rgba(52, 225, 214, 0.4); border-radius: 6px; padding: 0 6px; }\r
.ohud-target.is-empty .ohud-target-hint { font-size: 9px; font-weight: 700; color: var(--odyssey-hud-dim); }\r
\r
/* ===================== Mod + Action column ===================== */\r
.ohud-panel--modact { gap: 3px; }\r
.ohud-mods { display: flex; flex-direction: column; gap: 3px; flex: 1 1 auto; min-height: 0; overflow: hidden; }\r
.ohud-mod {\r
  display: flex; align-items: center; justify-content: space-between; gap: 4px;\r
  height: 17px; font-size: 9px; padding: 0 6px; border-radius: var(--odyssey-hud-radius-chip);\r
  border: 1px solid var(--odyssey-hud-border); background: var(--odyssey-panel-base); color: var(--odyssey-hud-muted);\r
}\r
.ohud-mod-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\r
.ohud-mod-val { font-weight: 800; flex: 0 0 auto; }\r
.ohud-mod--positive { border-color: rgba(74, 222, 128, 0.55); color: var(--odyssey-green); }\r
.ohud-mod--negative { border-color: rgba(255, 92, 108, 0.6); color: var(--odyssey-red); }\r
.ohud-mod--intervention { border-color: rgba(255, 194, 75, 0.6); color: var(--odyssey-yellow); }\r
.ohud-mod--narrative { border-color: rgba(167, 139, 250, 0.55); color: var(--odyssey-purple); }\r
.ohud-mod.is-selected { box-shadow: 0 0 0 1.5px var(--odyssey-cyan); }\r
.ohud-mod.is-passive { opacity: 0.85; }\r
\r
.ohud-action { display: flex; align-items: center; gap: 6px; }\r
.ohud-action-econ { display: flex; gap: 3px; }\r
.ohud-econ-pip { font-size: 7.5px; font-weight: 800; padding: 0 4px; border-radius: 5px; color: var(--odyssey-hud-dim); border: 1px solid var(--odyssey-hud-border); }\r
.ohud-econ-pip.is-spend { color: var(--odyssey-cyan); border-color: var(--odyssey-cyan); }\r
.ohud-action-btn {\r
  flex: 1 1 auto; height: 22px; cursor: pointer; font: inherit;\r
  font-size: 12px; font-weight: 700; letter-spacing: 0.5px;\r
  border-radius: 7px; border: 1.5px solid var(--odyssey-purple);\r
  background: linear-gradient(180deg, rgba(139, 92, 246, 0.22), rgba(38, 33, 92, 0.42));\r
  color: var(--odyssey-purple);\r
}\r
.ohud-action-btn.is-ready:hover { background: rgba(139, 92, 246, 0.34); color: #fff; }\r
.ohud-action-btn.is-disabled { cursor: not-allowed; border-color: var(--odyssey-hud-border); background: var(--odyssey-panel-base); color: var(--odyssey-hud-dim); }\r
\r
/* ===================== Floating Battle Log ===================== */\r
.ohud-log-float { position: absolute; top: 18px; right: 6px; z-index: 8; width: 250px; max-width: calc(100% - 12px); }\r
.ohud-log-panel { max-height: 128px; box-shadow: var(--odyssey-hud-shadow); }\r
.ohud-log-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; overflow-y: auto; flex: 1; min-height: 0; }\r
.ohud-log-list::-webkit-scrollbar { width: 5px; }\r
.ohud-log-list::-webkit-scrollbar-thumb { background: var(--odyssey-line); border-radius: 3px; }\r
.ohud-log-row { font-size: 10px; line-height: 1.25; color: var(--odyssey-hud-muted); display: flex; flex-wrap: wrap; gap: 4px; align-items: baseline; padding: 2px 4px; border-radius: 5px; background: var(--odyssey-bg-deep); }\r
.ohud-log-row--system { color: var(--odyssey-hud-dim); background: transparent; font-style: italic; }\r
.ohud-log-row--narr { color: var(--odyssey-purple); background: transparent; font-style: italic; }\r
.ohud-log-actor { font-weight: 700; color: var(--odyssey-hud-text); }\r
.ohud-log-act { color: var(--odyssey-hud-muted); }\r
.ohud-log-arrow { color: var(--odyssey-hud-dim); }\r
.ohud-log-target { color: var(--odyssey-hud-text); }\r
.ohud-log-delta { margin-left: auto; font-weight: 700; font-size: 9.5px; }\r
.ohud-log-delta--hit { color: var(--odyssey-green); }\r
.ohud-log-delta--miss { color: var(--odyssey-hud-dim); }\r
.ohud-log-delta--neutral { color: var(--odyssey-hud-muted); }\r
.ohud-log-empty { font-size: 10px; color: var(--odyssey-hud-dim); display: grid; place-items: center; flex: 1; padding: 8px; }\r
/* Phase 3D.1: ?debug=1-only \u2014 never rendered in normal play. */\r
.ohud-log-debug-btn {\r
  font-size: 8px; font-weight: 800; letter-spacing: 0.3px; padding: 1px 5px;\r
  border: 1px solid var(--odyssey-hud-border); border-radius: 6px;\r
  background: rgba(255, 92, 108, 0.12); color: var(--odyssey-red, #e74c3c); cursor: pointer;\r
}\r
.ohud-log-debug-btn:hover { border-color: var(--odyssey-red, #e74c3c); }\r
/* Real combat-result entries (Phase 3D.1) \u2014 a title line + short detail lines,\r
 * stacked instead of the single-line actor/action/target/delta mock layout. */\r
.ohud-log-row--result { flex-direction: column; align-items: stretch; gap: 1px; }\r
.ohud-log-result-title { font-weight: 700; font-size: 10px; }\r
.ohud-log-result-title.ohud-log-delta--hit { color: var(--odyssey-green); }\r
.ohud-log-result-title.ohud-log-delta--miss { color: var(--odyssey-hud-dim); }\r
.ohud-log-result-detail { color: var(--odyssey-hud-muted); font-size: 9.5px; }\r
\r
/* ===================== Empty / error / loading ===================== */\r
.ohud-state-wrap { flex: 1 1 auto; display: grid; place-items: center; background: var(--odyssey-hud-panel);\r
  border: 1px solid var(--odyssey-hud-border); border-radius: var(--odyssey-hud-radius); box-shadow: var(--odyssey-hud-shadow-soft); }\r
.ohud-empty { text-align: center; padding: 10px; display: flex; flex-direction: column; align-items: center; gap: 5px; }\r
.ohud-empty-mark { color: var(--odyssey-purple); opacity: 0.8; }\r
.ohud-empty-title { font-size: 13px; font-weight: 800; letter-spacing: 1px; color: var(--odyssey-hud-text); }\r
.ohud-empty-hint { font-size: 11px; color: var(--odyssey-hud-muted); max-width: 420px; }\r
.ohud-empty--error .ohud-empty-title { color: var(--odyssey-hud-negative); }\r
\r
/* ===================== Toast ===================== */\r
.ohud-toast { position: absolute; left: 50%; bottom: 6px; transform: translateX(-50%);\r
  font-size: 11px; color: var(--odyssey-hud-text); background: var(--odyssey-panel-base);\r
  border: 1px solid var(--odyssey-hud-border-strong); border-radius: 8px; padding: 4px 11px;\r
  box-shadow: var(--odyssey-hud-shadow); z-index: 12; }\r
.ohud-toast[hidden] { display: none; }\r
\r
/* ===================== Tooltip ===================== */\r
.ohud-tooltip { position: fixed; z-index: 50; pointer-events: none; max-width: 240px;\r
  background: var(--odyssey-bg-deep); border: 1px solid var(--odyssey-hud-border-strong);\r
  border-radius: 8px; padding: 6px 9px; box-shadow: var(--odyssey-hud-shadow); }\r
.ohud-tooltip[hidden] { display: none; }\r
.ohud-tooltip-title { font-size: 11px; font-weight: 700; color: var(--odyssey-hud-text); }\r
.ohud-tooltip-line { font-size: 10px; color: var(--odyssey-hud-muted); margin-top: 2px; }\r
\r
/* ===================== Compact / mini (two rows) ===================== */\r
.ohud-hud[data-mode="compact"] .ohud-main,\r
.ohud-hud[data-mode="mini"] .ohud-main {\r
  flex-direction: column; align-items: stretch; gap: 8px;\r
}\r
.ohud-hud[data-mode="compact"] .ohud-panel--player,\r
.ohud-hud[data-mode="mini"] .ohud-panel--player { flex: 0 0 auto; height: auto; width: 100%; }\r
.ohud-hud[data-mode="compact"] .ohud-rail,\r
.ohud-hud[data-mode="mini"] .ohud-rail { flex-wrap: wrap; align-items: stretch; }\r
.ohud-hud[data-mode="compact"] .ohud-panel--skills,\r
.ohud-hud[data-mode="mini"] .ohud-panel--skills { flex: 1 1 100%; min-width: 0; }\r
.ohud-hud[data-mode="mini"] .ohud-res-label { display: none; }\r
.ohud-hud[data-mode="mini"] .ohud-fallback { display: none; }\r
\r
/* ===================== Quickbar (Phase 4.0b) ===================== */\r
/* Skills-module strip: slot tiles in rows; row 0 (slots 1-10) on the bottom,\r
 * higher rows stacked above (second row grows upward). */\r
.ohud-qb-wrap { display: flex; flex-direction: column; gap: 3px; height: 100%; min-height: 0; }\r
.ohud-qb { display: flex; flex-direction: column; gap: 3px; flex: 1 1 auto; min-height: 0; justify-content: flex-end; }\r
.ohud-qb--empty { justify-content: center; }\r
.ohud-qb-row { display: flex; gap: 3px; flex-wrap: nowrap; }\r
.ohud-qb-slot {\r
  position: relative; width: 34px; height: 34px; flex: 0 0 auto;\r
  display: grid; place-items: center; padding: 0;\r
  border: 1px solid var(--odyssey-hud-border); border-radius: 6px;\r
  background: var(--odyssey-hud-panel, rgba(255,255,255,0.04)); color: var(--odyssey-hud-text);\r
  cursor: pointer; overflow: hidden;\r
}\r
.ohud-qb-slot.is-empty { cursor: default; border-style: dashed; opacity: 0.5; background: transparent; }\r
.ohud-qb-slot.is-disabled { opacity: 0.45; cursor: default; }\r
.ohud-qb-slot.is-active { box-shadow: inset 0 0 0 2px var(--odyssey-hud-state-active); }\r
.ohud-qb-slot.is-missing { border-color: var(--odyssey-hud-danger, #a33); color: var(--odyssey-hud-danger, #a33); }\r
.ohud-qb-icon { width: 18px; height: 18px; display: block; }\r
.ohud-qb-name {\r
  position: absolute; bottom: 0; left: 0; right: 0; font-size: 6px; line-height: 1.1;\r
  text-align: center; padding: 0 1px 1px; background: rgba(0,0,0,0.35);\r
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\r
}\r
.ohud-qb-type { position: absolute; top: 1px; left: 2px; font-size: 5.5px; font-weight: 800; opacity: 0.8; letter-spacing: 0.3px; }\r
.ohud-qb-cd { position: absolute; top: 1px; right: 2px; font-size: 8px; font-weight: 800; color: var(--odyssey-hud-warning); }\r
.ohud-qb-active { position: absolute; top: 1px; right: 2px; font-size: 6px; font-weight: 800; color: var(--odyssey-hud-state-active); }\r
.ohud-qb-missing { font-size: 14px; font-weight: 800; }\r
.ohud-qb-edit {\r
  flex: 0 0 auto; align-self: flex-end; padding: 0 8px; height: 16px;\r
  font-size: 8.5px; font-weight: 800; letter-spacing: 0.4px;\r
  color: var(--odyssey-hud-text); background: transparent;\r
  border: 1px solid var(--odyssey-hud-border); border-radius: 6px; cursor: pointer;\r
}\r
\r
/* ===================== Quickbar editor companion popover (Phase 4.0c) =====================\r
 * A standalone sci-fi window: dark surface, thin glowing border, header / body\r
 * / footer. Slots 1-10 render on the TOP row, 11-20 on the BOTTOM row \u2014 a\r
 * deliberate, fixed departure from the visual reference used to design this. */\r
.ohud-qbe {\r
  position: relative;\r
  display: flex; flex-direction: column; height: 100%; overflow: hidden;\r
  background: linear-gradient(180deg, rgba(22, 31, 52, 0.98), rgba(12, 16, 27, 0.98));\r
  border: 1px solid var(--odyssey-hud-border-strong);\r
  border-radius: var(--odyssey-hud-radius);\r
  box-shadow: 0 0 0 1px rgba(93, 169, 255, 0.12), 0 0 36px rgba(64, 140, 255, 0.22), var(--odyssey-hud-shadow);\r
}\r
/* Sci-fi corner accents on the outer window (decorative only). */\r
.ohud-qbe::before, .ohud-qbe::after {\r
  content: ""; position: absolute; width: 16px; height: 16px; pointer-events: none; opacity: 0.55;\r
  border-color: var(--odyssey-hud-implant); z-index: 1;\r
}\r
.ohud-qbe::before { top: 6px; left: 6px; border-top: 2px solid; border-left: 2px solid; border-radius: 4px 0 0 0; }\r
.ohud-qbe::after { bottom: 6px; right: 6px; border-bottom: 2px solid; border-right: 2px solid; border-radius: 0 0 4px 0; }\r
\r
/* ---- Header ---- */\r
.ohud-qbe-header {\r
  flex: 0 0 auto; display: flex; align-items: center; gap: 10px;\r
  padding: 10px 14px; background: rgba(60, 120, 220, 0.08);\r
  border-bottom: 1px solid var(--odyssey-hud-border);\r
}\r
.ohud-qbe-header-icon {\r
  flex: 0 0 auto; width: 22px; height: 22px; display: grid; place-items: center;\r
  color: var(--odyssey-hud-implant); filter: drop-shadow(0 0 6px rgba(52, 225, 214, 0.55));\r
}\r
.ohud-qbe-header-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }\r
.ohud-qbe-header-title {\r
  font-size: 14px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;\r
  color: var(--odyssey-hud-text); text-shadow: 0 0 10px rgba(93, 169, 255, 0.3);\r
}\r
.ohud-qbe-header-subtitle {\r
  font-size: 10px; color: var(--odyssey-hud-muted);\r
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;\r
}\r
.ohud-qbe-close {\r
  flex: 0 0 auto; width: 24px; height: 24px; display: grid; place-items: center;\r
  font-size: 15px; line-height: 1; color: var(--odyssey-hud-muted);\r
  background: transparent; border: 1px solid var(--odyssey-hud-border); border-radius: 6px; cursor: pointer;\r
}\r
.ohud-qbe-close:hover { color: var(--odyssey-hud-negative); border-color: var(--odyssey-hud-negative); }\r
\r
/* ---- Body: two columns ---- */\r
.ohud-qbe-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 8px; padding: 10px 14px; overflow: hidden; }\r
.ohud-qbe-cols { flex: 1 1 auto; min-height: 0; display: flex; gap: 14px; }\r
.ohud-qbe-col { display: flex; flex-direction: column; min-width: 0; min-height: 0; gap: 6px; }\r
.ohud-qbe-col--library { flex: 0 0 250px; }\r
.ohud-qbe-col--slots { flex: 1 1 auto; }\r
\r
.ohud-qbe-section-label {\r
  flex: 0 0 auto; font-size: 10px; font-weight: 800; letter-spacing: 0.8px;\r
  color: var(--odyssey-hud-muted); text-transform: uppercase;\r
}\r
.ohud-qbe-hint { flex: 0 0 auto; font-size: 9.5px; color: var(--odyssey-hud-dim); margin-top: -3px; }\r
.ohud-qbe-lib-empty, .ohud-qbe-empty { font-size: 10px; color: var(--odyssey-hud-muted); padding: 8px 4px; }\r
\r
/* Available-actions library (left column). */\r
.ohud-qbe-library {\r
  flex: 1 1 auto; min-height: 0; overflow-y: auto;\r
  display: flex; flex-direction: column; gap: 6px; padding-right: 3px;\r
}\r
.ohud-qbe-card {\r
  display: flex; align-items: center; gap: 8px; padding: 7px 8px;\r
  border: 1px solid var(--odyssey-hud-border); border-left-width: 3px; border-radius: 8px; cursor: grab;\r
  background: var(--odyssey-hud-panel-raised); transition: border-color .12s ease, background .12s ease;\r
}\r
.ohud-qbe-card:hover { border-color: var(--odyssey-hud-border-strong); background: var(--odyssey-hud-panel-hover); }\r
.ohud-qbe-card.is-disabled { opacity: 0.55; cursor: default; }\r
.ohud-qbe-card-icon {\r
  flex: 0 0 auto; width: 26px; height: 26px; display: grid; place-items: center;\r
  border-radius: 6px; background: rgba(255, 255, 255, 0.05);\r
}\r
.ohud-qbe-card-icon svg { width: 16px; height: 16px; }\r
.ohud-qbe-card-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }\r
.ohud-qbe-card-name {\r
  font-size: 11.5px; font-weight: 700; color: var(--odyssey-hud-text);\r
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;\r
}\r
.ohud-qbe-card-type { font-size: 8.5px; font-weight: 700; letter-spacing: 0.4px; color: var(--odyssey-hud-muted); }\r
.ohud-qbe-card-badges { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }\r
.ohud-qbe-badge {\r
  font-size: 8px; font-weight: 800; letter-spacing: 0.2px; white-space: nowrap;\r
  padding: 1px 5px; border-radius: 999px; background: rgba(255, 255, 255, 0.06);\r
  border: 1px solid var(--odyssey-hud-border); color: var(--odyssey-hud-muted);\r
}\r
.ohud-qbe-badge--cooldown { color: var(--odyssey-hud-warning); border-color: rgba(255, 194, 75, 0.4); }\r
.ohud-qbe-badge--resource { color: var(--odyssey-purple); border-color: rgba(167, 139, 250, 0.4); }\r
.ohud-qbe-card-off { flex: 0 0 auto; font-size: 9px; font-weight: 800; color: var(--odyssey-hud-warning); }\r
\r
/* Card accent stripe by semantic kind (attack/psionic/implant/intervention/neutral). */\r
.ohud-qbe-card.ohud-accent--attack { border-left-color: var(--odyssey-hud-attack); }\r
.ohud-qbe-card.ohud-accent--psionic { border-left-color: var(--odyssey-purple); }\r
.ohud-qbe-card.ohud-accent--implant { border-left-color: var(--odyssey-cyan); }\r
.ohud-qbe-card.ohud-accent--intervention { border-left-color: var(--odyssey-hud-intervention); }\r
.ohud-qbe-card.ohud-accent--neutral { border-left-color: var(--odyssey-hud-border-strong); }\r
\r
/* Quickbar slots grid (right column). Row 0 (slots 1-10) is emitted first in\r
 * the DOM, so it naturally lands on top; row 1 (11-20) follows, on the bottom. */\r
.ohud-qbe-slots { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: 8px; }\r
.ohud-qbe-slot-row { display: flex; gap: 5px; }\r
.ohud-qbe-slot {\r
  position: relative; flex: 1 1 0; max-width: 54px; aspect-ratio: 1 / 1;\r
  display: grid; place-items: center;\r
  border: 1px dashed var(--odyssey-hud-border); border-radius: 8px;\r
  background: rgba(255, 255, 255, 0.02); transition: border-color .12s ease, background .12s ease;\r
}\r
.ohud-qbe-slot.is-empty::after { content: "+"; font-size: 17px; color: var(--odyssey-hud-dim); opacity: 0.5; }\r
.ohud-qbe-slot.is-empty:hover { border-color: var(--odyssey-hud-border-strong); background: rgba(255, 255, 255, 0.045); }\r
.ohud-qbe-slot.is-filled {\r
  cursor: grab; border-style: solid; background: var(--odyssey-hud-panel-raised);\r
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.35);\r
}\r
.ohud-qbe-slot.is-filled:hover { box-shadow: 0 0 0 1px var(--odyssey-hud-border-strong), 0 0 14px rgba(93, 169, 255, 0.25); }\r
.ohud-qbe-slot.is-missing { border-style: solid; border-color: var(--odyssey-hud-negative); color: var(--odyssey-hud-negative); }\r
.ohud-qbe-slot-idx { position: absolute; top: 2px; left: 3px; font-size: 7px; font-weight: 800; color: var(--odyssey-hud-dim); }\r
.ohud-qbe-slot-type { position: absolute; top: 2px; right: 3px; font-size: 6px; font-weight: 800; opacity: 0.75; }\r
.ohud-qbe-slot-icon { width: 18px; height: 18px; }\r
.ohud-qbe-slot-name {\r
  position: absolute; bottom: 1px; left: 1px; right: 1px; font-size: 5.5px; text-align: center;\r
  background: rgba(0, 0, 0, 0.45); border-radius: 0 0 6px 6px; padding: 0 1px;\r
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;\r
}\r
.ohud-qbe-missing { font-size: 15px; font-weight: 800; }\r
.ohud-qbe-remove {\r
  position: absolute; top: -5px; right: -5px; width: 14px; height: 14px; padding: 0;\r
  display: grid; place-items: center; font-size: 10px; line-height: 1; border-radius: 50%;\r
  border: none; background: var(--odyssey-hud-negative); color: #fff; cursor: pointer;\r
  opacity: 0; transition: opacity .12s ease;\r
}\r
.ohud-qbe-slot.is-filled:hover .ohud-qbe-remove,\r
.ohud-qbe-slot.is-missing .ohud-qbe-remove { opacity: 1; }\r
\r
/* Accent border/glow on filled slots, by semantic kind. */\r
.ohud-qbe-slot.is-filled.ohud-accent--attack { border-color: var(--odyssey-hud-attack); box-shadow: 0 0 10px rgba(255, 92, 108, 0.28); }\r
.ohud-qbe-slot.is-filled.ohud-accent--psionic { border-color: var(--odyssey-purple); box-shadow: 0 0 10px rgba(167, 139, 250, 0.28); }\r
.ohud-qbe-slot.is-filled.ohud-accent--implant { border-color: var(--odyssey-cyan); box-shadow: 0 0 10px rgba(52, 225, 214, 0.28); }\r
.ohud-qbe-slot.is-filled.ohud-accent--intervention { border-color: var(--odyssey-hud-intervention); box-shadow: 0 0 10px rgba(255, 194, 75, 0.28); }\r
.ohud-qbe-slot.is-filled.ohud-accent--neutral { border-color: var(--odyssey-hud-border-strong); }\r
\r
/* ---- Conflict banner ---- */\r
.ohud-qbe-conflict {\r
  flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 8px;\r
  font-size: 10px; color: var(--odyssey-hud-warning);\r
  background: rgba(255, 194, 75, 0.12); border: 1px solid rgba(255, 194, 75, 0.4);\r
  border-radius: 8px; padding: 6px 10px;\r
}\r
.ohud-qbe-reload {\r
  flex: 0 0 auto; font-size: 9px; font-weight: 800; color: var(--odyssey-hud-warning);\r
  border: 1px solid rgba(255, 194, 75, 0.5); background: transparent; border-radius: 5px;\r
  padding: 2px 7px; cursor: pointer;\r
}\r
\r
/* ---- Footer ---- */\r
.ohud-qbe-footer {\r
  flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 10px;\r
  padding: 10px 14px; border-top: 1px solid var(--odyssey-hud-border); background: rgba(8, 11, 20, 0.4);\r
}\r
.ohud-qbe-status { font-size: 10px; font-weight: 600; color: var(--odyssey-hud-dim); }\r
.ohud-qbe-status--warning { color: var(--odyssey-hud-warning); }\r
.ohud-qbe-status--busy { color: var(--odyssey-hud-muted); }\r
.ohud-qbe-actions { flex: 0 0 auto; display: flex; gap: 8px; }\r
.ohud-qbe-btn {\r
  padding: 6px 14px; font-size: 11px; font-weight: 700; border-radius: 7px; cursor: pointer;\r
  color: var(--odyssey-hud-text); background: transparent; border: 1px solid var(--odyssey-hud-border);\r
}\r
.ohud-qbe-btn:hover:not([disabled]) { border-color: var(--odyssey-hud-border-strong); }\r
.ohud-qbe-btn.is-primary {\r
  color: #052421; font-weight: 800; border-color: transparent;\r
  background: linear-gradient(180deg, var(--odyssey-cyan), #1fb8ac);\r
  box-shadow: 0 0 14px rgba(52, 225, 214, 0.4);\r
}\r
.ohud-qbe-btn[disabled] { opacity: 0.45; cursor: default; box-shadow: none; }\r
`;

// hud/components/combatHudModule.css
var combatHudModule_default = '/*\r\n * Combat HUD \u2014 Phase 2.2 module + editor styles.\r\n *\r\n * Module mode: each block fills its own (tight) popover iframe so the map stays\r\n * clickable in the gaps between modules. Editor mode: a fullscreen arrange\r\n * surface with draggable preview cards, snap grid + alignment guides.\r\n * Scoped under .ohud-module / .ohud-editor-root. No native scrollbar (except\r\n * inside the Log list).\r\n */\r\n\r\n/* ===================== Single module (normal mode) ===================== */\r\n.ohud-module {\r\n  position: relative;\r\n  width: 100%;\r\n  height: 100%;\r\n  padding: 0;\r\n  overflow: hidden;\r\n  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\r\n  color: var(--odyssey-hud-text);\r\n}\r\n/* The single block fills the whole module iframe. */\r\n.ohud-module > .ohud-panel,\r\n.ohud-module > .ohud-state-wrap {\r\n  width: 100%;\r\n  height: 100%;\r\n  flex: none;\r\n  margin: 0;\r\n}\r\n.ohud-module .ohud-panel--bare {\r\n  background: transparent;\r\n  border: none;\r\n  box-shadow: none;\r\n  padding: 0;\r\n}\r\n.ohud-module .ohud-panel--bare .ohud-action { height: 100%; }\r\n.ohud-module .ohud-panel--bare .ohud-action-btn { height: 100%; }\r\n.ohud-module .ohud-panel--muted { display: grid; place-items: center; opacity: 0.5; }\r\n\r\n/* Global controls live only in the Player module (top-right). */\r\n.ohud-module-controls {\r\n  position: absolute; top: 4px; right: 4px; z-index: 5;\r\n  display: flex; gap: 4px;\r\n}\r\n\r\n/* Compact per-module error fallback (production-safe). */\r\n.ohud-moderr {\r\n  width: 100%; height: 100%;\r\n  display: flex; flex-direction: column; gap: 4px; justify-content: center; align-items: center;\r\n  text-align: center; padding: 8px;\r\n  border-color: var(--odyssey-hud-negative);\r\n}\r\n.ohud-moderr-title { font-size: 11px; font-weight: 800; color: var(--odyssey-hud-negative); }\r\n.ohud-moderr-detail {\r\n  font-size: 9px; line-height: 1.3; color: var(--odyssey-hud-muted);\r\n  max-height: 60%; overflow: auto; white-space: pre-wrap; word-break: break-word;\r\n}\r\n\r\n/* Dev-only diagnostic badge (?debug=1). Tiny, corner, never in production. */\r\n.ohud-module-debug {\r\n  position: absolute; left: 2px; bottom: 2px; z-index: 6; pointer-events: none;\r\n  font-size: 8px; font-weight: 700; letter-spacing: 0.3px;\r\n  color: var(--odyssey-cyan); background: rgba(8, 12, 22, 0.7);\r\n  border: 1px solid var(--odyssey-hud-border); border-radius: 4px; padding: 0 4px;\r\n}\r\n\r\n/* Log scroll allowed only inside its own list. */\r\n.ohud-module[data-module="log"] .ohud-log-panel { width: 100%; height: 100%; max-height: none; }\r\n\r\n/* --- Per-module visual scale-ups (modules are larger than the 2.1 rail) --- */\r\n/* Player (250\xD7250): prominent silhouette + readable stats. */\r\n.ohud-module[data-module="player"] .ohud-player-grid { grid-template-columns: 96px 1fr; gap: 12px; }\r\n.ohud-module[data-module="player"] .ohud-figure { width: 96px; }\r\n.ohud-module[data-module="player"] .ohud-player-name { font-size: 16px; }\r\n.ohud-module[data-module="player"] .ohud-res-num { font-size: 12px; }\r\n.ohud-module[data-module="player"] .ohud-res-label { font-size: 9px; }\r\n.ohud-module[data-module="player"] .ohud-res-track { height: 8px; }\r\n.ohud-module[data-module="player"] .ohud-pip { font-size: 9px; padding: 2px 8px; }\r\n.ohud-module[data-module="player"] .ohud-chip-status { font-size: 9.5px; }\r\n\r\n/* Skills (600\xD7165): centred content, larger tiles, wrap past one row. */\r\n.ohud-module[data-module="skills"] .ohud-panel-body { justify-content: center; align-items: center; }\r\n.ohud-module[data-module="skills"] .ohud-skill-groups { align-items: center; justify-content: center; height: auto; gap: 18px; flex-wrap: wrap; }\r\n.ohud-module[data-module="skills"] .ohud-slot { width: 56px; height: 56px; }\r\n.ohud-module .ohud-gun { position: relative; }\r\n\r\n/* ---------- Combat Control composite (330\xD7165) ---------- */\r\n/* Outer panel carries the frame; the grid fills it edge-to-edge. */\r\n.ohud-panel--cc { padding: 0; gap: 0; overflow: hidden; }\r\n.ohud-cc { display: grid; grid-template-columns: 1fr 1fr; width: 100%; height: 100%; min-height: 0; }\r\n.ohud-cc-target { min-width: 0; min-height: 0; border-right: 1px solid var(--odyssey-hud-border); }\r\n.ohud-cc-right { display: grid; grid-template-rows: 1fr 40px; min-width: 0; min-height: 0; }\r\n/* Inner section panels are seamless \u2014 the outer .ohud-panel--cc owns the frame. */\r\n.ohud-cc .ohud-panel { background: transparent; border: none; box-shadow: none; border-radius: 0; width: 100%; height: 100%; padding: 6px 7px; }\r\n/* Action strip: thin divider + tight padding (rule after the line above to win). */\r\n.ohud-cc .ohud-cc-action { border-top: 1px solid var(--odyssey-hud-border); padding: 3px 6px; }\r\n\r\n/* Target section \u2014 prominent silhouette (~56% height) + name / zone / distance. */\r\n.ohud-cc-target .ohud-target { justify-content: center; gap: 4px; }\r\n.ohud-cc-target .ohud-figure { width: 64px; height: 92px; }\r\n.ohud-cc-target .ohud-target-name { font-size: 11px; }\r\n.ohud-target-sub { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 2px; }\r\n.ohud-target-dist { font-size: 8.5px; font-weight: 700; color: var(--odyssey-hud-muted); }\r\n.ohud-target-dist--none { opacity: 0.7; }\r\n.ohud-target-pick {\r\n  margin-top: 2px; height: 20px; padding: 0 8px;\r\n  border: 1px solid var(--odyssey-purple); border-radius: 6px;\r\n  background: rgba(112, 80, 255, 0.22); color: var(--odyssey-hud-text);\r\n  font: inherit; font-size: 9px; font-weight: 800; cursor: pointer;\r\n  pointer-events: auto;\r\n}\r\n.ohud-target-pick:hover { border-color: var(--odyssey-cyan); }\r\n\r\n/* Zone chip grid \u2014 6 clickable body-zone buttons (3 \xD7 2). */\r\n.ohud-zone-chips {\r\n  display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px;\r\n  margin-top: 3px;\r\n}\r\n.ohud-zone-chip {\r\n  height: 16px; padding: 0 2px;\r\n  border: 1px solid var(--odyssey-hud-border); border-radius: 4px;\r\n  background: transparent; color: var(--odyssey-hud-muted);\r\n  font: inherit; font-size: 7.5px; font-weight: 700; text-transform: uppercase;\r\n  cursor: pointer; pointer-events: auto; overflow: hidden;\r\n  white-space: nowrap; text-overflow: ellipsis;\r\n  transition: border-color 80ms, color 80ms;\r\n}\r\n.ohud-zone-chip:hover { border-color: var(--odyssey-cyan); color: var(--odyssey-hud-text); }\r\n.ohud-zone-chip.is-selected {\r\n  border-color: var(--odyssey-purple); background: rgba(112, 80, 255, 0.22);\r\n  color: var(--odyssey-hud-text);\r\n}\r\n\r\n/* Clear-target button \u2014 small muted link style. */\r\n.ohud-target-clear {\r\n  margin-top: 4px; height: 16px; padding: 0 6px;\r\n  border: 1px solid var(--odyssey-hud-border); border-radius: 4px;\r\n  background: transparent; color: var(--odyssey-hud-muted);\r\n  font: inherit; font-size: 8px; font-weight: 700; cursor: pointer;\r\n  pointer-events: auto;\r\n}\r\n.ohud-target-clear:hover { border-color: var(--odyssey-red, #e74c3c); color: var(--odyssey-hud-text); }\r\n\r\n.ohud-gun-caret,\r\n.ohud-ammo-reload,\r\n.ohud-weapon-option,\r\n.ohud-reserve-mag,\r\n.ohud-slot {\r\n  font: inherit;\r\n  cursor: pointer;\r\n}\r\n.ohud-gun-caret,\r\n.ohud-ammo-reload {\r\n  border: 0; background: transparent; color: inherit; padding: 0;\r\n}\r\n.ohud-gun-caret { transition: transform 120ms ease; }\r\n.ohud-ammo-reload:disabled { cursor: not-allowed; opacity: 0.45; }\r\n.ohud-weapon-list {\r\n  display: grid; gap: 3px; align-content: start;\r\n  overflow-y: auto; overflow-x: hidden;\r\n}\r\n.ohud-weapon-option {\r\n  display: grid; grid-template-columns: 1fr auto auto; gap: 4px; align-items: center;\r\n  min-width: 0; height: 18px; padding: 1px 5px;\r\n  border: 1px solid var(--odyssey-hud-border); border-radius: 5px;\r\n  background: rgba(10, 16, 31, 0.74); color: var(--odyssey-hud-text);\r\n  font-size: 8px; text-align: left;\r\n}\r\n.ohud-weapon-option.is-selected { border-color: var(--odyssey-cyan); color: var(--odyssey-cyan); }\r\n.ohud-weapon-option-name,\r\n.ohud-weapon-option-type {\r\n  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;\r\n}\r\n.ohud-weapon-option-type,\r\n.ohud-weapon-option-ammo { color: var(--odyssey-hud-muted); font-size: 7.5px; }\r\n/* Spare-magazine companion popover: a flowing, full-width row list SIZED TO\r\n * CONTENT by the controller (see hudPopoverLifecycle.computeCompanionSelectorHeight)\r\n * \u2014 this list must NEVER be absolutely positioned to a corner (that was the bug:\r\n * rows collapsed into an illegible 76px pill stack inside a large empty popover). */\r\n/* The fire-mode companion popover (Fire Mode v1) shares this exact row\r\n * language \u2014 same content-sized-popover contract, same full-width row shape. */\r\n.ohud-reserve-list,\r\n.ohud-firemode-list {\r\n  display: flex; flex-direction: column; gap: 4px;\r\n  max-height: 220px;\r\n  overflow-y: auto; overflow-x: hidden;\r\n}\r\n.ohud-reserve-list.is-loading,\r\n.ohud-reserve-list.is-empty,\r\n.ohud-firemode-list.is-loading,\r\n.ohud-firemode-list.is-empty {\r\n  display: flex; align-items: center; justify-content: center;\r\n  min-height: 18px; color: var(--odyssey-hud-muted); font-size: 9px; text-align: center;\r\n}\r\n.ohud-reserve-mag,\r\n.ohud-firemode-option {\r\n  display: flex; align-items: center; justify-content: space-between; gap: 8px;\r\n  width: 100%; height: 22px; flex: 0 0 auto; padding: 0 8px;\r\n  border: 1px solid var(--odyssey-hud-border); border-radius: 5px;\r\n  background: rgba(10, 16, 31, 0.74); color: var(--odyssey-hud-text);\r\n  font-size: 9px; white-space: nowrap;\r\n}\r\n.ohud-reserve-mag-label,\r\n.ohud-firemode-option-name {\r\n  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;\r\n}\r\n.ohud-reserve-mag-rounds,\r\n.ohud-firemode-option-code {\r\n  flex: 0 0 auto; font-variant-numeric: tabular-nums; font-family: "SFMono-Regular", Consolas, monospace;\r\n  color: var(--odyssey-hud-muted);\r\n}\r\n.ohud-reserve-mag.is-selected,\r\n.ohud-firemode-option.is-selected {\r\n  border-color: var(--odyssey-cyan);\r\n  background: rgba(80, 220, 255, 0.1);\r\n}\r\n.ohud-reserve-mag.is-selected .ohud-reserve-mag-rounds,\r\n.ohud-firemode-option.is-selected .ohud-firemode-option-code { color: var(--odyssey-cyan); }\r\n.ohud-reserve-mag:hover,\r\n.ohud-reserve-mag:focus-visible,\r\n.ohud-firemode-option:hover,\r\n.ohud-firemode-option:focus-visible,\r\n.ohud-weapon-option:hover { border-color: var(--odyssey-purple); }\r\n.ohud-reserve-mag:focus-visible,\r\n.ohud-firemode-option:focus-visible { outline: none; }\r\n\r\n.ohud-mag-selector-btn {\r\n  position: absolute; right: 6px; top: 6px;\r\n  width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center;\r\n  border: 1px solid var(--odyssey-hud-border); border-radius: 6px;\r\n  background: rgba(255,255,255,0.03); color: var(--odyssey-hud-text);\r\n  cursor: pointer;\r\n}\r\n.ohud-mag-selector-btn:hover { border-color: var(--odyssey-cyan); }\r\n\r\n/* Debug Log companion popover (Phase 3D.1, ?debug=1 only). */\r\n.ohud-debuglog-clear {\r\n  font-size: 8px; font-weight: 700; padding: 1px 6px;\r\n  border: 1px solid var(--odyssey-hud-border); border-radius: 6px;\r\n  background: transparent; color: var(--odyssey-hud-muted); cursor: pointer;\r\n}\r\n.ohud-debuglog-clear:hover { border-color: var(--odyssey-red, #e74c3c); color: var(--odyssey-hud-text); }\r\n.ohud-debuglog-list {\r\n  list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px;\r\n  overflow-y: auto; overflow-x: hidden; flex: 1; min-height: 0;\r\n}\r\n.ohud-debuglog-row {\r\n  display: flex; gap: 5px; align-items: baseline; font-size: 8.5px; line-height: 1.3;\r\n  padding: 1px 3px; border-radius: 4px; background: rgba(10, 16, 31, 0.5);\r\n}\r\n.ohud-debuglog-row.is-fail { background: rgba(231, 76, 60, 0.12); }\r\n.ohud-debuglog-time { color: var(--odyssey-hud-dim); flex: 0 0 auto; font-variant-numeric: tabular-nums; }\r\n.ohud-debuglog-cat { color: var(--odyssey-cyan); font-weight: 700; flex: 0 0 auto; }\r\n.ohud-debuglog-action { color: var(--odyssey-hud-text); flex: 0 0 auto; }\r\n.ohud-debuglog-details {\r\n  color: var(--odyssey-hud-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;\r\n}\r\n.ohud-debuglog-empty { font-size: 10px; color: var(--odyssey-hud-dim); display: grid; place-items: center; flex: 1; padding: 8px; }\r\n\r\n/* Modifier section \u2014 dense 2-column chip grid, \u22646 then +N, no horizontal overflow. */\r\n.ohud-cc-mod .ohud-panel-head { min-height: 10px; }\r\n.ohud-cc-mod .ohud-mods { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; align-content: start; overflow: hidden; }\r\n.ohud-cc-mod .ohud-mod { height: auto; min-height: 16px; font-size: 9px; padding: 1px 5px; }\r\n.ohud-cc-mod .ohud-mod--more { justify-content: center; }\r\n\r\n/* Action section \u2014 compact button fills the 165\xD740 strip. */\r\n.ohud-cc-action .ohud-action { height: 100%; gap: 5px; }\r\n.ohud-cc-action .ohud-action-btn { height: 100%; }\r\n\r\n/* ===================== Phase 3A - scene-selection binding ===================== */\r\n/* Ready identity card (Player module) - shows REAL bound character only. */\r\n.ohud-bind {\r\n  width: 100%; height: 100%;\r\n  display: flex; flex-direction: column; gap: 5px;\r\n  padding: 10px 12px; justify-content: center;\r\n}\r\n.ohud-bind-badge {\r\n  align-self: flex-start;\r\n  font-size: 9px; font-weight: 800; letter-spacing: 0.5px;\r\n  padding: 2px 7px; border-radius: 6px;\r\n  border: 1px solid var(--odyssey-hud-border-strong); color: var(--odyssey-hud-muted);\r\n}\r\n.ohud-bind-badge--gm { color: #fff; background: var(--odyssey-purple-strong); border-color: var(--odyssey-purple-strong); }\r\n.ohud-bind-badge--owned { color: var(--odyssey-cyan); border-color: var(--odyssey-cyan); }\r\n.ohud-bind-name {\r\n  font-size: 16px; font-weight: 800; color: var(--odyssey-hud-text);\r\n  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;\r\n}\r\n.ohud-bind-status { font-size: 10px; color: var(--odyssey-hud-muted); }\r\n.ohud-bind-owner { font-size: 9px; color: var(--odyssey-hud-muted); opacity: 0.8; }\r\n\r\n/* Neutral, clearly-labeled fallback for ready-only modules until their runtime\r\n * mapping lands (never fabricated gameplay data). */\r\n.ohud-bind-fallback {\r\n  width: 100%; height: 100%;\r\n  display: flex; flex-direction: column; gap: 3px;\r\n  align-items: center; justify-content: center; text-align: center; padding: 8px;\r\n}\r\n.ohud-bind-fallback-label { font-size: 10px; font-weight: 700; color: var(--odyssey-hud-muted); }\r\n.ohud-bind-fallback-hint { font-size: 8.5px; color: var(--odyssey-hud-muted); opacity: 0.7; }\r\n\r\n/* Dev-only (?debug=1) error detail under a Player prompt. */\r\n.ohud-bind-dev { font-size: 8px; color: var(--odyssey-hud-muted); opacity: 0.6; margin-top: 4px; word-break: break-word; }\r\n\r\n/* ===================== Arrange-HUD editor ===================== */\r\n.ohud-editor-root {\r\n  position: fixed; inset: 0; z-index: 100;\r\n  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\r\n}\r\n.ohud-editor {\r\n  position: absolute; inset: 0;\r\n  background: rgba(8, 12, 22, 0.86);\r\n  backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);\r\n}\r\n/* Toolbar floats OVER the canvas so the canvas spans the full viewport and the\r\n * preview cards sit exactly where the real module popovers will. */\r\n.ohud-editor-toolbar {\r\n  position: absolute; top: 0; left: 0; right: 0; z-index: 400;\r\n  display: flex; align-items: center; gap: 12px;\r\n  padding: 8px 14px; background: var(--odyssey-hud-panel);\r\n  border-bottom: 1px solid var(--odyssey-hud-border-strong);\r\n}\r\n.ohud-editor-title { font-size: 13px; font-weight: 800; letter-spacing: 0.5px; color: var(--odyssey-hud-text); }\r\n.ohud-editor-hint { font-size: 11px; color: var(--odyssey-hud-muted); }\r\n.ohud-editor-actions { margin-left: auto; display: flex; gap: 8px; }\r\n.ohud-editor-btn {\r\n  font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;\r\n  padding: 5px 12px; border-radius: 8px;\r\n  border: 1px solid var(--odyssey-hud-border-strong);\r\n  background: var(--odyssey-panel-base); color: var(--odyssey-hud-text);\r\n}\r\n.ohud-editor-btn:hover { border-color: var(--odyssey-purple); }\r\n.ohud-editor-btn.is-primary { background: var(--odyssey-purple-strong); border-color: var(--odyssey-purple-strong); color: #fff; }\r\n\r\n.ohud-editor-canvas {\r\n  position: absolute; inset: 0; overflow: hidden;\r\n  background-image:\r\n    repeating-linear-gradient(0deg, transparent, transparent 7px, rgba(120,142,184,0.06) 7px, rgba(120,142,184,0.06) 8px),\r\n    repeating-linear-gradient(90deg, transparent, transparent 7px, rgba(120,142,184,0.06) 7px, rgba(120,142,184,0.06) 8px);\r\n}\r\n.ohud-guide { position: absolute; background: var(--odyssey-cyan); opacity: 0.7; pointer-events: none; z-index: 200; }\r\n.ohud-guide--v { top: 0; bottom: 0; width: 1px; }\r\n.ohud-guide--h { left: 0; right: 0; height: 1px; }\r\n\r\n.ohud-card {\r\n  position: absolute; overflow: hidden;\r\n  border: 1px solid var(--odyssey-hud-border-strong);\r\n  border-radius: var(--odyssey-hud-radius);\r\n  box-shadow: var(--odyssey-hud-shadow);\r\n  display: flex; flex-direction: column;\r\n}\r\n.ohud-card.is-dragging { z-index: 300 !important; box-shadow: 0 0 0 2px var(--odyssey-cyan), var(--odyssey-hud-shadow); }\r\n.ohud-card-bar {\r\n  flex: 0 0 18px; display: flex; align-items: center; gap: 5px;\r\n  padding: 0 6px; cursor: grab; touch-action: none;\r\n  background: var(--odyssey-panel-base); border-bottom: 1px solid var(--odyssey-hud-border);\r\n}\r\n.ohud-card.is-dragging .ohud-card-bar { cursor: grabbing; }\r\n.ohud-card-grip { display: inline-flex; color: var(--odyssey-hud-muted); }\r\n.ohud-card-name { font-size: 10px; font-weight: 700; color: var(--odyssey-hud-text); }\r\n.ohud-card-body { position: relative; flex: 1 1 auto; min-height: 0; pointer-events: none; }\r\n.ohud-card-body > .ohud-panel { width: 100%; height: 100%; flex: none; }\r\n.ohud-card-body .ohud-panel--bare { background: transparent; border: none; box-shadow: none; }\r\n.ohud-card-body .ohud-panel--bare .ohud-action,\r\n.ohud-card-body .ohud-panel--bare .ohud-action-btn { height: 100%; }\r\n';

// hud/adapters/combatHudAdapter.js
var REQUIRED_METHODS = Object.freeze([
  "getViewer",
  "getSelectedTokenId",
  "getSceneTokens",
  "getCharacterForToken",
  "getCharacterRuntime",
  "getWeaponState",
  "getAvailableSkills",
  "getModifiers",
  "getCombatSession",
  "getBattleLog",
  "selectToken",
  "setViewerRole",
  "setMockScenario",
  "subscribe",
  "dispose"
]);
function createCombatHudAdapter(impl, source) {
  if (!impl || typeof impl !== "object") {
    throw new Error("createCombatHudAdapter: implementation object is required.");
  }
  if (source !== "mock" && source !== "supabase") {
    throw new Error(`createCombatHudAdapter: invalid source "${source}".`);
  }
  const missing = REQUIRED_METHODS.filter((name) => typeof impl[name] !== "function");
  if (missing.length > 0) {
    throw new Error(
      `createCombatHudAdapter: missing required method(s): ${missing.join(", ")}.`
    );
  }
  const adapter = { source };
  for (const name of REQUIRED_METHODS) {
    adapter[name] = impl[name].bind(impl);
  }
  return Object.freeze(adapter);
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
  disabled: "disabled",
  // Phase 3D.1: combat data for this zone is missing or the fetch was denied
  // (e.g. a target refresh blocked by RLS) — must NEVER silently render as
  // "healthy". See hud/targeting/bodyConditionPolicy.js.
  unknown: "unknown"
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
var DEFAULT_BODY_PART_ID = "torso";
function cloneDeep(value) {
  if (value === null || typeof value !== "object") return value;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (_error) {
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return value;
  }
}
function createEmptySnapshot() {
  return {
    entity: null,
    weapon: { primary: null, secondary: null },
    skills: { library: [], quickSlots: [] },
    combatSession: createInactiveCombatSession(),
    modifiers: { passive: [], active: [], narrative: [] },
    battleLog: { entries: [] }
  };
}
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
function createDefaultUiState() {
  return {
    isHudCollapsed: false,
    selectedTechniqueId: null,
    selectedAbilityId: null,
    selectedReloadMagazineId: null,
    selectedModifierIds: [],
    targeting: createDefaultTargeting(),
    isBattleLogExpanded: false
  };
}
function createDefaultTargeting() {
  return {
    mode: TARGETING_MODES.none,
    selectedTargetIds: [],
    selectedBodyPartId: DEFAULT_BODY_PART_ID,
    selectedPoint: null,
    radius: null
  };
}

// hud/models/combatHudMockScenarios.js
var SELF_PLAYER = Object.freeze({ playerId: "obr-player-self", playerName: "Vega (You)" });
var OTHER_PLAYER = Object.freeze({ playerId: "obr-player-other", playerName: "Rook" });
function zone(id, label, state, canBeTargeted = true) {
  return { id, label, state, canBeTargeted };
}
function humanoidZones(states = {}) {
  return [
    zone("head", "Head", states.head ?? ZONE_STATES.healthy),
    zone("torso", "Torso", states.torso ?? ZONE_STATES.healthy),
    zone("l_arm", "Left Arm", states.l_arm ?? ZONE_STATES.healthy),
    zone("r_arm", "Right Arm", states.r_arm ?? ZONE_STATES.healthy),
    zone("l_leg", "Left Leg", states.l_leg ?? ZONE_STATES.healthy),
    zone("r_leg", "Right Leg", states.r_leg ?? ZONE_STATES.healthy)
  ];
}
function armor(zoneId, type, protection, durability, maxDurability) {
  return { zoneId, type, protection, durability, maxDurability };
}
function status(id, name, polarity, durationTurns, description) {
  return { id, name, polarity, durationTurns, description };
}
function magazine(id, ammoType, description, current2, max, caliber) {
  return { id, ammoType, description, current: current2, max, caliber };
}
function skill(overrides) {
  return {
    id: overrides.id,
    name: overrides.name ?? "Ability",
    type: overrides.type ?? SKILL_TYPES.instantAbility,
    source: overrides.source ?? SKILL_SOURCES.perk,
    icon: overrides.icon ?? "ability",
    color: overrides.color ?? COLOR_SEMANTICS.neutral,
    actionCost: overrides.actionCost ?? ACTION_COSTS.main,
    resourceCost: overrides.resourceCost ?? null,
    cooldownTurns: overrides.cooldownTurns ?? 0,
    weaponRequirements: overrides.weaponRequirements ?? [],
    targeting: overrides.targeting ?? TARGETING_MODES.none,
    allowsMultipleTargets: overrides.allowsMultipleTargets ?? false,
    usesPoint: overrides.usesPoint ?? false,
    radius: overrides.radius ?? null,
    isToggled: overrides.isToggled ?? false,
    disabledReason: overrides.disabledReason ?? null,
    tooltip: overrides.tooltip ?? ""
  };
}
function quickSlots(ids) {
  return ids.map((skillId, index) => ({ index, skillId: skillId ?? null }));
}
function modifier(overrides) {
  return {
    id: overrides.id,
    name: overrides.name ?? "Modifier",
    value: overrides.value ?? 0,
    source: overrides.source ?? "system",
    polarity: overrides.polarity ?? MODIFIER_POLARITY.neutral,
    selected: overrides.selected ?? false,
    alwaysActive: overrides.alwaysActive ?? false,
    requiresGMApproval: overrides.requiresGMApproval ?? false,
    consumesOnAction: overrides.consumesOnAction ?? false,
    kind: overrides.kind ?? MODIFIER_KINDS.active,
    description: overrides.description ?? ""
  };
}
function logEntry(sequence, kind, actor, action, target, delta, detail) {
  return {
    id: `log-${sequence}`,
    sequence,
    kind,
    actor,
    action,
    target,
    delta,
    summary: [actor, action, target, delta].filter(Boolean).join(" \xB7 "),
    detail: detail ?? ""
  };
}
function participant(overrides) {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    tokenId: overrides.tokenId ?? null,
    isPlayer: overrides.isPlayer ?? false,
    initiative: overrides.initiative ?? 0,
    initiativeRoll: overrides.initiativeRoll ?? 0,
    order: overrides.order ?? 0,
    isCurrent: overrides.isCurrent ?? false,
    canAct: overrides.canAct ?? true,
    condition: overrides.condition ?? "active"
  };
}
function makeVegaEntity() {
  return {
    summary: {
      id: "char-vega",
      name: "Vega",
      icon: "portrait-vega",
      characterType: TOKEN_KINDS.player,
      ownerPlayerId: SELF_PLAYER.playerId,
      svgRef: "humanoid"
    },
    zones: humanoidZones({
      l_arm: ZONE_STATES.wounded,
      r_leg: ZONE_STATES.serious
    }),
    shield: { current: 6, max: 15 },
    armorByZone: [
      armor("head", "Composite Helm", 3, 8, 10),
      armor("torso", "Ceramic Plate", 5, 14, 20),
      armor("l_arm", "Mesh", 2, 3, 6)
    ],
    psi: { current: 4, max: 10 },
    actions: { main: true, move: true },
    statuses: [
      status("st-focus", "Focused", MODIFIER_POLARITY.positive, 2, "+10 to next attack."),
      status("st-bleed", "Bleeding", MODIFIER_POLARITY.negative, 3, "Lose 1 minor wound per turn.")
    ],
    effects: [
      status("ef-adrenaline", "Adrenaline", MODIFIER_POLARITY.positive, 1, "MOVE actions are free this turn.")
    ],
    flags: { alive: true, conscious: true },
    mech: null,
    pilot: null
  };
}
function makeVegaWeapon() {
  return {
    id: "wpn-vega-rifle",
    name: "AR-7 Marksman Rifle",
    svgRef: "rifle",
    fireModes: ["Semi", "Burst"],
    currentFireMode: "Semi",
    usesMagazine: true,
    usesConsumable: false,
    requiresAmmo: true,
    loadedMagazine: magazine("mag-loaded", "AP", "Armor-piercing", 12, 30, "7.62"),
    reserveMagazines: [
      magazine("mag-full", "AP", "Armor-piercing", 30, 30, "7.62"),
      magazine("mag-partial", "HP", "Hollow-point", 8, 30, "7.62"),
      // The following two are intentionally invalid for the reserve list and
      // are filtered by selectVisibleReserveMagazines:
      magazine("mag-empty", "AP", "Armor-piercing", 0, 30, "7.62"),
      // empty
      magazine("mag-wrong", "SG", "Shotgun shells", 6, 6, "12ga")
      // wrong caliber
    ],
    ammo: { current: 12, max: 30 },
    reloadCandidateId: "mag-full",
    canReload: true,
    disabledReason: null
  };
}
function makeVegaSkills() {
  const library = [
    skill({
      id: "sk-precise",
      name: "Precision Shot",
      type: SKILL_TYPES.attackTechnique,
      source: SKILL_SOURCES.perk,
      icon: "scope",
      color: COLOR_SEMANTICS.attack,
      actionCost: ACTION_COSTS.main,
      weaponRequirements: ["rifle"],
      targeting: TARGETING_MODES.token,
      tooltip: "Aimed shot. +precision, zone penalty unchanged."
    }),
    skill({
      id: "sk-burst",
      name: "Suppressive Burst",
      type: SKILL_TYPES.attackTechnique,
      source: SKILL_SOURCES.perk,
      icon: "burst",
      color: COLOR_SEMANTICS.attack,
      actionCost: ACTION_COSTS.main,
      weaponRequirements: ["rifle"],
      targeting: TARGETING_MODES.multipleTokens,
      allowsMultipleTargets: true,
      tooltip: "Hit up to 3 targets in an arc."
    }),
    skill({
      id: "sk-mindspike",
      name: "Mind Spike",
      type: SKILL_TYPES.targetedAbility,
      source: SKILL_SOURCES.psionic,
      icon: "psi",
      color: COLOR_SEMANTICS.psionic,
      actionCost: ACTION_COSTS.main,
      resourceCost: { type: "psi", amount: 3 },
      cooldownTurns: 2,
      targeting: TARGETING_MODES.token,
      tooltip: "Psionic damage to one mind. Costs 3 Psi, 2-turn cooldown."
    }),
    skill({
      id: "sk-grenade",
      name: "Frag Grenade",
      type: SKILL_TYPES.itemAction,
      source: SKILL_SOURCES.item,
      icon: "grenade",
      color: COLOR_SEMANTICS.attack,
      actionCost: ACTION_COSTS.main,
      targeting: TARGETING_MODES.point,
      usesPoint: true,
      radius: 3,
      tooltip: "Throw to a point. 3m blast radius."
    }),
    skill({
      id: "sk-stim",
      name: "Combat Stim",
      type: SKILL_TYPES.instantAbility,
      source: SKILL_SOURCES.item,
      icon: "injector",
      color: COLOR_SEMANTICS.positive,
      actionCost: ACTION_COSTS.free,
      tooltip: "Instant self-heal. No confirmation."
    }),
    skill({
      id: "sk-cloak",
      name: "Optic Cloak",
      type: SKILL_TYPES.toggleAbility,
      source: SKILL_SOURCES.implant,
      icon: "cloak",
      color: COLOR_SEMANTICS.implant,
      actionCost: ACTION_COSTS.move,
      isToggled: false,
      tooltip: "Toggle camouflage. Active until disabled."
    }),
    skill({
      id: "sk-overload",
      name: "Implant Overload",
      type: SKILL_TYPES.instantAbility,
      source: SKILL_SOURCES.implant,
      icon: "bolt",
      color: COLOR_SEMANTICS.implant,
      actionCost: ACTION_COSTS.main,
      cooldownTurns: 4,
      disabledReason: "On cooldown (3 turns left).",
      tooltip: "Disabled: cooling down."
    })
  ];
  return { library, quickSlots: quickSlots([
    "sk-precise",
    "sk-burst",
    "sk-mindspike",
    "sk-grenade",
    "sk-stim",
    "sk-cloak",
    null,
    "sk-overload"
  ]) };
}
function makeVegaModifiers() {
  return [
    modifier({
      id: "mod-veteran",
      name: "Veteran Aim",
      value: 5,
      source: "perk",
      polarity: MODIFIER_POLARITY.positive,
      alwaysActive: true,
      kind: MODIFIER_KINDS.passive,
      description: "Passive +5 to ranged attacks."
    }),
    modifier({
      id: "mod-scope",
      name: "Scope",
      value: 10,
      source: "weapon",
      polarity: MODIFIER_POLARITY.positive,
      alwaysActive: true,
      kind: MODIFIER_KINDS.passive,
      description: "Passive +10 when aiming."
    }),
    modifier({
      id: "mod-cover",
      name: "Target in Cover",
      value: -10,
      source: "positioning",
      polarity: MODIFIER_POLARITY.negative,
      kind: MODIFIER_KINDS.active,
      description: "Apply when the target benefits from cover."
    }),
    modifier({
      id: "mod-prepared",
      name: "Prepared",
      value: 20,
      source: "positioning",
      polarity: MODIFIER_POLARITY.positive,
      kind: MODIFIER_KINDS.active,
      description: "Aim taken last turn."
    }),
    modifier({
      id: "mod-godbless",
      name: "God Bless",
      value: 0,
      source: "intervention",
      polarity: MODIFIER_POLARITY.positive,
      kind: MODIFIER_KINDS.active,
      consumesOnAction: true,
      description: "Intervention: re-roll. Resource consumed only on success."
    }),
    modifier({
      id: "mod-gm-highground",
      name: "High Ground (GM)",
      value: 15,
      source: "gm",
      polarity: MODIFIER_POLARITY.positive,
      kind: MODIFIER_KINDS.narrative,
      requiresGMApproval: true,
      description: "GM-granted narrative bonus."
    })
  ];
}
function makeRaiderEntity() {
  return {
    summary: {
      id: "char-raider",
      name: "Scrap Raider",
      icon: "portrait-raider",
      characterType: TOKEN_KINDS.npc,
      ownerPlayerId: null,
      svgRef: "humanoid"
    },
    zones: humanoidZones({ torso: ZONE_STATES.wounded, head: ZONE_STATES.healthy }),
    shield: { current: 0, max: 0 },
    armorByZone: [],
    // hidden from players; GM view still keeps it minimal in mocks
    psi: { current: 0, max: 0 },
    actions: { main: true, move: true },
    statuses: [status("st-enraged", "Enraged", MODIFIER_POLARITY.negative, null, "Attacks recklessly.")],
    effects: [],
    flags: { alive: true, conscious: true },
    mech: null,
    pilot: null
  };
}
function scenario(base) {
  return {
    id: base.id,
    label: base.label,
    description: base.description,
    defaultViewerRole: base.defaultViewerRole,
    viewer: base.viewer,
    selectedTokenId: base.selectedTokenId ?? null,
    tokens: base.tokens ?? [],
    links: base.links ?? {},
    characters: base.characters ?? {},
    weapons: base.weapons ?? {},
    skills: base.skills ?? {},
    modifiers: base.modifiers ?? {},
    combatSession: base.combatSession ?? null,
    battleLog: base.battleLog ?? { entries: [] }
  };
}
function scenarioA() {
  const tokens = [
    { tokenId: "tok-vega", name: "Vega", characterId: "char-vega", kind: TOKEN_KINDS.player, position: { x: 4, y: 2 } },
    { tokenId: "tok-raider", name: "Scrap Raider", characterId: "char-raider", kind: TOKEN_KINDS.npc, position: { x: 9, y: 3 } },
    // Unlinked scene prop — exists as a token but maps to no character.
    // Used to exercise the "token without character" empty state.
    { tokenId: "tok-crate", name: "Supply Crate", characterId: null, kind: TOKEN_KINDS.other, position: { x: 2, y: 8 } }
  ];
  return scenario({
    id: "A",
    label: "A \xB7 Player, own turn",
    description: "Owned player character, active combat, it is the viewer's turn.",
    defaultViewerRole: VIEWER_ROLES.player,
    viewer: { ...SELF_PLAYER, role: VIEWER_ROLES.player },
    selectedTokenId: "tok-vega",
    tokens,
    links: { "tok-vega": "char-vega", "tok-raider": "char-raider" },
    characters: { "char-vega": makeVegaEntity(), "char-raider": makeRaiderEntity() },
    weapons: { "char-vega": { primary: makeVegaWeapon(), secondary: null } },
    skills: { "char-vega": makeVegaSkills() },
    modifiers: { "char-vega": makeVegaModifiers() },
    combatSession: {
      id: "sess-1",
      status: COMBAT_STATUS.active,
      round: 2,
      currentParticipantId: "char-vega",
      participants: [
        participant({ id: "char-vega", name: "Vega", tokenId: "tok-vega", isPlayer: true, initiative: 22, initiativeRoll: 18, order: 0, isCurrent: true }),
        participant({ id: "char-raider", name: "Scrap Raider", tokenId: "tok-raider", initiative: 14, initiativeRoll: 11, order: 1 })
      ]
    },
    battleLog: { entries: [
      logEntry(1, LOG_ENTRY_KINDS.system, "", "Combat started", "", "", "Round 1 begins."),
      logEntry(2, LOG_ENTRY_KINDS.action, "Scrap Raider", "Attacks", "Vega", "Shield -4", "Rolled 65 vs torso."),
      logEntry(3, LOG_ENTRY_KINDS.action, "Vega", "Precision Shot", "Scrap Raider", "Wounds head", "Rolled 12, hit."),
      logEntry(4, LOG_ENTRY_KINDS.narrative, "GM", "Smoke drifts across the lane", "", "", "Light cover next round."),
      logEntry(5, LOG_ENTRY_KINDS.system, "", "Round 2 begins", "", "", "Actions restored.")
    ] }
  });
}
function scenarioB() {
  const a = scenarioA();
  const vega = a.characters["char-vega"];
  vega.actions = { main: false, move: false };
  return scenario({
    ...a,
    id: "B",
    label: "B \xB7 Player, waiting",
    description: "Owned player character, combat active, NOT the viewer's turn.",
    combatSession: {
      ...a.combatSession,
      currentParticipantId: "char-raider",
      participants: a.combatSession.participants.map((p) => ({
        ...p,
        isCurrent: p.id === "char-raider"
      }))
    }
  });
}
function scenarioC() {
  const tokens = [
    { tokenId: "tok-raider", name: "Scrap Raider", characterId: "char-raider", kind: TOKEN_KINDS.npc, position: { x: 9, y: 3 } }
  ];
  return scenario({
    id: "C",
    label: "C \xB7 NPC target (humanoid)",
    description: "Linked NPC humanoid. Player gets empty HUD; GM can inspect.",
    defaultViewerRole: VIEWER_ROLES.gm,
    viewer: { ...SELF_PLAYER, role: VIEWER_ROLES.gm },
    selectedTokenId: "tok-raider",
    tokens,
    links: { "tok-raider": "char-raider" },
    characters: { "char-raider": makeRaiderEntity() },
    weapons: {},
    skills: {},
    modifiers: {},
    combatSession: null,
    battleLog: { entries: [] }
  });
}
function scenarioD() {
  const turret = {
    summary: {
      id: "char-turret",
      name: "Sentry Turret MK-II",
      icon: "portrait-turret",
      characterType: TOKEN_KINDS.turret,
      ownerPlayerId: null,
      svgRef: "turret"
    },
    zones: [
      zone("barrel", "Barrel Assembly", ZONE_STATES.healthy),
      zone("housing", "Housing", ZONE_STATES.wounded),
      zone("sensor", "Sensor Array", ZONE_STATES.serious),
      zone("base", "Base Mount", ZONE_STATES.healthy, false)
    ],
    shield: { current: 10, max: 10 },
    armorByZone: [armor("housing", "Plated Steel", 6, 18, 25)],
    psi: { current: 0, max: 0 },
    actions: { main: true, move: false },
    statuses: [],
    effects: [status("ef-overheat", "Overheating", MODIFIER_POLARITY.negative, 1, "Skips next turn if not cooled.")],
    flags: { alive: true, conscious: true },
    mech: null,
    pilot: null
  };
  return scenario({
    id: "D",
    label: "D \xB7 Turret target (non-humanoid)",
    description: "Non-humanoid entity with a custom zone schema and its own SVG.",
    defaultViewerRole: VIEWER_ROLES.gm,
    viewer: { ...SELF_PLAYER, role: VIEWER_ROLES.gm },
    selectedTokenId: "tok-turret",
    tokens: [{ tokenId: "tok-turret", name: "Sentry Turret", characterId: "char-turret", kind: TOKEN_KINDS.turret, position: { x: 12, y: 7 } }],
    links: { "tok-turret": "char-turret" },
    characters: { "char-turret": turret }
  });
}
function scenarioE() {
  const pilotPsi = { current: 5, max: 8 };
  const mechEntity = {
    summary: {
      id: "char-vega",
      name: "Vega \u2014 'Ironclad' Mech",
      icon: "portrait-mech",
      characterType: TOKEN_KINDS.mech,
      ownerPlayerId: SELF_PLAYER.playerId,
      svgRef: "mech"
    },
    // Top-level zones mirror the mech while piloting.
    zones: [
      zone("m_head", "Cockpit", ZONE_STATES.healthy),
      zone("m_core", "Reactor Core", ZONE_STATES.wounded),
      zone("m_l_arm", "Left Manipulator", ZONE_STATES.healthy),
      zone("m_r_arm", "Right Weapon Mount", ZONE_STATES.serious),
      zone("m_legs", "Locomotion", ZONE_STATES.healthy)
    ],
    shield: { current: 25, max: 40 },
    armorByZone: [
      armor("m_core", "Reactor Shielding", 12, 30, 50),
      armor("m_r_arm", "Hardpoint Plating", 9, 12, 30)
    ],
    psi: pilotPsi,
    actions: { main: true, move: true },
    statuses: [status("st-locked", "Weapons Locked", MODIFIER_POLARITY.positive, null, "Targeting computer engaged.")],
    effects: [],
    flags: { alive: true, conscious: true },
    mech: {
      active: true,
      name: "'Ironclad' Assault Frame",
      zones: [
        zone("m_core", "Reactor Core", ZONE_STATES.wounded),
        zone("m_r_arm", "Right Weapon Mount", ZONE_STATES.serious)
      ],
      shield: { current: 25, max: 40 },
      armorByZone: [armor("m_core", "Reactor Shielding", 12, 30, 50)]
    },
    pilot: {
      characterId: "char-vega-pilot",
      name: "Vega",
      icon: "portrait-vega",
      psi: pilotPsi,
      statuses: [status("st-strain", "Neural Strain", MODIFIER_POLARITY.negative, 2, "Psi regen halved.")],
      flags: { alive: true, conscious: true }
    }
  };
  return scenario({
    id: "E",
    label: "E \xB7 Mech + pilot",
    description: "Mech is the primary displayed entity; pilot summary nested beneath.",
    defaultViewerRole: VIEWER_ROLES.player,
    viewer: { ...SELF_PLAYER, role: VIEWER_ROLES.player },
    selectedTokenId: "tok-mech",
    tokens: [{ tokenId: "tok-mech", name: "Ironclad", characterId: "char-vega", kind: TOKEN_KINDS.mech, position: { x: 5, y: 5 } }],
    links: { "tok-mech": "char-vega" },
    characters: { "char-vega": mechEntity },
    weapons: { "char-vega": { primary: makeVegaWeapon(), secondary: null } },
    skills: { "char-vega": makeVegaSkills() },
    modifiers: { "char-vega": makeVegaModifiers() },
    combatSession: {
      id: "sess-2",
      status: COMBAT_STATUS.active,
      round: 1,
      currentParticipantId: "char-vega",
      participants: [participant({ id: "char-vega", name: "Ironclad", tokenId: "tok-mech", isPlayer: true, initiative: 19, initiativeRoll: 15, order: 0, isCurrent: true })]
    },
    battleLog: { entries: [logEntry(1, LOG_ENTRY_KINDS.system, "", "Combat started", "", "", "Mech deployed.")] }
  });
}
function scenarioF() {
  return scenario({
    id: "F",
    label: "F \xB7 Unauthorised selection",
    description: "Player selects an NPC they do not control \u2192 empty HUD with reason.",
    defaultViewerRole: VIEWER_ROLES.player,
    viewer: { ...SELF_PLAYER, role: VIEWER_ROLES.player },
    selectedTokenId: "tok-raider",
    tokens: [{ tokenId: "tok-raider", name: "Scrap Raider", characterId: "char-raider", kind: TOKEN_KINDS.npc, position: { x: 9, y: 3 } }],
    links: { "tok-raider": "char-raider" },
    characters: { "char-raider": makeRaiderEntity() }
  });
}
function scenarioG() {
  const f = scenarioF();
  return scenario({
    ...f,
    id: "G",
    label: "G \xB7 GM inspection",
    description: "Same selection as F, but the viewer is GM \u2192 HUD becomes ready.",
    defaultViewerRole: VIEWER_ROLES.gm,
    viewer: { ...SELF_PLAYER, role: VIEWER_ROLES.gm }
  });
}
var MOCK_SCENARIOS = Object.freeze([
  { id: "A", label: "A \xB7 Player, own turn", create: scenarioA },
  { id: "B", label: "B \xB7 Player, waiting", create: scenarioB },
  { id: "C", label: "C \xB7 NPC target (humanoid)", create: scenarioC },
  { id: "D", label: "D \xB7 Turret target (non-humanoid)", create: scenarioD },
  { id: "E", label: "E \xB7 Mech + pilot", create: scenarioE },
  { id: "F", label: "F \xB7 Unauthorised selection", create: scenarioF },
  { id: "G", label: "G \xB7 GM inspection", create: scenarioG }
]);
var DEFAULT_SCENARIO_ID = "A";
function createScenario(scenarioId) {
  const entry = MOCK_SCENARIOS.find((s) => s.id === scenarioId);
  if (!entry) {
    throw new Error(`Unknown mock scenario: ${scenarioId}`);
  }
  return entry.create();
}

// hud/adapters/mockCombatHudAdapter.js
function createMockCombatHudAdapter(options = {}) {
  const listeners = /* @__PURE__ */ new Set();
  let scenario2 = createScenario(options.scenarioId ?? DEFAULT_SCENARIO_ID);
  let selectedTokenOverride = void 0;
  let roleOverride = void 0;
  let disposed = false;
  function notify() {
    if (disposed) return;
    for (const listener of Array.from(listeners)) {
      try {
        listener();
      } catch (error) {
        console.error("[combatHud/mock] listener threw", error);
      }
    }
  }
  function currentSelectedTokenId() {
    return selectedTokenOverride !== void 0 ? selectedTokenOverride : scenario2.selectedTokenId;
  }
  function currentRole() {
    return roleOverride !== void 0 ? roleOverride : scenario2.viewer.role;
  }
  const impl = {
    /* ----------------- data getters ----------------- */
    getViewer() {
      return { ...scenario2.viewer, role: currentRole() };
    },
    getSelectedTokenId() {
      return currentSelectedTokenId() ?? null;
    },
    getSceneTokens() {
      return scenario2.tokens;
    },
    getCharacterForToken(tokenId) {
      if (!tokenId) return null;
      const characterId = scenario2.links[tokenId] ?? null;
      const token = scenario2.tokens.find((t) => t.tokenId === tokenId) ?? null;
      if (!characterId || !token) return null;
      return { characterId, token };
    },
    getCharacterRuntime(characterId) {
      if (!characterId) return null;
      return scenario2.characters[characterId] ?? null;
    },
    getWeaponState(characterId) {
      if (!characterId) return null;
      return scenario2.weapons[characterId] ?? null;
    },
    getAvailableSkills(characterId) {
      if (!characterId) return { library: [], quickSlots: [] };
      return scenario2.skills[characterId] ?? { library: [], quickSlots: [] };
    },
    getModifiers(characterId) {
      if (!characterId) return [];
      return scenario2.modifiers[characterId] ?? [];
    },
    getCombatSession() {
      return scenario2.combatSession ?? null;
    },
    getBattleLog(_sessionId) {
      return scenario2.battleLog ?? { entries: [] };
    },
    /* ----------------- mutators ----------------- */
    selectToken(tokenId) {
      selectedTokenOverride = tokenId ?? null;
      notify();
    },
    setViewerRole(role) {
      roleOverride = role;
      notify();
    },
    setMockScenario(scenarioId) {
      scenario2 = createScenario(scenarioId);
      selectedTokenOverride = void 0;
      roleOverride = void 0;
      notify();
    },
    /* ----------------- lifecycle ----------------- */
    subscribe(listener) {
      if (typeof listener !== "function") return () => {
      };
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      listeners.clear();
    }
  };
  return createCombatHudAdapter(impl, "mock");
}

// hud/core/combatHudActions.js
function createInitialState(source = HUD_SOURCE.mock) {
  return {
    status: HUD_STATUS.idle,
    source,
    viewer: { playerId: "", playerName: "", role: VIEWER_ROLES.player },
    selectedTokenId: null,
    selectedCharacterId: null,
    access: { canViewSelectedCharacter: false, reason: null },
    snapshot: createEmptySnapshot(),
    ui: createDefaultUiState(),
    error: null
  };
}
function computeAccess(viewer, entity) {
  if (!entity) {
    return { canView: false, reason: EMPTY_REASONS.noCharacterLink };
  }
  if (viewer?.role === VIEWER_ROLES.gm) {
    return { canView: true, reason: null };
  }
  const ownerId = entity.summary?.ownerPlayerId ?? null;
  if (ownerId && viewer?.playerId && ownerId === viewer.playerId) {
    return { canView: true, reason: null };
  }
  return { canView: false, reason: EMPTY_REASONS.notOwner };
}
function applyViewer(state, viewer) {
  return {
    ...state,
    viewer: {
      playerId: String(viewer?.playerId ?? ""),
      playerName: String(viewer?.playerName ?? ""),
      role: viewer?.role === VIEWER_ROLES.gm ? VIEWER_ROLES.gm : VIEWER_ROLES.player
    }
  };
}
function applyLoading(state) {
  return { ...state, status: HUD_STATUS.loading, error: null };
}
function applySelectionResult(state, resolved) {
  const base = applyViewer(state, resolved.viewer);
  if (!resolved.selectedTokenId) {
    return {
      ...base,
      status: HUD_STATUS.empty,
      selectedTokenId: null,
      selectedCharacterId: null,
      access: { canViewSelectedCharacter: false, reason: EMPTY_REASONS.noToken },
      snapshot: createEmptySnapshot(),
      error: null
    };
  }
  if (!resolved.characterId || !resolved.entity) {
    return {
      ...base,
      status: HUD_STATUS.empty,
      selectedTokenId: resolved.selectedTokenId,
      selectedCharacterId: null,
      access: { canViewSelectedCharacter: false, reason: EMPTY_REASONS.noCharacterLink },
      snapshot: createEmptySnapshot(),
      error: null
    };
  }
  const access = computeAccess(resolved.viewer, resolved.entity);
  if (!access.canView) {
    return {
      ...base,
      status: HUD_STATUS.empty,
      selectedTokenId: resolved.selectedTokenId,
      selectedCharacterId: resolved.characterId,
      access: { canViewSelectedCharacter: false, reason: access.reason },
      snapshot: createEmptySnapshot(),
      error: null
    };
  }
  return {
    ...base,
    status: HUD_STATUS.ready,
    selectedTokenId: resolved.selectedTokenId,
    selectedCharacterId: resolved.characterId,
    access: { canViewSelectedCharacter: true, reason: null },
    snapshot: resolved.snapshot,
    error: null
  };
}
function applyError(state, message, cause = null) {
  return {
    ...state,
    status: HUD_STATUS.error,
    error: { message: String(message ?? "Unknown error"), cause: cause ? String(cause) : null }
  };
}
function setCollapsed(state, isCollapsed) {
  return { ...state, ui: { ...state.ui, isHudCollapsed: Boolean(isCollapsed) } };
}
function resetActionDraft(state) {
  return {
    ...state,
    ui: {
      ...state.ui,
      selectedTechniqueId: null,
      selectedAbilityId: null,
      selectedReloadMagazineId: null,
      selectedModifierIds: [],
      targeting: createDefaultTargeting()
      // isHudCollapsed and isBattleLogExpanded are view prefs, intentionally kept.
    }
  };
}
function assembleSnapshot(pieces) {
  const snapshot = createEmptySnapshot();
  snapshot.entity = cloneDeep(pieces.entity) ?? null;
  if (pieces.weapon) {
    snapshot.weapon = {
      primary: cloneDeep(pieces.weapon.primary) ?? null,
      secondary: cloneDeep(pieces.weapon.secondary) ?? null
    };
  }
  snapshot.skills = {
    library: cloneDeep(pieces.skills?.library ?? []),
    quickSlots: cloneDeep(pieces.skills?.quickSlots ?? [])
  };
  const session = pieces.combatSession ? cloneDeep(pieces.combatSession) : null;
  if (session) {
    session.isViewerTurn = computeIsViewerTurn(session, pieces.selectedCharacterId);
    snapshot.combatSession = normalizeCombatSession(session);
  }
  const groups = { passive: [], active: [], narrative: [] };
  for (const mod of cloneDeep(pieces.modifiers ?? [])) {
    const bucket = groups[mod.kind] ? mod.kind : "active";
    groups[bucket].push(mod);
  }
  snapshot.modifiers = groups;
  snapshot.battleLog = { entries: cloneDeep(pieces.battleLog?.entries ?? []) };
  return snapshot;
}
function computeIsViewerTurn(session, selectedCharacterId) {
  if (!session || session.status !== "active") return false;
  if (!selectedCharacterId) return false;
  return session.currentParticipantId === selectedCharacterId;
}
function normalizeCombatSession(session) {
  return {
    id: session.id ?? null,
    status: session.status ?? "inactive",
    round: Number(session.round ?? 0) || 0,
    currentParticipantId: session.currentParticipantId ?? null,
    participants: Array.isArray(session.participants) ? session.participants : [],
    isViewerTurn: Boolean(session.isViewerTurn)
  };
}

// hud/core/combatHudStore.js
function createCombatHudStore({ adapter }) {
  if (!adapter || typeof adapter.subscribe !== "function") {
    throw new Error("createCombatHudStore: a valid adapter is required.");
  }
  let state = createInitialState(adapter.source);
  const listeners = /* @__PURE__ */ new Set();
  let disposed = false;
  let unsubscribeAdapter = null;
  function setState(next) {
    state = next;
    emit();
  }
  function emit() {
    if (disposed) return;
    for (const listener of Array.from(listeners)) {
      try {
        listener(state);
      } catch (error) {
        console.error("[combatHud/store] listener threw", error);
      }
    }
  }
  function refreshRuntime() {
    if (disposed) return;
    try {
      const viewer = adapter.getViewer();
      const selectedTokenId = adapter.getSelectedTokenId();
      if (!selectedTokenId) {
        setState(applySelectionResult(state, {
          viewer,
          selectedTokenId: null,
          characterId: null,
          entity: null,
          snapshot: state.snapshot
        }));
        return;
      }
      const link = adapter.getCharacterForToken(selectedTokenId);
      const characterId = link?.characterId ?? null;
      const entity = characterId ? adapter.getCharacterRuntime(characterId) : null;
      if (!characterId || !entity) {
        setState(applySelectionResult(state, {
          viewer,
          selectedTokenId,
          characterId,
          entity: null,
          snapshot: state.snapshot
        }));
        return;
      }
      const weapon = adapter.getWeaponState(characterId);
      const skills = adapter.getAvailableSkills(characterId);
      const modifiers = adapter.getModifiers(characterId);
      const combatSession = adapter.getCombatSession();
      const battleLog = adapter.getBattleLog(combatSession?.id ?? null);
      const snapshot = assembleSnapshot({
        entity,
        weapon,
        skills,
        combatSession,
        modifiers,
        battleLog,
        selectedCharacterId: characterId
      });
      setState(applySelectionResult(state, {
        viewer,
        selectedTokenId,
        characterId,
        entity,
        snapshot
      }));
    } catch (error) {
      setState(applyError(state, "Failed to refresh Combat HUD state.", error?.message ?? error));
    }
  }
  function initialize() {
    if (disposed) return;
    setState(applyLoading(state));
    if (!unsubscribeAdapter) {
      unsubscribeAdapter = adapter.subscribe(() => refreshRuntime());
    }
    refreshRuntime();
  }
  function selectToken(tokenId) {
    if (disposed) return;
    adapter.selectToken(tokenId ?? null);
  }
  function setViewerRole(role) {
    if (disposed) return;
    adapter.setViewerRole(role);
  }
  function setViewer(viewer) {
    if (disposed) return;
    setState(applyViewer(state, viewer));
    refreshRuntime();
  }
  function setHudCollapsed(isCollapsed) {
    if (disposed) return;
    setState(setCollapsed(state, isCollapsed));
  }
  function setMockScenario(scenarioId) {
    if (disposed) return;
    try {
      adapter.setMockScenario(scenarioId);
    } catch (error) {
      setState(applyError(state, "setMockScenario is not supported by this adapter.", error?.message ?? error));
    }
  }
  function resetActionDraft2() {
    if (disposed) return;
    setState(resetActionDraft(state));
  }
  function getState() {
    return state;
  }
  function subscribe(listener) {
    if (typeof listener !== "function") return () => {
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (typeof unsubscribeAdapter === "function") {
      try {
        unsubscribeAdapter();
      } catch (_e) {
      }
      unsubscribeAdapter = null;
    }
    listeners.clear();
  }
  return {
    // lifecycle
    initialize,
    dispose,
    // reads
    getState,
    subscribe,
    // actions
    selectToken,
    setViewer,
    setViewerRole,
    setHudCollapsed,
    setMockScenario,
    resetActionDraft: resetActionDraft2,
    // exposed for diagnostics/tests
    get status() {
      return state.status;
    },
    isReady() {
      return state.status === HUD_STATUS.ready;
    }
  };
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
  const mode = raw.mode === "custom" ? "custom" : "default";
  if (mode === "default") return { ...DEFAULT_PLACEMENT };
  return { mode: "custom", x: clamp01(raw.x), y: clamp01(raw.y) };
}
function validatePlacement(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.mode !== "default" && raw.mode !== "custom") return null;
  if (raw.mode === "custom") {
    if (typeof raw.x !== "number" || typeof raw.y !== "number") return null;
    if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return null;
  }
  return clampPlacement(raw);
}
function parsePlacement(rawJson) {
  if (rawJson == null) return null;
  let obj = rawJson;
  if (typeof rawJson === "string") {
    try {
      obj = JSON.parse(rawJson);
    } catch {
      return null;
    }
  }
  return validatePlacement(obj);
}

// hud/overlay/overlayConstants.js
var BC_HUD_UI_STATE = "com.odyssey.combat-hud/ui-state";
var BC_HUD_SELECTION = "com.odyssey.combat-hud/selection";
var BC_HUD_SELECTION_REQUEST = "com.odyssey.combat-hud/selection-request";
var BC_HUD_COMMAND = "com.odyssey.combat-hud/command";
var BC_HUD_SESSION = "com.odyssey.combat-hud/session-state";
var BC_HUD_SESSION_REQUEST = "com.odyssey.combat-hud/session-state-request";
var BC_HUD_ABILITIES = "com.odyssey.combat-hud/abilities-runtime";
var BC_HUD_ABILITIES_REQUEST = "com.odyssey.combat-hud/abilities-runtime-request";
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
function parseHudUiState(search) {
  const out = {};
  let params;
  try {
    params = new URLSearchParams(search || "");
  } catch {
    return out;
  }
  if (params.has(HUD_UI_PARAM_KEYS.collapsed)) {
    out.isHudCollapsed = params.get(HUD_UI_PARAM_KEYS.collapsed) === "1";
  }
  const scenario2 = params.get(HUD_UI_PARAM_KEYS.scenario);
  if (scenario2) out.mockScenarioId = scenario2;
  const role = params.get(HUD_UI_PARAM_KEYS.role);
  if (role === "player" || role === "gm") out.viewerRole = role;
  if (params.has(HUD_UI_PARAM_KEYS.token)) {
    const token = params.get(HUD_UI_PARAM_KEYS.token);
    out.selectedTokenId = token ? token : null;
  }
  const placement = parsePlacement(params.get(HUD_UI_PARAM_KEYS.placement));
  if (placement) out.hudPlacement = placement;
  return out;
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

// hud/components/hudLayoutModel.js
function buildEmptyStateModel(state) {
  const reason = state?.access?.reason ?? null;
  switch (reason) {
    case EMPTY_REASONS.notOwner:
      return {
        title: "SELECT YOUR CHARACTER",
        hint: "You do not control this token. Choose a controlled token on the map."
      };
    case EMPTY_REASONS.noCharacterLink:
      return {
        title: "NO CHARACTER LINKED",
        hint: "This token is not linked to a character sheet."
      };
    case EMPTY_REASONS.noToken:
    default:
      return {
        title: "SELECT YOUR CHARACTER",
        hint: "Choose a controlled token on the map."
      };
  }
}
function resolveBodyMode(state) {
  switch (state?.status) {
    case HUD_STATUS.ready:
      return "ready";
    case HUD_STATUS.empty:
      return "empty";
    case HUD_STATUS.error:
      return "error";
    default:
      return "loading";
  }
}
function zoneStateClass(stateName) {
  switch (stateName) {
    case ZONE_STATES.healthy:
      return "healthy";
    case ZONE_STATES.wounded:
      return "wounded";
    case ZONE_STATES.serious:
      return "serious";
    case ZONE_STATES.critical:
      return "critical";
    case ZONE_STATES.disabled:
      return "disabled";
    default:
      return "unknown";
  }
}
function accentClass(colorSemantic) {
  switch (colorSemantic) {
    case "attack":
      return "attack";
    case "psionic":
      return "psionic";
    case "implant":
      return "implant";
    case "intervention":
      return "intervention";
    case "positive":
      return "positive";
    case "negative":
      return "negative";
    case "neutral":
    default:
      return "neutral";
  }
}

// hud/core/combatHudSelectors.js
var COMPACT_LOG_LIMIT = 5;
function selectCurrentEntity(state) {
  return state?.snapshot?.entity ?? null;
}
function selectControlledCharacter(state) {
  if (state?.status !== HUD_STATUS.ready) return null;
  if (!state?.access?.canViewSelectedCharacter) return null;
  const entity = state?.snapshot?.entity ?? null;
  if (!entity) return null;
  const type = entity.summary?.characterType;
  if (state.viewer?.role === "player") return entity;
  if (type === TOKEN_KINDS.player || type === TOKEN_KINDS.mech) return entity;
  return null;
}
function selectCombatSession(state) {
  return state?.snapshot?.combatSession ?? null;
}
function selectIsViewerTurn(state) {
  return Boolean(state?.snapshot?.combatSession?.isViewerTurn);
}
function selectCanAct(state) {
  const entity = selectCurrentEntity(state);
  if (!entity) return false;
  if (!entity.flags?.conscious || !entity.flags?.alive) return false;
  const session = selectCombatSession(state);
  if (session && session.status === "active" && !session.isViewerTurn) return false;
  return Boolean(entity.actions?.main || entity.actions?.move);
}
function selectSelectedSkill(state) {
  const id = state?.ui?.selectedTechniqueId ?? state?.ui?.selectedAbilityId ?? null;
  if (!id) return null;
  const library = state?.snapshot?.skills?.library ?? [];
  return library.find((s) => s.id === id) ?? null;
}
function selectCurrentActionCost(state) {
  const skill2 = selectSelectedSkill(state);
  if (skill2) return skill2.actionCost;
  return "MAIN";
}
function selectDisabledReason(state) {
  if (state?.status !== HUD_STATUS.ready) return "No character loaded.";
  const entity = selectCurrentEntity(state);
  if (!entity) return "No character loaded.";
  if (!entity.flags?.alive) return "Character is dead.";
  if (!entity.flags?.conscious) return "Character is unconscious.";
  const session = selectCombatSession(state);
  if (session && session.status === "active" && !session.isViewerTurn) {
    return "Not your turn.";
  }
  const skill2 = selectSelectedSkill(state);
  if (skill2?.disabledReason) return skill2.disabledReason;
  const cost = selectCurrentActionCost(state);
  if (cost === "MAIN" && !entity.actions?.main) return "MAIN action already spent.";
  if (cost === "MOVE" && !entity.actions?.move) return "MOVE action already spent.";
  if (skill2 && skill2.targeting !== "none") {
    const targeting = state?.ui?.targeting ?? {};
    if (skill2.usesPoint && !targeting.selectedPoint) return "Pick a target point.";
    if (!skill2.usesPoint && (targeting.selectedTargetIds?.length ?? 0) === 0) {
      return "Select a target.";
    }
  }
  return null;
}
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
function selectSelectedReloadMagazine(state) {
  const id = state?.ui?.selectedReloadMagazineId ?? state?.snapshot?.weapon?.primary?.reloadCandidateId ?? null;
  if (!id) return null;
  return selectVisibleReserveMagazines(state).find((m) => m.id === id) ?? null;
}
function selectCompactBattleLog(state) {
  const entries = state?.snapshot?.battleLog?.entries ?? [];
  if (entries.length <= COMPACT_LOG_LIMIT) return entries.slice();
  return entries.slice(entries.length - COMPACT_LOG_LIMIT);
}
function selectQuickSlots(state) {
  return state?.snapshot?.skills?.quickSlots ?? [];
}
function selectSkillById(state, skillId) {
  if (!skillId) return null;
  const library = state?.snapshot?.skills?.library ?? [];
  return library.find((s) => s.id === skillId) ?? null;
}
function selectModifierGroups(state) {
  return state?.snapshot?.modifiers ?? { passive: [], active: [], narrative: [] };
}
function selectSelectedBodyPart(state) {
  return state?.ui?.targeting?.selectedBodyPartId ?? DEFAULT_BODY_PART_ID;
}
var BODY_PART_LABELS = Object.freeze({
  head: "HEAD",
  torso: "TORSO",
  l_arm: "L.ARM",
  r_arm: "R.ARM",
  l_leg: "L.LEG",
  r_leg: "R.LEG"
});
function selectBodyPartLabel(bodyPartId) {
  if (!bodyPartId) return "";
  return BODY_PART_LABELS[bodyPartId] ?? String(bodyPartId).toUpperCase();
}
function selectActionLabel(state) {
  const skill2 = selectSelectedSkill(state);
  if (!skill2) return "ATTACK";
  switch (skill2.type) {
    case "attackTechnique":
      return "ATTACK";
    case "itemAction":
      return skill2.usesPoint ? "THROW" : "USE";
    case "targetedAbility":
      return skill2.source === "psionic" ? "CAST" : "ACTIVATE";
    case "instantAbility":
      return skill2.source === "item" ? "USE" : "ACTIVATE";
    case "toggleAbility":
      return "ACTIVATE";
    default:
      return "ATTACK";
  }
}
function selectPlayerStatusLabel(state) {
  const controlled = selectControlledCharacter(state);
  if (state?.viewer?.role === "gm" && !controlled) return "GM VIEW";
  const session = selectCombatSession(state);
  if (session && session.status === "active") {
    return selectIsViewerTurn(state) ? "YOUR TURN" : "WAITING";
  }
  return "READY";
}
function selectVisibleStatuses(state, limit = 5) {
  const entity = selectCurrentEntity(state);
  if (!entity) return { shown: [], overflow: 0 };
  const all = [
    ...Array.isArray(entity.statuses) ? entity.statuses : [],
    ...Array.isArray(entity.effects) ? entity.effects : []
  ];
  if (all.length <= limit) return { shown: all, overflow: 0 };
  return { shown: all.slice(0, limit), overflow: all.length - limit };
}
function selectTargetView(state) {
  const bodyPartId = selectSelectedBodyPart(state);
  const targeting = state?.ui?.targeting ?? {};
  const empty = {
    hasTarget: false,
    isPicking: targeting.mode === "picking",
    name: null,
    kind: "humanoid",
    bodyPartId,
    bodyPartLabel: selectBodyPartLabel(bodyPartId),
    distance: null,
    zonesMap: {}
  };
  if (Array.isArray(targeting.selectedTargetIds) && targeting.selectedTargetIds.length > 0) {
    return {
      hasTarget: true,
      isPicking: false,
      name: targeting.selectedTargetName ?? "Target",
      kind: "humanoid",
      bodyPartId,
      bodyPartLabel: selectBodyPartLabel(bodyPartId),
      distance: Number.isFinite(targeting.distance) ? targeting.distance : null,
      // Phase 3D.1: color-only body-zone condition (svgPartId -> ZONE_STATES
      // value), never raw wound counts — see TargetBlock.js / bodyConditionPolicy.js.
      zonesMap: targeting.zonesMap && typeof targeting.zonesMap === "object" ? targeting.zonesMap : {}
    };
  }
  const session = selectCombatSession(state);
  if (!session || session.status !== "active") return empty;
  const selfId = state?.selectedCharacterId ?? null;
  const participants = Array.isArray(session.participants) ? session.participants : [];
  const enemy = participants.find((p) => p.id !== selfId && !p.isPlayer && p.condition === "active") ?? participants.find((p) => p.id !== selfId && p.condition === "active") ?? null;
  if (!enemy) return empty;
  return {
    hasTarget: true,
    name: enemy.name,
    kind: "humanoid",
    bodyPartId,
    bodyPartLabel: selectBodyPartLabel(bodyPartId),
    // Read-only passthrough: distance arrives from the backend later; absent in
    // the mock, so the Target section shows a neutral placeholder until then.
    distance: Number.isFinite(enemy.distance) ? enemy.distance : null
  };
}
function selectModifierChips(state) {
  const groups = selectModifierGroups(state);
  return [
    ...groups.passive ?? [],
    ...groups.active ?? [],
    ...groups.narrative ?? []
  ];
}

// utils/json.js
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// hud/components/hudDom.js
var esc = escapeHtml;
function cls(...names) {
  return names.filter(Boolean).join(" ");
}
var TIP_SEP = "\u2016";
function tipAttr(title, lines = []) {
  if (!title) return "";
  const body = lines.filter(Boolean).join(TIP_SEP);
  const t = esc(String(title));
  const l = esc(body);
  return ` data-tip-title="${t}"${body ? ` data-tip-lines="${l}"` : ""}`;
}

// hud/components/hudIcons.js
var ICON_MARK = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 2l8 10-8 10-8-10z" fill="currentColor"/></svg>`;
var ICON_CARET_DOWN = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 9l6 7 6-7z" fill="currentColor"/></svg>`;
var ICON_RELOAD = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M20 4v4h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
var ICON_GRIP = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></g></svg>`;
var ICON_GRID = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></g></svg>`;
var ICON_SHIELD = `<svg viewBox="0 0 24 28" width="100%" height="100%" aria-hidden="true"><path d="M12 2l9 3v8c0 6-4 9-9 11-5-2-9-5-9-11V5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
var ICON_MAGAZINE = `<svg viewBox="0 0 40 64" width="100%" height="100%" aria-hidden="true"><rect x="9" y="6" width="22" height="50" rx="5" fill="currentColor"/><rect x="13" y="2" width="14" height="7" rx="2.5" fill="currentColor"/></svg>`;
function weaponSvg(svgRef) {
  if (svgRef === "pistol") {
    return `<svg viewBox="0 0 200 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d="M18 40h140l12 6v16h-58l-6 10-18 0-4-10H40l-6 22H18l4-30-4-2z" fill="currentColor"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 360 150" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <!-- receiver + barrel -->
    <rect x="40" y="58" width="250" height="20" rx="5" fill="currentColor"/>
    <rect x="280" y="62" width="70" height="9" rx="4" fill="currentColor"/>
    <!-- stock -->
    <path d="M10 56h40v26H22l-12-8z" fill="currentColor"/>
    <!-- optic -->
    <rect x="150" y="40" width="60" height="14" rx="4" fill="currentColor"/>
    <rect x="170" y="30" width="22" height="12" rx="3" fill="currentColor"/>
    <!-- magazine -->
    <path d="M150 78l8 34h26l4-34z" fill="currentColor"/>
    <!-- grip -->
    <path d="M96 78l-10 34h22l6-34z" fill="currentColor"/>
    <!-- handguard underline -->
    <rect x="210" y="78" width="70" height="8" rx="4" fill="currentColor"/>
  </svg>`;
}
var SKILL_ICONS = {
  star: `<path d="M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6L12 16.9 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="currentColor"/>`,
  burst: `<path d="M12 2l1.8 4.4L18 4.5l-1.5 4.2 4.5 1L17 12l4 2.3-4.5 1L18 19.5l-4.2-1.9L12 22l-1.8-4.4L6 19.5l1.5-4.2-4.5-1L7 12 3 9.7l4.5-1L6 4.5l4.2 1.9z" fill="currentColor"/><circle cx="12" cy="12" r="3" fill="var(--odyssey-bg-deep)"/>`,
  scope: `<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  psi: `<path d="M7 4h2v6a3 3 0 1 0 6 0V4h2v6a5 5 0 0 1-4 4.9V20h-2v-5.1A5 5 0 0 1 7 10z" fill="currentColor"/>`,
  cube: `<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 3v18M4 7.5l8 4.5 8-4.5" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  arrowup: `<path d="M12 4v13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 9l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="19" r="2.4" fill="currentColor"/>`,
  grenade: `<circle cx="12" cy="14" r="6.5" fill="currentColor"/><rect x="10" y="3" width="4" height="4" rx="1" fill="currentColor"/><path d="M14 4h4v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  injector: `<path d="M5 19l8-8 3 3-8 8H5z" fill="currentColor"/><path d="M14 8l4-4 2 2-4 4z" fill="currentColor"/>`,
  cloak: `<path d="M12 3c4 2 6 5 6 9 0 5-3 8-6 9-3-1-6-4-6-9 0-4 2-7 6-9z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 11c1.5 1.5 4.5 1.5 6 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  bolt: `<path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="currentColor"/>`,
  shieldtri: `<path d="M12 4l7 3v6c0 4-3 6-7 7-4-1-7-3-7-7V7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
  arc: `<path d="M12 5a7 7 0 1 1-5 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/>`
};
function skillIconSvg(name) {
  const key = String(name || "").toLowerCase();
  const alias = {
    "arrow-up": "arrowup",
    "mind": "psi",
    "psionic": "psi",
    "explosion": "burst",
    "sunburst": "burst",
    "shield": "shieldtri",
    "cooldown": "arc",
    "reload": "arc"
  };
  const inner = SKILL_ICONS[key] ?? SKILL_ICONS[alias[key]] ?? `<circle cx="12" cy="12" r="6" fill="currentColor"/>`;
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">${inner}</svg>`;
}
function zoneAttr(zoneId, zonesMap2, neutral) {
  const stateName = neutral ? "healthy" : zonesMap2?.[zoneId] ?? "unknown";
  return zoneStateClass(stateName);
}
var SVG_PART_TO_ZONE_ID = Object.freeze({
  head: "HEAD",
  torso: "TORSO",
  l_arm: "LEFT_ARM",
  r_arm: "RIGHT_ARM",
  l_leg: "LEFT_LEG",
  r_leg: "RIGHT_LEG"
});
var SVG_PART_LABEL = Object.freeze({
  head: "Head",
  torso: "Torso",
  l_arm: "Left arm",
  r_arm: "Right arm",
  l_leg: "Left leg",
  r_leg: "Right leg"
});
function humanoidSvg(opts = {}) {
  const { zones = {}, highlight = null, neutral = false, targetable = false, zoneTips = null } = opts;
  const z = (id) => `ohud-zone ohud-zone--${zoneAttr(id, zones, neutral)}${highlight === id ? " is-target" : ""}${targetable ? " ohud-zone--clickable" : ""}`;
  const tipFor = (id) => zoneTips && Array.isArray(zoneTips[id]) && zoneTips[id].length ? tipAttr(SVG_PART_LABEL[id], zoneTips[id]) : "";
  const a = (id) => targetable ? ` data-zone="${id}" data-action="select-target-zone" data-zone-id="${SVG_PART_TO_ZONE_ID[id]}" role="button" tabindex="0" aria-label="${SVG_PART_LABEL[id]}"${tipFor(id)}` : ` data-zone="${id}"${tipFor(id)}`;
  return `<svg viewBox="0 0 120 150" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="${targetable ? "false" : "true"}" class="ohud-silhouette">
    <circle cx="60" cy="24" r="16" class="${z("head")}"${a("head")}/>
    <rect x="42" y="44" width="36" height="46" rx="11" class="${z("torso")}"${a("torso")}/>
    <rect x="24" y="48" width="14" height="40" rx="7" class="${z("l_arm")}"${a("l_arm")}/>
    <rect x="82" y="48" width="14" height="40" rx="7" class="${z("r_arm")}"${a("r_arm")}/>
    <rect x="45" y="94" width="14" height="44" rx="7" class="${z("l_leg")}"${a("l_leg")}/>
    <rect x="61" y="94" width="14" height="44" rx="7" class="${z("r_leg")}"${a("r_leg")}/>
  </svg>`;
}
function mechSvg(opts = {}) {
  const { zones = {} } = opts;
  const z = (id) => `ohud-zone ohud-zone--${zoneAttr(id, zones, false)}`;
  return `<svg viewBox="0 0 120 150" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" class="ohud-silhouette">
    <rect x="46" y="10" width="28" height="20" rx="5" class="${z("m_head")}" data-zone="m_head"/>
    <path d="M36 34h48l6 40H30z" class="${z("m_core")}" data-zone="m_core"/>
    <rect x="14" y="38" width="18" height="46" rx="6" class="${z("m_l_arm")}" data-zone="m_l_arm"/>
    <rect x="88" y="38" width="18" height="46" rx="6" class="${z("m_r_arm")}" data-zone="m_r_arm"/>
    <path d="M40 78h16v60H38z" class="${z("m_legs")}" data-zone="m_legs"/>
    <path d="M64 78h16l-2 60H64z" class="${z("m_legs")}"/>
  </svg>`;
}
function turretSvg(opts = {}) {
  const { zones = {} } = opts;
  const z = (id) => `ohud-zone ohud-zone--${zoneAttr(id, zones, false)}`;
  return `<svg viewBox="0 0 120 150" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" class="ohud-silhouette">
    <ellipse cx="60" cy="132" rx="38" ry="10" class="${z("base")}" data-zone="base"/>
    <rect x="50" y="78" width="20" height="50" rx="6" class="${z("base")}"/>
    <rect x="34" y="50" width="52" height="34" rx="10" class="${z("housing")}" data-zone="housing"/>
    <rect x="80" y="58" width="34" height="10" rx="5" class="${z("barrel")}" data-zone="barrel"/>
    <circle cx="48" cy="44" r="8" class="${z("sensor")}" data-zone="sensor"/>
  </svg>`;
}
function entitySilhouetteSvg(summary, opts = {}) {
  const ref = summary?.svgRef ?? "humanoid";
  if (ref === "mech") return mechSvg(opts);
  if (ref === "turret") return turretSvg(opts);
  return humanoidSvg(opts);
}

// hud/components/StatusChip.js
function polarityClass(polarity) {
  if (polarity === "positive") return "positive";
  if (polarity === "negative") return "negative";
  return "neutral";
}
function statusChip(status2) {
  if (!status2) return "";
  const dur = status2.durationTurns == null ? "Ongoing" : `${status2.durationTurns}t`;
  const tip = tipAttr(status2.name, [
    status2.description || "",
    `Duration: ${dur}`
  ]);
  const initial = esc((status2.name || "?").trim().charAt(0).toUpperCase());
  return `<span class="ohud-chip-status ohud-chip-status--${polarityClass(status2.polarity)}"${tip}>
    <span class="ohud-chip-dot" aria-hidden="true">${initial}</span>
    <span class="ohud-chip-name">${esc(status2.name)}</span>
  </span>`;
}
function overflowChip(n) {
  if (!n || n <= 0) return "";
  return `<span class="ohud-chip-status ohud-chip-status--more" data-tip-title="More statuses" data-tip-lines="${n} more active">+${n}</span>`;
}

// hud/components/HudPanel.js
function panel(cfg) {
  const { key, label, accent, bodyHtml, className, headerRightHtml } = cfg;
  const header = label || headerRightHtml ? `<div class="ohud-panel-head">
         ${label ? `<span class="ohud-panel-label ${accent ? `ohud-accent--${accent}` : ""}">${esc(label)}</span>` : "<span></span>"}
         ${headerRightHtml ?? ""}
       </div>` : "";
  return `<section class="${cls("ohud-panel", `ohud-panel--${key}`, className)}" data-block="${esc(key)}">
    ${header}
    <div class="ohud-panel-body">${bodyHtml}</div>
  </section>`;
}

// hud/components/PlayerBlock.js
function zonesMap(entity) {
  const map = {};
  for (const z of entity.zones ?? []) map[z.id] = z.state;
  return map;
}
function zoneTipsMap(entity, authorized) {
  if (!authorized) return null;
  const map = {};
  for (const z of entity.zones ?? []) {
    if (Array.isArray(z.detailLines) && z.detailLines.length) map[z.id] = z.detailLines;
  }
  return map;
}
function resourceBar(kind, label, res) {
  const maxRaw = res?.max;
  const curRaw = res?.current;
  const hasMax = Number.isFinite(Number(maxRaw)) && Number(maxRaw) > 0;
  const hasCur = Number.isFinite(Number(curRaw));
  const max = hasMax ? Math.max(0, Number(maxRaw)) : null;
  const cur = hasCur ? Math.max(0, Number(curRaw)) : null;
  const pct = max > 0 && cur != null ? Math.round(cur / max * 100) : 0;
  const labelText = max != null && cur != null ? `${cur} / ${max}` : "\u2014";
  return `<div class="ohud-res ohud-res--${kind}"${tipAttr(label, [labelText])}>
    <span class="ohud-res-label">${esc(label)}</span>
    <span class="ohud-res-track"><span class="ohud-res-fill" style="width:${pct}%"></span></span>
    <span class="ohud-res-num">${esc(cur != null ? cur : "\u2014")}${max != null ? `<span class="ohud-res-max">/${max}</span>` : ""}</span>
  </div>`;
}
function actionPips(actions) {
  const pip = (on, name) => `<span class="${cls("ohud-pip", on ? "is-on" : "is-off")}"${tipAttr(`${name} action`, [on ? "Available" : "Spent"])}>${name}</span>`;
  return `<div class="ohud-pips">${pip(Boolean(actions?.main), "MAIN")}${pip(Boolean(actions?.move), "MOVE")}</div>`;
}
function pilotStrip(pilot) {
  if (!pilot) return "";
  const psi = pilot.psi ? `${pilot.psi.current}/${pilot.psi.max}` : "";
  return `<div class="ohud-pilot"${tipAttr(`Pilot: ${pilot.name}`, [psi ? `Psi ${psi}` : ""])}>
    <span class="ohud-pilot-tag">PILOT</span>
    <span class="ohud-pilot-name">${esc(pilot.name)}</span>
    ${psi ? `<span class="ohud-pilot-psi">\u03A8 ${esc(psi)}</span>` : ""}
  </div>`;
}
function renderPlayerBlock(state) {
  const entity = selectCurrentEntity(state);
  if (!entity) {
    return panel({ key: "player", label: "PLAYER", bodyHtml: `<div class="ohud-muted-fill">\u2014</div>` });
  }
  const turn = selectPlayerStatusLabel(state);
  const turnClass = turn === "YOUR TURN" ? "active" : turn === "WAITING" ? "waiting" : turn === "GM VIEW" ? "gm" : "idle";
  const { shown, overflow } = selectVisibleStatuses(state, 5);
  const isMech = entity.summary?.svgRef === "mech";
  const authorized = !!selectControlledCharacter(state);
  const session = state?.snapshot?.combatSession ?? null;
  const roundTag = session && session.status === "active" ? `<span class="ohud-turn-round"${tipAttr("Combat round", [`Round ${session.roundNumber ?? session.round ?? 0}`])}>R${esc(session.roundNumber ?? session.round ?? 0)}</span>` : "";
  const headerRight = `${roundTag}<span class="ohud-turn ohud-turn--${turnClass}">${esc(turn)}</span>`;
  const body = `
    <div class="ohud-player-grid">
      <div class="ohud-figure">
        <div class="ohud-figure-svg">${entitySilhouetteSvg(entity.summary, { zones: zonesMap(entity), zoneTips: zoneTipsMap(entity, authorized) })}</div>
        <div class="ohud-figure-shield" aria-hidden="true">${ICON_SHIELD}</div>
      </div>
      <div class="ohud-player-stats">
        <div class="ohud-player-name" title="${esc(entity.summary.name)}">${esc(entity.summary.name)}</div>
        ${resourceBar("shield", "SHIELD", entity.shield)}
        ${entity.psi ? resourceBar("psi", "PSI", entity.psi) : ""}
        ${actionPips(entity.actions)}
      </div>
    </div>
    ${isMech ? pilotStrip(entity.pilot) : ""}
    <div class="ohud-statuses">
      ${shown.map(statusChip).join("")}
      ${overflowChip(overflow)}
    </div>
  `;
  return panel({
    key: "player",
    label: isMech ? "Mech" : "You",
    bodyHtml: body,
    headerRightHtml: headerRight
  });
}

// hud/session/combatSessionPolicy.js
var SESSION_BLOCK_REASONS = Object.freeze({
  waitingForTurn: "Waiting for your turn",
  mainSpent: "MAIN already spent",
  moveSpent: "MOVE already spent"
});
function isActiveSession(session) {
  return !!session && session.exists === true && session.status === "active";
}
function selectedIsParticipant(session) {
  return isActiveSession(session) && session.selectedCharacterParticipantId != null;
}
function sessionReloadGate(session) {
  if (!selectedIsParticipant(session)) return { blocked: false, reason: null };
  if (!session.isSelectedCharacterTurn) return { blocked: true, reason: SESSION_BLOCK_REASONS.waitingForTurn };
  if (!session.moveAvailable) return { blocked: true, reason: SESSION_BLOCK_REASONS.moveSpent };
  return { blocked: false, reason: null };
}
function canEndTurn(session, viewerRole) {
  if (!isActiveSession(session) || session.currentParticipantId == null) return false;
  const isGm = String(viewerRole ?? "").toLowerCase() === "gm";
  if (isGm && session.isSelectedCharacterTurn) return true;
  return session.isCurrentPlayerTurn === true;
}
function canSeeGmTracker(viewerRole) {
  return String(viewerRole ?? "").toLowerCase() === "gm";
}

// hud/components/GunBlock.js
function renderFireModeControl(weapon) {
  const fm = weapon.fireMode;
  if (!fm || !fm.isApplicable) return "";
  const label = (fm.selectedCode || fm.selectedName || "").toUpperCase();
  const tip = tipAttr("Fire mode", [esc(fm.selectedName || fm.selectedCode || "")]);
  if (!fm.isSelectable) {
    return `<span class="ohud-firemode is-readonly"${tip}>
      <span class="ohud-firemode-knob"></span><span class="ohud-firemode-letter">${esc(label)}</span>
    </span>`;
  }
  return `<button type="button" class="ohud-firemode is-selectable" data-action="toggle-fire-mode-selector" aria-label="Choose fire mode"${tip}>
    <span class="ohud-firemode-knob"></span><span class="ohud-firemode-letter">${esc(label)}</span><span class="ohud-firemode-caret" aria-hidden="true">${ICON_CARET_DOWN}</span>
  </button>`;
}
function emptyGun() {
  return panel({
    key: "gun",
    label: "Weapon",
    bodyHtml: `<div class="ohud-gun is-disabled"><div class="ohud-gun-main"><div class="ohud-muted-fill">No weapon</div></div></div>`
  });
}
function renderGunBlock(state) {
  const weapon = state?.snapshot?.weapon?.primary ?? null;
  const secondary = state?.snapshot?.weapon?.secondary ?? null;
  if (!weapon) return emptyGun();
  const mag = weapon.loadedMagazine ?? null;
  const ammoCur = mag ? Number(mag.current ?? 0) : Number(weapon.ammo?.current ?? 0);
  const reserve = selectVisibleReserveMagazines(state);
  const selectedReload = selectSelectedReloadMagazine(state);
  const reloadMag = selectedReload ?? reserve[0] ?? null;
  const reloadGate = sessionReloadGate(state?.snapshot?.combatSession ?? null);
  const canReload = Boolean(weapon.canReload) && reserve.length > 0 && !reloadGate.blocked;
  const reloadBlockReason = reloadGate.blocked ? reloadGate.reason : Boolean(weapon.canReload) && reserve.length > 0 ? null : "No compatible magazine";
  const isEmpty = weapon.requiresAmmo && ammoCur <= 0;
  const disabled = Boolean(weapon.disabledReason) || isEmpty && !canReload;
  const mainCard = `
    <div class="ohud-gun-main"${tipAttr(weapon.name, [weapon.currentFireMode ? `Mode: ${weapon.currentFireMode}` : ""])}>
      <span class="ohud-gun-name">${esc(weapon.name)}</span>
      <button type="button" class="ohud-gun-caret" data-action="toggle-weapon-selector" aria-label="Choose weapon" title="Select a different weapon">${ICON_CARET_DOWN}</button>
      <span class="ohud-gun-silhouette">${weaponSvg(weapon.svgRef)}</span>
      ${renderFireModeControl(weapon)}
      ${secondary ? `<span class="ohud-gun-secondary"${tipAttr("Secondary weapon", [esc(secondary.name || "")])}>2nd</span>` : ""}
    </div>`;
  const body = `<div class="${cls("ohud-gun", disabled ? "is-disabled" : "")}"${disabled ? tipAttr("Weapon unavailable", [esc(weapon.disabledReason || "Out of ammo")]) : ""}>
    ${mainCard}
    <div class="ohud-gun-side">${renderMagazineCard(weapon, reserve, reloadMag)}${renderAmmoCard(weapon, mag, isEmpty, canReload, reloadMag, reloadBlockReason)}</div>
  </div>`;
  return panel({ key: "gun", label: "Weapon", bodyHtml: body });
}
function renderMagazineCard(weapon, reserve, reloadMag) {
  const usesMag = Boolean(weapon.usesMagazine);
  const spareLabel = reloadMag ? reloadMag.ammoType ?? reloadMag.caliberLabel ?? "\u2014" : "\u2014";
  return `<div class="ohud-mag-card${usesMag ? "" : " is-consumable"}">
    <span class="ohud-mag-icon" aria-hidden="true">${usesMag ? ICON_MAGAZINE : ""}</span>
    ${usesMag && reserve.length > 0 ? `<button type="button" class="ohud-mag-selector-btn" data-action="toggle-magazine-selector" aria-label="Choose magazine" title="Select spare magazine">${ICON_CARET_DOWN}</button>` : ""}
    <span class="ohud-mag-type"${tipAttr("Selected spare magazine", [esc(spareLabel)])}>${esc(spareLabel)}</span>
  </div>`;
}
function renderAmmoCard(weapon, mag, isEmpty, canReload, reloadMag, reloadBlockReason) {
  let ammoDisplay = "\u2014";
  if (mag && (mag.current || mag.max)) {
    ammoDisplay = `${Number(mag.current ?? 0)}/${Number(mag.max ?? 0)}`;
  } else if (!mag && weapon.ammo && (weapon.ammo.current || weapon.ammo.max)) {
    ammoDisplay = `${Number(weapon.ammo.current ?? 0)}/${Number(weapon.ammo.max ?? 0)}`;
  }
  return `<div class="ohud-ammo-card">
    <span class="ohud-ammo-head">
      <span class="ohud-ammo-label">ammo</span>
      <button type="button" class="${cls("ohud-ammo-reload", canReload ? "" : "is-off")}" data-action="reload" data-weapon-id="${esc(weapon.id)}" data-magazine-id="${esc(reloadMag?.id ?? "")}" ${canReload ? "" : "disabled"} title="${esc(canReload ? "Insert compatible magazine" : reloadBlockReason || "No compatible magazine")}">${ICON_RELOAD}</button>
    </span>
    <span class="${cls("ohud-ammo-count", isEmpty ? "ohud-ammo-count--empty" : "")}">
      <span>${esc(ammoDisplay)}</span>
    </span>
  </div>`;
}

// hud/abilities/quickbarLayoutPolicy.js
var DEFAULT_MAX_SLOTS = 20;
var FIRST_ROW_SIZE = 10;
function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function str(v) {
  const s = String(v ?? "").trim();
  return s || null;
}
function emptySlot(slotIndex) {
  return { slotIndex, characterActionId: null, empty: true, missing: false };
}
function buildDraft(serverSlots, actionIdSet, maxSlots = DEFAULT_MAX_SLOTS) {
  const size = Math.max(1, num(maxSlots, DEFAULT_MAX_SLOTS));
  const draft = Array.from({ length: size }, (_, i) => emptySlot(i));
  const seen = /* @__PURE__ */ new Set();
  for (const raw of Array.isArray(serverSlots) ? serverSlots : []) {
    const idx = num(raw?.slotIndex ?? raw?.index, -1);
    if (idx < 0 || idx >= size) continue;
    const actionId = str(raw?.characterActionId ?? raw?.actionId);
    if (!actionId) continue;
    if (seen.has(actionId)) continue;
    seen.add(actionId);
    draft[idx] = {
      slotIndex: idx,
      characterActionId: actionId,
      empty: false,
      missing: !actionIdSet.has(actionId)
    };
  }
  return draft;
}
function slotIndexOfAction(draft, actionId) {
  return draft.findIndex((s) => s && s.characterActionId === actionId);
}
function assignActionToSlot(draft, actionId, targetIndex, actionIdSet) {
  const id = str(actionId);
  const tIdx = num(targetIndex, -1);
  if (!id || tIdx < 0 || tIdx >= draft.length) return draft.slice();
  const next = draft.map((s) => ({ ...s }));
  const fromIdx = slotIndexOfAction(next, id);
  const displaced = next[tIdx].characterActionId;
  next[tIdx] = {
    slotIndex: tIdx,
    characterActionId: id,
    empty: false,
    missing: actionIdSet ? !actionIdSet.has(id) : false
  };
  if (fromIdx >= 0 && fromIdx !== tIdx) {
    if (displaced) {
      next[fromIdx] = {
        slotIndex: fromIdx,
        characterActionId: displaced,
        empty: false,
        missing: actionIdSet ? !actionIdSet.has(displaced) : false
      };
    } else {
      next[fromIdx] = emptySlot(fromIdx);
    }
  }
  return next;
}
function moveSlot(draft, fromIndex, toIndex) {
  const f = num(fromIndex, -1);
  const t = num(toIndex, -1);
  if (f < 0 || t < 0 || f >= draft.length || t >= draft.length || f === t) return draft.slice();
  const next = draft.map((s) => ({ ...s }));
  const a = { ...next[f] };
  const b = { ...next[t] };
  next[t] = { ...a, slotIndex: t };
  next[f] = { ...b, slotIndex: f };
  return next;
}
function removeSlot(draft, slotIndex) {
  const idx = num(slotIndex, -1);
  if (idx < 0 || idx >= draft.length) return draft.slice();
  const next = draft.map((s) => ({ ...s }));
  next[idx] = emptySlot(idx);
  return next;
}
function unassignedActions(quickActions, draft) {
  const placed = new Set(
    (Array.isArray(draft) ? draft : []).map((s) => s?.characterActionId).filter(Boolean)
  );
  return (Array.isArray(quickActions) ? quickActions : []).filter(
    (a) => a?.characterActionId && !placed.has(a.characterActionId)
  );
}
function draftToSavePayload(draft) {
  return (Array.isArray(draft) ? draft : []).map((s) => {
    const idx = num(s?.slotIndex, 0);
    const actionId = s?.missing ? null : str(s?.characterActionId);
    return { slotIndex: idx, characterActionId: actionId };
  }).sort((a, b) => a.slotIndex - b.slotIndex);
}
function rowOfSlot(slotIndex, firstRowSize = FIRST_ROW_SIZE) {
  const idx = num(slotIndex, 0);
  const size = Math.max(1, num(firstRowSize, FIRST_ROW_SIZE));
  return Math.floor(idx / size);
}
function isDraftDirty(draft, originalDraft) {
  const a = draftToSavePayload(draft);
  const b = draftToSavePayload(originalDraft);
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].slotIndex !== b[i].slotIndex) return true;
    if (a[i].characterActionId !== b[i].characterActionId) return true;
  }
  return false;
}

// hud/abilities/AbilityTooltip.js
var TYPE_LABEL = {
  attack_technique: "Attack technique",
  directed: "Directed action",
  instant: "Instant action",
  toggle: "Toggle"
};
var TARGET_LABEL = {
  self: "Self",
  character: "One character",
  character_body_zone: "One character (body zone)",
  body_part: "One character (body zone)",
  multiple_characters: "Multiple characters",
  point: "Point on map",
  area: "Area",
  none: "No target"
};
function costText(costs) {
  const c = costs ?? {};
  const parts = [];
  if (Number(c.main) > 0) parts.push(`MAIN\xD7${c.main}`);
  if (Number(c.move) > 0) parts.push(`MOVE\xD7${c.move}`);
  if (parts.length === 0) parts.push("No action cost");
  return parts.join(" \xB7 ");
}
function resourceText(costs) {
  const c = costs ?? {};
  const parts = [];
  if (Number(c.psi) > 0) parts.push(`PSI ${c.psi}`);
  if (Number(c.charges) > 0) parts.push(`Charges ${c.charges}`);
  return parts.join(" \xB7 ");
}
function abilityTooltipModel(action) {
  const a = action && typeof action === "object" ? action : {};
  const costs = a.costs ?? {};
  const cooldown = a.cooldown ?? {};
  const targeting = a.targeting ?? {};
  const requirements = a.requirements ?? {};
  const state = a.state ?? {};
  const lines = [];
  const typeLabel = TYPE_LABEL[a.type] ?? "Action";
  lines.push({ label: "Type", value: typeLabel });
  if (a.fullDescription) lines.push({ label: "Description", value: String(a.fullDescription) });
  lines.push({ label: "Cost", value: costText(costs) });
  const res = resourceText(costs);
  if (res) lines.push({ label: "Resource", value: res });
  if (Number(cooldown.max) > 0) {
    const cur = Number(cooldown.current) || 0;
    lines.push({
      label: "Cooldown",
      value: cur > 0 ? `${cur}/${cooldown.max} ${cooldown.unit ?? "turn"}(s) remaining` : `${cooldown.max} ${cooldown.unit ?? "turn"}(s)`
    });
  }
  lines.push({ label: "Target", value: TARGET_LABEL[targeting.mode] ?? String(targeting.mode ?? "\u2014") });
  const reqParts = [];
  if (requirements.weaponClass) reqParts.push(`Weapon: ${requirements.weaponClass}`);
  if (requirements.conditionSummary) reqParts.push(String(requirements.conditionSummary));
  if (reqParts.length) lines.push({ label: "Requires", value: reqParts.join(" \xB7 ") });
  if (state.available === false && state.disabledReason) {
    lines.push({ label: "Unavailable", value: String(state.disabledReason) });
  } else if (state.active === true) {
    lines.push({ label: "Status", value: "Active" });
  }
  return { title: String(a.name ?? "Action"), type: typeLabel, lines };
}
function abilityTooltipLines(action) {
  const model = abilityTooltipModel(action);
  return model.lines.map((l) => `${l.label}: ${l.value}`);
}

// hud/abilities/QuickbarView.js
var SEMANTIC_ACCENT = {
  attack: "attack",
  psi: "psionic",
  tech: "implant",
  utility: "neutral",
  intervention: "intervention"
};
var TYPE_MARK = {
  attack_technique: "ATK",
  directed: "DIR",
  instant: "INS",
  toggle: "TGL"
};
function actionById(runtime, id) {
  if (!id) return null;
  return (runtime.quickActions ?? []).find((a) => a.characterActionId === id) ?? null;
}
function occupiedTile(slot, action) {
  if (!action) {
    return `<button type="button" class="${cls("ohud-qb-slot", "is-missing")}" data-action="show-ability-detail" data-slot-index="${slot.slotIndex}" ${tipAttr("Missing action", ["This action is no longer available.", "Open EDIT to remove it."])}>
      <span class="ohud-qb-missing">?</span>
    </button>`;
  }
  const accent = SEMANTIC_ACCENT[action.semanticKind] ?? "neutral";
  const disabled = action.state?.available === false;
  const active = action.state?.active === true;
  const cd = Number(action.cooldown?.current) || 0;
  const mark = TYPE_MARK[action.type] ?? "";
  const tip = tipAttr(action.name, abilityTooltipLines(action));
  return `<button type="button" class="${cls("ohud-qb-slot", `ohud-accent--${accent}`, disabled ? "is-disabled" : "", active ? "is-active" : "")}" data-action="show-ability-detail" data-action-id="${esc(action.characterActionId)}" data-slot-index="${slot.slotIndex}"${tip}>
    <span class="ohud-qb-icon">${skillIconSvg(action.iconKey)}</span>
    <span class="ohud-qb-name">${esc(action.name)}</span>
    ${mark ? `<span class="ohud-qb-type">${esc(mark)}</span>` : ""}
    ${cd > 0 ? `<span class="ohud-qb-cd">${cd}</span>` : ""}
    ${active ? `<span class="ohud-qb-active">ON</span>` : ""}
  </button>`;
}
function emptyTile(slotIndex) {
  return `<div class="${cls("ohud-qb-slot", "is-empty")}" data-slot-index="${slotIndex}" aria-hidden="true"></div>`;
}
function renderQuickbarStrip(runtime, opts = {}) {
  const rt = runtime && typeof runtime === "object" ? runtime : { quickActions: [], quickbar: { slots: [], maxSlots: FIRST_ROW_SIZE } };
  const slots = Array.isArray(rt.quickbar?.slots) ? rt.quickbar.slots : [];
  const canEdit = opts.canEdit !== false;
  const rows = /* @__PURE__ */ new Map();
  for (const slot of slots) {
    const r = rowOfSlot(slot.slotIndex);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(slot);
  }
  const rowKeys = [...rows.keys()].sort((a, b) => b - a);
  const rowsHtml = rowKeys.map((r) => {
    const tiles = rows.get(r).sort((a, b) => a.slotIndex - b.slotIndex).map((slot) => {
      if (slot.empty || slot.characterActionId == null) return emptyTile(slot.slotIndex);
      return occupiedTile(slot, actionById(rt, slot.characterActionId));
    }).join("");
    return `<div class="ohud-qb-row" data-row="${r}">${tiles}</div>`;
  }).join("");
  const editBtn = canEdit ? `<button type="button" class="ohud-qb-edit" data-action="open-quickbar-editor" ${tipAttr("Edit quickbar", ["Assign, reorder or remove actions."])}>EDIT</button>` : "";
  const body = slots.length ? `<div class="ohud-qb">${rowsHtml}</div>` : `<div class="ohud-qb ohud-qb--empty"><div class="ohud-muted-fill">No quickbar actions</div></div>`;
  return `<div class="ohud-qb-wrap">${body}${editBtn}</div>`;
}

// hud/components/SkillBlock.js
var COST_ABBR = { FREE: "F", MOVE: "Mv", MAIN: "M", TURN: "T" };
var CATEGORY_ORDER = [
  { key: "attack", caption: "Attack" },
  { key: "neutral", caption: "Shield" },
  { key: "psionic", caption: "Psy" },
  { key: "implant", caption: "Tech" },
  { key: "positive", caption: "Aid" },
  { key: "intervention", caption: "Boon" }
];
function skillTile(skill2, selectedId) {
  const accent = accentClass(skill2.color);
  const disabled = Boolean(skill2.disabledReason);
  const selected = skill2.id === selectedId;
  const cost = COST_ABBR[skill2.actionCost] ?? "";
  const cd = Number(skill2.cooldownTurns) || 0;
  const res = skill2.resourceCost ? `${skill2.resourceCost.amount}${String(skill2.resourceCost.type).charAt(0).toUpperCase()}` : "";
  const tip = tipAttr(skill2.name, [
    `Source: ${skill2.source}`,
    `Cost: ${skill2.actionCost}${res ? ` \xB7 ${res}` : ""}`,
    cd > 0 ? `Cooldown: ${cd} turn(s)` : "",
    skill2.isToggled ? "Active (toggled on)" : "",
    skill2.disabledReason ? `Disabled: ${skill2.disabledReason}` : skill2.tooltip || ""
  ]);
  return `<button type="button" class="${cls("ohud-slot", `ohud-accent--${accent}`, disabled ? "is-disabled" : "", selected ? "is-selected" : "", skill2.isToggled ? "is-toggled" : "")}" data-action="prepare-skill" data-skill-id="${esc(skill2.id)}" ${disabled ? "disabled" : ""}${tip}>
    <span class="ohud-slot-icon">${skillIconSvg(skill2.icon)}</span>
    ${cost ? `<span class="ohud-slot-cost">${esc(cost)}</span>` : ""}
    ${res ? `<span class="ohud-slot-res">${esc(res)}</span>` : ""}
    ${cd > 0 ? `<span class="ohud-slot-cd">${cd}</span>` : ""}
    ${skill2.isToggled ? `<span class="ohud-slot-toggle" aria-hidden="true"></span>` : ""}
  </button>`;
}
function renderSkillBlock(state) {
  const quickbar = state?.snapshot?.quickbar ?? null;
  if (quickbar && quickbar.ok !== false) {
    const role = String(state?.viewer?.role ?? "").toLowerCase();
    const canEdit = role === "gm" || role === "player";
    return panel({ key: "skills", bodyHtml: renderQuickbarStrip(quickbar, { canEdit }) });
  }
  const slots = selectQuickSlots(state);
  const selectedId = selectSelectedSkill(state)?.id ?? null;
  const skills = slots.map((slot) => selectSkillById(state, slot.skillId)).filter(Boolean);
  const buckets = /* @__PURE__ */ new Map();
  for (const sk of skills) {
    const k = accentClass(sk.color);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(sk);
  }
  const groupsHtml = CATEGORY_ORDER.filter((c) => buckets.has(c.key)).map((c) => `<div class="ohud-skill-group">
      <span class="ohud-group-cap ohud-accent--${c.key}">${esc(c.caption)}</span>
      <div class="ohud-group-tiles">${buckets.get(c.key).map((sk) => skillTile(sk, selectedId)).join("")}</div>
    </div>`).join("");
  const body = groupsHtml ? `<div class="ohud-skill-groups">${groupsHtml}</div>` : `<div class="ohud-muted-fill">No actions</div>`;
  return panel({ key: "skills", bodyHtml: body });
}

// hud/targeting/targetProfiles.js
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
var ZONE_TO_SVG_PART = Object.freeze({
  HEAD: "head",
  TORSO: "torso",
  LEFT_ARM: "l_arm",
  RIGHT_ARM: "r_arm",
  LEFT_LEG: "l_leg",
  RIGHT_LEG: "r_leg"
});
function zoneIdToSvgPart(zoneId) {
  return ZONE_TO_SVG_PART[String(zoneId ?? "")] ?? null;
}
var SVG_PART_TO_ZONE = Object.freeze(
  Object.fromEntries(Object.entries(ZONE_TO_SVG_PART).map(([zoneId, svgPart]) => [svgPart, zoneId]))
);

// hud/components/TargetBlock.js
function renderTargetBlock(state) {
  const tv = selectTargetView(state);
  if (!tv.hasTarget) {
    const picking = tv.isPicking;
    const body2 = `<div class="ohud-target is-empty">
      <div class="ohud-figure ohud-figure--ghost"><div class="ohud-figure-svg">${humanoidSvg({ neutral: true })}</div></div>
      <div class="ohud-target-hint">${picking ? "PICK A TARGET" : "No target selected"}</div>
      <button type="button" class="ohud-target-pick" data-action="${picking ? "cancel-target" : "pick-target"}">
        ${picking ? "Cancel" : "Pick target"}
      </button>
    </div>`;
    return panel({ key: "target", label: "Target", bodyHtml: body2 });
  }
  const distLabel = Number.isFinite(tv.distance) ? `${tv.distance} m` : "\u2014";
  const svgPart = zoneIdToSvgPart(tv.bodyPartId);
  const body = `<div class="ohud-target">
    <div class="ohud-figure ohud-figure--targetable">
      <div class="ohud-figure-svg">${humanoidSvg({ zones: tv.zonesMap, highlight: svgPart, targetable: true })}</div>
      <div class="ohud-figure-shield" aria-hidden="true"${tipAttr("Target shield", ["Defence detail hidden for non-owned entities"])}>${ICON_SHIELD}</div>
    </div>
    <div class="ohud-target-meta">
      <div class="ohud-target-name" title="${esc(tv.name)}">${esc(tv.name)}</div>
      <div class="ohud-target-sub">
        <span class="ohud-target-zone"${tipAttr("Aimed zone", ["Click a body zone on the silhouette"])}>${esc(tv.bodyPartLabel)}</span>
        <span class="ohud-target-dist"${tipAttr("Distance to target", [])}>${esc(distLabel)}</span>
      </div>
      <button type="button" class="ohud-target-clear" data-action="clear-target"${tipAttr("Clear target", [])}>Clear</button>
    </div>
  </div>`;
  return panel({ key: "target", label: "Target", bodyHtml: body });
}

// hud/components/ActionBlock.js
function titleCase(word) {
  if (!word) return "";
  return word.charAt(0) + word.slice(1).toLowerCase();
}
function renderEndTurnButton(state) {
  const session = state?.snapshot?.combatSession ?? null;
  if (!canEndTurn(session, state?.viewer?.role)) return "";
  return `<button type="button" class="ohud-action-btn ohud-endturn-btn" data-action="end-turn"
    ${tipAttr("End turn", ["Unspent MAIN/MOVE are lost"])}>END TURN</button>`;
}
function renderBasicAttackButton(state) {
  const ba = state?.ui?.basicAttack ?? { inFlight: false, uiAllowed: false, uiBlockReason: "No character loaded." };
  const disabled = ba.inFlight || !ba.uiAllowed;
  const tip = disabled ? tipAttr("Action unavailable", [esc(ba.uiBlockReason || (ba.inFlight ? "Attack is resolving." : "Not available"))]) : tipAttr("Attack", ["Costs: MAIN"]);
  return `<div class="ohud-action">
    <span class="ohud-action-econ">
      <span class="ohud-econ-pip is-spend">M</span>
      <span class="ohud-econ-pip">Mv</span>
    </span>
    <button type="button" class="${cls("ohud-action-btn", disabled ? "is-disabled" : "is-ready")}"
      data-action="basic-attack"${disabled ? ' aria-disabled="true"' : ""}${tip}>Attack</button>
    ${renderEndTurnButton(state)}
  </div>`;
}
function renderActionButton(state) {
  if (!selectSelectedSkill(state)) return renderBasicAttackButton(state);
  const label = titleCase(selectActionLabel(state));
  const can = selectCanAct(state);
  const reason = selectDisabledReason(state);
  const disabled = !can || Boolean(reason);
  const cost = selectCurrentActionCost(state);
  const displayLabel = reason === "Select a target." ? "Select target" : label;
  const tip = disabled ? tipAttr("Action unavailable", [esc(reason || "Not available")]) : tipAttr(label, [`Costs: ${cost}`, "Resolution arrives in a later phase"]);
  return `<div class="ohud-action">
    <span class="ohud-action-econ">
      <span class="${cls("ohud-econ-pip", cost === "MAIN" ? "is-spend" : "")}">M</span>
      <span class="${cls("ohud-econ-pip", cost === "MOVE" ? "is-spend" : "")}">Mv</span>
    </span>
    <button type="button" class="${cls("ohud-action-btn", disabled ? "is-disabled" : "is-ready")}"
      data-action="primary"${disabled ? ' aria-disabled="true"' : ""}${tip}>${esc(displayLabel)}</button>
    ${renderEndTurnButton(state)}
  </div>`;
}

// hud/components/ModifierBlock.js
var MAX_CHIPS = 4;
function chipAccent(mod) {
  if (mod.source === "intervention") return "intervention";
  if (mod.kind === "narrative" || mod.requiresGMApproval) return "narrative";
  if (mod.polarity === "negative") return "negative";
  if (mod.polarity === "positive") return "positive";
  return "neutral";
}
function modChip(mod) {
  const accent = chipAccent(mod);
  const sign = mod.value > 0 ? `+${mod.value}` : mod.value < 0 ? `${mod.value}` : "";
  const tip = tipAttr(mod.name, [
    mod.description || "",
    sign ? `Value: ${sign}` : "",
    `Source: ${mod.source}`,
    mod.alwaysActive ? "Always active (passive)" : "",
    mod.requiresGMApproval ? "Requires GM approval" : ""
  ]);
  return `<span class="${cls("ohud-mod", `ohud-mod--${accent}`, mod.selected ? "is-selected" : "", mod.alwaysActive ? "is-passive" : "")}"${tip}>
    <span class="ohud-mod-name">${esc(mod.name)}</span>${sign ? `<span class="ohud-mod-val">${esc(sign)}</span>` : ""}
  </span>`;
}
function renderModifierChips(state, limit = MAX_CHIPS) {
  const all = selectModifierChips(state);
  const shown = all.slice(0, limit);
  let html = shown.map(modChip).join("");
  if (all.length > shown.length) {
    const hidden = all.slice(limit);
    const tip = tipAttr(`${hidden.length} more`, hidden.map((m) => m.name));
    html += `<span class="ohud-mod ohud-mod--more"${tip}>+${hidden.length}</span>`;
  }
  return `<div class="ohud-mods">${html}</div>`;
}

// hud/components/CombatControlBlock.js
var COMBAT_CONTROL_MAX_CHIPS = 6;
function renderCombatControlBlock(state) {
  const combatButton = state?.viewer?.role === "gm" ? `<button type="button" class="ohud-cc-combat-btn" data-action="toggle-gm-tracker" title="GM Combat Tracker">COMBAT</button>` : "";
  return `<section class="ohud-panel ohud-panel--cc" data-block="combatControl">
    <div class="ohud-cc">
      <div class="ohud-cc-target">${renderTargetBlock(state)}</div>
      <div class="ohud-cc-right">
        <section class="ohud-panel ohud-panel--modifiers ohud-cc-mod" data-block="modifiers">
          <div class="ohud-panel-head"><span class="ohud-panel-label">Mod</span>${combatButton}</div>
          ${renderModifierChips(state, COMBAT_CONTROL_MAX_CHIPS)}
        </section>
        <section class="ohud-panel ohud-panel--action ohud-panel--bare ohud-cc-action" data-block="action">
          ${renderActionButton(state)}
        </section>
      </div>
    </div>
  </section>`;
}

// hud/components/BattleLogBlock.js
function deltaClass(delta) {
  const d = String(delta || "").toLowerCase();
  if (!d) return "neutral";
  if (d.includes("miss")) return "miss";
  return "hit";
}
function entryRow(e) {
  if (Array.isArray(e.details)) {
    const accent = e.outcome === "failure" ? "miss" : "hit";
    return `<li class="ohud-log-row ohud-log-row--result">
      <div class="ohud-log-result-title ohud-log-delta--${accent}">${esc(e.title)}</div>
      ${e.details.map((d) => `<div class="ohud-log-result-detail">${esc(d)}</div>`).join("")}
    </li>`;
  }
  if (e.kind === "system") {
    return `<li class="ohud-log-row ohud-log-row--system">\u25B8 ${esc(e.action || e.summary)}</li>`;
  }
  if (e.kind === "narrative") {
    return `<li class="ohud-log-row ohud-log-row--narr">${esc(e.actor ? `${e.actor}: ` : "")}${esc(e.action || e.summary)}</li>`;
  }
  return `<li class="ohud-log-row">
    <span class="ohud-log-actor">${esc(e.actor)}</span>
    <span class="ohud-log-act">${esc(e.action)}</span>
    ${e.target ? `<span class="ohud-log-arrow">\u203A</span><span class="ohud-log-target">${esc(e.target)}</span>` : ""}
    ${e.delta ? `<span class="ohud-log-delta ohud-log-delta--${deltaClass(e.delta)}">${esc(e.delta)}</span>` : ""}
  </li>`;
}
function selectRecentLogEntries(state) {
  const raw = state?.snapshot?.battleLog?.entries ?? [];
  if (raw.length && Array.isArray(raw[0]?.details)) return raw.slice(0, 5);
  return selectCompactBattleLog(state);
}
function renderBattleLogPanel(state) {
  const entries = selectRecentLogEntries(state);
  const list = entries.length ? `<ul class="ohud-log-list">${entries.map(entryRow).join("")}</ul>` : `<div class="ohud-log-empty">No combat log yet.</div>`;
  return `<section class="ohud-panel ohud-log-panel" data-block="log">
    <div class="ohud-panel-head">
      <span class="ohud-panel-label">Battle Log</span>
      <button type="button" class="ohud-icon-btn" data-action="toggle-log" aria-label="Close log">${ICON_CARET_DOWN}</button>
    </div>
    ${list}
  </section>`;
}

// hud/components/WeaponSelectorPanel.js
function weaponOption(option) {
  const ammoLabel = option.ammoLabel || "\u2014";
  return `<button type="button" class="${cls("ohud-weapon-option", option.selected ? "is-selected" : "")}"
    data-action="select-weapon" data-weapon-id="${esc(option.id)}" title="${esc(option.name)}">
    <span class="ohud-weapon-option-name">${esc(option.name)}</span>
    ${option.type ? `<span class="ohud-weapon-option-type">${esc(option.type)}</span>` : ""}
    <span class="ohud-weapon-option-ammo">${esc(ammoLabel)}</span>
  </button>`;
}
function renderWeaponSelectorPanel(state) {
  if (!state || !state.snapshot || !state.snapshot.weapon) {
    return panel({
      key: "gun-weapon-selector",
      label: "Weapons",
      bodyHtml: `<div class="ohud-weapon-list is-loading">Loading weapons\u2026</div>`
    });
  }
  const availableWeapons = Array.isArray(state.snapshot.weapon.available) ? state.snapshot.weapon.available : [];
  if (!availableWeapons.length) {
    return panel({
      key: "gun-weapon-selector",
      label: "Weapons",
      bodyHtml: `<div class="ohud-weapon-list is-empty">No weapons available</div>`
    });
  }
  const body = `<div class="ohud-weapon-list">${availableWeapons.map(weaponOption).join("")}</div>`;
  return panel({ key: "gun-weapon-selector", label: "Weapons", bodyHtml: body });
}

// hud/components/MagazineSelectorPanel.js
function reserveLabel(mag) {
  return mag.ammoType || mag.caliberLabel || mag.description || "Magazine";
}
function reserveOption(mag, selected) {
  const label = reserveLabel(mag);
  const rounds = `${Number(mag.current ?? 0)}/${Number(mag.max ?? 0)}`;
  return `<button type="button" class="${cls("ohud-reserve-mag", selected ? "is-selected" : "")}"
    data-action="select-reload-mag" data-magazine-id="${esc(mag.id)}" title="${esc(label)} \u2014 ${esc(rounds)}">
    <span class="ohud-reserve-mag-label">${esc(label)}</span>
    <span class="ohud-reserve-mag-rounds">${esc(rounds)}</span>
  </button>`;
}
function renderMagazineSelectorPanel(state) {
  if (!state || !state.snapshot || !state.snapshot.weapon) {
    return panel({
      key: "gun-magazine-selector",
      label: "Spare Magazines",
      bodyHtml: `<div class="ohud-reserve-list is-loading">Loading magazines\u2026</div>`
    });
  }
  const reserve = selectVisibleReserveMagazines(state);
  if (!reserve.length) {
    return panel({
      key: "gun-magazine-selector",
      label: "Spare Magazines",
      bodyHtml: `<div class="ohud-reserve-list is-empty">No compatible spare magazines</div>`
    });
  }
  const selectedId = state?.ui?.selectedReloadMagazineId ?? null;
  const body = `<div class="ohud-reserve-list">${reserve.map((mag) => reserveOption(mag, mag.id === selectedId)).join("")}</div>`;
  return panel({ key: "gun-magazine-selector", label: "Spare Magazines", bodyHtml: body });
}

// hud/components/FireModeSelectorPanel.js
function fireModeOption(mode, selected) {
  const code = mode.code ? mode.code.toUpperCase() : "\u2014";
  return `<button type="button" class="${cls("ohud-firemode-option", selected ? "is-selected" : "")}"
    data-action="select-fire-mode" data-fire-mode-id="${esc(mode.id)}" title="${esc(mode.name)} \u2014 ${esc(code)}">
    <span class="ohud-firemode-option-name">${esc(mode.name)}</span>
    <span class="ohud-firemode-option-code">${esc(code)}</span>
  </button>`;
}
function renderFireModeSelectorPanel(state) {
  if (!state || !state.snapshot || !state.snapshot.weapon) {
    return panel({
      key: "gun-fire-mode-selector",
      label: "Fire Mode",
      bodyHtml: `<div class="ohud-firemode-list is-loading">Loading fire modes\u2026</div>`
    });
  }
  const weapon = state.snapshot.weapon.primary ?? null;
  const fireMode = weapon?.fireMode ?? null;
  const available = Array.isArray(fireMode?.available) ? fireMode.available : [];
  if (!available.length) {
    return panel({
      key: "gun-fire-mode-selector",
      label: "Fire Mode",
      bodyHtml: `<div class="ohud-firemode-list is-empty">No fire modes available</div>`
    });
  }
  const selectedId = fireMode?.selectedId ?? null;
  const body = `<div class="ohud-firemode-list">${available.map((m) => fireModeOption(m, m.id === selectedId)).join("")}</div>`;
  return panel({ key: "gun-fire-mode-selector", label: "Fire Mode", bodyHtml: body });
}

// hud/components/EmptyHudState.js
function renderEmptyState(state) {
  const { title, hint } = buildEmptyStateModel(state);
  return `<div class="ohud-empty">
    <span class="ohud-empty-mark" aria-hidden="true">${ICON_MARK}</span>
    <div class="ohud-empty-title">${esc(title)}</div>
    <div class="ohud-empty-hint">${esc(hint)}</div>
  </div>`;
}
function renderErrorState(state) {
  const msg = state?.error?.message || "Something went wrong.";
  return `<div class="ohud-empty ohud-empty--error">
    <div class="ohud-empty-title">HUD ERROR</div>
    <div class="ohud-empty-hint">${esc(msg)}</div>
  </div>`;
}
function renderLoadingState() {
  return `<div class="ohud-empty ohud-empty--loading">
    <div class="ohud-empty-title">LOADING\u2026</div>
  </div>`;
}

// hud/targeting/bodyConditionPolicy.js
var BODY_CONDITION_STATE = Object.freeze({
  healthy: "healthy",
  minor: "minor",
  serious: "serious",
  critical: "critical",
  disabled: "disabled",
  // Combat data for this body part is missing, not yet fetched, or the fetch
  // was denied (target refresh blocked by RLS/access) — NEVER "healthy".
  unknown: "unknown"
});
var TO_ZONE_STATE = Object.freeze({
  healthy: "healthy",
  minor: "wounded",
  serious: "serious",
  critical: "critical",
  disabled: "disabled",
  unknown: "unknown"
});
var COLOR_TOKEN = Object.freeze({
  healthy: "--odyssey-hud-zone-healthy",
  minor: "--odyssey-hud-zone-wounded",
  serious: "--odyssey-hud-zone-serious",
  critical: "--odyssey-hud-zone-critical",
  disabled: "--odyssey-hud-zone-disabled",
  unknown: "--odyssey-hud-zone-unknown"
});
var LABEL = Object.freeze({
  healthy: "Healthy",
  minor: "Minor damage",
  serious: "Serious damage",
  critical: "Critical damage",
  disabled: "Disabled",
  unknown: "Unknown"
});

// hud/runtime/runtimeBundleMapper.js
var ZONE_LABELS = Object.freeze({
  head: "Head",
  torso: "Torso",
  l_arm: "Left Arm",
  r_arm: "Right Arm",
  l_leg: "Left Leg",
  r_leg: "Right Leg"
});
var VALID_SKILL_TYPES = new Set(Object.values(SKILL_TYPES));
var VALID_SKILL_SOURCES = new Set(Object.values(SKILL_SOURCES));
var VALID_COLORS = new Set(Object.values(COLOR_SEMANTICS));
var VALID_TARGETING = new Set(Object.values(TARGETING_MODES));
var VALID_COSTS = new Set(Object.values(ACTION_COSTS));

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
var ALLOWED = Object.freeze({ uiAllowed: true, uiBlockReason: null });

// screens/resolveAttack/resolveAttackService.js
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
function normalizeSelectionPayload(raw) {
  if (!raw || typeof raw !== "object" || !raw.status) return null;
  return {
    status: String(raw.status),
    selectedItemId: raw.selectedItemId ?? null,
    characterId: raw.characterId ?? null,
    viewer: { playerId: raw.viewer?.playerId ?? null, role: raw.viewer?.role ?? "UNKNOWN" },
    access: { canView: !!raw.access?.canView, reason: raw.access?.reason ?? null },
    view: raw.view ?? null,
    // Phase 3A.1: normalized HUD snapshot (block renderers use this).
    hudSnapshot: raw.hudSnapshot ?? null,
    ui: raw.ui ?? null,
    debug: raw.debug ?? null,
    error: { code: raw.error?.code ?? null, message: raw.error?.message ?? null }
  };
}

// hud/scene/selectionView.js
var LIVE_RENDERERS = {
  player: renderPlayerBlock,
  gun: renderGunBlock,
  skills: renderSkillBlock,
  combatControl: renderCombatControlBlock,
  log: renderBattleLogPanel
};
var PLAYER_PROMPTS = Object.freeze({
  [SELECTION_STATUS.noSelection]: { t: "SELECT YOUR CHARACTER", h: "Choose a controlled token on the map" },
  [SELECTION_STATUS.multipleSelection]: { t: "SELECT ONE CHARACTER", h: "Multiple tokens selected" },
  [SELECTION_STATUS.unlinkedToken]: { t: "NO CHARACTER LINK", h: "This token is not linked to an Odyssey character" },
  [SELECTION_STATUS.notOwned]: { t: "CHARACTER NOT AVAILABLE", h: "Select one of your controlled characters" },
  [SELECTION_STATUS.unavailable]: { t: "CHARACTER DATA UNAVAILABLE", h: "Try selecting the token again" },
  [SELECTION_STATUS.error]: { t: "CHARACTER DATA UNAVAILABLE", h: "Try selecting the token again" }
});
function promptCard(title, hint, devDetail) {
  return `<div class="ohud-state-wrap"><div class="ohud-empty">
    <span class="ohud-empty-mark" aria-hidden="true">${ICON_MARK}</span>
    <div class="ohud-empty-title">${esc(title)}</div>
    <div class="ohud-empty-hint">${esc(hint)}</div>${devDetail || ""}
  </div></div>`;
}
function loadingCard() {
  return `<div class="ohud-state-wrap"><div class="ohud-empty ohud-empty--loading">
    <div class="ohud-empty-title">LOADING\u2026</div>
  </div></div>`;
}
function readyPlayerCard(view) {
  const v = view || {};
  const badge = v.gmView ? `<span class="ohud-bind-badge ohud-bind-badge--gm">GM VIEW</span>` : `<span class="ohud-bind-badge ohud-bind-badge--owned">CONTROLLED</span>`;
  const fallbackStatus = `${v.isAlive === false ? "Down" : "Alive"} \xB7 ${v.isConscious === false ? "Unconscious" : "Conscious"}`;
  const statusLine = v.statusSummary ? esc(v.statusSummary) : esc(fallbackStatus);
  const owner = v.ownerName ? `<div class="ohud-bind-owner">Owner: ${esc(v.ownerName)}</div>` : "";
  return `<div class="ohud-bind">
    ${badge}
    <div class="ohud-bind-name" title="${esc(v.name || "")}">${esc(v.name || "Unnamed character")}</div>
    <div class="ohud-bind-status">${statusLine}</div>
    ${owner}
  </div>`;
}
function readyFallbackCard(moduleId) {
  const LABEL2 = { gun: "Gun", skills: "Skills", combatControl: "Combat Control", log: "Log" };
  const label = LABEL2[moduleId] || moduleId;
  return `<section class="ohud-panel" data-block="${esc(moduleId)}">
    <div class="ohud-bind-fallback">
      <div class="ohud-bind-fallback-label">${esc(label)}</div>
      <div class="ohud-bind-fallback-hint">Data loading\u2026</div>
    </div>
  </section>`;
}
function debugReason(payload, opts) {
  if (!opts?.dev || !payload?.debug?.reason) return "";
  return `<div class="ohud-bind-dev">HUD DEBUG: ${esc(payload.debug.reason)}</div>`;
}
function mutedCard(moduleId) {
  return `<section class="ohud-panel ohud-panel--muted" data-block="${esc(moduleId)}"><div class="ohud-muted-fill">\u2014</div></section>`;
}
function buildSyntheticState(payload) {
  const snap = payload.hudSnapshot;
  const role = String(payload.viewer?.role ?? "UNKNOWN").toLowerCase();
  const prepared = payload.ui?.preparedAction ?? null;
  const selectedAbilityId = prepared?.kind === "skill" ? prepared.id : null;
  const targeting = payload.ui?.targeting ?? {};
  return {
    status: "ready",
    source: "supabase",
    viewer: {
      playerId: payload.viewer?.playerId ?? null,
      playerName: null,
      role: role === "gm" ? "gm" : "player"
    },
    selectedTokenId: payload.selectedItemId ?? null,
    selectedCharacterId: payload.characterId ?? null,
    access: { canViewSelectedCharacter: true, reason: null },
    // Phase 3E.0: when hudSnapshot is present it already carries the live
    // server-mapped combatSession (see selectionState.buildBroadcastPayload).
    snapshot: snap ?? {
      entity: null,
      weapon: { primary: null, secondary: null },
      skills: { library: [], quickSlots: [] },
      combatSession: createInactiveCombatSession(),
      modifiers: { passive: [], active: [], narrative: [] },
      battleLog: { entries: [] }
    },
    ui: {
      isHudCollapsed: false,
      selectedTechniqueId: null,
      selectedAbilityId,
      selectedReloadMagazineId: payload.ui?.selectedReloadMagazineId ?? null,
      selectedModifierIds: [],
      weaponSelectorOpen: !!payload.ui?.weaponSelectorOpen,
      fireModeSelectorOpen: !!payload.ui?.fireModeSelectorOpen,
      activeIntent: payload.ui?.activeIntent ?? { kind: "weapon-attack", weaponId: null },
      basicAttack: payload.ui?.basicAttack ?? { inFlight: false, uiAllowed: false, uiBlockReason: "No character loaded." },
      targeting: {
        mode: targeting.mode ?? "none",
        selectedTargetIds: Array.isArray(targeting.selectedTargetIds) ? targeting.selectedTargetIds : [],
        selectedTargetName: targeting.selectedTargetName ?? null,
        selectedBodyPartId: targeting.selectedBodyPartId ?? "torso",
        distance: Number.isFinite(Number(targeting.distance)) ? Number(targeting.distance) : null,
        zonesMap: targeting.zonesMap && typeof targeting.zonesMap === "object" ? targeting.zonesMap : {},
        error: targeting.error ?? null,
        selectedPoint: null,
        radius: null
      },
      isBattleLogExpanded: false
    },
    error: null
  };
}
function renderSelectionModule(moduleId, payload, opts = {}) {
  const status2 = payload?.status;
  const isReady = status2 === SELECTION_STATUS.ready && payload?.access?.canView;
  if (moduleId === PRIMARY_MODULE_ID) {
    if (isReady) {
      if (payload.hudSnapshot) {
        const syntheticState = buildSyntheticState(payload);
        return `${renderPlayerBlock(syntheticState)}${debugReason(payload, opts)}`;
      }
      if (payload.view) return `${readyPlayerCard(payload.view)}${debugReason(payload, opts)}`;
    }
    if (status2 === SELECTION_STATUS.loading || !status2) return loadingCard();
    const p = PLAYER_PROMPTS[status2] || PLAYER_PROMPTS[SELECTION_STATUS.noSelection];
    const devDetail = opts.dev && payload?.error?.message ? `<div class="ohud-bind-dev">${esc(payload.error.code || "")}: ${esc(payload.error.message)}</div>` : "";
    return promptCard(p.t, p.h, devDetail);
  }
  if (isReady) {
    if (payload.hudSnapshot) {
      const fn = LIVE_RENDERERS[moduleId];
      if (fn) {
        const syntheticState = buildSyntheticState(payload);
        return fn(syntheticState);
      }
    }
    return readyFallbackCard(moduleId);
  }
  return mutedCard(moduleId);
}
function buildCompanionSelectorState(rawPayload) {
  const payload = normalizeSelectionPayload(rawPayload);
  if (!payload) return null;
  const isReady = payload.status === SELECTION_STATUS.ready && payload.access?.canView;
  if (!isReady || !payload.hudSnapshot) return null;
  return buildSyntheticState(payload);
}

// hud/components/Tooltip.js
var MARGIN = 8;
function createTooltip(host) {
  const el = document.createElement("div");
  el.className = "ohud-tooltip";
  el.setAttribute("role", "tooltip");
  el.hidden = true;
  ((host.ownerDocument || document).body || host).appendChild(el);
  let visible = false;
  function show(target) {
    const title = target.getAttribute("data-tip-title");
    if (!title) return;
    const lines = (target.getAttribute("data-tip-lines") || "").split(TIP_SEP).filter(Boolean);
    el.innerHTML = `<div class="ohud-tooltip-title">${title}</div>` + lines.map((l) => `<div class="ohud-tooltip-line">${l}</div>`).join("");
    el.hidden = false;
    visible = true;
  }
  function hide() {
    if (!visible) return;
    el.hidden = true;
    visible = false;
  }
  function place(x, y) {
    if (!visible) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = el.getBoundingClientRect();
    let left = x + 14;
    let top = y - rect.height - 12;
    if (top < MARGIN) top = y + 18;
    left = Math.max(MARGIN, Math.min(left, vw - rect.width - MARGIN));
    top = Math.max(MARGIN, Math.min(top, vh - rect.height - MARGIN));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }
  function onOver(e) {
    const target = e.target.closest("[data-tip-title]");
    if (!target || !host.contains(target)) return;
    show(target);
    place(e.clientX, e.clientY);
  }
  function onMove(e) {
    if (!visible) return;
    if (!e.target.closest("[data-tip-title]")) {
      hide();
      return;
    }
    place(e.clientX, e.clientY);
  }
  function onOut(e) {
    const to = e.relatedTarget;
    if (to && to.closest && to.closest("[data-tip-title]")) return;
    hide();
  }
  host.addEventListener("mouseover", onOver);
  host.addEventListener("mousemove", onMove);
  host.addEventListener("mouseout", onOut);
  return {
    hide,
    destroy() {
      host.removeEventListener("mouseover", onOver);
      host.removeEventListener("mousemove", onMove);
      host.removeEventListener("mouseout", onOut);
      el.remove();
    }
  };
}

// hud/components/CombatHudModule.js
var DEV = (() => {
  try {
    return /[?&](debug|dev)=1/.test(location.search);
  } catch {
    return false;
  }
})();
var BLOCK_RENDERERS = {
  player: renderPlayerBlock,
  gun: renderGunBlock,
  skills: renderSkillBlock,
  combatControl: renderCombatControlBlock,
  log: renderBattleLogPanel,
  "gun-weapon-selector": renderWeaponSelectorPanel,
  "gun-magazine-selector": renderMagazineSelectorPanel,
  "gun-fire-mode-selector": renderFireModeSelectorPanel
};
function mountCombatHudModule(options) {
  const { root, moduleId } = options;
  const integration = options.integration ?? {};
  const restored = normalizeHudUiState(options.uiState);
  const adapter = createMockCombatHudAdapter({ scenarioId: restored.mockScenarioId });
  adapter.setViewerRole(restored.viewerRole);
  if (restored.selectedTokenId) adapter.selectToken(restored.selectedTokenId);
  const store = createCombatHudStore({ adapter });
  store.initialize();
  let liveSelection = null;
  const el = document.createElement("div");
  el.className = cls("odyssey-hud", "ohud-module");
  el.setAttribute("data-module", moduleId);
  root.appendChild(el);
  const tooltip = createTooltip(el);
  let toastTimer = null;
  function controlsHtml() {
    if (moduleId !== "player") return "";
    return `<div class="ohud-module-controls">
      <button type="button" class="ohud-icon-btn" data-action="arrange" data-tip-title="Arrange HUD" data-tip-lines="Drag modules to reposition the HUD">${ICON_GRID}</button>
      <button type="button" class="ohud-icon-btn" data-action="collapse" aria-label="Collapse HUD" data-tip-title="Collapse HUD">${ICON_CARET_DOWN}</button>
    </div>`;
  }
  function moduleErrorCard(err) {
    const detail = DEV ? `<div class="ohud-moderr-detail">${esc(String(err && err.stack || err && err.message || err))}</div>` : "";
    return `<section class="ohud-panel ohud-moderr" data-block="${esc(moduleId)}">
      <div class="ohud-moderr-title">\u26A0 ${esc(moduleId)}</div>${detail}</section>`;
  }
  function bodyHtml(state) {
    try {
      if (liveSelection) return renderSelectionModule(moduleId, liveSelection, { dev: DEV });
      if (!state) throw new Error("no snapshot");
      const mode = resolveBodyMode(state);
      if (mode === "ready") {
        const fn = BLOCK_RENDERERS[moduleId];
        if (!fn) throw new Error(`unknown module "${moduleId}"`);
        return fn(state);
      }
      if (moduleId === "player") {
        const inner = mode === "error" ? renderErrorState(state) : mode === "loading" ? renderLoadingState() : renderEmptyState(state);
        return `<div class="ohud-state-wrap">${inner}</div>`;
      }
      return `<section class="ohud-panel ohud-panel--muted" data-block="${esc(moduleId)}"><div class="ohud-muted-fill">\u2014</div></section>`;
    } catch (err) {
      console.error(`[combatHud/module:${moduleId}] render failed`, err);
      return moduleErrorCard(err);
    }
  }
  function debugBadge(state) {
    if (!DEV) return "";
    const snap = state && state.snapshot ? "snap\u2713" : "snap\u2717";
    let bodyMode = "?";
    try {
      bodyMode = state ? resolveBodyMode(state) : "no-state";
    } catch (_e) {
      bodyMode = "err";
    }
    let liveLines = "";
    if (liveSelection) {
      const ui = liveSelection.ui ?? {};
      const tgt = ui.targeting ?? {};
      const intent = ui.activeIntent ?? {};
      liveLines = [
        `char: ${esc(liveSelection.characterId ?? "\u2014")}`,
        `weapon: ${esc(ui.selectedWeaponId ?? "\u2014")}`,
        `intent: ${esc(intent.kind ?? "\u2014")}${intent.kind === "skill" ? ` ${esc(intent.id ?? "")}` : ""}`,
        `tgt.mode: ${esc(tgt.mode ?? "none")}`,
        `tgt.zone: ${esc(tgt.selectedBodyPartId ?? "\u2014")}`,
        `tgt.ids: ${esc(JSON.stringify(tgt.selectedTargetIds ?? []))}`
      ].map((l) => `<div>${l}</div>`).join("");
    }
    return `<div class="ohud-module-debug">${esc(moduleId)} \xB7 mount\u2713 \xB7 ${snap} \xB7 ${esc(bodyMode)}${liveLines ? `<hr style="opacity:.3;margin:2px 0">${liveLines}` : ""}</div>`;
  }
  function logLiveDebug(payload) {
    if (!DEV || !payload?.debug) return;
    try {
      console.info(`[combatHud/debug:${moduleId}]`, payload.debug);
    } catch (_e) {
    }
  }
  function render() {
    let state = null;
    try {
      state = store.getState();
    } catch (err) {
      console.error(`[combatHud/module:${moduleId}] getState failed`, err);
    }
    let bodyMode = "error";
    try {
      bodyMode = state ? resolveBodyMode(state) : "error";
    } catch (_e) {
      bodyMode = "error";
    }
    el.setAttribute("data-body", liveSelection ? liveSelection.status : bodyMode);
    el.setAttribute("data-weapon-selector", liveSelection?.ui?.weaponSelectorOpen ? "open" : "closed");
    el.innerHTML = `${bodyHtml(state)}${controlsHtml()}${debugBadge(state)}<div class="ohud-toast" hidden></div>`;
  }
  let lastCommandStatusKey = null;
  function maybeShowCommandStatusToast() {
    const status2 = liveSelection?.ui?.commandStatus ?? null;
    const key = status2 ? `${status2.type}:${status2.message}` : null;
    if (key === lastCommandStatusKey) return;
    lastCommandStatusKey = key;
    if (status2?.message) showToast(status2.message);
  }
  function applySelection(payload) {
    liveSelection = payload ? normalizeSelectionPayload(payload) : null;
    logLiveDebug(liveSelection);
    render();
    maybeShowCommandStatusToast();
  }
  function showToast(text) {
    const toast = el.querySelector(".ohud-toast");
    if (!toast) return;
    toast.textContent = text;
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (toast) toast.hidden = true;
    }, 1800);
  }
  function onClick(e) {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    switch (t.getAttribute("data-action")) {
      case "arrange":
        integration.onArrange && integration.onArrange();
        break;
      case "collapse":
        integration.onCollapse && integration.onCollapse(true);
        break;
      case "primary":
        if (!t.classList.contains("is-disabled")) showToast("Action resolution arrives in a later phase");
        break;
      case "basic-attack":
        if (!t.classList.contains("is-disabled")) {
          integration.onCommand && integration.onCommand({ scope: "combat-hud", feature: "basic-attack", type: "execute" });
        }
        break;
      case "pick-target":
        integration.onCommand && integration.onCommand({ type: "pick-target" });
        break;
      case "cancel-target":
        integration.onCommand && integration.onCommand({ type: "cancel-target" });
        break;
      case "clear-target":
        integration.onCommand && integration.onCommand({ type: "clear-target" });
        break;
      case "select-target-zone":
        integration.onCommand && integration.onCommand({ type: "select-target-zone", zoneId: t.getAttribute("data-zone-id") });
        break;
      case "select-weapon":
        integration.onCommand && integration.onCommand({ type: "select-weapon", weaponId: t.getAttribute("data-weapon-id") });
        break;
      case "toggle-weapon-selector":
        integration.onCommand && integration.onCommand({ type: "toggle-weapon-selector" });
        break;
      case "toggle-magazine-selector":
        integration.onCommand && integration.onCommand({ type: "toggle-magazine-selector" });
        break;
      case "reload":
        integration.onCommand && integration.onCommand({
          type: "reload",
          weaponId: t.getAttribute("data-weapon-id"),
          magazineId: t.getAttribute("data-magazine-id")
        });
        break;
      case "select-reload-mag":
        integration.onCommand && integration.onCommand({ type: "select-reload-mag", magazineId: t.getAttribute("data-magazine-id") });
        break;
      case "toggle-fire-mode-selector":
        integration.onCommand && integration.onCommand({ scope: "combat-hud", feature: "fire-mode", type: "toggle-selector" });
        break;
      case "select-fire-mode":
        integration.onCommand && integration.onCommand({
          scope: "combat-hud",
          feature: "fire-mode",
          type: "select",
          fireModeId: t.getAttribute("data-fire-mode-id")
        });
        break;
      case "prepare-skill":
        integration.onCommand && integration.onCommand({ type: "prepare-skill", skillId: t.getAttribute("data-skill-id") });
        break;
      case "open-quickbar-editor":
        integration.onCommand && integration.onCommand({ scope: "combat-hud", feature: "quickbar", type: "open-editor" });
        break;
      case "show-ability-detail":
        if (!t.classList.contains("is-disabled")) showToast("Ability details \u2014 execution arrives in Phase 4.1");
        break;
      case "end-turn":
        t.setAttribute("disabled", "disabled");
        integration.onCommand && integration.onCommand({ scope: "combat-hud", feature: "combat-session", type: "end-turn" });
        break;
      case "toggle-gm-tracker":
        integration.onCommand && integration.onCommand({ scope: "combat-hud", feature: "combat-session", type: "toggle-tracker" });
        break;
      default:
        break;
    }
  }
  el.addEventListener("click", onClick);
  function onKeyDown(e) {
    if (e.key === "Escape" && moduleId === "gun") {
      integration.onCommand && integration.onCommand({ type: "close-weapon-selector" });
      integration.onCommand && integration.onCommand({ scope: "combat-hud", feature: "fire-mode", type: "close-selector" });
    }
  }
  el.addEventListener("keydown", onKeyDown);
  const unsubscribe = store.subscribe(render);
  render();
  return {
    store,
    applySelection,
    unmount() {
      unsubscribe();
      tooltip.destroy();
      el.removeEventListener("click", onClick);
      el.removeEventListener("keydown", onKeyDown);
      if (toastTimer) clearTimeout(toastTimer);
      store.dispose();
      el.remove();
    }
  };
}

// hud/overlay/hudLayout.js
var HUD_LAYOUT_REFERENCE_VIEWPORT = Object.freeze({ width: 1920, height: 1080 });
var LAYOUT_VERSION = 2;
var LAYOUT_STORAGE_KEY = "odyssey.hud.layout.v2";
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
var BC_HUD_LAYOUT = "com.odyssey.combat-hud/layout";
var BC_HUD_EDITOR = "com.odyssey.combat-hud/editor";
var LAYOUT_MARGIN = 16;
var SNAP_GRID = 8;
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
function snapToGrid(value, grid = SNAP_GRID) {
  const g = grid || 1;
  return Math.round((Number(value) || 0) / g) * g;
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
function pixelsToNormalized(moduleId, left, top, vw, vh) {
  const { width, height } = moduleSize(moduleId, vw, vh);
  const availW = Math.max(0, (Number(vw) || 0) - width - 2 * LAYOUT_MARGIN);
  const availH = Math.max(0, (Number(vh) || 0) - height - 2 * LAYOUT_MARGIN);
  return {
    x: availW > 0 ? clamp012((left - LAYOUT_MARGIN) / availW) : 0,
    y: availH > 0 ? clamp012((top - LAYOUT_MARGIN) / availH) : 0
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
function computeAlignmentGuides(moving, others, threshold = 6) {
  const vertical = /* @__PURE__ */ new Set();
  const horizontal = /* @__PURE__ */ new Set();
  const mX = [moving.left, moving.left + moving.width / 2, moving.left + moving.width];
  const mY = [moving.top, moving.top + moving.height / 2, moving.top + moving.height];
  for (const o of others) {
    const oX = [o.left, o.left + o.width / 2, o.left + o.width];
    const oY = [o.top, o.top + o.height / 2, o.top + o.height];
    for (const a of mX) for (const b of oX) if (Math.abs(a - b) <= threshold) vertical.add(Math.round(b));
    for (const a of mY) for (const b of oY) if (Math.abs(a - b) <= threshold) horizontal.add(Math.round(b));
  }
  return { vertical: [...vertical], horizontal: [...horizontal] };
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
function parseLayoutState(rawJson) {
  if (rawJson == null) return null;
  let obj = rawJson;
  if (typeof rawJson === "string") {
    try {
      obj = JSON.parse(rawJson);
    } catch {
      return null;
    }
  }
  return validateLayoutState(obj);
}
function serializeLayoutState(state) {
  return JSON.stringify(normalizeLayoutState(state));
}
function readStoredLayout(storage) {
  try {
    const raw = storage && storage.getItem ? storage.getItem(LAYOUT_STORAGE_KEY) : null;
    return parseLayoutState(raw) ?? defaultLayoutState();
  } catch {
    return defaultLayoutState();
  }
}
function writeStoredLayout(storage, state) {
  try {
    if (storage && storage.setItem) storage.setItem(LAYOUT_STORAGE_KEY, serializeLayoutState(state));
  } catch {
  }
}
function setModulePlacement(draft, moduleId, placement) {
  const next = normalizeLayoutState(draft);
  if (HUD_MODULE_IDS.includes(moduleId)) {
    next.modules[moduleId] = {
      mode: placement && placement.mode === "default" ? "default" : "custom",
      x: clamp012(placement && placement.x),
      y: clamp012(placement && placement.y)
    };
  }
  return next;
}

// hud/components/CombatHudLayoutEditor.js
var BLOCK_RENDERERS2 = {
  player: renderPlayerBlock,
  gun: renderGunBlock,
  skills: renderSkillBlock,
  combatControl: renderCombatControlBlock,
  log: renderBattleLogPanel
};
var MODULE_LABEL = {
  player: "Player",
  gun: "Gun",
  skills: "Skills",
  combatControl: "Combat Control",
  log: "Log"
};
function mountCombatHudLayoutEditor(options) {
  const { root } = options;
  const integration = options.integration ?? {};
  const restored = normalizeHudUiState(options.uiState);
  const adapter = createMockCombatHudAdapter({ scenarioId: restored.mockScenarioId });
  adapter.setViewerRole(restored.viewerRole);
  if (restored.selectedTokenId) adapter.selectToken(restored.selectedTokenId);
  const store = createCombatHudStore({ adapter });
  store.initialize();
  const state = store.getState();
  let draft = normalizeLayoutState(options.layout ?? defaultLayoutState());
  const el = document.createElement("div");
  el.className = "odyssey-hud ohud-editor-root";
  root.appendChild(el);
  function vw() {
    return window.innerWidth;
  }
  function vh() {
    return window.innerHeight;
  }
  function renderShell() {
    el.innerHTML = `
      <div class="ohud-editor">
        <div class="ohud-editor-toolbar">
          <span class="ohud-editor-title">Arrange HUD</span>
          <span class="ohud-editor-hint">Drag a module by its grip \xB7 snaps to 8px</span>
          <span class="ohud-editor-actions">
            <button type="button" class="ohud-editor-btn" data-editor="reset">Reset layout</button>
            <button type="button" class="ohud-editor-btn" data-editor="cancel">Cancel</button>
            <button type="button" class="ohud-editor-btn is-primary" data-editor="save">Save layout</button>
          </span>
        </div>
        <div class="ohud-editor-canvas">
          <div class="ohud-guide ohud-guide--v" hidden></div>
          <div class="ohud-guide ohud-guide--h" hidden></div>
          ${HUD_MODULE_IDS.map(cardHtml).join("")}
        </div>
      </div>`;
    for (const id of HUD_MODULE_IDS) positionCard(id);
  }
  function cardHtml(moduleId) {
    const fn = BLOCK_RENDERERS2[moduleId];
    return `<div class="ohud-card ohud-module" data-module="${moduleId}" data-body="ready">
      <div class="ohud-card-bar" data-card-grip="${moduleId}">
        <span class="ohud-card-grip">${ICON_GRIP}</span>
        <span class="ohud-card-name">${esc(MODULE_LABEL[moduleId])}</span>
      </div>
      <div class="ohud-card-body">${fn ? fn(state) : ""}</div>
    </div>`;
  }
  function rectFor(moduleId) {
    return clampRect(resolveModuleRect(moduleId, draft.modules[moduleId], vw(), vh()), vw(), vh());
  }
  function positionCard(moduleId) {
    const card = el.querySelector(`.ohud-card[data-module="${moduleId}"]`);
    if (!card) return;
    const r = rectFor(moduleId);
    card.style.left = `${r.left}px`;
    card.style.top = `${r.top}px`;
    card.style.width = `${r.width}px`;
    card.style.height = `${r.height}px`;
    card.style.zIndex = String(r.zIndex);
  }
  let drag = null;
  const guideV = () => el.querySelector(".ohud-guide--v");
  const guideH = () => el.querySelector(".ohud-guide--h");
  function otherRects(exceptId) {
    return HUD_MODULE_IDS.filter((id) => id !== exceptId).map(rectFor);
  }
  function onPointerDown(e) {
    const bar = e.target.closest("[data-card-grip]");
    if (!bar || e.button !== 0) return;
    const moduleId = bar.getAttribute("data-card-grip");
    const card = el.querySelector(`.ohud-card[data-module="${moduleId}"]`);
    e.preventDefault();
    try {
      bar.setPointerCapture(e.pointerId);
    } catch (_e) {
    }
    const r = rectFor(moduleId);
    drag = { id: e.pointerId, moduleId, startX: e.clientX, startY: e.clientY, startLeft: r.left, startTop: r.top, w: r.width, h: r.height };
    card.classList.add("is-dragging");
  }
  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    let left = snapToGrid(drag.startLeft + dx);
    let top = snapToGrid(drag.startTop + dy);
    const clamped = clampRect({ left, top, width: drag.w, height: drag.h }, vw(), vh());
    left = clamped.left;
    top = clamped.top;
    const card = el.querySelector(`.ohud-card[data-module="${drag.moduleId}"]`);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    const norm = pixelsToNormalized(drag.moduleId, left, top, vw(), vh());
    draft = setModulePlacement(draft, drag.moduleId, { mode: "custom", x: norm.x, y: norm.y });
    const guides = computeAlignmentGuides({ left, top, width: drag.w, height: drag.h }, otherRects(drag.moduleId));
    const gv = guideV(), gh = guideH();
    if (guides.vertical.length) {
      gv.hidden = false;
      gv.style.left = `${guides.vertical[0]}px`;
    } else gv.hidden = true;
    if (guides.horizontal.length) {
      gh.hidden = false;
      gh.style.top = `${guides.horizontal[0]}px`;
    } else gh.hidden = true;
  }
  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const card = el.querySelector(`.ohud-card[data-module="${drag.moduleId}"]`);
    if (card) card.classList.remove("is-dragging");
    guideV().hidden = true;
    guideH().hidden = true;
    drag = null;
  }
  function onClick(e) {
    const t = e.target.closest("[data-editor]");
    if (!t) return;
    switch (t.getAttribute("data-editor")) {
      case "save":
        integration.onSave && integration.onSave(normalizeLayoutState(draft));
        break;
      case "cancel":
        integration.onCancel && integration.onCancel();
        break;
      case "reset":
        draft = defaultLayoutState();
        renderShell();
        break;
      default:
        break;
    }
  }
  function onResize() {
    for (const id of HUD_MODULE_IDS) positionCard(id);
  }
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerUp);
  el.addEventListener("click", onClick);
  window.addEventListener("resize", onResize);
  renderShell();
  return {
    el,
    unmount() {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("click", onClick);
      window.removeEventListener("resize", onResize);
      store.dispose();
      el.remove();
    }
  };
}

// hud/session/GmCombatTrackerPanel.js
function candidateRow(candidate) {
  return `<label class="ohud-gmct-candidate">
    <input type="checkbox" data-gmct-candidate="${esc(candidate.characterId)}" checked />
    <span class="ohud-gmct-name">${esc(candidate.displayName || "Unnamed")}</span>
    <span class="ohud-gmct-tag">${candidate.isPlayerCharacter ? "PC" : "NPC"}</span>
  </label>`;
}
function participantRow(p) {
  return `<li class="${cls("ohud-gmct-row", p.isCurrent && "is-current", !p.isEligible && "is-skipped")}">
    <span class="ohud-gmct-marker">${p.isCurrent ? "\u25B6" : ""}</span>
    <span class="ohud-gmct-name">${esc(p.displayName || "Unnamed")}</span>
    <span class="ohud-gmct-init">${p.initiativeTotal ?? "\u2014"}</span>
    ${p.isEligible ? "" : `<span class="ohud-gmct-tag is-skip">SKIP</span>`}
  </li>`;
}
function renderGmCombatTracker({ session, candidates, viewerRole, busy = false } = {}) {
  if (!canSeeGmTracker(viewerRole)) {
    return `<section class="ohud-panel ohud-gmct" data-block="gm-combat-tracker">
      <div class="ohud-gmct-denied">GM only.</div>
    </section>`;
  }
  const active = !!session && session.exists === true && session.status === "active";
  if (!active) {
    const list = Array.isArray(candidates) && candidates.length ? candidates.map(candidateRow).join("") : `<div class="ohud-gmct-empty">No linked characters in this scene.</div>`;
    return `<section class="ohud-panel ohud-gmct" data-block="gm-combat-tracker">
      <div class="ohud-panel-head"><span class="ohud-panel-label">Combat</span></div>
      <div class="ohud-gmct-candidates">${list}</div>
      <div class="ohud-gmct-actions">
        <button type="button" class="ohud-gmct-btn is-primary" data-action="gm-start-combat"${busy ? " disabled" : ""}>Start Combat</button>
      </div>
    </section>`;
  }
  const current2 = session.participants.find((p) => p.isCurrent) ?? null;
  const rows = session.participants.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(participantRow).join("");
  return `<section class="ohud-panel ohud-gmct" data-block="gm-combat-tracker">
    <div class="ohud-panel-head">
      <span class="ohud-panel-label">ROUND ${esc(session.roundNumber ?? 0)}</span>
      <span class="ohud-gmct-current">Current: ${esc(current2?.displayName ?? "\u2014")}</span>
    </div>
    <ul class="ohud-gmct-list">${rows}</ul>
    <div class="ohud-gmct-actions">
      <button type="button" class="ohud-gmct-btn" data-action="gm-skip-turn"${busy ? " disabled" : ""}>Skip Turn</button>
      <button type="button" class="ohud-gmct-btn" data-action="gm-force-next"${busy ? " disabled" : ""}>Force Next</button>
      <button type="button" class="ohud-gmct-btn is-danger" data-action="gm-end-combat"${busy ? " disabled" : ""}>End Combat</button>
    </div>
  </section>`;
}

// hud/abilities/QuickbarEditorPanel.js
var SEMANTIC_ACCENT2 = {
  attack: "attack",
  psi: "psionic",
  tech: "implant",
  utility: "neutral",
  intervention: "intervention"
};
var TYPE_MARK2 = { attack_technique: "ATK", directed: "DIR", instant: "INS", toggle: "TGL" };
var SEMANTIC_LABEL = { attack: "Attack", psi: "Psi", tech: "Tech", utility: "Utility", intervention: "Defense" };
var SOURCE_LABEL = { perk: "Perk", psi: "Psi", implant: "Implant", item: "Item", technique: "Technique" };
function categoryLabel(action) {
  const sem = SEMANTIC_LABEL[action.semanticKind] ?? "Action";
  const src = SOURCE_LABEL[action.sourceType] ?? null;
  if (!src || src.toLowerCase() === sem.toLowerCase()) return sem.toUpperCase();
  return `${sem.toUpperCase()} / ${src.toUpperCase()}`;
}
function costBadges(action) {
  const badges = [];
  const c = action.costs ?? {};
  if (c.main > 0) badges.push({ text: `MAIN ${c.main}`, kind: "cost" });
  else if (c.move > 0) badges.push({ text: `MOVE ${c.move}`, kind: "cost" });
  else if (c.charges > 0) badges.push({ text: `CHG ${c.charges}`, kind: "cost" });
  if (c.psi > 0) badges.push({ text: `PSI ${c.psi}`, kind: "resource" });
  if (action.cooldown?.max > 0) badges.push({ text: `CD ${action.cooldown.max}`, kind: "cooldown" });
  return badges;
}
function badgeHtml(badge) {
  return `<span class="${cls("ohud-qbe-badge", `ohud-qbe-badge--${badge.kind}`)}">${esc(badge.text)}</span>`;
}
function actionById2(runtime, id) {
  if (!id) return null;
  return (runtime.quickActions ?? []).find((a) => a.characterActionId === id) ?? null;
}
function libraryCard(action) {
  const accent = SEMANTIC_ACCENT2[action.semanticKind] ?? "neutral";
  const disabled = action.state?.available === false;
  const tip = tipAttr(action.name, abilityTooltipLines(action));
  const badges = costBadges(action).map(badgeHtml).join("");
  return `<div class="${cls("ohud-qbe-card", `ohud-accent--${accent}`, disabled ? "is-disabled" : "")}" draggable="true" data-qbe-action="${esc(action.characterActionId)}"${tip}>
    <span class="ohud-qbe-card-icon">${skillIconSvg(action.iconKey)}</span>
    <span class="ohud-qbe-card-main">
      <span class="ohud-qbe-card-name">${esc(action.name)}</span>
      <span class="ohud-qbe-card-type">${esc(categoryLabel(action))}</span>
    </span>
    <span class="ohud-qbe-card-badges">${badges}</span>
    ${disabled ? `<span class="ohud-qbe-card-off" ${tipAttr("Currently unavailable", [String(action.state.disabledReason ?? "")])}>!</span>` : ""}
  </div>`;
}
function editorSlot(slot, action) {
  const idx = slot.slotIndex;
  if (slot.empty || slot.characterActionId == null) {
    return `<div class="${cls("ohud-qbe-slot", "is-empty")}" data-qbe-slot="${idx}">
      <span class="ohud-qbe-slot-idx">${idx + 1}</span>
    </div>`;
  }
  if (slot.missing || !action) {
    return `<div class="${cls("ohud-qbe-slot", "is-missing")}" data-qbe-slot="${idx}" ${tipAttr("Missing action", ["No longer available \u2014 remove it."])}>
      <span class="ohud-qbe-slot-idx">${idx + 1}</span>
      <span class="ohud-qbe-missing">?</span>
      <button type="button" class="ohud-qbe-remove" data-qbe-remove="${idx}" aria-label="Remove">\xD7</button>
    </div>`;
  }
  const accent = SEMANTIC_ACCENT2[action.semanticKind] ?? "neutral";
  const mark = TYPE_MARK2[action.type] ?? "";
  const tip = tipAttr(action.name, abilityTooltipLines(action));
  return `<div class="${cls("ohud-qbe-slot", "is-filled", `ohud-accent--${accent}`)}" draggable="true" data-qbe-slot="${idx}" data-qbe-action="${esc(action.characterActionId)}"${tip}>
    <span class="ohud-qbe-slot-idx">${idx + 1}</span>
    ${mark ? `<span class="ohud-qbe-slot-type">${esc(mark)}</span>` : ""}
    <span class="ohud-qbe-slot-icon">${skillIconSvg(action.iconKey)}</span>
    <span class="ohud-qbe-slot-name">${esc(action.name)}</span>
    <button type="button" class="ohud-qbe-remove" data-qbe-remove="${idx}" aria-label="Remove">\xD7</button>
  </div>`;
}
function footerStatus({ busy, conflict, dirty }) {
  if (busy) return { text: "Saving\u2026", tone: "busy" };
  if (conflict) return { text: "Resolve the conflict to continue", tone: "warning" };
  if (dirty) return { text: "Unsaved changes", tone: "warning" };
  return { text: "All changes saved", tone: "neutral" };
}
function renderQuickbarEditor(args = {}) {
  const runtime = args.runtime && typeof args.runtime === "object" ? args.runtime : null;
  const draft = Array.isArray(args.draft) ? args.draft : [];
  const library = Array.isArray(args.library) ? args.library : [];
  const busy = !!args.busy;
  const dirty = !!args.dirty;
  const conflict = !!args.conflict;
  const name = String(args.characterName ?? "Character");
  const header = `<div class="ohud-qbe-header">
    <span class="ohud-qbe-header-icon">${ICON_GRID}</span>
    <span class="ohud-qbe-header-text">
      <span class="ohud-qbe-header-title">Quickbar Editor</span>
      <span class="ohud-qbe-header-subtitle">Assign combat abilities to quick slots \u2014 ${esc(name)}</span>
    </span>
    <button type="button" class="ohud-qbe-close" data-action="qbe-cancel" aria-label="Close">\xD7</button>
  </div>`;
  if (!runtime) {
    return `<div class="ohud-qbe">${header}<div class="ohud-qbe-empty">Loading quickbar\u2026</div></div>`;
  }
  const conflictBar = conflict ? `<div class="ohud-qbe-conflict" role="alert">
        <span>Layout changed on the server. Your edits were not saved.</span>
        <button type="button" class="ohud-qbe-reload" data-action="qbe-reload">Reload layout</button>
      </div>` : "";
  const libraryHtml = library.length ? library.map(libraryCard).join("") : `<div class="ohud-qbe-lib-empty">All actions are placed.</div>`;
  const rows = /* @__PURE__ */ new Map();
  for (const slot of draft) {
    const r = rowOfSlot(slot.slotIndex);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(slot);
  }
  const slotsHtml = [...rows.keys()].sort((a, b) => a - b).map((r) => {
    const tiles = rows.get(r).sort((a, b) => a.slotIndex - b.slotIndex).map((slot) => editorSlot(slot, actionById2(runtime, slot.characterActionId))).join("");
    return `<div class="ohud-qbe-slot-row" data-row="${r}">${tiles}</div>`;
  }).join("");
  const saveDisabled = busy || !dirty;
  const resetDisabled = busy || !dirty && !conflict;
  const status2 = footerStatus({ busy, conflict, dirty });
  return `<div class="${cls("ohud-qbe", busy ? "is-busy" : "")}">
    ${header}
    <div class="ohud-qbe-body">
      ${conflictBar}
      <div class="ohud-qbe-cols">
        <div class="ohud-qbe-col ohud-qbe-col--library">
          <div class="ohud-qbe-section-label">Available actions</div>
          <div class="ohud-qbe-library" data-qbe-library>${libraryHtml}</div>
        </div>
        <div class="ohud-qbe-col ohud-qbe-col--slots">
          <div class="ohud-qbe-section-label">Quickbar slots</div>
          <div class="ohud-qbe-hint">Drag an action onto a slot to assign it, or drag between slots to swap.</div>
          <div class="ohud-qbe-slots">${slotsHtml}</div>
        </div>
      </div>
    </div>
    <div class="ohud-qbe-footer">
      <span class="${cls("ohud-qbe-status", `ohud-qbe-status--${status2.tone}`)}">${esc(status2.text)}</span>
      <div class="ohud-qbe-actions">
        <button type="button" class="ohud-qbe-btn" data-action="qbe-reset" ${resetDisabled ? "disabled" : ""}>Reset</button>
        <button type="button" class="ohud-qbe-btn" data-action="qbe-cancel" ${busy ? "disabled" : ""}>Cancel</button>
        <button type="button" class="ohud-qbe-btn is-primary" data-action="qbe-save" ${saveDisabled ? "disabled" : ""}>Save</button>
      </div>
    </div>
  </div>`;
}

// hud/overlay/combatHudOverlayPage.js
var COMPANION_DEBUG = (() => {
  try {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
})();
function injectStyles() {
  for (const [id, css] of [
    ["ohud-tokens", combatHudTokens_default],
    ["ohud-overlay-styles", combatHudOverlay_default],
    ["ohud-layout-styles", combatHudLayout_default],
    ["ohud-module-styles", combatHudModule_default]
  ]) {
    if (document.getElementById(id)) continue;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }
}
function send(channel, data) {
  try {
    lib_default.broadcast.sendMessage(channel, data, { destination: "LOCAL" });
  } catch (_e) {
  }
}
function getModuleParam() {
  try {
    return new URLSearchParams(window.location.search).get("module") || "";
  } catch {
    return "";
  }
}
function renderPill(root, available) {
  const host = document.createElement("div");
  host.className = "odyssey-hud ohud-overlay is-collapsed";
  host.innerHTML = `<button class="ohud-pill" data-ohud="reopen" title="Open Odyssey Combat HUD" aria-label="Open Odyssey Combat HUD">
      <span class="ohud-mark" aria-hidden="true">${ICON_MARK}</span>
      <span class="ohud-pill-label">ODYSSEY</span>
    </button>`;
  root.appendChild(host);
  host.addEventListener("click", (e) => {
    if (e.target.closest('[data-ohud="reopen"]')) {
      if (available) send(BC_HUD_UI_STATE, { isHudCollapsed: false });
    }
  });
}
function start() {
  injectStyles();
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  document.body.style.margin = "0";
  const root = document.getElementById("root") || document.body;
  root.classList.add("odyssey-hud");
  const available = !!(lib_default && lib_default.isAvailable);
  const moduleParam = getModuleParam();
  let uiState = {};
  try {
    uiState = parseHudUiState(window.location.search);
  } catch {
    uiState = {};
  }
  if (moduleParam === "pill") {
    renderPill(root, available);
    return;
  }
  if (moduleParam === "editor" || moduleParam === "") {
    mountCombatHudLayoutEditor({
      root,
      uiState,
      layout: readStoredLayout(window.localStorage),
      integration: {
        onSave(layout) {
          writeStoredLayout(window.localStorage, layout);
          if (available) {
            send(BC_HUD_LAYOUT, layout);
            send(BC_HUD_EDITOR, { open: false });
          }
        },
        onCancel() {
          if (available) send(BC_HUD_EDITOR, { open: false });
        }
      }
    });
    return;
  }
  if (HUD_MODULE_IDS.includes(moduleParam)) {
    const mod = mountCombatHudModule({
      root,
      moduleId: moduleParam,
      uiState,
      integration: {
        onArrange() {
          if (available) send(BC_HUD_EDITOR, { open: true });
        },
        onCollapse(collapsed) {
          if (available) send(BC_HUD_UI_STATE, { isHudCollapsed: !!collapsed });
        },
        onCommand(command) {
          if (available) send(BC_HUD_COMMAND, command);
        }
      }
    });
    if (available) {
      try {
        lib_default.broadcast.onMessage(BC_HUD_SELECTION, (event) => {
          try {
            mod.applySelection(event?.data ?? null);
          } catch (_e) {
          }
        });
        send(BC_HUD_SELECTION_REQUEST, {});
      } catch (_e) {
      }
    }
    if (moduleParam === "player" && available) {
      send(BC_HUD_LAYOUT, readStoredLayout(window.localStorage));
    }
    return;
  }
  if (moduleParam === "gun-weapon-selector" || moduleParam === "gun-magazine-selector" || moduleParam === "gun-fire-mode-selector") {
    let renderCompanion = function() {
      root.innerHTML = "";
      const host = document.createElement("div");
      host.className = "odyssey-hud ohud-module";
      host.setAttribute("data-module", moduleParam);
      const selState = buildCompanionSelectorState(rawPayload);
      const html = moduleParam === "gun-weapon-selector" ? renderWeaponSelectorPanel(selState) : moduleParam === "gun-magazine-selector" ? renderMagazineSelectorPanel(selState) : renderFireModeSelectorPanel(selState);
      host.innerHTML = html;
      root.appendChild(host);
      if (COMPANION_DEBUG) {
        const avail = selState?.snapshot?.weapon?.available;
        const commandRoute = moduleParam === "gun-weapon-selector" ? "gun-selector" : moduleParam === "gun-magazine-selector" ? "magazine-selector" : "fire-mode-selector";
        console.info("[combatHud/companion:debug]", {
          module: moduleParam,
          commandRoute,
          selectorIframeReady: !!selState,
          selectorRenderWeaponAvailableCount: Array.isArray(avail) ? avail.length : null,
          selectedWeaponId: rawPayload?.ui?.selectedWeaponId ?? null
        });
      }
    };
    let rawPayload = null;
    root.addEventListener("click", (e) => {
      const target = e.target.closest("[data-action]");
      if (!target || !available) return;
      const action = target.getAttribute("data-action");
      if (action === "select-weapon") {
        send(BC_HUD_COMMAND, { type: "select-weapon", weaponId: target.getAttribute("data-weapon-id") });
      } else if (action === "select-reload-mag") {
        send(BC_HUD_COMMAND, { type: "select-reload-mag", magazineId: target.getAttribute("data-magazine-id") });
      } else if (action === "select-fire-mode") {
        send(BC_HUD_COMMAND, {
          scope: "combat-hud",
          feature: "fire-mode",
          type: "select",
          fireModeId: target.getAttribute("data-fire-mode-id")
        });
      }
    });
    if (available) {
      try {
        lib_default.broadcast.onMessage(BC_HUD_SELECTION, (event) => {
          rawPayload = event?.data ?? null;
          renderCompanion();
        });
        send(BC_HUD_SELECTION_REQUEST, {});
      } catch (_e) {
      }
    }
    renderCompanion();
    return;
  }
  if (moduleParam === "gm-combat-tracker") {
    let renderTracker = function() {
      root.innerHTML = "";
      const host = document.createElement("div");
      host.className = "odyssey-hud ohud-module";
      host.setAttribute("data-module", "gm-combat-tracker");
      host.innerHTML = renderGmCombatTracker({
        session,
        candidates,
        viewerRole: uiState.viewerRole === "gm" ? "gm" : "player",
        busy
      });
      root.appendChild(host);
    };
    let session = null;
    let candidates = [];
    let busy = false;
    root.addEventListener("click", (e) => {
      const target = e.target.closest("[data-action]");
      if (!target || !available || busy) return;
      const action = target.getAttribute("data-action");
      const sendSession = (type, extra = {}) => send(BC_HUD_COMMAND, { scope: "combat-hud", feature: "combat-session", type, ...extra });
      if (action === "gm-start-combat") {
        const excluded = [...root.querySelectorAll("[data-gmct-candidate]")].filter((box) => !box.checked).map((box) => box.getAttribute("data-gmct-candidate"));
        busy = true;
        renderTracker();
        sendSession("gm-start", { excludedCharacterIds: excluded });
      } else if (action === "gm-skip-turn") {
        busy = true;
        renderTracker();
        sendSession("gm-skip-turn");
      } else if (action === "gm-force-next") {
        busy = true;
        renderTracker();
        sendSession("gm-force-next");
      } else if (action === "gm-end-combat") {
        busy = true;
        renderTracker();
        sendSession("gm-end");
      }
    });
    if (available) {
      try {
        lib_default.broadcast.onMessage(BC_HUD_SESSION, (event) => {
          session = event?.data?.session ?? null;
          candidates = Array.isArray(event?.data?.candidates) ? event.data.candidates : [];
          busy = false;
          renderTracker();
        });
        send(BC_HUD_SESSION_REQUEST, {});
        send(BC_HUD_COMMAND, { scope: "combat-hud", feature: "combat-session", type: "load-start-candidates" });
      } catch (_e) {
      }
    }
    renderTracker();
    return;
  }
  if (moduleParam === "quickbar-editor") {
    let actionIdSet = function() {
      return new Set((runtime?.quickActions ?? []).map((a) => a.characterActionId).filter(Boolean));
    }, rebuildDraftFromRuntime = function() {
      const ids = actionIdSet();
      const maxSlots = runtime?.quickbar?.maxSlots ?? 20;
      draft = buildDraft(runtime?.quickbar?.slots ?? [], ids, maxSlots);
      originalDraft = draft.map((s) => ({ ...s }));
      baseVersion = runtime?.quickbar?.version ?? null;
    }, renderEditor = function() {
      root.innerHTML = "";
      const host = document.createElement("div");
      host.className = "odyssey-hud ohud-module";
      host.setAttribute("data-module", "quickbar-editor");
      const library = runtime ? unassignedActions(runtime.quickActions, draft) : [];
      host.innerHTML = renderQuickbarEditor({
        runtime,
        draft,
        library,
        characterName: runtime?.characterName ?? "",
        busy,
        dirty: isDraftDirty(draft, originalDraft),
        conflict
      });
      root.appendChild(host);
      wireDragAndDrop();
    }, notifyDraftChanged = function() {
      const occupied = draft.filter((s) => s.characterActionId && !s.empty).length;
      send(BC_HUD_COMMAND, { scope: "combat-hud", feature: "quickbar", type: "draft-changed", occupiedSlots: occupied });
    }, wireDragAndDrop = function() {
      const ids = actionIdSet();
      root.querySelectorAll("[draggable='true']").forEach((el) => {
        el.addEventListener("dragstart", (e) => {
          const actionId = el.getAttribute("data-qbe-action");
          const fromSlot = el.getAttribute("data-qbe-slot");
          const payload = JSON.stringify({ actionId: actionId ?? null, fromSlot: fromSlot != null ? Number(fromSlot) : null });
          try {
            e.dataTransfer.setData("text/plain", payload);
            e.dataTransfer.effectAllowed = "move";
          } catch (_e) {
          }
        });
      });
      root.querySelectorAll("[data-qbe-slot]").forEach((slotEl) => {
        slotEl.addEventListener("dragover", (e) => {
          e.preventDefault();
          try {
            e.dataTransfer.dropEffect = "move";
          } catch (_e) {
          }
        });
        slotEl.addEventListener("drop", (e) => {
          e.preventDefault();
          const targetIdx = Number(slotEl.getAttribute("data-qbe-slot"));
          let data = {};
          try {
            data = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
          } catch (_e) {
            data = {};
          }
          if (data.fromSlot != null && !Number.isNaN(data.fromSlot)) {
            draft = moveSlot(draft, data.fromSlot, targetIdx);
          } else if (data.actionId) {
            draft = assignActionToSlot(draft, data.actionId, targetIdx, ids);
          } else {
            return;
          }
          notifyDraftChanged();
          renderEditor();
        });
      });
    };
    let runtime = null;
    let draft = [];
    let originalDraft = [];
    let baseVersion = null;
    let busy = false;
    let conflict = false;
    root.addEventListener("click", (e) => {
      const removeBtn = e.target.closest("[data-qbe-remove]");
      if (removeBtn && !busy) {
        draft = removeSlot(draft, Number(removeBtn.getAttribute("data-qbe-remove")));
        notifyDraftChanged();
        renderEditor();
        return;
      }
      const target = e.target.closest("[data-action]");
      if (!target || busy) return;
      const action = target.getAttribute("data-action");
      if (action === "qbe-save") {
        busy = true;
        renderEditor();
        send(BC_HUD_COMMAND, {
          scope: "combat-hud",
          feature: "quickbar",
          type: "save-layout",
          expectedVersion: baseVersion,
          slots: draftToSavePayload(draft)
        });
      } else if (action === "qbe-cancel") {
        send(BC_HUD_COMMAND, { scope: "combat-hud", feature: "quickbar", type: "close-editor" });
      } else if (action === "qbe-reload" || action === "qbe-reset") {
        conflict = false;
        rebuildDraftFromRuntime();
        renderEditor();
      }
    });
    if (available) {
      try {
        lib_default.broadcast.onMessage(BC_HUD_ABILITIES, (event) => {
          const nextRuntime = event?.data?.runtime ?? null;
          const nextVersion = nextRuntime?.quickbar?.version ?? null;
          const wasBusy = busy;
          busy = false;
          if (!runtime) {
            runtime = nextRuntime;
            rebuildDraftFromRuntime();
          } else if (wasBusy) {
            runtime = nextRuntime;
            conflict = false;
            rebuildDraftFromRuntime();
          } else if (nextVersion != null && baseVersion != null && nextVersion !== baseVersion) {
            runtime = nextRuntime;
            conflict = true;
          } else {
            runtime = nextRuntime;
          }
          renderEditor();
        });
        send(BC_HUD_ABILITIES_REQUEST, {});
        send(BC_HUD_COMMAND, { scope: "combat-hud", feature: "quickbar", type: "editor-opened" });
      } catch (_e) {
      }
    }
    renderEditor();
    return;
  }
  mountCombatHudLayoutEditor({ root, uiState, layout: readStoredLayout(window.localStorage), integration: {} });
}
if (lib_default && lib_default.isAvailable) {
  lib_default.onReady(start);
} else {
  start();
}
