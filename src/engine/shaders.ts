export const VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

/**
 * GLSL for pictures that carry their cover (docs/LAYERS.md, rule 1): every
 * picture between two steps is premultiplied, its color times its cover,
 * and its cover in alpha. A picture with alpha 1 everywhere is a plain
 * opaque picture, and each step must give the same result for it as with
 * no cover at all. BLEND_COVER_GLSL needs the shader's blendLayer, so it
 * goes after it.
 */
const COVER_GLSL = `
/**
 * The color of a premultiplied pixel without its cover; no cover is black.
 * A full cover returns the color as it is: a division by 1 can round on
 * some GPUs, and a contour line moves with the smallest change.
 */
vec3 straight(vec4 c) { return c.a >= 1.0 ? c.rgb : c.a > 1e-5 ? c.rgb / c.a : vec3(0.0); }
/* A color with this cover, premultiplied. */
vec4 covered(vec3 color, float cover) { return vec4(color * cover, cover); }
/* Light added to a picture: its brightest part adds cover, so it shows over what is under the picture. */
vec4 addLight(vec4 picture, vec3 light) {
  float strength = clamp(max(light.r, max(light.g, light.b)), 0.0, 1.0);
  return vec4(picture.rgb + light, picture.a + (1.0 - picture.a) * strength);
}
`;
const BLEND_COVER_GLSL = `
/**
 * A step's picture mixed into the picture without it, by blend mode and
 * opacity: the colors blend as plain colors, the covers mix. For opaque
 * pictures it is mix(base, blendLayer(base, top, mode), opacity).
 */
vec4 blendCover(vec4 base, vec4 top, int mode, float opacity) {
  vec3 under = straight(base);
  float cover = mix(base.a, top.a, opacity);
  return covered(mix(under, blendLayer(under, straight(top), mode), opacity), cover);
}
`;

/**
 * Pass 1: kaleidoscope. Folds the screen angle into mirrored wedges, then
 * samples the source image with mirror-repeat. Twirl turns the angle more
 * with distance from the center, before the fold, which makes spirals.
 * The target is larger than the screen by u_pad pixels on each side, so the
 * blur pass can read real picture content past the screen edges. u_center
 * moves the fold point away from the screen center, as a fraction of the
 * screen size. With a second image, u_blend fades from the first (0) to the
 * second (1); each image keeps its own width-to-height ratio. Blend mode 0
 * is a plain crossfade; mode 1 dissolves by brightness: the light parts of
 * the second image come through first, and the dark parts last.
 */
/**
 * The Mandelbrot map's loop, shared by the picture shader (KALEIDO_SHADER)
 * and the strip shader (MANDEL_STRIP_SHADER): z = z^2 + c from z = 0, with c
 * the place (u_mapPoint) plus dc. The place's exact path Z comes from the
 * renderer (64-bit numbers, see mandelPath), and the loop works only with
 * the point's small difference from it, d (the usual perturbation):
 * d' = 2 Z d + d^2 + dc, which 32-bit numbers hold well at any depth. Where
 * z = Z + d comes nearer 0 than d itself, or the path ends, d would lose its
 * precision, so the point goes on against the path's start instead
 * (rebasing: d = z, Z = 0). Returns the round the point escaped past 256 in
 * (-1 if it did not), the last z (m), and the slope dz/dc times "scale" (so
 * it stays far from the largest 32-bit number at any depth).
 */
const MANDEL_GLSL = `
/**
 * The place's exact path, 1024 values a row, and how many values it has
 * (it ends where it escapes).
 */
uniform sampler2D u_mandelPath;
uniform int u_mandelLength;
/* A path value as two 32-bit parts: the nearest 32-bit number (xy) and what it leaves out (zw). */
vec4 mandelAt(int n) { return texelFetch(u_mandelPath, ivec2(n & 1023, n >> 10), 0); }

float mandelRun(vec2 dc, float scale, int rounds, out vec2 m, out vec2 slope) {
  vec2 d = vec2(0.0);
  m = vec2(0.0);
  slope = vec2(0.0);
  int ref = 0;
  float escaped = -1.0;
  /**
   * Points inside the set run every round, so they cost the most. Two
   * tests find many of them first: the main heart shape and the large
   * circle to its left (both made 2% smaller, so a point near their edge
   * still runs), and, while the loop runs, a path that comes back to a
   * point it saved (it is caught in a loop, so it never escapes).
   */
  vec2 c = u_mapPoint + dc;
  float qx = c.x - 0.25;
  float q = qx * qx + c.y * c.y;
  bool inside = q * (q + qx) < 0.245 * c.y * c.y || (c.x + 1.0) * (c.x + 1.0) + c.y * c.y < 0.06125;
  vec2 saved = vec2(1e9);
  int saveAt = 8;
  /* Off in deep views (scale below 1e-4): there its tolerance is so small that paths passing very near 0 twice look caught. */
  float near = scale > 1e-4 ? 1e-3 * scale : 0.0;
  /**
   * The path's own stretch, the product of 2z over the rounds: a point
   * caught by a loop in the set has it shrink toward 0 (the loop pulls
   * nearby paths in), at any depth, as it uses z itself, not the point's
   * tiny difference (the saved-point test above stops working deep, where
   * that difference is below what 32-bit numbers hold). Kept from growing
   * past what they hold.
   */
  vec2 pull = vec2(1.0, 0.0);
  for (int i = 0; i < (inside ? 0 : rounds); i++) {
    vec2 big = mandelAt(ref).xy;
    vec2 z = big + d;
    /* From the second round: every path starts at z = 0. */
    if (i > 0) pull = 2.0 * cmul(z, pull);
    if (dot(pull, pull) > 1e20) pull *= 1e-10;
    slope = 2.0 * cmul(z, slope) + vec2(scale, 0.0);
    d = 2.0 * cmul(big, d) + cmul(d, d) + dc;
    ref++;
    /**
     * The full z with the path's left-out part too: where z comes near 0
     * the point goes on from it (just below), and the path's 32-bit
     * rounding alone would grow into black arcs in deep views.
     */
    vec4 next = mandelAt(ref);
    m = (next.xy + d) + next.zw;
    if (dot(m, m) > 65536.0) {
      escaped = float(i);
      break;
    }
    if (dot(m, m) < dot(d, d) || ref >= u_mandelLength - 1) {
      d = m;
      ref = 0;
    }
    if (i == saveAt) {
      saved = m;
      saveAt *= 2;
    } else if (dot(m - saved, m - saved) < near * near || dot(pull, pull) < 1e-24) {
      break;
    }
  }
  return escaped;
}
`;

/**
 * The Mandelbrot strip (see MandelStrip in renderer.ts): the raw map around
 * the place in log-polar form, so a dive reads it instead of running the
 * loop for every pixel of every frame. A texel's column is the angle
 * (TAU * column / u_stripWidth) and its row the distance from the place:
 * global row g lies at 10^(u_stripOrigin - g / u_stripRows), and the rows
 * drawn here are the texture rows from u_texRow0, row u_texRow0 being global
 * row u_gAtRow0. As the rows are as tall as the columns are wide (in log
 * terms), the strip keeps shapes as they are. Out: the smooth escape count
 * (-1 inside the set) in o0, and in o1 the distance to the set's edge
 * (log10, in c units), the angle z escaped at and the light's normal angle
 * (both over PI). The rounds are those of a view 1.5 powers deeper than one
 * whose corner is at this distance, as the strip serves views down to there.
 */
export const MANDEL_STRIP_SHADER = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) out float o0;
layout(location = 1) out vec4 o1;
uniform vec2 u_mapPoint;
uniform float u_stripOrigin;
uniform float u_stripRows;
uniform int u_stripWidth;
uniform float u_gAtRow0;
uniform float u_texRow0;
const float TAU = 6.28318530718;
const float PI = 3.14159265359;
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(dot(b, b), 1e-30); }
${MANDEL_GLSL}
void main() {
  float g = u_gAtRow0 + (floor(gl_FragCoord.y) - u_texRow0);
  float r = pow(10.0, u_stripOrigin - g / u_stripRows);
  float a = TAU * floor(gl_FragCoord.x) / float(u_stripWidth);
  float depth = clamp(log(1.5 / r) * 0.4342944819 + 1.5, 0.0, 10.0);
  int rounds = int(250.0 + 100.0 * depth + 40.0 * depth * depth + 0.5);
  vec2 m;
  vec2 slope;
  float escaped = mandelRun(r * vec2(cos(a), sin(a)), r, rounds, m, slope);
  if (escaped < 0.0) {
    o0 = -1.0;
    o1 = vec4(0.0);
    return;
  }
  float size = length(m);
  o0 = escaped + 1.0 - log2(log(size));
  vec2 normal = cdiv(m, slope);
  float edge = 0.5 * size * log(size) / max(length(slope), 1e-30) * r;
  o1 = vec4(log(max(edge, 1e-37)) * 0.4342944819, atan(m.y, m.x) / PI, atan(normal.y, normal.x) / PI, 0.0);
}`;

export const KALEIDO_SHADER = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D u_img;
uniform sampler2D u_img2;
uniform vec2 u_imgRes2;
uniform float u_blend;
uniform int u_blendMode;
/* 1 when the images repeat past their edges, 0 when they are mirrored (see Tiling). */
uniform int u_tileRepeat;
uniform vec2 u_res;
uniform float u_pad;
uniform vec2 u_center;
uniform vec2 u_imgRes;
uniform float u_segments;
uniform int u_foldMode;
/**
 * The shape steps of this pass in the order they move the screen point:
 * 0 = warp, 1 = complex map, 2 = kaleidoscope fold. This is the reverse of
 * the panel list, because moving the point that is read is the reverse of
 * moving the picture: the last step here is the first to act on the
 * picture. Only the first u_shapeCount entries are used.
 */
uniform int u_shapeOrder[3];
uniform int u_shapeCount;
/* 1 when Algorithm is one of this pass's steps: only then does a spiral map go last (see shapeColor). */
uniform int u_spiralPass;
/**
 * 1: the pass reads the picture made so far (u_img, the size of the screen)
 * instead of the source images, for shape steps that come after a picture
 * step. The picture is mirrored at its edges, like an image.
 */
uniform int u_picture;
/* The opacity and blend mode of each shape step, by step code (warp, map, fold). */
uniform float u_shapeOpacity[3];
uniform int u_shapeBlend[3];
uniform float u_tileSize;
/* The hyperbolic disk (fold mode 4): the mirror circle's center on the x axis and its radius, the wedge angle (pi / sides), and the flow; then the disk radius. */
uniform vec4 u_hyper;
uniform float u_hyperSize;
uniform float u_rotation;
uniform float u_zoom;
uniform float u_twirl;
/* Each reflection's darkening (0 to 1) and hue turn (radians per mirror); see mirrorLight. */
uniform float u_mirrorFade;
uniform float u_mirrorHue;
uniform vec2 u_offset;
uniform int u_mapMode;
uniform float u_mapMix;
uniform float u_mapScale;
uniform float u_mapPower;
uniform vec2 u_mapPoint;
uniform int u_mapSteps;
/* Seamless spiral: the twist, and the whole number of image copies one turn holds, 0 for a slant (see seamlessSpiral). */
uniform float u_mapArms;
uniform float u_spiralCopies;
/* Droste spiral: the size of the copy inside the picture, and the whole number of spiral arms (see drosteMap). */
uniform float u_drosteSize;
uniform float u_drosteSpirals;
/* Droste spiral: how far each frame fades into the next copy, and the frames' shape from rectangle (0) to circle (1). */
uniform float u_drosteSoftness;
uniform float u_drosteRound;
/* Droste spiral: the turn of the whole spiral, in radians. */
uniform float u_drosteRotation;
/* Droste spiral: how much more each smaller copy turns than the copy around it, in radians. */
uniform float u_drostePictureTurn;
uniform float u_mapTwist;
/* The direction of the axis that power, log spiral and tunnel fold over (see complexMap). */
uniform vec2 u_mapAxis;
uniform float u_mapTravel;
/* The map center's pan, and Power, Julia and Sine's roll and twist (Möbius has its own). */
uniform vec2 u_mapPan;
uniform float u_mapRoll;
uniform float u_mapCurl;
uniform float u_tunnelTwist;
uniform float u_mapFog;
uniform float u_mapFogSoftness;
/* Möbius only: the turn (radians), twist, zoom and pan applied after the map. */
uniform float u_mobiusTurn;
uniform float u_mobiusRotation;
uniform float u_mobiusTwist;
uniform float u_mobiusZoom;
uniform vec2 u_mobiusPan;
uniform int u_warpMode;
uniform float u_warpAmount;
uniform float u_warpScale;
/* Cells warp: the cell size, in tenths of the screen height, and the turn of the whole cell pattern (radians). */
uniform float u_warpCellSize;
uniform float u_warpCellAngle;
/* Cells warp: the number of sides (3 to 6), and how far each cell point moves from its grid place, in cells. */
uniform float u_warpCellSides;
uniform float u_warpCellRandom;
uniform float u_warpMarble;
uniform int u_warpDetail;
uniform float u_warpTime;
/* The kind of warp (see warpOffset), the center of ripple, swirl and bulge, and the waves' direction. */
uniform int u_warpType;
uniform vec2 u_warpCenter;
uniform vec2 u_warpDir;
const float TAU = 6.28318530718;
const float PI = 3.14159265359;

/* Complex numbers are vec2(real, imaginary). */
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(dot(b, b), 1e-6); }
vec2 cpow(vec2 z, float n) {
  float r = length(z);
  if (r < 1e-6) return vec2(0.0);
  float t = atan(z.y, z.x) * n;
  return pow(r, n) * vec2(cos(t), sin(t));
}
/**
 * z^n for any n, with no seam. The angle of z jumps from +pi to -pi on the
 * left of the center; when n is not a whole number, the two sides of that
 * jump bend to different places and leave a visible seam. Using the size of
 * the angle (its absolute value) makes the two sides meet, so the lower half
 * mirrors the upper half.
 */
vec2 cpowSeamless(vec2 z, float n) {
  float r = length(z);
  if (r < 1e-6) return vec2(0.0);
  float t = abs(atan(z.y, z.x)) * n;
  return pow(r, n) * vec2(cos(t), sin(t));
}
vec2 csin(vec2 z) {
  float y = clamp(z.y, -10.0, 10.0);
  return vec2(sin(z.x) * cosh(y), cos(z.x) * sinh(y));
}

/* Gradient noise, from -1 to 1. */
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i), f), dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}
/* Layers of noise, each finer and fainter than the one before. */
float fbm(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  const mat2 turn = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 6; i++) {
    if (i >= u_warpDetail) break;
    sum += amplitude * gnoise(p);
    p = turn * p;
    amplitude *= 0.5;
  }
  return sum;
}

/**
 * Noise warp: a moving offset from noise that is itself bent by noise.
 * Marbling sets how much the first noise bends the second; more makes
 * swirls like marbled paper. u_warpTime makes the noise flow.
 */
vec2 noiseWarp(vec2 p) {
  vec2 x = p * u_warpScale;
  float t = u_warpTime;
  vec2 q = vec2(fbm(x + vec2(0.0, 0.7 * t)), fbm(x + vec2(5.2, 1.3) - vec2(0.5 * t, 0.0)));
  vec2 r = vec2(
    fbm(x + u_warpMarble * q + vec2(1.7, 9.2) + 0.3 * t),
    fbm(x + u_warpMarble * q + vec2(8.3, 2.8) - 0.2 * t));
  return r * u_warpAmount;
}

vec2 turn(vec2 v, float a) { return vec2(v.x * cos(a) - v.y * sin(a), v.x * sin(a) + v.y * cos(a)); }

/**
 * The warp: how far the point that is read moves. Size sets how close the
 * waves or whirlpools are (larger is closer); cells have their own cell
 * size (larger is larger cells). u_warpTime (which
 * grows with the warp flow) moves them.
 * - Ripple: circles of waves move out from the center, like a drop in water.
 * - Waves: straight waves roll in the wave direction, with smaller waves
 *   across them, like a flag.
 * - Swirl: three whirlpools, turning in turn one way and the other, circle
 *   the center.
 * - Bulge and pinch: a lens at the center swells the picture; with flow it
 *   breathes in and out, to a pinch and back.
 * - Cells: the picture breaks into cells, like cracked glass, and each cell
 *   shifts its part of the picture on its own small circle.
 */
vec2 warpOffset(vec2 p) {
  float t = u_warpTime;
  float amount = u_warpAmount;
  vec2 d = p - u_warpCenter;
  if (u_warpType == 1) {
    float r = length(d);
    float wave = sin(r * u_warpScale * TAU - t * 4.0);
    return d / max(r, 1e-4) * wave * amount * 0.15 * smoothstep(0.0, 0.05, r);
  }
  if (u_warpType == 2) {
    vec2 across = vec2(-u_warpDir.y, u_warpDir.x);
    float main = sin(dot(p, u_warpDir) * u_warpScale * TAU - t * 4.0);
    float small = sin(dot(p, across) * u_warpScale * TAU * 0.7 + t * 3.0);
    return (across * main * 0.15 + u_warpDir * small * 0.06) * amount;
  }
  if (u_warpType == 3) {
    vec2 offset = vec2(0.0);
    float size = 1.2 / u_warpScale;
    for (int i = 0; i < 3; i++) {
      float a = t * 0.5 + float(i) * TAU / 3.0;
      vec2 v = d - 0.45 * vec2(cos(a), sin(a));
      float spin = amount * 6.0 * exp(-dot(v, v) / (size * size)) * (i == 1 ? -1.0 : 1.0);
      offset += turn(v, spin) - v;
    }
    return offset;
  }
  if (u_warpType == 4) {
    float radius = 1.5 / u_warpScale;
    float lens = max(0.0, 1.0 - dot(d, d) / (radius * radius));
    return -d * amount * cos(t * 2.0) * lens * lens;
  }
  if (u_warpType == 5) {
    /**
     * Each cell shifts the picture by its own amount; a point belongs to the
     * cell of the nearest cell point. The cell points sit in rows. From 4 to
     * 6 sides, every second row slides by up to half a cell and the rows
     * move closer (to sqrt(3)/2), so the squares change step by step into
     * hexagons. From 4 to 3 sides, a diagonal line through each cell point
     * cuts the cell in two: the second half's shift moves away from the
     * first half's, so the cut fades in and each square becomes two
     * triangles. u_warpCellRandom moves each point from its grid place.
     * The cell pattern turns by u_warpCellAngle: the point is turned back
     * into it, and the shift turned out again.
     */
    vec2 x = turn(p, -u_warpCellAngle) * 10.0 / u_warpCellSize;
    float hexagons = clamp(u_warpCellSides - 4.0, 0.0, 2.0) * 0.5;
    float triangles = clamp(4.0 - u_warpCellSides, 0.0, 1.0);
    float slide = 0.5 * hexagons;
    float rowHeight = mix(1.0, 0.8660254, hexagons);
    float row = floor(x.y / rowHeight);
    vec2 nearest = vec2(0.0);
    vec2 nearestPoint = vec2(0.0);
    float best = 1e9;
    for (int j = -1; j <= 1; j++) {
      float r = row + float(j);
      float offset = slide * mod(r, 2.0);
      float column = floor(x.x - offset);
      for (int i = -1; i <= 1; i++) {
        vec2 id = vec2(column + float(i), r);
        vec2 point = vec2(id.x + 0.5 + offset, (r + 0.5) * rowHeight) + u_warpCellRandom * hash2(id + 17.0) * vec2(1.0, rowHeight);
        vec2 d = x - point;
        float dist = dot(d, d);
        if (dist < best) {
          best = dist;
          nearest = id;
          nearestPoint = point;
        }
      }
    }
    vec2 h = hash2(nearest);
    vec2 fromPoint = x - nearestPoint;
    if (triangles > 0.0 && fromPoint.x > fromPoint.y) h = mix(h, hash2(nearest + 31.7), triangles);
    return turn(amount * 0.25 * vec2(cos(h.x * TAU + t), sin(h.y * TAU + t * 0.7)), u_warpCellAngle);
  }
  return noiseWarp(p);
}

/**
 * Bends the screen point through a complex function before the fold.
 * 1 = power z^n, 2 = Mobius (moves the point "a" to the center), 3 = Julia
 * (z = z^2 + c, a few steps), 4 = log spiral (an endless tunnel), 5 = sine,
 * 6 = tunnel (a tube that the view flies through), 7 = seamless spiral,
 * 8 = Droste spiral (the picture inside itself, along a spiral).
 * Map mix blends from the plain point (0) to the bent point (1).
 */
/**
 * A seamless spiral of twist k, from the point's log distance and angle
 * (l). One full turn around the center moves the image by (k image repeats
 * across, 1 up); an image repeat is 2 image widths across and 2 heights up,
 * because the image is mirrored. That meets itself only for a whole k, so
 * the image is changed a little to fit:
 * - n copies (n not 0): the image is stretched across by k / n, so one
 *   turn moves it by n of its stretched repeats.
 * - n = 0: the image is slanted instead (each step up moves it across), so
 *   one turn moves it straight up by one repeat. A slant has no limit at a
 *   twist of 0, where it is plain rings, so the twist can pass through 0
 *   and reverse with no jump.
 */
vec2 seamlessSpiral(vec2 l, float k, float n) {
  float aspect = u_imgRes.x / u_imgRes.y;
  vec2 repeat = vec2(2.0 * aspect * k, 2.0);
  vec2 w = vec2(l.x * repeat.y + l.y * repeat.x, l.y * repeat.y - l.x * repeat.x) / TAU;
  if (n != 0.0) w.x *= n / k;
  else w.x -= aspect * k * w.y;
  return w;
}

/**
 * The point the Möbius map works on, from the point after the map zoom. The
 * rotation turns the whole picture (the pan too) around the screen center.
 * The map's pole is at a / |a|^2 (a is the Möbius point), so moving by it
 * puts the pole at the screen center, and the pan then moves the pole from there.
 */
vec2 mobiusInput(vec2 z) {
  vec2 a = u_mapPoint;
  return turn(z, -u_mobiusTurn) - u_mobiusPan + a / max(dot(a, a), 1e-4);
}

/**
 * How much the last Julia map stretched the picture: the size of the steps'
 * derivative (each step multiplies it by 2|z|). Set by complexMap, it works
 * like mobiusStretch, so fast-growing points blur instead of breaking into noise.
 */
float juliaStretch;

/**
 * How much the last Droste map stretched the picture at the point (the size
 * of its derivative). Set by drosteMap, for the texture detail.
 */
float drosteStretch;

/**
 * The spiral count that drosteMap uses: a whole number. shapeColor sets it
 * to each of the two whole counts around u_drosteSpirals in turn.
 */
float drosteArms;

/**
 * The edge blend of the last Droste map (see drosteMap): the point in the
 * smaller copy next to the frame, and how much of it shows (0: none).
 */
vec2 drosteAlt;
float drosteAltWeight;

/**
 * Droste spiral: the picture holds a smaller copy of itself at its center
 * (u_drosteSize of its size), which holds a smaller copy, and so on, with no
 * end inward or outward. Each copy is the whole picture as a rectangle, so
 * its edges show as frames in frames.
 *
 * In log space (L = log of the image point: log distance, angle) that
 * picture repeats each time the distance grows by s = 1 / size (L.x moves
 * by log s) and each full turn (L.y moves by 2 pi). The screen point's log
 * (W) is multiplied by beta = 1 - i * arms * log s / (2 pi): one turn
 * around the screen center then moves L by one full turn and by "arms"
 * copies, which is one of the picture's own repeats, so the picture meets
 * itself with no seam. With 0 arms the frames are plain, with no spiral.
 *
 * The image point is then moved by whole copies into the space between
 * the picture's edge and its copy's edge, where the picture shows.
 * The speed moves in L, toward the center: one copy per log s.
 *
 * The frames' shape: how far out a point is is measured by the picture's
 * rectangle, by a circle inside it, or by a mix of the two. Each measure
 * grows in step with the point's distance, so the copies still repeat; and
 * the circle's measure is never smaller than the rectangle's, so a point
 * inside a frame is always inside the picture.
 *
 * Rotate (pre): each copy is also turned by u_drostePictureTurn more than
 * the copy around it, so the frames twist inward like a tunnel. One copy
 * inward is then a step of (-log s, turn) in L, not only of -log s. The
 * spiral's beta and the travel follow that step, so the picture still
 * meets itself and Travel still loops with no jump.
 *
 * The edge blend: near a frame's outer edge, the point fades into the same
 * point one copy smaller (drosteAlt), which is what the other side of the
 * frame shows. At the frame both sides then show the same color, so the
 * hard edge becomes a soft fade.
 */
float drosteMeasure(vec2 q, float aspect) {
  float rectangle = max(abs(q.x) / (0.5 * aspect), abs(q.y) / 0.5);
  float circle = length(q) / (0.5 * min(aspect, 1.0));
  return mix(rectangle, circle, clamp(u_drosteRound, 0.0, 1.0));
}

vec2 drosteMap(vec2 z) {
  float size = clamp(u_drosteSize, 0.05, 0.95);
  float logS = -log(size);
  float copyTurn = u_drostePictureTurn;
  vec2 wLog = vec2(log(max(length(z), 1e-6)), atan(z.y, z.x));
  vec2 beta = vec2(1.0 - drosteArms * copyTurn / TAU, -drosteArms * logS / TAU);
  vec2 l = cmul(wLog, beta) - u_mapTravel * vec2(1.0, -copyTurn / logS);
  vec2 q = exp(l.x) * vec2(cos(l.y), sin(l.y));
  /**
   * How far out the point is, by the frame's shape: 1 at the frame. Copy k
   * (k inward from this frame) is the picture made size^k as large and
   * turned by k turns, so the point in copy k's picture is q / size^k,
   * turned back by k turns. The copy that shows is the deepest one whose
   * frame holds the point. The rectangle lies between the circle inside
   * it and the circle through its corners, so only the copies between
   * those two circles' answers can be the one; with no turn this is the
   * one copy that brings the measure between size and 1.
   */
  float aspect = u_imgRes.x / u_imgRes.y;
  float inner = length(q) / (0.5 * min(aspect, 1.0));
  float outer = length(q) / length(vec2(0.5 * aspect, 0.5));
  float sure = floor(-log(max(inner, 1e-12)) / logS);
  float deepest = floor(-log(max(outer, 1e-12)) / logS);
  float k = sure;
  vec2 picture = turn(q * exp(sure * logS), -sure * copyTurn);
  float m = drosteMeasure(picture, aspect);
  for (int i = 0; i < 64; i++) {
    float tryK = deepest - float(i);
    if (tryK <= sure) break;
    vec2 tried = turn(q * exp(tryK * logS), -tryK * copyTurn);
    float tryM = drosteMeasure(tried, aspect);
    if (tryM <= 1.0) {
      k = tryK;
      picture = tried;
      m = tryM;
      break;
    }
  }
  q = picture;
  drosteStretch = length(beta) * length(q) / max(length(z), 1e-6);
  /* The fade starts this far inside the frame, in log steps: at softness 1, at the copy's frame. */
  float band = clamp(u_drosteSoftness, 0.0, 1.0) * logS;
  /* The same point in the copy around this one: one size larger, turned one turn less. */
  drosteAlt = turn(q * size, copyTurn);
  /**
   * The pan moves the picture inside the frames (in picture heights), after
   * the size change, so the edge blend's point moves the same way.
   */
  q -= u_mapPan;
  drosteAlt -= u_mapPan;
  drosteAltWeight = band > 0.0 ? smoothstep(-band, 0.0, log(max(m, 1e-12))) : 0.0;
  return q;
}

/**
 * How far the last Tunnel or Möbius map's point was from the far end (the
 * tunnel's center, or the Möbius pole), measured before the map. Set by
 * complexMap, for the depth fade.
 */
float depthDistance;

/**
 * The Mandelbrot map (u_mapMode 9), set by complexMap: the shade from its
 * light and terraces (0 inside the set, which is black), and how much it
 * stretches the picture (like juliaStretch), so thin bands blur instead of
 * breaking into noise.
 */
float mandelShade = 1.0;
/* Edge light's mask: 1 at the set's edge, falling to 0 in the open areas (see u_mandelEdge). */
float mandelEdgeLight = 1.0;
float mandelStretch = 1.0;
/**
 * How far past the view's round limit the point is (1: black), and the
 * shade busy areas take, from the distance to the set's edge (see
 * mandelLook and the busy areas in shapeColor).
 */
float mandelBeyond = 0.0;
float mandelBusyShade = 1.0;
/* How fast the bands and the escape angle change per screen unit, which sets where the light would sparkle (the picture's own stretch can be slower, see the palette). */
float mandelSparkle = 1.0;
/**
 * The screen pixel's size in the map's units (set by shapeColor), and
 * whether this pixel took extra samples (see mandelLook's use in complexMap).
 */
float mandelPixel = 0.0;
bool mandelSampled = false;
/* Depth in powers of ten (0 to 10), band width, terraces, light, and the light's direction. */
uniform float u_mandelDepth;
/* The rounds to run where the strip is not ready (see mandelFromStrip). */
uniform int u_mandelRounds;
/**
 * The view's round limit: points that escape later are black, as if they
 * had not escaped, over a short fade. It rises with the view's depth, so as
 * a dive goes deeper, the slow points at the edge of the black turn to
 * color one by one. The strip holds counts past it (it runs the rounds of
 * deeper views), so the limit, not the strip, sets the black edge.
 */
uniform float u_mandelLimit;
${MANDEL_GLSL}
/**
 * The strip this pass reads (see MANDEL_STRIP_SHADER): on or off, its two
 * textures and size, where its global rows lie, and the global rows that
 * are ready (a span with no gaps; texture row = global row mod height).
 */
uniform int u_stripOn;
uniform sampler2D u_stripCount;
uniform sampler2D u_stripData;
uniform ivec2 u_stripSize;
uniform float u_stripOrigin;
uniform float u_stripRows;
uniform vec2 u_stripReady;

/**
 * The map at dc (from the place, c units) read from the strip, if the rows
 * around its distance are ready: the escape count (-1 inside), the escape
 * and normal angles (over PI) and the distance to the edge in screen heights.
 * The count and the distance are mixed from the four texels around the
 * point; the angles, which jump where they wrap, come from the nearest one.
 */
bool mandelFromStrip(vec2 dc, float span, out float count, out float escapeAngle, out float normalAngle, out float edgeDistance) {
  count = -1.0;
  escapeAngle = 0.0;
  normalAngle = 0.0;
  edgeDistance = 1.0;
  float r = length(dc);
  if (u_stripOn == 0 || r <= 0.0) return false;
  float g = (u_stripOrigin - log(r) * 0.4342944819) * u_stripRows;
  float g0 = floor(g);
  if (g0 < u_stripReady.x || g0 + 1.0 > u_stripReady.y) return false;
  float u = fract(atan(dc.y, dc.x) / TAU) * float(u_stripSize.x);
  float u0 = floor(u);
  float fu = u - u0;
  float fg = g - g0;
  int ja = int(u0) % u_stripSize.x;
  int jb = (ja + 1) % u_stripSize.x;
  int ra = int(mod(g0, float(u_stripSize.y)));
  int rb = int(mod(g0 + 1.0, float(u_stripSize.y)));
  float c00 = texelFetch(u_stripCount, ivec2(ja, ra), 0).r;
  float c10 = texelFetch(u_stripCount, ivec2(jb, ra), 0).r;
  float c01 = texelFetch(u_stripCount, ivec2(ja, rb), 0).r;
  float c11 = texelFetch(u_stripCount, ivec2(jb, rb), 0).r;
  ivec2 nearest = ivec2(fu < 0.5 ? ja : jb, fg < 0.5 ? ra : rb);
  vec4 data = texelFetch(u_stripData, nearest, 0);
  float logEdge = data.r;
  if (min(min(c00, c10), min(c01, c11)) < 0.0) {
    count = texelFetch(u_stripCount, nearest, 0).r;
  } else {
    count = mix(mix(c00, c10, fu), mix(c01, c11, fu), fg);
    float e00 = texelFetch(u_stripData, ivec2(ja, ra), 0).r;
    float e10 = texelFetch(u_stripData, ivec2(jb, ra), 0).r;
    float e01 = texelFetch(u_stripData, ivec2(ja, rb), 0).r;
    float e11 = texelFetch(u_stripData, ivec2(jb, rb), 0).r;
    logEdge = mix(mix(e00, e10, fu), mix(e01, e11, fu), fg);
  }
  escapeAngle = data.g;
  normalAngle = data.b;
  edgeDistance = pow(10.0, logEdge) / span;
  return true;
}
uniform float u_mandelBands;
uniform float u_mandelTerraces;
uniform float u_mandelSoftness;
/**
 * Edge light: how much the areas away from the set's edge fade to black,
 * and the distance from the edge (in screen heights) where they are black.
 */
uniform float u_mandelEdge;
uniform float u_mandelEdgeWidth;
/* The bands moved by Band flow. */
uniform float u_mandelFlow;
/* The palette's spread (repeats per doubling of the round count), and Invert (0 to 1). */
uniform float u_mandelSpread;
uniform float u_mandelInvert;
uniform float u_mandelLight;
uniform vec2 u_mandelLightDir;

/**
 * The Mandelbrot map's look at one sample, from its raw values: its shade
 * (light and terraces), Edge light's mask, how far past the view's round
 * limit it is (1: black, then the shade is 0), and the shade busy areas
 * take: from the distance to the set's edge in pixels, in powers of ten,
 * bright at 1/100 pixel or nearer (the pixel is full of filaments), dark at
 * 5 pixels or farther. Several samples of one pixel can be averaged (see
 * complexMap).
 */
vec4 mandelLook(float count, float normalAngle, float edgeDistance) {
  float beyond = count < 0.0 ? 1.0 : smoothstep(u_mandelLimit - max(2.0, 0.03 * u_mandelLimit), u_mandelLimit, count);
  if (beyond >= 1.0) return vec4(0.0, 1.0, 1.0, 0.0);
  float nearEdge = 1.0 - smoothstep(-2.0, 0.7, log(max(edgeDistance / max(mandelPixel * u_mapScale, 1e-9), 1e-6)) * 0.4342944819);
  /* Band flow's remainder for the terraces is one band (see the picture's below). */
  float terraceBand = count / max(u_mandelBands, 0.01) + fract(u_mandelFlow);
  /* The distance to the set's edge needs nothing but this sample, so the light moves smoothly as the view dives or Edge width moves. */
  float fall = edgeDistance / u_mandelEdgeWidth;
  float edgeLight = mix(1.0, exp(-fall * fall), clamp(u_mandelEdge, 0.0, 1.0));
  vec2 normal = vec2(cos(PI * normalAngle), sin(PI * normalAngle));
  float lit = clamp((dot(normal, u_mandelLightDir) + 1.5) / 2.5, 0.0, 1.0);
  float edge = 0.5 * clamp(u_mandelSoftness, 0.0, 1.0) + 1e-4;
  float t = fract(terraceBand);
  float rise = min(t / (1.0 - edge), (1.0 - t) / edge);
  float step_ = 0.45 + 0.55 * mix(rise, smoothstep(0.0, 1.0, rise), clamp(u_mandelSoftness, 0.0, 1.0));
  return vec4(mix(1.0, lit, u_mandelLight) * mix(1.0, step_, u_mandelTerraces), edgeLight, beyond, mix(0.3, 1.3, nearEdge * nearEdge));
}

vec2 complexMap(vec2 p) {
  depthDistance = 1e9;
  if (u_mapMode == 0) return p;
  /**
   * The pan moves the map's center on the screen (in screen units, whatever
   * the zoom). The Droste spiral uses the pan inside its frames instead (see
   * drosteMap), and has no zoom.
   */
  vec2 z = u_mapMode == 8 ? p : (p - u_mapPan) / u_mapScale;
  vec2 w = z;
  /**
   * The point turned by the rotation, which turns the whole map. With a
   * mirrored image, Power, log spiral and tunnel use the size of the angle,
   * which folds the picture over an axis, so the rotation turns that axis too.
   */
  vec2 onAxis = vec2(dot(z, u_mapAxis), dot(z, vec2(-u_mapAxis.y, u_mapAxis.x)));
  if (u_mapMode == 1) {
    /**
     * A repeated image would show the mirror line of cpowSeamless as a seam,
     * so it uses the full angle: no seam at a whole power, and a seam on
     * the left of the center at other powers.
     */
    w = u_tileRepeat == 1 ? cpow(onAxis, u_mapPower) : cpowSeamless(onAxis, u_mapPower);
  } else if (u_mapMode == 2) {
    vec2 c = mobiusInput(z);
    depthDistance = length(c - u_mapPoint / max(dot(u_mapPoint, u_mapPoint), 1e-4));
    vec2 a = u_mapPoint;
    w = cdiv(c - a, vec2(1.0, 0.0) - cmul(vec2(a.x, -a.y), c));
    /* Then the turn and the twist (which turns more with distance), and the zoom. */
    w = turn(w, u_mobiusRotation + u_mobiusTwist * length(w)) / u_mobiusZoom;
  } else if (u_mapMode == 3) {
    /**
     * Julia: z = z^2 + c, a few steps, stopping when the point passes a size
     * of 4. Each step count makes a band. Where neighbor points stop one step
     * apart, their stop points differ, which showed as a seam; so inside its
     * band a stopped point moves from its point one step earlier (at the
     * edge with the band that stopped a step sooner) to its stop point (at
     * the edge with the band that stops a step later). Both edges then match
     * their neighbors exactly. Points that never stop keep their last point.
     */
    w = onAxis;
    vec2 before = w;
    bool stopped = false;
    float stretch = 1.0 / u_mapScale;
    float stretchBefore = stretch;
    for (int i = 0; i < u_mapSteps; i++) {
      before = w;
      stretchBefore = stretch;
      stretch *= 2.0 * length(w);
      w = cmul(w, w) + u_mapPoint;
      if (dot(w, w) > 16.0) {
        stopped = true;
        break;
      }
    }
    if (stopped) {
      /* "past": how far the stop point is past the size of 4; "below": how far the point before it was under 4. */
      float past = log(length(w)) - log(4.0);
      float below = max(log(4.0) - log(max(length(before), 1e-6)), 0.0);
      float t = below / (past + below + 1e-6);
      w = mix(before, w, t);
      stretch = mix(stretchBefore, stretch, t);
    }
    juliaStretch = stretch;
    /**
     * Julia has no single far end; its far ends are where the steps stretch
     * the picture most. Near the Möbius pole the stretch grows as 1 /
     * distance^2, so 1 / sqrt(stretch) works as the distance for the depth fade.
     */
    depthDistance = inversesqrt(max(stretch, 1e-8));
  } else if (u_mapMode == 4) {
    if (u_tileRepeat == 1) {
      /**
       * A repeated image: the full angle, so there is no mirror line. One
       * turn moves the image up by exactly 3 repeats, so it meets itself
       * on the left of the center. The twist turns only the distance part,
       * which slants the rings into a spiral and keeps that match.
       */
      vec2 l = vec2(log(max(length(onAxis), 1e-6)) - u_mapTravel, atan(onAxis.y, onAxis.x));
      w = 0.5 * l.x * vec2(cos(u_mapTwist), sin(u_mapTwist)) + vec2(0.0, 3.0 * l.y / TAU);
    } else {
      /* The size of the angle, as in cpowSeamless: the cut on the left of the center then closes. */
      vec2 l = vec2(log(max(length(onAxis), 1e-6)) - u_mapTravel, abs(atan(onAxis.y, onAxis.x)));
      float c = cos(u_mapTwist);
      float s = sin(u_mapTwist);
      w = mat2(c, s, -s, c) * l * 0.5;
    }
    /* The center is endlessly deep, as in the tunnel: the speed moves into it, and the depth fade darkens it. */
    depthDistance = length(onAxis);
  } else if (u_mapMode == 7) {
    /**
     * Seamless spiral (see seamlessSpiral). Where the angle jumps from +PI
     * to -PI, the picture meets itself, so there is no fold and no seam.
     * The copy count stays fixed while the twist moves (the engine takes it
     * from the middle of the twist's range, or uses 0 when the range comes
     * near 0), so a moving twist only changes the stretch or the slant and
     * never jumps. A stretch follows the twist's direction.
     */
    float k = u_mapArms;
    float n = u_spiralCopies == 0.0 ? 0.0 : (k < 0.0 ? -1.0 : 1.0) * u_spiralCopies;
    vec2 l = vec2(log(max(length(onAxis), 1e-6)) - u_mapTravel, atan(onAxis.y, onAxis.x));
    w = seamlessSpiral(l, n == 0.0 ? k : (abs(k) < 1e-4 ? 1e-4 : k), n);
    depthDistance = length(onAxis);
  } else if (u_mapMode == 8) {
    /**
     * The map rotation, which only turns a fold axis, is not used. The
     * Droste rotation turns the point before the map, so the whole spiral
     * and its frames turn on the screen; a turn of the angle keeps the
     * spiral meeting itself.
     */
    w = drosteMap(turn(z, -u_drosteRotation));
    drosteStretch /= u_mapScale;
    depthDistance = length(z);
  } else if (u_mapMode == 9) {
    /**
     * Mandelbrot: the place (u_mapPoint) plus the screen point, 1.5 /
     * 10^Depth across, through the loop in MANDEL_GLSL (or read from the
     * strip). A point that escapes gets the usual smooth escape count,
     * which picks its color from a palette read from the picture (see below);
     * Band width sets the terraces' bands. The light comes from the formula's own slope
     * (z over its derivative, the usual normal map of a Mandelbrot), and
     * Terraces darkens each band toward one edge, which looks like stacked
     * steps. Softness turns each step's sharp edge into a slope (at 1, the
     * bands rise and fall evenly, with no edge). Points that never escape
     * are in the set: black. Deeper views need more rounds.
     */
    float span = 1.5 * pow(10.0, -clamp(u_mandelDepth, 0.0, 10.0));
    vec2 dc = onAxis * span;
    /**
     * The raw map at this point: from the strip where it is ready (see
     * mandelFromStrip), else from the loop (see MANDEL_GLSL).
     */
    float count;
    float escapeAngle;
    float normalAngle;
    float edgeDistance;
    bool fromStrip = mandelFromStrip(dc, span, count, escapeAngle, normalAngle, edgeDistance);
    if (!fromStrip) {
      vec2 m;
      vec2 slope;
      float escaped = mandelRun(dc, span, u_mandelRounds, m, slope);
      if (escaped >= 0.0) {
        float size = length(m);
        count = escaped + 1.0 - log2(log(size));
        escapeAngle = atan(m.y, m.x) / PI;
        vec2 normal = cdiv(m, slope);
        normalAngle = atan(normal.y, normal.x) / PI;
        /* The distance to the set's edge, in screen heights: the usual estimate, |z| ln|z| / |dz/dc|, with the slope per screen unit. */
        edgeDistance = 0.5 * size * log(size) / max(length(slope), 1e-30);
      }
    }
    /**
     * Extra samples where the pixel holds the set's edge (within 4 pixels of
     * it by the distance estimate, or inside, next to it) or the black edge
     * of the round limit (past 70% of it; the distance estimate measures to
     * the set, not to that edge): four more points
     * in the pixel (a turned grid), their looks averaged with this one's, so
     * the light, terraces and black edge do not sparkle as the view moves.
     * Only from the strip, where a sample is a few texture reads; the loop
     * would cost four times the rounds.
     */
    vec4 look = mandelLook(count, normalAngle, edgeDistance);
    mandelSampled = false;
    if (fromStrip && (count < 0.0 || count > 0.7 * u_mandelLimit || edgeDistance < 4.0 * mandelPixel)) {
      vec2 offsets[4] = vec2[4](vec2(0.125, 0.375), vec2(-0.375, 0.125), vec2(0.375, -0.125), vec2(-0.125, -0.375));
      float samples = 1.0;
      /* A count known only at run time, so the compiler keeps one copy of the strip read (see the step loop in shapeColor). */
      for (int k = 0; k < u_stripOn * 4; k++) {
        float sampleCount;
        float sampleEscape;
        float sampleNormal;
        float sampleEdge;
        if (mandelFromStrip((onAxis + offsets[k] * mandelPixel) * span, span, sampleCount, sampleEscape, sampleNormal, sampleEdge)) {
          look += mandelLook(sampleCount, sampleNormal, sampleEdge);
          samples += 1.0;
        }
      }
      look /= samples;
      mandelSampled = samples > 1.0;
    }
    mandelShade = look.x;
    mandelEdgeLight = look.y;
    mandelBeyond = look.z;
    mandelBusyShade = look.w;
    if (count < 0.0 || look.z >= 1.0) {
      mandelStretch = 1.0;
      mandelSparkle = 1.0;
      w = vec2(0.0);
    } else {
      /**
       * The palette: the picture read along its diagonal (bottom left to top
       * right, and back, as it is mirrored), by the log of the round count
       * times the spread, so a color lasts while the count doubles and the
       * colors stay strong at any depth (the picture laid across the dense
       * bands of a deep view blurred to its average color). Band flow moves
       * it (repeats a second, kept small with a remainder of a whole
       * repeat), and it moves on 0.2 repeats a power of ten as the view goes
       * deeper, so each depth has its own colors. Its blur follows its own
       * change: the count's, |dcount| / (count ln 2), times the spread and
       * the diagonal's length.
       */
      float acrossBands = 0.5 / max(edgeDistance, 1e-30) / max(u_mandelBands, 0.01);
      float aspect = u_imgRes.x / u_imgRes.y;
      float t = log2(max(count, 1.0)) * u_mandelSpread + mod(u_mandelFlow, 2.0) + 0.2 * u_mandelDepth;
      float along = 1.0 - abs(1.0 - mod(t, 2.0));
      w = vec2((along - 0.5) * aspect, along - 0.5);
      mandelStretch = u_mandelSpread * 0.5 / max(edgeDistance, 1e-30) / (max(count, 1.0) * 0.6931471806) * sqrt(aspect * aspect + 1.0) / max(u_mapScale, 1e-4);
      /**
       * Where the light and terraces would sparkle: across the bands, the
       * count's change, |dz/d(screen)| / (|z| ln|z|) = 1 / (2 edge distance),
       * over the band width; and the light's normal turns as fast as the
       * escape angle, |dz/d(screen)| / (|z| PI) = ln|z| / (2 PI edge
       * distance), 5 to 10 times faster.
       */
      float through = 1.0 - fract(count + 2.4712336270551026);
      float logSize = exp2(2.4712336270551026 + through);
      mandelSparkle = max(acrossBands, logSize / (TAU * max(edgeDistance, 1e-30))) / max(u_mapScale, 1e-4);
    }
  } else if (u_mapMode == 5) {
    w = csin(onAxis * PI) / PI;
  } else if (u_mapMode == 6) {
    /**
     * Tunnel: the angle goes around the wall, and 1/r is the distance into
     * the tube, so the center is endlessly far away. u_mapTravel moves the
     * view forward; twist turns the wall more with distance (a spiral).
     * The size of the angle is used, as in cpowSeamless, so there is no seam.
     */
    depthDistance = length(onAxis);
    float depth = 0.3 / max(length(onAxis), 1e-4) + u_mapTravel;
    float around = abs(atan(onAxis.y, onAxis.x)) / PI;
    if (u_tileRepeat == 1) {
      /**
       * A repeated image: the full angle, so there is no mirror line, and a
       * whole number of image widths around (about as many as the mirrored
       * image shows), so the wall meets itself on the left of the center.
       */
      float aspect = u_imgRes.x / u_imgRes.y;
      around = atan(onAxis.y, onAxis.x) / TAU * max(1.0, floor(2.0 / aspect + 0.5)) * aspect;
    }
    around += depth * u_tunnelTwist / PI;
    w = vec2(around, depth);
  }
  /* Roll and twist for the maps with no seam to keep (see mapRoll). */
  if (u_mapMode == 1 || u_mapMode == 3 || u_mapMode == 5) w = turn(w, u_mapRoll + u_mapCurl * length(w));
  if (u_mapMode == 8) drosteAlt = mix(p, drosteAlt, u_mapMix);
  return mix(p, w, u_mapMix);
}

/**
 * How much the Möbius map stretches the picture at the point p: the size of
 * its derivative, (1 - |a|^2) / |1 - conj(a) z|^2, over the zooms, mixed by
 * the map mix. It grows without limit near the pole, where the map sends the
 * picture to infinity. The texture detail there comes from this exact value
 * instead of the capped measure, so the picture fades to its average color
 * instead of breaking into noise.
 */
float mobiusStretch(vec2 p) {
  vec2 a = u_mapPoint;
  vec2 d = vec2(1.0, 0.0) - cmul(vec2(a.x, -a.y), mobiusInput(p / u_mapScale));
  float s = abs(1.0 - dot(a, a)) / max(dot(d, d), 1e-12) / (u_mapScale * u_mobiusZoom);
  return mix(1.0, s, u_mapMix);
}

/**
 * The offset from the center of the nearest cell in a grid of hexagons with
 * flat tops and bottoms. Neighbor centers are 1 apart, in the directions
 * 30, 90, 150... degrees, so the cell edges run at 0, 60 and 120 degrees.
 */
vec2 hexLocal(vec2 p) {
  p = p.yx;
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 centers = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - centers.xy * s, p - (centers.zw + 0.5) * s);
  return (dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw).yx;
}

/**
 * Reads an image at the folded point q, mirrored at its edges, with texture
 * detail g. The picture made so far (u_picture) is placed the way it was on
 * the screen, so a point that no step moves reads the same pixel.
 *
 * Where a step enlarges the image (one image pixel covers more than one
 * screen pixel, for example at the center of a high power map), plain
 * smoothing spreads the step from one image pixel to the next over the
 * whole enlarged pixel, which shows as a blur. There the read point moves
 * toward the center of its image pixel, so the step between two pixels
 * takes about one screen pixel: edges stay sharp at any size. Where the
 * image is not enlarged, the read point does not move.
 */
vec4 sampleImage(sampler2D image, vec2 size, vec2 q, float g) {
  float aspect = size.x / size.y;
  vec2 uv = q * vec2(1.0 / aspect, 1.0) + 0.5 + u_offset;
  if (u_picture == 1) uv += u_center;
  /* A repeated image is read at its place in one repeat; the texture's repeat wrap keeps its edges seamless. */
  uv = u_picture == 0 && u_tileRepeat == 1 ? fract(uv) : 1.0 - abs(1.0 - mod(uv, 2.0));
  float texels = g * size.y;
  if (texels < 1.0) {
    vec2 texel = uv * size - 0.5;
    vec2 cell = floor(texel);
    vec2 f = clamp((texel - cell - 0.5) / max(texels, 1e-4) + 0.5, 0.0, 1.0);
    uv = (cell + f + 0.5) / size;
  }
  vec4 c = textureGrad(image, uv, vec2(g / aspect, 0.0), vec2(0.0, g));
  /* The source images are opaque, also a PNG with clear parts (as it always was); the picture made so far brings its cover. */
  return u_picture == 1 ? c : vec4(c.rgb, 1.0);
}

/**
 * Turns a point (rotation, and twirl, which turns more with distance), folds
 * it into mirrored wedges or tiles, and zooms it into image space.
 */
/**
 * Set by fold() between 0 and 0.5 radial segments: the point with no fold,
 * and how much of its picture to mix in (see the crossfade in fold).
 */
vec2 foldAlt;
float foldAltWeight;
/** Set by fold(): how much the fold enlarges the picture at the point (1 for every type but Hyperbolic), for texture detail. */
float foldStretch;
/**
 * Set by fold(): how many mirrors the picture at the point bounced off, for
 * Mirror fade and Mirror hue (see mirrorLight). For the tile types it is
 * the number of mirror lines between the point and one tile part that has
 * no bounce: crossing a mirror line is one bounce.
 */
float foldBounces;

/* How many mirror lines (at whole numbers of v) lie between v and the part from 0 to 1. */
float linesTo(float v) { return abs(floor(v)); }

/* How many bounces image j of m images around a center is from image 0, going the shorter way. */
float aroundBounces(float j, float m) { return min(j, m - j); }

vec2 fold(vec2 p) {
  float r = length(p);
  float a = atan(p.y, p.x) + u_rotation + u_twirl * r;
  foldAltWeight = 0.0;
  foldStretch = 1.0;
  foldBounces = 0.0;
  /**
   * Hyperbolic (fold mode 4): the Poincare disk, Disk size in radius. Its
   * tiles get smaller and smaller toward the edge, and never reach it.
   * Outside the disk, the point is mirrored into it in the disk's edge, so
   * the outside shows the disk again. Flow then moves the point along the
   * x axis the hyperbolic way (a Mobius map of the disk onto itself), so
   * the tiles stream out of one side and into the other. Then mirrors fold
   * the point into one tile's corner triangle: two lines through the
   * center (pi / Sides apart) and a circle at right angles to the edge
   * (see hyperbolicMirror in renderer.ts), until the circle no longer
   * holds it. foldStretch follows how much each step enlarges the picture.
   */
  if (u_foldMode == 4) {
    vec2 z = vec2(cos(a), sin(a)) * r / u_hyperSize;
    float edge = dot(z, z);
    if (edge > 1.0) {
      z /= edge;
      foldStretch /= edge;
    }
    float w = u_hyper.w;
    vec2 top = z + vec2(w, 0.0);
    vec2 bottom = vec2(1.0 + w * z.x, w * z.y);
    float under = max(dot(bottom, bottom), 1e-8);
    z = vec2(top.x * bottom.x + top.y * bottom.y, top.y * bottom.x - top.x * bottom.y) / under;
    foldStretch *= (1.0 - w * w) / under;
    vec2 center = vec2(u_hyper.x, 0.0);
    float radius2 = u_hyper.y * u_hyper.y;
    float wedge = u_hyper.z;
    /* The wedges around the center: each fold into the first one counts its bounces, and each circle mirror one more. */
    float wedges = floor(TAU / wedge + 0.5);
    for (int i = 0; i < 64; i++) {
      float turned = mod(atan(z.y, z.x), TAU);
      foldBounces += aroundBounces(min(floor(turned / wedge), wedges - 1.0), wedges);
      float angle = wedge - abs(mod(turned, 2.0 * wedge) - wedge);
      z = vec2(cos(angle), sin(angle)) * length(z);
      vec2 v = z - center;
      float d2 = dot(v, v);
      if (d2 >= radius2) break;
      float k = radius2 / max(d2, 1e-12);
      z = center + v * k;
      foldStretch *= k;
      foldBounces += 1.0;
    }
    return z * u_hyperSize / u_zoom;
  }
  if (u_foldMode == 0) {
    /**
     * Radial: mirrored wedges around one center. A count between two whole
     * numbers (a drifting range) goes through a circle: from 5 to 6, the five
     * wedges flatten evenly until every angle shows the same ray of the
     * image (rings), then six wedges grow evenly out of the rings. The
     * picture keeps its full symmetry the whole way. "g" is the place across
     * a wedge (0 at its center line, 1 at its edges), and "s" is how much of
     * the wedge pattern shows: 1 at a whole number, 0 halfway.
     *
     * Between 0 and 1 this cannot work alone: with no fold, going once
     * around the center goes once around the picture, and no fold or circle
     * can do that, so a blend of angles must break somewhere. So from 0 to
     * 0.5 the picture with no fold crossfades into the rings instead, and
     * from 0.5 to 1 one segment grows out of the rings as above.
     */
    if (u_segments > 0.0 && u_segments < 0.5) {
      foldAlt = vec2(cos(a), sin(a)) * r / u_zoom;
      foldAltWeight = 0.5 + 0.5 * cos(PI * u_segments / 0.5);
      a = PI;
    } else if (u_segments >= 0.5) {
      float whole = floor(u_segments);
      float t = u_segments - whole;
      float seg = TAU / (t < 0.5 ? whole : whole + 1.0);
      float g = abs(mod(a, seg) - seg * 0.5) / (seg * 0.5);
      float s = abs(cos(PI * t));
      /**
       * The images are half wedges. Image 1 (from half a wedge to a whole
       * one) is only turned, so it has no bounce. The count fades with the
       * wedge pattern, so it is 0 at the rings, where the count changes.
       */
      float images = floor(2.0 * TAU / seg + 0.5);
      float image = min(floor(mod(a, TAU) / (seg * 0.5)), images - 1.0);
      foldBounces = aroundBounces(mod(image - 1.0 + images, images), images) * s;
      a = PI / u_segments * (0.5 + s * (g - 0.5));
    }
    return vec2(cos(a), sin(a)) * r / u_zoom;
  }
  /**
   * Square tiles (fold mode 3): the turned plane is cut into square cells,
   * Tile size across, and each cell is folded into one eighth of itself by
   * mirrors along its middle lines and its diagonals. The cell edges are
   * mirrors too, so neighbor cells meet with no seam.
   */
  if (u_foldMode == 3) {
    vec2 cell = vec2(cos(a), sin(a)) * r / u_tileSize;
    /* The mirror lines: middle lines and edges every half cell, and diagonals. The part with no bounce is 0 < y < x < 0.5 of the middle cell. */
    foldBounces = linesTo(2.0 * cell.x) + linesTo(2.0 * cell.y) + linesTo(cell.x + cell.y) + linesTo(cell.x - cell.y);
    vec2 square = abs(cell - floor(cell + 0.5));
    if (square.y > square.x) square = square.yx;
    return square * u_tileSize / u_zoom;
  }
  /**
   * Tiles: the turned plane is cut into hexagon cells, and each cell is
   * folded around its center. Mirrors every 60 degrees (fold mode 1) make
   * equilateral triangles; mirrors every 30 degrees (mode 2) make the
   * hexagon pattern. Both sets of mirrors include the cell edges, so
   * neighbor cells meet with no seam.
   */
  vec2 plane = vec2(cos(a), sin(a)) * r / u_tileSize;
  /**
   * The mirror lines, in the cell grid's own frame (x and y swapped, see
   * hexLocal): lines every half cell in three directions through the cell
   * edges, and for hexagons also lines through the cell centers in the
   * three directions between them. The part with no bounce is the first
   * wedge of the middle cell.
   */
  vec2 q = plane.yx;
  foldBounces = linesTo(2.0 * q.x) + linesTo(sqrt(3.0) * q.y - q.x) + linesTo(sqrt(3.0) * q.y + q.x);
  if (u_foldMode == 2) foldBounces += linesTo(q.y * 2.0 / sqrt(3.0)) + linesTo(q.y / sqrt(3.0) - q.x) + linesTo(q.y / sqrt(3.0) + q.x);
  vec2 local = hexLocal(plane);
  float seg = u_foldMode == 1 ? TAU / 3.0 : TAU / 6.0;
  float b = abs(mod(atan(local.y, local.x), seg) - seg * 0.5);
  return vec2(cos(b), sin(b)) * length(local) * u_tileSize / u_zoom;
}

/**
 * Mirror fade and Mirror hue: the light of a picture that bounced off n
 * mirrors. Each bounce keeps 1 - fade / 2 of the light and turns the hue by
 * u_mirrorHue (a turn around the gray line, so gray stays gray). The
 * colors may carry their cover (premultiplied); both steps keep it right.
 */
vec3 mirrorLight(vec3 c, float n) {
  float angle = u_mirrorHue * n;
  if (angle != 0.0) {
    const vec3 gray = vec3(0.57735027);
    float cs = cos(angle);
    c = c * cs + cross(gray, c) * sin(angle) + gray * dot(gray, c) * (1.0 - cs);
  }
  return max(c, 0.0) * pow(1.0 - 0.5 * u_mirrorFade, n);
}

/** Both source images at a point, faded into each other by the image blend. An image that the blend does not show is not read. */
vec4 sourceColor(vec2 q, float g) {
  if (u_picture == 1) return sampleImage(u_img, u_imgRes, q, g);
  vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
  if (u_blend < 1.0) color = sampleImage(u_img, u_imgRes, q, g);
  if (u_blend > 0.0) {
    vec4 second = sampleImage(u_img2, u_imgRes2, q, g);
    float amount = u_blend;
    if (u_blendMode == 1) {
      /**
       * A brightness level falls from above white (blend 0) to below black
       * (blend 1). Where the second image is brighter than the level, it
       * shows; a soft edge keeps the change from looking jagged.
       */
      const float SOFT = 0.12;
      float level = 1.0 - u_blend * (1.0 + SOFT);
      amount = smoothstep(level, level + SOFT, dot(second.rgb, vec3(0.2126, 0.7152, 0.0722)));
    }
    color = mix(color, second, amount);
  }
  return color;
}

/**
 * How a layer combines with the layers under it: 0 normal, 1 screen,
 * 2 multiply, 3 overlay, 4 difference, 5 lighten, 6 darken, 7 add.
 */
vec3 blendLayer(vec3 base, vec3 top, int mode) {
  if (mode == 1) return 1.0 - (1.0 - base) * (1.0 - top);
  if (mode == 2) return base * top;
  if (mode == 3) return mix(2.0 * base * top, 1.0 - 2.0 * (1.0 - base) * (1.0 - top), step(0.5, base));
  if (mode == 4) return abs(base - top);
  if (mode == 5) return max(base, top);
  if (mode == 6) return min(base, top);
  if (mode == 7) return min(base + top, 1.0);
  return top;
}
${COVER_GLSL}
${BLEND_COVER_GLSL}

/**
 * The picture with the shape steps in the order the user set, leaving out
 * the steps whose bit is set in "skip" (bit = step code). A warp before the
 * fold breaks the symmetry; a warp after it bends the image inside each
 * wedge, so the symmetry stays. A map after the fold bends the folded picture.
 */
vec4 shapeColor(vec2 screen, int skip, float g0) {
  vec2 p = screen;
  /* The pixel in the Mandelbrot map's units, for its extra samples (as if the map came first). */
  mandelPixel = g0 / max(u_mapScale, 1e-4);
  vec2 beforeFold = screen;
  bool folded = false;
  bool mapped = false;
  /**
   * The seamless spiral meets itself only if nothing moves the point after
   * it (a fold or warp after it would not repeat the way it does), so it is
   * always the last step to move the point, whatever the order in the list.
   * That is so only in the pass that has Algorithm: a pass with only other
   * steps (before a 3D Object or another picture step) has no spiral.
   */
  bool spiralLast = (u_mapMode == 7 || u_mapMode == 8) && (skip & 2) == 0 && u_spiralPass == 1;
  /* During the radial crossfade (see fold), a second point, with no fold, goes through the later steps too. */
  bool fading = false;
  vec2 p2 = p;
  float fade = 0.0;
  /* The Möbius or Julia map's exact stretch, as texture detail (see mobiusStretch and juliaStretch). */
  float mapDetail = 0.0;
  float farDistance = 1e9;
  /**
   * The spiral's own jump would show in the measured detail as a thin blur
   * line, so the detail is measured on the point before the spiral, then
   * multiplied by how much the spiral stretches it there (its size divided
   * by the distance from the center, mixed by the map mix).
   */
  vec2 beforeSpiral = p;
  float stretch = 1.0;
  /* The Droste edge blend's second point and its weight (see drosteMap). */
  vec2 drosteP = p;
  float drosteWeight = 0.0;
  /**
   * A spiral count between two whole numbers: the picture of the higher
   * count (with its own edge blend and stretch) fades in over the picture
   * of the lower count, by the part after the whole number.
   */
  float spiralWhole = floor(u_drosteSpirals);
  float spiralFade = spiralLast && u_mapMode == 8 && u_drosteSpirals - spiralWhole > 1e-3 ? u_drosteSpirals - spiralWhole : 0.0;
  vec2 spiralP = p;
  vec2 spiralAlt = p;
  float spiralAltWeight = 0.0;
  float spiralStretch = 1.0;
  /**
   * Loops here run to a count the graphics card learns only at run time
   * (u_shapeCount, not 3), and each big function (the map, the picture
   * read) has one call in them, so the shader compiler makes one copy of
   * each: with a copy per call and per round, this shader took over a
   * minute to build, and the app lost the graphics card. The last round
   * is the spiral map, when it goes last (spiralLast).
   */
  for (int i = 0; i < u_shapeCount + (spiralLast ? 1 : 0); i++) {
    bool spiralStep = i >= u_shapeCount;
    int shapeStep = spiralStep ? 1 : u_shapeOrder[i];
    if ((skip & (1 << shapeStep)) != 0) continue;
    if (shapeStep == 0) {
      if (u_warpMode != 0) {
        p += warpOffset(p);
        if (fading) p2 += warpOffset(p2);
      }
    } else if (shapeStep == 1) {
      if (spiralLast && !spiralStep) continue;
      if (u_mapMode == 2) mapDetail = g0 * mobiusStretch(p);
      if (spiralStep) beforeSpiral = p;
      /* The points to map: the point, the radial crossfade's point, and the higher spiral count's point. */
      int points = 1 + (fading ? 1 : 0) + (spiralFade > 0.0 ? 1 : 0);
      for (int k = 0; k < points; k++) {
        bool second = k == 1 && fading;
        bool higher = k > 0 && !second;
        drosteArms = higher ? spiralWhole + 1.0 : spiralWhole;
        vec2 q = complexMap(k == 0 ? p : (second ? p2 : beforeSpiral));
        if (k == 0) {
          p = q;
          farDistance = depthDistance;
          if (u_mapMode == 3) mapDetail = g0 * mix(1.0, juliaStretch, u_mapMix);
          if (u_mapMode == 9) {
            mapDetail = g0 * mix(1.0, mandelStretch, u_mapMix);
          }
          if (spiralStep && u_mapMode == 8) {
            drosteP = drosteAlt;
            drosteWeight = drosteAltWeight;
          }
        } else if (second) {
          p2 = q;
        } else {
          spiralP = q;
          spiralAlt = drosteAlt;
          spiralAltWeight = drosteAltWeight;
          spiralStretch = mix(1.0, drosteStretch, u_mapMix);
        }
        /* The Droste map measures its own stretch (see drosteMap); the last of the point and the crossfade's point sets it. */
        if (spiralStep && u_mapMode == 8 && !higher) stretch = mix(1.0, drosteStretch, u_mapMix);
      }
      if (spiralStep && u_mapMode != 8) {
        /* The spiral's size, larger where the stretch squeezes the image or the slant tilts it. */
        float aspect = u_imgRes.x / u_imgRes.y;
        float twist = abs(u_mapArms);
        float squeeze = u_spiralCopies == 0.0 ? sqrt(1.0 + aspect * aspect * twist * twist) : max(1.0, u_spiralCopies / max(twist, 0.5));
        float spiralSize = length(vec2(2.0 * aspect * twist, 2.0)) / TAU * squeeze;
        stretch = mix(1.0, spiralSize / max(length(beforeSpiral), 1e-4), u_mapMix);
      }
      mapped = true;
    } else {
      beforeFold = p;
      p = fold(p);
      folded = true;
      if (foldAltWeight > 0.0) {
        fading = true;
        p2 = foldAlt;
        fade = foldAltWeight;
      }
    }
  }
  /**
   * Texture detail follows how much the steps stretch the screen; with a
   * fold it is measured before the fold, because the fold makes the angle
   * jump. It is capped, so the jumps at a map's cut lines and poles do not
   * blur seams. The Möbius and Julia maps' exact stretch has no such jumps,
   * so it is not capped. Explicit gradients avoid seams at the fold.
   */
  vec2 measured = folded ? beforeFold : (spiralLast ? beforeSpiral : p);
  float detail = min(max(length(dFdx(measured)), length(dFdy(measured))), g0 * 4.0);
  float g = max(detail * stretch * (folded ? foldStretch : 1.0), mapDetail) / (folded ? u_zoom : 1.0);
  /**
   * The picture reads, each with its point, detail and share: the point,
   * the radial crossfade's point, the Droste copy one size smaller (its detail
   * smaller by the copy size), and the higher spiral count's point with its
   * own copy. The shares are the old chain of mixes multiplied out. One
   * call in a loop of run-time length (see the step loop).
   */
  float copySize = clamp(u_drosteSize, 0.05, 0.95);
  float g2 = max(detail * spiralStretch * (folded ? foldStretch : 1.0), mapDetail) / (folded ? u_zoom : 1.0);
  float fadeShare = fading ? fade : 0.0;
  float drosteShare = drosteWeight > 0.0 ? drosteWeight : 0.0;
  float altShare = spiralAltWeight > 0.0 ? spiralAltWeight : 0.0;
  vec2 readAt[5] = vec2[5](p, p2, drosteP, spiralP, spiralAlt);
  float readDetail[5] = float[5](g, g, g * copySize, g2, g2 * copySize);
  float readShare[5] = float[5](
    (1.0 - fadeShare) * (1.0 - drosteShare) * (1.0 - spiralFade),
    fadeShare * (1.0 - drosteShare) * (1.0 - spiralFade),
    drosteShare * (1.0 - spiralFade),
    (1.0 - altShare) * spiralFade,
    altShare * spiralFade);
  int reads = spiralFade > 0.0 ? 5 : 3;
  vec4 color = sourceColor(p, g);
  if (readShare[0] < 1.0) {
    color *= readShare[0];
    for (int k = 1; k < reads; k++) {
      if (readShare[k] > 0.0) color += readShare[k] * sourceColor(readAt[k], readDetail[k]);
    }
  }
  if (folded && foldBounces > 0.0) color.rgb = mirrorLight(color.rgb, foldBounces);
  /**
   * Depth fade: the far end of the tunnel or a spiral (its center), the Möbius pole, or Julia's most stretched places
   * fades to black, which makes it look deep. It works as fog: each step of
   * depth takes the same share of the light, so the brightness falls as
   * e^-(depth^power), and the depth is 1 / distance from the far end.
   * Darkness sets where the fade starts (the brightness is 95% there, at a
   * distance of 1 at full darkness), so all the darkening stays inside that
   * distance. Softness sets the power, 1 / softness^2 (1 at 1, 4 at 0.5, up
   * to 1000 near 0): a high power keeps the picture bright almost to the
   * start and then goes to black fast (near 0 it is a hard edge); a low one
   * goes darker slowly, and is black only close to the far end.
   */
  if (mapped && u_mapMode >= 2 && u_mapMode != 5 && u_mapFog > 0.0) {
    float power = 1.0 / max(u_mapFogSoftness * u_mapFogSoftness, 1e-3);
    color.rgb *= mix(1.0, exp(-0.0513 * pow(u_mapFog / max(farDistance, 1e-4), power)), u_mapMix);
  }
  /**
   * The Mandelbrot map's light and terraces, and its black set. Where one
   * pixel holds more than about one band (see mandelSparkle),
   * the light and terraces would sparkle, so they give way to a shade from
   * the distance to the set's edge (see mandelLook). The picture already
   * blurs there. Then the points past the view's round limit fade to black.
   */
  if (mapped && u_mapMode == 9) {
    /* A pixel with extra samples sparkles less, so it keeps its light to about twice the band density. */
    float sparkle = g0 * mix(1.0, mandelSparkle, u_mapMix);
    float busy = mandelShade > 0.0 ? (mandelSampled ? smoothstep(0.6, 2.4, sparkle) : smoothstep(0.3, 1.2, sparkle)) : 0.0;
    color.rgb *= mix(1.0, mix(mandelShade, mandelBusyShade, busy) * mandelEdgeLight * (1.0 - mandelBeyond), u_mapMix);
    /* Invert: the colors flipped (with their cover, as they are premultiplied), so the set turns bright and the outside dark. */
    color.rgb = mix(color.rgb, color.a - color.rgb, clamp(u_mandelInvert, 0.0, 1.0) * u_mapMix);
  }
  return color;
}

void main() {
  vec2 screen = (gl_FragCoord.xy - u_pad - (0.5 + u_center) * u_res) / u_res.y;
  float g0 = max(length(dFdx(screen)), length(dFdy(screen)));
  /**
   * Opacity and blend: each shape step's result is mixed with the picture
   * without that step, by the step's blend mode and opacity. A step at full
   * opacity in normal mode needs nothing more. A step at opacity 0 is left
   * out of the pictures for the next steps too, so several steps at 0 are
   * all left out. Each step that is not full and normal costs one more
   * picture, so at most 4.
   */
  vec4 color = shapeColor(screen, 0, g0);
  int skipped = 0;
  /* A loop of run-time length, so the compiler keeps one more copy of shapeColor, not three (see the step loop in shapeColor). */
  for (int i = 0; i < u_shapeCount; i++) {
    int shapeStep = u_shapeOrder[i];
    float opacity = u_shapeOpacity[shapeStep];
    int mode = u_shapeBlend[shapeStep];
    if (opacity >= 1.0 && mode == 0) continue;
    int without = skipped | (1 << shapeStep);
    vec4 base = shapeColor(screen, without, g0);
    color = blendCover(base, color, mode, opacity);
    if (opacity <= 0.0) skipped = without;
  }
  o = color;
}`;

/**
 * Pass 2: motion blur. Mode 0 = linear (angle + distance), 1 = radial
 * (zoom), 2 = spin. A fixed per-pixel jitter hides banding between samples.
 * Offsets are in screen units; the source texture has a u_pad border.
 * A round focus area around the kaleidoscope center stays sharp: the blur
 * is zero inside u_focus (in screen heights) and full u_soft further out.
 */
export const BLUR_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec2 u_texSize;
uniform float u_pad;
/* The blur radius where the mask is full, in screen heights (0 = a plain copy), and the mask; see blurMask(). */
uniform float u_radius;
uniform int u_maskMode;
uniform float u_maskSize;
uniform float u_maskSoft;
uniform vec2 u_maskCenter;
uniform vec2 u_maskDir;
uniform float u_maskLevel;

const float TAU = 6.28318530718;

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i), f), dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}

/** A point of the screen (0 to 1) in the picture texture, which may have a border around the screen. */
vec2 texUv(vec2 screen) { return (screen * u_res + u_pad) / u_texSize; }
${COVER_GLSL}

/**
 * Where the blur acts, from 0 (sharp) to 1 (full blur), at a screen point.
 * Distances are in screen heights, from the mask center. Circle: blur
 * outside (mode 0) or inside (mode 1) a circle of the mask size, with an
 * edge as soft as the softness. Gradient (2): from sharp to blurred across
 * a band through the center, as wide as the softness, facing the mask
 * angle. Bright (3) and dark (4) areas: where the picture, seen soft, is
 * brighter or darker than the level. Noise (5): soft blotches as large as
 * the mask size; moving the center moves them.
 */
float blurMask(vec2 screen) {
  float aspect = u_res.x / u_res.y;
  vec2 p = (screen - 0.5) * vec2(aspect, 1.0) - u_maskCenter;
  float soft = u_maskSoft;
  if (u_maskMode <= 1) {
    float edge = u_maskSize * soft;
    float m = smoothstep(u_maskSize - edge - 0.002, u_maskSize + 0.002, length(p));
    return u_maskMode == 0 ? m : 1.0 - m;
  }
  if (u_maskMode == 2) {
    float width = 0.02 + soft * 1.5;
    return smoothstep(-0.5 * width, 0.5 * width, dot(p, u_maskDir));
  }
  if (u_maskMode <= 4) {
    float light = dot(straight(textureLod(u_tex, texUv(screen), 5.0)), vec3(0.2126, 0.7152, 0.0722));
    float m = smoothstep(u_maskLevel - 0.02 - soft * 0.3, u_maskLevel + 0.02 + soft * 0.3, light);
    return u_maskMode == 3 ? m : 1.0 - m;
  }
  vec2 n = p / u_maskSize * 1.5;
  float noise = 0.5 + 0.7 * gnoise(n) + 0.35 * gnoise(n * 2.07 + vec2(3.1, 7.7));
  float edge = 0.02 + soft * 0.45;
  return smoothstep(0.5 - edge, 0.5 + edge, noise);
}

/**
 * The blur reads a softer copy of the picture (a mip level about half the
 * radius wide) at the pixel and at eight points on a ring around it, turned
 * a little differently at each pixel, so the blur is round and not blocky.
 */
void main() {
  vec2 uv = texUv(v_uv);
  /* Color and cover blur together (premultiplied), so a soft edge stays soft. */
  if (u_radius <= 0.0) {
    o = textureLod(u_tex, uv, 0.0);
    return;
  }
  float radius = u_radius * blurMask(v_uv) * u_res.y;
  if (radius < 0.5) {
    o = textureLod(u_tex, uv, 0.0);
    return;
  }
  float lod = log2(max(1.0, radius * 0.5));
  vec4 sum = textureLod(u_tex, uv, lod);
  float turn = ign(gl_FragCoord.xy) * TAU / 8.0;
  for (int i = 0; i < 8; i++) {
    float a = turn + float(i) * TAU / 8.0;
    sum += textureLod(u_tex, uv + vec2(cos(a), sin(a)) * radius * 0.6 / u_texSize, lod);
  }
  o = sum / 9.0;
}`;

/**
 * Pass 3: feedback trails. The previous output is zoomed, turned and
 * hue-shifted around the screen center, then combined with the new frame.
 * Mode 1 = mix (smoky trails), 2 = lighten (glowing trails). Where the
 * transformed previous frame does not cover the screen, the new frame shows.
 */
export const TRAILS_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_current;
uniform sampler2D u_previous;
uniform vec2 u_res;
uniform int u_mode;
uniform float u_amount;
uniform float u_zoom;
uniform float u_turn;
uniform float u_hue;
uniform vec2 u_texel;
uniform float u_flow;
uniform float u_swirl;
/* Added to the flow's detail level, so a smaller video frame blurs as much as the screen (log2 of the pixel size). */
uniform float u_lodShift;
/* This frame's tint of the old trails (0 = none) and the tint color. */
uniform float u_tint;
uniform vec3 u_tintColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
${COVER_GLSL}
vec3 hueShift(vec3 c, float h) {
  const vec3 k = vec3(0.57735);
  float ca = cos(h);
  return c * ca + cross(k, c) * sin(h) + k * dot(k, c) * (1.0 - ca);
}

void main() {
  float aspect = u_res.x / u_res.y;
  vec2 p = (v_uv - 0.5) * vec2(aspect, 1.0);
  float c = cos(u_turn);
  float s = sin(u_turn);
  p = mat2(c, s, -s, c) * p / u_zoom;
  vec2 uv = p / vec2(aspect, 1.0) + 0.5;
  /**
   * Flow: the old frame is pushed along its own brightness slopes (swirl 0,
   * so bright areas bleed outward like melting paint) or around them
   * (swirl 1, so the trails whirl). It adds up frame after frame.
   * The slopes are measured on a blurred copy of the old frame (a smaller
   * mip level), over a distance that grows with the push. So the push
   * follows the large shapes, and fine grain cannot grow into stripes. The
   * slope is divided by the distance, so a smooth slope pushes as hard as
   * before. One step never pushes farther than twice the distance.
   */
  if (u_flow != 0.0) {
    float reach = clamp(abs(u_flow), 4.0, 64.0);
    float lod = max(0.0, log2(reach) - 1.0 + u_lodShift);
    vec2 d = u_texel * reach;
    float gx = luma(textureLod(u_previous, uv + vec2(d.x, 0.0), lod).rgb) - luma(textureLod(u_previous, uv - vec2(d.x, 0.0), lod).rgb);
    float gy = luma(textureLod(u_previous, uv + vec2(0.0, d.y), lod).rgb) - luma(textureLod(u_previous, uv - vec2(0.0, d.y), lod).rgb);
    vec2 push = mix(vec2(gx, gy), vec2(-gy, gx), u_swirl) * (2.0 / reach) * u_flow;
    float size = length(push);
    if (size > reach * 2.0) push *= reach * 2.0 / size;
    uv -= push * u_texel;
  }
  /* Both frames carry their cover (premultiplied): a trail fades its cover with its color. */
  vec4 current = texture(u_current, v_uv);
  /* Level 0: the old frame has blurred mip levels while the flow runs (see drawTrails). */
  vec4 previous = textureLod(u_previous, uv, 0.0);
  if (u_hue != 0.0) previous = covered(clamp(hueShift(straight(previous), u_hue), 0.0, 1.0), previous.a);
  /**
   * Trail tint: the old frame is multiplied a little toward the tint color
   * each frame, so the older a trail is, the more it takes that color and
   * the darker it gets. The new frame keeps its own colors.
   */
  if (u_tint > 0.0) previous.rgb = mix(previous.rgb, previous.rgb * u_tintColor, u_tint);
  vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  previous = mix(current, previous, inside.x * inside.y);
  o = u_mode == 2 ? max(current, previous * u_amount) : mix(current, previous, u_amount);
}`;

/** Copies a texture to the screen. */
export const COPY_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
/* The picture with its cover (premultiplied, see COVER_GLSL). */
void main() { o = texture(u_tex, v_uv); }`;

/**
 * Video export: draws a picture over the canvas at u_alpha (with
 * premultiplied blending). u_opaque treats the picture as fully opaque, for
 * a captured frame; otherwise its own alpha counts, for the title box.
 */
export const OVERLAY_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform float u_alpha;
uniform int u_opaque;
void main() {
  vec4 color = texture(u_tex, v_uv);
  if (u_opaque == 1) color.a = 1.0;
  o = color * u_alpha;
}`;

/**
 * The picture around the viewer, for the 360 video and live VR: the point
 * of the square picture seen in the direction "dir" (a unit vector, x to
 * the right, y up, z ahead or behind). The picture's center is straight
 * ahead and, mirrored, straight behind. The distance from the center is the
 * angle from the front (or the back), so the edge of the picture's inner
 * circle is a ring around the viewer's sides, where the two halves meet.
 */
const SPHERE_UV_GLSL = `
const float PI = 3.14159265358979;
vec2 sphereUv(vec3 dir) {
  float angle = acos(clamp(abs(dir.z), 0.0, 1.0));
  float around = length(dir.xy);
  vec2 side = around > 1e-6 ? dir.xy / around : vec2(0.0);
  return 0.5 + 0.5 * side * (angle / (0.5 * PI));
}`;

/**
 * 360 video export: wraps the square picture around the viewer (see
 * sphereUv) as an equirectangular frame (longitude across, latitude down).
 * Row 0 is straight up, so a plain read gives the top row first.
 */
export const SPHERE_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
${SPHERE_UV_GLSL}
void main() {
  float lon = (v_uv.x - 0.5) * 2.0 * PI;
  float lat = (0.5 - v_uv.y) * PI;
  vec3 dir = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
  o = vec4(texture(u_tex, sphereUv(dir)).rgb, 1.0);
}`;

/**
 * Live VR: one eye's view of the picture on a virtual screen in a dark
 * room (see VrScreen in vr.ts). u_inverse turns a point of the eye's view
 * (-1 to 1) back into the room, so each pixel's ray starts at the eye and
 * goes out through the pixel. u_screen is the screen's width and height
 * and its distance, in meters, and its curve. A flat screen stands across
 * the view at that distance; a curved one is part of a circle, around a
 * point behind it, of radius distance / curve. The screen's middle is at
 * eye height, straight ahead of where the viewer started. Its edges are
 * smoothed over about a pixel.
 */
export const VR_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform mat4 u_inverse;
uniform vec4 u_screen;
const vec3 ROOM = vec3(0.012, 0.013, 0.018);
void main() {
  vec2 view = v_uv * 2.0 - 1.0;
  vec4 nearPoint = u_inverse * vec4(view, -1.0, 1.0);
  vec4 farPoint = u_inverse * vec4(view, 1.0, 1.0);
  vec3 origin = nearPoint.xyz / nearPoint.w;
  vec3 dir = normalize(farPoint.xyz / farPoint.w - origin);
  float width = u_screen.x;
  float height = u_screen.y;
  float dist = u_screen.z;
  float curve = u_screen.w;
  vec2 uv = vec2(-1.0);
  if (curve < 0.001) {
    if (dir.z < -1e-5) {
      vec3 hit = origin + dir * ((-dist - origin.z) / dir.z);
      uv = vec2(hit.x / width, hit.y / height) + 0.5;
    }
  } else {
    float radius = dist / curve;
    vec2 center = vec2(0.0, radius - dist);
    vec2 from = origin.xz - center;
    float a = dot(dir.xz, dir.xz);
    float b = dot(from, dir.xz);
    float c = dot(from, from) - radius * radius;
    float discriminant = b * b - a * c;
    if (a > 1e-8 && discriminant >= 0.0) {
      float t = (-b + sqrt(discriminant)) / a;
      if (t > 0.0) {
        vec3 hit = origin + dir * t;
        vec2 around = hit.xz - center;
        uv = vec2(atan(around.x, -around.y) * radius / width, hit.y / height) + 0.5;
      }
    }
  }
  vec2 edge = min(uv, 1.0 - uv);
  float pixel = max(fwidth(uv.x), fwidth(uv.y));
  float cover = clamp(min(edge.x, edge.y) / max(pixel, 1e-6) + 0.5, 0.0, 1.0);
  vec3 picture = texture(u_tex, clamp(uv, 0.0, 1.0)).rgb;
  o = vec4(mix(ROOM, picture, cover), 1.0);
}`;

/**
 * Pass 4: final effects on the whole picture. Sharpen is an unsharp mask:
 * it adds back the difference between each pixel and a small blur around
 * it (u_radius pixels). Color overlay blends one color over the picture
 * at u_overlayOpacity. Exposure (in stops) multiplies every color by
 * 2^exposure, so lowering it moves all colors toward black together.
 * Black level then makes every color at or below it black, and stretches
 * the rest, so white stays white.
 */
/**
 * Driver: a moving gray pattern (the driver, 0 to 1) acts on the picture.
 * The drivers are drawn here, from noise, so they never repeat and need no
 * files:
 * - 0 caustics: the bright web of light on the floor of a pool: lines where
 *   moving cells meet, in two layers, bent by noise.
 * - 1 smoke: noise bent by noise twice (domain warping), rising slowly.
 * - 2 ink: the same, cut at a level, so it shows as blots with curling edges.
 * - 3 fire: ridges of stretched noise that rise and flicker.
 * - 4 ripples: rain on water: rings that grow from random points and fade.
 * - 5 video: the brightness of the user's video (u_video, u_videoAspect
 *   wide). At Size 1 it fills the screen's height; it repeats mirrored past
 *   its edges. With no video yet (u_hasVideo 0) it is a flat gray, which
 *   does nothing.
 * u_scale sets the size (3 / u_scale driver units across the screen
 * height), u_time the motion, and u_contrast pushes the driver away from
 * its middle gray. The modes:
 * - 0 bend: the picture is pushed along the driver's slopes, by up to
 *   0.05 of the screen height at full strength.
 * - 1 reveal: the picture shows where the driver is bright and is black
 *   where it is dark.
 * - 2 light: the driver lights the picture, from dark at its dark parts to
 *   1.5 times brighter at its bright parts, with a white glint at the
 *   brightest; strength mixes in that light.
 * The result mixes with the picture by u_amount.
 */
export const DRIVER_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform int u_source;
uniform int u_mode;
uniform float u_amount;
uniform float u_strength;
uniform float u_scale;
uniform float u_contrast;
uniform float u_time;
uniform sampler2D u_video;
uniform int u_hasVideo;
uniform float u_videoAspect;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
/* Five octaves, each turned and moved, so their grids do not line up. */
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    sum += amp * noise(p);
    p = turn * p * 2.02 + 17.0;
    amp *= 0.5;
  }
  return sum / 0.96875;
}
/* 1 on the lines where moving cells meet, falling to 0 inside the cells. */
float cellEdges(vec2 p, float t) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float nearest = 8.0;
  float second = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 h = hash22(cell + offset);
      vec2 point = offset + 0.5 + 0.4 * sin(t * (0.6 + h) + h * 6.2831);
      float d = length(point - f);
      if (d < nearest) {
        second = nearest;
        nearest = d;
      } else if (d < second) {
        second = d;
      }
    }
  }
  return 1.0 - smoothstep(0.0, 0.18, second - nearest);
}
float caustics(vec2 p, float t) {
  vec2 bend = vec2(noise(p * 0.7 + t * 0.1), noise(p * 0.7 + 9.1 - t * 0.1)) - 0.5;
  vec2 q = p * 1.6 + bend * 1.2;
  float a = cellEdges(q, t);
  float b = cellEdges(q * 1.7 + 3.3, t * 1.3);
  return clamp(a * a * 0.8 + b * b * 0.45, 0.0, 1.0);
}
float smoke(vec2 p, float t) {
  vec2 rise = vec2(0.0, -t * 0.15);
  vec2 q = vec2(fbm(p + rise), fbm(p + vec2(5.2, 1.3) + rise * 0.7 + t * 0.03));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 0.05), fbm(p + 3.0 * q + vec2(8.3, 2.8) - t * 0.04));
  return fbm(p + 3.0 * r + rise);
}
float ink(vec2 p, float t) {
  return smoothstep(0.47, 0.57, smoke(p * 0.8, t * 0.6));
}
float fire(vec2 p, float t) {
  vec2 q = vec2(p.x * 2.0, p.y * 0.5 - t * 0.9);
  float warp = fbm(q * 1.3 + vec2(0.0, -t * 0.4));
  float n = fbm(q + vec2(warp * 1.5, 0.0));
  float ridge = 1.0 - abs(2.0 * n - 1.0);
  return ridge * ridge * ridge;
}
/* Each cell has one drop that falls again and again at its own time; its ring grows to 1.5 cells and fades. */
float ripples(vec2 p, float t) {
  vec2 cell = floor(p);
  float sum = 0.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 id = cell + vec2(float(x), float(y));
      vec2 h = hash22(id);
      float phase = fract(t * 0.35 + h.x);
      float d = length(p - id - h) - phase * 1.5;
      float fade = (1.0 - phase) * (1.0 - phase);
      sum += exp(-d * d / 0.015) * cos(d * 30.0) * fade;
    }
  }
  return 0.5 + 0.5 * clamp(sum, -1.0, 1.0);
}
float driverAt(vec2 p) {
  float t = u_time;
  float value;
  if (u_source == 0) value = caustics(p, t);
  else if (u_source == 1) value = smoke(p, t);
  else if (u_source == 2) value = ink(p, t);
  else if (u_source == 3) value = fire(p, t);
  else if (u_source == 4) value = ripples(p, t);
  else if (u_hasVideo == 1) value = dot(texture(u_video, p / 3.0 * vec2(1.0 / u_videoAspect, 1.0) + 0.5).rgb, vec3(0.2126, 0.7152, 0.0722));
  else value = 0.5;
  return clamp((value - 0.5) * u_contrast + 0.5, 0.0, 1.0);
}

void main() {
  /* The picture carries its cover (premultiplied): the bend moves it, the reveal and the light change only the color. */
  vec4 picture = texture(u_tex, v_uv);
  float aspect = u_res.x / u_res.y;
  vec2 p = (v_uv - 0.5) * vec2(aspect, 1.0) * 3.0 / u_scale;
  float here = driverAt(p);
  vec4 color;
  if (u_mode == 0) {
    /* The slope is measured across a wide step (0.12 driver units, on both sides), so fine detail does not tear the picture. */
    float step = 0.12;
    vec2 slope = vec2(driverAt(p + vec2(step, 0.0)) - driverAt(p - vec2(step, 0.0)), driverAt(p + vec2(0.0, step)) - driverAt(p - vec2(0.0, step))) / (2.0 * step);
    /* Steep and gentle drivers both bend by a useful amount: the push grows with the slope, but never past 1. */
    vec2 push = slope / (1.0 + length(slope)) * u_strength * 0.05;
    color = texture(u_tex, v_uv + push * vec2(1.0 / aspect, 1.0));
  } else if (u_mode == 1) {
    color = vec4(picture.rgb * smoothstep(0.35, 0.65, here), picture.a);
  } else {
    float light = mix(1.0, 0.25 + 1.25 * here, u_strength);
    color = vec4(picture.rgb * light + vec3(pow(here, 8.0) * u_strength * 0.3) * picture.a, picture.a);
  }
  o = mix(picture, color, u_amount);
}`;

/**
 * Relief: brightness is height. The slope between neighbor pixels gives a
 * surface direction, lit by a light at u_lightAngle, 45 degrees above the
 * picture. A flat area keeps its color; slopes that face the light get
 * brighter and the others darker. Shine adds a glossy highlight.
 */
export const RELIEF_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_relief;
uniform float u_reliefDepth;
uniform float u_reliefSize;
uniform float u_lightAngle;
uniform float u_shine;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  /* The picture carries its cover (premultiplied); the relief changes only the color. */
  vec4 color = texture(u_tex, v_uv);
  vec2 d = u_texel * u_reliefSize;
  float left = luma(texture(u_tex, v_uv - vec2(d.x, 0.0)).rgb);
  float right = luma(texture(u_tex, v_uv + vec2(d.x, 0.0)).rgb);
  float down = luma(texture(u_tex, v_uv - vec2(0.0, d.y)).rgb);
  float up = luma(texture(u_tex, v_uv + vec2(0.0, d.y)).rgb);
  vec3 normal = normalize(vec3((left - right) * u_reliefDepth, (down - up) * u_reliefDepth, 1.0));
  vec3 light = normalize(vec3(cos(u_lightAngle), sin(u_lightAngle), 1.0));
  float diffuse = max(dot(normal, light), 0.0) / light.z;
  /* The highlight of a flat area is taken off, so only slopes shine. */
  vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
  float gloss = max(pow(max(dot(normal, halfway), 0.0), 40.0) - pow(halfway.z, 40.0), 0.0);
  vec3 lit = color.rgb * diffuse + u_shine * gloss * color.a;
  o = vec4(clamp(mix(color.rgb, lit, u_relief), 0.0, color.a), color.a);
}`;

/** Cubic B-spline sampling of one mip level of u_tex, from four filtered reads: smooth curves between its pixels. */
const CUBIC_GLSL = `
vec4 bspline(float t) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - t;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  return vec4(x, y, z, 6.0 - x - y - z) / 6.0;
}

/* Cubic B-spline sampling of one mip level, from four filtered reads. */
vec3 cubicAt(vec2 uv, int level) {
  vec2 size = vec2(textureSize(u_tex, level));
  vec2 p = uv * size - 0.5;
  vec2 f = fract(p);
  p -= f;
  vec4 xc = bspline(f.x);
  vec4 yc = bspline(f.y);
  vec4 c = p.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 offset = (c + vec4(xc.yw, yc.yw) / s) / size.xxyy;
  float lod = float(level);
  vec3 a = textureLod(u_tex, offset.xz, lod).rgb;
  vec3 b = textureLod(u_tex, offset.yz, lod).rgb;
  vec3 d = textureLod(u_tex, offset.xw, lod).rgb;
  vec3 e = textureLod(u_tex, offset.yw, lod).rgb;
  float sx = s.x / (s.x + s.y);
  float sy = s.z / (s.z + s.w);
  return mix(mix(e, d, sx), mix(b, a, sx), sy);
}
`;

/**
 * Where a point of the camera's flat picture or land lies in the picture,
 * shared by TERRAIN_SHADER and CAMERA_SHADER (each declares aspect, u_res
 * and u_repeat).
 */
const REPEAT_GLSL = `
/* A point of the land (screen heights, the picture's center at 0) in the picture's pixels, before the mirrored repeat. */
vec2 pixelsAt(vec2 p) { return vec2((p.x / aspect + 0.5) * u_res.x, (p.y + 0.5) * u_res.y); }

/**
 * The repeat: "at" (pixels, any distance) becomes "q", a pixel position
 * inside the picture, and "flip" says for each axis whether a step
 * forward in the world goes forward (1) or back (-1) inside it. With no
 * repeat, a point past the picture's edge gives false.
 */
bool wrapPixels(vec2 at, out vec2 q, out vec2 flip) {
  flip = vec2(1.0);
  if (u_repeat == 2) {
    q = at;
    return all(greaterThanEqual(at, vec2(0.0))) && all(lessThanEqual(at, u_res));
  }
  if (u_repeat == 1) {
    q = mod(at, u_res);
    return true;
  }
  vec2 period = 2.0 * u_res;
  q = mod(at, period);
  if (q.x > u_res.x) { q.x = period.x - q.x; flip.x = -1.0; }
  if (q.y > u_res.y) { q.y = period.y - q.y; flip.y = -1.0; }
  return true;
}
`;

/**
 * Terrain: the picture becomes a landscape seen through a virtual camera
 * (its camera settings are the ones Camera uses too).
 * Brightness is height (u_height screen heights at white; below 0, dark
 * areas rise instead), read from u_fine: the picture's brightness, blurred
 * and smoothed by the renderer (see drawTerrain), in the picture's pixels.
 * Past the picture's edge the land goes on by u_repeat: mirrored (seamless
 * for every picture), repeated as it is, or not at all, so the picture
 * stands alone with sky around it. The camera is a free camera, as on a
 * film set: at u_offset on the land (from the picture's center; the engine
 * moves it by Dolly and Truck), u_pedestal high (kept above the land under
 * it), looking toward u_pan (0 along +x, counterclockwise) and u_tilt up
 * from level (below 0 looks down), with a lens of u_lens vertical angle.
 *
 * Each pixel's ray walks over the land with the help of u_max: a pyramid
 * of the land's highest point in ever larger squares of pixels (see
 * MAX_SHADER). At each visit the ray looks up the square it is in at the
 * current level. If the ray is above the square's highest point, it can
 * skip to where it leaves the square (or sinks to that height) and try a
 * larger square next. If not, it tries a smaller square at the same
 * place, down to one pixel, where the exact crossing is found by closing
 * in. So no step can jump over a ridge, however thin, and the walls of a
 * sharp edge come out clean.
 *
 * The hit point is lit by a sun at u_lightTurn and u_lightHeight, with
 * shadows (u_shadow, found by the same walk toward the sun), a glossy
 * shine (u_shine), and fog (u_fog) toward the fog color: the picture's
 * mean color, taken toward u_skyColor by u_sky. The sky, where a ray
 * misses the land, has that color too. Under it lies a second layer: the
 * same camera's view of the picture as a flat floor, with the same light
 * and fog. The raised land (with its sky) is combined with that floor by
 * u_blend (see blendLayer) and shows over it at u_amount, so the land
 * seems to rise out of it.
 */
export const TERRAIN_SHADER = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
/* The exact height (read between pixels) and the pyramid of highest points (read by pixel and level). */
uniform sampler2D u_fine;
uniform sampler2D u_max;
uniform int u_levels;
uniform vec2 u_res;
uniform float u_amount;
uniform int u_blend;
uniform int u_repeat;
uniform float u_height;
uniform float u_tilt;
uniform float u_pan;
uniform vec2 u_offset;
uniform float u_pedestal;
/**
 * The camera's floor (see cameraFloor). u_floorPass 1 draws only the wide
 * floor at the camera's place into one pixel, as 16 bits in red and green
 * (0 to 16 screen heights), for the engine to read back. u_floorMode 1
 * uses u_floor, the engine's floor eased over time, so the camera rises
 * and sinks smoothly; 0 (no read back yet) finds the floor here.
 */
uniform int u_floorPass;
uniform int u_floorMode;
uniform float u_floor;
uniform float u_lens;
uniform float u_lightTurn;
uniform float u_lightHeight;
uniform float u_shadow;
uniform float u_fog;
uniform float u_sky;
uniform vec3 u_skyColor;
uniform float u_shine;
/* The blur of the height (a mip level): how wide the slope of a sharp edge is. */
uniform float u_smooth;
/* The land's colors: 0 the picture, 1 the gradient by height (u_stopAt, u_stopColor), 2 the real terrain's picture (u_terrainPicture; see docs/TERRAIN.md). */
uniform int u_colors;
uniform sampler2D u_terrainPicture;
uniform int u_stopCount;
uniform float u_stopAt[8];
uniform vec3 u_stopColor[8];

/**
 * The most squares one ray may visit, from the renderer. A fixed count
 * would let the graphics driver unroll the walk into one enormous program
 * that takes an age to build, or fails.
 */
uniform int u_visits;
const float FAR = 12.0;

float aspect;

vec3 blendLayer(vec3 base, vec3 top, int mode) {
  if (mode == 1) return 1.0 - (1.0 - base) * (1.0 - top);
  if (mode == 2) return base * top;
  if (mode == 3) return mix(2.0 * base * top, 1.0 - 2.0 * (1.0 - base) * (1.0 - top), step(0.5, base));
  if (mode == 4) return abs(base - top);
  if (mode == 5) return max(base, top);
  if (mode == 6) return min(base, top);
  if (mode == 7) return min(base + top, 1.0);
  return top;
}

${REPEAT_GLSL}

/* The exact height of the land at a point; far below everything past the picture's edge with no repeat. */
float heightAt(vec2 p) {
  vec2 q, flip;
  if (!wrapPixels(pixelsAt(p), q, flip)) return -1e6;
  /* An explicit level: the walk's loop reads this, and a plain texture() read there has no defined level. */
  return textureLod(u_fine, q / u_res, 0.0).r * abs(u_height);
}

/**
 * The lowest the camera may go at a place: a little above the highest land
 * in a circle 0.15 screen heights around it (17 points). The highest of
 * many points moves smoothly as the camera moves, so small bumps under it
 * hardly move it, and it rises early before a peak. A peak between the
 * points is caught by the camera's own height check (see main).
 */
/**
 * The same, wider and with more points (0.25 screen heights, 49 points),
 * for the one-pixel floor pass that the engine reads back and eases over
 * time (see u_floorPass).
 */
float cameraFloorWide(vec2 at) {
  float highest = heightAt(at);
  for (int ring = 1; ring <= 4; ring++) {
    float radius = 0.0625 * float(ring);
    for (int k = 0; k < 12; k++) {
      float a = 6.2831853 * (float(k) + 0.5 * float(ring)) / 12.0;
      highest = max(highest, heightAt(at + radius * vec2(cos(a), sin(a))));
    }
  }
  return highest + 0.03;
}

float cameraFloor(vec2 at) {
  float highest = heightAt(at);
  for (int ring = 1; ring <= 2; ring++) {
    float radius = 0.075 * float(ring);
    for (int k = 0; k < 8; k++) {
      float a = 6.2831853 * (float(k) + 0.5 * float(ring)) / 8.0;
      highest = max(highest, heightAt(at + radius * vec2(cos(a), sin(a))));
    }
  }
  return highest + 0.03;
}

/* The height gradient at h (0 to 1), as gradientColorAt in params.ts. */
vec3 heightColor(float h) {
  if (h <= u_stopAt[0]) return u_stopColor[0];
  for (int i = 1; i < 8; i++) {
    if (i >= u_stopCount) break;
    if (h <= u_stopAt[i]) {
      float span = u_stopAt[i] - u_stopAt[i - 1];
      return mix(u_stopColor[i - 1], u_stopColor[i], span > 0.0 ? (h - u_stopAt[i - 1]) / span : 1.0);
    }
  }
  return u_stopColor[clamp(u_stopCount - 1, 0, 7)];
}

/**
 * The land's color at a point seen from "t" away: the picture's (the blur
 * level comes from the distance, so a cliff's edge gets no dark line), or
 * with Height colors the gradient at the land's height there (0 at the
 * lowest, 1 at the highest).
 */
vec3 colorAt(vec2 p, float t) {
  vec2 q, flip;
  wrapPixels(pixelsAt(p), q, flip);
  if (u_colors == 1) return heightColor(textureLod(u_fine, q / u_res, 0.0).r);
  if (u_colors == 2) return textureLod(u_terrainPicture, q / u_res, max(0.0, log2(t * 2.0 * tan(u_lens * 0.5)))).rgb;
  float lod = max(0.0, log2(t * 2.0 * tan(u_lens * 0.5)));
  return textureLod(u_tex, q / u_res, lod).rgb;
}

/**
 * Walks the ray from "t" until it meets the land (true, with the crossing
 * in "tHit") or leaves (false). See the note at the top. A ray that runs
 * close along a wall must visit small squares all the way, so it can use
 * up its visits: then "giveUp" is the answer, with "tHit" where the ray
 * got to. The view gives true, so such a ray shows the land under that
 * point and not a hole of sky; a shadow ray gives false, so it stays lit.
 */
bool march(vec3 eye, vec3 dir, float t, int visits, bool giveUp, out float tHit) {
  float top = abs(u_height);
  int level = u_levels - 1;
  /* The ray's speed over the picture's pixels, and a small push past a square's edge so the next visit is inside the next square. */
  vec2 speed = vec2(dir.x / aspect * u_res.x, dir.y * u_res.y);
  float push = min(0.02 / max(length(speed), 1e-6), 1e-3);
  tHit = 0.0;
  float tEnd = FAR;
  if (u_repeat == 2) {
    /**
     * No repeat: the walk starts where the ray enters the picture and ends
     * where it leaves, or never starts. The picture is a rectangle, so a ray
     * that leaves it does not come back. This check stays out of the loop:
     * inside it, Direct3D fails to build the shader and the picture is lost.
     */
    vec2 at = pixelsAt((eye + dir * t).xy);
    vec2 toLow = (vec2(0.0) - at) / speed;
    vec2 toHigh = (u_res - at) / speed;
    vec2 near = min(toLow, toHigh);
    vec2 far = max(toLow, toHigh);
    if (abs(speed.x) < 1e-9) { near.x = -1e9; far.x = 1e9; if (at.x < 0.0 || at.x > u_res.x) return false; }
    if (abs(speed.y) < 1e-9) { near.y = -1e9; far.y = 1e9; if (at.y < 0.0 || at.y > u_res.y) return false; }
    float enter = max(near.x, near.y);
    float leave = min(far.x, far.y);
    if (leave < enter || leave < 0.0) return false;
    tEnd = min(FAR, t + leave);
    t += max(enter, 0.0) + push;
  }
  /**
   * After a move, the square the ray left (at the level it was at), so the
   * next visit can climb only to the larger squares the ray entered anew.
   * A larger square that still holds the square it left was too high for
   * the ray already (the reason the walk came down), so a climb into it
   * would only cost a visit to come down again.
   */
  ivec2 left = ivec2(0);
  bool moved = false;
  for (int i = 0; i < visits; i++) {
    if (t > tEnd) return false;
    vec3 p = eye + dir * t;
    if (p.z > top && dir.z >= 0.0) return false;
    vec2 q, flip;
    wrapPixels(pixelsAt(p.xy), q, flip);
    if (moved) {
      for (int k = 0; k < 16; k++) {
        if (level >= u_levels - 1 || ivec2(floor(q / exp2(float(level + 1)))) == left / 2) break;
        level++;
        left /= 2;
      }
      moved = false;
    }
    float size = exp2(float(level));
    ivec2 count = textureSize(u_max, level);
    ivec2 cell = clamp(ivec2(floor(q / size)), ivec2(0), count - 1);
    float highest = texelFetch(u_max, cell, level).r * top;
    /* Where the ray leaves this square, along its flipped direction inside the picture. */
    vec2 along = speed * flip;
    vec2 low = vec2(cell) * size;
    vec2 high = min(low + size, u_res);
    vec2 edge = mix(low, high, step(0.0, along));
    vec2 toEdge = (edge - q) / along;
    if (abs(along.x) < 1e-9) toEdge.x = 1e9;
    if (abs(along.y) < 1e-9) toEdge.y = 1e9;
    float tExit = t + max(min(toEdge.x, toEdge.y), 0.0);
    if (p.z <= highest) {
      if (level > 0) {
        level--;
        continue;
      }
      /* One pixel: the land crosses the ray between here and the exit, or it does not. */
      if (p.z - heightAt(p.xy) <= 0.0) {
        tHit = t;
        return true;
      }
      vec3 exitPoint = eye + dir * tExit;
      if (exitPoint.z - heightAt(exitPoint.xy) <= 0.0) {
        float above = t;
        float below = tExit;
        for (int k = 0; k < 8; k++) {
          float mid = 0.5 * (above + below);
          vec3 m = eye + dir * mid;
          if (m.z - heightAt(m.xy) <= 0.0) below = mid; else above = mid;
        }
        tHit = below;
        return true;
      }
      t = tExit + push;
      left = cell;
      moved = true;
      continue;
    }
    /* Above everything in the square: skip to its edge, or to where the ray sinks to its highest point. */
    float tSink = dir.z < 0.0 ? t + (p.z - highest) / -dir.z : 1e9;
    t = min(tExit, tSink) + push;
    left = cell;
    moved = true;
  }
  tHit = t;
  return giveUp;
}

void main() {
  aspect = u_res.x / u_res.y;
  float top = abs(u_height);
  /* The camera: at its place and height (never inside the land, see cameraFloor), looking by Pan and Tilt. Right stays level, so there is no roll, even looking straight down. */
  if (u_floorPass == 1) {
    float packed = floor(clamp(cameraFloorWide(u_offset) / 16.0, 0.0, 1.0) * 65535.0 + 0.5);
    o = vec4(floor(packed / 256.0) / 255.0, mod(packed, 256.0) / 255.0, 0.0, 1.0);
    return;
  }
  vec3 eye = vec3(u_offset, u_pedestal);
  float floorHeight = u_floorMode == 1 ? u_floor : cameraFloor(eye.xy);
  /* A smooth blend of the Pedestal and the floor, so the camera eases up as the land rises under it. */
  float gap = u_pedestal - floorHeight;
  eye.z = 0.5 * (u_pedestal + floorHeight + sqrt(gap * gap + 0.05 * 0.05));
  eye.z = max(eye.z, heightAt(eye.xy) + 0.01);
  vec3 forward = vec3(cos(u_tilt) * cos(u_pan), cos(u_tilt) * sin(u_pan), sin(u_tilt));
  vec3 right = vec3(sin(u_pan), -cos(u_pan), 0.0);
  vec3 up = cross(right, forward);
  vec2 screen = (v_uv - 0.5) * vec2(2.0 * aspect, 2.0);
  vec3 dir = normalize(forward + tan(u_lens * 0.5) * (screen.x * right + screen.y * up));

  vec3 fog = mix(textureLod(u_tex, vec2(0.5), 12.0).rgb * 0.5, u_skyColor, u_sky);
  vec3 sun = vec3(cos(u_lightTurn) * cos(u_lightHeight), sin(u_lightTurn) * cos(u_lightHeight), sin(u_lightHeight));
  /* The sky: the fog color, a little lighter toward the horizon. */
  vec3 sky = fog * (1.0 + 0.6 * max(0.0, 1.0 - dir.z * 4.0));
  /* The floor layer: the same ray meets the flat picture at height 0, lit by the sun from straight up. */
  vec3 floor_ = sky;
  if (dir.z < 0.0) {
    float tf = eye.z / -dir.z;
    vec2 q, flip;
    if (wrapPixels(pixelsAt((eye + dir * tf).xy), q, flip)) {
      vec3 ground = colorAt((eye + dir * tf).xy, tf);
      floor_ = mix(ground * (0.3 + 0.7 * sun.z), fog, 1.0 - exp(-tf * u_fog * 0.5));
    }
  }

  /**
   * The land: the walk starts where the ray first comes under the highest
   * possible land. A camera lower than that (in a valley) starts at once,
   * and its rays that look up can meet the land too.
   */
  vec3 color = sky;
  float t;
  bool low = eye.z < top;
  if ((dir.z < 0.0 || low) && march(eye, dir, low ? 0.0 : (eye.z - top) / -dir.z, u_visits, true, t)) {
    vec3 p = eye + dir * t;
    float e = 1.0 / u_res.y;
    vec3 normal = normalize(vec3(heightAt(p.xy - vec2(e, 0.0)) - heightAt(p.xy + vec2(e, 0.0)), heightAt(p.xy - vec2(0.0, e)) - heightAt(p.xy + vec2(0.0, e)), 2.0 * e));
    float diffuse = max(dot(normal, sun), 0.0);
    float lit = 1.0;
    if (u_shadow > 0.0 && diffuse > 0.0) {
      float tShadow;
      if (march(p + normal * (2.0 * e), sun, 0.0, u_visits / 2, false, tShadow)) lit = 1.0 - u_shadow;
    }
    float light = 0.3 + 0.7 * diffuse * lit;
    /**
     * The color comes from a little uphill of the hit point (as far as the
     * blur of the height spreads an edge), so the slope of a sharp edge
     * takes the color of its top, not a mix of both sides.
     */
    vec3 ground = colorAt(p.xy - normal.xy * 2.0 * exp2(u_smooth) / u_res.y, t);
    /* Shine: a glossy highlight where the land faces halfway between the sun and the camera. */
    vec3 halfway = normalize(sun - dir);
    float gloss = pow(max(dot(normal, halfway), 0.0), 40.0) * lit;
    color = mix(ground * light + u_shine * gloss, fog, 1.0 - exp(-t * u_fog * 0.5));
  }
  /* The camera shows a whole world with a sky, so its picture is opaque (see COVER_GLSL). */
  o = vec4(clamp(mix(floor_, blendLayer(floor_, clamp(color, 0.0, 1.0), u_blend), u_amount), 0.0, 1.0), 1.0);
}`;

/**
 * Camera: the picture made so far, lying flat, seen through a virtual
 * camera. It has the camera settings of Terrain: at u_offset on the
 * picture (from its center; the engine moves it by Dolly and Truck),
 * u_pedestal high, looking toward u_pan (0 along +x, counterclockwise) and
 * u_tilt up from level (below 0 looks down), with a lens of u_lens
 * vertical angle. Past the picture's edge it goes on by u_repeat; with no
 * repeat the picture stands alone with sky around it. The view has fog
 * (u_fog) toward the fog color: the picture's mean color, taken toward
 * u_skyColor by u_sky. The sky has that color too. The view shows over the
 * picture by u_blend (see blendLayer) at u_amount.
 */
export const CAMERA_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform int u_repeat;
uniform float u_amount;
uniform int u_blend;
uniform float u_tilt;
uniform float u_pan;
uniform vec2 u_offset;
uniform float u_pedestal;
uniform float u_lens;
uniform float u_fog;
uniform float u_sky;
uniform vec3 u_skyColor;

float aspect;
${REPEAT_GLSL}

vec3 blendLayer(vec3 base, vec3 top, int mode) {
  if (mode == 1) return 1.0 - (1.0 - base) * (1.0 - top);
  if (mode == 2) return base * top;
  if (mode == 3) return mix(2.0 * base * top, 1.0 - 2.0 * (1.0 - base) * (1.0 - top), step(0.5, base));
  if (mode == 4) return abs(base - top);
  if (mode == 5) return max(base, top);
  if (mode == 6) return min(base, top);
  if (mode == 7) return min(base + top, 1.0);
  return top;
}
${COVER_GLSL}
${BLEND_COVER_GLSL}

void main() {
  aspect = u_res.x / u_res.y;
  vec3 eye = vec3(u_offset, u_pedestal);
  vec3 forward = vec3(cos(u_tilt) * cos(u_pan), cos(u_tilt) * sin(u_pan), sin(u_tilt));
  vec3 right = vec3(sin(u_pan), -cos(u_pan), 0.0);
  vec3 up = cross(right, forward);
  vec2 screen = (v_uv - 0.5) * vec2(2.0 * aspect, 2.0);
  vec3 dir = normalize(forward + tan(u_lens * 0.5) * (screen.x * right + screen.y * up));

  vec3 fog = mix(textureLod(u_tex, vec2(0.5), 12.0).rgb * 0.5, u_skyColor, u_sky);
  /* The sky: the fog color, a little lighter toward the horizon. */
  vec3 color = fog * (1.0 + 0.6 * max(0.0, 1.0 - dir.z * 4.0));
  if (dir.z < 0.0) {
    float t = eye.z / -dir.z;
    vec2 q, flip;
    if (wrapPixels(pixelsAt((eye + dir * t).xy), q, flip)) {
      /* The blur level comes from the distance, so the far picture does not flicker. */
      vec3 ground = textureLod(u_tex, q / u_res, max(0.0, log2(t * 2.0 * tan(u_lens * 0.5)))).rgb;
      color = mix(ground, fog, 1.0 - exp(-t * u_fog * 0.5));
    }
  }
  o = blendCover(textureLod(u_tex, v_uv, 0.0), vec4(clamp(color, 0.0, 1.0), 1.0), u_blend, u_amount);
}`;

/**
 * Terrain's height field (see docs/TERRAIN.md), by u_source:
 * 0 Picture: the picture's brightness from a smaller copy (mip level
 * u_smooth), read with smooth cubic curves, so the land is smooth and not
 * made of the small copy's square pixels.
 * 1 Generated: mountains made from layers of noise (fractal), each layer
 * twice as fine and u_roughness as tall as the one before. u_ridges mixes
 * in ridged noise, which has sharp crests, and puts the fine detail on the
 * high parts, as erosion does. The noise repeats a whole number of times
 * across the land (about u_scale across its height), so Tile repeat meets
 * itself with no seam. u_seed picks another land. Smooth (u_smooth) takes
 * away the finest layers: 9 layers at 0, one fewer for each step, with the
 * last one faded in by the part after the whole number.
 * 2 Real terrain: the loaded heights (u_terrain, 0 to 1), read with smooth
 * cubic curves, so heights coarser than the screen (the data has about
 * 30 m detail) make smooth slopes, not steps; blurred a little past Smooth
 * 1.5. u_detail adds made-up fine detail (fineDetail) where the data is
 * coarser than the screen. The land's real relief scales Terrain's Height
 * instead (see drawTerrain), so the heights stay 0 to 1: the camera starts
 * each ray at the top of that range, so a higher height would be cut flat.
 * u_sign below 0 turns the heights over, so dark areas (or valleys) rise.
 */
export const TERRAIN_FIELD_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform float u_smooth;
uniform float u_sign;
uniform int u_source;
uniform vec2 u_res;
uniform float u_scale;
uniform float u_roughness;
uniform float u_ridges;
uniform float u_seed;
uniform sampler2D u_terrain;
/* Real terrain: its heights across and down, and how much made-up fine detail to add (see fineDetail). */
uniform vec2 u_terrainSize;
uniform float u_detail;
uniform float u_detailSize;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
${CUBIC_GLSL}

/* Cubic B-spline sampling of one level of the real terrain's heights (as cubicAt). */
float terrainAt(vec2 uv, int level) {
  vec2 size = vec2(textureSize(u_terrain, level));
  vec2 p = uv * size - 0.5;
  vec2 f = fract(p);
  p -= f;
  vec4 xc = bspline(f.x);
  vec4 yc = bspline(f.y);
  vec4 c = p.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 offset = (c + vec4(xc.yw, yc.yw) / s) / size.xxyy;
  float lod = float(level);
  float a = textureLod(u_terrain, offset.xz, lod).r;
  float b = textureLod(u_terrain, offset.yz, lod).r;
  float d = textureLod(u_terrain, offset.xw, lod).r;
  float e = textureLod(u_terrain, offset.yw, lod).r;
  float sx = s.x / (s.x + s.y);
  float sy = s.z / (s.z + s.w);
  return mix(mix(e, d, sx), mix(b, a, sx), sy);
}

/* A random direction for each lattice point (and the seed). */
vec2 latticeDirection(vec2 cell) {
  float a = 6.2831853 * fract(sin(dot(cell, vec2(127.1, 311.7)) + u_seed * 17.13) * 43758.5453);
  return vec2(cos(a), sin(a));
}

/* Smooth gradient noise (about -0.7 to 0.7) that repeats every "period" lattice cells. */
float periodicNoise(vec2 p, vec2 period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(latticeDirection(mod(i, period)), f);
  float b = dot(latticeDirection(mod(i + vec2(1.0, 0.0), period)), f - vec2(1.0, 0.0));
  float c = dot(latticeDirection(mod(i + vec2(0.0, 1.0), period)), f - vec2(0.0, 1.0));
  float d = dot(latticeDirection(mod(i + vec2(1.0), period)), f - vec2(1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/**
 * Made-up fine detail for real terrain: ridged noise, about -0.5 to 0.5,
 * bent by a coarser noise so the ridges wander like erosion. Its largest
 * features have the same size on the land whatever the area: about 24
 * across the land's height at Detail size 1 (u_detailSize; larger is
 * fewer and larger). Finer layers stop at about 2 pixels of the height
 * field (the screen's size), the finest it can hold.
 */
vec2 detailPeriod() {
  float aspect = u_res.x / u_res.y;
  return max(vec2(1.0), floor(vec2(aspect, 1.0) * 24.0 / max(u_detailSize, 0.05) + 0.5));
}

float fineDetail(vec2 uv) {
  vec2 period = detailPeriod();
  vec2 q = uv * period;
  q += 0.6 * vec2(periodicNoise(q * 0.5 + 3.7, period * 0.5), periodicNoise(q * 0.5 + 9.1, period * 0.5));
  float sum = 0.0;
  float total = 0.0;
  float size = 1.0;
  for (int octave = 0; octave < 5; octave++) {
    if (period.y > u_res.y * 0.5) break;
    float ridge = 1.0 - min(abs(periodicNoise(q, period)) * 1.2, 1.0);
    sum += size * (ridge * ridge - 0.5);
    total += size;
    size *= 0.5;
    q *= 2.0;
    period *= 2.0;
  }
  return total > 0.0 ? sum / total : 0.0;
}

float mountains(vec2 uv) {
  float aspect = u_res.x / u_res.y;
  vec2 period = max(vec2(1.0), floor(vec2(u_scale * aspect, u_scale) + 0.5));
  vec2 q = uv * period;
  float height = 0.0;
  float total = 0.0;
  float size = 1.0;
  /* How much detail the land has had so far: ridged detail grows on high crests and fades in the valleys. */
  float weight = 1.0;
  float layers = clamp(9.0 - u_smooth, 1.0, 9.0);
  for (int octave = 0; octave < 9; octave++) {
    float part = clamp(layers - float(octave), 0.0, 1.0);
    if (part <= 0.0) break;
    float n = periodicNoise(q, period);
    float ridge = 1.0 - min(abs(n) * 1.2, 1.0);
    ridge *= ridge;
    float layer = mix(n * 0.7 + 0.5, ridge * weight, u_ridges);
    weight = clamp(ridge * 1.6, 0.0, 1.0);
    height += size * part * layer;
    total += size * part;
    size *= u_roughness;
    q *= 2.0;
    period *= 2.0;
  }
  /**
   * The layers average out to about 0.25 to 0.75 (higher with ridges), so
   * the heights stretch to the full range on a soft curve, which rounds
   * the highest peaks instead of cutting them flat. Then the low parts
   * flatten into valleys and plains and the high parts get steeper, as on
   * real land.
   */
  float middle = mix(0.5, 0.6, u_ridges);
  float h = 0.5 + 0.5 * tanh((height / total - middle) * 3.0);
  return pow(h, 1.6);
}

void main() {
  float h;
  if (u_source == 1) {
    h = mountains(v_uv);
  } else if (u_source == 2) {
    float blur = max(0.0, u_smooth - 1.5) * 0.5;
    int level = int(floor(blur));
    h = mix(terrainAt(v_uv, level), terrainAt(v_uv, level + 1), blur - float(level));
    if (u_detail > 0.0) {
      /**
       * The detail is about as tall as the land changes across one of its
       * largest features (at least 1% of the land, so very small detail
       * stays visible), so steep slopes get rugged and flat valleys stay
       * smooth.
       */
      vec2 spacing = max(0.5 / detailPeriod(), vec2(0.01));
      float slope = length(vec2(terrainAt(v_uv + vec2(spacing.x, 0.0), 0) - terrainAt(v_uv - vec2(spacing.x, 0.0), 0),
        terrainAt(v_uv + vec2(0.0, spacing.y), 0) - terrainAt(v_uv - vec2(0.0, spacing.y), 0)));
      h = clamp(h + u_detail * fineDetail(v_uv) * (slope + 0.002), 0.0, 1.0);
    }
  } else {
    int level = int(floor(u_smooth));
    float between = u_smooth - float(level);
    vec3 color = cubicAt(v_uv, level);
    if (between > 0.0) color = mix(color, cubicAt(v_uv, level + 1), between);
    h = clamp(luma(color), 0.0, 1.0);
  }
  o = vec4(u_sign < 0.0 ? 1.0 - h : h, 0.0, 0.0, 1.0);
}`;

/**
 * One level of the land's pyramid of highest points. With u_step 1 each
 * pixel of the output is the highest of the 3 × 3 block of u_src centered
 * on it, so level 0 of the pyramid is the height field widened by one
 * pixel each way (the land between two pixels can be as high as either).
 * With u_step 2 it is the highest of the 2 × 2 block at twice the pixel in
 * the level before, so each level holds the highest point of squares twice
 * as large. Pixels past the field's edge repeat its edge. The reads use
 * u_level of u_src. The renderer leaves the base level at zero and uses
 * a separate reduction target, so sampling never aliases the output.
 */
export const MAX_SHADER = `#version 300 es
precision highp float;
precision highp int;
out vec4 o;
uniform sampler2D u_src;
uniform int u_step;
uniform int u_level;

void main() {
  ivec2 size = textureSize(u_src, u_level);
  ivec2 base = ivec2(gl_FragCoord.xy) * u_step - (u_step == 1 ? 1 : 0);
  int span = u_step == 1 ? 3 : 2;
  float highest = 0.0;
  for (int dy = 0; dy < span; dy++) {
    for (int dx = 0; dx < span; dx++) {
      ivec2 at = clamp(base + ivec2(dx, dy), ivec2(0), size - 1);
      highest = max(highest, texelFetch(u_src, at, u_level).r);
    }
  }
  o = vec4(highest, 0.0, 0.0, 1.0);
}`;

/**
 * Contour brightness: the picture's brightness, blurred, and eased over
 * time. The blur reads a smaller copy of the picture (mip level u_smooth)
 * with smooth cubic curves between its pixels, so the contour lines bend
 * smoothly instead of following the small copy's square pixels. Each
 * frame keeps u_keep of the last brightness (Steady), so the lines glide
 * instead of jumping with every small change in the picture.
 */
export const CONTOUR_FIELD_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform sampler2D u_previous;
uniform float u_smooth;
uniform float u_keep;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

${CUBIC_GLSL}
void main() {
  int level = int(floor(u_smooth));
  float between = u_smooth - float(level);
  vec3 color = cubicAt(v_uv, level);
  if (between > 0.0) color = mix(color, cubicAt(v_uv, level + 1), between);
  float brightness = luma(color);
  o = vec4(mix(brightness, texture(u_previous, v_uv).r, u_keep), 0.0, 0.0, 1.0);
}`;

/**
 * Contour lines: lines where the contour brightness (see
 * CONTOUR_FIELD_SHADER) crosses evenly spaced levels, like the lines on a
 * topographic map. The line width is in pixels: the distance to the
 * nearest level is divided by how fast the level changes per pixel,
 * measured from the neighbor pixels. The lines are drawn in u_color,
 * combined with the picture by u_blend (see blendLayer), at u_amount (Opacity).
 */
export const CONTOUR_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform sampler2D u_field;
uniform vec2 u_texel;
uniform float u_amount;
uniform float u_lines;
uniform float u_width;
uniform vec3 u_color;
uniform int u_blend;

vec3 blendLayer(vec3 base, vec3 top, int mode) {
  if (mode == 1) return 1.0 - (1.0 - base) * (1.0 - top);
  if (mode == 2) return base * top;
  if (mode == 3) return mix(2.0 * base * top, 1.0 - 2.0 * (1.0 - base) * (1.0 - top), step(0.5, base));
  if (mode == 4) return abs(base - top);
  if (mode == 5) return max(base, top);
  if (mode == 6) return min(base, top);
  if (mode == 7) return min(base + top, 1.0);
  return top;
}
${COVER_GLSL}

float levelAt(vec2 uv) { return texture(u_field, uv).r * u_lines; }

void main() {
  /* The picture carries its cover (premultiplied); a line is a mark, so it adds cover where it is drawn. */
  vec4 picture = texture(u_tex, v_uv);
  vec3 color = straight(picture);
  float level = levelAt(v_uv);
  vec2 slope = vec2(
    levelAt(v_uv + vec2(u_texel.x, 0.0)) - levelAt(v_uv - vec2(u_texel.x, 0.0)),
    levelAt(v_uv + vec2(0.0, u_texel.y)) - levelAt(v_uv - vec2(0.0, u_texel.y))) * 0.5;
  float change = length(slope);
  float pixels = abs(fract(level + 0.5) - 0.5) / max(change, 1e-5);
  /* A flat area has no contour, even when its brightness sits exactly on a level (pure black or white). */
  float line = (1.0 - smoothstep(u_width * 0.5 - 0.5, u_width * 0.5 + 0.5, pixels)) * smoothstep(0.0, 0.004, change);
  float mark = line * u_amount;
  o = covered(mix(color, blendLayer(color, u_color, u_blend), mark), mix(picture.a, 1.0, mark));
}`;

/**
 * Time smear: each pixel shows the picture from a moment in the past. The
 * last frames are kept in a ring of u_slots layers (u_history); the newest
 * is layer u_head, taken u_since seconds ago, and the layers are u_interval
 * seconds apart. A pattern (u_shape) gives each pixel a delay from 0 to
 * u_delay seconds, and the pixel blends the two frames around that moment,
 * so the delay changes smoothly:
 * - 0, Linear: the delay grows across the picture in the u_angle direction.
 * - 1, Rings: the delay grows from the center outward.
 * - 2, Sweep: the delay grows around the center, starting at u_angle.
 * - 3, Brightness: bright areas show older moments.
 * - 4, Noise: soft blotches of different delays.
 * u_bands repeats the pattern, back and forth, so it never has a hard edge.
 */
export const SMEAR_SHADER = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform sampler2DArray u_history;
uniform vec2 u_res;
uniform int u_head;
uniform int u_filled;
uniform int u_slots;
uniform float u_interval;
uniform float u_since;
uniform float u_delay;
uniform int u_shape;
uniform float u_angle;
uniform float u_bands;
uniform float u_amount;

const float TAU = 6.28318530718;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

/* The pattern, from 0 (no delay) to 1 (the full delay). */
float pattern(vec2 uv, vec3 now) {
  float aspect = u_res.x / u_res.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  vec2 dir = vec2(cos(u_angle), sin(u_angle));
  float m;
  if (u_shape == 1) m = length(p) / length(vec2(aspect, 1.0)) * 2.0;
  else if (u_shape == 2) m = fract((atan(p.y, p.x) - u_angle) / TAU);
  else if (u_shape == 3) m = luma(now);
  else if (u_shape == 4) m = noise(p * 3.0 + 7.3);
  else m = dot(p, dir) / (abs(dir.x) * aspect + abs(dir.y)) + 0.5;
  /* Back and forth: 0 to 1 over the first band, 1 to 0 over the next. */
  float x = clamp(m, 0.0, 1.0) * u_bands;
  return 1.0 - abs(fract(x * 0.5) * 2.0 - 1.0);
}

/* The kept frames carry their cover (premultiplied), so the smear moves it with the color. */
vec4 slot(int age) {
  int layer = (u_head - age + u_slots) % u_slots;
  return texture(u_history, vec3(v_uv, float(layer)));
}

void main() {
  vec4 now = texture(u_tex, v_uv);
  float age = pattern(v_uv, now.rgb) * u_delay;
  vec4 past;
  if (u_filled == 0) {
    past = now;
  } else if (age <= u_since) {
    /* Newer than the newest kept frame: between now and that frame. */
    past = mix(now, slot(0), age / max(u_since, 1e-4));
  } else {
    float k = min((age - u_since) / max(u_interval, 1e-4), float(u_filled - 1));
    int first = int(floor(k));
    int second = min(first + 1, u_filled - 1);
    past = mix(slot(first), slot(second), k - float(first));
  }
  o = mix(now, past, u_amount);
}`;

export const FINISH_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_sharpen;
uniform float u_radius;
uniform float u_exposure;
uniform float u_black;
uniform vec3 u_overlay;
uniform float u_overlayOpacity;
/* How the overlay color combines with the picture (see blendLayer). */
uniform int u_overlayBlend;

/* The same layer blends as the shape steps' (see blendLayer in KALEIDO_SHADER). */
vec3 blendLayer(vec3 base, vec3 top, int mode) {
  if (mode == 1) return 1.0 - (1.0 - base) * (1.0 - top);
  if (mode == 2) return base * top;
  if (mode == 3) return mix(2.0 * base * top, 1.0 - 2.0 * (1.0 - base) * (1.0 - top), step(0.5, base));
  if (mode == 4) return abs(base - top);
  if (mode == 5) return max(base, top);
  if (mode == 6) return min(base, top);
  if (mode == 7) return min(base + top, 1.0);
  return top;
}
${COVER_GLSL}

void main() {
  /**
   * The picture carries its cover (premultiplied). An opaque pixel takes
   * the same math as before covers, word for word, so it gives the same
   * pixels. With a cover, Sharpen filters color and cover together, and
   * Color and Levels change the color only (without the cover) and keep
   * the cover.
   */
  vec4 picture = texture(u_tex, v_uv);
  if (picture.a >= 1.0) {
    vec3 color = picture.rgb;
    if (u_sharpen > 0.0) {
      vec2 d = u_texel * u_radius;
      vec3 cross = texture(u_tex, v_uv + vec2(d.x, 0.0)).rgb + texture(u_tex, v_uv - vec2(d.x, 0.0)).rgb
        + texture(u_tex, v_uv + vec2(0.0, d.y)).rgb + texture(u_tex, v_uv - vec2(0.0, d.y)).rgb;
      vec3 corners = texture(u_tex, v_uv + d).rgb + texture(u_tex, v_uv - d).rgb
        + texture(u_tex, v_uv + vec2(d.x, -d.y)).rgb + texture(u_tex, v_uv + vec2(-d.x, d.y)).rgb;
      vec3 around = (cross + 0.5 * corners) / 6.0;
      color += u_sharpen * (color - around);
    }
    color = clamp(color, 0.0, 1.0);
    color = mix(color, blendLayer(color, u_overlay, u_overlayBlend), u_overlayOpacity);
    color *= exp2(u_exposure);
    color = max(color - u_black, 0.0) / (1.0 - u_black);
    o = vec4(clamp(color, 0.0, 1.0), 1.0);
    return;
  }
  if (u_sharpen > 0.0) {
    vec2 d = u_texel * u_radius;
    vec4 cross = texture(u_tex, v_uv + vec2(d.x, 0.0)) + texture(u_tex, v_uv - vec2(d.x, 0.0))
      + texture(u_tex, v_uv + vec2(0.0, d.y)) + texture(u_tex, v_uv - vec2(0.0, d.y));
    vec4 corners = texture(u_tex, v_uv + d) + texture(u_tex, v_uv - d)
      + texture(u_tex, v_uv + vec2(d.x, -d.y)) + texture(u_tex, v_uv + vec2(-d.x, d.y));
    vec4 around = (cross + 0.5 * corners) / 6.0;
    picture += u_sharpen * (picture - around);
    picture.a = clamp(picture.a, 0.0, 1.0);
  }
  float cover = picture.a;
  vec3 color = straight(vec4(clamp(picture.rgb, 0.0, cover), cover));
  color = mix(color, blendLayer(color, u_overlay, u_overlayBlend), u_overlayOpacity);
  color *= exp2(u_exposure);
  color = max(color - u_black, 0.0) / (1.0 - u_black);
  o = covered(clamp(color, 0.0, 1.0), cover);
}`;

/**
 * Bloom, step 1: the bright parts of the picture. A pixel passes in full
 * when its brightest color channel is well above u_threshold, and not at
 * all well below it; u_softness is the width of the fade between. The
 * brightest channel, not the brightness, decides, so strong pure colors
 * glow too.
 */
export const BLOOM_BRIGHT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform float u_threshold;
uniform float u_softness;
void main() {
  vec3 color = texture(u_tex, v_uv).rgb;
  float peak = max(color.r, max(color.g, color.b));
  float band = max(u_softness, 0.002) * 0.5;
  o = vec4(color * smoothstep(u_threshold - band, u_threshold + band, peak), 1.0);
}`;

/**
 * Pixel sort, step 1: the picture turned so that the sort direction
 * (u_dir) runs along the rows of the buffer, which spans the screen's
 * diagonal (u_diag pixels) so it covers the screen at any angle. Each row
 * is one sort line, u_band screen pixels wide: it takes the mean of up to
 * 8 points across that width. Alpha is the part of those points on the
 * screen; outside it nothing is sorted.
 */
export const SORT_TURN_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_diag;
uniform vec2 u_dir;
uniform float u_band;
void main() {
  vec2 along = (v_uv - 0.5) * u_diag;
  int taps = int(clamp(ceil(u_band), 1.0, 8.0));
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= taps) break;
    vec2 point = along + vec2(0.0, ((float(i) + 0.5) / float(taps) - 0.5) * u_band);
    vec2 screen = vec2(point.x * u_dir.x - point.y * u_dir.y, point.x * u_dir.y + point.y * u_dir.x);
    vec2 uv = screen / u_res + 0.5;
    bool inside = all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
    if (inside) sum += vec4(texture(u_tex, uv).rgb, 1.0);
  }
  o = sum.a > 0.0 ? vec4(sum.rgb / sum.a, sum.a / float(taps)) : vec4(0.0);
}`;

const SORT_GLSL = `
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

/**
 * Pixel sort, step 2: where each run starts. A pixel on the screen with a
 * brightness from u_low to u_high is in a run; it joins the run of the
 * pixel before it in the row when that pixel is in a run too. The output
 * is the column of the pixel it joins (or its own column when it starts a
 * run), and 1 in green when the pixel is in a run. Every u_length pixels (moved by a random amount in each row, so
 * the cuts do not line up) a run is cut.
 */
export const SORT_START_SHADER = `#version 300 es
precision highp float;
precision highp int;
out vec4 o;
uniform sampler2D u_tex;
uniform float u_low;
uniform float u_high;
uniform float u_length;
${SORT_GLSL}
bool inRun(ivec2 cell) {
  vec4 t = texelFetch(u_tex, cell, 0);
  float l = luma(t.rgb);
  return t.a > 0.5 && l >= u_low && l <= u_high;
}
void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  float x = float(cell.x);
  float shift = fract(sin(float(cell.y) * 12.9898) * 43758.5453) * u_length;
  bool cut = mod(x + shift, u_length) < 1.0;
  bool joins = cell.x > 0 && !cut && inRun(cell) && inRun(cell - ivec2(1, 0));
  o = vec4(joins ? x - 1.0 : x, inRun(cell) ? 1.0 : 0.0, 0.0, 1.0);
}`;

/** Pixel sort, step 3: each pixel follows its link twice as far (pointer jumping), so after log2(width) passes every pixel links to the start of its run. Green (in a run) stays. */
export const SORT_JUMP_SHADER = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D u_tex;
void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec4 self = texelFetch(u_tex, cell, 0);
  o = vec4(texelFetch(u_tex, ivec2(int(self.r), cell.y), 0).r, self.g, 0.0, 1.0);
}`;

/** Pixel sort, step 4: each pixel's color, with the start of its run in alpha: the first part of its sort key. */
export const SORT_PACK_SHADER = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D u_tex;
uniform sampler2D u_start;
void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  o = vec4(texelFetch(u_tex, cell, 0).rgb, texelFetch(u_start, cell, 0).r);
}`;

/**
 * Pixel sort, step 5: one pass of a bitonic sort along each row. A pixel
 * compares itself with its partner u_j columns away and keeps the smaller
 * or the larger of the two, by the block of u_k columns it is in. The key
 * is the start of the run first, then the brightness (times u_sign: -1
 * sorts bright to dark). The run starts grow along the row, and a pixel
 * outside a run starts its own run, so every pixel stays in its run and
 * only the pixels inside each run change places.
 */
export const SORT_STEP_SHADER = `#version 300 es
precision highp float;
precision highp int;
out vec4 o;
uniform sampler2D u_tex;
uniform int u_k;
uniform int u_j;
uniform float u_sign;
${SORT_GLSL}
bool before(vec4 a, vec4 b) {
  return a.a < b.a || (a.a == b.a && u_sign * luma(a.rgb) < u_sign * luma(b.rgb));
}
void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  int partner = cell.x ^ u_j;
  vec4 self = texelFetch(u_tex, cell, 0);
  vec4 other = texelFetch(u_tex, ivec2(partner, cell.y), 0);
  bool keepSmaller = (cell.x < partner) == ((cell.x & u_k) == 0);
  bool otherFirst = before(other, self);
  o = keepSmaller == otherFirst ? other : self;
}`;

/**
 * Pixel sort, step 6: the sorted buffer turned back onto the screen, mixed
 * over the picture by u_amount. Each screen pixel reads the middle of its
 * sort line (u_rows lines in a buffer u_side pixels tall), so a thick line
 * has hard edges. A place that is not in a run (green in u_links) was not
 * sorted, so it keeps the picture's own sharp pixel. Thin lines (u_band
 * near 1 pixel) also check the pixel's own brightness against u_low and
 * u_high, so the edges of the range stay sharp; thick lines show whole.
 */
export const SORT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_sorted;
uniform sampler2D u_links;
uniform sampler2D u_picture;
uniform vec2 u_res;
uniform float u_diag;
uniform vec2 u_dir;
uniform float u_amount;
uniform float u_rows;
uniform float u_side;
uniform float u_band;
uniform float u_low;
uniform float u_high;
${SORT_GLSL}
${COVER_GLSL}
void main() {
  /* The picture carries its cover (premultiplied). The sorted colors move; the cover stays (the packed picture's alpha holds the runs). */
  vec4 picture = texture(u_picture, v_uv);
  vec3 color = picture.rgb;
  vec2 screen = (v_uv - 0.5) * u_res;
  vec2 along = vec2(screen.x * u_dir.x + screen.y * u_dir.y, -screen.x * u_dir.y + screen.y * u_dir.x);
  vec2 place = along / u_diag + 0.5;
  float row = clamp(floor(place.y * u_rows), 0.0, u_rows - 1.0);
  vec3 sorted = texture(u_sorted, vec2(place.x, (row + 0.5) / u_side)).rgb;
  float inRun = texelFetch(u_links, ivec2(clamp(place.x * u_side, 0.0, u_side - 1.0), row), 0).g;
  float l = luma(straight(picture));
  inRun *= mix(l >= u_low && l <= u_high ? 1.0 : 0.0, 1.0, clamp(u_band - 1.5, 0.0, 1.0));
  o = vec4(min(mix(color, sorted, u_amount * inRun), vec3(picture.a)), picture.a);
}`;

/**
 * Light rays, step 2: one pass of the rays. Each pixel mixes 16 points on
 * the line from it toward u_center, over u_span of the way there (1 = all
 * the way), so bright parts are smeared out along lines away from the
 * center. The points farther along count less, by u_fade (per whole way
 * to the center). The renderer runs a short pass, a longer one, and a long
 * * one, so the rays are smooth with few points per pass.
 */
export const RAYS_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform vec2 u_center;
uniform float u_span;
uniform float u_fade;
void main() {
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 16; i++) {
    float t = u_span * float(i) / 15.0;
    float weight = exp(-u_fade * t);
    sum += texture(u_tex, u_center + (v_uv - u_center) * (1.0 - t)).rgb * weight;
    total += weight;
  }
  o = vec4(sum / total, 1.0);
}`;

/** Light rays, step 3: the picture plus u_amount times the rays. */
export const RAYS_MIX_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform sampler2D u_picture;
uniform float u_amount;
${COVER_GLSL}
/* The rays are added light (see addLight). */
void main() {
  o = addLight(texture(u_picture, v_uv), u_amount * texture(u_tex, v_uv).rgb);
}`;

/**
 * Lasers: a fan of u_count thin beams, u_spread wide in all. The fan is a
 * flat sheet; each beam is tilted up by the angle whose sine is its
 * u_sweeps value (1 = straight up, 0 = level and seen edge-on, below 0 =
 * down), so with Sweep delay the beams tilt one after another; each beam is drawn as
 * seen from the front, so a beam that points away gets shorter (only one
 * that points almost straight away ends on the screen). The beams start in
 * a row along u_base (the base line, in pixels, across the fan), centered
 * on u_source (pixels from the screen center). u_turn turns the whole fan,
 * base line and beams, clockwise about u_source.
 * Each beam is a bright core u_width pixels wide, with a white-hot middle,
 * in a haze u_glow bright that reaches about u_glowSize pixels, and gets
 * dimmer along its length by u_fade (per screen height). The beams' hues
 * start at u_hue and go u_rainbow of the way around the color wheel across
 * the fan. Each beam's start glows in a dot u_emitter pixels across (0 = no dot).
 * The beams are added light (see addLight).
 */
/**
 * Image or Video: the effect's image or video (u_layer, premultiplied, with
 * its clear parts) over the picture made so far. Size 1 covers the screen
 * and keeps the layer's shape; u_offset moves its center (a part of the
 * screen size from the screen center), and u_turn turns it about that
 * center. Outside the layer, the picture shows as it is. Blend 0 lays it
 * over (Normal); 1 is Screen and 2 is Add, where black adds nothing, so a
 * video on black needs no clear parts. Its light adds cover as it adds
 * color (see COVER_GLSL), so it shows over what is under a clear layer.
 * u_key (0 = off) is the black key: parts darker than u_key become clear,
 * with a soft edge from half of u_key, so a video's black border goes away
 * and the rest stays opaque.
 */
export const PICTURE_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform sampler2D u_layer;
uniform vec2 u_res;
uniform float u_opacity;
uniform int u_blend;
uniform float u_layerAspect;
uniform float u_size;
uniform vec2 u_offset;
uniform float u_turn;
uniform float u_key;
${COVER_GLSL}
void main() {
  vec4 base = texture(u_tex, v_uv);
  float aspect = u_res.x / u_res.y;
  /* The point in screen-height units from the layer's center, turned back by the layer's turn. */
  vec2 p = (v_uv - 0.5 - u_offset) * vec2(aspect, 1.0);
  float c = cos(u_turn);
  float s = sin(u_turn);
  p = mat2(c, -s, s, c) * p;
  /* At Size 1 the layer covers the screen: its height is the screen's, or more for a layer narrower than the screen. */
  float h = max(1.0, aspect / u_layerAspect) * u_size;
  vec2 uv = p / vec2(h * u_layerAspect, h) + 0.5;
  bool inside = all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
  vec4 layer = inside ? texture(u_layer, uv) : vec4(0.0);
  if (u_key > 0.0) {
    float bright = max(layer.r, max(layer.g, layer.b)) / max(layer.a, 1e-4);
    layer *= smoothstep(u_key * 0.5, u_key, bright);
  }
  layer *= u_opacity;
  if (u_blend == 0) {
    o = layer + base * (1.0 - layer.a);
    return;
  }
  vec3 light = u_blend == 1 ? layer.rgb * (1.0 - clamp(base.rgb, 0.0, 1.0)) : layer.rgb;
  o = addLight(base, light);
}`;

export const LASER_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_picture;
uniform vec2 u_res;
uniform vec2 u_source;
uniform vec2 u_base;
uniform float u_turn;
uniform float u_sweeps[32];
uniform float u_spread;
uniform int u_count;
uniform float u_width;
uniform float u_glow;
uniform float u_glowSize;
uniform float u_emitter;
uniform float u_fade;
uniform float u_hue;
uniform float u_rainbow;
uniform float u_amount;
uniform float u_opacity;
uniform int u_blend;
/* The same layer blends as the shape steps' (see blendLayer in KALEIDO_SHADER). */
vec3 blendLayer(vec3 base, vec3 top, int mode) {
  if (mode == 1) return 1.0 - (1.0 - base) * (1.0 - top);
  if (mode == 2) return base * top;
  if (mode == 3) return mix(2.0 * base * top, 1.0 - 2.0 * (1.0 - base) * (1.0 - top), step(0.5, base));
  if (mode == 4) return abs(base - top);
  if (mode == 5) return max(base, top);
  if (mode == 6) return min(base, top);
  if (mode == 7) return min(base + top, 1.0);
  return top;
}
${COVER_GLSL}
/* A fully saturated color of hue h (0 to 1). */
vec3 hueColor(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  vec2 fromSource = (v_uv - 0.5) * u_res - u_source;
  /* Into the fan's own frame: turned back (counterclockwise) by the fan's clockwise turn. */
  float turnCos = cos(u_turn);
  float turnSin = sin(u_turn);
  fromSource = vec2(fromSource.x * turnCos - fromSource.y * turnSin, fromSource.x * turnSin + fromSource.y * turnCos);
  float haze = u_width + u_glowSize;
  vec3 light = vec3(0.0);
  /* The beams' glows, added up (strength and color times strength); see the end. */
  float glowSum = 0.0;
  vec3 glowColor = vec3(0.0);
  /* The brightest start glow at this pixel, and its beam's color: where the starts meet, they do not add up. */
  float spot = 0.0;
  vec3 spotColor = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= u_count) break;
    float t = u_count > 1 ? float(i) / float(u_count - 1) - 0.5 : 0.0;
    vec2 d = fromSource - u_base * t;
    float a = u_spread * t;
    /* The beam's direction on the screen, and how much of its length shows (the rest points away). */
    vec2 dir = vec2(sin(a), cos(a) * u_sweeps[i]);
    float shown = length(dir);
    dir = shown > 1e-5 ? dir / shown : vec2(0.0, 1.0);
    float beamLength = shown * 12.0 * u_res.y;
    float along = dot(d, dir);
    /* Behind the source there is no beam; the start is soft, so no edge shows there. */
    float start = smoothstep(-u_width, u_width * 2.0, along);
    float across = abs(d.x * dir.y - d.y * dir.x) / u_width;
    float core = exp(-4.0 * across * across);
    /* The glow starts softly over its own size, so no hard edge shows behind the start. */
    float glow = u_glow * 0.5 * exp(-across * u_width / haze) * smoothstep(-haze, haze * 0.5, along);
    vec3 color = hueColor(fract(u_hue + u_rainbow * float(i) / float(max(u_count, 1))));
    /* Fade dims the beam along its length; a short beam also fades out toward its end. */
    float fade = exp(-u_fade * max(along, 0.0) / u_res.y) * (1.0 - smoothstep(beamLength * 0.4, beamLength, along));
    light += (color + 0.6) * core * start * fade;
    glowSum += glow * fade;
    glowColor += color * glow * fade;
    float near = length(d) / max(u_emitter, 1e-3);
    float beamSpot = u_emitter > 0.0 ? exp(-near * near) : 0.0;
    if (beamSpot > spot) {
      spot = beamSpot;
      spotColor = color;
    }
  }
  /**
   * Where glows overlap, they add up to at most about twice one beam's
   * glow, so a strong glow on many beams does not turn into a flat area.
   */
  float glowMax = u_glow;
  if (glowSum > 0.0) light += glowColor / glowSum * glowMax * (1.0 - exp(-glowSum / max(glowMax, 1e-4)));
  light += (spotColor + 0.5) * spot * (0.5 + min(u_glow, 1.0));
  light *= u_amount;
  vec4 picture = texture(u_picture, v_uv);
  /* Add (7): the light adds with no limit, so Bloom can pick up the bright cores. */
  if (u_blend == 7) {
    o = addLight(picture, light * u_opacity);
    return;
  }
  /**
   * The other modes: the light is a layer whose cover is its brightest part
   * (up to 1) and whose color is the light at full brightness.
   */
  float cover = clamp(max(light.r, max(light.g, light.b)), 0.0, 1.0);
  vec3 top = cover > 1e-4 ? clamp(light / cover, 0.0, 1.0) : vec3(0.0);
  vec3 base = straight(picture);
  float mark = cover * u_opacity;
  o = covered(mix(base, blendLayer(base, top, u_blend), mark), mix(picture.a, 1.0, mark));
}`;

/**
 * Opacity mask: a gradient of grays sets how much of each pixel stays.
 * White keeps the pixel, black clears it (its color and its cover, so what
 * is under the picture shows: black on the screen), and the grays between
 * keep part of it. u_mode 0 (Brightness): the pixel's own brightness is
 * its place on the gradient, from black (0) to white (1), so the mask
 * follows the picture as it moves. u_mode 1 (Radial): the place runs from
 * the center (0) to u_radius pixels away (1), and keeps the last stop past
 * that; u_stretch makes the circle u_stretch times as wide as it is tall,
 * turned by u_turn. u_amount mixes from no mask (0) to the whole mask (1).
 */
export const MASK_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_picture;
uniform vec2 u_res;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_stretch;
uniform float u_turn;
uniform float u_amount;
uniform int u_mode;
uniform int u_stopCount;
uniform float u_stopAt[8];
uniform float u_stopGray[8];
${COVER_GLSL}

/* The gray at place t, as gradientColorAt in params.ts. */
float stopGray(float t) {
  if (t <= u_stopAt[0]) return u_stopGray[0];
  for (int i = 1; i < 8; i++) {
    if (i >= u_stopCount) break;
    if (t <= u_stopAt[i]) {
      float span = u_stopAt[i] - u_stopAt[i - 1];
      return mix(u_stopGray[i - 1], u_stopGray[i], span > 0.0 ? (t - u_stopAt[i - 1]) / span : 1.0);
    }
  }
  return u_stopGray[clamp(u_stopCount - 1, 0, 7)];
}

void main() {
  vec4 picture = texture(u_picture, v_uv);
  float place;
  if (u_mode == 0) {
    /* The brightness of the color without its cover. */
    place = dot(clamp(straight(picture), 0.0, 1.0), vec3(0.2126, 0.7152, 0.0722));
  } else {
    vec2 p = (v_uv - 0.5) * u_res - u_center;
    float c = cos(u_turn);
    float s = sin(u_turn);
    p = mat2(c, -s, s, c) * p;
    p.x /= u_stretch;
    place = length(p) / u_radius;
  }
  float keep = mix(1.0, clamp(stopGray(place), 0.0, 1.0), u_amount);
  o = picture * keep;
}`;

/**
 * Light shapes: glowing outlines (a ring, a square, a triangle or a star)
 * that draw themselves, in one pass over the picture. Each of u_count
 * copies has its own radius (smaller by u_spacing from the first) and its
 * own place in the draw cycle (later by u_delay). For each pixel, each
 * copy finds the nearest point of its outline and that point's place s
 * along it (0 at the top, going clockwise, to 1 back at the top). A ring
 * is exact; the other shapes are their corners joined by straight lines.
 * u_draw: 0 draws the outline from the top, then erases it from the top; 1
 * a part u_length long chases around it, brightest at its head; 2 shows
 * it whole. A snake (u_shape 4) is an open path that wanders and never
 * repeats (its corners come from renderer.ts each frame); u_draw does not
 * count for it: all of it shows, brightest at its head, fading toward its
 * tail. The color is the gradient (u_stopAt, u_stopColor) at s, moved
 * along by u_shift, there and back once around the outline, so its ends
 * meet with no seam. The core, the glow and the head's spot are as in
 * LASER_SHADER, so the lights look the same; the head's spot is u_emitter
 * pixels across (0 = no spot). Sizes are in pixels.
 *
 * In 3D (u_turn3d: Spin, Spin's lag, Tumble, Tumble's lag, in radians),
 * each copy turns around its upright line by Spin and then around its
 * level line by Tumble, seen with a little perspective. Each next copy has
 * turned less by the lag, as it is Delay later. A turned outline is its
 * corners turned, joined by straight lines, and place s still goes evenly
 * along the flat outline. A turned ring is a true circle (see nearestRing).
 */
export const OUTLINE_SHADER = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_picture;
uniform vec2 u_res;
uniform vec2 u_center;
uniform float u_turn;
uniform vec4 u_turn3d;
uniform int u_shape;
uniform int u_count;
uniform float u_radius;
uniform float u_spacing;
uniform float u_delay;
uniform float u_phase;
uniform int u_draw;
uniform float u_length;
uniform int u_points;
uniform float u_width;
uniform float u_glow;
uniform float u_glowSize;
/* The size of the head's dot in pixels (0 = no dot). */
uniform float u_emitter;
uniform float u_shift;
uniform float u_amount;
uniform int u_stopCount;
uniform float u_stopAt[8];
uniform vec3 u_stopColor[8];
/**
 * The outline at radius 1 (see outlineCorners in renderer.ts): its corners,
 * and each corner's place along it (0 to 1, one more for the end). Worked
 * out once per frame, not for each pixel.
 */
uniform vec2 u_corners[48];
uniform float u_cornerAt[49];
${COVER_GLSL}
const float TAU = 6.2831853;
/* The corners of a turned ring. */
const int RING_CORNERS = 48;

/* True when the outlines turn in 3D: then they are drawn by their turned corners. */
bool turned;
/* This copy's turn in 3D, and the distance of the eye (pixels) for the perspective. */
mat3 turn3d;
float eye;

/* A point of the flat outline, turned in 3D and seen from the eye. */
vec2 project(vec2 q) {
  if (!turned) return q;
  vec3 v = turn3d * vec3(q, 0.0);
  return v.xy * (eye / (eye + v.z));
}

/* The gradient at place t, there and back once around the outline, so it meets itself with no seam. */
float around(float t) { return 1.0 - abs(2.0 * fract(t) - 1.0); }

/* The gradient at t (0 to 1), as gradientColorAt in params.ts. */
vec3 stopColor(float t) {
  if (t <= u_stopAt[0]) return u_stopColor[0];
  for (int i = 1; i < 8; i++) {
    if (i >= u_stopCount) break;
    if (t <= u_stopAt[i]) {
      float span = u_stopAt[i] - u_stopAt[i - 1];
      return mix(u_stopColor[i - 1], u_stopColor[i], span > 0.0 ? (t - u_stopAt[i - 1]) / span : 1.0);
    }
  }
  return u_stopColor[clamp(u_stopCount - 1, 0, 7)];
}

/* How many corners the outline has: a ring has none unless it is turned; a snake has 48 along its path. */
int cornerCount() { return u_shape == 0 || u_shape == 4 ? RING_CORNERS : u_shape == 1 ? 4 : u_shape == 2 ? 3 : 2 * u_points; }

/* How many sides: a closed outline has one back to its first corner; a snake (open) does not. */
int sideCount() { return u_shape == 4 ? cornerCount() - 1 : cornerCount(); }

/* The point at place s (0 to 1) along the flat outline of radius r. A ring is a true circle, also when it is turned. */
vec2 outlinePoint(float s, float r) {
  if (u_shape == 0) return r * vec2(sin(TAU * s), cos(TAU * s));
  int corners = cornerCount();
  int sides = sideCount();
  float h = u_shape == 4 ? clamp(s, 0.0, 1.0) : fract(s);
  for (int k = 0; k < RING_CORNERS; k++) {
    if (k >= sides) break;
    float at0 = u_cornerAt[k];
    float at1 = u_cornerAt[k + 1];
    if (h <= at1 || k == sides - 1) return r * mix(u_corners[k], u_corners[(k + 1) % corners], clamp((h - at0) / max(at1 - at0, 1e-6), 0.0, 1.0));
  }
  return r * u_corners[0];
}

/**
 * The nearest point to p on the part of the outline that shows: from place
 * a to place b (b - a at most 1; a is below 0 for a part across the top).
 * Its distance in pixels (x) and its place (y, from a to b). Only the part
 * that shows counts, so its ends are round and its glow ends with it.
 */
/* A turned ring's point at angle t (clockwise from the top) as it is seen, and how fast it moves as t grows (dP). */
vec2 ringSeen(float t, float r, out vec2 dP) {
  vec3 v = r * (sin(t) * turn3d[0] + cos(t) * turn3d[1]);
  vec3 dv = r * (cos(t) * turn3d[0] - sin(t) * turn3d[1]);
  float k = eye / (eye + v.z);
  dP = dv.xy * k - v.xy * k * k * dv.z / eye;
  return v.xy * k;
}

/**
 * nearestShown for a turned ring: a true circle in its turned plane, seen
 * with the perspective, so no corners show. The search starts at the angle
 * where the pixel's line of sight meets the ring's plane, and on the far
 * side of the ring, and moves each start a few steps toward the nearest
 * point (each step goes along the ring's direction there). A found point
 * on the part that shows counts, and so do the part's two ends; the
 * nearest of these wins. A few steps for each pixel, not 48 sides.
 */
vec2 nearestRing(vec2 p, float r, float a, float b) {
  vec3 normal = turn3d[2];
  float toward = dot(normal, vec3(p, eye));
  float start = atan(p.x, p.y);
  if (abs(toward) > 1e-4) {
    vec3 hit = vec3(0.0, 0.0, -eye) + vec3(p, eye) * (eye * normal.z / toward);
    start = atan(dot(hit, turn3d[0]), dot(hit, turn3d[1]));
  }
  vec2 dP;
  vec2 best = vec2(length(p - ringSeen(TAU * a, r, dP)), a);
  float atB = length(p - ringSeen(TAU * b, r, dP));
  if (atB < best.x) best = vec2(atB, b);
  for (int seed = 0; seed < 2; seed++) {
    float t = start + 0.5 * TAU * float(seed);
    vec2 seen = vec2(0.0);
    for (int i = 0; i < 4; i++) {
      seen = ringSeen(t, r, dP);
      t -= clamp(dot(seen - p, dP) / max(dot(dP, dP), 1e-6), -0.6, 0.6);
    }
    seen = ringSeen(t, r, dP);
    float s = a + fract(fract(t / TAU) - a);
    float d = length(p - seen);
    if (s <= b && d < best.x) best = vec2(d, s);
  }
  return best;
}

vec2 nearestShown(vec2 p, float r, float a, float b) {
  if (b - a <= 1e-5) return vec2(1e9, a);
  if (u_shape == 0 && turned) return nearestRing(p, r, a, b);
  if (u_shape == 0) {
    float s = a + fract(fract(atan(p.x, p.y) / TAU) - a);
    if (s <= b) return vec2(abs(length(p) - r), s);
    float da = length(p - outlinePoint(a, r));
    float db = length(p - outlinePoint(b, r));
    return da < db ? vec2(da, a) : vec2(db, b);
  }
  int corners = cornerCount();
  int sides = sideCount();
  vec2 best = vec2(1e9, a);
  /* Each corner is turned and seen once: a side's end is the next side's start. */
  vec2 c0 = project(r * u_corners[0]);
  for (int k = 0; k < RING_CORNERS; k++) {
    if (k >= sides) break;
    /* The place along the side comes from the flat side; the distance from the side as it is seen. */
    vec2 c1 = project(r * u_corners[(k + 1) % corners]);
    vec2 ab = c1 - c0;
    float seen = dot(ab, ab);
    float s0 = u_cornerAt[k];
    float s1 = u_cornerAt[k + 1];
    /* The side as it is, and one turn earlier, for a part across the top. */
    for (int w = -1; w <= 0; w++) {
      float lo = max(a, s0 + float(w));
      float hi = min(b, s1 + float(w));
      if (hi < lo) continue;
      float span = max(s1 - s0, 1e-6);
      float t0 = (lo - s0 - float(w)) / span;
      float t1 = (hi - s0 - float(w)) / span;
      float t = clamp(dot(p - c0, ab) / max(seen, 1e-6), t0, t1);
      float d = length(p - c0 - ab * t);
      if (d < best.x) best = vec2(d, s0 + float(w) + t * span);
    }
    c0 = c1;
  }
  return best;
}

void main() {
  vec2 p = (v_uv - 0.5) * u_res - u_center;
  float c = cos(u_turn);
  float sn = sin(u_turn);
  p = mat2(c, -sn, sn, c) * p;
  float haze = u_width + u_glowSize;
  vec3 light = vec3(0.0);
  float glowSum = 0.0;
  vec3 glowColor = vec3(0.0);
  float spot = 0.0;
  vec3 spotColor = vec3(0.0);
  turned = u_turn3d != vec4(0.0);
  eye = 2.5 * u_res.y;
  /* At most 24 copies (OUTLINE_COPIES in renderer.ts). */
  for (int i = 0; i < 24; i++) {
    if (i >= u_count) break;
    float r = u_radius * (1.0 - u_spacing * float(i) / float(max(u_count - 1, 1)));
    if (r < 0.5) continue;
    /**
     * A copy too far from this pixel for its line, glow or head to show is
     * skipped: what it would add is below exp(-12). The outline is inside
     * its radius, a little larger when it turns toward the eye; a flat ring
     * also has nothing to add far inside it.
     */
    float reach = max(haze * 12.0 + u_width * 4.0, u_emitter * 4.0) + 12.0;
    float far = length(p);
    /* A snake goes up to 1.6 radii across (see snakePoint in renderer.ts). */
    float extent = u_shape == 4 ? 1.6 * r : r;
    if (far > (turned ? extent * eye / max(eye - extent, 1.0) : extent) + reach) continue;
    if (u_shape == 0 && !turned && far < r - reach) continue;
    /* Spin turns the outline around its upright line, then Tumble around its level line. */
    float spinAngle = u_turn3d.x - u_turn3d.y * float(i);
    float tumbleAngle = u_turn3d.z - u_turn3d.w * float(i);
    float cs = cos(spinAngle);
    float ss = sin(spinAngle);
    float ct = cos(tumbleAngle);
    float st = sin(tumbleAngle);
    turn3d = mat3(1.0, 0.0, 0.0, 0.0, ct, st, 0.0, -st, ct) * mat3(cs, 0.0, ss, 0.0, 1.0, 0.0, -ss, 0.0, cs);
    float phase = fract(u_phase - u_delay * float(i));
    /**
     * The part that shows, from place a to place b. Drawing: from the top
     * to the head in the first half of the cycle, then from the eraser to
     * the end. Chasing: Length behind the head, once around per cycle.
     */
    float a = 0.0;
    float b = 1.0;
    bool moving = false;
    if (u_shape == 4) {
      /* A snake crawls on and on: all of it shows, from the tail (0) to the head (1). */
      moving = true;
    } else if (u_draw == 0) {
      moving = phase < 0.5;
      if (moving) b = phase * 2.0;
      else a = phase * 2.0 - 1.0;
    } else if (u_draw == 1) {
      moving = true;
      a = phase - u_length;
      b = phase;
    }
    vec2 n = nearestShown(p, r, a, b);
    /* A chased part is full at its head and fades to nothing at its tail; a snake's last 60% toward its tail fades. */
    float shown = u_shape == 4 ? clamp(n.y / 0.6, 0.0, 1.0) : u_draw == 1 ? clamp((n.y - a) / max(u_length, 1e-3), 0.0, 1.0) : 1.0;
    vec3 color = stopColor(around(n.y + u_shift));
    float across = n.x / u_width;
    float core = exp(-4.0 * across * across);
    float glow = u_glow * 0.5 * exp(-n.x / haze);
    light += (color + 0.6) * core * shown;
    glowSum += glow * shown;
    glowColor += color * glow * shown;
    /* The head's bright spot while the outline is drawn or chased. */
    if (moving && u_emitter > 0.0) {
      float near = length(p - project(outlinePoint(b, r))) / u_emitter;
      float headSpot = exp(-near * near);
      if (headSpot > spot) {
        spot = headSpot;
        spotColor = stopColor(around(b + u_shift));
      }
    }
  }
  float glowMax = u_glow;
  if (glowSum > 0.0) light += glowColor / glowSum * glowMax * (1.0 - exp(-glowSum / max(glowMax, 1e-4)));
  light += (spotColor + 0.5) * spot * (0.5 + min(u_glow, 1.0));
  o = addLight(texture(u_picture, v_uv), u_amount * light);
}`;

/**
 * Bloom, step 2: one level of the glow, half the size of the level before
 * (u_texel is one pixel of that level). It reads 13 points in a 4 by 4
 * pixel area, weighted toward the middle, so the level is a soft copy
 * with no grid: a small light anywhere gives the same round glow.
 */
export const BLOOM_DOWN_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform vec2 u_texel;
/**
 * For the first level, which reads the picture: each read keeps only the
 * bright parts, as BLOOM_BRIGHT_SHADER does. Below 0 (the later levels),
 * every read is kept as it is.
 */
uniform float u_threshold;
uniform float u_softness;
vec3 bright(vec3 color) {
  if (u_threshold < 0.0) return color;
  float peak = max(color.r, max(color.g, color.b));
  float band = max(u_softness, 0.002) * 0.5;
  return color * smoothstep(u_threshold - band, u_threshold + band, peak);
}
vec3 at(float x, float y) { return bright(texture(u_tex, v_uv + u_texel * vec2(x, y)).rgb); }
void main() {
  vec3 corners = at(-2.0, 2.0) + at(2.0, 2.0) + at(-2.0, -2.0) + at(2.0, -2.0);
  vec3 sides = at(0.0, 2.0) + at(-2.0, 0.0) + at(2.0, 0.0) + at(0.0, -2.0);
  vec3 inner = at(-1.0, 1.0) + at(1.0, 1.0) + at(-1.0, -1.0) + at(1.0, -1.0);
  o = vec4(at(0.0, 0.0) * 0.125 + corners * 0.03125 + sides * 0.0625 + inner * 0.125, 1.0);
}`;

/** A smooth 3 by 3 enlargement of a smaller level (u_texel is one of its pixels), times u_weight. */
const BLOOM_TENT_GLSL = `
vec3 tent(sampler2D tex, vec2 uv, vec2 texel) {
  vec3 sum = texture(tex, uv).rgb * 4.0;
  sum += (texture(tex, uv + vec2(texel.x, 0.0)).rgb + texture(tex, uv - vec2(texel.x, 0.0)).rgb
    + texture(tex, uv + vec2(0.0, texel.y)).rgb + texture(tex, uv - vec2(0.0, texel.y)).rgb) * 2.0;
  sum += texture(tex, uv + texel).rgb + texture(tex, uv - texel).rgb
    + texture(tex, uv + vec2(texel.x, -texel.y)).rgb + texture(tex, uv + vec2(-texel.x, texel.y)).rgb;
  return sum / 16.0;
}
`;

/**
 * Bloom, step 3: adds the next smaller level, enlarged, to a level (the
 * renderer draws it with add blending). Going from the smallest level up,
 * each level gathers all the smaller ones, so the largest level holds the
 * whole glow: bright near the light and soft far from it.
 */
export const BLOOM_UP_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_weight;
${BLOOM_TENT_GLSL}
void main() { o = vec4(tent(u_tex, v_uv, u_texel) * u_weight, 1.0); }`;

/** Bloom, step 4: the picture plus u_amount times the glow (the first level, enlarged). */
export const BLOOM_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform sampler2D u_picture;
uniform float u_amount;
${BLOOM_TENT_GLSL}
${COVER_GLSL}
/* The glow is added light (see addLight). */
void main() {
  o = addLight(texture(u_picture, v_uv), u_amount * tent(u_tex, v_uv, u_texel));
}`;

/**
 * Particles, step 1: moves every particle one frame on. Each texel of the
 * state textures is one particle: u_motion holds its place (0 to 1 across
 * the screen) and its speed (screen heights per second), u_life its age
 * and life span (seconds) and a fixed random number, u_color the color it
 * took at birth. An age below 0 is a particle that waits to be born.
 *
 * A particle that comes to the end of its life (or leaves the screen) is
 * born again at once: it tries a few random spots of the picture and takes
 * the first one at least as bright as u_level. When no spot is bright
 * enough, it waits a short time and tries again, so a picture with few
 * bright spots emits fewer particles. A new particle starts in a random
 * direction at about u_speed. Gravity, a moving swirl of noise
 * (turbulence) and drag then change its speed.
 */
export const PARTICLE_STEP_SHADER = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) out vec4 o_motion;
layout(location = 1) out vec4 o_life;
layout(location = 2) out vec4 o_color;
uniform highp sampler2D u_motion;
uniform highp sampler2D u_life;
uniform highp sampler2D u_color;
uniform sampler2D u_picture;
/* 1 on the first frame: every particle starts to wait for a random part of one life span, so they are not all born at once. */
uniform int u_reset;
uniform uint u_frame;
uniform int u_side;
/* Animation seconds since the last frame, and the animation time (the swirl moves with it). */
uniform float u_dt;
uniform float u_time;
/* The screen's width over its height. */
uniform float u_aspect;
uniform float u_level;
uniform float u_lifeTime;
uniform float u_speed;
/* In screen heights per second, each second. */
uniform vec2 u_gravity;
uniform float u_turbulence;
uniform float u_drag;
/**
 * How fast a particle turns to the picture's edge, from 0 (a turn rate of
 * 8 per second) to 1 (800 per second: at once).
 */
uniform float u_follow;
/* How strongly a particle is pulled to the middle of its edge (0: not at all, 1: up to "reach" in each frame). */
uniform float u_cling;

uint hashU(uint x) {
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}
/* A random number from 0 to 1; each call moves "state" on. */
float random(inout uint state) {
  state = hashU(state);
  return float(state >> 8) / 16777216.0;
}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec2 gradient(vec2 cell) {
  float angle = 6.2831853 * fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  return vec2(cos(angle), sin(angle));
}
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(gradient(i), f), dot(gradient(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(gradient(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(gradient(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
}
/* The swirl: the noise's slope turned a quarter turn, so it flows around the noise's hills and never bunches the particles up. */
vec2 swirl(vec2 p) {
  const float e = 0.01;
  float dx = gnoise(p + vec2(e, 0.0)) - gnoise(p - vec2(e, 0.0));
  float dy = gnoise(p + vec2(0.0, e)) - gnoise(p - vec2(0.0, e));
  return vec2(dy, -dx) / (2.0 * e);
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  uint index = uint(cell.y * u_side + cell.x);
  uint rng = hashU(index * 1973u + u_frame * 9277u + 1u);
  vec4 motion = texelFetch(u_motion, cell, 0);
  vec4 life = texelFetch(u_life, cell, 0);
  vec4 color = texelFetch(u_color, cell, 0);
  if (u_reset == 1) {
    o_motion = vec4(0.0);
    o_life = vec4(-random(rng) * u_lifeTime, 1.0, random(rng), 0.0);
    o_color = vec4(0.0);
    return;
  }
  float age = life.x + u_dt;
  bool waiting = life.x < 0.0;
  if (waiting && age < 0.0) {
    o_motion = motion;
    o_life = vec4(age, life.yzw);
    o_color = color;
    return;
  }
  if (waiting || age >= life.y) {
    for (int attempt = 0; attempt < 8; attempt++) {
      vec2 spot = vec2(random(rng), random(rng));
      vec3 picture = textureLod(u_picture, spot, 0.0).rgb;
      if (luma(picture) < u_level) continue;
      float angle = 6.2831853 * random(rng);
      float speed = u_speed * (0.5 + random(rng));
      o_motion = vec4(spot, cos(angle) * speed, sin(angle) * speed);
      o_life = vec4(0.0, u_lifeTime * (0.5 + random(rng)), life.z, 0.0);
      o_color = vec4(picture, 1.0);
      return;
    }
    o_motion = vec4(0.0);
    o_life = vec4(-0.02 - random(rng) * 0.25 * u_lifeTime, 1.0, life.z, 0.0);
    o_color = vec4(0.0);
    return;
  }
  /* The swirl works in screen heights, so its whirls are round on any screen shape. */
  vec2 place = vec2(motion.x * u_aspect, motion.y);
  vec2 flow = swirl(place * 3.0 + vec2(0.11, -0.07) * u_time) + 0.5 * swirl(place * 6.1 + vec2(-0.13, 0.17) * u_time + 5.3);
  vec2 velocity = motion.zw + (u_gravity + u_turbulence * flow) * u_dt;
  velocity *= exp(-u_drag * u_dt);
  /**
   * Follow (always on): the particle turns toward the edge of the picture under it,
   * the line of equal brightness through its place, and keeps its speed.
   * Of the two ways along the edge it takes the one nearer its own way, so
   * it does not turn back. Where the picture is flat there is no edge, and
   * the particle goes on as before. The picture moves under it each frame,
   * so it follows the animation.
   */
  /* Cling's move to the middle of the edge, in screen heights (see below). */
  vec2 cling = vec2(0.0);
  {
    const float reach = 0.004;
    vec2 across = vec2(reach / u_aspect, 0.0);
    vec2 up = vec2(0.0, reach);
    vec2 slope = vec2(
      luma(textureLod(u_picture, motion.xy + across, 0.0).rgb) - luma(textureLod(u_picture, motion.xy - across, 0.0).rgb),
      luma(textureLod(u_picture, motion.xy + up, 0.0).rgb) - luma(textureLod(u_picture, motion.xy - up, 0.0).rgb)) / (2.0 * reach);
    float steepness = length(slope);
    if (steepness > 1e-3) {
      vec2 along = vec2(-slope.y, slope.x) / steepness;
      if (dot(along, velocity) < 0.0) along = -along;
      float speed = max(length(velocity), 0.5 * u_speed);
      float turn = (1.0 - exp(-8.0 * pow(100.0, u_follow) * u_dt)) * smoothstep(0.5, 4.0, steepness);
      velocity = mix(velocity, along * speed, turn);
      /**
       * Cling: the middle of the edge is where the brightness changes
       * fastest. Across the edge (along "normal"), the change of the slope
       * there is 0; on the side where the slope still grows, the middle is
       * ahead. So the particle moves that way, by up to "reach" in each
       * frame, less as the slope grows more slowly.
       */
      if (u_cling > 0.0) {
        vec2 normal = slope / steepness;
        vec2 offset = normal * reach * vec2(1.0 / u_aspect, 1.0);
        float here = luma(textureLod(u_picture, motion.xy, 0.0).rgb);
        float ahead = luma(textureLod(u_picture, motion.xy + offset, 0.0).rgb);
        float behind = luma(textureLod(u_picture, motion.xy - offset, 0.0).rgb);
        float bend = (ahead + behind - 2.0 * here) / (reach * reach);
        cling = normal * clamp(bend * reach / steepness, -1.0, 1.0) * reach * u_cling * smoothstep(0.5, 4.0, steepness);
      }
    }
  }
  vec2 next = motion.xy + (velocity * u_dt + cling) * vec2(1.0 / u_aspect, 1.0);
  /* A particle that leaves the screen ends its life, to be born again on the next frame. */
  bool outside = any(lessThan(next, vec2(-0.05))) || any(greaterThan(next, vec2(1.05)));
  o_motion = vec4(next, velocity);
  o_life = vec4(outside ? life.y : age, life.yzw);
  o_color = color;
}`;

/**
 * Particles, step 2: what each particle's look shares (see the two drawing
 * shaders below): its state, its size and color settings, and the life
 * gradient.
 */
const PARTICLE_LOOK_GLSL = `uniform highp sampler2D u_motion;
uniform highp sampler2D u_life;
uniform highp sampler2D u_color;
uniform int u_side;
uniform float u_size;
uniform float u_maxSize;
uniform float u_opacity;
/* How much the color comes from the life gradient instead of the picture (0: all from the picture). */
uniform float u_gradient;
out vec4 v_color;

/* The life gradient's stops (2 to 8), in order of place: each stop's place from 0 to 1, and its color. */
uniform int u_stopCount;
uniform float u_stopAt[8];
uniform vec3 u_stopColor[8];

/**
 * The life gradient, from birth (0) to the end of life (1): the colors of
 * the two stops around t, mixed in a straight line, and the end stops'
 * colors past them (as gradientColorAt in params.ts).
 */
vec3 lifeColor(float t) {
  if (t <= u_stopAt[0]) return u_stopColor[0];
  for (int i = 1; i < 8; i++) {
    if (i >= u_stopCount) break;
    if (t <= u_stopAt[i]) {
      float span = u_stopAt[i] - u_stopAt[i - 1];
      return mix(u_stopColor[i - 1], u_stopColor[i], span > 0.0 ? (t - u_stopAt[i - 1]) / span : 1.0);
    }
  }
  return u_stopColor[clamp(u_stopCount - 1, 0, 7)];
}
`;

/**
 * Particles, step 2, Dot: draws each living particle as one point at its
 * place (gl_VertexID picks its texel). It fades in over the first tenth of
 * its life and out over the last two fifths. Its fixed random number makes
 * it 0.6 to 1.4 times u_size. A particle smaller than a pixel is drawn one
 * pixel wide but fainter, so small sizes still look smaller.
 */
export const PARTICLE_VERTEX_SHADER = `#version 300 es
precision highp float;
precision highp int;
${PARTICLE_LOOK_GLSL}
void main() {
  ivec2 cell = ivec2(gl_VertexID % u_side, gl_VertexID / u_side);
  vec4 life = texelFetch(u_life, cell, 0);
  float t = life.x / life.y;
  if (life.x < 0.0 || t >= 1.0) {
    gl_Position = vec4(-10.0, -10.0, 0.0, 1.0);
    gl_PointSize = 1.0;
    v_color = vec4(0.0);
    return;
  }
  vec4 motion = texelFetch(u_motion, cell, 0);
  float fade = smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.6, 1.0, t));
  float size = u_size * (0.6 + 0.8 * life.z);
  gl_Position = vec4(motion.xy * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = clamp(size, 1.0, u_maxSize);
  /**
   * The gradient runs over the part of the life that shows: from the middle
   * of the fade-in (t = 0.05) to t = 0.75, where the fade-out still leaves
   * about two thirds of the light. Over the whole life, the last color
   * would show only as the particle goes dark.
   */
  float sweep = clamp((t - 0.05) / 0.7, 0.0, 1.0);
  vec3 color = mix(texelFetch(u_color, cell, 0).rgb, lifeColor(sweep), u_gradient);
  v_color = vec4(color, fade * u_opacity * min(1.0, size * size));
}`;

/**
 * Particles, step 2, the other shapes (see PARTICLE_SHAPE_SHADER): each
 * living particle is a small rectangle (an instance; gl_InstanceID picks
 * its texel), with the same fade, size and color as a Dot. A Line lies
 * along the particle's motion, and longer the faster it moves: 2 sizes
 * plus the way it goes in 60 ms. A Ring's radius is u_ringRadius (with the
 * same 0.6 to 1.4 spread as the size), and its line is half a size wide
 * (v_half is then its outer radius and its line width). v_px is the place in the rectangle in
 * pixels from its center, along and across it; v_half is the shape's half
 * size. The rectangle is 1 pixel larger on each side, for the soft edge.
 */
export const PARTICLE_QUAD_SHADER = `#version 300 es
precision highp float;
precision highp int;
${PARTICLE_LOOK_GLSL}
uniform vec2 u_res;
uniform int u_shape;
uniform float u_ringRadius;
out vec2 v_px;
out vec2 v_half;
void main() {
  ivec2 cell = ivec2(gl_InstanceID % u_side, gl_InstanceID / u_side);
  vec4 life = texelFetch(u_life, cell, 0);
  float t = life.x / life.y;
  v_px = vec2(0.0);
  v_half = vec2(1.0);
  if (life.x < 0.0 || t >= 1.0) {
    gl_Position = vec4(-10.0, -10.0, 0.0, 1.0);
    v_color = vec4(0.0);
    return;
  }
  vec4 motion = texelFetch(u_motion, cell, 0);
  float fade = smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.6, 1.0, t));
  float size = u_size * (0.6 + 0.8 * life.z);
  /* The velocity is in screen heights a second on both axes, so it is a direction in pixels as it is. */
  vec2 dir = vec2(1.0, 0.0);
  if (u_shape == 1) {
    float speed = length(motion.zw);
    float spin = 6.2831853 * life.z;
    dir = speed > 1e-5 ? motion.zw / speed : vec2(cos(spin), sin(spin));
    v_half = 0.5 * vec2(max(1.0, size * 2.0 + speed * u_res.y * 0.06), max(1.0, size * 0.25));
  } else {
    float band = max(1.0, size * 0.5);
    float radius = max(u_ringRadius * (0.6 + 0.8 * life.z), band * 0.5);
    v_half = vec2(radius + band * 0.5, band);
  }
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  v_px = corner * (u_shape == 2 ? vec2(v_half.x + 1.0) : v_half + 1.0);
  vec2 offset = dir * v_px.x + vec2(-dir.y, dir.x) * v_px.y;
  gl_Position = vec4(motion.xy * 2.0 - 1.0 + offset * 2.0 / u_res, 0.0, 1.0);
  float sweep = clamp((t - 0.05) / 0.7, 0.0, 1.0);
  vec3 color = mix(texelFetch(u_color, cell, 0).rgb, lifeColor(sweep), u_gradient);
  v_color = vec4(color, fade * u_opacity * min(1.0, size * size));
}`;

/** A soft round dot, full at its center and gone at its edge, with premultiplied alpha. */
export const PARTICLE_SHADER = `#version 300 es
precision highp float;
in vec4 v_color;
/**
 * Boost, from 1 up. The dot covers more: its strength is multiplied by the
 * boost (up to full), and its light falls off more slowly from the center,
 * (1 - d^2)^(2 / boost): a soft dot at 1, a firm center with a soft edge at
 * 8. And its color gets brighter by the boost, but only until its
 * brightest channel is full, so the color keeps its hue and does not go
 * white.
 */
uniform float u_boost;
out vec4 o;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(p, p);
  if (d2 > 1.0) discard;
  float boost = max(u_boost, 1.0);
  float a = min(1.0, v_color.a * boost) * pow(1.0 - d2, 2.0 / boost);
  float peak = max(max(v_color.r, v_color.g), v_color.b);
  vec3 color = v_color.rgb * min(boost, 1.0 / max(peak, 1e-3));
  o = vec4(color * a, a);
}`;

/**
 * Particles, the other shapes (see PARTICLE_QUAD_SHADER), with premultiplied
 * alpha and a soft edge 1 pixel wide. A Line is brighter at its head than at
 * its tail. A Ring's band is its line width (at least 1 pixel). Boost
 * works as on a Dot: more cover, and a brighter color up to the full
 * channel.
 */
export const PARTICLE_SHAPE_SHADER = `#version 300 es
precision highp float;
/* The same int precision as PARTICLE_QUAD_SHADER, which shares u_shape. */
precision highp int;
in vec4 v_color;
in vec2 v_px;
in vec2 v_half;
uniform int u_shape;
uniform float u_boost;
out vec4 o;
void main() {
  float boost = max(u_boost, 1.0);
  vec2 inside = clamp(v_half - abs(v_px) + 0.5, 0.0, 1.0);
  float cover;
  if (u_shape == 1) {
    cover = inside.x * inside.y * mix(0.25, 1.0, clamp(0.5 + 0.5 * v_px.x / v_half.x, 0.0, 1.0));
  } else if (u_shape == 2) {
    float band = v_half.y;
    cover = clamp(0.5 - (abs(length(v_px) - (v_half.x - band * 0.5)) - band * 0.5), 0.0, 1.0);
  } else {
    cover = inside.x * inside.y;
  }
  float a = min(1.0, v_color.a * boost) * cover;
  if (a <= 0.0) discard;
  float peak = max(max(v_color.r, v_color.g), v_color.b);
  o = vec4(v_color.rgb * min(boost, 1.0 / max(peak, 1e-3)) * a, a);
}`;

/**
 * Light Cycles, step 1: a small copy of the picture for the cycles on the
 * CPU (see drawCycles). Each pixel of the copy is the mean of 16 points of
 * the picture under it, so a fine pattern does not flicker in the copy.
 */
export const CYCLE_SAMPLE_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
/* One pixel of the copy, as a part of the picture's size. */
uniform vec2 u_step;
void main() {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    for (int j = 0; j < 4; j++) sum += texture(u_tex, v_uv + (vec2(i, j) - 1.5) * 0.25 * u_step).rgb;
  }
  o = vec4(clamp(sum / 16.0, 0.0, 1.0), 1.0);
}`;

/**
 * Light Cycles, step 2: one line segment (or one head) per instance, from
 * a_ends.xy to a_ends.zw in screen heights (see writeInstances in
 * cycles.ts). The quad covers the segment and its round ends, with one more
 * pixel for the smooth edge.
 */
export const CYCLE_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec4 a_ends;
layout(location = 2) in vec4 a_colorA;
layout(location = 3) in vec4 a_colorB;
/* The radius in screen heights, 1 for a soft head dot, and the place on the gradient at the start and at the end. */
layout(location = 4) in vec4 a_shape;
uniform float u_aspect;
/* One pixel, in screen heights. */
uniform float u_pixel;
out vec2 v_place;
flat out vec4 v_ends;
flat out vec4 v_colorA;
flat out vec4 v_colorB;
flat out vec4 v_shape;
void main() {
  vec2 a = a_ends.xy;
  vec2 ab = a_ends.zw - a;
  float span = length(ab);
  vec2 along = span > 1e-7 ? ab / span : vec2(1.0, 0.0);
  vec2 across = vec2(-along.y, along.x);
  float reach = max(a_shape.x, 0.5 * u_pixel) + u_pixel;
  vec2 place = a + ab * (a_pos.x * 0.5 + 0.5) + along * a_pos.x * reach + across * a_pos.y * reach;
  v_place = place;
  v_ends = a_ends;
  v_colorA = a_colorA;
  v_colorB = a_colorB;
  v_shape = a_shape;
  gl_Position = vec4(place.x / u_aspect * 2.0 - 1.0, place.y * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * A round-ended line with a smooth edge one pixel wide, or a soft round
 * head dot, with premultiplied alpha. A line thinner than a pixel is drawn
 * one pixel wide but fainter.
 *
 * Its color goes from the start's to the end's along the segment (the
 * picture's colors), mixed by u_gradient with the gradient's color. The
 * place on the gradient comes from the instance (one per cycle, or by age
 * along the trail), or from the place on the screen: along u_direction
 * from one side of the screen to the other, or by the distance from
 * u_center (to the farthest corner from the screen center). u_repeat and
 * u_shift then move it, and it goes out and back along the gradient, so
 * the colors never jump.
 */
export const CYCLE_SHADER = `#version 300 es
precision highp float;
in vec2 v_place;
flat in vec4 v_ends;
flat in vec4 v_colorA;
flat in vec4 v_colorB;
flat in vec4 v_shape;
uniform float u_aspect;
uniform float u_pixel;
/* 0 one color per cycle, 1 along the trail, 2 linear on the screen, 3 radial on the screen (see CyclePaint). */
uniform int u_paint;
uniform float u_gradient;
uniform float u_shift;
uniform float u_repeat;
uniform vec2 u_direction;
uniform vec2 u_center;
/* The gradient's stops (2 to 8), in order of place: each stop's place from 0 to 1, and its color. */
uniform int u_stopCount;
uniform float u_stopAt[8];
uniform vec3 u_stopColor[8];
out vec4 o;

/* The gradient's color at t (0 to 1), as gradientColorAt in params.ts. */
vec3 gradientColor(float t) {
  if (t <= u_stopAt[0]) return u_stopColor[0];
  for (int i = 1; i < 8; i++) {
    if (i >= u_stopCount) break;
    if (t <= u_stopAt[i]) {
      float span = u_stopAt[i] - u_stopAt[i - 1];
      return mix(u_stopColor[i - 1], u_stopColor[i], span > 0.0 ? (t - u_stopAt[i - 1]) / span : 1.0);
    }
  }
  return u_stopColor[clamp(u_stopCount - 1, 0, 7)];
}

void main() {
  vec2 a = v_ends.xy;
  vec2 ab = v_ends.zw - a;
  float span2 = dot(ab, ab);
  float t = span2 > 0.0 ? clamp(dot(v_place - a, ab) / span2, 0.0, 1.0) : 0.0;
  float d = length(v_place - (a + ab * t));
  float radius = max(v_shape.x, 0.5 * u_pixel);
  float cover;
  if (v_shape.y > 0.5) {
    float k = clamp(1.0 - d / radius, 0.0, 1.0);
    cover = k * k;
  } else {
    cover = clamp((radius - d) / u_pixel + 0.5, 0.0, 1.0) * min(1.0, 2.0 * v_shape.x / u_pixel);
  }
  vec4 color = mix(v_colorA, v_colorB, t);
  if (u_gradient > 0.0) {
    float g;
    vec2 middle = vec2(0.5 * u_aspect, 0.5);
    if (u_paint == 2) {
      /* Half the screen's extent along the direction, so the gradient spans the screen at any angle. */
      float half_ = 0.5 * (abs(u_direction.x) * u_aspect + abs(u_direction.y));
      g = (dot(v_place - middle, u_direction) / half_ * 0.5 + 0.5) * u_repeat;
    } else if (u_paint == 3) {
      g = length(v_place - u_center) / length(middle) * u_repeat;
    } else {
      g = mix(v_shape.z, v_shape.w, t);
    }
    /* Out and back: 0 to 1 on even trips, 1 to 0 on odd ones; a shift of 1 is one whole trip out and back. */
    float x = g + 2.0 * u_shift;
    g = 1.0 - abs(1.0 - 2.0 * fract(x * 0.5));
    color.rgb = mix(color.rgb, gradientColor(g), u_gradient);
  }
  float alpha = color.a * cover;
  o = vec4(color.rgb * alpha, alpha);
}`;

/**
 * Light Cycles, step 3: the lines (premultiplied, see CYCLE_SHADER) over the
 * picture, which is dimmed by u_background, with the blend mode u_blend
 * (see blendLayer), at u_opacity.
 */
export const CYCLE_MIX_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_picture;
uniform sampler2D u_lines;
uniform float u_background;
uniform float u_opacity;
uniform int u_blend;
/* The same layer blends as the shape steps' (see blendLayer in KALEIDO_SHADER). */
vec3 blendLayer(vec3 base, vec3 top, int mode) {
  if (mode == 1) return 1.0 - (1.0 - base) * (1.0 - top);
  if (mode == 2) return base * top;
  if (mode == 3) return mix(2.0 * base * top, 1.0 - 2.0 * (1.0 - base) * (1.0 - top), step(0.5, base));
  if (mode == 4) return abs(base - top);
  if (mode == 5) return max(base, top);
  if (mode == 6) return min(base, top);
  if (mode == 7) return min(base + top, 1.0);
  return top;
}
${COVER_GLSL}
void main() {
  /* The picture carries its cover (premultiplied); Background dims its color; the lines are marks, so they add cover. */
  vec4 picture = texture(u_picture, v_uv);
  vec3 base = straight(picture) * u_background;
  vec4 lines = texture(u_lines, v_uv);
  vec3 top = lines.a > 0.0 ? lines.rgb / lines.a : vec3(0.0);
  float mark = lines.a * u_opacity;
  o = covered(mix(base, blendLayer(base, top, u_blend), mark), mix(picture.a, 1.0, mark));
}`;

/**
 * 3D Object (see docs/SOLIDS.md): one shape over the picture. Each pixel
 * sends a ray from the viewer (EYE screen heights in front of the screen);
 * rays that miss a sphere around the shape show the background at once.
 * The others walk the shape's distance function. The shapes are in a unit
 * frame (about -1 to 1), turned by u_turn and scaled to u_size / 2.
 *
 * Roundness: the box shrinks by the round radius and grows back by it, so
 * its edges get round and its size stays. The flat-faced shapes are their
 * planes' maximum; Roundness turns that into a smooth maximum, which rounds
 * the edges and corners. For the blobs and the star it is how softly their
 * parts merge.
 *
 * Map: Wrap reads the picture at a place on the surface (in the shape's own
 * frame, so it turns with the shape; flat on each face, blended over the
 * round edges, see wrapAt); Project reads it at the pixel's own
 * place, moved by the normal (a lens); Mirror reads it in the direction of
 * the reflected ray (a chrome shape). Every read goes out and back across
 * the picture (mirrored), so no seam shows.
 *
 * Light: a soft shade from the angle to the light, a highlight, and a soft
 * shadow that the shape casts on the picture behind it (see castLight).
 * The outline is smooth: a ray that passes within a pixel of the shape
 * covers the pixel in part.
 */
export const SOLID_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform float u_aspect;
/* One pixel, in screen heights. */
uniform float u_pixel;
uniform int u_shape;
uniform int u_map;
uniform int u_blend;
uniform float u_opacity;
uniform float u_background;
uniform float u_size;
uniform float u_round;
/* Morph's squareness, the number of blobs, the wobbly ball's bumps and waves, the star's spike length, and the animation time (see the shapes). */
uniform float u_morph;
uniform float u_blobs;
uniform float u_bumps;
uniform float u_waves;
uniform float u_spikes;
uniform float u_spikeTip;
uniform float u_spikeCount;
/* The Menger sponge's levels of holes (1 to 5; between two whole numbers the next level's holes grow). */
uniform float u_levels;
uniform float u_time;
/* From the shape's own frame to the view. */
uniform mat3 u_turn;
uniform vec2 u_center;
uniform float u_bend;
uniform float u_frost;
uniform float u_tiles;
/* Toward the light, in the view. */
uniform vec3 u_light;
uniform float u_shading;
uniform float u_shine;
uniform float u_shadow;
/**
 * The picture behind the shape: the same as u_tex, or with Freeze background
 * the picture kept at the 3D Object's place in the FX list, while u_tex,
 * which paints the shape, went on through the steps after it.
 */
uniform sampler2D u_back;

const float PI = 3.14159265359;
const float EYE = 3.0;
const int STEPS = 96;

vec3 blendLayer(vec3 base, vec3 top, int mode) {
  if (mode == 1) return 1.0 - (1.0 - base) * (1.0 - top);
  if (mode == 2) return base * top;
  if (mode == 3) return mix(2.0 * base * top, 1.0 - 2.0 * (1.0 - base) * (1.0 - top), step(0.5, base));
  if (mode == 4) return abs(base - top);
  if (mode == 5) return max(base, top);
  if (mode == 6) return min(base, top);
  if (mode == 7) return min(base + top, 1.0);
  return top;
}
${COVER_GLSL}

/* Out and back across 0 to 1, so a read past the picture's edge is mirrored and has no seam. */
vec2 fold(vec2 uv) { return 1.0 - abs(1.0 - 2.0 * fract(uv * 0.5)); }

/* The round radius in the unit frame. */
float radius() { return u_round * 0.6; }

float box(vec3 q) {
  float r = radius();
  vec3 d = abs(q) - vec3(0.8 - r);
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0) - r;
}
/* A smooth smallest: two distances that blend into each other within k. */
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
/**
 * Morph (a superellipsoid): the points at one "p-distance" from the middle.
 * Squareness sets p: 0.75 at 0 (a star with points on the axes), 2 at
 * about 0.38 (a ball), 10 at 1 (a rounded cube). Below 2 the formula
 * overstates the distance, so the walk trusts it less there. Its slope is
 * no help: near the star's diagonals it is small and the estimate
 * overshoots. Near Squareness 0 the soft shadow can show faint bands.
 */
float morph(vec3 q) {
  float p = exp2(mix(-0.415, 3.32, clamp(u_morph, 0.0, 1.0)));
  vec3 a = abs(q) + 1e-5;
  float l = pow(pow(a.x, p) + pow(a.y, p) + pow(a.z, p), 1.0 / p);
  return (l - 0.8) * (p < 2.0 ? 0.6 * pow(3.0, 0.5 - 1.0 / p) : 1.0);
}
/**
 * Blobs: up to 8 balls that drift on slow loops with the animation time
 * and merge smoothly; Roundness sets how softly. A count between two whole
 * numbers grows the last blob from nothing.
 */
float blobs(vec3 q) {
  float n = clamp(u_blobs, 1.0, 8.0);
  float k = 0.08 + radius() * 0.6;
  float t = u_time;
  float d = 1e9;
  for (int i = 0; i < 8; i++) {
    float f = float(i);
    float size = 0.3 * clamp(n - f, 0.0, 1.0);
    if (size < 0.005) break;
    vec3 c = 0.55 * vec3(sin(t * 0.37 + f * 2.1), sin(t * 0.29 + f * 1.3 + 1.0), sin(t * 0.23 + f * 2.9 + 2.0));
    d = smin(d, length(q - c) - size, k);
  }
  return d;
}
/** The wobbly ball: waves over a ball that flow with the animation time; Bumps sets their height, Waves how many. */
float wobbly(vec3 q) {
  float height = clamp(u_bumps, 0.0, 1.0) * 0.22;
  float f = u_waves;
  float t = u_time * 0.8;
  float w = sin(f * q.x + t) * sin(f * q.y + t * 1.3) * sin(f * q.z + t * 0.7);
  /* The waves steepen the surface, so the walk trusts the distance less. */
  return (length(q) - 0.8 - height * w) / (1.0 + height * f * 1.8);
}
/**
 * One spike of the star: a cone cut off flat (the usual capped cone) from
 * the middle along "axis", "tall" long, "wide" across at its foot and
 * "top" across at its end (0 is a point).
 */
float spike(vec3 q, vec3 axis, float tall, float wide, float top) {
  float y = dot(q, axis);
  float half_ = tall * 0.5;
  vec2 p = vec2(length(q - axis * y), y - half_);
  vec2 k1 = vec2(top, half_);
  vec2 k2 = vec2(top - wide, tall);
  vec2 ca = vec2(p.x - min(p.x, p.y < 0.0 ? wide : top), abs(p.y) - half_);
  vec2 cb = p - k1 + k2 * clamp(dot(k1 - p, k2) / dot(k2, k2), 0.0, 1.0);
  float s = cb.x < 0.0 && ca.y < 0.0 ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}
/**
 * The direction of spike "i" of "n": the corners of an octahedron (6), a
 * cube (8), an icosahedron (12) or a dodecahedron (20), so those counts are
 * fully even; other counts take even places on a spiral over the ball (a
 * Fibonacci sphere).
 */
vec3 spikeAxis(int i, int n) {
  const float g = 1.61803399;
  if (n == 6) {
    vec3 axis = i < 2 ? vec3(1.0, 0.0, 0.0) : i < 4 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
    return (i & 1) == 0 ? axis : -axis;
  }
  if (n == 8 || (n == 20 && i < 8)) return normalize(vec3(i & 1, (i >> 1) & 1, (i >> 2) & 1) * 2.0 - 1.0);
  if (n == 12 || n == 20) {
    int j = n == 20 ? i - 8 : i;
    int a = j / 3;
    int b = j - a * 3;
    vec2 s = vec2(a & 1, (a >> 1) & 1) * 2.0 - 1.0;
    /* The dodecahedron's other 12 corners: the cyclic turns of (0, ±1/g, ±g). */
    vec2 c = n == 20 ? s * vec2(1.0 / g, g) : vec2(s.x, s.y * g);
    return normalize(b == 0 ? vec3(0.0, c.x, c.y) : b == 1 ? vec3(c.x, c.y, 0.0) : vec3(c.y, 0.0, c.x));
  }
  float y = 1.0 - 2.0 * (float(i) + 0.5) / float(n);
  float r = sqrt(max(1.0 - y * y, 0.0));
  float turn = float(i) * 2.39996323;
  return vec3(cos(turn) * r, y, sin(turn) * r);
}
/**
 * The star: Spikes (4 to 32) spikes around a ball, thinner as there are
 * more. Spike length 0 keeps each spike inside the ball (its end corner on
 * the ball's surface), so the star is a smooth ball; 1 makes them 1.15
 * long. Spike shape goes from pointed (0) to capped (1); Roundness rounds
 * them. A spike that is clearly farther than the nearest part so far (its
 * axis's distance less its width) is not worked out, so many spikes stay
 * cheap.
 */
float star(vec3 q) {
  const float CORE = 0.5;
  int n = int(clamp(floor(u_spikeCount + 0.5), 4.0, 32.0));
  float wide = clamp(0.26 * sqrt(12.0 / float(n)), 0.1, 0.4);
  float top = wide * clamp(u_spikeTip, 0.0, 1.0);
  float tall = mix(sqrt(CORE * CORE - top * top), 1.15, clamp(u_spikes, 0.0, 1.0));
  float k = 0.02 + radius() * 0.5;
  float d = length(q) - CORE;
  for (int i = 0; i < 32; i++) {
    if (i >= n) break;
    vec3 axis = spikeAxis(i, n);
    float far = length(q - axis * clamp(dot(q, axis), 0.0, tall)) - wide;
    if (far > d + k) continue;
    d = smin(d, spike(q, axis, tall, wide, top), k);
  }
  return d * 0.8;
}

/**
 * The Menger sponge: a cube (as large as the box) with a cross of three
 * bars of holes through it, then through each of its 20 remaining small
 * cubes, and so on for Levels levels. Each bar is a third of its small
 * cube wide. Roundness sets the bars' cross-section: square at 0 (the
 * classic sponge), round at 1, a rounded square between (a mix of the two
 * distances). For the last level, a part of a level makes its bars
 * thinner, so a range on Levels opens the holes smoothly.
 */
float menger(vec3 q) {
  vec3 p = q / 0.8;
  vec3 b = abs(p) - 1.0;
  float d = length(max(b, 0.0)) + min(max(b.x, max(b.y, b.z)), 0.0);
  float levels = clamp(u_levels, 1.0, 5.0);
  float round_ = clamp(u_round, 0.0, 1.0);
  float s = 1.0;
  for (int m = 0; m < 5; m++) {
    float part = clamp(levels - float(m), 0.0, 1.0);
    if (part <= 0.0) break;
    /* The place in the small cube, 0 at its middle, 1 at its sides. */
    vec3 u = 1.0 - abs(mod(p * s, 2.0) - 1.0);
    vec3 square = vec3(max(u.x, u.y), max(u.y, u.z), max(u.z, u.x));
    vec3 circle = vec3(length(u.xy), length(u.yz), length(u.zx));
    vec3 bars = mix(square, circle, round_);
    float cross_ = min(bars.x, min(bars.y, bars.z)) - part / 3.0;
    d = max(d, -cross_ / s);
    s *= 3.0;
  }
  return d * 0.8;
}

/*
 * A shape with flat faces: the largest of its planes' distances, or with
 * Roundness a smooth largest (log of a sum of exponentials), which rounds
 * the edges and corners where planes meet.
 */
float faces(float d[20], int count) {
  float m = d[0];
  for (int i = 1; i < 20; i++) if (i < count) m = max(m, d[i]);
  float k = radius() * 0.3;
  if (k < 1e-3) return m;
  float sum = 0.0;
  for (int i = 0; i < 20; i++) if (i < count) sum += exp((d[i] - m) / k);
  return m + k * log(sum);
}
/*
 * The face planes of the shapes with flat faces (u_shape 6 to 8): each
 * plane's outward direction (of length 1) and its distance from the middle.
 * The distance to the shape and Wrap both read them.
 */
int facePlanes(out vec3 normal[20], out float offset[20]) {
  if (u_shape == 6) {
    /* The octahedron: the eight directions (±1, ±1, ±1). */
    for (int i = 0; i < 8; i++) {
      normal[i] = normalize(vec3(i & 1, (i >> 1) & 1, (i >> 2) & 1) * 2.0 - 1.0);
      offset[i] = 0.62;
    }
    return 8;
  }
  if (u_shape == 7) {
    /* The icosahedron's 20 face directions are a dodecahedron's corners: (±1, ±1, ±1) and the cyclic turns of (0, ±1/g, ±g). */
    const float g = 1.61803399;
    int n = 0;
    for (int i = 0; i < 8; i++) normal[n++] = normalize(vec3(i & 1, (i >> 1) & 1, (i >> 2) & 1) * 2.0 - 1.0);
    for (int i = 0; i < 4; i++) {
      vec2 s = vec2(i & 1, (i >> 1) & 1) * 2.0 - 1.0;
      vec2 a = s * vec2(1.0 / g, g);
      normal[n++] = normalize(vec3(0.0, a.x, a.y));
      normal[n++] = normalize(vec3(a.x, a.y, 0.0));
      normal[n++] = normalize(vec3(a.y, 0.0, a.x));
    }
    for (int i = 0; i < 20; i++) offset[i] = 0.82;
    return 20;
  }
  /* A square pyramid: its tip at y = 0.9, its base at y = -0.7, 0.95 from the middle to each side. */
  vec2 side = normalize(vec2(1.6, 0.95));
  normal[0] = vec3(side.x, side.y, 0.0);
  normal[1] = vec3(-side.x, side.y, 0.0);
  normal[2] = vec3(0.0, side.y, side.x);
  normal[3] = vec3(0.0, side.y, -side.x);
  for (int i = 0; i < 4; i++) offset[i] = side.y * 0.9;
  normal[4] = vec3(0.0, -1.0, 0.0);
  offset[4] = 0.7;
  return 5;
}

/* The distance to a shape with flat faces: the largest of its planes' distances (see faces). */
float flatShape(vec3 q) {
  vec3 normal[20];
  float offset[20];
  float d[20];
  int count = facePlanes(normal, offset);
  for (int i = 0; i < 20; i++) d[i] = i < count ? dot(q, normal[i]) - offset[i] : -1e9;
  return faces(d, count);
}

/* The distance from a point in the unit frame to the shape, and how much to trust it (the smooth maximum can overstate it). */
float unitShape(vec3 q) {
  if (u_shape == 0) return length(q) - 0.95;
  if (u_shape == 1) return box(q);
  if (u_shape == 2) return morph(q);
  if (u_shape == 3) return blobs(q);
  if (u_shape == 4) return wobbly(q);
  if (u_shape == 5) return star(q);
  if (u_shape == 9) return menger(q);
  return flatShape(q) * 0.7;
}

float scale() { return 0.5 * u_size; }

/* A point of the view to the shape's unit frame. */
vec3 toShape(vec3 p) { return transpose(u_turn) * (p - vec3(u_center, 0.0)) / scale(); }

float scene(vec3 p) { return unitShape(toShape(p)) * scale(); }

vec3 normalAt(vec3 p, float e) {
  const vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * scene(p + k.xyy * e) + k.yyx * scene(p + k.yyx * e) + k.yxy * scene(p + k.yxy * e) + k.xxx * scene(p + k.xxx * e));
}

/* A read of the picture at a place of the surface, with Tiles and the mirrored fold. */
vec3 readAt(vec2 uv) { return straight(texture(u_tex, fold(uv * u_tiles))); }

/* The picture lying flat on a face with this outward direction, across the face. */
vec2 onFace(vec3 q, vec3 axis) {
  vec3 t1 = normalize(cross(abs(axis.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), axis));
  vec3 t2 = cross(axis, t1);
  return vec2(dot(q, t1), dot(q, t2)) * 0.6 + 0.5;
}

/*
 * Wrap: the picture's color at a point of the surface, in the shape's
 * frame. A face lays the picture flat on it, across the face, along
 * directions set by the face itself, so the picture does not turn with the
 * curve of a round edge. Where Roundness curves one face into the next, the
 * faces' pictures blend by how much the surface faces each one: the box by
 * its normal (Morph too), and the shapes with flat faces by the same
 * weights that round their edges (see faces). The ball, the blobs, the
 * wobbly ball and the star take the ball's map: around and up.
 */
vec3 wrapAt(vec3 q, vec3 n) {
  float around = atan(q.z, q.x) / (2.0 * PI) + 0.5;
  if (u_shape == 0 || u_shape == 3 || u_shape == 4 || u_shape == 5) {
    vec3 d = normalize(q);
    return readAt(vec2(around * 2.0, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5));
  }
  if (u_shape == 1 || u_shape == 2 || u_shape == 9) {
    /* The box (Morph and the Menger sponge too): each axis's face, weighted by a high power of the normal, so a flat face reads only itself. */
    vec3 w = pow(abs(n), vec3(8.0));
    w /= w.x + w.y + w.z;
    vec3 color = vec3(0.0);
    if (w.x > 0.01) color += w.x * readAt(onFace(q, vec3(sign(n.x), 0.0, 0.0)));
    if (w.y > 0.01) color += w.y * readAt(onFace(q, vec3(0.0, sign(n.y), 0.0)));
    if (w.z > 0.01) color += w.z * readAt(onFace(q, vec3(0.0, 0.0, sign(n.z))));
    return color / max(dot(w, step(0.01, w)), 1e-4);
  }
  /* The shapes with flat faces: each face's picture, weighted as the smooth maximum weights its plane. */
  vec3 normal[20];
  float offset[20];
  float d[20];
  int count = facePlanes(normal, offset);
  float m = -1e9;
  int best = 0;
  for (int i = 0; i < 20; i++) {
    d[i] = i < count ? dot(q, normal[i]) - offset[i] : -1e9;
    if (d[i] > m) { m = d[i]; best = i; }
  }
  float k = radius() * 0.3;
  if (k < 1e-3) return readAt(onFace(q, normal[best]));
  vec3 color = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 20; i++) {
    if (i >= count) break;
    float w = exp((d[i] - m) / k);
    if (w < 0.01) continue;
    color += w * readAt(onFace(q, normal[i]));
    total += w;
  }
  return color / total;
}

/**
 * The cast shadow: the picture is a wall a little behind the shape (WALL
 * shape sizes behind its middle), and a ray from this place on the wall
 * goes toward the light. How near it passes to the shape makes the soft
 * edge (the usual soft shadow of a distance function): 1 is in full
 * light, 0 in full shadow. Only rays that cross the sphere around the
 * shape walk it. So the shadow always has the outline the shape casts, and
 * turns with it.
 */
float castLight(vec2 screen) {
  const float WALL = 0.9;
  const float SOFT = 5.0;
  vec3 from = vec3(screen, -WALL * scale());
  vec3 oc = from - vec3(u_center, 0.0);
  float bound = 1.45 * scale();
  float b = dot(oc, u_light);
  float h = b * b - (dot(oc, oc) - bound * bound);
  if (h <= 0.0) return 1.0;
  float end = -b + sqrt(h);
  if (end <= 0.0) return 1.0;
  float t = max(-b - sqrt(h), 0.02 * scale());
  float light = 1.0;
  float before = 1e9;
  /**
   * The closest the ray comes to the shape between two samples is
   * estimated from both samples' distances (the improved soft shadow), so
   * the edge does not show bands where the samples happen to land.
   */
  for (int i = 0; i < 100; i++) {
    float d = scene(from + u_light * t);
    float y = d * d / (2.0 * before);
    float side = sqrt(max(d * d - y * y, 0.0));
    light = min(light, SOFT * side / max(t - y, 1e-4));
    before = d;
    if (light < 0.001) return 0.0;
    t += clamp(d, 0.01 * scale(), 0.25 * scale());
    if (t > end) break;
  }
  return smoothstep(0.0, 1.0, clamp(light, 0.0, 1.0));
}

void main() {
  vec2 screen = vec2((v_uv.x - 0.5) * u_aspect, v_uv.y - 0.5);
  /* The picture carries its cover (premultiplied): Background and the shadow dim its color; the shape covers it. */
  vec4 picture = texture(u_back, v_uv);
  vec3 base = straight(picture) * u_background;
  vec3 eye = vec3(0.0, 0.0, EYE);
  vec3 rd = normalize(vec3(screen, 0.0) - eye);

  if (u_shadow > 0.0) base *= 1.0 - u_shadow * 0.75 * (1.0 - castLight(screen));

  /* The sphere around the shape: rays that miss it miss the shape. */
  vec3 oc = eye - vec3(u_center, 0.0);
  float b = dot(oc, rd);
  float bound = 1.45 * scale();
  float h = b * b - (dot(oc, oc) - bound * bound);
  float cover = 0.0;
  vec3 color = vec3(0.0);
  if (h > 0.0) {
    float t = max(-b - sqrt(h), 0.0);
    float end = -b + sqrt(h);
    /* The nearest the ray comes to the shape, in pixels, and where. */
    float nearest = 1e9;
    float nearestT = t;
    bool hit = false;
    for (int i = 0; i < STEPS; i++) {
      float d = scene(eye + rd * t);
      float footprint = u_pixel * t / EYE;
      if (d / footprint < nearest) {
        nearest = d / footprint;
        nearestT = t;
      }
      if (d < footprint * 0.25) {
        hit = true;
        break;
      }
      t += d;
      if (t > end) break;
    }
    cover = hit ? 1.0 : clamp(1.0 - nearest, 0.0, 1.0);
    if (cover > 0.0) {
      float at = hit ? t : nearestT;
      vec3 p = eye + rd * at;
      vec3 n = normalAt(p, max(u_pixel * at / EYE * 0.5, 1e-4));
      if (u_map == 1) {
        vec2 lens = v_uv + n.xy * u_bend * 0.3 * vec2(1.0 / u_aspect, 1.0);
        if (u_frost > 0.001) {
          /**
           * Frost: frosted glass. The picture is read at 16 places in a
           * disk around the lens point (up to 0.05 screen heights across at
           * Frost 1), turned by a random angle that sticks to the surface,
           * so it is soft and grainy and the grain turns with the shape.
           * The glass scatters light, so it also looks a little milky.
           */
          vec3 grainAt = toShape(p) * 731.0;
          float spin = 6.2831853 * fract(sin(dot(grainAt, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float reach = u_frost * u_frost * 0.05;
          vec3 sum = vec3(0.0);
          for (int k = 0; k < 16; k++) {
            float angle = float(k) * 2.39996323 + spin;
            vec2 tap = vec2(cos(angle), sin(angle)) * sqrt((float(k) + 0.5) / 16.0) * reach;
            sum += straight(texture(u_tex, fold(lens + tap * vec2(1.0 / u_aspect, 1.0))));
          }
          color = mix(sum / 16.0, vec3(1.0), u_frost * 0.12);
        } else {
          color = straight(texture(u_tex, fold(lens)));
        }
      } else if (u_map == 2) {
        vec3 r = reflect(rd, n);
        color = straight(texture(u_tex, vec2(abs(atan(r.x, -r.z)) / PI, asin(clamp(r.y, -1.0, 1.0)) / PI + 0.5)));
      } else {
        color = wrapAt(toShape(p), transpose(u_turn) * n);
      }
      float lit = mix(1.0, 0.18 + 0.82 * max(dot(n, u_light), 0.0), u_shading);
      float shine = pow(max(dot(reflect(-u_light, n), -rd), 0.0), 40.0) * u_shine;
      color = color * lit + shine;
    }
  }
  float shown = cover * u_opacity;
  o = covered(mix(base, blendLayer(base, color, u_blend), shown), mix(picture.a, 1.0, shown));
}`;

