import { validateDesktopNetwork } from "./desktopNetwork.js";
import { isDesktop } from "../../utils/platform.js";
import { prepareRequest } from "./request.js";
import { sendBrowserRequest } from "./webTransport.js";
export const transportKind = () => (isDesktop() ? "desktop" : "browser");
export const prepareApiRequest = (request) => {
  const prepared = prepareRequest(request, { native: isDesktop() });
  if (isDesktop()) validateDesktopNetwork(request.desktop, prepared.url.href);
  return prepared;
};
export async function sendApiRequest(request, options) {
  if (isDesktop()) {
    const { sendDesktopRequest } = await import("./desktopTransport.js");
    return sendDesktopRequest(request, options);
  }
  return sendBrowserRequest(request, options);
}
