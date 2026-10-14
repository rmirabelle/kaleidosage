export const VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

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
export const KALEIDO_SHADER = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D u_img;
uniform sampler2D u_img2;
uniform vec2 u_imgRes2;
uniform float u_blend;
uniform int u_blendMode;
uniform vec2 u_res;
uniform float u_pad;
uniform vec2 u_center;
uniform vec2 u_imgRes;
uniform float u_segments;
uniform int u_foldMode;
/**
 * The shape steps in the order they move the screen point: 0 = warp,
 * 1 = complex map, 2 = kaleidoscope fold. This is the reverse of the panel
 * list, because moving the point that is read is the reverse of moving the
 * picture: the last step here is the first to act on the picture.
 */
uniform int u_shapeOrder[3];
/* The opacity and blend mode of each shape step, by step code (warp, map, fold). */
uniform float u_shapeOpacity[3];
uniform int u_shapeBlend[3];
uniform float u_tileSize;
uniform float u_rotation;
uniform float u_zoom;
uniform float u_twirl;
uniform vec2 u_offset;
uniform int u_mapMode;
uniform float u_mapMix;
uniform float u_mapScale;
uniform float u_mapPower;
uniform vec2 u_mapPoint;
uniform int u_mapSteps;
uniform float u_mapTwist;
/* The direction of the axis that power, log spiral and tunnel fold over (see complexMap). */
uniform vec2 u_mapAxis;
uniform float u_mapTravel;
uniform float u_tunnelTwist;
uniform float u_mapFog;
uniform int u_warpMode;
uniform float u_warpAmount;
uniform float u_warpScale;
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
 * waves, whirlpools or cells are (larger is closer), and u_warpTime (which
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
    vec2 x = p * u_warpScale * 1.5;
    vec2 cell = floor(x);
    vec2 nearest = cell;
    float best = 1e9;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 id = cell + vec2(float(i), float(j));
        vec2 point = id + 0.5 + 0.35 * hash2(id + 17.0);
        float dist = dot(x - point, x - point);
        if (dist < best) {
          best = dist;
          nearest = id;
        }
      }
    }
    vec2 h = hash2(nearest);
    return amount * 0.25 * vec2(cos(h.x * TAU + t), sin(h.y * TAU + t * 0.7));
  }
  return noiseWarp(p);
}

/**
 * Bends the screen point through a complex function before the fold.
 * 1 = power z^n, 2 = Mobius (moves the point "a" to the center), 3 = Julia
 * (z = z^2 + c, a few steps), 4 = log spiral (an endless tunnel), 5 = sine,
 * 6 = tunnel (a tube that the view flies through).
 * Map mix blends from the plain point (0) to the bent point (1).
 */
vec2 complexMap(vec2 p) {
  if (u_mapMode == 0) return p;
  vec2 z = p * u_mapScale;
  vec2 w = z;
  /**
   * Power, log spiral and tunnel use the size of the angle, which folds the
   * picture over an axis. The point is turned first, so the axis lies at
   * the axis angle instead of always flat.
   */
  vec2 onAxis = vec2(dot(z, u_mapAxis), dot(z, vec2(-u_mapAxis.y, u_mapAxis.x)));
  if (u_mapMode == 1) {
    w = cpowSeamless(onAxis, u_mapPower);
  } else if (u_mapMode == 2) {
    vec2 a = u_mapPoint;
    w = cdiv(z - a, vec2(1.0, 0.0) - cmul(vec2(a.x, -a.y), z));
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
    vec2 before = w;
    bool stopped = false;
    for (int i = 0; i < u_mapSteps; i++) {
      before = w;
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
      w = mix(before, w, below / (past + below + 1e-6));
    }
  } else if (u_mapMode == 4) {
    /* The size of the angle, as in cpowSeamless: the cut on the left of the center then closes. */
    vec2 l = vec2(log(max(length(onAxis), 1e-6)), abs(atan(onAxis.y, onAxis.x)));
    float c = cos(u_mapTwist);
    float s = sin(u_mapTwist);
    w = mat2(c, s, -s, c) * l * 0.5;
  } else if (u_mapMode == 5) {
    w = csin(z * PI) / PI;
  } else if (u_mapMode == 6) {
    /**
     * Tunnel: the angle goes around the wall, and 1/r is the distance into
     * the tube, so the center is endlessly far away. u_mapTravel moves the
     * view forward; twist turns the wall more with distance (a spiral).
     * The size of the angle is used, as in cpowSeamless, so there is no seam.
     */
    float depth = 0.3 / max(length(onAxis), 1e-4) + u_mapTravel;
    float around = abs(atan(onAxis.y, onAxis.x)) / PI + depth * u_tunnelTwist / PI;
    w = vec2(around, depth);
  }
  return mix(p, w, u_mapMix);
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

/** Reads an image at the folded point q, mirrored at its edges, with texture detail g. */
vec3 sampleImage(sampler2D image, vec2 size, vec2 q, float g) {
  float aspect = size.x / size.y;
  vec2 uv = q * vec2(1.0 / aspect, 1.0) + 0.5 + u_offset;
  uv = 1.0 - abs(1.0 - mod(uv, 2.0));
  return textureGrad(image, uv, vec2(g / aspect, 0.0), vec2(0.0, g)).rgb;
}

/**
 * Turns a point (rotation, and twirl, which turns more with distance), folds
 * it into mirrored wedges or tiles, and zooms it into image space.
 */
vec2 fold(vec2 p) {
  float r = length(p);
  float a = atan(p.y, p.x) + u_rotation + u_twirl * r;
  if (u_foldMode == 0) {
    /**
     * Radial: mirrored wedges around one center. A count between two whole
     * numbers (a drifting range) goes through a circle: from 5 to 6, the five
     * wedges flatten evenly until every angle shows the same ray of the
     * image (rings), then six wedges grow evenly out of the rings. The
     * picture keeps its full symmetry the whole way. "g" is the place across
     * a wedge (0 at its center line, 1 at its edges), and "s" is how much of
     * the wedge pattern shows: 1 at a whole number, 0 halfway.
     */
    if (u_segments >= 1.0) {
      float whole = floor(u_segments);
      float t = u_segments - whole;
      float seg = TAU / (t < 0.5 ? whole : whole + 1.0);
      float g = abs(mod(a, seg) - seg * 0.5) / (seg * 0.5);
      float s = abs(cos(PI * t));
      a = PI / u_segments * (0.5 + s * (g - 0.5));
    }
    return vec2(cos(a), sin(a)) * r / u_zoom;
  }
  /**
   * Tiles: the turned plane is cut into hexagon cells, and each cell is
   * folded around its center. Mirrors every 60 degrees (fold mode 1) make
   * equilateral triangles; mirrors every 30 degrees (mode 2) make the
   * hexagon pattern. Both sets of mirrors include the cell edges, so
   * neighbor cells meet with no seam.
   */
  vec2 local = hexLocal(vec2(cos(a), sin(a)) * r / u_tileSize);
  float seg = u_foldMode == 1 ? TAU / 3.0 : TAU / 6.0;
  float b = abs(mod(atan(local.y, local.x), seg) - seg * 0.5);
  return vec2(cos(b), sin(b)) * length(local) * u_tileSize / u_zoom;
}

/** Both source images at a point, faded into each other by the image blend. An image that the blend does not show is not read. */
vec3 sourceColor(vec2 q, float g) {
  vec3 color = vec3(0.0);
  if (u_blend < 1.0) color = sampleImage(u_img, u_imgRes, q, g);
  if (u_blend > 0.0) {
    vec3 second = sampleImage(u_img2, u_imgRes2, q, g);
    float amount = u_blend;
    if (u_blendMode == 1) {
      /**
       * A brightness level falls from above white (blend 0) to below black
       * (blend 1). Where the second image is brighter than the level, it
       * shows; a soft edge keeps the change from looking jagged.
       */
      const float SOFT = 0.12;
      float level = 1.0 - u_blend * (1.0 + SOFT);
      amount = smoothstep(level, level + SOFT, dot(second, vec3(0.2126, 0.7152, 0.0722)));
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

/**
 * The picture with the shape steps in the order the user set, leaving out
 * the steps whose bit is set in "skip" (bit = step code). A warp before the
 * fold breaks the symmetry; a warp after it bends the image inside each
 * wedge, so the symmetry stays. A map after the fold bends the folded picture.
 */
vec3 shapeColor(vec2 screen, int skip, float g0) {
  vec2 p = screen;
  vec2 beforeFold = screen;
  bool folded = false;
  bool mapped = false;
  for (int i = 0; i < 3; i++) {
    int shapeStep = u_shapeOrder[i];
    if ((skip & (1 << shapeStep)) != 0) continue;
    if (shapeStep == 0) {
      if (u_warpMode != 0) p += warpOffset(p);
    } else if (shapeStep == 1) {
      p = complexMap(p);
      mapped = true;
    } else {
      beforeFold = p;
      p = fold(p);
      folded = true;
    }
  }
  /**
   * Texture detail follows how much the steps stretch the screen; with a
   * fold it is measured before the fold, because the fold makes the angle
   * jump. It is capped, so the jumps at a map's cut lines and poles do not
   * blur seams. Explicit gradients avoid seams at the fold.
   */
  vec2 measured = folded ? beforeFold : p;
  float g = min(max(length(dFdx(measured)), length(dFdy(measured))), g0 * 4.0) / (folded ? u_zoom : 1.0);
  vec3 color = sourceColor(p, g);
  /* The far end of the tunnel (the center) fades to black, which makes it look deep. */
  if (mapped && u_mapMode == 6) color *= mix(1.0, smoothstep(0.0, 0.7, length(screen)), u_mapFog * u_mapMix);
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
  vec3 color = shapeColor(screen, 0, g0);
  int skipped = 0;
  for (int i = 0; i < 3; i++) {
    int shapeStep = u_shapeOrder[i];
    float opacity = u_shapeOpacity[shapeStep];
    int mode = u_shapeBlend[shapeStep];
    if (opacity >= 1.0 && mode == 0) continue;
    int without = skipped | (1 << shapeStep);
    vec3 base = shapeColor(screen, without, g0);
    color = mix(base, blendLayer(base, color, mode), opacity);
    if (opacity <= 0.0) skipped = without;
  }
  o = vec4(color, 1.0);
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
    float light = dot(textureLod(u_tex, texUv(screen), 5.0).rgb, vec3(0.2126, 0.7152, 0.0722));
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
  if (u_radius <= 0.0) {
    o = vec4(textureLod(u_tex, uv, 0.0).rgb, 1.0);
    return;
  }
  float radius = u_radius * blurMask(v_uv) * u_res.y;
  if (radius < 0.5) {
    o = vec4(textureLod(u_tex, uv, 0.0).rgb, 1.0);
    return;
  }
  float lod = log2(max(1.0, radius * 0.5));
  vec3 sum = textureLod(u_tex, uv, lod).rgb;
  float turn = ign(gl_FragCoord.xy) * TAU / 8.0;
  for (int i = 0; i < 8; i++) {
    float a = turn + float(i) * TAU / 8.0;
    sum += textureLod(u_tex, uv + vec2(cos(a), sin(a)) * radius * 0.6 / u_texSize, lod).rgb;
  }
  o = vec4(sum / 9.0, 1.0);
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
/* This frame's tint of the old trails (0 = none) and the tint color. */
uniform float u_tint;
uniform vec3 u_tintColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

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
   */
  if (u_flow != 0.0) {
    vec2 d = u_texel * 2.0;
    float gx = luma(texture(u_previous, uv + vec2(d.x, 0.0)).rgb) - luma(texture(u_previous, uv - vec2(d.x, 0.0)).rgb);
    float gy = luma(texture(u_previous, uv + vec2(0.0, d.y)).rgb) - luma(texture(u_previous, uv - vec2(0.0, d.y)).rgb);
    vec2 push = mix(vec2(gx, gy), vec2(-gy, gx), u_swirl);
    uv -= push * u_flow * u_texel;
  }
  vec3 current = texture(u_current, v_uv).rgb;
  vec3 previous = texture(u_previous, uv).rgb;
  if (u_hue != 0.0) previous = clamp(hueShift(previous, u_hue), 0.0, 1.0);
  /**
   * Trail tint: the old frame is multiplied a little toward the tint color
   * each frame, so the older a trail is, the more it takes that color and
   * the darker it gets. The new frame keeps its own colors.
   */
  if (u_tint > 0.0) previous = mix(previous, previous * u_tintColor, u_tint);
  vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  previous = mix(current, previous, inside.x * inside.y);
  vec3 color = u_mode == 2 ? max(current, previous * u_amount) : mix(current, previous, u_amount);
  o = vec4(color, 1.0);
}`;

/** Copies a texture to the screen. */
export const COPY_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
void main() { o = vec4(texture(u_tex, v_uv).rgb, 1.0); }`;

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
  vec3 color = texture(u_tex, v_uv).rgb;
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
  vec3 lit = color * diffuse + u_shine * gloss;
  o = vec4(clamp(mix(color, lit, u_relief), 0.0, 1.0), 1.0);
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

void main() {
  vec3 color = texture(u_tex, v_uv).rgb;
  if (u_sharpen > 0.0) {
    vec2 d = u_texel * u_radius;
    vec3 cross = texture(u_tex, v_uv + vec2(d.x, 0.0)).rgb + texture(u_tex, v_uv - vec2(d.x, 0.0)).rgb
      + texture(u_tex, v_uv + vec2(0.0, d.y)).rgb + texture(u_tex, v_uv - vec2(0.0, d.y)).rgb;
    vec3 corners = texture(u_tex, v_uv + d).rgb + texture(u_tex, v_uv - d).rgb
      + texture(u_tex, v_uv + vec2(d.x, -d.y)).rgb + texture(u_tex, v_uv + vec2(-d.x, d.y)).rgb;
    vec3 around = (cross + 0.5 * corners) / 6.0;
    color += u_sharpen * (color - around);
  }
  color = mix(clamp(color, 0.0, 1.0), u_overlay, u_overlayOpacity);
  color *= exp2(u_exposure);
  color = max(color - u_black, 0.0) / (1.0 - u_black);
  o = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;
