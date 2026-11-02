/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Preenchidas só por `./scripts/tv.sh --seed` (a partir do .env.local, nunca versionado). */
  readonly VITE_SEED_NAME?: string;
  readonly VITE_SEED_HOST?: string;
  readonly VITE_SEED_USER?: string;
  readonly VITE_SEED_PASS?: string;
  readonly VITE_SEED_TMDB?: string;
  /** Endereço do report-server no Mac para logs da TV (opcional). */
  readonly VITE_REPORT_URL?: string;
}

/** Versão do package.json, injetada no build (vite.config.ts). */
declare const __APP_VERSION__: string;
