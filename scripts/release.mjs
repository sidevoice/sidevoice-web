#!/usr/bin/env node
// The release, as code: what the workflows run, one line each (RELEASING.md).
//
//   node scripts/release.mjs dist [--tag vX.Y.Z]   the built web as the release's assets, in dist/release/
//   node scripts/release.mjs publish <dir> <tag>   attach them to the release, read them back, verify, publish
//
// `dist` packages what `npm run build` left (it does not build): the static site scripts/assemble-static-web.mjs
// makes, as one tarball, and SHA256SUMS. With --tag the packages must carry that version; without it the tarball
// is the nightly's, under a fixed name whose download URL never changes. A pull request runs `dist` too, so what
// merging publishes is what the pull request packaged.
//
// `publish` needs `gh` (GH_TOKEN, GH_REPO) and, beside the assets, attestation.sigstore.json: the release workflow's
// attestation over them. For `nightly` it moves the tag to GITHUB_SHA and replaces every asset of the one nightly
// pre-release; for vX.Y.Z it attaches the assets to the draft release-please created. Then it downloads every
// asset again, checks the bytes against this build and SHA256SUMS and the attestation against the signer, and only
// then publishes. A version with a `-` suffix (and the nightly) is a pre-release, never latest.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// What a site must hold to be served: the page, and the speech worker beside it.
const REQUIRED = ['index.html', 'voice/index.html', 'voice/target.js', 'voice-browser/worker.js'];
const SUMS = 'SHA256SUMS';
const ATTESTATION = 'attestation.sigstore.json';

const fail = (message) => { console.error(`release: ${message}`); process.exit(1); };
const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options });
const gh = (...args) => run('gh', args).trim();
const succeeds = (command, args) => spawnSync(command, args, { cwd: root, stdio: 'ignore' }).status === 0;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = (dir) => readdirSync(dir).filter((name) => statSync(path.join(dir, name)).isFile()).sort();

function dist(args) {
  const tag = args[0] === '--tag' ? args[1] : undefined;
  if (args.length && !tag) fail('usage: dist [--tag vX.Y.Z]');
  const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (tag && tag !== `v${version}`) fail(`package.json says ${version}, the release is ${tag}`);
  const head = run('git', ['rev-parse', 'HEAD']).trim();
  // The attestation names GITHUB_SHA as its source: the assets must come from that very commit.
  if (process.env.GITHUB_SHA && !tag && process.env.GITHUB_SHA !== head) {
    fail(`checked out ${head}, but this run is for ${process.env.GITHUB_SHA}`);
  }

  const site = path.join(root, 'dist/static-web');
  run('node', [path.join(root, 'scripts/assemble-static-web.mjs'), site], { stdio: 'inherit' });
  for (const needed of REQUIRED) if (!existsSync(path.join(site, needed))) fail(`the site has no ${needed}`);

  // Byte for byte the same for the same site: sorted, no owner, every file dated at the commit, and gzip without a
  // timestamp of its own.
  const when = run('git', ['log', '-1', '--format=%ct', head]).trim();
  const tar = execFileSync('tar', ['-C', site, '--sort=name', '--owner=0', '--group=0', '--numeric-owner',
    `--mtime=@${when}`, '-cf', '-', 'index.html', 'voice', 'voice-browser'], { maxBuffer: 1 << 30 });
  const out = path.join(root, 'dist/release');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const name = `sidevoice-web-${tag ? version : 'nightly'}.tar.gz`;
  writeFileSync(path.join(out, name), gzipSync(tar, { level: 9 }));

  const listed = new Set(run('tar', ['-tzf', path.join(out, name)]).split('\n').map((entry) => entry.replace(/^\.\//, '')));
  for (const needed of REQUIRED) if (!listed.has(needed)) fail(`${name} has no ${needed}`);
  writeFileSync(path.join(out, SUMS), files(out).map((file) => `${sha256(readFileSync(path.join(out, file)))}  ${file}\n`).join(''));
  console.log(`${path.relative(root, out)}: ${files(out).join(', ')} (${head.slice(0, 7)})`);
  process.stdout.write(readFileSync(path.join(out, SUMS), 'utf8'));
}

function publish([dir, tag]) {
  if (!dir || !tag) fail('usage: publish <dir> <tag>');
  const repository = process.env.GH_REPO || fail('GH_REPO is not set');
  // The signer every asset must carry: the release workflow on main, for nightlies and releases alike.
  const signer = `https://github.com/${repository}/.github/workflows/release.yml@refs/heads/main`;
  dir = path.resolve(dir);
  const assets = files(dir).map((file) => path.join(dir, file));
  if (!assets.some((file) => file.endsWith(ATTESTATION))) fail(`no ${ATTESTATION} in ${dir}`);

  if (tag === 'nightly') {
    const sha = process.env.GITHUB_SHA || fail('GITHUB_SHA is not set');
    if (succeeds('gh', ['api', `repos/${repository}/git/ref/tags/nightly`])) {
      gh('api', '-X', 'PATCH', `repos/${repository}/git/refs/tags/nightly`, '-f', `sha=${sha}`, '-F', 'force=true');
    } else {
      gh('api', '-X', 'POST', `repos/${repository}/git/refs`, '-f', 'ref=refs/tags/nightly', '-f', `sha=${sha}`);
    }
    const notes = `Snapshot of \`main\` at ${sha}. Not a version: the \`nightly\` tag moves to every commit on \`main\` whose `
      + 'build passes, and these assets are replaced each time. Pin a `vX.Y.Z` release instead.';
    if (succeeds('gh', ['release', 'view', 'nightly'])) {
      gh('release', 'edit', 'nightly', '--title', 'Nightly (main)', '--notes', notes, '--prerelease', '--latest=false');
      gh('release', 'upload', 'nightly', ...assets, '--clobber');
      // Anything an older snapshot left that this one did not replace.
      const names = new Set(assets.map((file) => path.basename(file)));
      for (const old of gh('release', 'view', 'nightly', '--json', 'assets', '-q', '.assets[].name').split('\n')) {
        if (old && !names.has(old)) gh('release', 'delete-asset', 'nightly', old, '--yes');
      }
    } else {
      gh('release', 'create', 'nightly', ...assets, '--verify-tag', '--title', 'Nightly (main)', '--notes', notes,
        '--draft', '--prerelease', '--latest=false');
    }
  } else {
    gh('release', 'upload', tag, ...assets, '--clobber');
  }

  // Every asset read back from the release: the same bytes, listed in SHA256SUMS, signed by the release workflow.
  const check = mkdtempSync(path.join(os.tmpdir(), 'sidevoice-release-check-'));
  try {
    gh('release', 'download', tag, '--dir', check);
    for (const line of readFileSync(path.join(check, SUMS), 'utf8').split('\n').filter(Boolean)) {
      const [digest, name] = line.split('  ');
      if (!digest || !name) fail(`malformed ${SUMS}: ${line}`);
      const downloaded = readFileSync(path.join(check, name));
      if (sha256(downloaded) !== digest || !downloaded.equals(readFileSync(path.join(dir, name)))) {
        fail(`${name}: the release holds other bytes than this build`);
      }
      const { GH_TOKEN: _token, GITHUB_TOKEN: _github, ...environment } = process.env;
      const verified = spawnSync('gh', ['attestation', 'verify', path.join(check, name), '--repo', repository,
        '--bundle', path.join(check, ATTESTATION), '--cert-identity', signer, '--deny-self-hosted-runners'],
      { cwd: root, stdio: 'inherit', env: environment });
      if (verified.status !== 0) fail(`${name}: the attestation does not verify`);
    }
  } finally {
    rmSync(check, { recursive: true, force: true });
  }

  if (tag === 'nightly' || tag.includes('-')) {
    gh('release', 'edit', tag, '--draft=false', '--prerelease', '--latest=false');
  } else {
    gh('release', 'edit', tag, '--draft=false', '--prerelease=false', '--latest');
  }
  console.log(`published ${tag}`);
}

const [command, ...args] = process.argv.slice(2);
if (command === 'dist') dist(args);
else if (command === 'publish') publish(args);
else fail('usage: dist [--tag vX.Y.Z] | publish <dir> <tag>');
