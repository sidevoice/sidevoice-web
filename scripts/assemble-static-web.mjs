#!/usr/bin/env node
// The web interface as a static site, in one directory, at the paths a room serves it from:
//
//   <out>/index.html            → redirects to /voice/
//   <out>/voice/                → apps/web/dist (index.html, assets/, target.js, …)
//
// It holds no secret and names no server: whoever serves it says where it points by writing
// window.__SIDEVOICE_TARGET__ into /voice/target.js (`apps/web/public/target.js`). The desktop app bundles this
// same layout (sidevoice/sidevoice-desktop scripts/vendor-web.mjs); deploy/web-static/ serves it with nginx.
//
//   npm run build -w @sidevoice/protocol -w @sidevoice/web
//   node scripts/assemble-static-web.mjs <out>
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The static site's `voice/target.js`: no target unless one was set before it ran. */
const STATIC_TARGET = '/* No room or node at this origin: a static site. Whoever serves it may replace this file with one line,\n'
  + ' * window.__SIDEVOICE_TARGET__ = "https://…"; and the desktop app sets it before this runs. */\n'
  + 'if (window.__SIDEVOICE_TARGET__ === undefined) window.__SIDEVOICE_TARGET__ = null;\n';
const out = path.resolve(process.argv[2] || path.join(root, 'dist/static-web'));
const web = path.join(root, 'apps/web/dist');
if (!existsSync(path.join(web, 'index.html'))) { console.error('missing apps/web/dist/index.html: build the web first'); process.exit(1); }
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(web, path.join(out, 'voice'), { recursive: true });
// A static site: nothing at its own origin answers for a room or a node, unless whoever serves it names one (the
// desktop app injects it first, an image replaces this file).
writeFileSync(path.join(out, 'voice/target.js'), STATIC_TARGET);
writeFileSync(path.join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/voice/"><a href="/voice/">Sidevoice</a>\n');
console.log(`static web interface assembled in ${path.relative(process.cwd(), out) || '.'}`);
