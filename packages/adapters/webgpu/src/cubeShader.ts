/**
 * The cube-map render as a WGSL render pass: a full-screen triangle whose fragments are the
 * equirectangular output pixels.
 *
 * @remarks It applies the reference cube render (`renderCubeMap` in the core) to the numbers
 * `packCube` lays out: the output direction rotated by the correction, the face it leans toward
 * most (the first of equals), its equi-angular face coordinates through `atan`, and inside a seam
 * band both stored copies cross-faded across the band. Textures are sampled linearly with pixels as
 * the core gives them, a texel's centre at `+0.5`.
 */
export const CUBE_SHADER = /* wgsl */ `
const PI = 3.141592653589793;
const QUARTER_PI = 0.7853981633974483;
const HEADER = 2u;
const FACE_SLOTS = 4u;

@group(0) @binding(0) var<storage, read> cube: array<vec4f>;
@group(0) @binding(1) var cubeSampler: sampler;
@group(0) @binding(2) var texture0: texture_2d<f32>;
@group(0) @binding(3) var texture1: texture_2d<f32>;

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

fn rotate(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

fn faceSlot(face: u32, offset: u32) -> vec4f {
  return cube[HEADER + face * FACE_SLOTS + offset];
}

fn outputDirection(position: vec2f) -> vec3f {
  let size = cube[1].xy;
  let longitude = PI - (position.x / size.x) * 2.0 * PI;
  let latitude = PI / 2.0 - (position.y / size.y) * PI;
  return vec3f(cos(latitude) * cos(longitude), cos(latitude) * sin(longitude), sin(latitude));
}

fn readTexture(texture: u32, pixel: vec2f) -> vec3f {
  if (texture == 1u) {
    let uv = pixel / vec2f(textureDimensions(texture1));
    return textureSampleLevel(texture1, cubeSampler, uv, 0.0).rgb;
  }
  let uv = pixel / vec2f(textureDimensions(texture0));
  return textureSampleLevel(texture0, cubeSampler, uv, 0.0).rgb;
}

@fragment
fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let direction = rotate(cube[0], outputDirection(position.xy));
  let count = u32(cube[1].z);
  if (count == 0u) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  var face = 0u;
  var most = -2.0;
  for (var index = 0u; index < count; index++) {
    let along = dot(direction, faceSlot(index, 0u).xyz);
    if (along > most) {
      face = index;
      most = along;
    }
  }
  let centre = faceSlot(face, 0u);
  let across = faceSlot(face, 1u);
  let down = faceSlot(face, 2u);
  let origin = faceSlot(face, 3u).xy;
  let size = across.w;
  let band = down.w;
  let texture = u32(centre.w);
  let u = atan(dot(direction, across.xyz) / most) / QUARTER_PI;
  let v = atan(dot(direction, down.xyz) / most) / QUARTER_PI;
  let column = (u + 1.0) / 2.0 * size;
  let first = vec2f(origin.x + column, origin.y + (v + 1.0) / 2.0 * size);
  let start = (size - band) / 2.0;
  if (band == 0.0 || column < start) {
    return vec4f(readTexture(texture, first), 1.0);
  }
  let second = first + vec2f(band, 0.0);
  if (column >= start + band) {
    return vec4f(readTexture(texture, second), 1.0);
  }
  let share = (column - start) / band;
  return vec4f(mix(readTexture(texture, first), readTexture(texture, second), share), 1.0);
}
`;
