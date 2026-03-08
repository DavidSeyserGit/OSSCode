import type { DesktopBridge } from "@t3tools/contracts";

export function readDesktopBridge(): DesktopBridge | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.desktopBridge;
}
