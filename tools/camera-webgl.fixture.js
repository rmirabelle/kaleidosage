/** Real WebGL regression checks. Run with node tools/test-camera.mjs. */
import { KaleidoRenderer } from '../src/engine/renderer';

const result = { failures: [], suites: [], images: {} };
const radians = degrees => degrees * Math.PI / 180;
const values = {
  camera: 1, cameraBlend: 0, cameraRepeat: 0, cameraHeight: .25,
  cameraTilt: radians(50), cameraTurn: radians(270), cameraX: 0, cameraY: 0,
  cameraDistance: 1.6, cameraLens: radians(60), cameraLightTurn: radians(135),
  cameraLightHeight: radians(40), cameraShadow: .7, cameraFog: .2,
  cameraSky: .6, skyColor: [.5, .65, .9], cameraShine: 0, cameraSmooth: 2.5,
};
const cases = [
  { name: 'mirror-cardinal', cameraTurn: radians(270) },
  { name: 'mirror-oblique', cameraTurn: .61 },
  { name: 'repeat-sharp', cameraRepeat: 1, cameraSmooth: 0, cameraTurn: radians(90) },
  { name: 'single-inverted', cameraRepeat: 2, cameraHeight: -.25, cameraTurn: .61 },
  { name: 'straight-down', cameraTilt: 0, cameraTurn: 0 },
  { name: 'flat', cameraHeight: 0, cameraTilt: 0 },
  { name: 'grazing', cameraTilt: radians(75), cameraTurn: 0 },
];

function run(width, height, useBytes) {
  const name = `${width}x${height}-${useBytes ? 'R8' : 'R16F'}`;
  const suite = { name, levels: [], renders: [] };
  result.suites.push(suite);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  // Exercise the production passes directly, without app UI or source effects.
  const renderer = new KaleidoRenderer(canvas, [width, height]);
  const gl = renderer.gl;
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  result.renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  if (useBytes) {
    renderer.trailFormat = { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE };
    renderer.maxFormat = gl.R8;
  }
  const bytes = renderer.maxFormat === gl.R8;
  const check = (ok, message) => { if (!ok) result.failures.push(`${name}: ${message}`); };
  const read = (w, h) => {
    const data = bytes ? new Uint8Array(w * h * 4) : new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, bytes ? gl.UNSIGNED_BYTE : gl.FLOAT, data);
    return bytes ? Float32Array.from(data, x => x / 255) : data;
  };

  renderer.ensureTrailTargets(width, height);
  const source = renderer.createTarget().texture;
  gl.bindTexture(gl.TEXTURE_2D, source);
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const c = ((Math.floor(x / 16) + Math.floor(y / 16)) % 2) * 255;
    pixels.set([c, c, c, 255], (y * width + x) * 4);
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  renderer.drawCamera(values, source, null, width, height);
  result.images[name] = canvas.toDataURL();

  // Independently reduce the fine field on the CPU and compare EVERY texel at
  // EVERY mip, including power-of-two padding outside the rectangular picture.
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.heightTarget.framebuffer);
  const fine = read(width, height);
  let side = renderer.maxSide;
  let expected = new Float32Array(side * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    let highest = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const px = Math.min(width - 1, Math.max(0, x + dx));
      const py = Math.min(height - 1, Math.max(0, y + dy));
      highest = Math.max(highest, fine[(py * width + px) * 4]);
    }
    expected[y * side + x] = highest;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.maxFramebuffer);
  for (let level = 0; level < renderer.maxLevels; level++) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderer.maxTexture, level);
    const actual = read(side, side);
    let wrong = 0;
    for (let i = 0; i < expected.length; i++) {
      if (Math.abs(actual[i * 4] - expected[i]) > .00001) wrong++;
    }
    suite.levels.push({ level, side, wrong });
    check(wrong === 0, `incorrect height bounds at mip ${level} (${wrong} texels)`);
    if (side === 1) break;
    const nextSide = side / 2;
    const next = new Float32Array(nextSide * nextSide);
    for (let y = 0; y < nextSide; y++) for (let x = 0; x < nextSide; x++) {
      const i = y * 2 * side + x * 2;
      next[y * nextSide + x] = Math.max(expected[i], expected[i + 1], expected[i + side], expected[i + side + 1]);
    }
    expected = next;
    side = nextSide;
  }

  // Render the same rays with and without hierarchy acceleration. Use a small
  // viewport but retain the full-resolution field and picture coordinates.
  const outWidth = 97, outHeight = 113;
  const output = renderer.createTarget();
  gl.bindTexture(gl.TEXTURE_2D, output.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, outWidth, outHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, output.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output.texture, 0);
  for (const test of cases) {
    renderer.drawCamera({ ...values, ...test, cameraShadow: 0 }, source, null, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, output.framebuffer);
    gl.viewport(0, 0, outWidth, outHeight);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const accelerated = new Uint8Array(outWidth * outHeight * 4);
    gl.readPixels(0, 0, outWidth, outHeight, gl.RGBA, gl.UNSIGNED_BYTE, accelerated);
    gl.uniform1i(renderer.camera.uniforms.u_levels, 1);
    gl.uniform1i(renderer.camera.uniforms.u_visits, 16384);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const reference = new Uint8Array(accelerated.length);
    gl.readPixels(0, 0, outWidth, outHeight, gl.RGBA, gl.UNSIGNED_BYTE, reference);
    let wrong = 0, maxError = 0, darkest = 255, brightest = 0;
    for (let i = 0; i < reference.length; i += 4) {
      const error = Math.max(...[0, 1, 2].map(c => Math.abs(reference[i + c] - accelerated[i + c])));
      maxError = Math.max(maxError, error);
      if (error > 8) wrong++;
      darkest = Math.min(darkest, accelerated[i]);
      brightest = Math.max(brightest, accelerated[i]);
    }
    suite.renders.push({ name: test.name, wrong, maxError });
    // Allow isolated edge rounding differences, not missing rows or regions.
    check(wrong <= outWidth * outHeight * .005, `${test.name}: hierarchy disagrees with pixel traversal`);
    check(brightest - darkest > 40, `${test.name}: missing checkerboard contrast`);
  }
  // An asymmetric color ramp gives an analytical straight-down projection,
  // catching a collapsed camera basis or an accidental 180-degree rotation.
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, source);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    pixels.set([Math.round(x * 255 / (width - 1)), Math.round(y * 255 / (height - 1)), 0, 255], (y * width + x) * 4);
  }
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  renderer.drawCamera({ ...values, cameraHeight: 0, cameraTilt: 0, cameraTurn: radians(270),
    cameraDistance: .25, cameraShadow: 0, cameraFog: 0, cameraLightHeight: radians(90),
  }, source, null, width, height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, output.framebuffer);
  gl.viewport(0, 0, outWidth, outHeight);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const ramp = new Uint8Array(outWidth * outHeight * 4);
  gl.readPixels(0, 0, outWidth, outHeight, gl.RGBA, gl.UNSIGNED_BYTE, ramp);
  let projectionError = 0;
  for (let y = 0; y < outHeight; y++) for (let x = 0; x < outWidth; x++) {
    const uv = [(x + .5) / outWidth, (y + .5) / outHeight];
    for (let axis = 0; axis < 2; axis++) {
      const size = axis === 0 ? width : height;
      const q = ((uv[axis] - .5) * .5 * Math.tan(values.cameraLens / 2) + .5) * size;
      const expectedColor = (q - .5) * 255 / (size - 1);
      projectionError = Math.max(projectionError, Math.abs(ramp[(y * outWidth + x) * 4 + axis] - expectedColor));
    }
  }
  suite.projectionError = projectionError;
  check(projectionError < 2, 'incorrect straight-down projection');
  check(gl.getError() === gl.NO_ERROR, 'WebGL error');
  renderer.dispose();
}

try {
  run(480, 576, false);
  run(641, 359, true);
} catch (error) {
  result.error = error.stack;
}
const pre = document.createElement('pre');
pre.id = 'results';
pre.textContent = JSON.stringify(result);
document.body.append(pre);
