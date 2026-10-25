// Integration checks against a running `npm run tauri dev` or `npm run dev`.
// Uses an isolated browser profile; native Save dialogs/writes are mocked.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const tempRoot = resolve(tmpdir());
const profile = await mkdtemp(join(tempRoot, 'kaleidosage-ui-'));
const browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--enable-unsafe-swiftshader', '--window-size=1280,900', '--remote-debugging-port=0', '--user-data-dir=' + profile,
], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await sleep(100); }
  }
  assert.ok(port, 'browser started');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const current = ++id;
    pending.set(current, { resolve, reject });
    socket.send(JSON.stringify({ id: current, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const wait = async (expression, label = expression) => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await sleep(100);
    }
    throw new Error('Timed out: ' + label + '\n' + await evaluate('document.body.innerText.slice(-1800)')); 
  };
  const clickText = async (text, selector = 'button') => {
    await evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) throw Error('Missing button: ' + ${JSON.stringify(text)}); b.click(); })()`);
  };
  const menu = async text => {
    if (!(await evaluate('document.querySelector(".menubar-root > button").getAttribute("aria-expanded") === "true"'))) await clickText('File', '.menubar-root > button');
    await wait('!!document.querySelector(".menubar-item-label")');
    await evaluate(`document.querySelectorAll('.menubar-item-label').forEach(e => { if(e.textContent === ${JSON.stringify(text)}) e.closest('button').click(); })`);
  };
  const close = () => evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', {key:'w',ctrlKey:true,bubbles:true,cancelable:true}))`);
  const openNew = async () => {
    await clickText('New');
    await wait('!document.querySelector(".start-screen")');
  };
  await send('Page.navigate', { url: process.env.DEV_URL || 'http://localhost:14510/' });
  await wait('window.kaleidoEngine && document.querySelector(".start-screen")', 'application ready');
  await menu('Close');
  assert.ok(await evaluate('!!document.querySelector(".start-screen")'), 'close disabled without a file');
  await openNew();
  await menu('Close');
  await wait('!!document.querySelector(".start-screen")', 'clean scene closes');
  assert.equal(await evaluate('document.querySelectorAll("[role=alertdialog]").length'), 0);
  console.log('PASS clean close returns to start without prompting');

  await openNew();
  // Mutate and close in the same task, before the 500 ms dirty timer can run.
  await evaluate(`window.kaleidoEngine.params.cameraHeight.value = -.37; window.dispatchEvent(new KeyboardEvent('keydown', {key:'w',ctrlKey:true,bubbles:true,cancelable:true}));`);
  await wait('!!document.querySelector("[role=alertdialog]")');
  await clickText('Cancel', '[role=alertdialog] button');
  await wait('!document.querySelector("[role=alertdialog]")');
  assert.equal(await evaluate('window.kaleidoEngine.params.cameraHeight.value'), -.37);
  assert.equal(await evaluate('!!document.querySelector(".start-screen")'), false);
  console.log('PASS immediate dirty edit prompts; Cancel keeps scene');

  await close();
  await wait('!!document.querySelector("[role=alertdialog]")');
  await clickText("Don't save", '[role=alertdialog] button');
  await wait('!!document.querySelector(".start-screen")');
  assert.equal(await evaluate('!!document.querySelector(".titlebar-dirty")'), false);
  assert.equal(await evaluate('window.kaleidoEngine.state.fxOrder.length'), 0);
  assert.equal(await evaluate('window.kaleidoEngine.hasSecondImage'), false);
  console.log('PASS discard clears scene and dirty flag');

  await openNew();
  await evaluate(`window.__saveMode = 'cancel'; window.__saved = 0; window.isTauri = true;
    window.__TAURI_INTERNALS__ = { metadata: {currentWindow: {label: 'main'}, currentWebview: {label: 'main'}}, invoke: async (cmd) => {
      if (cmd === 'plugin:dialog|save') return window.__saveMode === 'cancel' ? null : 'C:/test/scene.ksage';
      if (cmd === 'scene_copy_path') return 'C:/test/kaleidosage-file-test/Untitled Scene.ksage';
      if (cmd === 'save_scene') return;
      if (cmd === 'save_file') { if(window.__saveMode === 'fail') throw Error('Test write failure'); window.__saved++; return; }
      throw Error('Unexpected native call: '+cmd);
    }}; window.kaleidoEngine.params.cameraHeight.value = -.37;`);
  for (const mode of ['cancel', 'fail', 'save']) {
    await evaluate('window.__saveMode = ' + JSON.stringify(mode));
    await close();
    await wait('!!document.querySelector("[role=alertdialog]")');
    await clickText('Save', '[role=alertdialog] button');
    if (mode === 'save') {
      await wait('!!document.querySelector(".start-screen")');
      assert.equal(await evaluate('window.__saved'), 1);
    } else {
      await wait('!document.querySelector("[role=alertdialog]")');
      if (mode === 'fail') await wait('document.body.textContent.includes("Could not save the file")');
      await sleep(200);
      assert.equal(await evaluate('!!document.querySelector(".start-screen")'), false);
      assert.equal(await evaluate('window.kaleidoEngine.params.cameraHeight.value'), -.37);
    }
    console.log('PASS close/save outcome: ' + mode);
  }

  await openNew();
  await clickText('Add effect');
  await clickText('Blur', '[aria-label="Add effect"] button');
  await wait('!!document.querySelector(".panel-group-toggle")');
  await menu('Save');
  await wait('window.__saved === 2 && !document.querySelector(".titlebar-dirty")');
  await evaluate(`const e=window.kaleidoEngine; const original=e.renderer.render.bind(e.renderer); e.renderer.render=(frame)=>{window.__frame=frame;original(frame)};`);
  await wait('window.__frame?.blur > 0');
  const header = '.panel-group:has([aria-label="Blur on"]) .panel-group-title';
  const press = async selector => {
    const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1, modifiers: 2 });
  };
  const release = () => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 400, y: 400, button: 'left', buttons: 0, clickCount: 1 });
  await press(header);
  await wait('window.kaleidoEngine.bypassedGroups.has("blur") && window.__frame.blur === 0');
  await sleep(700);
  assert.equal(await evaluate('!!document.querySelector(".titlebar-dirty")'), false, 'bypass does not dirty saved scene');
  assert.equal(await evaluate('window.kaleidoEngine.state.groups.blur'), true, 'saved enable flag remains on');
  await release();
  await wait('!window.kaleidoEngine.bypassedGroups.has("blur") && window.__frame.blur > 0');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(header)}).getAttribute('aria-expanded')`), 'true', 'Ctrl click does not collapse header');
  console.log('PASS Ctrl hold bypasses render; release outside restores with no saved changes');

  await press(header);
  await wait('window.kaleidoEngine.bypassedGroups.has("blur")');
  await evaluate('window.dispatchEvent(new Event("blur"))');
  await wait('!window.kaleidoEngine.bypassedGroups.has("blur")');
  await release();
  console.log('PASS focus loss restores effect');

  await press('.panel-group-toggle[aria-label="Blur on"]');
  await wait('window.kaleidoEngine.bypassedGroups.has("blur")');
  await release();
  assert.equal(await evaluate('window.kaleidoEngine.state.groups.blur'), true, 'Ctrl power click does not toggle saved state');
  await evaluate('document.querySelector(".panel-group-toggle").click()');
  assert.equal(await evaluate('window.kaleidoEngine.state.groups.blur'), false);
  await press(header);
  await release();
  assert.equal(await evaluate('window.kaleidoEngine.state.groups.blur'), false, 'disabled effect stays off after Ctrl hold');
  console.log('PASS Ctrl power click is temporary; disabled effects stay disabled');

  await close();
  await wait('!!document.querySelector("[role=alertdialog]")');
  await clickText("Don't save", '[role=alertdialog] button');
  await wait('!!document.querySelector(".start-screen")');
  await openNew();
  assert.equal(await evaluate('window.kaleidoEngine.state.fxOrder.length'), 0);
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}))`);
  assert.equal(await evaluate('window.kaleidoEngine.state.fxOrder.length'), 0, 'Undo cannot restore a closed scene');
  console.log('PASS new scene starts clean with old Undo history removed');
  await send('Browser.close');
} finally {
  socket?.close();
  if (browser.exitCode === null) browser.kill();
  if (dirname(profile) !== tempRoot || !basename(profile).startsWith('kaleidosage-ui-')) throw Error('Invalid test profile path');
  await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
}
