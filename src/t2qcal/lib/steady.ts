/**
 * Steady-hold for sensor readings. A phone in the hand never sits still, so
 * rather than asking the tradie to hold it perfectly and tap Hold, the
 * readings are watched over a short window: once they stop wandering the
 * averaged value locks (quieter than any single reading), and it stays
 * locked until the phone is clearly moved on to something else.
 */
export type SteadyState={state:"moving"|"settling"|"locked";value:number;sd:number;progress:number};

export class SteadyTracker{
  private samples:Array<{t:number;v:number}>=[];
  private locked:number|null=null;
  private lockedSd=0;
  constructor(private windowMs=800,private lockSd=.06,private unlockDelta=.4,private minSamples=8){}
  reset(){this.samples=[];this.locked=null;}
  push(v:number,t:number):SteadyState{
    if(!Number.isFinite(v))return {state:"moving",value:NaN,sd:Infinity,progress:0};
    if(this.locked!==null){
      if(Math.abs(v-this.locked)<=this.unlockDelta)return {state:"locked",value:this.locked,sd:this.lockedSd,progress:1};
      this.locked=null;this.samples=[];
    }
    this.samples.push({t,v});
    while(this.samples.length&&t-this.samples[0].t>this.windowMs)this.samples.shift();
    const n=this.samples.length,mean=this.samples.reduce((a,s)=>a+s.v,0)/n;
    const sd=Math.sqrt(this.samples.reduce((a,s)=>a+(s.v-mean)**2,0)/n);
    const span=n>1?this.samples[n-1].t-this.samples[0].t:0;
    const calm=sd<=this.lockSd&&n>=3;
    if(calm&&n>=this.minSamples&&span>=this.windowMs*.75){this.locked=mean;this.lockedSd=sd;return {state:"locked",value:mean,sd,progress:1};}
    return {state:calm?"settling":"moving",value:mean,sd,progress:calm?Math.min(1,span/(this.windowMs*.75)):0};
  }
}
