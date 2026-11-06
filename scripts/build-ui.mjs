// Bundles ui/src into dist/ for the Tauri window. Pass --watch to rebuild on change.
import { build, context } from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
copyFileSync('ui/index.html', 'dist/index.html');

const options = {
  entryPoints: ['ui/src/app.js'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022', 'safari16'],
  outfile: 'dist/app.js',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
