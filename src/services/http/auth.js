import { credentialReference } from "./request.js";
export function safeAuth(request) {
  return {
    auth: ["none", "bearer", "basic", "apikey"].includes(request.auth)
      ? request.auth
      : "none",
    username: credentialReference(request.username),
    password: credentialReference(request.password),
    apiKeyName: request.apiKeyName || "",
    apiKeyValue: credentialReference(request.apiKeyValue),
    apiKeyIn: request.apiKeyIn === "query" ? "query" : "header",
  };
}
