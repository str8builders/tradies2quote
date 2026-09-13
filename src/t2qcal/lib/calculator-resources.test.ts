import {describe,expect,it} from "vitest";
import catalog from "./native-catalog.json";
import {CORE_STANDARDS,RESOURCES_BY_CATEGORY,RESOURCES_BY_SLUG,resourcesForTool} from "./calculator-resources";

const ids=new Set(catalog.resources.map(r=>r.id));
const slugs=new Set(catalog.tools.map(t=>t.slug));

describe("calculator resources",()=>{
  it("only references documents that exist in the catalogue",()=>{
    for(const id of [...CORE_STANDARDS,...Object.values(RESOURCES_BY_CATEGORY).flat(),...Object.values(RESOURCES_BY_SLUG).flat()])expect(ids.has(id),id).toBe(true);
  });
  it("only references calculators that exist",()=>{
    for(const slug of Object.keys(RESOURCES_BY_SLUG))expect(slugs.has(slug),slug).toBe(true);
  });
  it("covers every category with NZS 3604 and B1 first, then trade manuals",()=>{
    for(const cat of catalog.categories){
      expect(RESOURCES_BY_CATEGORY[cat.id]?.length??0,cat.id).toBeGreaterThanOrEqual(2);
      const tool=catalog.tools.find(t=>t.category===cat.id)!;
      const list=resourcesForTool(tool.slug,cat.id);
      expect(list[0].id).toBe("nzs3604");expect(list[1].id).toBe("nzbc-b1");
      expect(list.length).toBeGreaterThanOrEqual(4);
      expect(new Set(list.map(r=>r.id)).size).toBe(list.length);
    }
  });
  it("puts a tool's own documents before its category's",()=>{
    const list=resourcesForTool("spouting-downpipes","roof").map(r=>r.id);
    expect(list.slice(2,4)).toEqual(["nzbc-e1","nzmrm-cop"]);
    expect(resourcesForTool("common-rafter","roof").length).toBeLessThanOrEqual(9);
  });
});
