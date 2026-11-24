import { HttpError } from "./request.js";
export const DEFAULT_DESKTOP_NETWORK = {
  verifyTls: true,
  caPem: "",
  proxyUrl: "",
  proxyUsername: "",
  proxyPassword: "",
  insecureConfirmed: false,
};
export function validateDesktopNetwork(settings, targetUrl) {
  if (!settings) return null;
  let target;
  try {
    target = new URL(targetUrl);
  } catch {
    throw new HttpError(
      "validation",
      "Resolve the destination before applying desktop network settings.",
    );
  }
  if (!settings.origin || settings.origin !== target.origin)
    throw new HttpError(
      "network_settings",
      "The destination changed. Review desktop TLS/proxy settings for this destination or reset them.",
    );
  const verifyTls = settings.verifyTls !== false;
  if (!verifyTls && !settings.insecureConfirmed)
    throw new HttpError(
      "validation",
      "Confirm disabling TLS verification for this destination.",
    );
  const caPem = settings.caPem || "",
    proxyUrl = (settings.proxyUrl || "").trim(),
    proxyUsername = settings.proxyUsername || "",
    proxyPassword = settings.proxyPassword || "";
  if (
    typeof caPem !== "string" ||
    new TextEncoder().encode(caPem).length > 131072 ||
    /PRIVATE KEY/.test(caPem)
  )
    throw new HttpError(
      "validation",
      "Use a CA certificate PEM up to 128 KiB, without private keys.",
    );
  if (caPem && !caPem.includes("-----BEGIN CERTIFICATE-----"))
    throw new HttpError("validation", "Use PEM encoded CA certificates.");
  if (proxyUrl) {
    let proxy;
    try {
      proxy = new URL(proxyUrl);
    } catch {
      throw new HttpError("validation", "Use a complete HTTP(S) proxy URL.");
    }
    if (
      !["http:", "https:"].includes(proxy.protocol) ||
      proxy.username ||
      proxy.password ||
      proxy.pathname !== "/" ||
      proxy.search ||
      proxy.hash
    )
      throw new HttpError(
        "validation",
        "Use an HTTP(S) proxy host/port without paths, query, or embedded credentials.",
      );
  }
  if (!proxyUrl && (proxyUsername || proxyPassword))
    throw new HttpError(
      "validation",
      "Enter a proxy URL before setting proxy credentials.",
    );
  if (
    [proxyUsername, proxyPassword].some(
      (value) =>
        typeof value !== "string" ||
        new TextEncoder().encode(value).length > 65536 ||
        /[\r\n]/.test(value),
    )
  )
    throw new HttpError(
      "validation",
      "Proxy credentials must be single-line values up to 64 KiB.",
    );
  return {
    origin: target.origin,
    verifyTls,
    caPem,
    proxyUrl,
    proxyUsername,
    proxyPassword,
    insecureConfirmed: !verifyTls,
  };
}
