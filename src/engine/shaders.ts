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
 * screen size.
 */
export const KALEIDO_SHADER = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D u_img;
uniform vec2 u_res;
uniform float u_pad;
uniform vec2 u_center;
uniform vec2 u_imgRes;
uniform float u_segments;
uniform float u_rotation;
uniform float u_zoom;
uniform float u_twirl;
uniform float u_hue;
uniform vec2 u_offset;
uniform int u_mapMode;
uniform float u_mapMix;
uniform float u_mapScale;
uniform float u_mapPower;
uniform vec2 u_mapPoint;
uniform int u_mapSteps;
uniform float u_mapTwist;
uniform int u_warpMode;
uniform float u_warpAmount;
uniform float u_warpScale;
uniform float u_warpMarble;
uniform int u_warpDetail;
uniform float u_warpTime;
const float TAU = 6.28318530718;
const float PI = 3.14159265359;

vec3 hueShift(vec3 c, float h) {
  const vec3 k = vec3(0.57735);
  float ca = cos(h);
  return c * ca + cross(k, c) * sin(h) + k * dot(k, c) * (1.0 - ca);
}

/* Complex numbers are vec2(real, imaginary). */
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(dot(b, b), 1e-6); }
vec2 cpow(vec2 z, float n) {
  float r = length(z);
  if (r < 1e-6) return vec2(0.0);
  float t = atan(z.y, z.x) * n;
  return pow(r, n) * vec2(cos(t), sin(t));
}
vec2 clog(vec2 z) { return vec2(log(max(length(z), 1e-6)), atan(z.y, z.x)); }
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
vec2 warpOffset(vec2 p) {
  vec2 x = p * u_warpScale;
  float t = u_warpTime;
  vec2 q = vec2(fbm(x + vec2(0.0, 0.7 * t)), fbm(x + vec2(5.2, 1.3) - vec2(0.5 * t, 0.0)));
  vec2 r = vec2(
    fbm(x + u_warpMarble * q + vec2(1.7, 9.2) + 0.3 * t),
    fbm(x + u_warpMarble * q + vec2(8.3, 2.8) - 0.2 * t));
  return r * u_warpAmount;
}

/**
 * Bends the screen point through a complex function before the fold.
 * 1 = power z^n, 2 = Mobius (moves the point "a" to the center), 3 = Julia
 * (z = z^2 + c, a few steps), 4 = log spiral (an endless tunnel), 5 = sine.
 * Map mix blends from the plain point (0) to the bent point (1).
 */
vec2 complexMap(vec2 p) {
  if (u_mapMode == 0) return p;
  vec2 z = p * u_mapScale;
  vec2 w = z;
  if (u_mapMode == 1) {
    w = cpow(z, u_mapPower);
  } else if (u_mapMode == 2) {
    vec2 a = u_mapPoint;
    w = cdiv(z - a, vec2(1.0, 0.0) - cmul(vec2(a.x, -a.y), z));
  } else if (u_mapMode == 3) {
    for (int i = 0; i < u_mapSteps; i++) {
      if (dot(w, w) > 16.0) break;
      w = cmul(w, w) + u_mapPoint;
    }
  } else if (u_mapMode == 4) {
    vec2 l = clog(z);
    float c = cos(u_mapTwist);
    float s = sin(u_mapTwist);
    w = mat2(c, s, -s, c) * l * 0.5;
  } else if (u_mapMode == 5) {
    w = csin(z * PI) / PI;
  }
  return mix(p, w, u_mapMix);
}

void main() {
  vec2 screen = (gl_FragCoord.xy - u_pad - (0.5 + u_center) * u_res) / u_res.y;
  /* Warp mode 1 bends the screen before the map and the fold, so the result is not symmetric. */
  vec2 p = complexMap(u_warpMode == 1 ? screen + warpOffset(screen) : screen);
  float r = length(p);
  float a = atan(p.y, p.x) + u_rotation + u_twirl * r;
  if (u_segments >= 1.0) {
    float seg = TAU / u_segments;
    a = abs(mod(a, seg) - seg * 0.5);
  }
  vec2 q = vec2(cos(a), sin(a)) * r / u_zoom;
  /* Warp mode 2 bends the image inside each wedge, so the symmetry stays. */
  if (u_warpMode == 2) q += warpOffset(q);
  float imgAsp = u_imgRes.x / u_imgRes.y;
  vec2 uv = q * vec2(1.0 / imgAsp, 1.0) + 0.5 + u_offset;
  uv = 1.0 - abs(1.0 - mod(uv, 2.0));
  /* Explicit gradients avoid seams where the fold makes the angle jump. */
  /**
   * Texture detail follows how much the map stretches the screen. It is
   * capped, so the jumps at a map's cut lines and poles do not blur seams.
   */
  float g0 = max(length(dFdx(screen)), length(dFdy(screen)));
  float g = min(max(length(dFdx(p)), length(dFdy(p))), g0 * 4.0) / u_zoom;
  vec3 c = textureGrad(u_img, uv, vec2(g / imgAsp, 0.0), vec2(0.0, g)).rgb;
  if (u_hue != 0.0) c = clamp(hueShift(c, u_hue), 0.0, 1.0);
  o = vec4(c, 1.0);
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
uniform int u_mode;
uniform vec2 u_dir;
uniform float u_amount;
uniform int u_samples;
uniform vec2 u_center;
uniform float u_focus;
uniform float u_soft;

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  float aspect = u_res.x / u_res.y;
  vec2 p = (v_uv - 0.5 - u_center) * vec2(aspect, 1.0);
  vec2 dir = u_dir;
  if (u_mode != 0) {
    vec2 d = u_mode == 1 ? p : vec2(-p.y, p.x);
    dir = d * u_amount / vec2(aspect, 1.0);
  }
  dir *= smoothstep(u_focus, u_focus + max(u_soft, 0.001), length(p));
  float j = ign(gl_FragCoord.xy) - 0.5;
  float n = float(u_samples);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < u_samples; i++) {
    float t = (float(i) + 0.5 + j) / n - 0.5;
    vec2 screenPx = (v_uv + dir * t) * u_res;
    acc += texture(u_tex, (screenPx + u_pad) / u_texSize).rgb;
  }
  o = vec4(acc / n, 1.0);
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
  vec3 current = texture(u_current, v_uv).rgb;
  vec3 previous = texture(u_previous, uv).rgb;
  if (u_hue != 0.0) previous = clamp(hueShift(previous, u_hue), 0.0, 1.0);
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
 * it (u_radius pixels). Contrast spreads the colors away from middle gray.
 */
export const FINISH_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_sharpen;
uniform float u_radius;
uniform float u_contrast;

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
  color = (color - 0.5) * u_contrast + 0.5;
  o = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;
