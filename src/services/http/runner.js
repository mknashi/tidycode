import { responseValues } from "./responseValues.js";
import { newVariable } from "./variables.js";
export async function runSequence({
  steps,
  settings,
  send,
  isStopped = () => false,
  onStep = () => {},
  stopOnFailure = true,
}) {
  if (!steps.length || steps.length > 200)
    throw new Error("Select 1–200 requests to run.");
  const captured = new Map(),
    results = [];
  for (const step of steps) {
    if (isStopped()) break;
    const request = {
      ...step.request,
      blockVariables: [
        ...(step.request.blockVariables || []),
        ...captured.values(),
      ],
    };
    onStep({ id: request.id, state: "running" });
    let result;
    try {
      result = await send(request, settings);
    } catch {
      result = { ok: false, error: new Error("Request could not execute.") };
    }
    if (isStopped()) {
      onStep({ id: request.id, state: "cancelled" });
      break;
    }
    let state = result?.ok ? "passed" : "failed",
      message =
        result?.error?.message ||
        (!result?.ok ? "HTTP response or assertion failure." : "");
    if (result?.ok && step.capture?.name) {
      try {
        const { name, path, overwrite } = step.capture;
        if (!/^[A-Za-z_][\w.-]{0,127}$/.test(name))
          throw new Error("Use a valid capture variable name.");
        const definitions = [
          ...settings.globals,
          ...Object.values(settings.collections).flat(),
          ...Object.values(settings.requests).flat(),
          ...settings.environments.flatMap((env) => env.variables),
          ...steps.flatMap((item) => [
            ...(item.request.fileVariables || []),
            ...(item.request.blockVariables || []),
          ]),
        ];
        if (
          !overwrite &&
          (captured.has(name) || definitions.some((row) => row.key === name))
        )
          throw new Error(
            "Allow overriding an existing variable for this run before capturing it.",
          );
        if (result.response.bytes.length > 1024 * 1024)
          throw new Error("Capture supports JSON responses up to 1 MiB.");
        const selected = responseValues(
          new TextDecoder("utf-8", { fatal: true }).decode(
            result.response.bytes,
          ),
        );
        if (selected.error) throw new Error(selected.error);
        const entry = selected.entries.find((row) => row.path === path);
        if (!entry) throw new Error("Capture JSON path was not found.");
        if (
          new TextEncoder().encode(entry.value).length > 65536 ||
          /\{\{[^{}]+\}\}/.test(entry.value)
        )
          throw new Error(
            "Captured values must fit 64 KiB and contain no variable-reference syntax.",
          );
        captured.set(name, {
          ...newVariable(),
          key: name,
          value: entry.value,
          secret: true,
        });
        message = "Captured a run-only secret variable for following steps.";
      } catch (error) {
        state = "failed";
        message = error.message;
      }
    }
    const summary = {
      id: request.id,
      state,
      message,
      status: result?.response?.status,
      totalMs: result?.response?.totalMs,
      assertions: result?.assertionResults?.map((row) => ({
        state: row.state,
      })),
    };
    results.push(summary);
    onStep(summary);
    if (state === "failed" && stopOnFailure) break;
  }
  return results;
}
