const {CAR_458,buildGeometry,simulateLap}=require('./sim.js');
const T=require('./spa_line.json');
const G=buildGeometry(T);
for (const drv of [1,0.95,0.92]) {
const r=simulateLap(G,CAR_458,{fuel:30,wing:4,grip:1,driver:drv});
const fmt=t=>Math.floor(t/60)+':'+(t%60).toFixed(3).padStart(6,'0');
console.log('driver',drv,'lap',fmt(r.lapTime),'vmax',(r.vmax*3.6).toFixed(0),'vmin',(r.vmin*3.6).toFixed(0),'clA',r.clA.toFixed(2),'cdA',r.cdA.toFixed(2));
if(drv!==0.95) continue;
const marks=[0,200,375,500,800,1050,1130,1200,1290,1400,2300,2418,2500,2594,2800,3040,3239,3500,3840,4093,4300,4493,4590,4925,5109,5197,5500,6000,6133,6400,6650,6747,6900];
for(const d of marks){let i=0;while(i<G.n-1&&G.s[i]<d)i++;console.log(String(d).padStart(5),'v',(r.v[i]*3.6).toFixed(0).padStart(4),'thr',r.thr[i].toFixed(2),'brk',r.brk[i].toFixed(2),'g',r.gear[i],'rpm',r.rpm[i].toFixed(0),'lat',r.gLat[i].toFixed(2),'long',r.gLong[i].toFixed(2),'kv',G.kv[i].toFixed(4),'gr',G.grade[i].toFixed(3));}
// minima
let mins=[];for(let i=0;i<G.n;i++){let ok=true;for(let k=-60;k<=60;k++){if(r.v[(i+k+G.n)%G.n]<r.v[i]){ok=false;break}}if(ok)mins.push(i)}
console.log('minima',mins.map(i=>Math.round(G.s[i])+'m:'+Math.round(r.v[i]*3.6)).join(' '));
let mo={b:0,c:0,t:0};for(let i=0;i<G.n;i++){if(r.brk[i]>0.02)mo.b++;else if(r.thr[i]>0.02)mo.t++;else mo.c++}console.log(mo);
}
