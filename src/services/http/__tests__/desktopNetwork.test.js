import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DESKTOP_NETWORK,
  validateDesktopNetwork,
} from "../desktopNetwork.js";
import { createRequest } from "../request.js";
import { savedTemplate } from "../store.js";
import { emptyVariables, newVariable, resolveVariables } from "../variables.js";
const settings = (patch) => ({
  ...DEFAULT_DESKTOP_NETWORK,
  origin: "https://example.test",
  ...patch,
});
test("desktop network settings require origin review and explicit insecure confirmation", () => {
  assert.equal(validateDesktopNetwork(undefined, "https://example.test"), null);
  assert.throws(
    () =>
      validateDesktopNetwork(
        settings({ verifyTls: false }),
        "https://example.test",
      ),
    /Confirm/,
  );
  assert.equal(
    validateDesktopNetwork(
      settings({ verifyTls: false, insecureConfirmed: true }),
      "https://example.test",
    ).verifyTls,
    false,
  );
  assert.throws(
    () => validateDesktopNetwork(settings({}), "https://other.test"),
    (e) => e.code === "network_settings",
  );
  for (const proxyUrl of [
    "http://user:password@localhost:8080",
    "socks5://localhost:1080",
    "https://proxy.test/path",
    "https://proxy.test?token=private",
  ])
    assert.throws(() =>
      validateDesktopNetwork(settings({ proxyUrl }), "https://example.test"),
    );
  assert.throws(
    () =>
      validateDesktopNetwork(
        settings({ caPem: "-----BEGIN PRIVATE KEY-----" }),
        "https://example.test",
      ),
    /CA/,
  );
  assert.throws(
    () =>
      validateDesktopNetwork(
        settings({ proxyPassword: "secret" }),
        "https://example.test",
      ),
    /proxy URL/,
  );
});
test("proxy auth resolves secret variables without persisting private settings or exporting insecure TLS", () => {
  const request = createRequest({
    url: "https://example.test",
    desktop: settings({
      proxyUrl: "http://localhost:8080",
      proxyUsername: "tester",
      proxyPassword: "{{proxy_password}}",
      verifyTls: false,
      insecureConfirmed: true,
    }),
  });
  const vars = emptyVariables();
  vars.globals = [
    {
      ...newVariable(),
      key: "proxy_password",
      secret: true,
      value: "SYNTHETIC_PROXY_SECRET+&",
    },
  ];
  const result = resolveVariables(request, vars);
  assert.equal(result.error, undefined);
  assert.equal(
    result.request.desktop.proxyPassword,
    "SYNTHETIC_PROXY_SECRET+&",
  );
  assert.equal(
    result.used.find((r) => r.key === "proxy_password").preview,
    "••••••••",
  );
  const template = savedTemplate(result.request, {
    body: true,
    headers: true,
    query: true,
  });
  assert.equal(template.desktop, undefined);
  assert.ok(!JSON.stringify(template).includes("SYNTHETIC_PROXY_SECRET"));
});
