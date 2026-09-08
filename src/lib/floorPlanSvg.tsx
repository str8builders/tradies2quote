/**
 * Wave 42 — programmatic floor-plan SVG.
 *
 * Given the structured `plan` object emitted by /api/quotes/scan-drawing
 * (a sanitised ScannedPlan), render a clean architectural-style schematic
 * the tradie and the customer can both read. Pure SVG, no AI calls — the
 * data is already paid for upstream.
 *
 * Renderer covers the four shapes the scanner returns:
 *   - rect   → deck / framing / concrete / roofing (any rectangular plan)
 *   - line   → fence (length only matters)
 *   - l_shape → rendered as rect for now (TODO if a real L-shape lands)
 *   - other  → bailing message; component renders nothing
 *
 * Job-type-aware overlays (deck posts, joists, fence posts, framing
 * studs) layer on top so the schematic actually looks like what the
 * tradie drew.
 */

import type { ScannedPlan } from "@/lib/scan-drawing";

type JobType = "Deck" | "Fence" | "Framing" | "Concrete" | "Roofing" | "Other";

const VIEWBOX_W = 400;
const VIEWBOX_H = 280;
const PADDING = 56; // room for dimension labels outside the plan rect

/** Map metres to SVG units, fitting the plan into the viewbox. */
function fitScale(widthM: number, lengthM: number): number {
  const usableW = VIEWBOX_W - PADDING * 2;
  const usableH = VIEWBOX_H - PADDING * 2;
  // Avoid divide-by-zero with very thin plans (a fence has width_m=0).
  const w = Math.max(widthM, 0.001);
  const l = Math.max(lengthM, 0.001);
  return Math.min(usableW / w, usableH / l);
}

function fmtM(n: number): string {
  return n >= 10 ? n.toFixed(1) + "m" : n.toFixed(2).replace(/0$/, "") + "m";
}

interface FloorPlanSvgProps {
  plan: ScannedPlan;
  jobType: JobType;
  /** Optional title rendered above the schematic. */
  title?: string;
}

export function FloorPlanSvg({ plan, jobType, title }: FloorPlanSvgProps) {
  // Fence is a special case — only length matters, render a horizontal line.
  if (plan.shape === "line" || jobType === "Fence") {
    return <FenceSvg plan={plan} title={title} />;
  }
  if (plan.shape === "other") {
    return null;
  }
  return <RectPlanSvg plan={plan} jobType={jobType} title={title} />;
}

function RectPlanSvg({
  plan,
  jobType,
  title,
}: {
  plan: ScannedPlan;
  jobType: JobType;
  title?: string;
}) {
  const scale = fitScale(plan.width_m, plan.length_m);
  const wPx = plan.width_m * scale;
  const lPx = plan.length_m * scale;
  // Center the rect inside the viewbox.
  const x = (VIEWBOX_W - wPx) / 2;
  const y = (VIEWBOX_H - lPx) / 2;

  return (
    <svg
      data-testid="floor-plan-svg"
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      role="img"
      aria-label={
        title ?? `Plan view of ${plan.width_m}m by ${plan.length_m}m work area`
      }
      className="block h-auto w-full"
    >
      <defs>
        <pattern
          id="grid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke="rgb(255 255 255 / 0.06)"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      {/* Solid dark backdrop — the schematic was unreadable in light
          mode because every overlay relied on white-on-dark contrast.
          Pinning the SVG's own background fixes that without
          touching the app theme. */}
      <rect width={VIEWBOX_W} height={VIEWBOX_H} fill="rgb(10 10 10)" />
      <rect width={VIEWBOX_W} height={VIEWBOX_H} fill="url(#grid)" />

      <g>
        {/* Outer perimeter */}
        <rect
          x={x}
          y={y}
          width={wPx}
          height={lPx}
          fill="rgb(255 95 21 / 0.08)"
          stroke="rgb(255 95 21)"
          strokeWidth="2.5"
        />

        {/* Job-type overlays */}
        {jobType === "Deck" && (
          <DeckOverlay plan={plan} x={x} y={y} wPx={wPx} lPx={lPx} />
        )}
        {jobType === "Framing" && (
          <FramingOverlay plan={plan} x={x} y={y} wPx={wPx} lPx={lPx} />
        )}
        {jobType === "Concrete" && (
          <ConcreteOverlay x={x} y={y} wPx={wPx} lPx={lPx} />
        )}
        {jobType === "Roofing" && (
          <RoofingOverlay x={x} y={y} wPx={wPx} lPx={lPx} />
        )}

        {/* Dimension labels — width along the top, length down the right side. */}
        <DimensionLabel
          x1={x}
          y1={y - 18}
          x2={x + wPx}
          y2={y - 18}
          text={fmtM(plan.width_m)}
        />
        <DimensionLabel
          x1={x + wPx + 18}
          y1={y}
          x2={x + wPx + 18}
          y2={y + lPx}
          text={fmtM(plan.length_m)}
          vertical
        />

        {/* Inline annotations — more measure detail. Surface the
            structured bits the AI extracted so the operator can
            sense-check at a glance instead of scrolling the prose. */}
        <PlanAnnotations
          plan={plan}
          jobType={jobType}
          x={x}
          y={y}
          wPx={wPx}
          lPx={lPx}
        />
      </g>
    </svg>
  );
}

function PlanAnnotations({
  plan,
  jobType,
  x,
  y,
  lPx,
}: {
  plan: ScannedPlan;
  jobType: JobType;
  x: number;
  y: number;
  wPx: number;
  lPx: number;
}) {
  const lines: string[] = [];
  if (plan.post_count && plan.post_count > 0) {
    lines.push(`${plan.post_count} posts`);
  }
  if (plan.post_spacing_m && plan.post_spacing_m > 0) {
    lines.push(`${fmtM(plan.post_spacing_m)} post spacing`);
  }
  if (plan.joist_spacing_mm && plan.joist_spacing_mm > 0) {
    lines.push(`${plan.joist_spacing_mm}mm joist c/c`);
  }
  if (plan.height_m && plan.height_m > 0) {
    lines.push(`${fmtM(plan.height_m)} ${jobType === "Deck" ? "above ground" : "high"}`);
  }
  if (jobType === "Deck" && plan.joist_orientation) {
    lines.push(`joists ↔ ${plan.joist_orientation}`);
  }
  if (lines.length === 0) return null;

  // Position the annotation block in the lower-left so it doesn't
  // collide with the right-side length label.
  const baseX = x + 6;
  const baseY = y + lPx - lines.length * 14 - 6;

  return (
    <g>
      <rect
        x={baseX - 4}
        y={baseY - 12}
        width={140}
        height={lines.length * 14 + 8}
        fill="rgb(0 0 0 / 0.55)"
        stroke="rgb(255 255 255 / 0.18)"
        strokeWidth="1"
        rx="2"
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={baseX}
          y={baseY + i * 14}
          fill="rgb(255 255 255 / 0.85)"
          fontSize="11"
          fontFamily="IBM Plex Mono, ui-monospace, monospace"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function DeckOverlay({
  plan,
  x,
  y,
  wPx,
  lPx,
}: {
  plan: ScannedPlan;
  x: number;
  y: number;
  wPx: number;
  lPx: number;
}) {
  // Joists — thin parallel lines across the deck. Default to ~9 lines
  // if the AI didn't report a spacing.
  const joistSpacingMm = plan.joist_spacing_mm ?? 450;
  const orientation = plan.joist_orientation ?? "width";
  const joistColor = "rgb(255 255 255 / 0.18)";
  const joistEls: React.ReactNode[] = [];
  if (orientation === "width") {
    // Joists run parallel to the width edge → drawn as horizontal lines
    const joistCountPx = Math.max(
      2,
      Math.round((plan.length_m * 1000) / joistSpacingMm),
    );
    for (let i = 1; i < joistCountPx; i++) {
      const yi = y + (lPx * i) / joistCountPx;
      joistEls.push(
        <line
          key={`j-${i}`}
          x1={x + 4}
          y1={yi}
          x2={x + wPx - 4}
          y2={yi}
          stroke={joistColor}
          strokeWidth="1"
        />,
      );
    }
  } else {
    const joistCountPx = Math.max(
      2,
      Math.round((plan.width_m * 1000) / joistSpacingMm),
    );
    for (let i = 1; i < joistCountPx; i++) {
      const xi = x + (wPx * i) / joistCountPx;
      joistEls.push(
        <line
          key={`j-${i}`}
          x1={xi}
          y1={y + 4}
          x2={xi}
          y2={y + lPx - 4}
          stroke={joistColor}
          strokeWidth="1"
        />,
      );
    }
  }

  // Posts — small circles at the corners and every post_spacing along
  // the perimeter. Fall back to 4 corner posts if no count given.
  const postEls: React.ReactNode[] = [];
  const corners: Array<[number, number]> = [
    [x, y],
    [x + wPx, y],
    [x, y + lPx],
    [x + wPx, y + lPx],
  ];
  for (const [cx, cy] of corners) {
    postEls.push(
      <circle
        key={`p-${cx}-${cy}`}
        cx={cx}
        cy={cy}
        r="4"
        fill="rgb(255 95 21)"
        stroke="rgb(17 17 17)"
        strokeWidth="1.5"
      />,
    );
  }
  // Interior perimeter posts if the AI gave us a spacing.
  if (plan.post_spacing_m && plan.post_spacing_m > 0) {
    const ws = Math.floor(plan.width_m / plan.post_spacing_m);
    const ls = Math.floor(plan.length_m / plan.post_spacing_m);
    for (let i = 1; i < ws; i++) {
      const px = x + (wPx * i) / ws;
      postEls.push(
        <circle
          key={`p-top-${i}`}
          cx={px}
          cy={y}
          r="3"
          fill="rgb(255 95 21 / 0.7)"
        />,
        <circle
          key={`p-bot-${i}`}
          cx={px}
          cy={y + lPx}
          r="3"
          fill="rgb(255 95 21 / 0.7)"
        />,
      );
    }
    for (let i = 1; i < ls; i++) {
      const py = y + (lPx * i) / ls;
      postEls.push(
        <circle
          key={`p-l-${i}`}
          cx={x}
          cy={py}
          r="3"
          fill="rgb(255 95 21 / 0.7)"
        />,
        <circle
          key={`p-r-${i}`}
          cx={x + wPx}
          cy={py}
          r="3"
          fill="rgb(255 95 21 / 0.7)"
        />,
      );
    }
  }

  return (
    <g>
      {joistEls}
      {postEls}
    </g>
  );
}

function FramingOverlay({
  plan,
  x,
  y,
  wPx,
  lPx,
}: {
  plan: ScannedPlan;
  x: number;
  y: number;
  wPx: number;
  lPx: number;
}) {
  // Top + bottom plates as thicker lines, studs as thin vertical lines
  // every 600mm by default.
  const studSpacingMm = plan.joist_spacing_mm ?? 600;
  const studCount = Math.max(
    2,
    Math.round((plan.width_m * 1000) / studSpacingMm),
  );
  const studs: React.ReactNode[] = [];
  for (let i = 0; i <= studCount; i++) {
    const xi = x + (wPx * i) / studCount;
    studs.push(
      <line
        key={`s-${i}`}
        x1={xi}
        y1={y + 6}
        x2={xi}
        y2={y + lPx - 6}
        stroke="rgb(255 255 255 / 0.25)"
        strokeWidth="1.5"
      />,
    );
  }
  return (
    <g>
      <line
        x1={x}
        y1={y}
        x2={x + wPx}
        y2={y}
        stroke="rgb(255 95 21)"
        strokeWidth="3"
      />
      <line
        x1={x}
        y1={y + lPx}
        x2={x + wPx}
        y2={y + lPx}
        stroke="rgb(255 95 21)"
        strokeWidth="3"
      />
      {studs}
    </g>
  );
}

function ConcreteOverlay({
  x,
  y,
  wPx,
  lPx,
}: {
  x: number;
  y: number;
  wPx: number;
  lPx: number;
}) {
  // Diagonal hatching to evoke a concrete slab.
  const lines: React.ReactNode[] = [];
  const step = 12;
  for (let i = -lPx; i < wPx + lPx; i += step) {
    lines.push(
      <line
        key={`h-${i}`}
        x1={x + Math.max(0, i)}
        y1={y + Math.max(0, -i)}
        x2={x + Math.min(wPx, i + lPx)}
        y2={y + Math.min(lPx, lPx - i + lPx)}
        stroke="rgb(255 255 255 / 0.1)"
        strokeWidth="1"
      />,
    );
  }
  // Clip the hatching to the slab rect via a clipPath.
  const id = `clip-${x}-${y}`;
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <rect x={x} y={y} width={wPx} height={lPx} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{lines}</g>
    </g>
  );
}

function RoofingOverlay({
  x,
  y,
  wPx,
  lPx,
}: {
  x: number;
  y: number;
  wPx: number;
  lPx: number;
}) {
  // Purlins drawn as parallel lines running the long way.
  const lines: React.ReactNode[] = [];
  const horizontal = wPx >= lPx;
  const count = 8;
  for (let i = 1; i < count; i++) {
    if (horizontal) {
      const yi = y + (lPx * i) / count;
      lines.push(
        <line
          key={`pn-${i}`}
          x1={x + 4}
          y1={yi}
          x2={x + wPx - 4}
          y2={yi}
          stroke="rgb(255 255 255 / 0.18)"
          strokeWidth="1.5"
        />,
      );
    } else {
      const xi = x + (wPx * i) / count;
      lines.push(
        <line
          key={`pn-${i}`}
          x1={xi}
          y1={y + 4}
          x2={xi}
          y2={y + lPx - 4}
          stroke="rgb(255 255 255 / 0.18)"
          strokeWidth="1.5"
        />,
      );
    }
  }
  return <g>{lines}</g>;
}

function FenceSvg({
  plan,
  title,
}: {
  plan: ScannedPlan;
  title?: string;
}) {
  // For a fence we care about run length (use whichever of width/length
  // is non-zero) and post count.
  const runM = Math.max(plan.length_m, plan.width_m);
  const heightM = plan.height_m ?? 1.8;
  const usableW = VIEWBOX_W - PADDING * 2;
  const usableH = VIEWBOX_H - PADDING * 2;
  const scaleX = usableW / Math.max(runM, 0.001);
  const scaleY = Math.min(usableH / Math.max(heightM, 0.001), scaleX * 1.5);
  const runPx = runM * scaleX;
  const heightPx = heightM * scaleY;
  const x = (VIEWBOX_W - runPx) / 2;
  const y = (VIEWBOX_H - heightPx) / 2;

  // Default to a post every 2.4m if not provided.
  const spacing = plan.post_spacing_m ?? 2.4;
  const segments = Math.max(1, Math.round(runM / spacing));

  const posts: React.ReactNode[] = [];
  for (let i = 0; i <= segments; i++) {
    const px = x + (runPx * i) / segments;
    posts.push(
      <line
        key={`p-${i}`}
        x1={px}
        y1={y}
        x2={px}
        y2={y + heightPx}
        stroke="rgb(255 95 21)"
        strokeWidth="3"
      />,
    );
  }

  // Two rails — top and bottom.
  const railEls = [
    <line
      key="rail-top"
      x1={x}
      y1={y + 6}
      x2={x + runPx}
      y2={y + 6}
      stroke="rgb(255 255 255 / 0.4)"
      strokeWidth="1.5"
    />,
    <line
      key="rail-bot"
      x1={x}
      y1={y + heightPx - 6}
      x2={x + runPx}
      y2={y + heightPx - 6}
      stroke="rgb(255 255 255 / 0.4)"
      strokeWidth="1.5"
    />,
  ];

  return (
    <svg
      data-testid="floor-plan-svg"
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      role="img"
      aria-label={
        title ?? `Elevation view of ${runM}m fence at ${heightM}m height`
      }
      className="block h-auto w-full"
    >
      <rect width={VIEWBOX_W} height={VIEWBOX_H} fill="rgb(10 10 10)" />
      <rect
        x={x}
        y={y}
        width={runPx}
        height={heightPx}
        fill="rgb(255 95 21 / 0.06)"
      />
      {railEls}
      {posts}
      <DimensionLabel
        x1={x}
        y1={y - 18}
        x2={x + runPx}
        y2={y - 18}
        text={fmtM(runM)}
      />
      <DimensionLabel
        x1={x + runPx + 18}
        y1={y}
        x2={x + runPx + 18}
        y2={y + heightPx}
        text={fmtM(heightM)}
        vertical
      />
    </svg>
  );
}

function DimensionLabel({
  x1,
  y1,
  x2,
  y2,
  text,
  vertical = false,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text: string;
  vertical?: boolean;
}) {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="rgb(255 255 255 / 0.5)"
        strokeWidth="1"
      />
      {/* Tick marks at each end. */}
      <line
        x1={vertical ? x1 - 4 : x1}
        y1={vertical ? y1 : y1 - 4}
        x2={vertical ? x1 + 4 : x1}
        y2={vertical ? y1 : y1 + 4}
        stroke="rgb(255 255 255 / 0.5)"
        strokeWidth="1"
      />
      <line
        x1={vertical ? x2 - 4 : x2}
        y1={vertical ? y2 : y2 - 4}
        x2={vertical ? x2 + 4 : x2}
        y2={vertical ? y2 : y2 + 4}
        stroke="rgb(255 255 255 / 0.5)"
        strokeWidth="1"
      />
      <text
        x={cx}
        y={cy}
        fill="rgb(255 234 0)"
        fontSize="13"
        fontFamily="IBM Plex Mono, ui-monospace, monospace"
        textAnchor="middle"
        dominantBaseline="middle"
        transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
      >
        {text}
      </text>
    </g>
  );
}
