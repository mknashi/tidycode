export const EXECUTION_BODY_LIMIT = 64 * 1024 * 1024;
export function retainExecution(executions, id, execution) {
  const next = { ...executions, [id]: execution };
  const bodies = Object.entries(next)
    .filter(([, item]) => item.response)
    .sort(
      (a, b) =>
        (a[1].response.receivedAt || 0) - (b[1].response.receivedAt || 0),
    );
  let size = bodies.reduce(
    (sum, [, item]) =>
      sum + (item.response.size || item.response.bytes?.byteLength || 0),
    0,
  );
  for (const [key, item] of bodies) {
    if (size <= EXECUTION_BODY_LIMIT) break;
    if (key === id) continue;
    size -= item.response.size || item.response.bytes?.byteLength || 0;
    const { response, ...rest } = item;
    next[key] = {
      ...rest,
      notice:
        "The earlier response body was released to keep memory bounded. Send explicitly for a fresh response.",
    };
  }
  return next;
}
