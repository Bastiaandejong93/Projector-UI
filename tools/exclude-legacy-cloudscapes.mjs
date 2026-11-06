// Preserve the historical originals in public/ for local development and
// archive use, but never package the superseded full-frame plates in Luna.
import { access, rm } from 'node:fs/promises';
import { join } from 'node:path';

await access('dist/index.html');
const names = [
  'luna-cloudscape-v1.png', 'luna-cloudscape-v2.png', 'luna-cloudscape-v3.png',
  'luna-cloudscape-v4.png', 'luna-cloudscape-v5.png', 'luna-cloudscape-v6.png',
  'luna-cloudscape-v7-violet.png', 'luna-cloudscape-v8-amber.png', 'luna-cloudscape-v9-green.png',
];
for (const name of names) await rm(join('dist', 'assets', 'backgrounds', name), { force: true });
