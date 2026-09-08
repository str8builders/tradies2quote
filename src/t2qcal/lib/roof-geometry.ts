/** Roof centre-line geometry. Lengths share the caller's unit. */
export function roofGeometry(type: string, length: number, width: number, angle: number, angle2: number, overhang: number, spacing: number) {
  const rad = (a: number) => a * Math.PI / 180;
  const lean = type === "lean-to-roof", hip = type === "hip-roof";
  const gambrel = type === "gambrel-roof", saltbox = type === "saltbox-roof";
  const pitch = Math.tan(rad(angle)), pitch2 = Math.tan(rad(angle2));
  // Saltbox plates are level: both slopes meet at the same ridge height.
  const run = lean ? width : saltbox ? width * pitch2 / (pitch + pitch2) : width / 2;
  const run2 = lean ? 0 : width - run;
  const rise = gambrel ? run / 2 * (pitch + pitch2) : run * pitch;
  const member = gambrel ? run / 2 / Math.cos(rad(angle)) + run / 2 / Math.cos(rad(angle2)) : Math.hypot(run, rise);
  const secondMember = saltbox ? Math.hypot(run2, rise) : lean ? 0 : member;
  const tail = overhang / Math.cos(rad(gambrel ? angle2 : angle));
  const secondTail = lean ? 0 : overhang / Math.cos(rad(saltbox || gambrel ? angle2 : angle));
  const positions = Math.ceil(length / spacing - 1e-10) + 1;
  return {
    run, run2, rise, member, secondMember, tail, secondTail,
    hipLength: Math.hypot(run, run, rise),
    hipTail: Math.hypot(overhang, overhang, overhang * pitch),
    ridge: hip ? Math.max(0, length - width) : length,
    area: (length + 2 * overhang) * (member + secondMember + tail + secondTail),
    positions, actualSpacing: length / (positions - 1),
  };
}
