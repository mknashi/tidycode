import { diffLines } from "diff";
export const COMPARE_LIMIT = 128 * 1024;
const omittedHeader =
  /authorization|cookie|token|secret|password|api[-_]?key|^location$/i;
export function comparableHeaders(response) {
  return (response.headers || [])
    .filter(([name]) => !omittedHeader.test(name))
    .map(([name, value]) => [name.toLowerCase(), value])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");
}
function jsonChanges(left, right) {
  const paths = [];
  let work = 0;
  const walk = (a, b, path, depth) => {
    if (++work > 10000 || depth > 40 || paths.length >= 100)
      throw new Error("bounded");
    if (
      (typeof a === "number" &&
        !Number.isSafeInteger(a) &&
        Number.isInteger(a)) ||
      (typeof b === "number" && !Number.isSafeInteger(b) && Number.isInteger(b))
    )
      throw new Error("precision");
    if (Object.is(a, b)) return;
    if (
      a &&
      b &&
      typeof a === "object" &&
      typeof b === "object" &&
      Array.isArray(a) === Array.isArray(b)
    ) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const pointer =
          path + "/" + key.replaceAll("~", "~0").replaceAll("/", "~1");
        if (!Object.hasOwn(a, key) || !Object.hasOwn(b, key))
          paths.push({
            path: pointer,
            type: Object.hasOwn(a, key) ? "removed" : "added",
          });
        else walk(a[key], b[key], pointer, depth + 1);
        if (paths.length >= 100) throw new Error("bounded");
      }
    } else paths.push({ path, type: "changed" });
  };
  walk(JSON.parse(left), JSON.parse(right), "", 0);
  return paths;
}
export function compareResponses(baseline, current, section = "body") {
  if (!baseline)
    return {
      error:
        "Save a response snapshot first: Save locally → Include last response snapshot.",
    };
  if (!current || current.savedSnapshot || current.copiedSnapshot)
    return {
      error:
        "Send this request to compare a fresh response with the saved snapshot.",
    };
  let left, right;
  if (section === "headers") {
    left = comparableHeaders(baseline);
    right = comparableHeaders(current);
  } else {
    if (
      baseline.bytes.length > COMPARE_LIMIT ||
      current.bytes.length > COMPARE_LIMIT
    )
      return {
        error:
          "Body comparison supports responses up to 128 KiB. Download the responses to compare larger bodies.",
      };
    try {
      for (const response of [baseline, current]) {
        if (
          response.contentType &&
          !/json|xml|text|javascript|form-urlencoded/i.test(
            response.contentType,
          )
        )
          throw new Error("binary");
      }
      const decode = (bytes) =>
        new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
          bytes,
        );
      left = decode(baseline.bytes);
      right = decode(current.bytes);
      if (/[\u0000-\u0008\u000e-\u001f]/.test(left + right))
        throw new Error("binary");
    } catch {
      return {
        error:
          "Body comparison supports UTF-8 text and JSON. Binary bodies cannot be compared here.",
      };
    }
  }
  if (
    left.length + right.length > COMPARE_LIMIT * 2 ||
    left.split("\n").length + right.split("\n").length > 2000
  )
    return {
      error:
        "Comparison is too large to display safely. Download the responses for a full comparison.",
    };
  const changes = diffLines(left, right, { timeout: 50, maxEditLength: 2000 });
  if (!changes)
    return {
      error:
        "Comparison exceeded its processing limit. Download the responses for a full comparison.",
    };
  let paths = null;
  if (section === "body") {
    try {
      paths = jsonChanges(left, right);
    } catch {}
  }
  return { identical: left === right, changes, paths };
}
