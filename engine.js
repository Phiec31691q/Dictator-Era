'use strict';
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const storageKey=k=>k==='campaign'&&profile?.mode==='online'?'campaign-online-'+profile.id:k;
const store={read(k){try{k=storageKey(k);return JSON.parse(window.Native?Native.read(k):sessionStorage.getItem(k));}catch{return null;}},write(k,v){try{k=storageKey(k);const s=JSON.stringify(v);if(window.Native)Native.write(k,s);else sessionStorage.setItem(k,s);}catch{}}};
const settings=Object.assign({music:.22,sfx:.5,flags:true,admin:true,labels:true,haptics:true,quality:1},store.read('settings')||{});
let profile=store.read('profile'),lang=profile?.lang||'tr';
const T=(tr,en)=>lang==='tr'?tr:en;
const num=(v,d=1)=>{if(!Number.isFinite(v))return '0';const a=Math.abs(v);if(a>=1e9)return (v/1e9).toFixed(d)+' B';if(a>=1e6)return (v/1e6).toFixed(d)+(lang==='tr'?' Mn':' M');if(a>=1e3)return (v/1e3).toFixed(d)+' K';return Math.round(v).toLocaleString(lang==='tr'?'tr-TR':'en-US');};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<img class="icon" alt="" src="assets/icons/${n}.svg">`;
const flag=c=>`<img class="flag" alt="${esc(c?.code||'')}" src="assets/flags/${c?.flag||'UN'}.svg">`;
const cname=c=>c?(lang==='tr'?c.tr:c.name):'';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let geo,countries=[],countryByCode={},original,owners,landTotal=0,game=null,mode='menu',selected=0;
let GW=1440,GH=720,MW=1800,MH=900;
let camera={x:900,y:420,z:.6},view={w:innerWidth,h:innerHeight,dpr:1},dirty=true;
let worldCache=document.createElement('canvas'),occupation=document.createElement('canvas'),ownershipDirty=true;
let staticFrame=document.createElement('canvas'),mapCacheKey='',mapRevision=0;
let ctx=$('#world').getContext('2d'),terrain=new Image(),flagImages={},unitImages=[],portraitImages=[];
let rngState=123456789;
function random(){rngState^=rngState<<13;rngState^=rngState>>>17;rngState^=rngState<<5;return(rngState>>>0)/4294967296;}
function chance(p){return random()<p;}
function saveSettings(){store.write('settings',settings);$('#music').volume=settings.music;dirty=true;}
let ac;
function sound(kind='click'){
 if(!settings.sfx)return;
 try{ac ||= new (window.AudioContext||window.webkitAudioContext)();ac.resume();let o=ac.createOscillator(),g=ac.createGain(),t=ac.currentTime;
 const explosive=['battle','bomb','nuke'].includes(kind);o.type=explosive?'sawtooth':'sine';o.frequency.setValueAtTime(kind==='win'?520:explosive?90:kind==='tech'?640:360,t);o.frequency.exponentialRampToValueAtTime(explosive?22:kind==='win'?1040:240,t+.18);g.gain.setValueAtTime(settings.sfx*(explosive?.11:.035),t);g.gain.exponentialRampToValueAtTime(.001,t+(explosive?.6:.2));o.connect(g).connect(ac.destination);o.start();o.stop(t+.65);
 if(explosive){let b=ac.createBuffer(1,ac.sampleRate*.5,ac.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);let n=ac.createBufferSource(),ng=ac.createGain();n.buffer=b;ng.gain.value=settings.sfx*.12;n.connect(ng).connect(ac.destination);n.start();}
 }catch{}
}
function musicStart(){const a=$('#music');a.volume=settings.music;if(settings.music>0)a.play().catch(()=>{});}
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),3400);}
const unitDefs=[
 {tr:'Piyade',en:'Infantry',cost:18000,power:1.0,upkeep:45,days:10,descTR:'Ucuz ve dengeli. Cepheyi tutar, işgal edilen toprakları korur.',descEN:'Affordable and balanced. Holds the front and secures occupied land.'},
 {tr:'Komando',en:'Commando',cost:42000,power:2.7,upkeep:105,days:16,descTR:'Saldırıda güçlü. Düşük maliyetli ordulara karşı etkilidir.',descEN:'Strong on offense. Effective against lightly equipped armies.'},
 {tr:'Tank',en:'Tank',cost:160000,power:9,upkeep:380,days:22,descTR:'Kara saldırılarının omurgası. Piyadeye karşı üstünlük sağlar.',descEN:'The backbone of a land offensive. Strong against infantry.'},
 {tr:'Ağır Tank',en:'Heavy tank',cost:320000,power:19,upkeep:800,days:30,tech:'armor',descTR:'Yüksek savunma ve ateş gücü; bakımı pahalıdır.',descEN:'Heavy firepower and defense, with expensive upkeep.'},
 {tr:'Uçaksavar',en:'Anti-air',cost:210000,power:7,upkeep:430,days:24,descTR:'Hava saldırılarındaki kayıpları azaltır ve kara ordusunu korur.',descEN:'Reduces airstrike losses and protects ground forces.'},
 {tr:'Uçak',en:'Aircraft',cost:650000,power:25,upkeep:1400,days:36,tech:'air',descTR:'Cepheye hava desteği. Saldırı için haritadan hedef seç.',descEN:'Air support for your front. Select a target on the map.'}
];
const techDefs=[
 {id:'logistics',tr:'İkmal doktrini',en:'Supply doctrine',cost:30,time:2,req:[],descTR:'Ordu bakım maliyeti %15 azalır.',descEN:'Army upkeep reduced by 15%.'},
 {id:'industry',tr:'Verimli ekonomi',en:'Efficient economy',cost:40,time:3,req:[],descTR:'Aylık gelir %12 artar.',descEN:'Monthly income increases by 12%.'},
 {id:'medicine',tr:'Sahra tıbbı',en:'Field medicine',cost:45,time:3,req:['logistics'],descTR:'Çatışma kayıpları %18 azalır.',descEN:'Combat casualties reduced by 18%.'},
 {id:'armor',tr:'Zırhlı birlikler',en:'Armored warfare',cost:65,time:4,req:['logistics'],descTR:'Ağır tankları açar. Kara gücü %8 artar.',descEN:'Unlocks heavy tanks. Ground power +8%.'},
 {id:'education',tr:'Bilim seferberliği',en:'Scientific education',cost:55,time:3,req:['industry'],descTR:'Araştırma puanı üretimi %25 artar.',descEN:'Research point generation increases by 25%.'},
 {id:'air',tr:'Hava üstünlüğü',en:'Air superiority',cost:85,time:5,req:['armor'],descTR:'Uçak üretimini ve hedefli hava saldırısını açar.',descEN:'Unlocks aircraft and targeted airstrikes.'},
 {id:'naval',tr:'Denizaşırı lojistik',en:'Overseas logistics',cost:90,time:5,req:['logistics','industry'],descTR:'Gerçek deniz güzergâhıyla çıkarma yapmayı açar.',descEN:'Unlocks amphibious landings along actual sea routes.'},
 {id:'cyber',tr:'Haberleşme ağı',en:'Communications',cost:100,time:5,req:['education'],descTR:'Ordu gücü %15 artar, diplomasi daha ucuz olur.',descEN:'Army power +15%, lower diplomatic costs.'},
 {id:'resilience',tr:'Afet dayanıklılığı',en:'Disaster resilience',cost:90,time:4,req:['medicine','education'],descTR:'Afetlerin ekonomik zararı %50 azalır.',descEN:'Economic disaster damage is reduced by 50%.'},
 {id:'fusion',tr:'Yeni nesil enerji',en:'Advanced energy',cost:130,time:6,req:['industry','education'],descTR:'Gelir %20 artar; yüksek vergilerin baskısı hafifler.',descEN:'Income +20%. Reduces pressure from high taxes.'},
 {id:'missiles',tr:'Stratejik caydırıcılık',en:'Strategic deterrence',cost:170,time:7,req:['air','cyber'],descTR:'Son araştırma aşamasının ön koşuludur. Ordu gücü %10 artar.',descEN:'Required for the final research tier. Army power +10%.'},
 {id:'nuclear',tr:'Nükleer program',en:'Nuclear program',cost:300,time:12,req:['missiles','fusion'],descTR:'Şehir hedefli nükleer saldırı. Ağır diplomatik ve insani sonuçları vardır.',descEN:'City-targeted nuclear strike, with severe humanitarian and diplomatic consequences.'}
];
const ideologies=[
 {id:'democracy',tr:'Demokrasi',en:'Democracy',icon:'scale',income:1.05,military:1,happy:.18,research:1.05,descTR:'Yüksek toplumsal güven ve dengeli ekonomik büyüme. Uzun savaşlar halk desteğini daha hızlı düşürür.',descEN:'Public trust and balanced growth. Prolonged war erodes public support more quickly.'},
 {id:'republic',tr:'Cumhuriyetçilik',en:'Republicanism',icon:'landmark',income:1.03,military:1.04,happy:.1,research:1.05,descTR:'Kurumlara dayalı dengeli bir yönetim. Ekonomi, bilim ve savunmada küçük ama sürekli avantajlar.',descEN:'Institutional balance with small, lasting advantages to economy, science and defense.'},
 {id:'liberal',tr:'Liberalizm',en:'Liberalism',icon:'globe',income:1.16,military:.94,happy:.1,research:1.1,descTR:'Ticaret ve araştırma daha güçlüdür. Askerî seferberlik daha zayıftır.',descEN:'Stronger trade and research, with weaker military mobilization.'},
 {id:'social',tr:'Sosyal demokrasi',en:'Social democracy',icon:'heart',income:.97,military:1,happy:.35,research:1.08,descTR:'Sosyal güvence halkın memnuniyetini artırır. Vergi gelirlerinde küçük bir maliyet oluşur.',descEN:'Social protection increases public satisfaction at a small revenue cost.'},
 {id:'communism',tr:'Komünizm',en:'Communism',icon:'users',income:.92,military:1.15,happy:.16,research:1.02,descTR:'Merkezî planlama askerî seferberliği güçlendirir. Piyasa verimliliği ve ticaret geliri azalır.',descEN:'Central planning strengthens mobilization, but reduces market efficiency and trade income.'},
 {id:'national',tr:'Milliyetçilik',en:'Nationalism',icon:'flag',income:.98,military:1.18,happy:.03,research:.96,descTR:'Yüksek kara gücü ve savaş desteği. Bilimsel işbirliği ve ekonomik esneklik daha zayıftır.',descEN:'Higher land power and war support, with weaker scientific cooperation and economic flexibility.'},
 {id:'monarchy',tr:'Monarşi',en:'Monarchy',icon:'crown',income:1.06,military:1.06,happy:-.03,research:.94,descTR:'Merkezî otorite ve istikrarlı vergi toplama. Bilimsel yenilik ve reformlar daha yavaştır.',descEN:'Central authority and stable revenue. Scientific innovation and reforms are slower.'},
 {id:'technocracy',tr:'Teknokrasi',en:'Technocracy',icon:'flask-conical',income:1.07,military:.98,happy:-.04,research:1.3,descTR:'Araştırmada büyük avantaj. Yönetimin topluma uzaklığı halk desteğini hafifçe aşındırır.',descEN:'Strong research advantage, while distant governance slightly erodes public support.'}
];
const scenarios=[
 {id:'modern',year:2026,tr:'Yeni Dünya Düzeni',en:'A New World Order',tagTR:'MODERN DÜNYA',tagEN:'MODERN WORLD',descTR:'Gerçek dünya coğrafyası. Bölgesel rekabet, diplomasi ve küresel hâkimiyet.',descEN:'Real-world geography. Regional rivalry, diplomacy and global domination.',image:'hero.webp',factor:1,era:'modern'},
 {id:'iron',year:1962,tr:'Demir Perde',en:'Iron Curtain',tagTR:'ALTERNATİF TARİH',tagEN:'ALTERNATE HISTORY',descTR:'Modern sınırlar üzerinde iki kutuplu güç dengesi. Tarihsel sınır simülasyonu değildir.',descEN:'Bipolar balance on modern borders. Not a historical border simulation.',image:'events-0.webp',factor:.8,era:'historic'},
 {id:'steel',year:1939,tr:'Çelik Fırtına',en:'Storm of Steel',tagTR:'ALTERNATİF TARİH',tagEN:'ALTERNATE HISTORY',descTR:'Dönem birlikleri, dar bütçeler. Modern sınırlarla kurgusal 1939 başlangıcı.',descEN:'Period units and tight budgets. Fictional 1939 start using modern borders.',image:'units-historic-2.webp',factor:.55,era:'historic'},
 {id:'equal',year:2030,tr:'Eşit Güçler',en:'Equal Powers',tagTR:'DENGELİ SANDBOX',tagEN:'BALANCED SANDBOX',descTR:'Her ülke benzer kaynaklarla başlar. Strateji, ülke boyutundan daha önemlidir.',descEN:'Similar starting resources for every nation. Strategy matters more than size.',image:'events-4.webp',factor:1,era:'modern'},
 {id:'fracture',year:2040,tr:'Kırılma Noktası',en:'Breaking Point',tagTR:'EKONOMİK MÜCADELE',tagEN:'ECONOMIC CHALLENGE',descTR:'Düşük rezervler, yüksek enflasyon. Önce ülkeni istikrara kavuştur.',descEN:'Low reserves, high inflation. Stabilize your country before expanding.',image:'events-1.webp',factor:.7,era:'modern'},
 {id:'peace',year:2026,tr:'Diplomasi Çağı',en:'Age of Diplomacy',tagTR:'YUMUŞAK GÜÇ',tagEN:'SOFT POWER',descTR:'Güçlü ilişkilerle başla. İttifaklar ve araştırmayla dünyaya yön ver.',descEN:'Begin with stronger relations. Shape the world with alliances and research.',image:'events-5.webp',factor:1,era:'modern'}
];
const nato=['US','CA','GB','FR','DE','TR','IT','ES','PT','NL','BE','LU','NO','DK','IS','PL','CZ','SK','HU','RO','BG','GR','AL','HR','SI','ME','MK','EE','LV','LT','FI','SE'];
const closePairs=[['TR','AZ'],['RU','BY'],['CN','PK'],['US','IL'],['US','JP'],['SA','AE']];
const rivals=[['RU','UA'],['AM','AZ'],['IN','PK'],['KR','KP'],['IL','IR']];
const byId=id=>countries[id-1];
const me=()=>game?byId(game.player):null;
function rel(a,b){if(a===b)return 100;return game.relations[[a,b].sort((x,y)=>x-y).join(':')]??45;}
function setRel(a,b,v){game.relations[[a,b].sort((x,y)=>x-y).join(':')]=clamp(v,0,100);}
function addRel(a,b,v){setRel(a,b,rel(a,b)+v);}
function isAlly(a,b){return a!==b&&rel(a,b)>=78;}
function ide(c){return ideologies.find(i=>i.id===c.ideology)||ideologies[0];}
function power(c){let p=c.units.reduce((s,n,i)=>s+n*unitDefs[i].power,0);return p*ide(c).military*(1+(c.tech.includes('armor')?.08:0)+(c.tech.includes('cyber')?.15:0)+(c.tech.includes('missiles')?.1:0))*(.6+c.morale/250);}
function totalUnits(c){return c.units.reduce((a,b)=>a+b,0);}
function upkeep(c){return c.units.reduce((s,n,i)=>s+n*unitDefs[i].upkeep,0)*(c.tech.includes('logistics')?.85:1);}
function budget(c){
 const base=Math.max(350000,c.gdp*430)*Math.max(.12,c.land/Math.max(1,c.initialLand));
 const income=base*(c.tax/28)*ide(c).income*(c.tech.includes('industry')?1.12:1)*(c.tech.includes('fusion')?1.2:1)*(1-c.inflation/200);
 const military=upkeep(c),social=base*c.social/100,research=base*c.science/100,trade=(c.trade||[]).length*base*.04;
 return {income:income+trade,military,social,research,net:income+trade-military-social-research};
}
function initGame(player,scenario,difficulty=1,seed=Date.now()|0){
 const sc=scenarios.find(s=>s.id===scenario)||scenarios[0];rngState=seed;owners=new Uint8Array(original);
 countries.forEach(c=>{
 const rich=Math.sqrt(c.gdp/1000),equal=sc.id==='equal';const army=equal?1800:clamp(Math.round(rich*100),70,22000);
 Object.assign(c,{land:c.cells,initialLand:c.cells,money:Math.max(3500000,(equal?60000000:c.gdp*1500))*sc.factor,gdp:equal?40000:c.baseGdp,units:[army,Math.round(army*.12),Math.round(army*.055),0,Math.round(army*.015),0],tax:28,social:22,science:15,happiness:72,inflation:sc.id==='fracture'?22:5,morale:80,ideology:'republic',research:25,tech:[],currentResearch:null,queue:[],trade:[],exhaustion:0,protestMonths:0,lastReform:-24,airCooldown:0,nuclearCooldown:0});
 if(sc.id==='fracture')c.money*=.28;
 });
 game={version:1,player,scenario:sc.id,difficulty,year:sc.year,month:1,day:1,elapsed:0,speed:1,paused:false,relations:{},wars:[],news:[],projectiles:[],effects:[],monthCount:0,lastEvent:-6,nextEvent:4+Math.floor(random()*5),conquests:0,won:false,loss:false,awarded:false,targetMode:null,simStep:0};
 for(let a of countries)for(let b of countries)if(a.id<b.id){
 let r=45;if(nato.includes(a.code)&&nato.includes(b.code))r=82;
 if(closePairs.some(p=>p.includes(a.code)&&p.includes(b.code)))r=88;
 if(rivals.some(p=>p.includes(a.code)&&p.includes(b.code)))r=16;
 if(sc.id==='peace')r=Math.min(95,r+15);setRel(a.id,b.id,r);
 }
 addNews(T('Yeni dönem başladı','A new era begins'),T(`${cname(me())} yeni yönetimiyle dünya sahnesinde.`,`${cname(me())} enters a new era of leadership.`),'diplomacy');
 mode='play';selected=player;ownershipDirty=true;rebuildBase();focusCountry(player);updateHUD();drawCountryPanel();saveGame(true);
}
function addNews(title,body,type='diplomacy'){
 if(!game)return;game.news.unshift({title,body,type,date:dateText(),month:game.monthCount});if(game.news.length>80)game.news.pop();if(mode==='play')updateTicker();
}
function dateText(){if(!game)return '';return `${String(game.day).padStart(2,'0')} ${T(['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'][game.month-1],['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][game.month-1])} ${game.year}`;}
function neighborsOf(id){const found=new Set();for(let k=0;k<owners.length;k++){if(owners[k]!==id)continue;for(const q of adjacent(k)){const b=owners[q];if(b&&b!==id)found.add(b);}}return [...found];}
function adjacent(k){const x=k%GW,y=(k/GW)|0;const a=[];if(x>0)a.push(k-1);if(x<GW-1)a.push(k+1);if(y>0)a.push(k-GW);if(y<GH-1)a.push(k+GW);return a;}
function frontier(a,b){let list=[];for(let k=0;k<owners.length;k++)if(owners[k]===b&&adjacent(k).some(q=>owners[q]===a))list.push(k);return list;}
function findSeaRoute(a,b){
 const prev=new Int32Array(owners.length);prev.fill(-2);const queue=new Int32Array(owners.length);let start=0,end=0;
 for(let k=0;k<owners.length;k++)if(owners[k]===a)for(const q of adjacent(k))if(!owners[q]&&prev[q]===-2){prev[q]=-1;queue[end++]=q;}
 while(start<end){const k=queue[start++];for(const q of adjacent(k)){
 if(owners[q]===b){let route=[q,k],n=k;while(prev[n]>=0){n=prev[n];route.push(n);}route.reverse();return {landing:q,route:route.filter((_,i)=>i%10===0)};}
 if(!owners[q]&&prev[q]===-2){prev[q]=k;queue[end++]=q;}
 }}return null;
}
function declareWar(a,b,ai=false){
 if(!game||game.won||a===b||!byId(a).land||!byId(b).land)return false;
 if(game.wars.some(w=>(w.a===a&&w.b===b)||(w.a===b&&w.b===a)))return false;
 if(isAlly(a,b)){if(!ai)toast(T('Önce ittifakı sonlandır.','End the alliance first.'));return false;}
 if(game.truces?.[a+':'+b]>game.monthCount){if(!ai)toast(T('Ateşkes sürüyor.','The ceasefire is still in force.'));return false;}
 let f=frontier(a,b),naval=null;
 if(!f.length){
  if(ai||!byId(a).tech.includes('naval')){if(!ai)toast(T('Ortak kara sınırı yok. Deniz lojistiği araştırılmalı.','No shared land border. Research overseas logistics.'));return false;}
  if(byId(a).money<12000000){toast(T('Çıkarma için 12 Mn gerekli.','A landing requires 12 M.'));return false;}
  naval=findSeaRoute(a,b);if(!naval){toast(T('Ulaşılabilir bir kıyı yok.','No reachable coastline.'));return false;}byId(a).money-=12000000;
 }
 let w={id:Date.now()+random(),a,b,initial:byId(b).land,taken:0,front:f,support:[],lossA:0,lossB:0,age:0,naval,landingTime:naval?12:0};
 game.wars.push(w);setRel(a,b,0);byId(a).morale=clamp(byId(a).morale-3,0,100);
 for(const c of countries)if(c.id!==a&&c.id!==b&&isAlly(c.id,b))addRel(c.id,a,-12);
 addNews(T('Savaş ilanı','War declared'),`${cname(byId(a))} / ${cname(byId(b))}. ${T('Cephe hattında çatışmalar başladı.','Fighting begins along the front.')}`,'war');
 if(!ai)sound('battle');updateHUD();drawCountryPanel();return true;
}
function captureCell(w,k,a=w.a){
 const b=owners[k];if(!b||b===a)return;owners[k]=a;byId(a).land++;byId(b).land=Math.max(0,byId(b).land-1);w.taken++;ownershipDirty=true;
 for(const q of adjacent(k))if(owners[q]===w.b&&!w.front.includes(q))w.front.push(q);
}
function loseUnits(c,amount){let total=totalUnits(c);if(total<=0)return;const frac=clamp(amount/total,0,1);c.units=c.units.map(n=>Math.max(0,n-n*frac));}
function tickWar(w,dt){
 const a=byId(w.a),b=byId(w.b);if(!a.land||!b.land)return;
 w.age+=dt;if(w.landingTime>0){w.landingTime-=dt;if(w.landingTime<=0){captureCell(w,w.naval.landing);w.front=frontier(w.a,w.b);}return;}
 let support=w.support.reduce((s,e)=>s+e.power,0),pa=power(a)+support,pb=power(b);
 const fightingStrength=pa/(pb*1.1+1),attackFactor=a.id===game.player?1:game.difficulty;
 const loss=(Math.min(pa,pb)+10)*.00018*dt;
 loseUnits(a,loss/(a.tech.includes('medicine')?1.22:1));loseUnits(b,loss*.92);w.lossA+=loss;w.lossB+=loss*.92;
 a.exhaustion=clamp(a.exhaustion+dt*.003,0,70);b.exhaustion=clamp(b.exhaustion+dt*.004,0,70);
 w.front=w.front.filter(k=>owners[k]===w.b&&adjacent(k).some(q=>owners[q]===w.a));
 const count=Math.max(1,Math.min(100,Math.ceil(w.front.length*.018*dt*clamp(fightingStrength,.1,4)*attackFactor)));
 if(pa>0&&w.front.length&&chance(clamp(fightingStrength*.5,.025,.98))){
  for(let j=0;j<count&&w.front.length;j++){const n=Math.floor(random()*w.front.length),k=w.front[n];w.front.splice(n,1);if(owners[k]===w.b)captureCell(w,k);}
 }
 if(fightingStrength<.65&&chance(.4)){const f=frontier(w.b,w.a);if(f.length){const k=f[Math.floor(random()*f.length)];if(original[k]===w.b){owners[k]=w.b;a.land--;b.land++;w.taken=Math.max(0,w.taken-1);ownershipDirty=true;}}}
 if(w.front.length){const k=w.front[Math.floor(random()*w.front.length)],pt=cellXY(k);game.effects.push({type:'battle',x:pt[0],y:pt[1],life:.8,max:.8});}
 if(b.land<=Math.max(1,b.initialLand*.012)){
  for(let k=0;k<owners.length;k++)if(owners[k]===b.id){owners[k]=a.id;a.land++;b.land--;}
  b.land=0;game.conquests+=a.id===game.player?1:0;a.money+=b.money*.3;b.money*=.7;a.morale=clamp(a.morale+5,0,100);
  addNews(T('Bir ülke teslim oldu','A nation capitulates'),`${cname(b)} → ${cname(a)}. ${T('Bölgenin yönetimi el değiştirdi.','Administration of the territory changes hands.')}`,'war');
  w.finished=true;ownershipDirty=true;rebuildBase();
  if(b.id===game.player){game.loss=true;game.paused=true;showDefeat();}
 }
}
function callAlly(allyId,warId,type){
 const w=game.wars.find(w=>w.id===warId),ally=byId(allyId),p=me();if(!w||!isAlly(p.id,allyId)||w.support.some(e=>e.id===allyId))return false;
 const willingness=clamp((rel(p.id,allyId)-45)/70+(45-rel(allyId,w.b))/150-(ally.exhaustion/100),.08,.94);
 if(!chance(willingness)){addRel(p.id,allyId,-2);toast(T('Müttefik bu çağrıyı reddetti.','Your ally declined this call.'));w.support.push({id:allyId,power:0,type:'declined'});return false;}
 if(type==='front'&&frontier(allyId,w.b).length){declareWar(allyId,w.b,true);w.support.push({id:allyId,power:0,type:'front'});}
 else if(type==='money'){const amount=Math.min(ally.money*.12,15000000);ally.money-=amount;p.money+=amount;w.support.push({id:allyId,power:0,type:'money'});}
 else if(type==='supply'){p.morale=clamp(p.morale+12,0,100);w.support.push({id:allyId,power:power(ally)*.04,type:'supply'});}
 else {w.support.push({id:allyId,power:power(ally)*.15,type:'troops'});}
 addNews(T('Savaş çağrısı kabul edildi','Call to war accepted'),`${cname(ally)} → ${cname(p)}. ${T('Destek yalnızca ilgili cepheye uygulandı.','Support has been assigned to the relevant front.')}`,'diplomacy');toast(T('Destek kabul edildi.','Support accepted.'));return true;
}
function peace(wid){
 const w=game.wars.find(w=>w.id===wid);if(!w)return;const p=me(),other=byId(w.a===p.id?w.b:w.a);
 const cost=Math.round(Math.max(100000,other.gdp*55));
 if(p.money<cost){toast(T('Barış tazminatı için bütçe yetersiz.','Insufficient funds for reparations.'));return;}
 p.money-=cost;other.money+=cost;game.wars=game.wars.filter(a=>a.id!==wid);setRel(p.id,other.id,32);
 game.truces ||= {};game.truces[p.id+':'+other.id]=game.monthCount+12;game.truces[other.id+':'+p.id]=game.monthCount+12;
 addNews(T('Ateşkes imzalandı','Ceasefire signed'),`${cname(p)} / ${cname(other)}. ${T('Mevcut cephe hattı korundu. 12 ay ateşkes.','Current front line retained. 12-month truce.')}`,'diplomacy');
 toast(T('12 aylık ateşkes başladı.','A 12-month ceasefire begins.'));dirty=true;updateHUD();drawCountryPanel();
}
function recruit(i,amount){
 const p=me(),d=unitDefs[i];amount=clamp(Math.round(amount),1,10000);
 if(d.tech&&!p.tech.includes(d.tech)){toast(T('Önce ilgili teknolojiyi araştır.','Research the required technology first.'));return false;}
 const cost=d.cost*amount;if(cost>p.money){toast(T('Yetersiz bütçe.','Insufficient funds.'));return false;}
 if(p.queue.length>=6){toast(T('En fazla 6 eğitim emri.','Maximum 6 training orders.'));return false;}
 p.money-=cost;p.queue.push({i,n:amount,left:d.days,total:d.days});sound();toast(T('Eğitim emri verildi.','Training order issued.'));updateHUD();return true;
}
function research(id){
 const c=me(),t=techDefs.find(t=>t.id===id);if(!t||c.currentResearch||c.tech.includes(id)||!t.req.every(r=>c.tech.includes(r)))return false;
 if(c.research<t.cost){toast(T('Araştırma puanı yetersiz.','Not enough research points.'));return false;}
 c.research-=t.cost;c.currentResearch={id,left:t.time,total:t.time};toast(T('Araştırma başladı.','Research started.'));sound('tech');updateHUD();return true;
}
function reform(id){
 const p=me();if(p.ideology===id)return;
 if(game.monthCount-p.lastReform<12){toast(T('Yeni reform için 12 ay beklemelisin.','Wait 12 months between reforms.'));return false;}
 p.ideology=id;p.happiness=clamp(p.happiness-8,0,100);p.lastReform=game.monthCount;
 addNews(T('Yönetim reformu','Government reform'),`${cname(p)}: ${T(ide(p).tr,ide(p).en)}.`,'diplomacy');toast(T('Reform uygulandı. Halkın uyum sağlaması zaman alacak.','Reform enacted. The public will need time to adjust.'));return true;
}
function diplomacy(target,action){
 const p=me(),c=byId(target);if(!c||c.id===p.id||!c.land)return;
 let cost=Math.round(Math.max(100000,p.gdp*15)*(p.tech.includes('cyber')?.7:1));
 if(['improve','aid','propaganda','trade'].includes(action)&&p.money<cost){toast(T('Bütçe yetersiz.','Insufficient funds.'));return;}
 switch(action){
 case 'improve':p.money-=cost;addRel(p.id,c.id,10);toast(T('Diplomatik ilişki +10','Diplomatic relations +10'));break;
 case 'aid':p.money-=cost;c.money+=cost;addRel(p.id,c.id,8);toast(T('Ekonomik yardım gönderildi.','Economic aid sent.'));break;
 case 'alliance':
  if(rel(p.id,c.id)>=68&&chance(.8)){setRel(p.id,c.id,85);toast(T('İttifak kabul edildi.','Alliance accepted.'));addNews(T('Yeni ittifak','A new alliance'),`${cname(p)} / ${cname(c)}.`,'diplomacy');}
  else toast(T('İttifak reddedildi. Önce ilişkileri geliştir.','Alliance declined. Improve relations first.'));break;
 case 'break':setRel(p.id,c.id,50);toast(T('İttifak sona erdi.','Alliance ended.'));break;
 case 'trade':
  if(p.trade.includes(c.id)){toast(T('Ticaret anlaşması zaten var.','A trade agreement already exists.'));break;}
  if(rel(p.id,c.id)<55){toast(T('Ticaret için en az 55 ilişki gerekli.','Trade requires at least 55 relations.'));break;}
  p.money-=cost;p.trade.push(c.id);c.trade.push(p.id);toast(T('Ticaret anlaşması: aylık gelir +%4','Trade agreement: monthly income +4%'));break;
 case 'propaganda':
  if(game.monthCount-(p.lastPropaganda??-4)<3){toast(T('Diplomatik kampanya için 3 ay beklemelisin.','Wait 3 months between diplomatic campaigns.'));return;}
  p.money-=cost;p.lastPropaganda=game.monthCount;addRel(p.id,c.id,-12);
  for(const n of countries)if(n.id!==p.id&&n.id!==c.id&&rel(n.id,c.id)<25)addRel(p.id,n.id,5);
  addNews(T('Diplomatik gerilim','Diplomatic tensions'),T(`${cname(p)}, ${cname(c)} yönetimini kınadı. Rakiplerin tutumu değişti.`,`${cname(p)} condemns ${cname(c)}. Rival governments adjust their stance.`),'diplomacy');toast(T('İlişkiler ve bölgesel dengeler değişti.','Relations and regional balances have shifted.'));break;
 }
 sound();drawCountryPanel();updateHUD();
}
function airstrike(target,xy,nuclear=false){
 const p=me(),c=byId(target);if(!c||target===p.id||!c.land)return;
 if(nuclear&&!p.tech.includes('nuclear'))return;
 if(!nuclear&&(!p.units[5]||!p.tech.includes('air'))){toast(T('Uçak ve hava üstünlüğü teknolojisi gerekli.','Aircraft and air superiority are required.'));return;}
 if((nuclear?p.nuclearCooldown:p.airCooldown)>0){toast(T('Birlikler henüz yeni göreve hazır değil.','Units are not ready for another mission.'));return;}
 if(!nuclear&&!game.wars.some(w=>(w.a===p.id&&w.b===target)||(w.b===p.id&&w.a===target))){toast(T('Hava saldırısı için hedef ülkeyle savaşta olmalısın.','An airstrike requires a war with the target.'));return;}
 const cost=nuclear?50000000:Math.max(250000,p.units[5]*300);if(p.money<cost){toast(T('Operasyon bütçesi yetersiz.','Insufficient operation budget.'));return;}
 p.money-=cost;if(nuclear)p.nuclearCooldown=12;else p.airCooldown=1.5;
 const start=ownedCenter(p.id);game.projectiles.push({from:start,to:xy,type:nuclear?'nuke':'air',t:0,duration:nuclear?4:3,target});
 game.targetMode=null;toast(T('Operasyon başlatıldı.','Operation launched.'));updateHUD();
}
function strikeImpact(pj){
 const c=byId(pj.target),p=me(),n=pj.type==='nuke';
 const mitigation=n?0:Math.min(.75,c.units[4]/Math.max(1,p.units[5]*2));
 const dmg=n?.55:Math.min(.2,.03+p.units[5]/Math.max(200,totalUnits(c)))*(1-mitigation);
 loseUnits(c,totalUnits(c)*dmg);c.gdp*=n?.65:.985;c.money*=n?.7:.99;c.happiness=clamp(c.happiness-(n?32:5),0,100);c.morale=clamp(c.morale-(n?30:6),0,100);
 c.protestMonths+=n?3:0;game.effects.push({type:n?'nuke':'bomb',x:pj.to[0],y:pj.to[1],life:n?5:1.6,max:n?5:1.6});sound(n?'nuke':'bomb');
 if(n){for(const o of countries)if(o.id!==p.id)addRel(p.id,o.id,-35);p.happiness=Math.max(0,p.happiness-14);addNews(T('Nükleer felaket','Nuclear catastrophe'),T(`${cname(c)} ağır kayıplar verdi. Dünya ${cname(p)} yönetimini kınıyor.`,`${cname(c)} suffers catastrophic losses. The world condemns ${cname(p)}.`),'nuclear');}
 else addNews(T('Hava harekâtı','Air operation'),T(`${cname(c)} hedeflerine saldırı. Uçaksavar savunması kayıpları etkiledi.`,`${cname(c)} struck. Anti-air defenses affect the losses.`),'war');
 updateHUD();
}
function monthTick(){
 game.monthCount++;game.month++;if(game.month>12){game.month=1;game.year++;}
 for(const c of countries){
  if(!c.land)continue;const b=budget(c);c.money+=b.net;
  const stress=Math.max(0,c.tax-36)*.035+Math.max(0,c.inflation-12)*.035+c.exhaustion*.012;
  c.happiness=clamp(c.happiness+(c.social-18)*.027+ide(c).happy-stress-(b.net<0?.3:0),0,100);
  c.inflation=clamp(c.inflation+(c.money<0?1.3:-.09)+(c.tax>46?.12:0),1,80);
  c.gdp*=1+(.0012+(c.happiness-50)*.000018-(c.inflation>18?.0015:0));
  c.research+=Math.max(2,c.science*.4)*ide(c).research*(c.tech.includes('education')?1.25:1);
  c.exhaustion=Math.max(0,c.exhaustion-.3);c.morale=clamp(c.morale+1.5-c.exhaustion*.02,0,100);
  c.airCooldown=Math.max(0,c.airCooldown-1);c.nuclearCooldown=Math.max(0,c.nuclearCooldown-1);
  if(c.money<0){loseUnits(c,totalUnits(c)*.025);c.money=Math.max(-b.income*3,c.money);}
  if(c.happiness<38&&c.money<0)c.protestMonths++;else c.protestMonths=Math.max(0,c.protestMonths-1);
  if(c.currentResearch){c.currentResearch.left--;if(c.currentResearch.left<=0){const id=c.currentResearch.id;c.tech.push(id);c.currentResearch=null;if(c.id===game.player){toast(T('Araştırma tamamlandı: ','Research complete: ')+T(techDefs.find(t=>t.id===id).tr,techDefs.find(t=>t.id===id).en));sound('tech');}}}
  if(c.id!==game.player&&chance(.18)&&c.money>5000000){const n=Math.min(100,Math.floor(c.money*.02/18000));c.units[0]+=n;c.money-=n*18000;}
  if(c.id!==game.player&&!c.currentResearch&&c.research>60&&chance(.24)){const t=techDefs.find(t=>!c.tech.includes(t.id)&&c.research>=t.cost&&t.req.every(r=>c.tech.includes(r)));if(t){c.research-=t.cost;c.currentResearch={id:t.id,left:t.time,total:t.time};}}
 }
 const p=me();
 if(game.monthCount>=game.nextEvent&&game.monthCount-game.lastEvent>=5){
  if(p.protestMonths>=3||p.inflation>30&&p.happiness<45){p.money-=Math.max(500000,p.gdp*50);p.happiness=Math.max(5,p.happiness-5);addNews(T('Başkentte protestolar','Protests in the capital'),T('Uzun süren bütçe açığı ve hayat pahalılığı halkı sokağa döktü. Sosyal bütçeyi ve vergileri yeniden dengele.','Sustained deficits and living costs drive public protests. Rebalance taxes and social spending.'),'protest');eventNotification('protest');game.lastEvent=game.monthCount;}
  else if(chance(.14)){const type=chance(.5)?'flood':'quake',loss=p.gdp*80*(p.tech.includes('resilience')?.5:1);p.money-=loss;p.happiness=Math.max(0,p.happiness-4);addNews(T(type==='flood'?'Bölgesel sel':'Bölgesel deprem',type==='flood'?'Regional flooding':'Regional earthquake'),T(`Afet müdahalesi bütçeye ${num(loss)} yük getirdi.`,`Emergency response costs ${num(loss)}.`),type);eventNotification(type);game.lastEvent=game.monthCount;}
  game.nextEvent=game.monthCount+5+Math.floor(random()*7);
 }
 if(game.monthCount>3&&game.monthCount%3===0&&game.wars.length<14){
  const ai=countries.filter(c=>c.id!==p.id&&c.land&&power(c)>150);
  for(let j=0;j<Math.min(8,ai.length);j++){const a=ai[Math.floor(random()*ai.length)];if(game.wars.some(w=>w.a===a.id||w.b===a.id))continue;
   const targets=a.neighbors.map(byId).filter(b=>b.land&&rel(a.id,b.id)<28&&power(a)>power(b)*1.5);
   if(targets.length&&chance(.16)){const b=targets[Math.floor(random()*targets.length)];declareWar(a.id,b.id,true);break;}
  }
 }
 victoryCheck();saveGame(true);updateHUD();if(selected)drawCountryPanel();
}
function victoryCheck(){
 if(!game||game.won||game.loss)return;
 const alive=countries.filter(c=>c.land>0);
 if(alive.length===1&&alive[0].id===game.player){
  game.won=true;game.paused=true;if(!game.awarded&&!Online.isOnline()){profile.gold=(profile.gold||0)+50;profile.victories=(profile.victories||0)+1;game.awarded=true;store.write('profile',profile);}
  if(Online.isOnline())void Online.finish();
  sound('win');saveGame(true);showVictory();
 }
}
function sim(dt){
 if(mode!=='play'||!game||game.paused||game.won||game.loss)return;
 game.elapsed+=dt;game.simStep+=dt;
 for(const c of countries)for(const q of c.queue){q.left-=dt;if(q.left<=0){c.units[q.i]+=q.n;q.done=true;if(c.id===game.player)toast(T('Birlikler göreve hazır.','Units ready for deployment.'));}} 
 for(const c of countries)c.queue=c.queue.filter(q=>!q.done);
 game.day=1+Math.floor(game.elapsed%30);
 while(game.elapsed>=30){game.elapsed-=30;monthTick();}
 if(game.simStep>=.65){let step=Math.min(game.simStep,2);game.simStep=0;for(const w of game.wars)tickWar(w,step);game.wars=game.wars.filter(w=>!w.finished&&byId(w.a).land&&byId(w.b).land);victoryCheck();}
 for(const p of game.projectiles){p.t+=dt;if(p.t>=p.duration){p.done=true;strikeImpact(p);}}
 game.projectiles=game.projectiles.filter(p=>!p.done);
 for(const e of game.effects)e.life-=dt;game.effects=game.effects.filter(e=>e.life>0);
 dirty=true;
}
function saveGame(quiet=false){
 if(!game)return;const data={game:{...game,projectiles:[],effects:[]},states:countries.map(c=>({id:c.id,land:c.land,initialLand:c.initialLand,money:c.money,gdp:c.gdp,units:c.units,tax:c.tax,social:c.social,science:c.science,happiness:c.happiness,inflation:c.inflation,morale:c.morale,ideology:c.ideology,research:c.research,tech:c.tech,currentResearch:c.currentResearch,queue:c.queue,trade:c.trade,exhaustion:c.exhaustion,protestMonths:c.protestMonths,lastReform:c.lastReform,lastPropaganda:c.lastPropaganda,airCooldown:c.airCooldown,nuclearCooldown:c.nuclearCooldown})),owners:Array.from(owners),camera,rngState};
 store.write('campaign',data);Online.saved(quiet);if(!quiet)toast(T('Oyun kaydedildi.','Campaign saved.'));
}
function resumeGame(){
 const d=store.read('campaign');if(!d||d.game?.version!==1||d.owners?.length!==original.length){toast(T('Kayıt bulunamadı.','No compatible save found.'));return;}
 game=d.game;game.paused=true;game.targetMode=null;game.effects=[];game.projectiles=[];rngState=d.rngState;
 for(const c of d.states)Object.assign(byId(c.id),c);owners=new Uint8Array(d.owners);camera=d.camera;mode='play';selected=game.player;ownershipDirty=true;rebuildBase();enterGameUI();toast(T('Kayıt yüklendi. Devam etmek için oynat.','Save loaded. Press play to resume.'));
 if(game.won){showVictory();if(Online.isOnline()&&!game.online?.accepted)void Online.finish();}
}
function cellXY(k){return[(k%GW+.5)*MW/GW,(((k/GW)|0)+.5)*MH/GH];}
function ownedCenter(id){const c=byId(id);let k=Math.floor(c.label[1]/MH*GH)*GW+Math.floor(c.label[0]/MW*GW);if(owners?.[k]===id)return c.label;for(let n=0;n<owners.length;n++)if(owners[n]===id)return cellXY(n);return c.label;}
function countryAt(x,y){if(x<0||x>=MW||y<0||y>=MH)return 0;const k=Math.floor(y/MH*GH)*GW+Math.floor(x/MW*GW);let id=owners?.[k]||original?.[k];if(!id){for(const q of adjacent(k))if((owners||original)[q])return(owners||original)[q];}return id||0;}
function resize(){
 view={w:innerWidth,h:innerHeight,dpr:Math.min(devicePixelRatio||1,settings.quality===2?2:1.5)};
 $('#world').width=Math.round(view.w*view.dpr);$('#world').height=Math.round(view.h*view.dpr);dirty=true;
}
function screenWorld(x,y){return[(x-view.w/2)/camera.z+camera.x,(y-view.h/2)/camera.z+camera.y];}
function worldScreen(x,y){return[(x-camera.x)*camera.z+view.w/2,(y-camera.y)*camera.z+view.h/2];}
function zoomAt(z,x=view.w/2,y=view.h/2){let before=screenWorld(x,y);camera.z=clamp(z,Math.min(view.w/MW,view.h/MH)*.75,18);let after=screenWorld(x,y);camera.x+=before[0]-after[0];camera.y+=before[1]-after[1];clampCamera();dirty=true;}
function clampCamera(){camera.x=clamp(camera.x,-50,MW+50);camera.y=clamp(camera.y,0,MH);}
function focusCountry(id){const c=byId(id);if(!c)return;const center=mode==='play'?ownedCenter(id):c.label;camera.z=clamp(2.2/Math.sqrt(c.area+.005),1.2,9);if(c.code==='TR')camera.z=5.7;camera.x=center[0]-(mode==='select'&&view.w>600?view.w*.12/camera.z:0);camera.y=center[1]-(mode==='play'?35/camera.z:0);dirty=true;}
function fitWorld(){camera={x:900,y:430,z:Math.min(view.w/1800,view.h/860)*.94};dirty=true;}
function rebuildBase(){
 mapRevision++;
 if(!geo)return;worldCache.width=3600;worldCache.height=1800;let c=worldCache.getContext('2d');c.scale(2,2);c.fillStyle='#183b50';c.fillRect(0,0,MW,MH);
 if(terrain.complete&&terrain.naturalWidth)c.drawImage(terrain,0,0,MW,MH);
 c.fillStyle='#0c2432';c.globalAlpha=.5;c.fillRect(0,0,MW,MH);c.globalAlpha=1;
 for(const n of countries){
  const path=n.path2;const owner=game&&n.land===0?byId(owners[Math.floor(n.label[1]/MH*GH)*GW+Math.floor(n.label[0]/MW*GW)])||n:n;
  c.globalAlpha=.48;c.fillStyle=owner.color;c.fill(path);c.globalAlpha=1;c.lineWidth=.45;c.strokeStyle='#c1c6aa88';c.stroke(path);
  if(settings.flags&&flagImages[owner.flag]?.complete&&flagImages[owner.flag].naturalWidth){c.save();c.clip(path);c.globalAlpha=.15;const w=clamp(Math.sqrt(n.area)*500,24,350),h=w*.66;c.drawImage(flagImages[owner.flag],n.label[0]-w/2,n.label[1]-h/2,w,h);c.restore();}
 }
 if(settings.admin){c.strokeStyle='#b4bfc533';c.lineWidth=.3;for(const l of geo.lines)c.stroke(l.path2);}
 dirty=true;
}
function rebuildOccupation(){
 mapRevision++;
 occupation.width=GW;occupation.height=GH;let oc=occupation.getContext('2d'),image=oc.createImageData(GW,GH);
 if(game){for(let k=0;k<owners.length;k++)if(owners[k]&&owners[k]!==original[k]){
 const c=byId(owners[k]),rgb=c.rgb;image.data[k*4]=rgb[0];image.data[k*4+1]=rgb[1];image.data[k*4+2]=rgb[2];image.data[k*4+3]=230;
 }}
 oc.putImageData(image,0,0);ownershipDirty=false;
}
function armyMarker(x,y,c,scale=1,type=0){
 const s=clamp(13*scale,10,20),pos=worldScreen(x,y);x=pos[0];y=pos[1];if(x<0||x>view.w||y<0||y>view.h)return;
 ctx.save();ctx.translate(x,y);ctx.fillStyle='#102330';ctx.strokeStyle=c.id===game?.player?'#e6c389':'#b8c9cb';ctx.lineWidth=1.2;
 ctx.beginPath();ctx.moveTo(-s*.6,s*.45);ctx.lineTo(0,s*1.25);ctx.lineTo(s*.6,s*.45);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.beginPath();ctx.arc(0,0,s*.68,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.clip();
 if(flagImages[c.flag]?.naturalWidth)ctx.drawImage(flagImages[c.flag],-s,-s*.7,s*2,s*1.4);ctx.restore();
 if(type===5){ctx.save();ctx.translate(x,y+s);ctx.strokeStyle='#d3dfe0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-10,3);ctx.lineTo(0,-3);ctx.lineTo(10,3);ctx.moveTo(0,-3);ctx.lineTo(0,8);ctx.stroke();ctx.restore();}
}
function render(now){
 const key=()=>[camera.x,camera.y,camera.z,view.w,view.h,view.dpr,selected,mapRevision,lang,settings.labels,mode].join('|');
 ctx.setTransform(view.dpr,0,0,view.dpr,0,0);
 if(!ownershipDirty&&mapCacheKey===key()&&staticFrame.width===$('#world').width){ctx.drawImage(staticFrame,0,0,view.w,view.h);}
 else{
 ctx.fillStyle='#0d2534';ctx.fillRect(0,0,view.w,view.h);
 ctx.save();ctx.translate(view.w/2,view.h/2);ctx.scale(camera.z,camera.z);ctx.translate(-camera.x,-camera.y);
 if(worldCache.width)ctx.drawImage(worldCache,0,0,MW,MH);
 if(camera.z>1.5){ctx.lineWidth=.65/camera.z;ctx.strokeStyle='#cfdbc9aa';for(const c of countries){if(Math.abs(c.label[0]-camera.x)<view.w/camera.z+160&&Math.abs(c.label[1]-camera.y)<view.h/camera.z+100)ctx.stroke(c.path2);}}
 if(ownershipDirty)rebuildOccupation();ctx.imageSmoothingEnabled=false;ctx.drawImage(occupation,0,0,MW,MH);ctx.imageSmoothingEnabled=true;
 ctx.strokeStyle='#81aac115';ctx.lineWidth=.5/camera.z;for(let x=0;x<=1800;x+=150){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,900);ctx.stroke();}for(let y=0;y<=900;y+=150){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1800,y);ctx.stroke();}
 if(selected){const c=byId(selected);ctx.strokeStyle=selected===game?.player?'#f2d19a':'#fff1bd';ctx.lineWidth=1.8/camera.z;ctx.shadowColor='#d9b776';ctx.shadowBlur=8;ctx.stroke(c.path2);ctx.shadowBlur=0;}
 ctx.restore();
 if(settings.labels){ctx.textAlign='center';for(const c of countries){
  if(game&&!c.land)continue;const xy=worldScreen(...c.label);if(xy[0]<-80||xy[0]>view.w+80||xy[1]<0||xy[1]>view.h)continue;
  const size=clamp(Math.sqrt(c.area)*camera.z*24+6,10,19);if(size<11.9&&selected!==c.id)continue;
  ctx.font=`600 ${clamp(size,12,19)}px Barlow`;ctx.fillStyle=c.id===game?.player?'#fff0cd':'#e4e9df';ctx.strokeStyle='#193542aa';ctx.lineWidth=3;const txt=cname(c).toLocaleUpperCase(lang==='tr'?'tr':'en');ctx.strokeText(txt,xy[0],xy[1]);ctx.fillText(txt,xy[0],xy[1]);
 }}
 if(camera.z<1.1){ctx.fillStyle='#c1d8e14d';ctx.font='13px Cinzel';ctx.textAlign='center';for(const [label,x,y]of[[T('ATLAS OKYANUSU','ATLANTIC OCEAN'),510,480],[T('PASİFİK OKYANUSU','PACIFIC OCEAN'),1550,500],[T('HİNT OKYANUSU','INDIAN OCEAN'),1190,670]]){const p=worldScreen(x,y);ctx.fillText(label,p[0],p[1]);}}
 staticFrame.width=$('#world').width;staticFrame.height=$('#world').height;staticFrame.getContext('2d').drawImage($('#world'),0,0);mapCacheKey=key();
 }
 if(mode==='play'&&game){
  const visited=new Set();
  for(const w of game.wars){
   if(w.naval&&w.landingTime>0){ctx.strokeStyle='#e2c38a';ctx.setLineDash([5,6]);ctx.beginPath();w.naval.route.forEach((k,i)=>{let p=worldScreen(...cellXY(k));i?ctx.lineTo(...p):ctx.moveTo(...p);});ctx.stroke();ctx.setLineDash([]);}
   const f=w.front;if(!f.length)continue;
   for(let i=0;i<Math.min(4,f.length);i++){let k=f[Math.floor((i+.5)/Math.min(4,f.length)*f.length)],p=cellXY(k);armyMarker(p[0]-1,p[1],byId(w.a),.9);armyMarker(p[0]+2,p[1]+3,byId(w.b),.9);for(let j=0;j<w.support.length;j++)if(w.support[j].power>0)armyMarker(p[0]-4-j*3,p[1]-4,byId(w.support[j].id),.7);}
   visited.add(w.a);visited.add(w.b);
  }
  if(!visited.has(game.player))armyMarker(...ownedCenter(game.player),me(),1,me().units[5]>0?5:0);
  if(selected&&selected!==game.player&&!visited.has(selected))armyMarker(...ownedCenter(selected),byId(selected),.85);
  if(camera.z>=3||game.targetMode==='nuclearCity'){ctx.textAlign='left';for(const city of geo.cities){const c=byId(city.countryId);if(!c||!c.land||(!city.capital&&city.pop<1000000&&game.targetMode!=='nuclearCity'))continue;const s=worldScreen(...city.xy);if(s[0]<0||s[0]>view.w||s[1]<0||s[1]>view.h)continue;if(game.targetMode==='nuclearCity'&&c.id!==game.nuclearTarget)continue;ctx.fillStyle=city.capital?'#f3d89d':'#d5e5e6';ctx.beginPath();ctx.arc(s[0],s[1],city.capital?2.5:1.5,0,7);ctx.fill();ctx.font='12px Barlow';ctx.strokeStyle='#0b202b';ctx.lineWidth=3;ctx.strokeText(city.name,s[0]+5,s[1]-5);ctx.fillText(city.name,s[0]+5,s[1]-5);}}
  for(const pj of game.projectiles){const t=pj.t/pj.duration,x=pj.from[0]+(pj.to[0]-pj.from[0])*t,y=pj.from[1]+(pj.to[1]-pj.from[1])*t-Math.sin(t*Math.PI)*20;const p=worldScreen(x,y);ctx.fillStyle='#e8d7ad';ctx.beginPath();ctx.moveTo(p[0],p[1]-8);ctx.lineTo(p[0]-5,p[1]+5);ctx.lineTo(p[0]+5,p[1]+5);ctx.closePath();ctx.fill();}
  for(const e of game.effects){const p=worldScreen(e.x,e.y),t=1-e.life/e.max;ctx.globalAlpha=1-t;ctx.strokeStyle=e.type==='nuke'?'#ffdd99':'#e1ab74';ctx.lineWidth=e.type==='battle'?1:3;ctx.beginPath();ctx.arc(p[0],p[1],e.type==='battle'?3+t*8:e.type==='nuke'?10+t*130:5+t*40,0,Math.PI*2);ctx.stroke();if(e.type!=='battle'){const g=ctx.createRadialGradient(p[0],p[1],0,p[0],p[1],e.type==='nuke'?70:25);g.addColorStop(0,'#fff8cf');g.addColorStop(.3,'#eaa554');g.addColorStop(1,'#a9581c00');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p[0],p[1],e.type==='nuke'?70:25,0,7);ctx.fill();}ctx.globalAlpha=1;}
 }
 if(mode==='play'&&game?.targetMode){ctx.fillStyle='#102531ed';ctx.fillRect(view.w/2-165,view.h-115,330,32);ctx.font='14px Barlow';ctx.textAlign='center';ctx.fillStyle='#e6c98e';ctx.fillText(game.targetMode==='nuclearCity'?T('Hedef şehri seç','Select a target city'):T('Haritadan hedef ülkeyi seç','Select the target country'),view.w/2,view.h-94);}
 dirty=false;
}
let pointers=new Map(),drag=null,pinch=null;
$('#world').addEventListener('pointerdown',e=>{
 $('#world').setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===1)drag={x:e.clientX,y:e.clientY,ox:camera.x,oy:camera.y,moved:false};
 if(pointers.size===2){const p=[...pointers.values()];pinch={dist:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),z:camera.z};}
});
$('#world').addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===2&&pinch){const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);zoomAt(pinch.z*d/Math.max(1,pinch.dist),(p[0].x+p[1].x)/2,(p[0].y+p[1].y)/2);if(drag)drag.moved=true;}
 else if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5)drag.moved=true;camera.x=drag.ox-dx/camera.z;camera.y=drag.oy-dy/camera.z;clampCamera();dirty=true;}
});
function pointerEnd(e){const click=drag&&!drag.moved&&pointers.size===1;pointers.delete(e.pointerId);if(click)mapClick(...screenWorld(e.clientX,e.clientY));if(!pointers.size){drag=null;pinch=null;}else{const p=[...pointers.values()][0];drag={x:p.x,y:p.y,ox:camera.x,oy:camera.y,moved:true};pinch=null;}}
$('#world').addEventListener('pointerup',pointerEnd);$('#world').addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);drag=null;pinch=null;});
$('#world').addEventListener('wheel',e=>{e.preventDefault();zoomAt(camera.z*Math.exp(-e.deltaY*.0012),e.clientX,e.clientY);},{passive:false});
function mapClick(x,y){
 if(mode!=='play'&&mode!=='select')return;const id=countryAt(x,y);if(!id)return;
 if(mode==='select'){selected=id;focusCountry(id);updateSelection();return;}
 if(game.targetMode==='air'){airstrike(id,[x,y]);return;}
 if(game.targetMode==='nuclear'){if(id===game.player)return;game.nuclearTarget=id;game.targetMode='nuclearCity';selected=id;focusCountry(id);camera.z=Math.max(camera.z,4);toast(T('Şimdi haritadaki bir şehir işaretine dokun.','Now tap a city marker on the map.'));dirty=true;return;}
 if(game.targetMode==='nuclearCity'){
  const cities=geo.cities.filter(c=>c.iso===byId(game.nuclearTarget).iso);const sorted=cities.map(c=>({c,d:Math.hypot(c.xy[0]-x,c.xy[1]-y)*camera.z})).sort((a,b)=>a.d-b.d);
  if(!sorted.length||sorted[0].d>40){toast(T('Bir şehir işaretine dokun.','Tap a city marker.'));return;}
  confirmNuclear(game.nuclearTarget,sorted[0].c);return;
 }
 selected=id;drawCountryPanel();dirty=true;sound();
}
let prev=0,hudTimer=0,frames=0,fps=0,fpsAt=0;
function loop(now){
 const dt=prev?Math.min((now-prev)/1000,.2):0;prev=now;
 if(mode==='play'&&game)sim(dt*game.speed);
 if(dirty)render(now);frames++;if(now-fpsAt>1000){fps=Math.round(frames*1000/(now-fpsAt));fpsAt=now;frames=0;const f=$('.debug');if(f)f.textContent=`${fps} FPS`;}
 hudTimer+=dt;if(hudTimer>.5&&mode==='play'){hudTimer=0;updateHUDValues();}
 requestAnimationFrame(loop);
}
window.advanceTime=ms=>{for(let i=0;i<ms;i+=50)sim(Math.min(50,ms-i)/1000);render(performance.now());updateHUDValues();};
window.render_game_to_text=()=>JSON.stringify({mode,selected:selected?cname(byId(selected)):null,player:game?{name:cname(me()),money:Math.round(me().money),army:Math.round(totalUnits(me())),happiness:Math.round(me().happiness),tech:me().tech,land:me().land}:null,date:game?dateText():null,paused:game?.paused,wars:game?.wars.map(w=>({a:cname(byId(w.a)),b:cname(byId(w.b)),taken:w.taken,front:w.front.length,support:w.support})),coords:'equirectangular world x 0..1800 west-east, y 0..900 north-south'});
window.nativePause=()=>{if(game){game.paused=true;saveGame(true);}$('#music').pause();};
document.addEventListener('visibilitychange',()=>{if(document.hidden)window.nativePause();});
window.addEventListener('resize',resize);
document.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea'))return;if(e.code==='Space'&&mode==='play'){e.preventDefault();game.paused=!game.paused;updateHUDValues();}if(e.key==='Escape')backAction();if(e.key==='+'||e.key==='=')zoomAt(camera.z*1.25);if(e.key==='-')zoomAt(camera.z/1.25);if(e.key.toLowerCase()==='s'&&mode==='play')saveGame();});
async function boot(){
 try{
 const progress=(n,text)=>{$('.load-track i').style.width=n+'%';$('#load-label').textContent=text;};
 progress(15,T('Dünya atlası yükleniyor','Loading world atlas'));
 const [g,b]=await Promise.all([fetch('assets/world.json').then(r=>r.json()),fetch('assets/cells.bin').then(r=>r.arrayBuffer())]);geo=g;countries=g.countries;GW=g.gridWidth;GH=g.gridHeight;original=new Uint8Array(b);owners=new Uint8Array(original);landTotal=countries.reduce((s,c)=>s+c.cells,0);
 for(const c of countries){c.path2=new Path2D(c.path);c.baseGdp=c.gdp;c.color ||= '#8197a5';c.rgb=c.color.match(/\w\w/g).map(h=>parseInt(h,16));if(!countryByCode[c.code]||countryByCode[c.code].cells<c.cells)countryByCode[c.code]=c;}
 for(const l of geo.lines)l.path2=new Path2D(l.path);
 for(const city of geo.cities)city.countryId=countries.find(c=>c.iso===city.iso)?.id;
 progress(45,T('Sınırlar ve görseller hazırlanıyor','Preparing borders and artwork'));
 const loadImg=(im,src)=>new Promise(resolve=>{im.onload=resolve;im.onerror=resolve;im.src=src;});
 await Promise.all([loadImg(terrain,'assets/terrain.webp'),...countries.map(c=>{if(flagImages[c.flag])return null;const im=new Image();flagImages[c.flag]=im;return loadImg(im,`assets/flags/${c.flag}.svg`);})]);
 progress(80,T('Komuta merkezi açılıyor','Opening command center'));
 resize();rebuildBase();fitWorld();requestAnimationFrame(loop);
 await document.fonts.ready;await new Promise(r=>setTimeout(r,900));progress(100,T('Hazır','Ready'));
 if(profile){showMenu();if(Online.isOnline())void Online.restore();}else showRegistration();
 setTimeout(()=>{$('#loading').style.opacity=0;setTimeout(()=>$('#loading').remove(),700);},350);
 }catch(err){$('#load-label').textContent=T('Dosyalar yüklenemedi: ','Unable to load files: ')+err.message;console.error(err);}
}
