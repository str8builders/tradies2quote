const radians = (degrees: number) => degrees * Math.PI / 180;

/// The cut a tube end needs, station by station round its wrap — the same profile
/// the template plots, so the printed depths and the drawn curve agree.
///
/// A miter takes a plane cut, so its depth is a raised cosine. A notch saddles a
/// parent tube: the branch is cut back by the parent's saddle plus the rake from
/// meeting it off square, which is the classic fishmouth. The previous shared
/// cosine reported a coped branch cut deeper than the parent tube's own radius.
export function tubeCutProfile(joint: number, diameter: number, parent: number, angleDeg: number) {
  const r = Math.max(diameter, 0.001) / 2;
  const alpha = radians(Math.min(Math.max(angleDeg, 1), 179));
  if (joint === 1) {
    const depth = 2 * r * Math.tan(radians((180 - Math.min(Math.max(angleDeg, 1), 179)) / 2));
    return (theta: number) => depth * (1 + Math.cos(theta)) / 2;
  }
  if (joint === 2) {
    // One flat sheet is one plane, and a plane meets a cylinder in a single
    // ellipse — so the wrap line is ONE raised-cosine period at the sheet's
    // complementary angle, exactly like a miter. (An earlier build plotted
    // abs(cos) — two lobes per turn — which no flat sheet can produce.)
    const depth = 2 * r * Math.abs(Math.cos(alpha) / Math.sin(alpha));
    return (theta: number) => depth * (1 + Math.cos(theta)) / 2;
  }
  // A branch can never be wider than the tube it saddles onto.
  const R = Math.max(parent / 2, r);
  const cut = (theta: number) => {
    const lateral = r * Math.sin(theta);
    const saddle = R - Math.sqrt(Math.max(0, R * R - lateral * lateral));
    return (saddle + r * Math.cos(theta) * Math.cos(alpha)) / Math.sin(alpha);
  };
  let floorValue = Infinity;
  for (let d = 0; d <= 360; d++) floorValue = Math.min(floorValue, cut(radians(d)));
  return (theta: number) => Math.max(0, cut(theta) - floorValue);
}

export function tubeCutPeak(depthAt: (theta: number) => number) {
  let peak = 0;
  for (let d = 0; d <= 360; d++) peak = Math.max(peak, depthAt(radians(d)));
  return peak;
}
