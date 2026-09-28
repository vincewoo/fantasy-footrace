import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('global.css defines exactly 78 keyframes', () => {
  const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), 'styles/global.css');
  const css = readFileSync(cssPath, 'utf8');
  const matches = css.match(/@keyframes /g);

  expect(matches?.length ?? 0).toBe(78);
});
