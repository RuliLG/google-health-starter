import type { HealthBridge } from "@shared/types";

declare global {
  interface Window {
    health: HealthBridge;
  }
}
export {};
