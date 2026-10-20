/**
 * The stitch as a WGSL render pass: a full-screen triangle whose fragments are the equirectangular
 * output pixels.
 *
 * @remarks It applies the reference stitch (`renderEquirectangular` in the core) to the numbers
 * `packStitch` lays out, slot for slot: the output direction rotated by the correction, each lens
 * projected by the equidistant model (and again through the tabulated rolling-shutter turn of the
 * row it lands on), the overlap weighted by each lens's margin eased in over the overlap's width,
 * and each lens's colour devignetted, scaled by its gain and shifted by the seam colour field. The
 * angle from the optical axis is taken as `atan2` of the sine and cosine rather than `acos`, which
 * keeps single precision accurate near the lens centre. Lens images come from up to two textures,
 * sampled linearly with canvas pixels at texel centres; outside its image a lens reads black, as in
 * the reference.
 */
export const STITCH_SHADER = /* wgsl */ `
const PI = 3.141592653589793;
const HEADER = 3u;
const LENS_SLOTS = 6u;

@group(0) @binding(0) var<storage, read> stitch: array<vec4f>;
@group(0) @binding(1) var lensSampler: sampler;
@group(0) @binding(2) var image0: texture_2d<f32>;
@group(0) @binding(3) var image1: texture_2d<f32>;

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

fn rotate(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

fn lensSlot(lens: u32, offset: u32) -> vec4f {
  return stitch[HEADER + lens * LENS_SLOTS + offset];
}

struct Landing {
  pixel: vec2f,
  angle: f32,
}

fn land(lens: u32, direction: vec3f) -> Landing {
  let inLens = rotate(lensSlot(lens, 0u), direction);
  let optics = lensSlot(lens, 1u);
  let angle = atan2(length(inLens.xy), inLens.z);
  let azimuth = atan2(inLens.y, inLens.x);
  let r = optics.z * angle;
  return Landing(optics.xy + r * vec2f(cos(azimuth), sin(azimuth)), angle);
}

fn shutterTurn(lens: u32, row: f32) -> vec4f {
  let steps = u32(stitch[1].w);
  let rows = lensSlot(lens, 2u).w;
  let along = clamp(row / rows, 0.0, 1.0) * f32(steps - 1u);
  let step = min(u32(floor(along)), steps - 1u);
  let next = min(step + 1u, steps - 1u);
  let table = HEADER + u32(stitch[1].z) * LENS_SLOTS + lens * steps;
  let a = stitch[table + step];
  var b = stitch[table + next];
  if (dot(a, b) < 0.0) {
    b = -b;
  }
  return normalize(mix(a, b, along - f32(step)));
}

fn lookThrough(lens: u32, direction: vec3f) -> Landing {
  let atFrame = land(lens, direction);
  if (u32(stitch[1].w) == 0u) {
    return atFrame;
  }
  return land(lens, rotate(shutterTurn(lens, atFrame.pixel.y), direction));
}

fn readImage(lens: u32, pixel: vec2f) -> vec3f {
  let placement = lensSlot(lens, 3u);
  let texture = u32(lensSlot(lens, 2u).z);
  var size = vec2f(textureDimensions(image0));
  if (texture == 1u) {
    size = vec2f(textureDimensions(image1));
  }
  let uv = (pixel - placement.xy) / placement.zw + 0.5 / size;
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) {
    return vec3f(0.0);
  }
  if (texture == 1u) {
    return textureSampleLevel(image1, lensSampler, uv, 0.0).rgb;
  }
  return textureSampleLevel(image0, lensSampler, uv, 0.0).rgb;
}

fn corrected(lens: u32, pixel: vec2f) -> vec3f {
  let optics = lensSlot(lens, 1u);
  let colour = lensSlot(lens, 4u);
  let reach = distance(pixel, optics.xy) / optics.w;
  let beyond = max(0.0, reach * reach - lensSlot(lens, 5u).x);
  return readImage(lens, pixel) * exp(colour.w * beyond) * colour.rgb;
}

fn seamShift(lens: u32, direction: vec3f) -> vec3f {
  let bins = u32(stitch[2].x);
  let lensCount = u32(stitch[1].z);
  let width = stitch[2].y;
  if (bins == 0u || lensCount != 2u || lens > 1u) {
    return vec3f(0.0);
  }
  let offset = (land(0u, direction).angle - land(1u, direction).angle) / 2.0;
  if (abs(offset) >= width) {
    return vec3f(0.0);
  }
  let inFirst = rotate(lensSlot(0u, 0u), direction);
  let count = f32(bins);
  let unwrapped = ((atan2(inFirst.y, inFirst.x) + PI) / (2.0 * PI)) * count - 0.5;
  let position = unwrapped - floor(unwrapped / count) * count;
  let lower = u32(floor(position)) % bins;
  let table = HEADER + lensCount * LENS_SLOTS + lensCount * u32(stitch[1].w);
  let difference = mix(
    stitch[table + lower].rgb,
    stitch[table + (lower + 1u) % bins].rgb,
    position - floor(position),
  );
  let fade = pow(cos(PI / 2.0 * offset / width), 2.0);
  return difference * select(-0.5, 0.5, lens == 0u) * fade;
}

fn easedMargin(lens: u32, margin: f32) -> f32 {
  let feather = 2.0 * lensSlot(lens, 2u).y - PI;
  if (margin < 0.0 || !(feather > 0.0)) {
    return margin;
  }
  let t = clamp(margin / feather, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

fn outputDirection(position: vec2f) -> vec3f {
  let size = stitch[1].xy;
  let longitude = PI - (position.x / size.x) * 2.0 * PI;
  let latitude = PI / 2.0 - (position.y / size.y) * PI;
  return vec3f(cos(latitude) * cos(longitude), cos(latitude) * sin(longitude), sin(latitude));
}

@fragment
fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let direction = rotate(stitch[0], outputDirection(position.xy));
  let lensCount = u32(stitch[1].z);
  var colour = vec3f(0.0);
  var total = 0.0;
  var seen = 0.0;
  for (var lens = 0u; lens < lensCount; lens++) {
    let landing = lookThrough(lens, direction);
    let margin = easedMargin(lens, lensSlot(lens, 2u).y - landing.angle);
    if (margin < 0.0) {
      continue;
    }
    let sampled = corrected(lens, landing.pixel) + seamShift(lens, direction);
    colour += margin * sampled;
    total += margin;
    seen += 1.0;
  }
  if (seen == 0.0) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  if (total <= 0.0) {
    return vec4f(evenSplit(direction, lensCount), 1.0);
  }
  return vec4f(colour / total, 1.0);
}

fn evenSplit(direction: vec3f, lensCount: u32) -> vec3f {
  var colour = vec3f(0.0);
  var seen = 0.0;
  for (var lens = 0u; lens < lensCount; lens++) {
    let landing = lookThrough(lens, direction);
    if (lensSlot(lens, 2u).y - landing.angle < 0.0) {
      continue;
    }
    colour += corrected(lens, landing.pixel) + seamShift(lens, direction);
    seen += 1.0;
  }
  return colour / seen;
}
`;
