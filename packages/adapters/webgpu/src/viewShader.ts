/**
 * The view of an equirectangular frame as a WGSL render pass: a full-screen triangle whose
 * fragments are the view's pixels.
 *
 * @remarks It applies the reference view (`viewDirection` and `renderView` in the core) to the
 * numbers `packView` lays out: a ray through the image plane from the virtual camera behind the
 * centre, met with the unit sphere, turned by the view's rotation, and read at that direction's
 * longitude and latitude. The sampler repeats across the frame's left and right edges, so the back
 * of the sphere has no seam.
 */
export const VIEW_SHADER = /* wgsl */ `
const PI = 3.141592653589793;

@group(0) @binding(0) var<storage, read> view: array<vec4f>;
@group(0) @binding(1) var viewSampler: sampler;
@group(0) @binding(2) var frame: texture_2d<f32>;

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

fn rotate(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

fn lookAlong(position: vec2f) -> vec3f {
  let lens = view[1];
  let size = view[2].xy;
  let x = 2.0 * position.x / size.x - 1.0;
  let y = 1.0 - 2.0 * position.y / size.y;
  let ray = normalize(vec3f(1.0, -x * lens.x, y * lens.y));
  let distance = lens.z;
  let along = distance * ray.x;
  let reach = along + sqrt(along * along - distance * distance + 1.0);
  return rotate(view[0], vec3f(reach * ray.x - distance, reach * ray.y, reach * ray.z));
}

@fragment
fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let direction = lookAlong(position.xy);
  let longitude = atan2(direction.y, direction.x);
  let latitude = asin(clamp(direction.z, -1.0, 1.0));
  let uv = vec2f((PI - longitude) / (2.0 * PI), (PI / 2.0 - latitude) / PI);
  return vec4f(textureSampleLevel(frame, viewSampler, uv, 0.0).rgb, 1.0);
}
`;
