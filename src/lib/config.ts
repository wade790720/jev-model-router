// Public deployment settings only. Never put API keys or admin secrets here.
export interface ServiceConfig { serviceUrl?: string; skoolUrl?: string }

export const SERVICE_CONFIG: Readonly<ServiceConfig> = Object.freeze({
  serviceUrl: "https://router.tekuei.com",
  skoolUrl: "https://www.skool.com/forge-1085/about"
});
