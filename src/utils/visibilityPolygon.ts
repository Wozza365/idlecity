export interface Point {
  x: number;
  y: number;
}

export interface Segment {
  a: Point;
  b: Point;
}

export function buildScreenBoundary(w: number, h: number): Segment[] {
  return [
    { a: { x: -1, y: -1 },     b: { x: w + 1, y: -1 } },
    { a: { x: w + 1, y: -1 },  b: { x: w + 1, y: h + 1 } },
    { a: { x: w + 1, y: h + 1 }, b: { x: -1, y: h + 1 } },
    { a: { x: -1, y: h + 1 },  b: { x: -1, y: -1 } },
  ];
}

export function segmentsFromRect(x: number, y: number, w: number, h: number): Segment[] {
  const tl = { x,     y     };
  const tr = { x: x + w, y     };
  const br = { x: x + w, y: y + h };
  const bl = { x,     y: y + h };
  return [
    { a: tl, b: tr },
    { a: tr, b: br },
    { a: br, b: bl },
    { a: bl, b: tl },
  ];
}

export function segmentsFromPolygon(pts: Point[]): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < pts.length; i++) {
    segs.push({ a: pts[i], b: pts[(i + 1) % pts.length] });
  }
  return segs;
}

// Ray: O + t*D (unit direction), Segment: A + u*(B-A).
// Returns t (pixel distance to intersection) or null if no valid hit.
function raySegmentIntersect(
  ox: number, oy: number,
  dx: number, dy: number,
  a: Point, b: Point,
): number | null {
  const ex = b.x - a.x, ey = b.y - a.y; // E = segment direction
  const denom = dx * ey - dy * ex;        // D × E
  if (Math.abs(denom) < 1e-10) return null;
  const fx = a.x - ox, fy = a.y - oy;    // A - O
  const t = (fx * ey - fy * ex) / denom;
  const u = (fx * dy - fy * dx) / denom;
  if (t < -1e-10 || u < -1e-10 || u > 1.0 + 1e-10) return null;
  return t;
}

// Compute the 2D visibility polygon (lit region) for a point light against a
// set of occluder segments. The returned points are ordered by angle around the
// light and form the boundary of the visible area.
//
// Always include buildScreenBoundary() in the segment list to bound the result.
export function computeVisibilityPolygon(light: Point, segments: Segment[]): Point[] {
  // Collect one angle per endpoint, then emit 3 rays per angle (±ε trick
  // handles the discontinuity exactly at wall corners).
  const angles: number[] = [];
  for (const seg of segments) {
    angles.push(Math.atan2(seg.a.y - light.y, seg.a.x - light.x));
    angles.push(Math.atan2(seg.b.y - light.y, seg.b.x - light.x));
  }

  const EPSILON = 0.0001;
  const rays: number[] = [];
  for (const a of angles) rays.push(a - EPSILON, a, a + EPSILON);
  rays.sort((a, b) => a - b);

  // Deduplicate rays that are numerically identical after sorting.
  const unique: number[] = [rays[0]];
  for (let i = 1; i < rays.length; i++) {
    if (rays[i] - rays[i - 1] > 1e-9) unique.push(rays[i]);
  }

  const poly: Point[] = [];
  for (const angle of unique) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let minT = Infinity;
    for (const seg of segments) {
      const t = raySegmentIntersect(light.x, light.y, dx, dy, seg.a, seg.b);
      if (t !== null && t < minT) minT = t;
    }
    if (minT < Infinity) {
      poly.push({ x: light.x + dx * minT, y: light.y + dy * minT });
    }
  }

  return poly;
}

// Cone-restricted visibility polygon for spot lights.
// Only rays within [centerAngle - halfCone, centerAngle + halfCone] are cast.
// Two boundary rays at exactly ±halfCone close the cone wedge.
export function computeSpotVisibilityPolygon(
  light: Point,
  centerAngle: number,
  halfCone: number,
  segments: Segment[],
): Point[] {
  const minAngle = centerAngle - halfCone;
  const maxAngle = centerAngle + halfCone;

  const angles: number[] = [];
  for (const seg of segments) {
    const aA = Math.atan2(seg.a.y - light.y, seg.a.x - light.x);
    const aB = Math.atan2(seg.b.y - light.y, seg.b.x - light.x);
    // Normalise to [minAngle, minAngle + 2π) so we can range-check.
    const normA = normaliseAngle(aA, minAngle);
    const normB = normaliseAngle(aB, minAngle);
    const span = maxAngle - minAngle; // = 2 * halfCone
    if (normA <= span) angles.push(normA + minAngle);
    if (normB <= span) angles.push(normB + minAngle);
  }

  // Always include the two hard cone-edge rays.
  angles.push(minAngle, maxAngle);

  const EPSILON = 0.0001;
  const rays: number[] = [];
  for (const a of angles) rays.push(a - EPSILON, a, a + EPSILON);
  // Clamp to cone range after ε shift.
  const clamped = rays.map(r => Math.max(minAngle, Math.min(maxAngle, r)));
  clamped.sort((a, b) => a - b);

  const unique: number[] = [clamped[0]];
  for (let i = 1; i < clamped.length; i++) {
    if (clamped[i] - clamped[i - 1] > 1e-9) unique.push(clamped[i]);
  }

  // The cone wedge starts and ends at the light origin for a closed polygon.
  const poly: Point[] = [{ x: light.x, y: light.y }];
  for (const angle of unique) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let minT = Infinity;
    for (const seg of segments) {
      const t = raySegmentIntersect(light.x, light.y, dx, dy, seg.a, seg.b);
      if (t !== null && t < minT) minT = t;
    }
    if (minT < Infinity) {
      poly.push({ x: light.x + dx * minT, y: light.y + dy * minT });
    }
  }

  return poly;
}

// Shift angle into [base, base + 2π).
function normaliseAngle(angle: number, base: number): number {
  const TWO_PI = 2 * Math.PI;
  const a = ((angle - base) % TWO_PI + TWO_PI) % TWO_PI;
  return a;
}
