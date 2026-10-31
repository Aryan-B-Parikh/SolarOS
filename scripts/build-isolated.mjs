import { spawnSync } from 'node:child_process';

// `next build` and `next dev` cannot share the same output directory: the dev
// server rewrites/removes files in `.next`, which breaks an in-flight build
// with errors like "Cannot find module for page: /_document". Building into a
// separate directory lets a production build run while the dev server is up.
const distDir = process.env.NEXT_DIST_DIR || '.next-build';

const result = spawnSync(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'build'],
  {
    stdio: 'inherit',
    env: { ...process.env, NEXT_DIST_DIR: distDir },
  },
);

process.exit(result.status ?? 1);
