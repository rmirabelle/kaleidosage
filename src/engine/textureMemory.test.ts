import { describe, expect, it } from "vitest";
import { trackTextureMemory } from "./textureMemory";

/** A stand-in WebGL 2 context with the calls and constants the tracker uses. */
function fakeGl() {
  const gl = {
    TEXTURE_2D: 3553, TEXTURE0: 33984, RGBA: 6408, RGBA8: 32856, RGBA16F: 34842, RGBA32F: 34836, R16F: 33325,
    R8: 33321, RG8: 33323, R32F: 33326, RG16F: 33327, RG32F: 33328, SRGB8_ALPHA8: 35907,
    drawingBufferWidth: 10, drawingBufferHeight: 10,
    activeTexture() {}, bindTexture() {}, texImage2D() {}, texStorage2D() {}, generateMipmap() {}, deleteTexture() {}
  };
  return gl as unknown as WebGL2RenderingContext;
}

describe("trackTextureMemory", () => {
  it("adds up the bound textures' sizes, their mip chains and the canvas buffers, and drops deleted ones", () => {
    const gl = fakeGl();
    const memory = trackTextureMemory(gl);
    const canvas = 2 * 10 * 10 * 4;
    expect(memory.bytes()).toBe(canvas);
    const a = {} as WebGLTexture;
    const b = {} as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, a);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 100, 50, 0, gl.RGBA, 0, null);
    expect(memory.bytes()).toBe(canvas + 100 * 50 * 8);
    gl.generateMipmap(gl.TEXTURE_2D);
    expect(memory.bytes()).toBe(canvas + (100 * 50 * 8 * 4) / 3);
    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, b);
    gl.texStorage2D(gl.TEXTURE_2D, 2, gl.RGBA32F, 4, 4);
    expect(memory.bytes()).toBe(canvas + (100 * 50 * 8 * 4) / 3 + (16 + 4) * 16);
    gl.deleteTexture(a);
    expect(memory.bytes()).toBe(canvas + (16 + 4) * 16);
  });
});
