/**
 * Renders the same scenes with the engine at a base commit and with the
 * engine in the working tree, in headless Chromium, and compares every
 * pixel (see tools/layers.fixture.js). For the layers work (docs/LAYERS.md,
 * phase 1): with every picture opaque, the new code must give the old
 * pictures. The working tree also renders twice, so a scene that is not the
 * same from one run to the next shows as "unstable", not as a change.
 *
 * Usage: node tools/test-layers.mjs [base commit, default HEAD]
 * CHROME_PATH overrides browser discovery. LAYERS_SCENES=random-3,random-7
 * runs only those scenes, each also with each of its effects left out.
 */
import { build } from 'esbuild';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = process.argv[2] || 'HEAD';
/* Bytes may differ by this much from rounding in another order of math. */
const TOLERANCE = 2;

const candidates = process.env.CHROME_PATH ? [process.env.CHROME_PATH] : [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
let browser;
for (const candidate of candidates) {
  try { await access(candidate); browser = candidate; break; } catch { /* Try the next browser. */ }
}
if (!browser) throw new Error('Set CHROME_PATH to an installed Chromium browser.');

const temp = await mkdtemp(join(resolve(tmpdir()), 'kaleidosage-layers-'));
try {
  /* The base commit's src folder, next to the working tree's. */
  const before = join(temp, 'before');
  await mkdir(before);
  const archive = join(temp, 'before.tar');
  const git = spawnSync('git', ['archive', base, 'src', '-o', archive], { cwd: root });
  if (git.status !== 0) throw new Error(`git archive failed: ${git.stderr}`);
  /* Relative paths: a "C:" in a path is a remote host to GNU tar. */
  const tar = spawnSync('tar', ['-xf', 'before.tar', '-C', 'before'], { cwd: temp });
  if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr}`);

  const slash = (path) => path.replaceAll('\\', '/');
  /**
   * LAYERS_OLD=FINISH_SHADER,CONTOUR_SHADER: the working tree's bundles use
   * these shaders from the base commit, to find the shader that changes a
   * scene.
   */
  const oldShaders = (process.env.LAYERS_OLD || '').split(',').filter(Boolean);
  const mixShaders = {
    name: 'old-shaders',
    setup(plugin) {
      plugin.onResolve({ filter: /^\.\/shaders$/ }, (args) => {
        if (!oldShaders.length || !slash(args.importer).startsWith(slash(join(root, 'src')))) return undefined;
        return { path: 'mixed-shaders', namespace: 'old-shaders' };
      });
      plugin.onLoad({ filter: /.*/, namespace: 'old-shaders' }, () => ({
        contents: `export * from ${JSON.stringify(slash(join(root, 'src/engine/shaders.ts')))};\n`
          + `export { ${oldShaders.join(', ')} } from ${JSON.stringify(slash(join(before, 'src/engine/shaders.ts')))};\n`,
        resolveDir: root,
        loader: 'ts',
      }));
    },
  };
  const bundle = async (dir, label) => {
    const { outputFiles } = await build({
      stdin: {
        contents: `
          import { Engine } from ${JSON.stringify(slash(join(dir, 'src/engine/engine')))};
          import * as P from ${JSON.stringify(slash(join(dir, 'src/engine/params')))};
          import { runCases } from ${JSON.stringify(slash(join(root, 'tools/layers.fixture.js')))};
          (window.__runs ||= []).push({ label: ${JSON.stringify(label)}, results: runCases(Engine, P) });
        `,
        resolveDir: root,
        loader: 'js',
      },
      bundle: true, write: false, format: 'iife',
      plugins: dir === before ? [] : [mixShaders],
      nodePaths: [join(root, 'node_modules')],
      define: { 'import.meta.hot': 'undefined', 'import.meta.env.DEV': 'false', __LAYERS_SCENES__: JSON.stringify(process.env.LAYERS_SCENES || '') },
      logLevel: 'error',
    });
    return outputFiles[0].text;
  };
  const compare = `
    const runs = Object.fromEntries(window.__runs.map((run) => [run.label, run.results]));
    const diff = (a, b) => {
      let max = 0, count = 0;
      for (let i = 0; i < a.length; i++) {
        const d = Math.abs(a[i] - b[i]);
        if (d > max) max = d;
        if (d > ${TOLERANCE}) count++;
      }
      return { max, count };
    };
    const report = { base: ${JSON.stringify(base)}, scenes: runs.after.length, flat: [], changed: [], unstable: [], errors: [] };
    /* A scene of one color tells nothing: the check would pass with any code. */
    const flat = (pixels) => pixels.every((value, i) => value === pixels[i % 4]);
    runs.after.forEach((after) => { if (after.pixels && flat(after.pixels)) report.flat.push(after.name); });
    /* How many scenes have each effect in their FX list. */
    report.coverage = {};
    for (const after of runs.after) for (const step of after.fx || []) report.coverage[step] = (report.coverage[step] || 0) + 1;
    runs.after.forEach((after, i) => {
      const old = runs.before[i];
      const again = runs.again[i];
      if (after.error || old.error || again.error) {
        report.errors.push({ name: after.name, before: old.error, after: after.error || again.error });
        return;
      }
      const noise = diff(after.pixels, again.pixels);
      if (noise.count) report.unstable.push({ name: after.name, fx: after.fx, max: noise.max });
      const change = diff(old.pixels, after.pixels);
      if (change.count && !noise.count) report.changed.push({ name: after.name, fx: after.fx, max: change.max, pixels: change.count });
    });
    const pre = document.createElement('pre');
    pre.id = 'results';
    pre.textContent = JSON.stringify(report);
    document.body.append(pre);
  `;
  const page = join(temp, 'test.html');
  const scripts = [await bundle(before, 'before'), await bundle(root, 'after'), await bundle(root, 'again'), compare];
  await writeFile(page, '<!doctype html><body>' + scripts.map((script) => '<script>' + script + '</script>').join('') + '</body>');

  const child = spawn(browser, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--allow-file-access-from-files', '--enable-unsafe-swiftshader',
    '--user-data-dir=' + join(temp, 'profile'), '--dump-dom', pathToFileURL(page).href,
  ], { windowsHide: true });
  let stdout = '', stderr = '';
  child.stdout.on('data', (data) => stdout += data);
  child.stderr.on('data', (data) => stderr += data);
  const timer = setTimeout(() => child.kill(), 300000);
  const code = await new Promise((done, fail) => { child.on('error', fail); child.on('exit', done); });
  clearTimeout(timer);
  const match = stdout.match(/<pre id="results">([^<]+)<\/pre>/);
  if (!match) throw new Error(`Browser failed (${code}): ${stderr.slice(-4000)}${stdout.slice(-1000)}`);
  const report = JSON.parse(match[1].replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').replaceAll('&quot;', '"'));
  console.log(JSON.stringify(report, null, 2));
  if (report.changed.length || report.errors.length) process.exitCode = 1;
} finally {
  await rm(temp, { recursive: true, force: true }).catch(() => {});
}
