/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Function App origin in Azure (e.g. https://fabops-api.azurewebsites.net). Empty locally: the Vite dev server proxies /api. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
