import {describe,expect,it} from "vitest";
import {documentPath,formatBytes,matchesQuery,type LibraryResource} from "./resource-library";

const r=(over:Partial<LibraryResource>={}):LibraryResource=>({id:"gib-site-guide",title:"GIB Site Guide",publisher:"Winstone Wallboards",detail:"Fixing and stopping",note:"",group:"linings",groupName:"Plasterboard & linings",page:"",pdf:"https://example.com/x.pdf",...over});

describe("resource library",()=>{
  it("builds in-scope document paths",()=>{expect(documentPath("gib-site-guide")).toBe("/t2qcal/resources/file/gib-site-guide");expect(documentPath("a b")).toBe("/t2qcal/resources/file/a%20b");});
  it("formats sizes for a phone",()=>{expect(formatBytes(500)).toBe("1 KB");expect(formatBytes(3.2*1024*1024)).toBe("3.2 MB");expect(formatBytes(48*1024*1024)).toBe("48 MB");expect(formatBytes(2*1024**3)).toBe("2.0 GB");});
  it("searches title, publisher, detail and group",()=>{expect(matchesQuery(r(),"")).toBe(true);expect(matchesQuery(r(),"winstone")).toBe(true);expect(matchesQuery(r(),"stopping")).toBe(true);expect(matchesQuery(r(),"linings")).toBe(true);expect(matchesQuery(r(),"mitek")).toBe(false);});
});
