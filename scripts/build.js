#!/usr/bin/env node

// Build and package the extension.
//
// Usage:
//   node scripts/build.js              — dev build to dist/ (unminified, includes hot-reload)
//   node scripts/build.js --watch      — dev build + auto-rebuild on changes
//   node scripts/build.js --package    — production build + zip (minified, no dev files)

import { build, context } from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');

const STATIC_FILES = ['styles.css', 'options.html', 'icon16.png', 'icon48.png', 'icon128.png'];
const STANDALONE_SCRIPTS = ['options', 'hot-reload'];

function copyFiles(files, srcDir = ROOT) {
  for (const file of files) {
    cpSync(resolve(srcDir, file), resolve(DIST, file));
  }
}

function writeManifest({ stripBackground = false } = {}) {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'manifest.json'), 'utf-8'));
  if (stripBackground) delete manifest.background;
  writeFileSync(resolve(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest.version;
}

async function buildStandaloneScripts(isPackage, scripts) {
  for (const name of scripts) {
    await build({
      entryPoints: [resolve(ROOT, `src/${name}.ts`)],
      outfile: resolve(DIST, `${name}.js`),
      bundle: true,
      format: 'iife',
      minify: isPackage,
    });
  }
}

async function main() {
  const isPackage = process.argv.includes('--package');
  const isWatch = process.argv.includes('--watch');

  // Clean dist/
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  const esbuildOptions = {
    entryPoints: [resolve(ROOT, 'src/main.ts')],
    bundle: true,
    minify: isPackage,
    outfile: resolve(DIST, 'content.js'),
    format: 'iife',
  };

  if (isWatch) {
    const ctx = await context(esbuildOptions);
    copyFiles(STATIC_FILES);
    await buildStandaloneScripts(false, STANDALONE_SCRIPTS);
    writeManifest();
    console.log('Watching for changes...');
    await ctx.watch();
  } else {
    await build(esbuildOptions);
    copyFiles(STATIC_FILES);

    if (isPackage) {
      // Production: strip dev files
      await buildStandaloneScripts(true, ['options']);
      const version = writeManifest({ stripBackground: true });
      const zipName = `hn-mod-${version}.zip`;
      execSync(`cd "${DIST}" && zip -r "${resolve(ROOT, zipName)}" .`);
      console.log(`Packaged v${version} → ${zipName}`);
    } else {
      // Dev: include hot-reload
      await buildStandaloneScripts(false, STANDALONE_SCRIPTS);
      const version = writeManifest();
      console.log(`Built v${version} → dist/`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
