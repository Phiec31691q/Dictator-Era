'use strict';
// This is a public project key, not a service-role secret.
const ONLINE_CONFIG=Object.freeze({
 url:'https://iprxpneqciysryvktmlh.supabase.co/functions/v1/dictator-era',
 key:'sb_publishable_09mE6J7IfPN6A1aTdDTf1Q_DQ2lkF9n'
});
const Online=(()=>{
 let session=store.read('online-session'),busy=false,lastCheck=0,checkBusy=false,finishBusy=false;
 const messages={
  INVALID_NAME:['Ad 3–18 karakter olmalı.','Name must be 3–18 characters.'],
  NAME_NOT_ALLOWED:['Bu komutan adı uygun değil.','This commander name is not allowed.'],
  NAME_TAKEN:['Bu ad başka bir oyuncuya ait.','That name belongs to another player.'],
  NAME_OR_DEVICE_TAKEN:['Ad veya cihaz zaten kayıtlı.','Name or device is already registered.'],
  DEVICE_REGISTERED:['Bu cihazda hesap oluşturulmuş. Mevcut hesabınla giriş yap.','An account was created on this device. Sign in to your existing account.'],
  WEAK_PASSWORD:['Şifre 8–72 karakter, en az bir harf ve rakam içermeli.','Use 8–72 characters, including a letter and number.'],
  INVALID_CREDENTIALS:['Komutan adı veya şifre hatalı.','Commander name or password is incorrect.'],
  INVALID_RECOVERY:['Kurtarma kodu veya ad hatalı.','Recovery code or name is incorrect.'],
  RATE_LIMITED:['Çok fazla deneme. Bir süre sonra tekrar dene.','Too many attempts. Try again later.'],
  SESSION_EXPIRED:['Oturumun sona erdi. Yeniden giriş yap.','Your session expired. Sign in again.'],
  CAMPAIGN_INACTIVE:['Bu online sefer artık aktif değil. Yeni bir online sefer başlat.','This online campaign is no longer active. Start a new one.'],
  SERVER_REJECTED:['Sunucu sefer verisini kabul etmedi.','The server rejected the campaign data.'],
  MORE_PLAY_REQUIRED:['Zafer doğrulaması bekliyor: en az 10 dakika, 12 oyun ayı ve üç sunucu kontrol noktası gerekli.','Victory verification pending: at least 10 minutes, 12 game months and three server checkpoints are required.'],
  WORLD_NOT_CONQUERED:['Dünya hâkimiyeti sunucuda doğrulanamadı.','World domination could not be validated.'],
  NETWORK:['Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.','Cannot reach the server. Check your internet connection.']
 };
 const errorText=e=>T(...(messages[e?.code]||messages.NETWORK));
 function isOnline(){return profile?.mode==='online';}
 function persist(){store.write('online-session',session);}
 async function request(action,data={},auth=true,retried=false){
  if(auth&&(!session?.access_token))throw Object.assign(new Error(),{code:'SESSION_EXPIRED'});
  if(auth&&session.expires_at*1000<Date.now()+45000&&!retried)await refresh();
  let response;
  try{response=await fetch(ONLINE_CONFIG.url,{method:'POST',headers:{'Content-Type':'application/json',apikey:ONLINE_CONFIG.key,...(auth?{Authorization:'Bearer '+session.access_token}:{})},body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(18000)});}
  catch{throw Object.assign(new Error(),{code:'NETWORK'});}
  let result;try{result=await response.json();}catch{throw Object.assign(new Error(),{code:'NETWORK'});}
  if(response.status===401&&auth&&!retried){await refresh();return request(action,data,auth,true);}
  if(!response.ok||result.error)throw Object.assign(new Error(),{code:result.error||'NETWORK'});
  return result;
 }
 let refreshing;
 async function refresh(){
  if(refreshing)return refreshing;
  refreshing=(async()=>{if(!session?.refresh_token)throw Object.assign(new Error(),{code:'SESSION_EXPIRED'});const r=await request('refresh',{refresh_token:session.refresh_token},false);session=r.session;persist();})();
  try{return await refreshing;}finally{refreshing=null;}
 }
 async function device(){
  if(window.Native?.deviceHash)return Native.deviceHash();
  let id=store.read('browser-installation');if(!id){id=crypto.randomUUID();store.write('browser-installation',id);}
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 }
 function takeProfile(p){
  profile={id:p.id,name:p.name,country:p.country,gold:p.gold,victories:p.victories,created:p.created,mode:'online',lang};
  store.write('profile',profile);
 }
 function form(kind='login'){
  const registering=kind==='register',recovering=kind==='recover';
  const name=profile?.name||$('#player-name')?.value||'';
  openDialog(T(registering?'Online hesap oluştur':recovering?'Hesabı kurtar':'Online giriş',registering?'Create online account':recovering?'Recover account':'Online sign-in'),
   `<div class="online-form"><div class="row">${icon('globe')}<span>${T('DICTATOR ERA ÇEVRİMİÇİ HESABI','DICTATOR ERA ONLINE ACCOUNT')}</span></div><p>${T('Komutan adın ve şifrenle giriş yap. Bu Google Play hesabı değildir.','Sign in with your commander name and password. This is not a Google Play account.')}</p><label for="online-name">${T('Komutan adı','Commander name')}</label><input id="online-name" maxlength="18" autocomplete="username" value="${esc(name)}">${recovering?`<label for="online-recovery">${T('Kurtarma kodu','Recovery code')}</label><input id="online-recovery" maxlength="48" autocomplete="off">`:''}<label for="online-password">${T(recovering?'Yeni şifre':'Şifre',recovering?'New password':'Password')}</label><input type="password" id="online-password" minlength="8" maxlength="72" autocomplete="${registering||recovering?'new-password':'current-password'}">${registering?`<label for="online-country">${T('Profil ülkesi','Profile country')}</label><select id="online-country">${countries.slice().sort((a,b)=>cname(a).localeCompare(cname(b),lang)).map(c=>`<option value="${c.code}" ${c.code===(profile?.country||$('#home-country')?.value||'TR')?'selected':''}>${esc(cname(c))}</option>`).join('')}</select><p class="fineprint">${T('Adın bir kez belirlenir ve sunucuda benzersizdir. Cihaz başına bir hesap için uygulamaya özgü özetlenmiş cihaz kimliği gönderilir. Şifren cihazda saklanmaz. Misafir altını online hesaba taşınmaz.','Your name is set once and is server-unique. An app-specific hashed device identifier is sent to enforce one account per device. Your password is not stored on the device. Guest gold does not transfer.')}</p>`:''}<div id="online-error" class="form-error" role="alert"></div><div class="stack"><button class="primary wide" data-online="${kind}">${T(registering?'Hesap oluştur':recovering?'Şifreyi yenile':'Giriş yap',registering?'Create account':recovering?'Reset password':'Sign in')}</button>${!registering?`<button data-online="form-register">${T('Yeni hesap oluştur','Create new account')}</button>`:`<button data-online="form-login">${T('Zaten hesabım var','I already have an account')}</button>`}${!recovering?`<button class="ghost" data-online="form-recover">${T('Şifremi unuttum','Forgot password')}</button>`:''}</div><p class="fineprint">${T('Sıralama gerçek sunucu verisini kullanır. Sefer simülasyonu cihazdadır; tam hile koruması değildir.','Rankings use real server data. Campaign simulation runs on the device; this is not full anti-cheat protection.')}</p></div>`,'',true);
 }
 function recoveryNotice(code,recovered=false){
  openDialog(T('Kurtarma kodunu sakla','Keep your recovery code'),`<p>${T('Bu kod yalnızca şimdi gösterilir. Şifreni unutursan hesabını bununla kurtarabilirsin. Kodunu kimseyle paylaşma.','This code is shown only now. It lets you recover your account if you forget your password. Do not share it.')}</p><input id="recovery-code-display" readonly value="${esc(code)}" aria-label="${T('Kurtarma kodu','Recovery code')}" style="font-family:monospace;font-size:13px"><p class="fineprint">${T('Kodu seçip güvenli bir yere kaydet.','Select and save the code somewhere safe.')}</p>`,`<button class="primary" data-online="${recovered?'form-login':'recovery-done'}">${T('Kodu kaydettim','I saved the code')}</button>`,true);
 }
 async function submit(kind,button){
  if(busy)return;busy=true;button.disabled=true;const prior=button.textContent;button.textContent=T('Sunucuya bağlanıyor…','Connecting…');
  try{
   const name=$('#online-name').value.trim(),pass=$('#online-password').value;
   const e=validateName(name);if(e)throw Object.assign(new Error(),{code:'INVALID_NAME'});
   let data={name,password:pass};
   if(kind==='register')Object.assign(data,{country:$('#online-country').value,device:await device()});
   if(kind==='recover')data.recovery=$('#online-recovery').value.trim();
   const r=await request(kind,data,false);
   if(kind==='recover'){session=null;persist();recoveryNotice(r.recovery,true);return;}
   if(profile?.mode==='guest')store.write('guest-profile',profile);
   session=r.session;persist();takeProfile(r.profile);game=null;showMenu();
   if(r.recovery)recoveryNotice(r.recovery);else toast(T('Çevrimiçi giriş başarılı.','Online sign-in successful.'));
  }catch(e){const box=$('#online-error');if(box)box.textContent=errorText(e);}
  finally{busy=false;if(button.isConnected){button.disabled=false;button.textContent=prior;}}
 }
 async function restore(){
  if(!isOnline())return;
  const identity=profile.id;
  try{const r=await request('me');if(!isOnline()||profile.id!==identity)return;takeProfile(r.profile);if(mode==='menu')showMenu();}
  catch(e){if(!isOnline()||profile.id!==identity)return;if(game)game.paused=true;openDialog(T('Online bağlantı gerekli','Online connection required'),`<p>${esc(errorText(e))}</p><p>${T('Online hesap otomatik olarak misafire çevrilmez.','Your online account will not silently become a guest account.')}</p>`,`<button data-online="form-login">${T('Giriş yap','Sign in')}</button><button data-online="restore">${T('Yeniden dene','Retry')}</button><button data-online="guest">${T('Misafir moduna geç','Switch to guest')}</button>`,true);}
 }
 async function guestMode(){
  if(game)saveGame(true);if(session?.access_token){try{await request('logout');}catch{}}
  session=null;persist();game=null;profile=store.read('guest-profile');store.write('profile',profile);
  if(profile)showMenu();else showRegistration();
 }
 async function leaderboard(){
  openDialog(T('Çevrimiçi sıralama','Online leaderboard'),`<div class="empty">${T('Sunucudan yükleniyor…','Loading from server…')}</div>`,'',true);
  const heading=currentDialog,identity=profile.id;
  try{const r=await request('leaderboard');if(!isOnline()||profile.id!==identity||currentDialog!==heading||!$('#dialog-layer').innerHTML)return;takeProfile(r.profile);
   openDialog(T('Çevrimiçi sıralama','Online leaderboard'),`<div class="between"><span>${T('Gerçek oyuncular · İlk 100','Real players · Top 100')}</span><span class="gold">${T('Altının','Your gold')}: ${profile.gold}</span></div><p class="fineprint">${T('Her kabul edilen dünya zaferi 50 altın. Bu sıralama cihazda simüle edilen seferleri temel kontrollerle kabul eder; tam hile koruması yoktur.','Each accepted world victory earns 50 gold. This leaderboard accepts device-simulated campaigns with basic checks, not full anti-cheat protection.')}</p>${r.rows.length?`<div class="online-ranking">${r.rows.map((p,i)=>`<div class="online-rank-row"><span>${i+1}</span>${flag(countryByCode[p.country])}<strong>${esc(p.username)}</strong><span class="gold">${p.gold}</span><small>${p.victories} ${T('zafer','wins')}</small></div>`).join('')}</div>`:`<div class="empty">${T('Henüz oyuncu yok.','No players yet.')}</div>`}`,`<button data-online="leaderboard">${T('Yenile','Refresh')}</button>`);
  }catch(e){if(currentDialog===heading)openDialog(T('Çevrimiçi sıralama','Online leaderboard'),`<p>${esc(errorText(e))}</p>`,`<button data-online="leaderboard">${T('Yeniden dene','Retry')}</button>`,true);}
 }
 function showProfile(){
  openDialog(T('Online komutan profili','Online commander profile'),`<div class="row">${flag(countryByCode[profile.country])}<h3>${esc(profile.name)}</h3></div><p>${T('Bu hesap sunucuya kayıtlıdır. Adın sabittir; misafir kayıtları ve altını ayrıdır.','This account is registered on the server. Your name is fixed; guest saves and gold are separate.')}</p><div class="grid2"><div class="card"><small>${T('Online altın','Online gold')}</small><div class="stat gold">${profile.gold}</div></div><div class="card"><small>${T('Online zafer','Online victories')}</small><div class="stat">${profile.victories}</div></div></div><p class="fineprint">${T('Şifre kurtarma yalnızca hesap açılırken verilen kurtarma koduyla yapılır.','Password recovery requires the recovery code issued during registration.')}</p>`,`<button data-online="leaderboard">${T('Sıralama','Leaderboard')}</button><button data-online="guest">${T('Çıkış / misafir','Sign out / guest')}</button>`,true);
 }
 async function start(button){
  if(!isOnline()){initGame(selected,chosenScenario,difficulty);selected=0;enterGameUI();musicStart();return;}
  if(busy)return;busy=true;button.disabled=true;
  try{const r=await request('start',{player:selected,scenario:chosenScenario,difficulty});initGame(selected,chosenScenario,difficulty,r.campaign.seed);game.online={id:r.campaign.id,user:profile.id};lastCheck=0;saveGame(true);selected=0;enterGameUI();musicStart();}
  catch(e){toast(errorText(e));}finally{busy=false;if(button.isConnected)button.disabled=false;}
 }
 async function checkpoint(force=false){
  if(!isOnline()||!game?.online||game.online.accepted||game.online.user!==profile.id||checkBusy||(!force&&Date.now()-lastCheck<65000))return;
  const campaignId=game.online.id;
  checkBusy=true;lastCheck=Date.now();
  try{await request('checkpoint',{id:game.online.id,month:game.monthCount,land:me().land});}
  catch(e){if(game?.online?.id===campaignId&&isOnline()){game.paused=true;toast(errorText(e));updateHUDValues();}}
  finally{checkBusy=false;}
 }
 async function finish(){
  if(!isOnline()||!game?.won||!game?.online||finishBusy)return;
  const campaignId=game.online.id,identity=profile.id;
  finishBusy=true;
  try{
   await checkpoint(true);
   const rle=[];let owner=owners[0],count=0;for(const v of owners){if(v===owner)count++;else{rle.push(owner,count);owner=v;count=1;}}rle.push(owner,count);
   const r=await request('finish',{id:campaignId,world:rle});if(!isOnline()||profile.id!==identity||game?.online?.id!==campaignId)return;takeProfile(r.profile);game.awarded=true;game.online.accepted=true;saveGame(true);toast(T('Zafer kabul edildi: 50 online altın.','Victory accepted: 50 online gold.'));showVictory();
  }catch(e){toast(errorText(e));}finally{finishBusy=false;}
 }
 function saved(quiet){if(isOnline()&&game?.online)void checkpoint(!quiet);}
 function guestLeaderboardButton(){const footer=$('.modal-footer');if(footer)footer.insertAdjacentHTML('afterbegin',`<button class="primary" data-action="online">${T('Online hesap','Online account')}</button>`);}
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-online]');if(!b||b.disabled)return;
  const a=b.dataset.online;
  if(a.startsWith('form-'))form(a.slice(5));
  else if(['login','register','recover'].includes(a))void submit(a,b);
  else if(a==='recovery-done')closeDialog();
  else if(a==='guest')void guestMode();
  else if(a==='leaderboard')void leaderboard();
  else if(a==='restore')void restore();
  else if(a==='finish')void finish();
 });
 setInterval(()=>{if(isOnline()&&game?.online&&mode==='play'&&!game.online.accepted)void checkpoint();},15000);
 return {isOnline,form,restore,start,saved,finish,leaderboard,showProfile,guestLeaderboardButton};
})();
