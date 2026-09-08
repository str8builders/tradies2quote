/** Fixed-width members with equal gaps at both ends and between members. */
export function balancedSpacing(span:number,width:number,target:number,maximumGap=false,limit=1000){
  if(![span,width,target].every(Number.isFinite)||span<=0||width<0||target<0||width>span||width+target<=0)return null;
  const ideal=(span-target)/(width+target);
  if(ideal>limit)return null;
  const fitting=width>0?Math.min(limit,Math.floor(span/width+Number.EPSILON*8)):limit;
  const clamp=(n:number)=>Math.max(1,Math.min(fitting,n));
  const tolerance=Number.EPSILON*Math.max(1,span)*8;
  const candidates=[...new Set([clamp(Math.floor(ideal)),clamp(Math.ceil(ideal))])].map(count=>({count,gap:Math.max(0,(span-count*width)/(count+1))})).filter(g=>!maximumGap||g.gap<=target+tolerance);
  candidates.sort((a,b)=>Math.abs(Math.abs(a.gap-target)-Math.abs(b.gap-target))<=tolerance?a.count-b.count:Math.abs(a.gap-target)-Math.abs(b.gap-target));
  return candidates[0]??null;
}
