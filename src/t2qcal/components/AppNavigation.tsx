"use client";
import {usePathname} from "next/navigation";
import {Ruler,BoundingBox,Folder,Books} from "@phosphor-icons/react";
const tabs=[{path:"calculators",name:"Calculators",Icon:Ruler},{path:"measure",name:"Measure",Icon:BoundingBox},{path:"jobs",name:"Jobs",Icon:Folder},{path:"resources",name:"Resources",Icon:Books}];
export function AppNavigation(){const path=usePathname();return <nav className="native-tabbar" aria-label="T2QCAL app navigation">{tabs.map(({path:tab,name,Icon})=><a key={tab} href={`/t2qcal/${tab}`} aria-current={(tab==="calculators"?(path.includes("calculator")||path==="/t2qcal"):path.startsWith(`/t2qcal/${tab}`))?"page":undefined}><Icon size={24}/><span>{name}</span></a>)}</nav>;}
