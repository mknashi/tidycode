import test from "node:test";
import assert from "node:assert/strict";
import { createDesktopVault } from "../desktopVault.js";
function fixture() {
  const metadata = new Map(),
    secrets = new Map(),
    calls = [];
  let deny = false;
  const storage = {
    getItem: (k) => metadata.get(k) || null,
    setItem: (k, v) => metadata.set(k, v),
  };
  const invokeImpl = async (command, args) => {
    calls.push({ command, id: args.id });
    if (deny) throw new Error("SENSITIVE ERROR VALUE");
    if (command === "api_vault_get") return secrets.get(args.id) ?? null;
    if (command === "api_vault_set") secrets.set(args.id, args.value);
    if (command === "api_vault_delete") secrets.delete(args.id);
  };
  return {
    vault: createDesktopVault({ native: true, storage, invokeImpl }),
    metadata,
    secrets,
    calls,
    setDeny: (v) => (deny = v),
  };
}
test("vault values stay in OS store while catalog contains names and opaque ids only", async () => {
  const { vault, metadata, secrets, calls } = fixture();
  const row = await vault.save({
    name: "Salesforce Dev Secret",
    value: "SYNTHETIC_SECRET+&%",
  });
  assert.equal(secrets.get(row.id), "SYNTHETIC_SECRET+&%");
  assert.ok(!JSON.stringify([...metadata]).includes("SYNTHETIC_SECRET"));
  assert.deepEqual(vault.list(), [row]);
  assert.equal(calls.filter((c) => c.command === "api_vault_get").length, 0);
  assert.equal(await vault.load(row.id), "SYNTHETIC_SECRET+&%");
  await assert.rejects(
    () => vault.save({ ...row, value: "REPLACEMENT" }),
    /Confirm/,
  );
  assert.equal(secrets.get(row.id), "SYNTHETIC_SECRET+&%");
  await vault.save({ ...row, value: "REPLACEMENT", overwrite: true });
  assert.equal(await vault.load(row.id), "REPLACEMENT");
  await vault.remove(row.id);
  assert.equal(secrets.size, 0);
  assert.deepEqual(vault.list(), []);
});
test("OS rejection never falls back to plaintext and rolls back new catalog entry", async () => {
  const { vault, metadata, secrets, setDeny } = fixture();
  setDeny(true);
  await assert.rejects(
    () => vault.save({ name: "API token", value: "PRIVATE_VALUE" }),
    (e) =>
      /No plaintext fallback/.test(e.message) &&
      !e.message.includes("SENSITIVE"),
  );
  assert.deepEqual(vault.list(), []);
  assert.equal(secrets.size, 0);
  assert.ok(!JSON.stringify([...metadata]).includes("PRIVATE_VALUE"));
});
test("metadata failure blocks new keychain writes; missing credentials, references and duplicate names are explicit", async () => {
  let calls = 0;
  const broken = createDesktopVault({
    native: true,
    storage: {
      getItem: () => null,
      setItem: () => {
        throw Error();
      },
    },
    invokeImpl: async () => calls++,
  });
  await assert.rejects(() =>
    broken.save({ name: "token", value: "synthetic" }),
  );
  assert.equal(calls, 0);
  const { vault, secrets } = fixture();
  const row = await vault.save({ name: "token", value: "synthetic" });
  await assert.rejects(
    () => vault.save({ name: "TOKEN", value: "other" }),
    /already exists/,
  );
  secrets.clear();
  await assert.rejects(() => vault.load(row.id), /not found/);
  await vault.remove(row.id);
  assert.deepEqual(vault.list(), []);
  await assert.rejects(
    () => vault.save({ name: "token", value: "{{password}}" }),
    /literal/,
  );
});
test("web cannot invoke the OS vault", async () => {
  let calls = 0;
  const vault = createDesktopVault({
    native: false,
    storage: { getItem: () => null, setItem: () => {} },
    invokeImpl: async () => calls++,
  });
  await assert.rejects(() => vault.save({ name: "token", value: "synthetic" }));
  assert.equal(calls, 0);
});

test("variable persistence remembers only a valid vault identifier and keeps its secret value omitted", async () => {
  const { emptyVariables, newVariable, validateVariables } =
    await import("../variables.js");
  const settings = emptyVariables();
  const id = "00000000-0000-4000-8000-000000000001";
  settings.globals = [
    {
      ...newVariable(),
      key: "client_secret",
      value: "PRIVATE_VALUE",
      secret: true,
      vaultId: id,
    },
  ];
  const saved = validateVariables(settings, true);
  assert.equal(saved.globals[0].vaultId, id);
  assert.equal(saved.globals[0].value, "");
  settings.globals[0].vaultId = "invalid";
  assert.equal(validateVariables(settings, true).globals[0].vaultId, undefined);
  settings.globals[0] = {
    ...newVariable(),
    key: "public",
    value: "public",
    vaultId: id,
  };
  assert.equal(validateVariables(settings, true).globals[0].vaultId, undefined);
});
