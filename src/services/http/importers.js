import yaml from "js-yaml";
import { applyQuery, createRequest, newRow, queryRows } from "./request.js";
export const IMPORT_LIMIT = 10 * 1024 * 1024;
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const sensitive = /authorization|cookie|token|secret|password|api[-_]?key/i;
const text = (value) => (value == null ? "" : String(value));
function shellWords(source) {
  if (/\$\(|`|[\r\n]\s*(?!\\)curl\b/.test(source))
    throw new Error(
      "Shell substitutions and multiple commands are not supported. Paste one literal cURL request.",
    );
  const words = [];
  let word = "",
    quote = "",
    started = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "\\" && quote !== "'") {
      if (source[i + 1] === "\n") {
        i++;
        continue;
      }
      if (i + 1 >= source.length) throw new Error("Incomplete cURL escape.");
      word += source[++i];
      started = true;
      continue;
    }
    if (quote) {
      if (c === quote) quote = "";
      else word += c;
      started = true;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      started = true;
      continue;
    }
    if (/[;|&<>]/.test(c))
      throw new Error(
        "Shell operators are not supported. Quote URLs and data values.",
      );
    if (/\s/.test(c)) {
      if (started) {
        words.push(word);
        word = "";
        started = false;
      }
    } else {
      word += c;
      started = true;
    }
  }
  if (quote) throw new Error("A cURL quote is not closed.");
  if (started) words.push(word);
  return words;
}
function parseCurl(source, warnings) {
  const words = shellWords(source.replace(/\\\r\n/g, "\\\n"));
  if (words.shift() !== "curl")
    throw new Error("The command must start with curl.");
  const r = createRequest({ name: "Imported cURL", headers: [] });
  let explicit = false;
  let query = false;
  const data = [];
  while (words.length) {
    let flag = words.shift();
    if (!flag.startsWith("-")) {
      if (r.url) throw new Error("Only one URL per cURL import is supported.");
      r.url = flag;
      continue;
    }
    const equal = flag.indexOf("=");
    if (flag.startsWith("--") && equal > 0) {
      words.unshift(flag.slice(equal + 1));
      flag = flag.slice(0, equal);
    }
    if (/^-[XHdub].+/.test(flag)) {
      words.unshift(flag.slice(2));
      flag = flag.slice(0, 2);
    }
    const argument = () => {
      if (!words.length) throw new Error(`Missing value for ${flag}.`);
      return words.shift();
    };
    if (["-X", "--request"].includes(flag)) {
      r.method = argument().toUpperCase();
      explicit = true;
    } else if (flag === "--url") r.url = argument();
    else if (["-H", "--header"].includes(flag)) {
      const value = argument();
      const colon = value.indexOf(":");
      if (colon < 1)
        throw new Error("A cURL header must contain a name and colon.");
      const row = newRow(
        value.slice(0, colon).trim(),
        value.slice(colon + 1).trim(),
      );
      if (/^cookie$/i.test(row.key)) {
        row.enabled = false;
        warnings.add(
          "Cookie headers are imported disabled because the browser cannot set them.",
        );
      }
      r.headers.push(row);
    } else if (
      [
        "-d",
        "--data",
        "--data-raw",
        "--data-binary",
        "--data-urlencode",
        "--json",
      ].includes(flag)
    ) {
      const value = argument();
      if (value.startsWith("@") && flag !== "--data-raw")
        throw new Error(
          "cURL file references are not imported. Paste literal body data instead.",
        );
      data.push(value);
      if (flag === "--json") {
        r.bodyMode = "json";
        r.headers.push(newRow("Content-Type", "application/json"));
      } else if (flag === "--data-urlencode")
        warnings.add(
          "URL-encoded data is imported literally; check its encoding before sending.",
        );
    } else if (["-u", "--user"].includes(flag)) {
      const value = argument();
      const colon = value.indexOf(":");
      r.auth = "basic";
      r.username = colon < 0 ? value : value.slice(0, colon);
      r.password = colon < 0 ? "" : value.slice(colon + 1);
    } else if (["-I", "--head"].includes(flag)) {
      r.method = "HEAD";
      explicit = true;
    } else if (["-G", "--get"].includes(flag)) query = true;
    else if (["-L", "--location"].includes(flag))
      warnings.add(
        "Redirect-following was not imported. Browser requests block redirects.",
      );
    else if (["-k", "--insecure"].includes(flag))
      warnings.add(
        "Insecure TLS was not imported. Browser TLS verification remains enabled.",
      );
    else if (
      [
        "-s",
        "--silent",
        "-S",
        "--show-error",
        "-v",
        "--verbose",
        "--compressed",
        "--globoff",
      ].includes(flag)
    ) {
    } else
      throw new Error(
        `Unsupported cURL option: ${flag}. Remove it and retry; no command was executed.`,
      );
  }
  if (data.length) {
    r.body = data.join("&");
    if (query) {
      r.url = applyQuery(r.url, [
        ...queryRows(r.url),
        ...queryRows("?" + r.body),
      ]);
      r.body = "";
      r.method = "GET";
    } else {
      if (!explicit) r.method = "POST";
      if (r.bodyMode === "none") {
        r.bodyMode = "form";
        if (
          r.headers.some(
            (h) => /content-type/i.test(h.key) && /json/i.test(h.value),
          )
        )
          r.bodyMode = "json";
      }
    }
  }
  return [r];
}
function auth(request, value, warnings) {
  if (!value || value.type === "noauth") return;
  const pairs = Object.fromEntries(
    (value[value.type] || []).map((v) => [v.key, text(v.value)]),
  );
  if (value.type === "bearer") {
    request.auth = "bearer";
    request.token = pairs.token || "";
  } else if (value.type === "basic") {
    request.auth = "basic";
    request.username = pairs.username || "";
    request.password = pairs.password || "";
  } else if (value.type === "apikey") {
    request.auth = "apikey";
    request.apiKeyName = pairs.key || "";
    request.apiKeyValue = pairs.value || "";
    request.apiKeyIn = pairs.in === "query" ? "query" : "header";
  } else
    warnings.add(
      `Authentication type ${value.type} is not imported. Configure authentication before sending.`,
    );
}
function parsePostman(doc, folders, warnings) {
  const collection = doc.collection || doc;
  if (
    !Array.isArray(collection.item) ||
    !text(collection.info?.schema).includes("/v2.1.0/")
  )
    throw new Error(
      "Choose a Postman Collection v2.1 export. Environment files are not collections.",
    );
  const requests = [];
  function walk(items, parent, inherit, depth) {
    if (depth > 12)
      throw new Error("Collection folder nesting exceeds 12 levels.");
    for (const item of items) {
      if (item.event?.length)
        warnings.add(
          "Postman scripts were skipped and will never be executed.",
        );
      if (item.variable?.length)
        warnings.add(
          "Imported variable declarations were not copied. Define their values in Variables before sending.",
        );
      const inherited = item.auth || inherit;
      if (Array.isArray(item.item)) {
        const folder = {
          id: crypto.randomUUID(),
          name: text(item.name) || "Folder",
          parentId: parent,
        };
        folders.push(folder);
        if (folders.length > 200)
          throw new Error("Import at most 200 folders.");
        walk(item.item, folder.id, inherited, depth + 1);
        continue;
      }
      const spec =
        typeof item.request === "string" ? { url: item.request } : item.request;
      if (!spec) continue;
      const u = spec.url;
      let url = typeof u === "string" ? u : text(u?.raw);
      if (!url && u?.host)
        url = `${u.protocol || "https"}://${Array.isArray(u.host) ? u.host.join(".") : u.host}/${Array.isArray(u.path) ? u.path.join("/") : u.path || ""}`;
      const r = createRequest({
        name: text(item.name) || "Request",
        method: text(spec.method || "GET").toUpperCase(),
        url,
        folderId: parent,
        headers: (spec.header || []).map((h) => ({
          ...newRow(text(h.key), text(h.value)),
          enabled: !h.disabled,
        })),
      });
      if (Array.isArray(u?.query)) {
        r.importParams = u.query.map((p) => ({
          ...newRow(text(p.key), text(p.value)),
          enabled: !p.disabled,
        }));
        r.url = applyQuery(url, r.importParams);
      }
      if (spec.body?.mode === "raw") {
        r.body = text(spec.body.raw);
        r.bodyMode =
          spec.body.options?.raw?.language === "json" ||
          r.headers.some(
            (h) => /^content-type$/i.test(h.key) && /json/i.test(h.value),
          )
            ? "json"
            : "text";
      } else if (spec.body?.mode === "urlencoded") {
        r.body = new URLSearchParams(
          (spec.body.urlencoded || [])
            .filter((p) => !p.disabled)
            .map((p) => [text(p.key), text(p.value)]),
        ).toString();
        r.bodyMode = "form";
      } else if (spec.body?.mode)
        warnings.add(
          `Body mode ${spec.body.mode} was skipped. Review the request body before sending.`,
        );
      if (item.response?.length)
        warnings.add("Postman example responses were not imported.");
      const beforeAuth = r.url;
      auth(r, spec.auth || inherited, warnings);
      if (r.importParams && r.url !== beforeAuth)
        r.importParams.push(
          ...queryRows(r.url).slice(queryRows(beforeAuth).length),
        );
      requests.push(r);
      if (requests.length > 200 || folders.length > 200)
        throw new Error(
          "Import at most 200 requests and 200 folders at a time.",
        );
    }
  }
  if (collection.event?.length)
    warnings.add("Postman scripts were skipped and will never be executed.");
  if (collection.variable?.length)
    warnings.add(
      "Imported variable declarations were not copied. Define their values in Variables before sending.",
    );
  walk(collection.item, null, collection.auth, 0);
  return {
    name: text(collection.info?.name) || "Postman collection",
    requests,
  };
}
function parseHttp(source, warnings) {
  if (/^[<>]\s*(?:\{%|\.\/|\/)/m.test(source))
    throw new Error(
      "HTTP-file scripts and file references are not supported. Remove them before importing.",
    );
  const requests = [];
  const titledSource=source.replace(/^([ \t]*)###([^\r\n]*)/gm, '###\n# $2');
  for (const block of titledSource.split(/^\s*###\s*/m).filter(Boolean)) {
    const lines = block.replace(/\r\n/g, "\n").split("\n");
    let index = lines.findIndex((l) =>
      /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+/i.test(l),
    );
    if (index < 0) continue;
    if (lines.slice(0, index).some((l) => /^\s*@/.test(l)))
      warnings.add(
        "HTTP-file variable declarations were not imported. Define their values in Variables before sending.",
      );
    const match = lines[index++].match(
      /^(\w+)\s+(\S+)(?:\s+HTTP\/[\d.]+)?\s*$/,
    );
    if (!match) throw new Error("Invalid HTTP request line.");
    const r = createRequest({
      method: match[1].toUpperCase(),
      url: match[2],
      name:
        lines
          .slice(0, index - 1)
          .map((l) => l.replace(/^\s*#\s*/, "").trim())
          .find((l) => l && !l.startsWith("@")) || match[1] + " " + match[2],
      headers: [],
    });
    while (index < lines.length && lines[index].trim()) {
      const line = lines[index++];
      if (line.startsWith("#")) continue;
      const colon = line.indexOf(":");
      if (colon < 1) throw new Error("Invalid HTTP-file header.");
      r.headers.push(
        newRow(line.slice(0, colon).trim(), line.slice(colon + 1).trim()),
      );
    }
    r.body = lines
      .slice(index + 1)
      .join("\n")
      .trim();
    if (/^\s*[<>]\s+/m.test(r.body))
      throw new Error(
        "HTTP-file scripts and file references are not supported.",
      );
    if (r.body) {
      r.bodyMode = r.headers.some(
        (h) => /^content-type$/i.test(h.key) && /json/i.test(h.value),
      )
        ? "json"
        : "text";
    }
    requests.push(r);
    if (requests.length > 200)
      throw new Error("Import at most 200 requests at a time.");
  }
  return requests;
}
function parseOpenApi(doc, warnings) {
  if (
    !/^3\./.test(text(doc.openapi)) ||
    !doc.paths ||
    typeof doc.paths !== "object"
  )
    throw new Error("Choose an OpenAPI 3 JSON or YAML document.");
  const requests = [];
  function resolve(obj, depth = 0) {
    if (!obj?.$ref) return obj;
    if (depth > 12) throw new Error("OpenAPI reference nesting is too deep.");
    if (!obj.$ref.startsWith("#/")) {
      warnings.add(
        "External OpenAPI references were not fetched. Referenced fields may be missing.",
      );
      return {};
    }
    const keys = obj.$ref
      .slice(2)
      .split("/")
      .map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~"));
    if (keys.some((k) => ["__proto__", "prototype", "constructor"].includes(k)))
      throw new Error("Invalid OpenAPI reference.");
    let value = doc;
    for (const key of keys) value = value?.[key];
    return resolve(value || {}, depth + 1);
  }
  for (const [path, pathValue] of Object.entries(doc.paths)) {
    const pathItem = resolve(pathValue);
    for (const [verb, operationValue] of Object.entries(pathItem || {})) {
      if (!methods.includes(verb.toUpperCase())) continue;
      const op = resolve(operationValue);
      const servers = op.servers || pathItem.servers || doc.servers || [];
      if (servers.length > 1)
        warnings.add("Only the first applicable OpenAPI server was used.");
      const server = servers[0];
      let base = text(server?.url) || "{{base_url}}";
      if (server)
        base = base.replace(
          /\{([^{}]+)\}/g,
          (match, key) =>
            text(server?.variables?.[key]?.default) || `{{${key}}}`,
        );
      if (!/^https?:\/\//.test(base) && !base.startsWith("{{")) {
        base = "{{base_url}}" + base;
        warnings.add(
          "Relative OpenAPI server URLs need a base_url value before sending.",
        );
      }
      const r = createRequest({
        name:
          text(op.summary || op.operationId) || verb.toUpperCase() + " " + path,
        method: verb.toUpperCase(),
        url: base.replace(/\/$/, "") + path.replace(/\{([^{}]+)\}/g, "{{$1}}"),
        headers: [],
      });
      const params = [
        ...new Map(
          [...(pathItem.parameters || []), ...(op.parameters || [])]
            .map((p) => resolve(p))
            .map((p) => [`${p.in}:${p.name}`, p]),
        ).values(),
      ];
      const query = [];
      for (const param of params) {
        const schema = resolve(param.schema);
        if (["array", "object"].includes(schema?.type))
          warnings.add(
            "Complex OpenAPI parameter serialization is not imported. Review array/object parameters before sending.",
          );
        const value = text(
          param.example ??
            schema?.default ??
            (param.required ? `{{${param.name}}}` : ""),
        );
        if (param.in === "query") query.push(newRow(text(param.name), value));
        else if (param.in === "header")
          r.headers.push(newRow(text(param.name), value));
        else if (param.in === "path" && value && !value.startsWith("{{"))
          r.url = r.url.replaceAll(
            `{{${param.name}}}`,
            encodeURIComponent(value),
          );
      }
      if (query.length) r.url = applyQuery(r.url, query);
      const body = resolve(op.requestBody);
      const content = body?.content || {};
      if (content["application/json"]) {
        const media = content["application/json"];
        r.bodyMode = "json";
        r.body = JSON.stringify(
          media.example ??
            Object.values(media.examples || {})
              .map((e) => resolve(e).value)
              .find((v) => v !== undefined) ??
            {},
          null,
          2,
        );
        if (!media.example && !media.examples)
          warnings.add(
            "Schema-only JSON bodies start as {}. Fill required fields before sending.",
          );
      } else if (content["application/x-www-form-urlencoded"]) {
        r.bodyMode = "form";
        const schema = resolve(
          content["application/x-www-form-urlencoded"].schema,
        );
        r.body = new URLSearchParams(
          Object.entries(schema?.properties || {}).map(([k, v]) => [
            k,
            text(resolve(v)?.example ?? resolve(v)?.default),
          ]),
        ).toString();
      } else if (Object.keys(content).length)
        warnings.add(
          "An unsupported OpenAPI body type was skipped. Review before sending.",
        );
      const security = op.security ?? doc.security;
      if (security?.length) {
        const key = Object.keys(security[0])[0];
        const scheme = resolve(doc.components?.securitySchemes?.[key]);
        if (security.length > 1 || Object.keys(security[0]).length > 1)
          warnings.add("Only the first OpenAPI security scheme was mapped.");
        if (scheme?.type === "http" && scheme.scheme === "bearer")
          r.auth = "bearer";
        else if (scheme?.type === "http" && scheme.scheme === "basic")
          r.auth = "basic";
        else if (scheme?.type === "apiKey") {
          if (["query", "header"].includes(scheme.in)) {
            r.auth = "apikey";
            r.apiKeyName = scheme.name;
            r.apiKeyValue = "{{api_key}}";
            r.apiKeyIn = scheme.in;
          } else
            warnings.add(
              "Cookie authentication is unavailable in browser transport.",
            );
        } else
          warnings.add(
            "Configure this OpenAPI operation’s authentication before sending.",
          );
      }
      requests.push(r);
      if (requests.length > 200)
        throw new Error("Import at most 200 requests at a time.");
    }
  }
  return { name: text(doc.info?.title) || "OpenAPI collection", requests };
}
export function parseImport(source, format = "auto", filename = "") {
  if (
    typeof source !== "string" ||
    new TextEncoder().encode(source).length > IMPORT_LIMIT
  )
    throw new Error("Import files must be text and no larger than 10 MiB.");
  const input = source.trim();
  if (!input) throw new Error("Choose a file or paste a request first.");
  const warnings = new Set();
  const folders = [];
  let parsed;
  let name = filename.replace(/\.[^.]+$/, "") || "Imported requests";
  if (format === "curl" || (format === "auto" && /^curl\s/.test(input))) {
    format = "curl";
    parsed = { requests: parseCurl(input, warnings) };
  } else if (
    format === "http" ||
    (format === "auto" &&
      (/\.http$/i.test(filename) ||
        /^(?:###|GET\s|POST\s|PUT\s|DELETE\s|PATCH\s|HEAD\s|OPTIONS\s)/m.test(
          input,
        )))
  ) {
    format = "http";
    parsed = { requests: parseHttp(input, warnings) };
  } else {
    let doc;
    try {
      doc = input.startsWith("{")
        ? JSON.parse(input)
        : yaml.load(input, { schema: yaml.JSON_SCHEMA });
    } catch {
      throw new Error("The import is not valid JSON or YAML.");
    }
    if (!doc || typeof doc !== "object")
      throw new Error(
        "Choose a collection, OpenAPI document, cURL command, or .http file.",
      );
    if (
      format === "postman" ||
      (format === "auto" && (doc.item || doc.collection))
    ) {
      format = "postman";
      parsed = parsePostman(doc, folders, warnings);
    } else if (format === "openapi" || (format === "auto" && doc.openapi)) {
      format = "openapi";
      parsed = parseOpenApi(doc, warnings);
    } else
      throw new Error(
        "Unrecognized format. Choose Postman v2.1, OpenAPI 3, cURL, or .http.",
      );
  }
  if (!parsed.requests.length)
    throw new Error("No supported HTTP requests were found.");
  if (parsed.requests.length > 200 || folders.length > 200)
    throw new Error("Import at most 200 requests and folders at a time.");
  const collection = {
    id: crypto.randomUUID(),
    name: parsed.name || name,
    folders,
  };
  let credentials = 0;
  const hosts = new Set();
  let placeholders = false;
  const requests = parsed.requests.map((r) => {
    if (
      r.name.length > 500 ||
      r.headers.length > 500 ||
      queryRows(r.url).length > 500
    )
      throw new Error(
        "A request exceeds the 500-character name or 500-field import limit.",
      );
    if (!methods.includes(r.method))
      throw new Error(`Unsupported HTTP method: ${r.method}`);
    if (!r.url || (/^\w+:/i.test(r.url) && !/^https?:/i.test(r.url)))
      throw new Error("Only HTTP/HTTPS request URLs can be imported.");
    if (/^https?:/i.test(r.url)) {
      let url;
      try {
        url = new URL(r.url);
      } catch {
        throw new Error("An imported request URL is invalid.");
      }
      if (url.username || url.password)
        throw new Error(
          "Remove credentials embedded in URLs before importing.",
        );
      hosts.add(url.origin);
    } else hosts.add("Unresolved base URL");
    r.params = r.importParams || queryRows(r.url);
    delete r.importParams;
    if (r.body && ["GET", "HEAD"].includes(r.method))
      warnings.add(
        "GET/HEAD body drafts are preserved but will not be sent by browser transport.",
      );
    r.collectionId = collection.id;
    r.folderId = r.folderId || null;
    if (
      r.token ||
      r.username ||
      r.password ||
      r.apiKeyValue ||
      r.headers.some((h) => sensitive.test(h.key) && h.value) ||
      r.params.some((p) => sensitive.test(p.key) && p.value)
    )
      credentials++;
    if (
      /\{\{/.test(
        JSON.stringify([
          r.url,
          r.body,
          r.token,
          r.headers,
          r.username,
          r.password,
          r.apiKeyName,
          r.apiKeyValue,
        ]),
      )
    )
      placeholders = true;
    for (const h of r.headers)
      if (/^cookie$/i.test(h.key)) {
        h.enabled = false;
        warnings.add(
          "Cookie headers are imported disabled in browser transport.",
        );
      }
    return r;
  });
  if (placeholders)
    warnings.add(
      "Define unresolved {{variables}} in Variables or an environment before sending.",
    );
  return {
    format,
    collection,
    requests,
    warnings: [...warnings],
    hosts: [...hosts],
    credentials,
  };
}
