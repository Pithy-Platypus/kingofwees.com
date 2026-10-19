/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** This build's version, from source/version.sh (set in vite.config.ts). */
  readonly VITE_APP_VERSION: string;
}
