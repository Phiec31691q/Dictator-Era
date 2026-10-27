import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {geoEquirectangular,geoPath,geoArea,geoContains,geoBounds} from 'd3-geo';
const root=path.dirname(new URL(import.meta.url).pathname);
process.chdir(root);
const W=1800,H=900,GW=1440,GH=720;
const proj=geoEquirectangular().scale(W/(2*Math.PI)).translate([W/2,H/2]);
const p=geoPath(proj);
const raw=JSON.parse(fs.readFileSync('assets/countries.geojson'));
const features=raw.features.filter(f=>f.properties.ADM0_A3!=='ATA');
const bounds=features.map(geoBounds);
const palette=['#688b83','#798f77','#a29a72','#8197a5','#ac8a7c','#8c879f','#719b92','#a69b88','#7d9d8c','#9e8c91','#869d69','#a7a179','#6f8f9b'];
const countries=features.map((f,i)=>{
 const a=f.properties,flag=(a.ISO_A2_EH!=='-99'?a.ISO_A2_EH:a.ISO_A2);
 const code=(flag&&flag!=='-99'?flag:a.POSTAL||a.ADM0_A3).toUpperCase();
 const flagfile=`node_modules/country-flag-icons/3x2/${code}.svg`;
 fs.mkdirSync('assets/flags',{recursive:true});
 if(fs.existsSync(flagfile))fs.copyFileSync(flagfile,`assets/flags/${code}.svg`);
 return {id:i+1,code,iso:a.ADM0_A3,name:a.NAME_EN||a.NAME,tr:a.NAME_TR||a.NAME,nameLong:a.FORMAL_EN,
  region:a.CONTINENT,subregion:a.SUBREGION,pop:Math.max(1000,a.POP_EST||10000),gdp:Math.max(20,a.GDP_MD||50),
  label:proj([a.LABEL_X,a.LABEL_Y]),lon:a.LABEL_X,lat:a.LABEL_Y,area:geoArea(f),path:p(f),color:palette[((a.MAPCOLOR13||i)%palette.length+palette.length)%palette.length],flag:fs.existsSync(flagfile)?code:'UN'};
});
const graticule=`M0 450H1800`;
fs.writeFileSync('assets/world.json',JSON.stringify(countries));
// Raster cells are sampled from the sourced polygons, never hand-drawn.
const colors=countries.map((c,i)=>[(i*73+33)%251+1,(i*131+57)%251+1,(i*193+93)%251+1]);
const colorIndex=new Map(colors.map((rgb,i)=>[rgb.join(','),i+1]));
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${GW}" height="${GH}" viewBox="0 0 ${W} ${H}">${countries.map((c,i)=>`<path d="${c.path}" fill="rgb(${colors[i]})"/>`).join('')}</svg>`;
const pix=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
const ids=new Uint8Array(GW*GH);
for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){
 const k=y*GW+x,b=k*4;if(pix[b+3]<128)continue;
 const found=colorIndex.get(`${pix[b]},${pix[b+1]},${pix[b+2]}`);
 if(found){ids[k]=found;continue;}
 const coord=[x/GW*360-180+180/GW,90-y/GH*180-90/GH];
 for(let i=0;i<features.length;i++){
  const [[west,south],[east,north]]=bounds[i],lon=coord[0],lat=coord[1];
  if(lat<south||lat>north||(west<=east?(lon<west||lon>east):(lon<west&&lon>east)))continue;
  if(geoContains(features[i],coord)){ids[k]=i+1;break;}
 }
}
fs.writeFileSync('assets/cells.bin',ids);
const counts=countries.map(()=>0),neighbors=countries.map(()=>new Set());
for(let k=0;k<ids.length;k++){
 const a=ids[k];if(!a)continue;counts[a-1]++;
 for(const q of [k%GW<GW-1?k+1:-1,k+GW]){const b=ids[q];if(b&&b!==a){neighbors[a-1].add(b);neighbors[b-1].add(a);}}
}
countries.forEach((c,i)=>{c.cells=counts[i];c.neighbors=[...neighbors[i]];});
const adm=JSON.parse(fs.readFileSync('assets/admin1.geojson'));
const lines=adm.features.map(f=>({iso:f.properties.ADM0_A3,path:p(f)})).filter(a=>a.path);
const cityData=JSON.parse(fs.readFileSync('assets/cities.geojson'));
const cities=cityData.features.map(f=>{const a=f.properties;return{name:a.NAME,iso:a.ADM0_A3,capital:!!a.ADM0CAP,pop:a.POP_MAX,xy:proj(f.geometry.coordinates)};});
fs.writeFileSync('assets/world.json',JSON.stringify({width:W,height:H,gridWidth:GW,gridHeight:GH,countries,lines,cities}));
const fallback='node_modules/country-flag-icons/3x2/UN.svg';if(fs.existsSync(fallback))fs.copyFileSync(fallback,'assets/flags/UN.svg');
fs.mkdirSync('assets/icons',{recursive:true});
for(const name of ['coins','swords','flask-conical','chart-no-axes-combined','landmark','handshake','settings','play','pause','x','plus','minus','crosshair','save','house','volume-2','wifi','wifi-off','globe','shield','users','newspaper','trophy','chevron-right','arrow-left','target','plane','radiation','crown','flag','scale','book-open','triangle-alert','circle-help','check','cloud','log-in','building-2','heart','zap','waypoints','map','focus','sun','lock']){
 let f=`node_modules/lucide-static/icons/${name}.svg`;if(fs.existsSync(f))fs.copyFileSync(f,`assets/icons/${name}.svg`);
}
for(const f of ['d3-geo','topojson-client','world-atlas','country-flag-icons','lucide-static']){
 const dir=`node_modules/${f}`;const license=fs.readdirSync(dir).find(x=>/^licen[sc]e/i.test(x));if(license)fs.copyFileSync(`${dir}/${license}`,`assets/${f}-LICENSE.txt`);
}
if(fs.existsSync('/tmp/NE2_50M_SR_W/NE2_50M_SR_W.tif'))await sharp('/tmp/NE2_50M_SR_W/NE2_50M_SR_W.tif',{limitInputPixels:false}).resize(5400,2700).webp({quality:86}).toFile('assets/terrain.webp');
for(const [input,out] of [['hero','hero'],['units-modern','units-modern'],['units-historic','units-historic'],['portraits','portraits'],['events','events']]){
 const file=`../${input}.png`;if(!fs.existsSync(file))continue;
 if(out==='hero'){await sharp(file).webp({quality:90}).toFile('assets/hero.webp');continue;}
 const m=await sharp(file).metadata();const cw=Math.floor(m.width/3),ch=Math.floor(m.height/2);
 for(let i=0;i<6;i++)await sharp(file).extract({left:i%3*cw,top:Math.floor(i/3)*ch,width:cw,height:ch}).webp({quality:90}).toFile(`assets/${out}-${i}.webp`);
}
console.log(`Prepared ${countries.length} countries, ${lines.length} administrative lines, ${cities.length} cities, ${counts.reduce((a,b)=>a+b,0)} territorial cells`);
console.log('Türkiye neighbors',countries.find(c=>c.code==='TR')?.neighbors.map(n=>countries[n-1].code));
