import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import type { OutputBundle } from 'rolldown';
import { afterEach, describe, expect, it } from 'vitest';
import { precompress } from './precompress';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

// Writes the files as Vite would have, then runs the plugin's writeBundle over them.
function built(files: Record<string, string | Uint8Array>) {
  const dir = mkdtempSync(join(tmpdir(), 'precompress-'));
  dirs.push(dir);
  const bundle: Record<string, unknown> = {};
  for (const [fileName, content] of Object.entries(files)) {
    writeFileSync(join(dir, fileName.replaceAll('/', '_')), content);
    bundle[fileName] = { fileName: fileName.replaceAll('/', '_') };
  }
  const plugin = precompress();
  (plugin.writeBundle as (options: { dir: string }, bundle: OutputBundle) => void)({ dir }, bundle as OutputBundle);
  return (name: string) => join(dir, name);
}

const big = 'const king = "fluffy";\n'.repeat(200);

describe('precompress', () => {
  it('writes a brotli and a gzip copy of each built script and stylesheet, each decompressing to the original', () => {
    const file = built({ 'index-abc.js': big, 'index-def.css': big });

    for (const name of ['index-abc.js', 'index-def.css']) {
      expect(brotliDecompressSync(readFileSync(file(`${name}.br`))).toString()).toBe(big);
      expect(gunzipSync(readFileSync(file(`${name}.gz`))).toString()).toBe(big);
    }
  });

  it('compresses hard: the brotli copy is much smaller than the file', () => {
    const file = built({ 'index-abc.js': big });

    expect(readFileSync(file('index-abc.js.br')).length).toBeLessThan(big.length / 10);
  });

  it('leaves alone files that are tiny or already compressed (fonts, images)', () => {
    const file = built({ 'tiny.js': 'x', 'font.woff2': big, 'king.jpg': big, 'index.html': big });

    for (const name of ['tiny.js', 'font.woff2', 'king.jpg', 'index.html']) {
      expect(existsSync(file(`${name}.br`))).toBe(false);
      expect(existsSync(file(`${name}.gz`))).toBe(false);
    }
  });
});
