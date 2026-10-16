/** Run GPU camera regressions with an installed Chromium browser; no dev server needed.
 * CHROME_PATH overrides browser discovery. CAMERA_TEST_OUTPUT saves checkerboard PNGs.
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const candidates = process.env.CHROME_PATH ? [process.env.CHROME_PATH] : [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
let browser;
for (const candidate of candidates) {
  try { await access(candidate); browser = candidate; break; } catch { /* Try next installed browser. */ }
}
if (!browser) throw new Error('Set CHROME_PATH to an installed Chromium browser to run the WebGL tests.');
const tempRoot = resolve(tmpdir());
const temp = await mkdtemp(join(tempRoot, 'kaleidosage-camera-'));
try {
  const { outputFiles } = await build({
    entryPoints: [join(root, 'tools/camera-webgl.fixture.js')], bundle: true, write: false, format: 'iife',
  });
  const file = join(temp, 'test.html');
  await writeFile(file, '<!doctype html><body><script>' + outputFiles[0].text + '</script></body>');
  const child = spawn(browser, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--allow-file-access-from-files', '--enable-unsafe-swiftshader',
    '--user-data-dir=' + join(temp, 'profile'), '--dump-dom', pathToFileURL(file).href,
  ], { windowsHide: true });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => stdout += data);
  child.stderr.on('data', data => stderr += data);
  const timer = setTimeout(() => child.kill(), 120000);
  let code;
  try {
    code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', resolve);
    });
  } finally { clearTimeout(timer); }
  const match = stdout.match(/<pre id="results">([^<]+)<\/pre>/);
  if (!match) throw new Error(`Browser failed (${code}): ${stderr.slice(-5000)}${stdout.slice(-1000)}`);
  const result = JSON.parse(match[1].replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'));
  if (process.env.CAMERA_TEST_OUTPUT) {
    const output = resolve(process.env.CAMERA_TEST_OUTPUT);
    await mkdir(output, { recursive: true });
    for (const [name, data] of Object.entries(result.images || {})) {
      await writeFile(join(output, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
    }
  }
  delete result.images;
  console.log(JSON.stringify(result, null, 2));
  if (code !== 0 || result.error || result.failures?.length) process.exitCode = 1;
} finally {
  // Only remove the fresh temporary directory created by this run.
  if (dirname(temp) !== tempRoot || !basename(temp).startsWith('kaleidosage-camera-')) {
    throw new Error('Unexpected temporary directory: ' + temp);
  }
  await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
