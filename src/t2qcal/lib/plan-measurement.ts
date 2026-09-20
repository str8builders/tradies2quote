export type PlanPoint={x:number;y:number};
export type PlanCalibration={points:[PlanPoint,PlanPoint];metres:number};
export type PlanSource={version:1;fileHash:string;fileName:string;page:number;label:string;kind:"length"|"area"|"count"|"rectangle";points:PlanPoint[];calibration?:PlanCalibration};
export const pointDistance=(a:PlanPoint,b:PlanPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
function checkedPoint(raw:unknown):PlanPoint{
  const p=raw as PlanPoint;
  if(!p||typeof p.x!=="number"||typeof p.y!=="number"||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>100000||Math.abs(p.y)>100000)throw new Error("The plan contains an invalid measurement point.");
  return {x:p.x,y:p.y};
}
function crosses(a:PlanPoint,b:PlanPoint,c:PlanPoint,d:PlanPoint){
  const turn=(p:PlanPoint,q:PlanPoint,r:PlanPoint)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  return turn(a,b,c)*turn(a,b,d)<0&&turn(c,d,a)*turn(c,d,b)<0;
}
export function planQuantity(source:PlanSource):{quantity:number;unit:string}{
  if(source.kind==="count")return {quantity:source.points.length,unit:"each"};
  if(!source.calibration)throw new Error("Calibrate this page against a known dimension first.");
  const ratio=source.calibration.metres/pointDistance(...source.calibration.points);
  let quantity=0;
  if(source.kind==="length")quantity=pointDistance(source.points[0],source.points[1])*ratio;
  else if(source.kind==="rectangle")quantity=Math.abs((source.points[1].x-source.points[0].x)*(source.points[1].y-source.points[0].y))*ratio**2;
  else {
    const points=source.points;
    for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
      if(j===i+1||(i===0&&j===points.length-1))continue;
      if(crosses(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length]))throw new Error("Area edges cross. Undo points and trace the perimeter in order.");
    }
    quantity=Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0))/2*ratio**2;
  }
  if(!Number.isFinite(quantity)||quantity<=0||quantity>1e9)throw new Error("The measurement must have a positive, finite size.");
  return {quantity:Number(quantity.toPrecision(12)),unit:source.kind==="length"?"m":"m²"};
}
export function validatePlanSource(input:unknown):PlanSource{
  const value=input as PlanSource;
  if(!value||value.version!==1||typeof value.fileHash!=="string"||!/^[a-f0-9]{64}$/.test(value.fileHash)||typeof value.fileName!=="string"||!value.fileName.trim()||value.fileName.length>180||typeof value.label!=="string"||!value.label.trim()||value.label.length>120||!Number.isInteger(value.page)||value.page<1||value.page>500||!["length","area","count","rectangle"].includes(value.kind)||!Array.isArray(value.points)||value.points.length>100)throw new Error("This plan measurement could not be read.");
  const points=value.points.map(checkedPoint);
  if((value.kind==="length"||value.kind==="rectangle")?points.length!==2:points.length<(value.kind==="area"?3:1))throw new Error("Add enough points to finish this measurement.");
  let calibration:PlanCalibration|undefined;
  if(value.calibration){
    const c=value.calibration;
    if(!Array.isArray(c.points)||c.points.length!==2||typeof c.metres!=="number"||!Number.isFinite(c.metres)||c.metres<=0||c.metres>10000)throw new Error("Enter a known dimension greater than zero, in metres.");
    const pair=c.points.map(checkedPoint) as [PlanPoint,PlanPoint];
    if(pointDistance(...pair)<.01)throw new Error("Calibration points are too close together.");
    calibration={points:pair,metres:c.metres};
  }
  const source:PlanSource={version:1,fileHash:value.fileHash,fileName:value.fileName,page:value.page,label:value.label.trim(),kind:value.kind,points,...(calibration?{calibration}:{})};
  planQuantity(source);return source;
}
export function planSourceNote(source:PlanSource){const value=planQuantity(source);return `Manual plan measurement: ${source.label}; ${source.fileName}, page ${source.page}; ${value.quantity.toFixed(4)} ${value.unit}; ${source.calibration?`calibrated against ${source.calibration.metres} m`:'points counted by user'}; SHA-256 ${source.fileHash}. Check drawing revision and scale on site. Calculator inputs may have been edited after this measurement.`;}
