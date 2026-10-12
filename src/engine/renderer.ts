import { GpuTimer } from "./gpuTimer";
import { blurReach } from "./reach";
import { BLUR_SHADER, COPY_SHADER, FINISH_SHADER, KALEIDO_SHADER, TRAILS_SHADER, VERTEX_SHADER } from "./shaders";

export type BlurMode = 0 | 1 | 2;
/** 0 = no trails, 1 = mix, 2 = lighten. */
export type TrailMode = 0 | 1 | 2;
/** 0 = none, 1 = power, 2 = Mobius, 3 = Julia, 4 = log spiral, 5 = sine. */
export type MapMode = 0 | 1 | 2 | 3 | 4 | 5;
/** 0 = no warp, 1 = warp the screen (breaks the symmetry), 2 = warp the image (keeps it). */
export type WarpMode = 0 | 1 | 2;

/** The values for one frame. Angles are in radians. */
export interface FrameValues {
  segments: number;
  warpMode: WarpMode;
  /** Warp strength, in screen heights. */
  warpAmount: number;
  warpScale: number;
  warpMarble: number;
  warpDetail: number;
  /** How far the warp noise has flowed. */
  warpTime: number;
  mapMode: MapMode;
  mapMix: number;
  mapScale: number;
  mapPower: number;
  mapPointX: number;
  mapPointY: number;
  mapSteps: number;
  mapTwist: number;
  /** The kaleidoscope center, as a fraction of the screen size from the screen center. */
  centerX: number;
  centerY: number;
  rotation: number;
  zoom: number;
  twirl: number;
  hue: number;
  panX: number;
  panY: number;
  blurMode: BlurMode;
  blurAngle: number;
  /** Blur length in pixels at 1080p; it scales with the canvas height. */
  blurDistance: number;
  /** The sharp area around the center, and the width of its fade, in screen heights. */
  focusSize: number;
  focusSoftness: number;
  trailMode: TrailMode;
  /** How much of the previous frame stays, per 1/60 s. */
  trailAmount: number;
  /** How much the previous frame grows, per 1/60 s. */
  trailZoom: number;
  /** How far the previous frame turns, per 1/60 s. */
  trailTurn: number;
  /** How far the previous frame's colors turn around the color wheel, per 1/60 s. */
  trailHue: number;
  /** The animation time since the last frame, in 1/60 s units. 0 while paused. */
  frameScale: number;
  /** Unsharp-mask strength (0 = off) and its radius in pixels. */
  sharpen: number;
  sharpenRadius: number;
  /** 1 = no change. */
  contrast: number;
}

/** Sizes and counts that drive the GPU cost, for the performance display. */
export interface RenderInfo {
  width: number;
  height: number;
  /** The kaleidoscope texture, which includes the border for the blur. */
  textureWidth: number;
  textureHeight: number;
  blurSamples: number;
}

interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
}

export type ImageSource = HTMLImageElement | HTMLCanvasElement;

interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation>;
}

/** The longest image side that is uploaded. Larger images are scaled down first. */
const MAX_IMAGE_SIDE = 4096;

/**
 * Draws the kaleidoscope into an offscreen texture, then draws that texture
 * with motion blur. With trails on, the blurred frame is combined with the
 * previous output (two textures, used in turn), and the result is copied to
 * the canvas.
 */
export class KaleidoRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly kaleido: Program;
  private readonly blur: Program;
  private readonly imageTexture: WebGLTexture;
  private readonly frameTexture: WebGLTexture;
  private readonly framebuffer: WebGLFramebuffer;
  private readonly trails: Program;
  private readonly copy: Program;
  private readonly finish: Program;
  /** The blurred frame, when trails are on. */
  private readonly current: Target;
  /** The trail output of the last frame and of this frame; they change roles each frame. */
  private readonly trailTargets: [Target, Target];
  private trailIndex = 0;
  private trailSize: [number, number] = [0, 0];
  private trailsWereOn = false;
  /** Trails use half-float color when the GPU can draw to it, so long trails fade out cleanly. */
  private readonly trailFormat: { internal: number; type: number };
  readonly timer: GpuTimer;
  readonly info: RenderInfo = { width: 0, height: 0, textureWidth: 0, textureHeight: 0, blurSamples: 0 };
  private imageSize: [number, number] = [1, 1];
  /** The canvas size in device pixels. */
  private frameSize: [number, number] = [0, 0];
  /** The border around the screen in the offscreen texture, in pixels. It only grows, until the canvas size changes. */
  private pad = -1;
  private textureSize: [number, number] = [0, 0];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) throw new Error("WebGL 2 is not available on this computer.");
    this.gl = gl;
    this.kaleido = this.createProgram(KALEIDO_SHADER);
    this.blur = this.createProgram(BLUR_SHADER);
    this.trails = this.createProgram(TRAILS_SHADER);
    this.copy = this.createProgram(COPY_SHADER);
    this.finish = this.createProgram(FINISH_SHADER);

    /** One triangle that covers the whole screen. */
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.imageTexture = gl.createTexture()!;
    this.frameTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.frameTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.framebuffer = gl.createFramebuffer()!;

    this.trailFormat = gl.getExtension("EXT_color_buffer_float")
      ? { internal: gl.RGBA16F, type: gl.HALF_FLOAT }
      : { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE };
    this.current = this.createTarget();
    this.trailTargets = [this.createTarget(), this.createTarget()];
    this.timer = new GpuTimer(gl);
  }

  setImage(source: ImageSource) {
    const gl = this.gl;
    const maxSide = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, MAX_IMAGE_SIDE);
    let width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    let height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    if (width < 1 || height < 1) throw new Error("The image is empty.");
    let upload: ImageSource = source;
    if (Math.max(width, height) > maxSide) {
      const scale = maxSide / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const scaled = document.createElement("canvas");
      scaled.width = width;
      scaled.height = height;
      scaled.getContext("2d")!.drawImage(source, 0, 0, width, height);
      upload = scaled;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, upload);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.imageSize = [width, height];
  }

  render(v: FrameValues) {
    const gl = this.gl;
    this.resizeCanvas();
    this.timer.collect();
    const [width, height] = this.frameSize;
    if (width === 0 || height === 0) return;

    const amount = v.blurDistance / 500;
    this.ensurePad(blurReach(v.blurMode, v.blurDistance, amount, width, height, v.centerX, v.centerY));
    const [textureWidth, textureHeight] = this.textureSize;

    const k = this.kaleido;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, textureWidth, textureHeight);
    gl.useProgram(k.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.uniform1i(k.uniforms.u_img, 0);
    gl.uniform2f(k.uniforms.u_res, width, height);
    gl.uniform1f(k.uniforms.u_pad, this.pad);
    gl.uniform2f(k.uniforms.u_center, v.centerX, v.centerY);
    gl.uniform1i(k.uniforms.u_warpMode, v.warpMode);
    gl.uniform1f(k.uniforms.u_warpAmount, v.warpAmount);
    gl.uniform1f(k.uniforms.u_warpScale, v.warpScale);
    gl.uniform1f(k.uniforms.u_warpMarble, v.warpMarble);
    gl.uniform1i(k.uniforms.u_warpDetail, Math.round(v.warpDetail));
    gl.uniform1f(k.uniforms.u_warpTime, v.warpTime);
    gl.uniform1i(k.uniforms.u_mapMode, v.mapMode);
    gl.uniform1f(k.uniforms.u_mapMix, v.mapMix);
    gl.uniform1f(k.uniforms.u_mapScale, v.mapScale);
    gl.uniform1f(k.uniforms.u_mapPower, v.mapPower);
    gl.uniform2f(k.uniforms.u_mapPoint, v.mapPointX, v.mapPointY);
    gl.uniform1i(k.uniforms.u_mapSteps, Math.round(v.mapSteps));
    gl.uniform1f(k.uniforms.u_mapTwist, v.mapTwist);
    gl.uniform2f(k.uniforms.u_imgRes, this.imageSize[0], this.imageSize[1]);
    gl.uniform1f(k.uniforms.u_segments, Math.round(v.segments));
    gl.uniform1f(k.uniforms.u_rotation, v.rotation);
    gl.uniform1f(k.uniforms.u_zoom, v.zoom);
    gl.uniform1f(k.uniforms.u_twirl, v.twirl);
    gl.uniform1f(k.uniforms.u_hue, v.hue);
    gl.uniform2f(k.uniforms.u_offset, v.panX, v.panY);
    this.timer.begin("fold");
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.timer.end();

    const pixelLength = v.blurMode === 0 ? v.blurDistance * height / 1080 : amount * height * 0.9;
    const samples = Math.min(160, Math.max(1, Math.ceil(pixelLength * 0.75)));
    Object.assign(this.info, { width, height, textureWidth, textureHeight, blurSamples: samples });

    const trailsOn = v.trailMode !== 0;
    const finishOn = v.sharpen > 0 || v.contrast !== 1;
    if (trailsOn || finishOn) this.ensureTrailTargets(width, height);

    const b = this.blur;
    gl.bindFramebuffer(gl.FRAMEBUFFER, trailsOn || finishOn ? this.current.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(b.program);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTexture);
    gl.uniform1i(b.uniforms.u_tex, 0);
    gl.uniform2f(b.uniforms.u_res, width, height);
    gl.uniform2f(b.uniforms.u_texSize, textureWidth, textureHeight);
    gl.uniform1f(b.uniforms.u_pad, this.pad);
    gl.uniform2f(b.uniforms.u_center, v.centerX, v.centerY);
    gl.uniform1f(b.uniforms.u_focus, v.focusSize);
    gl.uniform1f(b.uniforms.u_soft, v.focusSoftness);
    gl.uniform1i(b.uniforms.u_mode, v.blurMode);
    gl.uniform2f(
      b.uniforms.u_dir,
      Math.cos(v.blurAngle) * v.blurDistance / 1080 * (height / width),
      Math.sin(v.blurAngle) * v.blurDistance / 1080
    );
    gl.uniform1f(b.uniforms.u_amount, amount);
    gl.uniform1i(b.uniforms.u_samples, samples);
    this.timer.begin("blur");
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.timer.end();

    /** The finished picture so far, when it is in a texture rather than on the screen. */
    let result = this.current.texture;
    if (trailsOn) {
      this.timer.begin("trails");
      result = this.drawTrails(v, width, height);
      this.timer.end();
    } else {
      delete this.timer.times.trails;
    }

    if (finishOn) {
      this.timer.begin("finish");
      this.drawFinish(v, result, width, height);
      this.timer.end();
    } else {
      delete this.timer.times.finish;
      if (trailsOn) this.drawCopy(result);
    }
    this.trailsWereOn = trailsOn;
  }

  /** Drops the old trail frames, so the next frame starts the trails again. */
  resetTrails() {
    this.trailsWereOn = false;
  }

  /** Applies the final effects to the picture and draws it on the screen. */
  private drawFinish(v: FrameValues, source: WebGLTexture, width: number, height: number) {
    const gl = this.gl;
    const f = this.finish;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(f.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(f.uniforms.u_tex, 0);
    gl.uniform2f(f.uniforms.u_texel, 1 / width, 1 / height);
    gl.uniform1f(f.uniforms.u_sharpen, v.sharpen);
    gl.uniform1f(f.uniforms.u_radius, v.sharpenRadius);
    gl.uniform1f(f.uniforms.u_contrast, v.contrast);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private drawCopy(source: WebGLTexture) {
    const gl = this.gl;
    const c = this.copy;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(c.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(c.uniforms.u_tex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Combines the blurred frame with the previous output, and returns the texture that holds the result. */
  private drawTrails(v: FrameValues, width: number, height: number): WebGLTexture {
    const gl = this.gl;
    const previous = this.trailTargets[this.trailIndex];
    const next = this.trailTargets[1 - this.trailIndex];
    /** The first frame after trails start has no previous frame, so it is the new frame alone. */
    const fresh = !this.trailsWereOn;
    const scale = v.frameScale;

    const t = this.trails;
    gl.bindFramebuffer(gl.FRAMEBUFFER, next.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.useProgram(t.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.current.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, previous.texture);
    gl.uniform1i(t.uniforms.u_current, 0);
    gl.uniform1i(t.uniforms.u_previous, 1);
    gl.uniform2f(t.uniforms.u_res, width, height);
    gl.uniform1i(t.uniforms.u_mode, v.trailMode);
    gl.uniform1f(t.uniforms.u_amount, fresh ? 0 : Math.pow(v.trailAmount, scale));
    gl.uniform1f(t.uniforms.u_zoom, Math.pow(v.trailZoom, scale));
    gl.uniform1f(t.uniforms.u_turn, v.trailTurn * scale);
    gl.uniform1f(t.uniforms.u_hue, v.trailHue * scale);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.trailIndex = 1 - this.trailIndex;
    return next.texture;
  }

  /** Sizes the trail textures to the canvas. A new size starts the trails again. */
  private ensureTrailTargets(width: number, height: number) {
    if (width === this.trailSize[0] && height === this.trailSize[1]) return;
    this.trailSize = [width, height];
    for (const target of [this.current, ...this.trailTargets]) this.allocate(target, width, height);
    this.trailsWereOn = false;
  }

  private createTarget(): Target {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { texture, framebuffer: gl.createFramebuffer()! };
  }

  private allocate(target: Target, width: number, height: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.trailFormat.internal, width, height, 0, gl.RGBA, this.trailFormat.type, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
  }

  /** Matches the canvas to the displayed size. A new size also resets the border. */
  private resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(this.canvas.clientWidth * dpr);
    const height = Math.round(this.canvas.clientHeight * dpr);
    if (width === this.frameSize[0] && height === this.frameSize[1]) return;
    this.frameSize = [width, height];
    this.pad = -1;
    if (width === 0 || height === 0) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /**
   * Makes the offscreen texture's border at least "reach" pixels wide. The
   * border grows in 64-pixel steps and never shrinks, so a drifting blur does
   * not make a new texture every frame.
   */
  private ensurePad(reach: number) {
    const gl = this.gl;
    const [width, height] = this.frameSize;
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const maxPad = Math.max(0, Math.floor((maxSize - Math.max(width, height)) / 2));
    const needed = Math.min(maxPad, Math.ceil((reach + 2) / 64) * 64);
    if (needed <= this.pad) return;
    this.pad = needed;
    this.textureSize = [width + needed * 2, height + needed * 2];
    gl.bindTexture(gl.TEXTURE_2D, this.frameTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.textureSize[0], this.textureSize[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.frameTexture, 0);
  }

  private compile(type: number, source: string) {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "Shader error");
    return shader;
  }

  private createProgram(fragmentSource: string): Program {
    const gl = this.gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.bindAttribLocation(program, 0, "a_pos");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Shader link error");
    const uniforms: Record<string, WebGLUniformLocation> = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let index = 0; index < count; index++) {
      const name = gl.getActiveUniform(program, index)!.name;
      uniforms[name] = gl.getUniformLocation(program, name)!;
    }
    return { program, uniforms };
  }
}
