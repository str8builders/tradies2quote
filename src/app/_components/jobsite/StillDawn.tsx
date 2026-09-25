/**
 * A drawn still of the dawn job site: the same opening shot as the 3D
 * (looking through the back wall's studs at the phone on the sawhorse,
 * low sun behind, long shadows coming towards you). It's the still
 * version's hero picture and the placeholder while the 3D loads. A few KB
 * of SVG, no image download.
 */
const WALL_LEFT = 420;
const BAY = 70; // 600 mm centres
const STUDS = Array.from({ length: 13 }, (_, i) => WALL_LEFT + i * BAY);
const TOP = 513;
const BASE = 760;
const WINDOW_STUD = WALL_LEFT + 2 * BAY; // opening between studs 2 and 4

export function StillDawn({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="jsd-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#111726" />
          <stop offset="0.42" stopColor="#2a2b3c" />
          <stop offset="0.6" stopColor="#6b4b4e" />
          <stop offset="0.7" stopColor="#c08462" />
          <stop offset="0.76" stopColor="#e3ab80" />
        </linearGradient>
        <radialGradient id="jsd-sun" cx="0.16" cy="0.74" r="0.42">
          <stop offset="0" stopColor="#ffe2b8" stopOpacity="0.85" />
          <stop offset="0.35" stopColor="#f3b27c" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f3b27c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="jsd-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a4636" />
          <stop offset="1" stopColor="#1c1714" />
        </linearGradient>
        <linearGradient id="jsd-slab" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a39a8e" />
          <stop offset="1" stopColor="#6d6860" />
        </linearGradient>
        <radialGradient id="jsd-phone" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffb27f" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ff5f15" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="1600" height="1000" fill="url(#jsd-sky)" />
      <rect width="1600" height="1000" fill="url(#jsd-sun)" />
      <rect y="760" width="1600" height="240" fill="url(#jsd-ground)" />
      {/* Slab, in perspective, with saw-cut joints */}
      <polygon points="330,1000 470,735 1330,735 1560,1000" fill="url(#jsd-slab)" />
      <g stroke="#57524b" strokeWidth="1.5" opacity="0.6">
        <line x1="900" y1="735" x2="945" y2="1000" />
        <line x1="400" y1="868" x2="1445" y2="868" />
      </g>

      {/* Ridge on props and a few rafters, behind the wall */}
      <g fill="#5b4330">
        <rect x="430" y="452" width="275" height="9" />
        <rect x="446" y="461" width="6" height="276" />
        <rect x="682" y="461" width="6" height="276" />
      </g>
      <g stroke="#6b4e34" strokeWidth="6" strokeLinecap="square">
        {[450, 540, 630].map((x) => (
          <line key={x} x1={x} y1={TOP + 4} x2={x + 16} y2={458} />
        ))}
      </g>

      {/* Sawhorse and the phone, seen through the stud bay */}
      <g fill="#5e4631">
        <rect x="868" y="702" width="96" height="7" />
        <polygon points="872,709 878,709 866,744 860,744" />
        <polygon points="954,709 960,709 972,744 966,744" />
      </g>
      <circle cx="912" cy="694" r="26" fill="url(#jsd-phone)" />
      <rect x="908" y="684" width="8" height="16" rx="1.5" fill="#ffd9bd" />

      {/* Long stud shadows coming towards you */}
      <g fill="#140e0a" opacity="0.32">
        {STUDS.filter((x) => x !== WINDOW_STUD + BAY).map((x) => (
          <polygon key={x} points={`${x},${BASE} ${x + 7},${BASE} ${x + 180},1000 ${x + 166},1000`} />
        ))}
      </g>

      {/* The back wall: bottom plate, double top plate, studs, window, nogs */}
      <g fill="#6f5237">
        <rect x={WALL_LEFT} y={TOP} width={12 * BAY + 7} height="7" />
        <rect x={WALL_LEFT} y={TOP + 7} width={12 * BAY + 7} height="7" />
        <rect x={WALL_LEFT} y={BASE - 7} width={12 * BAY + 7} height="7" />
        {STUDS.map((x) =>
          x === WINDOW_STUD + BAY ? (
            <g key={x}>
              <rect x={x} y={TOP + 14} width="7" height="18" />
              <rect x={x} y={670} width="7" height={BASE - 677} />
            </g>
          ) : (
            <rect key={x} x={x} y={TOP + 14} width="7" height={BASE - TOP - 21} />
          ),
        )}
        <rect x={WINDOW_STUD + 7} y={545} width={2 * BAY - 7} height="14" />
        <rect x={WINDOW_STUD + 7} y={663} width={2 * BAY - 7} height="7" />
        {STUDS.slice(0, -1).map((x, i) =>
          x === WINDOW_STUD || x === WINDOW_STUD + BAY ? null : (
            <rect key={x} x={x + 7} y={i % 2 === 0 ? 636 : 642} width={BAY - 7} height="6" />
          ),
        )}
      </g>
      {/* Sun catching the left edge of every stud */}
      <g fill="#f2c08b" opacity="0.7">
        {STUDS.map((x) => (
          <rect key={x} x={x} y={TOP + 14} width="1.6" height={BASE - TOP - 21} />
        ))}
      </g>

      {/* A pack of studs on the slab */}
      <g fill="#8a6947">
        <rect x="1150" y="905" width="270" height="9" />
        <rect x="1152" y="914" width="270" height="9" />
        <rect x="1154" y="923" width="270" height="9" />
      </g>
      {/* Morning haze */}
      <rect y="640" width="1600" height="160" fill="#f0c9a4" opacity="0.08" />
    </svg>
  );
}
