/**
 * An estimate of the GPU memory that the textures of one WebGL 2 context
 * use, for the performance panel. WebGL cannot report it, so the tracker
 * wraps the context's texture calls: each upload or storage call records
 * the size of the texture that is bound, each mip chain adds a third, and
 * a delete removes it. The canvas's own two drawing buffers are added too.
 */

/** Bytes per pixel of the internal formats the renderer uses (an unknown format counts as 4). */
function bytesPerPixel(gl: WebGL2RenderingContext, format: number): number {
  switch (format) {
    case gl.R8: return 1;
    case gl.R16F: case gl.RG8: return 2;
    case gl.R32F: case gl.RG16F: case gl.RGBA8: case gl.RGBA: case gl.SRGB8_ALPHA8: return 4;
    case gl.RG32F: case gl.RGBA16F: return 8;
    case gl.RGBA32F: return 16;
    default: return 4;
  }
}

/** The pixel size of a source that texImage2D uploads (an image, a video, a canvas, image data). */
function sourceSize(source: unknown): [number, number] {
  if (source instanceof HTMLVideoElement) return [source.videoWidth, source.videoHeight];
  if (source instanceof HTMLImageElement) return [source.naturalWidth, source.naturalHeight];
  const sized = source as { width?: number; height?: number } | null;
  return [sized?.width ?? 0, sized?.height ?? 0];
}

export interface TextureMemory {
  /** The textures' bytes now, plus the canvas's drawing buffers. */
  bytes(): number;
}

export function trackTextureMemory(gl: WebGL2RenderingContext): TextureMemory {
  const sizes = new Map<WebGLTexture, number>();
  const mipped = new Set<WebGLTexture>();
  /* Storage with its own levels counts them already, so a mip chain made in it adds nothing. */
  const leveled = new Set<WebGLTexture>();
  const bound = new Map<number, WebGLTexture | null>();
  let unit: number = gl.TEXTURE0;

  const record = (bytes: number) => {
    const texture = bound.get(unit);
    if (texture) sizes.set(texture, bytes);
  };

  const activeTexture = gl.activeTexture.bind(gl);
  gl.activeTexture = (texture: number) => {
    unit = texture;
    activeTexture(texture);
  };
  const bindTexture = gl.bindTexture.bind(gl);
  gl.bindTexture = (target: number, texture: WebGLTexture | null) => {
    if (target === gl.TEXTURE_2D) bound.set(unit, texture);
    bindTexture(target, texture);
  };
  const texImage2D = gl.texImage2D.bind(gl) as (...args: unknown[]) => void;
  gl.texImage2D = ((...args: unknown[]) => {
    texImage2D(...args);
    if (args[0] !== gl.TEXTURE_2D || args[1] !== 0) return;
    /* (target, level, internal, width, height, border, format, type, pixels), or (target, level, internal, format, type, source). */
    const [width, height] = args.length >= 8 ? [args[3] as number, args[4] as number] : sourceSize(args[5]);
    record(width * height * bytesPerPixel(gl, args[2] as number));
  }) as typeof gl.texImage2D;
  const texStorage2D = gl.texStorage2D.bind(gl);
  gl.texStorage2D = (target: number, levels: number, internal: number, width: number, height: number) => {
    texStorage2D(target, levels, internal, width, height);
    if (target !== gl.TEXTURE_2D) return;
    const texture = bound.get(unit);
    if (texture && levels > 1) leveled.add(texture);
    let bytes = 0;
    for (let level = 0; level < levels; level++) bytes += Math.max(1, width >> level) * Math.max(1, height >> level) * bytesPerPixel(gl, internal);
    record(bytes);
  };
  const generateMipmap = gl.generateMipmap.bind(gl);
  gl.generateMipmap = (target: number) => {
    generateMipmap(target);
    const texture = bound.get(unit);
    if (target === gl.TEXTURE_2D && texture && !leveled.has(texture)) mipped.add(texture);
  };
  const deleteTexture = gl.deleteTexture.bind(gl);
  gl.deleteTexture = (texture: WebGLTexture | null) => {
    if (texture) {
      sizes.delete(texture);
      mipped.delete(texture);
      leveled.delete(texture);
    }
    deleteTexture(texture);
  };

  return {
    bytes() {
      let total = 2 * gl.drawingBufferWidth * gl.drawingBufferHeight * 4;
      for (const [texture, bytes] of sizes) total += mipped.has(texture) ? bytes * 4 / 3 : bytes;
      return total;
    }
  };
}
