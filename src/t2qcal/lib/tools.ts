export type ToolCategory = {
  id: string;
  name: string;
  short: string;
  description: string;
  accent: string;
};

export type ToolEntry = {
  name: string;
  slug: string;
  category: string;
  summary: string;
  units: "metric" | "imperial" | "both";
  available?: boolean;
  popular?: boolean;
};

export const categories: ToolCategory[] = [
  { id: "roof", name: "Roof & rafters", short: "Roof", description: "Rafter cuts, pitches, framing plans and roof geometry.", accent: "#0276fd" },
  { id: "stairs", name: "Stairs & balustrades", short: "Stairs", description: "Rise, run, stringers, headroom and baluster layouts.", accent: "#0276fd" },
  { id: "spacing", name: "Centers & spacing", short: "Spacing", description: "Equal gaps, running marks, panels, battens and fasteners.", accent: "#0276fd" },
  { id: "concrete", name: "Concrete & masonry", short: "Concrete", description: "Slabs, beams, rebar, blocks, arches and quantities.", accent: "#0276fd" },
  { id: "metal", name: "Metal & tubing", short: "Metal", description: "Notches, miters, reducers, bends and wrap templates.", accent: "#0276fd" },
  { id: "templates", name: "Printable templates", short: "Templates", description: "Full-scale circles, arcs, cones, tapes and protractors.", accent: "#0276fd" },
  { id: "deck", name: "Decks & fencing", short: "Deck", description: "Joists, boards, posts, panels, palings and costs.", accent: "#0276fd" },
  { id: "convert", name: "Convert & measure", short: "Convert", description: "Length, area, volume, weight, scale, pitch and angles.", accent: "#0276fd" },
  { id: "geometry", name: "General geometry", short: "Geometry", description: "Arcs, circles, polygons, miters, bracing and layouts.", accent: "#0276fd" },
  { id: "materials", name: "Materials & quantities", short: "Materials", description: "Tiles, timber, cladding, paving and project estimates.", accent: "#0276fd" },
];

const toolCatalog: ToolEntry[] = [
  { name: "Common rafter", slug: "common-rafter", category: "roof", summary: "Rafter length, rise, birdsmouth and live cutting diagram.", units: "both", available: true, popular: true },
  { name: "Straight stairs", slug: "straight-stairs", category: "stairs", summary: "Even risers, total run, stringer marks and headroom.", units: "both", available: true, popular: true },
  { name: "Equal spacing", slug: "equal-spacing", category: "spacing", summary: "Centers, clear gaps and a running mark-out list.", units: "both", available: true, popular: true },
  { name: "Concrete slab", slug: "concrete-slab", category: "concrete", summary: "Slab volume, order quantity, weight and cost.", units: "both", available: true, popular: true },
  { name: "Tile layout", slug: "tile-layout", category: "materials", summary: "Best fit, equal edge cuts, joints and tile quantity.", units: "both", available: true, popular: true },
  { name: "Arc & circle", slug: "arc-circle", category: "geometry", summary: "Circumference, chord, segment angle and full diagram.", units: "both", available: true },
  { name: "All-unit converter", slug: "all-unit-converter", category: "convert", summary: "Convert common site lengths without changing screens.", units: "both", available: true, popular: true },
  { name: "Pitch, rise & angle", slug: "pitch-angle", category: "convert", summary: "Move between angle, percent grade and pitch ratios.", units: "both", available: true },

  { name: "Hip roof framing", slug: "hip-roof", category: "roof", summary: "Plan rafters, hips, jacks and material lengths.", units: "both", popular: true },
  { name: "Gable roof framing", slug: "gable-roof", category: "roof", summary: "Gable dimensions, rafters, ridge and cutting list.", units: "both" },
  { name: "Lean-to roof", slug: "lean-to-roof", category: "roof", summary: "Single-pitch roof rise, run and rafter set-out.", units: "both" },
  { name: "Gambrel roof", slug: "gambrel-roof", category: "roof", summary: "Two-pitch gambrel frame geometry and joints.", units: "both" },
  { name: "Saltbox roof", slug: "saltbox-roof", category: "roof", summary: "Asymmetric roof frame and rafter dimensions.", units: "both" },
  { name: "Rafter cut templates", slug: "rafter-templates", category: "roof", summary: "Full-scale plumb, seat and side-cut templates.", units: "both" },
  { name: "Soffit drop", slug: "soffit-drop", category: "roof", summary: "Horizontal soffit, fascia and drop geometry.", units: "both" },
  { name: "Hip and valley sheeting", slug: "hip-valley-sheet", category: "roof", summary: "Sheet layout and diagonal cutting dimensions.", units: "both" },
  { name: "Bullnose roofing", slug: "bullnose-roof", category: "roof", summary: "Curved roof sheet length and pitch transition.", units: "both" },

  { name: "Spiral stairs", slug: "spiral-stairs", category: "stairs", summary: "Tread rotation, rise and central column geometry.", units: "both" },
  { name: "Steel spine stairs", slug: "steel-spine-stairs", category: "stairs", summary: "Spine set-out, brackets and tread positions.", units: "both" },
  { name: "Baluster spacing", slug: "baluster-spacing", category: "stairs", summary: "Equal baluster gaps and on-tread positions.", units: "both", popular: true },
  { name: "Stair panel layout", slug: "stair-panels", category: "stairs", summary: "Angled wall panels and diminishing heights.", units: "both" },
  { name: "Access ramp", slug: "access-ramp", category: "stairs", summary: "Ramp run, length and angle to a gradient rule.", units: "both" },

  { name: "Board and batten", slug: "board-batten", category: "spacing", summary: "Equal field spacing for any wall length.", units: "both", popular: true },
  { name: "Glass balustrade panels", slug: "glass-panels", category: "spacing", summary: "Panel widths, gaps and post positions.", units: "both" },
  { name: "Wainscoting layout", slug: "wainscoting", category: "spacing", summary: "Balanced panels, rails and stile marks.", units: "both" },
  { name: "Shelf and drawer spacing", slug: "shelf-spacing", category: "spacing", summary: "Even openings with material thickness included.", units: "both" },
  { name: "Wall framing quantities", slug: "wall-framing", category: "spacing", summary: "Studs, noggins and plate quantities.", units: "both" },
  { name: "Opening layout", slug: "opening-layout", category: "spacing", summary: "Stud centers around doors and windows.", units: "both" },
  { name: "Kerf bending", slug: "kerf-bending", category: "spacing", summary: "Kerf count, spacing and remaining web.", units: "both" },
  { name: "Rebar spacing", slug: "rebar-spacing", category: "spacing", summary: "Bar counts, centers, lengths and weight.", units: "both" },
  { name: "Fastener set-out", slug: "fastener-spacing", category: "spacing", summary: "Balanced running marks for fixings.", units: "both" },

  { name: "Slab with edge beams", slug: "slab-edge-beams", category: "concrete", summary: "Polygon slab, thickened edges and reinforcement.", units: "both" },
  { name: "Concrete block quantities", slug: "block-quantities", category: "concrete", summary: "Blocks by wall area, courses and openings.", units: "both" },
  { name: "Block wall circle", slug: "circular-block-wall", category: "concrete", summary: "Circular wall radius, unit angle and joint taper.", units: "both" },
  { name: "Masonry arch", slug: "masonry-arch", category: "concrete", summary: "Arch voussoir layout and cut dimensions.", units: "both" },
  { name: "Concrete by the bag", slug: "concrete-bags", category: "concrete", summary: "Bagged-mix count for small pours.", units: "both" },
  { name: "Excavation & truck loads", slug: "excavation", category: "concrete", summary: "Bank and loose volumes with swell and loads.", units: "both" },
  { name: "Strip footing", slug: "strip-footing", category: "concrete", summary: "Trench concrete with readymix and bags.", units: "both" },
  { name: "Brick quantities", slug: "brick-quantities", category: "concrete", summary: "Bricks by wall area, courses and waste.", units: "both" },
  { name: "Starter bars", slug: "starter-bars", category: "concrete", summary: "Block core alignment and starter positions.", units: "metric" },
  { name: "Brick gauge and bond", slug: "brick-gauge", category: "concrete", summary: "Course gauge, joint size and bond set-out.", units: "both" },

  { name: "Round tube notch", slug: "tube-notch", category: "metal", summary: "Printable branch-to-tube coping pattern.", units: "both", popular: true },
  { name: "Round tube miter", slug: "tube-miter", category: "metal", summary: "Angled end miter wrap template.", units: "both" },
  { name: "Tube through sheet", slug: "tube-through-sheet", category: "metal", summary: "Hole profile through sloped sheet material.", units: "both" },
  { name: "Tube bend", slug: "tube-bend", category: "metal", summary: "Bend allowance, tangent points and set-out.", units: "both" },
  { name: "Pie-cut bend", slug: "pie-cut-bend", category: "metal", summary: "Segment count, cut angle and developed length.", units: "both" },
  { name: "Round-to-square reducer", slug: "round-square-reducer", category: "metal", summary: "Transition panels and full-scale patterns.", units: "both" },
  { name: "Square tube miter", slug: "square-tube-miter", category: "metal", summary: "Miter layout for equal or different sections.", units: "both" },
  { name: "Three-way tube joint", slug: "three-way-joint", category: "metal", summary: "Compound corner joining templates.", units: "both" },

  { name: "Protractor", slug: "protractor", category: "templates", summary: "Printable custom-size degree protractor.", units: "both" },
  { name: "Circle divider", slug: "circle-divider", category: "templates", summary: "Equal divisions, chords and cutting angles.", units: "both" },
  { name: "Circle template", slug: "circle-template", category: "templates", summary: "Full-scale circle across tiled print pages.", units: "both" },
  { name: "Arc template", slug: "arc-template", category: "templates", summary: "Large-radius printable arc set-out.", units: "both" },
  { name: "Oval template", slug: "oval-template", category: "templates", summary: "Printable true ellipse and oval layouts.", units: "both" },
  { name: "Cone pattern", slug: "cone-pattern", category: "templates", summary: "Flat development for frustums and cones.", units: "both" },
  { name: "Bolt circle", slug: "bolt-circle", category: "templates", summary: "Equal hole positions and drill template.", units: "both" },
  { name: "Diameter tape", slug: "diameter-tape", category: "templates", summary: "Wraparound tape that reads diameter directly.", units: "both" },

  { name: "Deck subframe", slug: "deck-subframe", category: "deck", summary: "Stumps, bearers, joists and board estimate.", units: "both", popular: true },
  { name: "Deck board layout", slug: "deck-boards", category: "deck", summary: "Board count, gaps, cuts and cost.", units: "both" },
  { name: "Fence posts and panels", slug: "fence-panels", category: "deck", summary: "Post centers, panel widths and quantities.", units: "both" },
  { name: "Arched fence palings", slug: "arched-fence", category: "deck", summary: "Individual paling heights along an arc.", units: "both" },
  { name: "Paling fence rails", slug: "fence-rails", category: "deck", summary: "Rail joins, post positions and paling count.", units: "both" },
  { name: "Gazebo roof and floor", slug: "gazebo", category: "deck", summary: "Polygon gazebo rafters, floor and plan geometry.", units: "both" },
  { name: "Post holes & concrete", slug: "post-holes", category: "deck", summary: "Hole volumes, bag counts and post centres.", units: "both", popular: true },
  { name: "Decking screws", slug: "decking-screws", category: "deck", summary: "Fixings from the board and joist grid.", units: "both" },

  { name: "Length converter", slug: "length-converter", category: "convert", summary: "Metric, imperial and decimal lengths.", units: "both" },
  { name: "Area converter", slug: "area-converter", category: "convert", summary: "Square units, hectares and acres.", units: "both" },
  { name: "Volume converter", slug: "volume-converter", category: "convert", summary: "Cubic units and liquid measures.", units: "both" },
  { name: "Weight converter", slug: "weight-converter", category: "convert", summary: "Common workshop and construction weights.", units: "both" },
  { name: "Scale from image", slug: "image-scale", category: "convert", summary: "Recover real dimensions from a known feature.", units: "both" },
  { name: "Fraction and decimal", slug: "fraction-decimal", category: "convert", summary: "Fraction wheel and decimal equivalents.", units: "imperial" },
  { name: "Bubble level", slug: "bubble-level", category: "convert", summary: "Device angle and rise-over-run level.", units: "both" },
  { name: "Quote markup & GST", slug: "quote-markup", category: "convert", summary: "Cost to quoted price with markup, GST and margin.", units: "both", popular: true },

  { name: "Square-up diagonal", slug: "square-up", category: "geometry", summary: "Rectangle diagonals and corner verification.", units: "both" },
  { name: "Golden ratio", slug: "golden-ratio", category: "geometry", summary: "Generate related golden-section dimensions.", units: "both" },
  { name: "Pyramid", slug: "pyramid", category: "geometry", summary: "Slant, edge and face dimensions.", units: "both" },
  { name: "Gothic arch", slug: "gothic-arch", category: "geometry", summary: "Pointed arch centers and radius layout.", units: "both" },
  { name: "Curved molding", slug: "curved-molding", category: "geometry", summary: "Segment widths and miter angles for curved trim.", units: "both" },
  { name: "Diagonal bracing", slug: "diagonal-brace", category: "geometry", summary: "Brace length, cut angle and offsets.", units: "both" },
  { name: "Compound miter", slug: "compound-miter", category: "geometry", summary: "Blade and bevel settings from included angles.", units: "both" },

  { name: "Floor area", slug: "floor-area", category: "materials", summary: "Build a rectilinear floor and total its area.", units: "both" },
  { name: "Tile quantity and cost", slug: "tile-quantity", category: "materials", summary: "Tile, box, waste and budget estimate.", units: "both" },
  { name: "Weatherboard cladding", slug: "weatherboard", category: "materials", summary: "Courses, overlap, quantities and cost.", units: "both" },
  { name: "Circular paving", slug: "circular-paving", category: "materials", summary: "Ring counts, cuts and paving quantities.", units: "both" },
  { name: "Timber linear to cubic", slug: "timber-volume", category: "materials", summary: "Convert section and length to material volume.", units: "both" },
  { name: "Lumber board-foot price", slug: "board-foot", category: "materials", summary: "Price per thousand board feet and per piece.", units: "imperial" },
  { name: "Paint coverage", slug: "paint-coverage", category: "materials", summary: "Litres, coats and cans for a wall.", units: "both" },
  { name: "Plasterboard sheets", slug: "plasterboard", category: "materials", summary: "Sheet count, screws and compound.", units: "both", popular: true },
  { name: "Skirting & trim", slug: "skirting", category: "materials", summary: "Lineal trim around a room in stock lengths.", units: "both" },
  { name: "Insulation batts", slug: "insulation-batts", category: "materials", summary: "Batts and packs for an area.", units: "both" },
  { name: "Wallpaper rolls", slug: "wallpaper-rolls", category: "materials", summary: "Drops and rolls from roll size.", units: "both" },
  { name: "Soil & mulch", slug: "soil-mulch", category: "materials", summary: "Cubic metres, bags and tonnes.", units: "both" },
];

// Every route is backed by either a dedicated interactive module or the shared
// verified formula/technical-drawing engine.
export const tools: ToolEntry[] = toolCatalog.map((tool) => ({ ...tool, available: true }));

export const availableTools = tools.filter((tool) => tool.available);
export const popularTools = tools.filter((tool) => tool.popular && tool.available);

export function getTool(slug: string) {
  return tools.find((tool) => tool.slug === slug);
}

export function getCategory(id: string) {
  return categories.find((category) => category.id === id);
}
