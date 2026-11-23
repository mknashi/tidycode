import {
  emptyVariables,
  validateVariables,
  newVariable,
  credentialVariable,
} from "./variables.js";
export function parseEnvironments(source, allSecret = true) {
  if (new TextEncoder().encode(source).length > 1024 * 1024)
    throw new Error("Environment files must be JSON up to 1 MiB.");
  let doc;
  try {
    doc = JSON.parse(source);
  } catch {
    throw new Error("Choose a valid JSON environment file.");
  }
  const environments = [];
  const rows = (entries) =>
    entries.map(([key, value, enabled = true, secret = false]) => {
      if (value !== null && typeof value === "object")
        throw new Error(
          "Use primitive environment values or nested public environment objects.",
        );
      if (
        typeof value === "number" &&
        !Number.isSafeInteger(value) &&
        Number.isInteger(value)
      )
        throw new Error(
          "Quote large numeric environment values to preserve precision.",
        );
      return {
        ...newVariable(),
        key,
        value: value == null ? "" : String(value),
        enabled,
        secret: allSecret || secret || credentialVariable(key),
      };
    });
  if (Array.isArray(doc?.values))
    environments.push({
      id: crypto.randomUUID(),
      name: doc.name || "Imported environment",
      production: /prod/i.test(doc.name || ""),
      variables: rows(
        doc.values.map((row) => [
          row.key,
          row.value,
          row.enabled !== false,
          row.type === "secret",
        ]),
      ),
    });
  else {
    if (!doc || typeof doc !== "object" || Array.isArray(doc))
      throw new Error(
        "Use a Postman environment or a named JSON environment map.",
      );
    for (const [name, values] of Object.entries(doc)) {
      if (!values || typeof values !== "object" || Array.isArray(values))
        throw new Error("Each environment needs an object of variables.");
      const entries = [];
      const walk = (value, prefix = "", depth = 0) => {
        if (depth > 8) throw new Error("Environment nesting exceeds 8 levels.");
        for (const [key, item] of Object.entries(value)) {
          const full = prefix ? prefix + "." + key : key;
          if (item && typeof item === "object" && !Array.isArray(item))
            walk(item, full, depth + 1);
          else if (Array.isArray(item))
            throw new Error(
              "Use strings for array-valued environment variables.",
            );
          else entries.push([full, item]);
        }
      };
      walk(values);
      environments.push({
        id: crypto.randomUUID(),
        name,
        production: /prod/i.test(name),
        variables: rows(entries),
      });
    }
  }
  if (!environments.length) throw new Error("No environments found.");
  return validateVariables({ ...emptyVariables(), environments }).environments;
}
