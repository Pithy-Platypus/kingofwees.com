import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { Plugin } from 'vite';

// Scripts and stylesheets only: fonts and images are already compressed. Tiny files aren't worth a request header.
const COMPRESSIBLE = /\.(js|css)$/;
const MIN_BYTES = 1024;

/**
 * Writes `<file>.br` and `<file>.gz` beside every built script and stylesheet, compressed once at the highest
 * levels, so the server sends them as they are instead of compressing on every request (KingOfWees.Server/SpaFiles.cs).
 * Runs after the files are written, when the CSS and the final minified scripts are all there.
 */
export function precompress(): Plugin {
  return {
    name: 'precompress',
    apply: 'build',
    writeBundle({ dir = 'dist' }, bundle) {
      for (const { fileName } of Object.values(bundle)) {
        if (!COMPRESSIBLE.test(fileName)) continue;
        const path = join(dir, fileName);
        const bytes = readFileSync(path);
        if (bytes.length < MIN_BYTES) continue;
        writeFileSync(`${path}.br`, brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
        writeFileSync(`${path}.gz`, gzipSync(bytes, { level: 9 }));
      }
    },
  };
}
