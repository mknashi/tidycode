import { responseValues } from "./responseValues.js";
export const ASSERTION_TYPES = {
  status: "Status equals",
  headerExists: "Header exists",
  headerContains: "Header contains",
  jsonExists: "JSON path exists",
  jsonEquals: "JSON value equals",
  duration: "Response time below (ms)",
};
export function newAssertion() {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    type: "status",
    target: "",
    expected: "200",
  };
}
export function validateAssertions(rules = []) {
  if (!Array.isArray(rules) || rules.length > 50)
    throw new Error("Use at most 50 assertions per request.");
  const ids = new Set();
  return rules.map((rule) => {
    if (
      !rule ||
      !Object.hasOwn(ASSERTION_TYPES, rule.type) ||
      typeof rule.target !== "string" ||
      rule.target.length > 512 ||
      typeof rule.expected !== "string" ||
      rule.expected.length > 4096
    )
      throw new Error(
        "Invalid assertion definition. Paths are limited to 512 characters and expected values to 4096 characters.",
      );
    const id = typeof rule.id === "string" ? rule.id : crypto.randomUUID();
    if (!id || id.length > 128 || ids.has(id))
      throw new Error("Invalid assertion identifier.");
    ids.add(id);
    return {
      id,
      enabled: rule.enabled !== false,
      type: rule.type,
      target: rule.target,
      expected: rule.expected,
    };
  });
}
function numberKey(value) {
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  const digits = (match[2] + (match[3] || "")).replace(/^0+/, "");
  if (!digits) return "0";
  const trimmed = digits.replace(/0+$/, "");
  return (
    match[1] +
    trimmed +
    "e" +
    (BigInt(match[4] || "0") -
      BigInt((match[3] || "").length) +
      BigInt(digits.length - trimmed.length))
  );
}
function scalarEqual(entry, expected) {
  let parsed;
  try {
    parsed = JSON.parse(expected);
  } catch {
    throw new Error("Enter a valid JSON scalar as the expected value.");
  }
  if (parsed !== null && typeof parsed === "object")
    throw new Error(
      "Use a JSON scalar: a quoted string, number, true, false, or null.",
    );
  if (entry.type === "object" || entry.type === "array") return false;
  if (entry.type === "string")
    return typeof parsed === "string" && entry.value === parsed;
  if (typeof parsed === "number") {
    if (entry.value.length > 4096)
      throw new Error("JSON number exceeds the comparison limit.");
    return (
      /^-?\d/.test(entry.value) &&
      numberKey(entry.value) === numberKey(expected.trim())
    );
  }
  return entry.value === expected.trim();
}
export function evaluateAssertions(rules, response) {
  const checked = validateAssertions(rules);
  let json;
  if (checked.some((r) => r.enabled && r.type.startsWith("json"))) {
    try {
      if (response.bytes.length > 1024 * 1024) throw new Error("large");
      json = responseValues(
        new TextDecoder("utf-8", { fatal: true }).decode(response.bytes),
      );
    } catch {
      json = {
        error:
          "JSON assertions require a complete UTF-8 JSON body up to 1 MiB.",
      };
    }
  }
  return checked.map((rule) => {
    if (!rule.enabled)
      return {
        id: rule.id,
        type: rule.type,
        target: rule.target,
        state: "skipped",
        message: "Disabled for this send.",
      };
    let pass = false,
      message = "";
    try {
      if (rule.type === "status") {
        if (
          !/^\d{3}$/.test(rule.expected) ||
          +rule.expected < 100 ||
          +rule.expected > 599
        )
          throw new Error("Enter an HTTP status from 100 to 599.");
        pass = response.status === +rule.expected;
        message = `Expected HTTP ${rule.expected}; received HTTP ${response.status}.`;
      } else if (rule.type === "duration") {
        const limit = Number(rule.expected);
        if (!rule.expected.trim() || !Number.isFinite(limit) || limit <= 0)
          throw new Error("Enter a positive duration in milliseconds.");
        pass = response.totalMs < limit;
        message = `Expected below ${limit} ms; received in ${Math.round(response.totalMs)} ms (total browser transport time).`;
      } else if (rule.type.startsWith("header")) {
        const name = rule.target.trim().toLowerCase();
        if (!name || !/^[!#$%&'*+.^_`|~\w-]+$/.test(name))
          throw new Error("Enter a valid header name.");
        const value = response.headers.find(
          ([key]) => key.toLowerCase() === name,
        )?.[1];
        pass =
          value !== undefined &&
          (rule.type === "headerExists" || value.includes(rule.expected));
        message =
          value === undefined
            ? "Header unavailable; it may be absent or hidden by browser CORS rules."
            : pass
              ? "Header check passed."
              : "Header did not contain the expected text (case-sensitive).";
      } else {
        if (json.error) throw new Error(json.error);
        if (
          rule.target !== "" &&
          (!rule.target.startsWith("/") || /~(?![01])/u.test(rule.target))
        )
          throw new Error(
            "Use a JSON Pointer such as /data/id; leave empty for the root.",
          );
        const entry = json.entries.find((e) => e.path === rule.target);
        pass =
          !!entry &&
          (rule.type === "jsonExists" || scalarEqual(entry, rule.expected));
        message = !entry
          ? "JSON path was not found."
          : pass
            ? "JSON check passed."
            : "JSON value did not equal the expected scalar.";
      }
      return {
        id: rule.id,
        type: rule.type,
        target: rule.target,
        state: pass ? "passed" : "failed",
        message,
      };
    } catch (error) {
      return {
        id: rule.id,
        type: rule.type,
        target: rule.target,
        state: "failed",
        message: error.message?.includes("JSON")
          ? error.message
          : rule.type.startsWith("json")
            ? "Enter a valid JSON scalar as the expected value."
            : error.message,
      };
    }
  });
}
