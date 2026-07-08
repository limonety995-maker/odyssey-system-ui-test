// Combat HUD — safe error serialization for Debug Console logging (PURE).
//
// The ONE reason this exists: `String(error)` on anything that isn't an
// Error instance with a real `.message` string collapses to the useless
// literal "[object Object]" — exactly what made a real target-ring failure
// undiagnosable (targeting/target-ring-failed logged `message:
// "[object Object]"` instead of the actual thrown error's shape). Every
// caller that used to build its Debug Console `message` field with
// `String(error?.message ?? error)` should serialize the error with this
// module instead.
//
// Deliberately conservative about WHAT survives serialization: only the
// shape of an error (name/message/stack/cause, or a plain object's own
// JSON-safe fields) is ever kept. Never a runtime bundle, never inventory,
// never auth/session data — see redact() below, which additionally strips
// any key that LOOKS credential-shaped even if a thrown error happened to
// carry one (e.g. an SDK error embedding a request config).

const SENSITIVE_KEY_PATTERN = /token|auth|password|secret|credential|api[-_]?key|session|cookie|bearer/i;
const REDACTED = "[redacted]";
const MAX_STACK_CHARS = 2000;

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Recursively strips any key that looks credential-shaped, keeping the
 *  overall shape intact so diagnosis is still possible. */
function redact(value, depth = 0) {
  if (depth > 6) return "[max-depth]"; // never a source of infinite/huge output
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Turn ANY thrown value into a safe, structured, JSON-friendly object for
 * Debug Console `details` fields — never a bare string that could collapse
 * to "[object Object]".
 * @param {unknown} error
 * @returns {{ name?, message?, stack?, cause?, type?, keys? }}
 */
export function serializeError(error) {
  if (error instanceof Error) {
    const out = {
      name: error.name,
      message: error.message,
      stack: typeof error.stack === "string" ? error.stack.slice(0, MAX_STACK_CHARS) : undefined,
    };
    if (error.cause !== undefined) out.cause = serializeError(error.cause);
    // Some SDK/DOM errors carry extra enumerable fields (e.g. `code`) beyond
    // the standard Error shape — surface them too, redacted, without
    // clobbering the fields already set above.
    for (const key of Object.keys(error)) {
      if (key in out) continue;
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(error[key]);
    }
    return out;
  }

  if (error && typeof error === "object") {
    try {
      return redact(JSON.parse(JSON.stringify(error)));
    } catch {
      // Circular reference or a non-JSON-serializable value (DOM node,
      // function, symbol, etc.) — a safe, honest fallback shape, never a
      // thrown serialization error and never "[object Object]".
      let keys = [];
      try { keys = Object.keys(error); } catch { keys = []; }
      return {
        type: Object.prototype.toString.call(error),
        keys,
        message: error.message !== undefined ? String(error.message) : undefined,
      };
    }
  }

  return { message: String(error) };
}
