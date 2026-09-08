"use client";

import { useState } from "react";
import { useCalculationSeed, useCalculationValue } from "./CalculationSeed";
import type { ToolEntry } from "@/t2qcal/lib/tools";
import { VerifiedCalculator } from "./VerifiedCalculator";
import { calculateCircle, calculateConcrete, calculateEqualSpacing, calculatePitch, calculateRafter, calculateStairs, calculateTileFit, convertLength } from "@/t2qcal/lib/calculations";
import { angleLabel, CalculatorFrame, dimension, DimensionLine, hairline, infoLines, line, member, nfmt, note, NumberField, plate, ResultGrid, SectionHead, SelectField, setOutMark, setupCanvas, shape, TechnicalCanvas, wood, type UnitSystem } from "./CalculatorUI";

const toImperial = (value: number) => value / 25.4;
const toMetric = (value: number) => value * 25.4;

function useUnits(initial: UnitSystem = "metric") {
  const saved = useCalculationSeed();
  const [unit, setUnit] = useState<UnitSystem>(saved?.snapshot.unit ?? initial);
  const unitLabel = unit === "metric" ? "mm" : "in";
  return { unit, setUnit, unitLabel };
}

function RafterCalculator({ tool }: { tool: ToolEntry }) {
  const { unit, setUnit, unitLabel } = useUnits();
  const [run,setRun]=useCalculationValue<number>("run",3000);
  const [angle,setAngle]=useCalculationValue<number>("angle",22.5);
  const [overhang,setOverhang]=useCalculationValue<number>("overhang",450);
  const [depth,setDepth]=useCalculationValue<number>("depth",190);
  const [thickness,setThickness]=useCalculationValue<number>("thickness",45);
  const [seat,setSeat]=useCalculationValue<number>("seat",90);
  const [wallHeight,setWallHeight]=useCalculationValue<number>("wallHeight",2400);
  const { radians, rise, mainLength, tail, totalLength, plumbCut, birdPlumb, pitch12, ridgeElevation } = calculateRafter(run, angle, overhang, depth, seat, wallHeight);

  function changeUnit(next: UnitSystem) {
    if (next === unit) return;
    const convert = next === "imperial" ? toImperial : toMetric;
    setRun((v) => convert(v)); setOverhang((v) => convert(v));
    setDepth((v) => convert(v)); setThickness((v) => convert(v));
    setSeat((v) => convert(v)); setWallHeight((v) => convert(v)); setUnit(next);
  }

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    setupCanvas(ctx, width, height);
    const pad = Math.max(72, width * 0.09);
    const scale = Math.min((width-pad*2)/Math.max(run+overhang,1e-9), (height*.44)/Math.max((run+overhang)*Math.tan(radians)+depth,1e-9));
    const baseY=height-84-overhang*Math.tan(radians)*scale;
    const roofRun=run*scale, roofRise=rise*scale;
    const startX=pad, wallX=startX+overhang*scale, ridgeX=wallX+roofRun, ridgeY=baseY-roofRise;
    const tailY=baseY+overhang*Math.tan(radians)*scale;
    hairline(ctx, pad - 24, baseY, width - pad + 24, baseY);
    plate(ctx, wallX - 12, baseY, 24, height - baseY - 44);
    member(ctx, startX, tailY, ridgeX, ridgeY, Math.max(1, depth * scale), wood(ctx));
    plate(ctx, ridgeX - 5, ridgeY - 6, 10, 26);
    plate(ctx, wallX - 6, baseY - 7, Math.max(9, seat / Math.max(run, 1) * roofRun), 7);
    dimension(ctx, wallX, baseY, ridgeX, baseY, `Run ${nfmt(run)}`, "#000", 44);
    dimension(ctx, ridgeX, baseY, ridgeX, ridgeY, `Rise ${nfmt(rise)}`, "#000", 46);
    dimension(ctx, startX, tailY, ridgeX, ridgeY, `Rafter Total Length ${nfmt(totalLength)}`, "#000", -22);
    angleLabel(ctx, `${nfmt(angle, 2)}°`, startX - 12, tailY - 16, "right");
    infoLines(ctx, [
      `Roof Pitch ${nfmt(angle, 2)}° ~ ${nfmt(pitch12, 2)}:12`,
      `Plumb Cut ${nfmt(plumbCut)} - Birdsmouth Plumb ${nfmt(birdPlumb)} ${unitLabel}`,
      `Ridge Elevation ${nfmt(ridgeElevation)} - Tail ${nfmt(tail)} ${unitLabel}`,
    ], width / 2, 32);
  };

  return <CalculatorFrame values={{run,angle,overhang,depth,thickness,seat,wallHeight}} tool={tool} unit={unit} onUnitChange={changeUnit}>
    <div className="calculator-workbench">
      <section className="input-panel">
        <SectionHead index="01" title="Rafter inputs" note="Change a value or drag a fine-control slider." />
        <div className="field-grid">
          <NumberField label="Run to outer wall" value={run} onChange={setRun} unit={unitLabel} min={unit === "metric" ? 300 : 12} max={unit === "metric" ? 12000 : 480} step={unit === "metric" ? 10 : .125} range />
          <NumberField label="Roof angle" value={angle} onChange={setAngle} unit="°" min={1} max={60} step={.25} range />
          <NumberField label="Level overhang" value={overhang} onChange={setOverhang} unit={unitLabel} min={0} max={unit === "metric" ? 1500 : 60} step={unit === "metric" ? 5 : .125} />
          <NumberField label="Rafter depth" value={depth} onChange={setDepth} unit={unitLabel} min={1} />
          <NumberField label="Rafter thickness" value={thickness} onChange={setThickness} unit={unitLabel} min={1} />
          <NumberField label="Birdsmouth seat" value={seat} onChange={setSeat} unit={unitLabel} min={0} max={depth * .8} />
          <NumberField label="Wall plate height" value={wallHeight} onChange={setWallHeight} unit={unitLabel} min={0} />
        </div>
      </section>
      <section className="diagram-panel">
        <div className="diagram-toolbar"><span>Live rafter profile</span><span>Scale to fit · {unitLabel}</span></div>
        <TechnicalCanvas draw={draw} label="Rafter profile with run, rise, angle and birdsmouth dimensions" model={{kind:"roof",values:{run,rise,angle,width:run*2,length:run*2,height:rise,totalLength},unit:unitLabel,title:"Common rafter"}} />
      </section>
    </div>
    <section className="results-section">
      <SectionHead index="02" title="Cutting dimensions" note="Finished geometric dimensions before site tolerances." />
      <ResultGrid results={[
        { label: "Rafter length to ridge", value: `${nfmt(mainLength)} ${unitLabel}`, primary: true },
        { label: "Overall stock length", value: `${nfmt(totalLength)} ${unitLabel}` },
        { label: "Roof rise", value: `${nfmt(rise)} ${unitLabel}` },
        { label: "Plumb cut length", value: `${nfmt(plumbCut)} ${unitLabel}` },
        { label: "Birdsmouth plumb", value: `${nfmt(birdPlumb)} ${unitLabel}` },
        { label: "Ridge elevation", value: `${nfmt(ridgeElevation)} ${unitLabel}` },
        { label: "Pitch ratio", value: `${nfmt(pitch12, 2)} : 12` },
        { label: "Tail length", value: `${nfmt(tail)} ${unitLabel}` },
      ]} />
    </section>
  </CalculatorFrame>;
}

function StairCalculator({ tool }: { tool: ToolEntry }) {
  const { unit, setUnit, unitLabel } = useUnits();
  const [totalRise,setTotalRise]=useCalculationValue<number>("totalRise",2800); const [idealRise,setIdealRise]=useCalculationValue<number>("idealRise",175);
  const [run,setRun]=useCalculationValue<number>("run",250); const [width,setWidth]=useCalculationValue<number>("width",1000); const [floorThickness,setFloorThickness]=useCalculationValue<number>("floorThickness",260);
  const [headroom,setHeadroom]=useCalculationValue<number>("headroom",unit === "metric" ? 2000 : 2000/25.4);
  const { risers, actualRise, treads, totalRun, angle, stringer, stockGuide, openingRun } = calculateStairs(totalRise, idealRise, run, floorThickness, headroom);
  function changeUnit(next: UnitSystem) { if (next === unit) return; const c = next === "imperial" ? toImperial : toMetric; [setTotalRise,setIdealRise,setRun,setWidth,setFloorThickness,setHeadroom].forEach((setter) => setter((v) => c(v))); setUnit(next); }
  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    setupCanvas(ctx, w, h);
    const pad = 72, base = h - 76, top = 74, usableW = w - pad * 2, usableH = base - top;
    const scale = Math.min(usableW / Math.max(totalRun,1e-9), usableH / Math.max(totalRise,1e-9));
    const sx = run * scale, sy = actualRise * scale;
    const topX = pad + treads * sx, topY = base - risers * sy;
    // stringer band swept below the nosing line, then treads on top
    const drop = Math.max(26, sy * 0.95);
    const firstNosing=base-sy;
    const dx = topX - pad, dy = topY - firstNosing, len = Math.hypot(dx, dy) || 1;
    const ox = -dy / len * drop, oy = dx / len * drop;
    shape(ctx, [{ x: pad, y: firstNosing }, { x: topX, y: topY }, { x: topX + ox, y: topY + oy }, { x: pad + ox, y: firstNosing + oy }], wood(ctx), "#000", 1);
    for (let i = 0; i < treads; i++) {
      const ty = base - (i + 1) * sy;
      plate(ctx, pad + i * sx, ty, 4, sy);          // riser
      plate(ctx, pad + i * sx, ty - 7, sx, 7);      // tread
    }
    hairline(ctx, pad, firstNosing, topX, topY);
    // upper-floor landing at the top nosing level — the context blocklayer shows
    if (floorThickness > 0 && w - topX > 46) {
      const thkPx = Math.min(Math.max(floorThickness * (risers * sy) / totalRise, 7), 46);
      shape(ctx, [{ x: topX, y: topY }, { x: w - 8, y: topY }, { x: w - 8, y: topY + thkPx }, { x: topX, y: topY + thkPx }], wood(ctx), "#000", 1);
      note(ctx, `\u2195 ${nfmt(floorThickness)}`, w - 14, topY + thkPx + 14, "#000", "right", 11);
    }
    dimension(ctx, pad, base, topX, base, `Total Run ${nfmt(totalRun)}`, "#000", 42);
    dimension(ctx, topX, base, topX, topY, `Total Rise ${nfmt(totalRise)}`, "#000", 44);
    angleLabel(ctx, `${nfmt(angle, 2)}°`, pad - 12, base - 20, "right");
    infoLines(ctx, [
      `${risers} Rises @ ${nfmt(actualRise, 2)} - ${treads} Runs @ ${nfmt(run, 2)}`,
      `Stringer Line ${nfmt(stringer)} - Stair Width ${nfmt(width)} ${unitLabel}`,
      `Floor Opening ${nfmt(openingRun)} ${unitLabel}`,
    ], pad, 30, "left");
  };
  const marks = Array.from({length:treads},(_,i)=>`${nfmt((i+1)*run)} ${unitLabel}  ·  rise ${nfmt((i+1)*actualRise)} ${unitLabel}`);
  return <CalculatorFrame values={{totalRise,idealRise,run,width,floorThickness,headroom}} tool={tool} unit={unit} onUnitChange={changeUnit}>
    <div className="calculator-workbench">
      <section className="input-panel"><SectionHead index="01" title="Stair inputs" note="All rises are balanced evenly into the total rise." /><div className="field-grid">
        <NumberField label="Finished total rise" value={totalRise} onChange={setTotalRise} unit={unitLabel} min={1} range max={unit === "metric" ? 5000 : 200} step={unit === "metric" ? 5 : .125} />
        <NumberField label="Preferred riser" value={idealRise} onChange={setIdealRise} unit={unitLabel} min={1} />
        <NumberField label="Tread run" value={run} onChange={setRun} unit={unitLabel} min={1} range max={unit === "metric" ? 450 : 18} step={unit === "metric" ? 5 : .125} />
        <NumberField label="Stair width" value={width} onChange={setWidth} unit={unitLabel} min={1} />
        <NumberField label="Required vertical headroom" value={headroom} onChange={setHeadroom} unit={unitLabel} min={0} />
        <NumberField label="Upper floor thickness" value={floorThickness} onChange={setFloorThickness} unit={unitLabel} min={0} />
      </div></section>
      <section className="diagram-panel"><div className="diagram-toolbar"><span>Stringer set-out</span><span>{risers} rises · {treads} treads</span></div><TechnicalCanvas draw={draw} label="Straight stair side profile with equal rises and tread runs" model={{kind:"stairs",values:{risers,totalRun,totalRise,width,run,rise:actualRise,floorThickness,headroom,openingRun},unit:unitLabel,title:"Straight stairs"}} /></section>
    </div>
    <section className="results-section"><SectionHead index="02" title="Stair geometry" /><ResultGrid results={[
      {label:"Actual rise",value:`${nfmt(actualRise,2)} ${unitLabel}`,primary:true},{label:"Number of rises",value:String(risers)},{label:"Number of treads",value:String(treads)},{label:"Total run",value:`${nfmt(totalRun)} ${unitLabel}`},{label:"Stair angle",value:`${nfmt(angle,2)}°`},{label:"Stringer line",value:`${nfmt(stringer)} ${unitLabel}`},{label:"Clear width",value:`${nfmt(width)} ${unitLabel}`},{label:"Stringer stock guide",value:`${nfmt(stockGuide)} ${unitLabel}`},{label:"Opening for entered headroom",value:`${nfmt(openingRun)} ${unitLabel}`},
    ]} /></section>
    <section className="markout-section"><SectionHead index="03" title="Running stringer marks" note="Horizontal run · vertical rise from the first nosing datum." /><DimensionLine values={marks} /></section>
  </CalculatorFrame>;
}

function SpacingCalculator({ tool }: { tool: ToolEntry }) {
  const { unit, setUnit, unitLabel } = useUnits(); const [span,setSpan]=useCalculationValue<number>("span",3600);const [width,setWidth]=useCalculationValue<number>("width",45);const [target,setTarget]=useCalculationValue<number>("target",450);
  const { count, gap, center, marks } = calculateEqualSpacing(span, width, target);
  function changeUnit(next:UnitSystem){if(next===unit)return;const c=next==="imperial"?toImperial:toMetric;setSpan(v=>c(v));setWidth(v=>c(v));setTarget(v=>c(v));setUnit(next);}
  const draw=(ctx:CanvasRenderingContext2D,w:number,h:number)=>{
    setupCanvas(ctx,w,h);
    const pad=66, planTop=h*0.28, planH=h*0.40, usable=w-pad*2;
    plate(ctx,pad,planTop,usable,planH,"#ebebeb","#aaa");
    marks.forEach((m)=>{
      const x=pad+m/span*usable;
      const bw=Math.max(4,width/span*usable);
      plate(ctx,x-bw/2,planTop,bw,planH,wood(ctx));
      // blue running set-out figure printed up the member, as on blocklayer plans
      setOutMark(ctx,nfmt(m,1),x-3,planTop+planH-12);
    });
    dimension(ctx,pad,planTop+planH,pad+usable,planTop+planH,`${nfmt(span)} ${unitLabel} Overall`,"#000",44);
    infoLines(ctx,[
      `${count} Members - Clear Gap ${nfmt(gap,2)} ${unitLabel}`,
      `Centres ${nfmt(center,2)} ${unitLabel} - Member Width ${nfmt(width)} ${unitLabel}`,
    ],w/2,32);
  };
  return <CalculatorFrame values={{span,width,target}} tool={tool} unit={unit} onUnitChange={changeUnit}><div className="calculator-workbench"><section className="input-panel"><SectionHead index="01" title="Spacing inputs" note="Includes equal end margins."/><div className="field-grid"><NumberField label="Overall span" value={span} onChange={setSpan} unit={unitLabel} min={1}/><NumberField label="Member width" value={width} onChange={setWidth} unit={unitLabel} min={0}/><NumberField label="Target clear gap" value={target} onChange={setTarget} unit={unitLabel} min={0} range max={unit==="metric"?1200:48}/></div></section><section className="diagram-panel"><div className="diagram-toolbar"><span>Equal spacing plan</span><span>{count} members</span></div><TechnicalCanvas draw={draw} label="Equal member spacing plan" height={420} model={{kind:"spacing",values:{span,width,memberWidth:width,targetGap:target,count,gap,spacing:center},unit:unitLabel,title:"Equal spacing"}}/></section></div><section className="results-section"><SectionHead index="02" title="Balanced layout"/><ResultGrid results={[{label:"Clear gap",value:`${nfmt(gap,2)} ${unitLabel}`,primary:true},{label:"Member count",value:String(count)},{label:"Center to center",value:`${nfmt(center,2)} ${unitLabel}`},{label:"End margins",value:`${nfmt(gap,2)} ${unitLabel}`}]}/></section><section className="markout-section"><SectionHead index="03" title="Running center marks"/><DimensionLine values={marks.map((m)=>`${nfmt(m,2)} ${unitLabel}`)}/></section></CalculatorFrame>;
}

function ConcreteCalculator({ tool }: { tool: ToolEntry }) {
  const {unit,setUnit,unitLabel}=useUnits();const [length,setLength]=useCalculationValue<number>("length",6000);const [width,setWidth]=useCalculationValue<number>("width",4000);const [thickness,setThickness]=useCalculationValue<number>("thickness",100);const [waste,setWaste]=useCalculationValue<number>("waste",8);const [rate,setRate]=useCalculationValue<number>("rate",240);
  const metric=unit==="metric";const { area, rawVolume: raw, orderVolume: order, weight }=calculateConcrete(length,width,thickness,waste,metric);const cost=(metric?order:order/27)*rate;
  function changeUnit(next:UnitSystem){if(next===unit)return;const c=next==="imperial"?toImperial:toMetric;setLength(v=>c(v));setWidth(v=>c(v));setThickness(v=>c(v));setRate(v=>next==="imperial"?v*0.764554857984:v/0.764554857984);setUnit(next);}
  const draw=(ctx:CanvasRenderingContext2D,w:number,h:number)=>{
    setupCanvas(ctx,w,h);
    const x=w*.17,y=h*.26,pw=w*.64,ph=h*.44;
    plate(ctx,x,y,pw,ph);
    for(let i=1;i<6;i++) hairline(ctx,x+i*pw/6,y,x+i*pw/6,y+ph);
    for(let i=1;i<4;i++) hairline(ctx,x,y+i*ph/4,x+pw,y+i*ph/4);
    dimension(ctx,x,y+ph,x+pw,y+ph,`${nfmt(length)}`,"#000",44);
    dimension(ctx,x,y,x,y+ph,`${nfmt(width)}`,"#000",44);
    infoLines(ctx,[
      `Slab ${nfmt(length)} x ${nfmt(width)} x ${nfmt(thickness)} ${unitLabel}`,
      `Plan Area ${nfmt(area,2)} ${metric?"m²":"ft²"}`,
      [`Order Volume ${nfmt(metric?order:order/27,3)} ${metric?"m³":"yd³"} incl. ${nfmt(waste)}% allowance`,"#f00"],
    ],w/2,32);
  };
  return <CalculatorFrame values={{length,width,thickness,waste,rate}} tool={tool} unit={unit} onUnitChange={changeUnit}><div className="calculator-workbench"><section className="input-panel"><SectionHead index="01" title="Slab inputs"/><div className="field-grid"><NumberField label="Length" value={length} onChange={setLength} unit={unitLabel} min={1}/><NumberField label="Width" value={width} onChange={setWidth} unit={unitLabel} min={1}/><NumberField label="Thickness" value={thickness} onChange={setThickness} unit={unitLabel} min={1}/><NumberField label="Order allowance" value={waste} onChange={setWaste} unit="%" min={0} max={30} range/><NumberField label={`Concrete rate / ${metric?"m³":"yd³"}`} value={rate} onChange={setRate} unit="$" min={0}/></div></section><section className="diagram-panel"><div className="diagram-toolbar"><span>Slab plan</span><span>Scale to fit</span></div><TechnicalCanvas draw={draw} label="Concrete slab plan dimensions" height={430} model={{kind:"slab3d",values:{length,width,thickness,height:thickness,rows:4,columns:7},unit:unitLabel,title:"Concrete slab"}}/></section></div><section className="results-section"><SectionHead index="02" title="Order quantities"/><ResultGrid results={metric?[{label:"Order volume",value:`${nfmt(order,3)} m³`,primary:true},{label:"Net volume",value:`${nfmt(raw,3)} m³`},{label:"Plan area",value:`${nfmt(area,2)} m²`},{label:"Approx. weight",value:`${nfmt(weight,0)} kg`},{label:"Order allowance",value:`${nfmt(order-raw,3)} m³`},{label:"Estimated concrete",value:`$${nfmt(cost,2)}`}]:[{label:"Order volume",value:`${nfmt(order/27,3)} yd³`,primary:true},{label:"Net volume",value:`${nfmt(raw/27,3)} yd³`},{label:"Plan area",value:`${nfmt(area,2)} ft²`},{label:"Approx. weight",value:`${nfmt(weight,0)} lb`},{label:"Order allowance",value:`${nfmt((order-raw)/27,3)} yd³`},{label:"Estimated concrete",value:`$${nfmt(cost,2)}`}]}/></section></CalculatorFrame>;
}

function TileCalculator({ tool }: { tool: ToolEntry }) {
  const {unit,setUnit,unitLabel}=useUnits();const [floor,setFloor]=useCalculationValue<number>("floor",3600);const [tile,setTile]=useCalculationValue<number>("tile",600);const [joint,setJoint]=useCalculationValue<number>("joint",3);const [rowsInput,setRows]=useCalculationValue<number>("rowsInput",5);const [waste,setWaste]=useCalculationValue<number>("waste",10);
  const rows=Math.max(1,Math.min(24,Math.round(Number.isFinite(rowsInput)?rowsInput:5)));
  const {count,edge,marks}=calculateTileFit(floor,tile,joint);const totalTiles=Math.ceil(count*rows*(1+waste/100));
  function changeUnit(next:UnitSystem){if(next===unit)return;const c=next==="imperial"?toImperial:toMetric;setFloor(v=>c(v));setTile(v=>c(v));setJoint(v=>c(v));setUnit(next);}
  const draw=(ctx:CanvasRenderingContext2D,w:number,h:number)=>{
    setupCanvas(ctx,w,h);
    const pad=58,y=h*.26,usable=w-pad*2,rowH=Math.min(52,(h*.48)/rows);
    for(let r=0;r<rows;r++){
      let x=pad;
      for(let i=0;i<count;i++){
        const tw=(i===0||i===count-1?edge:tile)/floor*usable;
        const cut=i===0||i===count-1;
        plate(ctx,x,y+r*rowH,Math.max(2,tw-joint/floor*usable),rowH-3,cut?"#e0e0e0":"#f4f4f4","#888");
        x+=tw+joint/floor*usable;
      }
    }
    dimension(ctx,pad,y+rows*rowH,pad+usable,y+rows*rowH,`${nfmt(floor)}`,"#000",42);
    infoLines(ctx,[
      `${count} Tiles across @ ${nfmt(tile)} ${unitLabel} - Joint ${nfmt(joint)} ${unitLabel}`,
      [`Equal Edge Cuts ${nfmt(edge,2)} ${unitLabel}`,"#f00"],
    ],w/2,32);
  };
  return <CalculatorFrame values={{floor,tile,joint,rowsInput,waste}} tool={tool} unit={unit} onUnitChange={changeUnit}><div className="calculator-workbench"><section className="input-panel"><SectionHead index="01" title="Tile fit inputs" note="Balances the first and last cuts."/><div className="field-grid"><NumberField label="Floor width" value={floor} onChange={setFloor} unit={unitLabel} min={1}/><NumberField label="Tile width" value={tile} onChange={setTile} unit={unitLabel} min={1}/><NumberField label="Joint width" value={joint} onChange={setJoint} unit={unitLabel} min={0}/><NumberField label="Rows to draw" value={rows} onChange={setRows} min={1} max={12}/><NumberField label="Waste allowance" value={waste} onChange={setWaste} unit="%" min={0} max={30}/></div></section><section className="diagram-panel"><div className="diagram-toolbar"><span>Live tile layout</span><span>{count} tiles across</span></div><TechnicalCanvas draw={draw} label="Balanced tile rows with equal end cuts" height={440} model={{kind:"tilerow",values:{length:floor,width:floor,span:floor,count,rows,columns:count,gap:joint,memberWidth:tile},unit:unitLabel,title:"Tile layout"}}/></section></div><section className="results-section"><SectionHead index="02" title="Balanced fit"/><ResultGrid results={[{label:"Equal end cuts",value:`${nfmt(edge,2)} ${unitLabel}`,primary:true},{label:"Tiles across",value:String(count)},{label:"Drawn tile count",value:String(count*rows)},{label:"Order with waste",value:`${totalTiles} tiles`},{label:"Joint width",value:`${nfmt(joint)} ${unitLabel}`}]}/></section><section className="markout-section"><SectionHead index="03" title="Running tile edges"/><DimensionLine values={marks.map(m=>`${nfmt(m,2)} ${unitLabel}`)}/></section></CalculatorFrame>;
}

function ArcCalculator({ tool }: { tool: ToolEntry }) {
  const {unit,setUnit,unitLabel}=useUnits();const [diameter,setDiameter]=useCalculationValue<number>("diameter",1200);const [segmentsInput,setSegments]=useCalculationValue<number>("segmentsInput",12);
  const segments=Math.max(3,Math.min(96,Math.round(Number.isFinite(segmentsInput)?segmentsInput:12)));const {radius,circumference,angle,chord,sagitta,halfMiter}=calculateCircle(diameter,segments);
  function changeUnit(next:UnitSystem){if(next===unit)return;const c=next==="imperial"?toImperial:toMetric;setDiameter(v=>c(v));setUnit(next);}
  const draw=(ctx:CanvasRenderingContext2D,w:number,h:number)=>{
    setupCanvas(ctx,w,h);
    const r=Math.min(w,h)*.33,cx=w/2,cy=h*.52;
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.strokeStyle="#000";ctx.lineWidth=1;ctx.stroke();
    for(let i=0;i<segments;i++){
      const a=i*Math.PI*2/segments-Math.PI/2;
      const px=cx+Math.cos(a)*r,py=cy+Math.sin(a)*r;
      // stops short of the centre so the info block stays clear
      hairline(ctx,cx+Math.cos(a)*r*.36,cy+Math.sin(a)*r*.36,px,py);
      line(ctx,px,py,cx+Math.cos(a)*(r+9),cy+Math.sin(a)*(r+9),"#000",1);
      ctx.save();
      ctx.font="11px Verdana, Geneva, sans-serif";
      ctx.translate(cx+Math.cos(a)*(r+22),cy+Math.sin(a)*(r+22));
      let rot=a+Math.PI/2;
      if(rot>Math.PI/2&&rot<Math.PI*1.5) rot+=Math.PI;
      ctx.rotate(rot);ctx.textAlign="center";ctx.fillStyle="#000";
      ctx.fillText(String(i+1),0,0);
      ctx.restore();
    }
    infoLines(ctx,[
      `${segments} Divisions of ${nfmt(angle,3)}°`,
      `Circumference ${nfmt(circumference,2)}`,
      `Diameter ${nfmt(diameter)}`,
      `Chord ${nfmt(chord,2)} - Rise ${nfmt(sagitta,2)}`,
    ],cx,cy-28);
    dimension(ctx,cx-r,cy,cx+r,cy,`Ø ${nfmt(diameter)} ${unitLabel}`,"#000",r+40);
  };
  return <CalculatorFrame values={{diameter,segmentsInput}} tool={tool} unit={unit} onUnitChange={changeUnit}><div className="calculator-workbench"><section className="input-panel"><SectionHead index="01" title="Circle inputs"/><div className="field-grid"><NumberField label="Diameter" value={diameter} onChange={setDiameter} unit={unitLabel} min={1} range max={unit==="metric"?5000:200}/><NumberField label="Equal segments" value={segments} onChange={v=>setSegments(Math.max(3,Math.round(v)))} min={3} max={48} range/></div></section><section className="diagram-panel"><div className="diagram-toolbar"><span>Divided circle</span><span>True geometry</span></div><TechnicalCanvas draw={draw} label="Circle divided into equal segments" height={460} model={{kind:"circle",values:{diameter,segments,count:segments,radius},unit:unitLabel,title:"Arc and circle"}}/></section></div><section className="results-section"><SectionHead index="02" title="Circle geometry"/><ResultGrid results={[{label:"Circumference",value:`${nfmt(circumference,2)} ${unitLabel}`,primary:true},{label:"Radius",value:`${nfmt(radius,2)} ${unitLabel}`},{label:"Angle per segment",value:`${nfmt(angle,3)}°`},{label:"Chord length",value:`${nfmt(chord,2)} ${unitLabel}`},{label:"Segment rise",value:`${nfmt(sagitta,2)} ${unitLabel}`},{label:"Half miter",value:`${nfmt(halfMiter,3)}°`}]}/></section></CalculatorFrame>;
}

const lengthUnits=[{value:"mm",label:"Millimetres",factor:.001},{value:"cm",label:"Centimetres",factor:.01},{value:"m",label:"Metres",factor:1},{value:"km",label:"Kilometres",factor:1000},{value:"in",label:"Inches",factor:.0254},{value:"ft",label:"Feet",factor:.3048},{value:"yd",label:"Yards",factor:.9144},{value:"mi",label:"Miles",factor:1609.344}];
function ConverterCalculator({tool}:{tool:ToolEntry}){const {unit,setUnit}=useUnits();const [value,setValue]=useCalculationValue<number>("value",2400);const [from,setFrom]=useCalculationValue<string>("from","mm");const [to,setTo]=useCalculationValue<string>("to","ft");const source=lengthUnits.find(u=>u.value===from)!;const target=lengthUnits.find(u=>u.value===to)!;const result=convertLength(value,source.factor,target.factor);const inches=convertLength(value,source.factor,.0254);const feet=Math.floor(inches/12);const inchRemainder=inches-feet*12;
  return <CalculatorFrame values={{value,from,to}} tool={tool} unit={unit} onUnitChange={setUnit}><section className="converter-card"><SectionHead index="01" title="Convert a length" note="Every result updates as you type."/><div className="converter-row"><NumberField label="Value" value={value} onChange={setValue}/><SelectField label="From" value={from} onChange={setFrom} options={lengthUnits}/><span className="converter-arrow">→</span><SelectField label="To" value={to} onChange={setTo} options={lengthUnits}/></div><div className="converter-result"><span>{nfmt(value,6)} {source.value}</span><b>=</b><strong>{nfmt(result,8)} {target.value}</strong></div><div className="conversion-strip">{lengthUnits.map(u=><button key={u.value} onClick={()=>setTo(u.value)}><span>{u.value}</span><b>{nfmt(value*source.factor/u.factor,6)}</b></button>)}</div></section><section className="results-section"><SectionHead index="02" title="Site-friendly reading"/><ResultGrid results={[{label:"Feet and inches",value:`${feet} ft ${nfmt(inchRemainder,3)} in`,primary:true},{label:"Decimal metres",value:`${nfmt(value*source.factor,6)} m`},{label:"Decimal millimetres",value:`${nfmt(value*source.factor*1000,3)} mm`}]}/></section></CalculatorFrame>;
}

function PitchCalculator({tool}:{tool:ToolEntry}){const {unit,setUnit,unitLabel}=useUnits();const [rise,setRise]=useCalculationValue<number>("rise",400);const [run,setRun]=useCalculationValue<number>("run",1200);const {angle,percent,pitch12,slopeLength}=calculatePitch(rise,run);function changeUnit(next:UnitSystem){if(next===unit)return;const c=next==="imperial"?toImperial:toMetric;setRise(v=>c(v));setRun(v=>c(v));setUnit(next);}const draw=(ctx:CanvasRenderingContext2D,w:number,h:number)=>{
  setupCanvas(ctx,w,h);
  const x=84,y=h-86,uw=w-168,uh=Math.min(h-180,uw*rise/Math.max(run,.001));
  shape(ctx,[{x,y},{x:x+uw,y},{x:x+uw,y:y-uh}],"#f4f4f4","#000",1);
  line(ctx,x+uw-13,y,x+uw-13,y-13,"#000",.5);
  line(ctx,x+uw-13,y-13,x+uw,y-13,"#000",.5);
  dimension(ctx,x,y,x+uw,y,`Run ${nfmt(run)}`,"#000",42);
  dimension(ctx,x+uw,y,x+uw,y-uh,`Rise ${nfmt(rise)}`,"#000",42);
  dimension(ctx,x,y,x+uw,y-uh,`Slope Length ${nfmt(slopeLength,2)}`,"#000",-22);
  // clear of the hypotenuse, which sits very low at shallow pitches
  angleLabel(ctx,`${nfmt(angle,3)}°`,x-10,y-12,"right");
  infoLines(ctx,[
    `Pitch ${nfmt(pitch12,3)}:12 - Grade ${nfmt(percent,2)}%`,
    rise===0?"Level":`Rise / Run  1 : ${nfmt(run/rise,3)}`,
  ],w/2,32);
};return <CalculatorFrame values={{rise,run}} tool={tool} unit={unit} onUnitChange={changeUnit}><div className="calculator-workbench"><section className="input-panel"><SectionHead index="01" title="Pitch inputs"/><div className="field-grid"><NumberField label="Rise" value={rise} onChange={setRise} unit={unitLabel} min={0} range max={unit==="metric"?1500:60}/><NumberField label="Run" value={run} onChange={setRun} unit={unitLabel} min={.001}/></div></section><section className="diagram-panel"><div className="diagram-toolbar"><span>Pitch triangle</span><span>Rise over run</span></div><TechnicalCanvas draw={draw} label="Pitch triangle showing rise, run and angle" height={430} model={{kind:"pitchgauge",values:{rise,run,width:run,height:rise,angle},unit:unitLabel,title:"Pitch geometry"}}/></section></div><section className="results-section"><SectionHead index="02" title="Pitch equivalents"/><ResultGrid results={[{label:"Angle",value:`${nfmt(angle,4)}°`,primary:true},{label:"Percent grade",value:`${nfmt(percent,3)}%`},{label:"Pitch",value:`${nfmt(pitch12,3)} : 12`},{label:"Rise / run",value:rise===0?"Level":`1 : ${nfmt(run/rise,3)}`},{label:"Slope length",value:`${nfmt(slopeLength,2)} ${unitLabel}`}]}/></section></CalculatorFrame>;}

export function InteractiveCalculator({ tool }: { tool: ToolEntry }) {
  switch (tool.slug) {
    case "common-rafter": return <RafterCalculator tool={tool} />;
    case "straight-stairs": return <StairCalculator tool={tool} />;
    case "equal-spacing": return <SpacingCalculator tool={tool} />;
    case "concrete-slab": return <ConcreteCalculator tool={tool} />;
    case "tile-layout": return <TileCalculator tool={tool} />;
    case "arc-circle": return <ArcCalculator tool={tool} />;
    case "all-unit-converter": return <ConverterCalculator tool={tool} />;
    case "pitch-angle": return <PitchCalculator tool={tool} />;
    default: return <VerifiedCalculator tool={tool} />;
  }
}
