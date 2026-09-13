import catalog from "./native-catalog.json";
import type {LibraryResource} from "./resource-library";

/**
 * Which manuals and standards belong under each calculator.
 *
 * Every calculator gets the two documents a NZ builder is measured against —
 * NZS 3604 and B1 Structure — then the manuals for its trade, then anything
 * specific to the individual tool. Ids are catalogue ids (native-catalog.json);
 * the test proves each one exists.
 */
export const CORE_STANDARDS=["nzs3604","nzbc-b1"];

export const RESOURCES_BY_CATEGORY:Record<string,string[]>={
  roof:["mitek-truss-manual","mitek-truss-install","mitek-purlin","mitek-roof-bracing","mitek-gable-bracing","nzmrm-cop","nzbc-e2","worksafe-height"],
  stairs:["nzbc-d1","nzbc-f4","mitek-stair-bracket","pryda-builders","worksafe-height"],
  spacing:["gib-site-guide","mitek-stud-topplate","mitek-stud-bottomplate","mitek-lintel","mitek-topplate-joint","pryda-builders"],
  concrete:["ccanz-ms17","ccanz-tm38","firth-ribraft","firth-paving","mitek-pile-12kn","worksafe-excavation"],
  metal:["codehub","mitek-timber-strength","worksafe-height"],
  templates:["codehub","nzmrm-cop","mitek-easyfix"],
  deck:["mitek-deck-joist","mitek-joist-hangers","mitek-lumberlok","mitek-durability","mitek-exposure-map","nzbc-f4","pryda-connectors"],
  convert:["codehub","nzbc-b2"],
  geometry:["codehub","mitek-timber-strength","pryda-builders"],
  materials:["gib-range","gib-site-guide","jh-best-practice","chh-ecoply","resene-paint-quantity","mitek-durability"],
};

export const RESOURCES_BY_SLUG:Record<string,string[]>={
  "spouting-downpipes":["nzbc-e1","nzmrm-cop"],
  "soffit-drop":["jh-eaves","nzmrm-cop"],
  "hip-valley-sheet":["nzmrm-cop","nzmrm-cop-codehub"],
  "bullnose-roof":["nzmrm-cop"],
  "rafter-templates":["mitek-truss-install"],
  "baluster-spacing":["nzbc-f4","nzbc-d1"],
  "stair-panels":["nzbc-f4"],
  "access-ramp":["nzbc-d1"],
  "wall-framing":["gib-ezybrace","jh-bracing","mitek-lintel"],
  "opening-layout":["mitek-lintel","jh-junctions"],
  "board-batten":["chh-shadowclad","jh-junctions"],
  "wainscoting":["gib-site-guide"],
  "rebar-spacing":["ccanz-tm38","firth-ribraft"],
  "fastener-spacing":["pryda-fasteners","mitek-easyfix"],
  "glass-panels":["nzbc-f4"],
  "concrete-slab":["firth-ribraft","ccanz-tm38"],
  "slab-edge-beams":["firth-ribraft"],
  "block-quantities":["cnz-basement","ccanz-ms17"],
  "circular-block-wall":["cnz-basement"],
  "masonry-arch":["ccanz-ms17"],
  "excavation":["worksafe-excavation","cnz-basement"],
  "strip-footing":["ccanz-tm38","mitek-pile-12kn"],
  "brick-quantities":["ccanz-ms17"],
  "brick-gauge":["ccanz-ms17"],
  "starter-bars":["ccanz-tm38"],
  "pipe-fall":["nzbc-g13","nzbc-e1"],
  "deck-subframe":["mitek-deck-joist","mitek-joist-hangers","nzbc-f4"],
  "deck-boards":["mitek-durability","mitek-exposure-map"],
  "post-holes":["mitek-pile-12kn","worksafe-excavation"],
  "decking-screws":["pryda-fasteners","mitek-durability"],
  "fence-panels":["mitek-durability"],
  "arched-fence":["mitek-durability"],
  "fence-rails":["mitek-durability"],
  "gazebo":["mitek-truss-install","nzmrm-cop"],
  "diagonal-brace":["gib-ezybrace","jh-bracing","mitek-roof-bracing"],
  "compound-miter":["jh-eaves"],
  "curved-molding":["gib-site-guide"],
  "weatherboard":["jh-linea-cavity","jh-linea-direct","jh-hardieplank","nzbc-e2"],
  "plasterboard":["gib-site-guide","gib-range","gib-fire","gib-noise"],
  "skirting":["gib-site-guide"],
  "insulation-batts":["nzbc-h1"],
  "paint-coverage":["resene-paint-quantity"],
  "tile-layout":["nzbc-e3","jh-villaboard","jh-secura"],
  "tile-quantity":["nzbc-e3","jh-villaboard"],
  "floor-area":["jh-secura","chh-ecoply"],
  "circular-paving":["firth-paving"],
  "paving-ring":["firth-paving"],
  "timber-volume":["mitek-timber-strength"],
  "board-foot":["mitek-timber-strength"],
  "bubble-level":["nzs3604"],
  "quote-markup":["codehub"],
};

const byId=new Map(catalog.resources.map(r=>[r.id,r as LibraryResource]));

/** Standards, codes and manuals to show under a calculator, most specific first. */
export function resourcesForTool(slug:string,category:string,limit=9):LibraryResource[]{
  const ids=[...CORE_STANDARDS,...(RESOURCES_BY_SLUG[slug]??[]),...(RESOURCES_BY_CATEGORY[category]??[])];
  const out:LibraryResource[]=[];
  for(const id of ids){const r=byId.get(id);if(r&&!out.includes(r))out.push(r);}
  return out.slice(0,limit);
}
