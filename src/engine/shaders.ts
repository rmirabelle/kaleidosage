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
 * The shape steps of this pass in the order they move the screen point:
 * 0 = warp, 1 = complex map, 2 = kaleidoscope fold. This is the reverse of
 * the panel list, because moving the point that is read is the reverse of
 * moving the picture: the last step here is the first to act on the
 * picture. Only the first u_shapeCount entries are used.
 */
uniform int u_shapeOrder[3];
uniform int u_shapeCount;
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
/* Seamless spiral: the twist, and the whole number of image copies one turn holds, 0 for a slant (see seamlessSpiral). */
uniform float u_mapArms;
uniform float u_spiralCopies;
uniform float u_mapTwist;
/* The direction of the axis that power, log spiral and tunnel fold over (see complexMap). */
uniform vec2 u_mapAxis;
uniform float u_mapTravel;
uniform float u_tunnelTwist;
uniform float u_mapFog;
uniform int u_warpMode;
uniform float u_warpAmount;
uniform float u_warpScale;
/* Cells warp: the cell size, in tenths of the screen height, and the turn of the whole cell pattern (radians). */
uniform float u_warpCellSize;
uniform float u_warpCellAngle;
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
    /* The cell pattern turns by u_warpCellAngle: the point is turned back into it, and the shift turned out again. */
    vec2 x = turn(p, -u_warpCellAngle) * 10.0 / u_warpCellSize;
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
    return turn(amount * 0.25 * vec2(cos(h.x * TAU + t), sin(h.y * TAU + t * 0.7)), u_warpCellAngle);
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
    vec2 l = vec2(log(max(length(onAxis), 1e-6)), atan(onAxis.y, onAxis.x));
    w = seamlessSpiral(l, n == 0.0 ? k : (abs(k) < 1e-4 ? 1e-4 : k), n);
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

/**
 * Reads an image at the folded point q, mirrored at its edges, with texture
 * detail g. The picture made so far (u_picture) is placed the way it was on
 * the screen, so a point that no step moves reads the same pixel.
 */
vec3 sampleImage(sampler2D image, vec2 size, vec2 q, float g) {
  float aspect = size.x / size.y;
  vec2 uv = q * vec2(1.0 / aspect, 1.0) + 0.5 + u_offset;
  if (u_picture == 1) uv += u_center;
  uv = 1.0 - abs(1.0 - mod(uv, 2.0));
  return textureGrad(image, uv, vec2(g / aspect, 0.0), vec2(0.0, g)).rgb;
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

vec2 fold(vec2 p) {
  float r = length(p);
  float a = atan(p.y, p.x) + u_rotation + u_twirl * r;
  foldAltWeight = 0.0;
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
  if (u_picture == 1) return sampleImage(u_img, u_imgRes, q, g);
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
  /**
   * The seamless spiral meets itself only if nothing moves the point after
   * it (a fold or warp after it would not repeat the way it does), so it is
   * always the last step to move the point, whatever the order in the list.
   */
  bool spiralLast = u_mapMode == 7 && (skip & 2) == 0;
  /* During the radial crossfade (see fold), a second point, with no fold, goes through the later steps too. */
  bool fading = false;
  vec2 p2 = p;
  float fade = 0.0;
  for (int i = 0; i < 3; i++) {
    if (i >= u_shapeCount) break;
    int shapeStep = u_shapeOrder[i];
    if ((skip & (1 << shapeStep)) != 0) continue;
    if (shapeStep == 0) {
      if (u_warpMode != 0) {
        p += warpOffset(p);
        if (fading) p2 += warpOffset(p2);
      }
    } else if (shapeStep == 1) {
      if (spiralLast) continue;
      p = complexMap(p);
      if (fading) p2 = complexMap(p2);
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
   * The spiral's own jump would show in the measured detail as a thin blur
   * line, so the detail is measured on the point before the spiral, then
   * multiplied by how much the spiral stretches it there (its size divided
   * by the distance from the center, mixed by the map mix).
   */
  vec2 beforeSpiral = p;
  float stretch = 1.0;
  if (spiralLast) {
    p = complexMap(p);
    if (fading) p2 = complexMap(p2);
    mapped = true;
    /* The spiral's size, larger where the stretch squeezes the image or the slant tilts it. */
    float aspect = u_imgRes.x / u_imgRes.y;
    float twist = abs(u_mapArms);
    float squeeze = u_spiralCopies == 0.0 ? sqrt(1.0 + aspect * aspect * twist * twist) : max(1.0, u_spiralCopies / max(twist, 0.5));
    float spiralSize = length(vec2(2.0 * aspect * twist, 2.0)) / TAU * squeeze;
    stretch = mix(1.0, spiralSize / max(length(beforeSpiral), 1e-4), u_mapMix);
  }
  /**
   * Texture detail follows how much the steps stretch the screen; with a
   * fold it is measured before the fold, because the fold makes the angle
   * jump. It is capped, so the jumps at a map's cut lines and poles do not
   * blur seams. Explicit gradients avoid seams at the fold.
   */
  vec2 measured = folded ? beforeFold : (spiralLast ? beforeSpiral : p);
  float g = min(max(length(dFdx(measured)), length(dFdy(measured))), g0 * 4.0) / (folded ? u_zoom : 1.0) * stretch;
  vec3 color = sourceColor(p, g);
  if (fading) color = mix(color, sourceColor(p2, g), fade);
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
    if (i >= u_shapeCount) break;
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
 * Branches: a fractal tree made of the picture. The trunk is a strip of the
 * picture, u_trunk high and u_width × u_trunk wide, standing on the base
 * point u_base. The branches grow from the joint, u_joint × u_trunk up the
 * trunk. Each of the 1 to 4 branches is a smaller copy (u_scale) of the
 * whole tree, turned around the joint to its own angle (the angles spread
 * evenly over u_spread, all turned by u_turn). So each branch has a trunk
 * and branches of its own, joined at its own joint, without end. The trunk
 * shows the middle of the picture, at the picture's own proportions, as
 * large as it must be to cover the whole trunk: u_fit screen heights for
 * the picture's height. So a trunk wider than the picture never reads past
 * the picture's edges.
 * The trunk narrows toward its top, by u_taper: at 1 its top is as wide as
 * the bottom of the branches that grow from it (u_scale × its bottom), so
 * each branch starts as wide as the trunk under it ends. The picture
 * narrows with it.
 *
 * Each pixel undoes the branch moves, level by level, and takes its color
 * from the first trunk it lands on, so the edges stay sharp. A search keeps
 * the points still to test on a stack; a point that cannot be in the tree
 * (farther from the base point than u_radius, the tree's size) is dropped.
 * A trunk covers the branches that grow from it, and a later branch covers
 * an earlier one. The search stops at u_depth levels, where a trunk is
 * smaller than a pixel. The trunks of the first u_hide levels do not show:
 * the search goes on through them to the branches, so the tree keeps its
 * shape without its root. Where no trunk is, the picture shows, darkened to
 * u_background. u_opacity is how much the tree shows; each level shows
 * u_fade less and turns its colors u_hue more. Points and lengths are in
 * screen heights from the screen center.
 */
export const BRANCH_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform int u_count;
uniform float u_scale;
uniform float u_spread;
uniform float u_turn;
uniform float u_trunk;
uniform float u_width;
uniform float u_joint;
uniform float u_taper;
uniform float u_fit;
uniform float u_opacity;
uniform float u_background;
uniform float u_fade;
uniform float u_hue;
uniform vec2 u_base;
uniform float u_radius;
uniform int u_depth;
uniform int u_hide;
/* The detail level (mip level) the trunk reads at level 0; each level down reads one step smaller (u_lodStep). */
uniform float u_lod;
uniform float u_lodStep;

const int STACK = 48;

vec2 turn(vec2 v, float a) { return vec2(v.x * cos(a) - v.y * sin(a), v.x * sin(a) + v.y * cos(a)); }

vec3 hueShift(vec3 c, float h) {
  const vec3 k = vec3(0.57735);
  float ca = cos(h);
  return c * ca + cross(k, c) * sin(h) + k * dot(k, c) * (1.0 - ca);
}

void main() {
  float aspect = u_res.x / u_res.y;
  vec3 back = texture(u_tex, v_uv).rgb * u_background;
  float angles[4];
  for (int i = 0; i < 4; i++) {
    angles[i] = u_turn + (u_count > 1 ? u_spread * (float(i) / float(u_count - 1) - 0.5) : 0.0);
  }
  float halfWidth = u_width * u_trunk * 0.5;
  float topWidth = mix(1.0, u_scale, u_taper);
  vec2 joint = vec2(0.0, u_joint * u_trunk);
  /* Points from the base point, in screen heights. */
  vec2 points[STACK];
  int levels[STACK];
  points[0] = (v_uv - 0.5) * vec2(aspect, 1.0) - u_base;
  levels[0] = 0;
  int top = 1;
  vec3 color = back;
  for (int visit = 0; visit < 200; visit++) {
    if (top == 0) break;
    top--;
    vec2 point = points[top];
    int level = levels[top];
    /* The trunk's half width at this height: from halfWidth at the bottom to topWidth × halfWidth at the top. */
    float height = point.y / u_trunk;
    float narrow = mix(1.0, topWidth, clamp(height, 0.0, 1.0));
    if (level >= u_hide && abs(point.x) <= halfWidth * narrow && height >= 0.0 && height <= 1.0) {
      /* The picture's middle covers the trunk, at the picture's proportions; it narrows with the trunk. */
      vec2 uv = vec2(0.5 + point.x / narrow / (u_fit * aspect), 0.5 + (point.y - u_trunk * 0.5) / u_fit);
      float depth = float(level);
      vec3 trunk = hueShift(textureLod(u_tex, uv, u_lod + depth * u_lodStep).rgb, u_hue * depth);
      color = mix(back, trunk, u_opacity * pow(1.0 - u_fade, depth));
      break;
    }
    if (level >= u_depth) continue;
    /* Pushed first is tested last, so the last branch is tested first and covers the others. */
    for (int i = 0; i < 4; i++) {
      if (i >= u_count || top >= STACK) break;
      vec2 inside = turn(point - joint, -angles[i]) / u_scale;
      if (dot(inside, inside) > u_radius * u_radius) continue;
      points[top] = inside;
      levels[top] = level + 1;
      top++;
    }
  }
  o = vec4(clamp(color, 0.0, 1.0), 1.0);
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
  vec3 current = texture(u_current, v_uv).rgb;
  /* Level 0: the old frame has blurred mip levels while the flow runs (see drawTrails). */
  vec3 previous = textureLod(u_previous, uv, 0.0).rgb;
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

float levelAt(vec2 uv) { return texture(u_field, uv).r * u_lines; }

void main() {
  vec3 color = texture(u_tex, v_uv).rgb;
  float level = levelAt(v_uv);
  vec2 slope = vec2(
    levelAt(v_uv + vec2(u_texel.x, 0.0)) - levelAt(v_uv - vec2(u_texel.x, 0.0)),
    levelAt(v_uv + vec2(0.0, u_texel.y)) - levelAt(v_uv - vec2(0.0, u_texel.y))) * 0.5;
  float change = length(slope);
  float pixels = abs(fract(level + 0.5) - 0.5) / max(change, 1e-5);
  /* A flat area has no contour, even when its brightness sits exactly on a level (pure black or white). */
  float line = (1.0 - smoothstep(u_width * 0.5 - 0.5, u_width * 0.5 + 0.5, pixels)) * smoothstep(0.0, 0.004, change);
  o = vec4(mix(color, blendLayer(color, u_color, u_blend), line * u_amount), 1.0);
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

vec3 slot(int age) {
  int layer = (u_head - age + u_slots) % u_slots;
  return texture(u_history, vec3(v_uv, float(layer))).rgb;
}

void main() {
  vec3 now = texture(u_tex, v_uv).rgb;
  float age = pattern(v_uv, now) * u_delay;
  vec3 past;
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
  o = vec4(mix(now, past, u_amount), 1.0);
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
