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
const out = path.resolve(process.argv[2] || path.join(root, 'dist/static-web'));
const web = path.join(root, 'apps/web/dist');
if (!existsSync(path.join(web, 'index.html'))) { console.error('missing apps/web/dist/index.html: build the web first'); process.exit(1); }
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(web, path.join(out, 'voice'), { recursive: true });
if (!existsSync(path.join(out, 'voice/target.js'))) writeFileSync(path.join(out, 'voice/target.js'), '/* window.__SIDEVOICE_TARGET__ = "https://…"; — written by whoever serves this build */\n');
writeFileSync(path.join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/voice/"><a href="/voice/">Sidevoice</a>\n');
console.log(`static web interface assembled in ${path.relative(process.cwd(), out) || '.'}`);
