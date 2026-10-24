/**
 * The scenes that tools/test-layers.mjs renders with two versions of the
 * engine. runCases gets one version's Engine class and params module, and
 * returns each scene's pixels. Math.random is seeded for each scene, so both
 * versions build and animate the same scenes.
 */
export const WIDTH = 192;
export const HEIGHT = 108;
const FRAMES = 8;
const RANDOM_SCENES = 40;

/** A small seeded random number source (mulberry32). */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A test picture with colors, hard edges and soft gradients. */
function pattern(hue) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const c = canvas.getContext('2d');
  const gradient = c.createLinearGradient(0, 0, 256, 256);
  gradient.addColorStop(0, `hsl(${hue}, 80%, 55%)`);
  gradient.addColorStop(1, `hsl(${hue + 160}, 70%, 35%)`);
  c.fillStyle = gradient;
  c.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if ((x + y) % 2) continue;
    c.fillStyle = `rgba(255, 255, 255, ${0.15 + 0.1 * (x % 3)})`;
    c.fillRect(x * 32, y * 32, 32, 32);
  }
  c.fillStyle = `hsl(${hue + 60}, 90%, 60%)`;
  c.beginPath();
  c.arc(170, 90, 50, 0, Math.PI * 2);
  c.fill();
  return canvas;
}

/**
 * The scenes: a fresh scene with each effect alone, three times (randomized
 * in its own group), then random scenes from Randomize all. Returns, for each scene,
 * its name, the steps in its FX list, and the RGBA bytes of its last frame.
 */
export function runCases(Engine, P) {
  const random = Math.random;
  const scenes = [];
  const steps = [...new Set(P.createPlayState().fxOrder.concat(['warp', 'map', 'kaleidoscope', 'blur', 'trails', 'smear', 'contours', 'relief', 'driver', 'camera', 'solid', 'sort', 'particles', 'cycles', 'rays', 'bloom', 'sharpen', 'color', 'levels']))];
  /* Three random settings for each effect alone, as some settings turn an effect's look off. */
  for (const step of steps) for (let k = 0; k < 3; k++) scenes.push({ name: `alone-${step}-${k}`, step });
  for (let i = 0; i < RANDOM_SCENES; i++) scenes.push({ name: `random-${i}`, seed: i + 1 });
  /**
   * With a list of scene names (LAYERS_SCENES, see test-layers.mjs), only
   * those scenes run, each also once with each of its effects left out
   * (named "<scene> without <effect>"), to find the effect that changes it.
   */
  const only = typeof __LAYERS_SCENES__ === 'string' && __LAYERS_SCENES__ ? __LAYERS_SCENES__.split(',') : null;
  if (only) {
    const picked = [];
    scenes.forEach((scene, index) => {
      if (!only.includes(scene.name)) return;
      picked.push({ ...scene, index });
      for (const drop of steps) picked.push({ ...scene, index, name: `${scene.name} without ${drop}`, drop });
    });
    scenes.splice(0, scenes.length, ...picked);
  }
  const results = [];
  scenes.forEach((scene, place) => {
    const index = scene.index ?? place;
    Math.random = seeded(1000 + index);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const engine = new Engine(canvas, [WIDTH, HEIGHT]);
      const params = P.createParams();
      const state = P.createPlayState();
      if (scene.step) {
        state.fxOrder = [];
        P.addEffect(state, scene.step);
        P.randomizeGroup(params, state, scene.step);
      } else {
        P.randomizeParams(params, state);
      }
      if (scene.drop) {
        if (!state.fxOrder.includes(scene.drop)) throw new Error('skip');
        state.fxOrder = state.fxOrder.filter((step) => step !== scene.drop);
      }
      Object.assign(engine.params, params);
      Object.assign(engine.state, state);
      engine.setImage(pattern(20 + index * 37), 0);
      if (index % 2) engine.setImage(pattern(200 + index * 11), 1);
      for (let frame = 0; frame < FRAMES; frame++) engine.draw(engine.step(1 / 30), 1 / 30);
      const gl = engine.renderer.gl;
      const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
      gl.readPixels(0, 0, WIDTH, HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      results.push({ name: scene.name, fx: engine.state.fxOrder.slice(), pixels });
      engine.dispose();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch (error) {
      if (error && error.message === 'skip') return;
      results.push({ name: scene.name, error: String(error && error.stack || error) });
    } finally {
      Math.random = random;
    }
  });
  return results;
}
