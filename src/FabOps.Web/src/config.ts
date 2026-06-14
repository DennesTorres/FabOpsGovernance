/**
 * API base resolution. The SPA calls the Function App directly (NOT through the Static Web
 * App's /api proxy, whose 45-second request limit would cut off long agent runs — see
 * docs/DECISIONS.md D02). In Azure the origin is baked in at build time; locally it is empty
 * and the Vite dev server proxies /api to the Functions host.
 */
export const API_BASE: string = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ?? "";

export const apiUrl = (path: string): string => `${API_BASE}${path}`;
