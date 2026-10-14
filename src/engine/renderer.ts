import { GpuTimer } from "./gpuTimer";
import { BLUR_SHADER, COPY_SHADER, FINISH_SHADER, KALEIDO_SHADER, RELIEF_SHADER, TRAILS_SHADER, VERTEX_SHADER } from "./shaders";

/** The blur mask: circle with a sharp or a blurred center, gradient, bright areas, dark areas, noise. */
export type BlurMask = 0 | 1 | 2 | 3 | 4 | 5;
/** 0 = no trails, 1 = mix, 2 = lighten. */
export type TrailMode = 0 | 1 | 2;
/** 0 = none, 1 = power, 2 = Mobius, 3 = Julia, 4 = log spiral, 5 = sine, 6 = tunnel. */
export type MapMode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** 0 = no warp, 1 = warp the screen (breaks the symmetry), 2 = warp the image (keeps it). */
export type WarpMode = 0 | 1 | 2;
/** 0 = radial wedges around one center, 1 = triangle tiles, 2 = hexagon tiles. */
export type FoldMode = 0 | 1 | 2;
/** The steps that move pixels around, before anything is drawn. The user sets their order. */
export type ShapeStep = "warp" | "map" | "kaleidoscope";

/** The kind of warp: noise, ripple, waves, swirl, bulge and pinch, cells. */
export type WarpType = 0 | 1 | 2 | 3 | 4 | 5;
/** The steps that change the drawn picture. The user sets their order. */
export type PictureStep = "blur" | "trails" | "relief" | "finish";

const SHAPE_CODES: Record<ShapeStep, number> = { warp: 0, map: 1, kaleidoscope: 2 };
/** 0 normal, 1 screen, 2 multiply, 3 overlay, 4 difference, 5 lighten, 6 darken, 7 add. */
export type LayerBlend = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** How the two images fade: 0 = crossfade, 1 = dissolve by brightness (light areas change first). */
export type BlendMode = 0 | 1;

/** The values for one frame. Angles are in radians. */
export interface FrameValues {
  shapeOrder: ShapeStep[];
  /** Each shape step's opacity, and how its result combines with the picture without it (see LayerBlend). */
  shapeOpacity: Record<ShapeStep, number>;
  layerBlend: Record<ShapeStep, LayerBlend>;
  pictureOrder: PictureStep[];
  segments: number;
  foldMode: FoldMode;
  /** The tile size in tile modes, in screen heights between neighbor cell centers. */
  tileSize: number;
  warpMode: WarpMode;
  warpType: WarpType;
  /** Ripple, swirl and bulge: the center, in screen heights. Waves: the direction (radians). */
  warpCenterX: number;
  warpCenterY: number;
  warpAngle: number;
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
  /** Seamless spiral: the twist (negative turns the other way; 0 gives rings), and the whole number of image copies one turn holds. */
  mapArms: number;
  spiralCopies: number;
  mapTwist: number;
  /** The angle (radians) of the axis that power, log spiral and tunnel fold over. */
  mapAngle: number;
  /** Tunnel only: how far the wall turns per tube length, in radians. */
  tunnelTwist: number;
  /** How far the view has flown into the tunnel. */
  mapTravel: number;
  /** How much the far end of the tunnel fades to black. */
  mapFog: number;
  /** The kaleidoscope center, as a fraction of the screen size from the screen center. */
  centerX: number;
  centerY: number;
  rotation: number;
  zoom: number;
  twirl: number;
  panX: number;
  panY: number;
  trailMode: TrailMode;
  /** How much of the previous frame stays, per 1/60 s. */
  trailAmount: number;
  /** How much the previous frame grows, per 1/60 s. */
  trailZoom: number;
  /** How far the previous frame turns, per 1/60 s. */
  trailTurn: number;
  /** How far the previous frame's colors turn around the color wheel, per 1/60 s. */
  trailHue: number;
  /** How far the previous frame is pushed along (or around) its brightness slopes, in pixels per 1/60 s. */
  trailFlow: number;
  /** 0 pushes along the slopes, 1 around them. */
  trailSwirl: number;
  /** How strongly the old trails are multiplied by the trail color, per 1/60 s (0 = none), and that color (red, green, blue from 0 to 1). */
  trailTint: number;
  trailColor: [number, number, number];
  /** The animation time since the last frame, in 1/60 s units. 0 while paused. */
  frameScale: number;
  /**
   * How far the trails fade this frame, in 1/60 s units. It is the
   * animation time, or the real time while animation time stands still, so
   * a change made while stopped still shows instead of freezing in the trails.
   */
  fadeScale: number;
  /** Unsharp-mask strength (0 = off) and its radius in pixels. */
  sharpen: number;
  sharpenRadius: number;
  /** In stops; 0 = no change, -1 = half as bright. */
  exposure: number;
  /** 0 = no change; colors at or below it become black. */
  blackLevel: number;
  /** The color overlay color (red, green, blue from 0 to 1) and its opacity (0 = off). */
  overlayColor: [number, number, number];
  overlayOpacity: number;
  /** Relief lighting: strength (0 = off), height of the bumps, pixel size, light angle (radians) and gloss. */
  relief: number;
  reliefDepth: number;
  reliefSize: number;
  lightAngle: number;
  shine: number;
  /** 0 shows the first image, 1 the second; between, they fade into each other. */
  imageBlend: number;
  /**
   * Blur, in screen heights (0 = off), and its mask: the mask kind, its
   * size, softness, center (in screen heights from the screen center),
   * angle (radians) and level.
   */
  blur: number;
  blurMask: BlurMask;
  blurMaskSize: number;
  blurMaskSoft: number;
  blurMaskX: number;
  blurMaskY: number;
  blurMaskAngle: number;
  blurMaskLevel: number;
  blendMode: BlendMode;
}

/** Sizes and counts that drive the GPU cost, for the performance display. */
export interface RenderInfo {
  width: number;
  height: number;
  /** The kaleidoscope texture, which includes the border for the blur. */
  textureWidth: number;
  textureHeight: number;
  blurSamples: number;
  /** How many versions of the picture each pixel mixes: 1, plus 1 for each shape step not at full opacity in normal mode. */
  shapeVersions: number;
}

interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
}

/** How many points of the softer picture the blur reads for each pixel (see BLUR_SHADER). */
const BLUR_TAPS = 9;

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
  /** The first and the second image. */
  private readonly imageTextures: [WebGLTexture, WebGLTexture];
  private readonly frameTexture: WebGLTexture;
  private readonly framebuffer: WebGLFramebuffer;
  private readonly trails: Program;
  private readonly copy: Program;
  private readonly finish: Program;
  private readonly relief: Program;
  /** A second scratch picture, so a pass never reads the texture it draws to. */
  private readonly scratch: Target;
  /** A scratch picture between passes. */
  private readonly current: Target;
  /** The trail output of the last frame and of this frame; they change roles each frame. */
  private readonly trailTargets: [Target, Target];
  private trailIndex = 0;
  private trailSize: [number, number] = [0, 0];
  private trailsWereOn = false;
  /** Trails use half-float color when the GPU can draw to it, so long trails fade out cleanly. */
  private readonly trailFormat: { internal: number; type: number };
  readonly timer: GpuTimer;
  readonly info: RenderInfo = { width: 0, height: 0, textureWidth: 0, textureHeight: 0, blurSamples: 0, shapeVersions: 1 };
  private imageSizes: [[number, number], [number, number]] = [[1, 1], [1, 1]];
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
    this.relief = this.createProgram(RELIEF_SHADER);

    /** One triangle that covers the whole screen. */
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.imageTextures = [gl.createTexture()!, gl.createTexture()!];
    /* The second image starts as one black pixel, so its sampler is always complete. */
    gl.bindTexture(gl.TEXTURE_2D, this.imageTextures[1]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
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
    this.scratch = this.createTarget();
    this.trailTargets = [this.createTarget(), this.createTarget()];
    this.timer = new GpuTimer(gl);
  }

  /** Uploads the first (slot 0) or the second (slot 1) image. */
  setImage(source: ImageSource, slot: 0 | 1 = 0) {
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
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTextures[slot]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, upload);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.imageSizes[slot] = [width, height];
  }

  render(v: FrameValues) {
    const gl = this.gl;
    this.resizeCanvas();
    this.timer.collect();
    const [width, height] = this.frameSize;
    if (width === 0 || height === 0) return;

    /* The blur reads up to about its radius past each pixel, so the kaleidoscope picture gets a border that wide. */
    this.ensurePad(v.blur * height);
    const [textureWidth, textureHeight] = this.textureSize;

    const k = this.kaleido;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, textureWidth, textureHeight);
    gl.useProgram(k.program);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTextures[1]);
    gl.uniform1i(k.uniforms.u_img2, 1);
    gl.uniform2f(k.uniforms.u_imgRes2, this.imageSizes[1][0], this.imageSizes[1][1]);
    gl.uniform1f(k.uniforms.u_blend, Math.min(1, Math.max(0, v.imageBlend)));
    gl.uniform1i(k.uniforms.u_blendMode, v.blendMode);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTextures[0]);
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
    gl.uniform1i(k.uniforms.u_warpType, v.warpType);
    gl.uniform2f(k.uniforms.u_warpCenter, v.warpCenterX, v.warpCenterY);
    gl.uniform2f(k.uniforms.u_warpDir, Math.cos(v.warpAngle), Math.sin(v.warpAngle));
    gl.uniform1i(k.uniforms.u_mapMode, v.mapMode);
    gl.uniform1f(k.uniforms.u_mapMix, v.mapMix);
    gl.uniform1f(k.uniforms.u_mapScale, v.mapScale);
    gl.uniform1f(k.uniforms.u_mapPower, v.mapPower);
    gl.uniform2f(k.uniforms.u_mapPoint, v.mapPointX, v.mapPointY);
    gl.uniform1i(k.uniforms.u_mapSteps, Math.round(v.mapSteps));
    gl.uniform1f(k.uniforms.u_mapArms, v.mapArms);
    gl.uniform1f(k.uniforms.u_spiralCopies, v.spiralCopies);
    gl.uniform1f(k.uniforms.u_mapTwist, v.mapTwist);
    gl.uniform2f(k.uniforms.u_mapAxis, Math.cos(v.mapAngle), Math.sin(v.mapAngle));
    gl.uniform1f(k.uniforms.u_mapTravel, v.mapTravel);
    gl.uniform1f(k.uniforms.u_tunnelTwist, v.tunnelTwist);
    gl.uniform1f(k.uniforms.u_mapFog, v.mapFog);
    gl.uniform2f(k.uniforms.u_imgRes, this.imageSizes[0][0], this.imageSizes[0][1]);
    /* The panel order is the order the steps act on the picture; the shader moves the screen point, which is the reverse. */
    gl.uniform1iv(k.uniforms["u_shapeOrder[0]"], new Int32Array([...v.shapeOrder].reverse().map((step) => SHAPE_CODES[step])));
    const opacity = (step: ShapeStep) => Math.min(1, Math.max(0, v.shapeOpacity[step]));
    gl.uniform1fv(k.uniforms["u_shapeOpacity[0]"], new Float32Array([opacity("warp"), opacity("map"), opacity("kaleidoscope")]));
    gl.uniform1iv(k.uniforms["u_shapeBlend[0]"], new Int32Array([v.layerBlend.warp, v.layerBlend.map, v.layerBlend.kaleidoscope]));
    this.info.shapeVersions = 1 + v.shapeOrder.filter((step) => opacity(step) < 1 || v.layerBlend[step] !== 0).length;
    gl.uniform1f(k.uniforms.u_segments, v.segments);
    gl.uniform1i(k.uniforms.u_foldMode, v.foldMode);
    gl.uniform1f(k.uniforms.u_tileSize, Math.max(0.01, v.tileSize));
    gl.uniform1f(k.uniforms.u_rotation, v.rotation);
    gl.uniform1f(k.uniforms.u_zoom, v.zoom);
    gl.uniform1f(k.uniforms.u_twirl, v.twirl);
    gl.uniform2f(k.uniforms.u_offset, v.panX, v.panY);
    this.timer.begin("fold");
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.timer.end();

    Object.assign(this.info, { width, height, textureWidth, textureHeight, blurSamples: v.blur > 0 ? BLUR_TAPS : 0 });

    /** The picture steps that do something, in the user's order. */
    const active: Record<PictureStep, boolean> = {
      blur: v.blur > 0,
      trails: v.trailMode !== 0,
      relief: v.relief > 0,
      finish: v.sharpen > 0 || v.exposure !== 0 || v.blackLevel > 0 || v.overlayOpacity > 0
    };
    const steps = v.pictureOrder.filter((step) => active[step]);
    if (steps.length > 0) this.ensureTrailTargets(width, height);
    for (const step of v.pictureOrder) if (!active[step]) delete this.timer.times[step];
    /** A scratch picture that is not the one being read. */
    const scratchFor = (input: WebGLTexture) => (input === this.current.texture ? this.scratch : this.current);

    /**
     * The picture so far. It starts in the bordered kaleidoscope texture.
     * Blur reads the border, so it can be first; any other first step gets a
     * plain copy without the border (the blur shader with no blur). With no
     * steps, that copy goes straight to the screen.
     */
    let source: WebGLTexture = this.frameTexture;
    let padded = true;
    if (steps[0] !== "blur") {
      const target = steps.length > 0 ? scratchFor(source) : null;
      this.timer.begin("blur");
      this.drawBlur(v, source, true, target, false);
      this.timer.end();
      if (target) {
        source = target.texture;
        padded = false;
      }
    }
    steps.forEach((step, index) => {
      const last = index === steps.length - 1;
      this.timer.begin(step);
      if (step === "trails") {
        /* Trails draw into their own pair of textures, which the next frame reads back. */
        source = this.drawTrails(v, source, width, height);
        if (last) this.drawCopy(source);
      } else {
        const target = last ? null : scratchFor(source);
        if (step === "blur") this.drawBlur(v, source, padded, target, true);
        else if (step === "relief") this.drawRelief(v, source, target, width, height);
        else this.drawFinish(v, source, target, width, height);
        if (target) source = target.texture;
        padded = false;
      }
      this.timer.end();
    });
    this.trailsWereOn = active.trails;
  }

  /**
   * Blur, from a picture with the blur border (the kaleidoscope texture) or
   * without it (after another step). It reads smaller, softer copies of the
   * picture (mip levels), so it needs them made first. With blurring off, it
   * is a plain copy.
   */
  private drawBlur(v: FrameValues, source: WebGLTexture, padded: boolean, target: Target | null, blurring: boolean) {
    const gl = this.gl;
    const [width, height] = this.frameSize;
    const b = this.blur;
    const radius = blurring ? v.blur : 0;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    if (radius > 0) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(b.program);
    gl.uniform1i(b.uniforms.u_tex, 0);
    gl.uniform2f(b.uniforms.u_res, width, height);
    if (padded) gl.uniform2f(b.uniforms.u_texSize, this.textureSize[0], this.textureSize[1]);
    else gl.uniform2f(b.uniforms.u_texSize, width, height);
    gl.uniform1f(b.uniforms.u_pad, padded ? this.pad : 0);
    gl.uniform1f(b.uniforms.u_radius, radius);
    gl.uniform1i(b.uniforms.u_maskMode, v.blurMask);
    gl.uniform1f(b.uniforms.u_maskSize, Math.max(0.01, v.blurMaskSize));
    gl.uniform1f(b.uniforms.u_maskSoft, v.blurMaskSoft);
    gl.uniform2f(b.uniforms.u_maskCenter, v.blurMaskX, v.blurMaskY);
    gl.uniform2f(b.uniforms.u_maskDir, Math.cos(v.blurMaskAngle), Math.sin(v.blurMaskAngle));
    gl.uniform1f(b.uniforms.u_maskLevel, v.blurMaskLevel);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    /* The picture textures are also drawn to and read without mip levels, so they go back to plain reads. */
    if (radius > 0) {
      gl.bindTexture(gl.TEXTURE_2D, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
  }

  private drawRelief(v: FrameValues, source: WebGLTexture, target: Target | null, width: number, height: number) {
    const gl = this.gl;
    const r = this.relief;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(r.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(r.uniforms.u_tex, 0);
    gl.uniform2f(r.uniforms.u_texel, 1 / width, 1 / height);
    gl.uniform1f(r.uniforms.u_relief, v.relief);
    gl.uniform1f(r.uniforms.u_reliefDepth, v.reliefDepth);
    gl.uniform1f(r.uniforms.u_reliefSize, v.reliefSize);
    gl.uniform1f(r.uniforms.u_lightAngle, v.lightAngle);
    gl.uniform1f(r.uniforms.u_shine, v.shine);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Drops the old trail frames, so the next frame starts the trails again. */
  resetTrails() {
    this.trailsWereOn = false;
  }

  /** Gives the GPU context back at once, so a short-lived renderer does not wait for garbage collection. */
  dispose() {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  /** Applies the final effects to the picture and draws it on the screen. */
  private drawFinish(v: FrameValues, source: WebGLTexture, target: Target | null, width: number, height: number) {
    const gl = this.gl;
    const f = this.finish;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(f.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(f.uniforms.u_tex, 0);
    gl.uniform2f(f.uniforms.u_texel, 1 / width, 1 / height);
    gl.uniform1f(f.uniforms.u_sharpen, v.sharpen);
    gl.uniform1f(f.uniforms.u_radius, v.sharpenRadius);
    gl.uniform1f(f.uniforms.u_exposure, v.exposure);
    gl.uniform1f(f.uniforms.u_black, v.blackLevel);
    gl.uniform3f(f.uniforms.u_overlay, ...v.overlayColor);
    gl.uniform1f(f.uniforms.u_overlayOpacity, v.overlayOpacity);
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
  private drawTrails(v: FrameValues, input: WebGLTexture, width: number, height: number): WebGLTexture {
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
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, previous.texture);
    gl.uniform1i(t.uniforms.u_current, 0);
    gl.uniform1i(t.uniforms.u_previous, 1);
    gl.uniform2f(t.uniforms.u_res, width, height);
    gl.uniform1i(t.uniforms.u_mode, v.trailMode);
    gl.uniform1f(t.uniforms.u_amount, fresh ? 0 : Math.pow(v.trailAmount, v.fadeScale));
    gl.uniform1f(t.uniforms.u_zoom, Math.pow(v.trailZoom, scale));
    gl.uniform1f(t.uniforms.u_turn, v.trailTurn * scale);
    gl.uniform1f(t.uniforms.u_hue, v.trailHue * scale);
    gl.uniform2f(t.uniforms.u_texel, 1 / width, 1 / height);
    gl.uniform1f(t.uniforms.u_flow, fresh ? 0 : v.trailFlow * scale);
    gl.uniform1f(t.uniforms.u_swirl, v.trailSwirl);
    /* The tint adds up frame after frame, so it is scaled to the real frame time like the fade. */
    gl.uniform1f(t.uniforms.u_tint, fresh ? 0 : Math.min(1, v.trailTint * 0.1 * v.fadeScale));
    gl.uniform3f(t.uniforms.u_tintColor, ...v.trailColor);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.trailIndex = 1 - this.trailIndex;
    return next.texture;
  }

  /** Sizes the trail textures to the canvas. A new size starts the trails again. */
  private ensureTrailTargets(width: number, height: number) {
    if (width === this.trailSize[0] && height === this.trailSize[1]) return;
    this.trailSize = [width, height];
    for (const target of [this.current, this.scratch, ...this.trailTargets]) this.allocate(target, width, height);
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
