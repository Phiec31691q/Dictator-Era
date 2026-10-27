import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { landMask, cellCount, landCount } from "./land-mask.ts";

const url=Deno.env.get("SUPABASE_URL")!;
const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(n=>n.toString(16).padStart(2,"0")).join("");
const randomCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(24))).map(n=>n.toString(16).padStart(2,"0")).join("");
const authClient=()=>createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const safeProfile=(p:any)=>({id:p.user_id,name:p.username,country:p.country,gold:p.gold,victories:p.victories,created:p.created_at});
class ApiError extends Error {constructor(public code:string,public status=400){super(code);}}
function username(s:unknown){
 if(typeof s!=="string")throw new ApiError("INVALID_NAME");
 const display=s.trim().replace(/\s+/g," ").normalize("NFKC");
 if(!/^[\p{L}\p{N}_ .-]{3,18}$/u.test(display))throw new ApiError("INVALID_NAME");
 const key=display.toLocaleLowerCase("tr").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"i");
 const clean=key.replace(/[01345@$]/g,c=>({"0":"o","1":"i","3":"e","4":"a","5":"s","@":"a","$":"s"}[c]!)).replace(/[^a-z]/g,"");
 if(["fuck","shit","bitch","nigger","nazi","hitler","siktir","sikim","orospu","amk","pic","yarrak","gotveren"].some(w=>clean.includes(w)))throw new ApiError("NAME_NOT_ALLOWED");
 return {display,key};
}
function password(p:unknown){if(typeof p!=="string"||p.length<8||p.length>72||!/[a-zA-Z]/.test(p)||!/\d/.test(p))throw new ApiError("WEAK_PASSWORD");return p;}
function checked(result:any){if(result.error)throw new ApiError(result.error.message?.includes("MORE_PLAY_REQUIRED")?"MORE_PLAY_REQUIRED":"SERVER_REJECTED",409);return result.data;}
async function limited(req:Request,action:string,limit:number,seconds:number){
 const ip=(req.headers.get("x-forwarded-for")||req.headers.get("cf-connecting-ip")||"unknown").split(",")[0].trim();
 const key=action+":"+await hash(secret+":"+ip);
 if(!checked(await admin.rpc("de_rate_limit",{p_key:key,p_limit:limit,p_seconds:seconds})))throw new ApiError("RATE_LIMITED",429);
}
async function current(req:Request){
 const bearer=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!bearer)throw new ApiError("SIGN_IN_REQUIRED",401);
 const {data,error}=await admin.auth.getUser(bearer);
 if(error||!data.user)throw new ApiError("SESSION_EXPIRED",401);
 const p=checked(await admin.from("de_profiles").select("*").eq("user_id",data.user.id).maybeSingle());
 if(!p)throw new ApiError("PROFILE_NOT_FOUND",403);
 return {user:data.user,profile:p,token:bearer};
}
const mask=Uint8Array.from(atob(landMask),c=>c.charCodeAt(0));
function verifyWorld(rle:unknown,player:number){
 if(!Array.isArray(rle)||rle.length>40000||rle.length%2)throw new ApiError("INVALID_WORLD");
 let at=0,land=0;
 for(let i=0;i<rle.length;i+=2){
  const owner=rle[i],count=rle[i+1];
  if(!Number.isInteger(owner)||!Number.isInteger(count)||count<1||at+count>cellCount)throw new ApiError("INVALID_WORLD");
  for(let j=0;j<count;j++,at++){
   const isLand=(mask[at>>3]>>(at&7))&1;
   if(owner!==(isLand?player:0))throw new ApiError("WORLD_NOT_CONQUERED");
   land+=isLand;
  }
 }
 if(at!==cellCount||land!==landCount)throw new ApiError("INVALID_WORLD");
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 try{
  if(req.method!=="POST")throw new ApiError("METHOD_NOT_ALLOWED",405);
  if(Number(req.headers.get("content-length")||0)>900000)throw new ApiError("REQUEST_TOO_LARGE",413);
  const text=await req.text();if(text.length>900000)throw new ApiError("REQUEST_TOO_LARGE",413);
  let b;try{b=JSON.parse(text);}catch{throw new ApiError("INVALID_JSON");}
  const action=b.action;
  if(action==="health")return reply({ok:true,version:"0.2.0",google:false,rankedMode:"client-simulated"});
  if(action==="register"){
   await limited(req,"register",6,86400);
   const n=username(b.name),pass=password(b.password);
   if(typeof b.device!=="string"||!/^[a-f0-9]{64}$/.test(b.device))throw new ApiError("INVALID_DEVICE");
   if(typeof b.country!=="string"||!/^[A-Z]{2}$/.test(b.country))throw new ApiError("INVALID_COUNTRY");
   const device=await hash(secret+":"+b.device);
   const exists=checked(await admin.from("de_profiles").select("user_id").eq("username_key",n.key).maybeSingle());
   if(exists)throw new ApiError("NAME_TAKEN",409);
   const deviceUsed=checked(await admin.from("de_profiles").select("user_id").eq("device_hash",device).maybeSingle());
   if(deviceUsed)throw new ApiError("DEVICE_REGISTERED",409);
   const email=crypto.randomUUID()+"@accounts.dictatorera.invalid";
   const created=await admin.auth.admin.createUser({email,password:pass,email_confirm:true,user_metadata:{commander:n.display}});
   if(created.error||!created.data.user)throw new ApiError("REGISTRATION_FAILED",503);
   const recovery=randomCode(),id=created.data.user.id;
   const inserted=await admin.from("de_profiles").insert({user_id:id,username:n.display,username_key:n.key,country:b.country,device_hash:device,recovery_hash:await hash(recovery)}).select("*").single();
   if(inserted.error){await admin.auth.admin.deleteUser(id);throw new ApiError("NAME_OR_DEVICE_TAKEN",409);}
   const login=await authClient().auth.signInWithPassword({email,password:pass});
   if(login.error||!login.data.session)throw new ApiError("LOGIN_FAILED",503);
   return reply({profile:safeProfile(inserted.data),session:login.data.session,recovery});
  }
  if(action==="login"){
   await limited(req,"login",40,900);
   const n=username(b.name),pass=typeof b.password==="string"?b.password:"";
   const p=checked(await admin.from("de_profiles").select("*").eq("username_key",n.key).maybeSingle());
   if(!p)throw new ApiError("INVALID_CREDENTIALS",401);
   const u=await admin.auth.admin.getUserById(p.user_id);
   const login=await authClient().auth.signInWithPassword({email:u.data.user?.email||"",password:pass});
   if(login.error||!login.data.session)throw new ApiError("INVALID_CREDENTIALS",401);
   return reply({profile:safeProfile(p),session:login.data.session});
  }
  if(action==="recover"){
   await limited(req,"recover",8,3600);const n=username(b.name),pass=password(b.password);
   if(typeof b.recovery!=="string"||!/^[a-f0-9]{48}$/.test(b.recovery.trim()))throw new ApiError("INVALID_RECOVERY",401);
   const p=checked(await admin.from("de_profiles").select("*").eq("username_key",n.key).maybeSingle());
   if(!p||p.recovery_hash!==await hash(b.recovery.trim()))throw new ApiError("INVALID_RECOVERY",401);
   const updated=await admin.auth.admin.updateUserById(p.user_id,{password:pass});if(updated.error)throw new ApiError("RECOVERY_FAILED",503);
   const recovery=randomCode();checked(await admin.from("de_profiles").update({recovery_hash:await hash(recovery)}).eq("user_id",p.user_id));
   return reply({ok:true,recovery});
  }
  if(action==="refresh"){
   await limited(req,"refresh",120,3600);
   if(typeof b.refresh_token!=="string"||b.refresh_token.length>4096)throw new ApiError("SESSION_EXPIRED",401);
   const r=await authClient().auth.refreshSession({refresh_token:b.refresh_token});
   if(r.error||!r.data.session)throw new ApiError("SESSION_EXPIRED",401);
   return reply({session:r.data.session});
  }
  const {user,profile,token}=await current(req);
  if(action==="me")return reply({profile:safeProfile(profile)});
  if(action==="logout"){
   await admin.auth.admin.signOut(token,"local");return reply({ok:true});
  }
  if(action==="leaderboard"){
   const rows=checked(await admin.from("de_profiles").select("username,country,gold,victories").eq("is_test",false).order("gold",{ascending:false}).order("created_at",{ascending:true}).limit(100));
   return reply({rows,profile:safeProfile(profile)});
  }
  if(action==="start"){
   await limited(req,"start",100,86400);
   if(!Number.isInteger(b.player)||b.player<1||b.player>241||!["modern","iron","steel","equal","fracture","peace"].includes(b.scenario)||![.75,1,1.3].includes(b.difficulty))throw new ApiError("INVALID_CAMPAIGN");
   const seed=crypto.getRandomValues(new Int32Array(1))[0];
   const c=checked(await admin.rpc("de_start_campaign",{p_user:user.id,p_player:b.player,p_scenario:b.scenario,p_difficulty:b.difficulty,p_seed:seed}));
   return reply({campaign:c});
  }
  if(action==="checkpoint"){
   if(!Number.isInteger(b.month)||!Number.isInteger(b.land))throw new ApiError("INVALID_PROGRESS");
   const c=checked(await admin.rpc("de_checkpoint",{p_user:user.id,p_id:b.id,p_month:b.month,p_land:b.land}));
   return reply({campaign:c});
  }
  if(action==="finish"){
   await limited(req,"finish",30,3600);
   const c=checked(await admin.from("de_campaigns").select("*").eq("id",b.id).eq("user_id",user.id).maybeSingle());
   if(!c)throw new ApiError("CAMPAIGN_NOT_FOUND",404);
   verifyWorld(b.world,c.player);
   const p=checked(await admin.rpc("de_complete_campaign",{p_user:user.id,p_id:c.id}));
   return reply({profile:safeProfile(p),awarded:50});
  }
  throw new ApiError("UNKNOWN_ACTION",404);
 }catch(e){
  if(e instanceof ApiError)return reply({error:e.code},e.status);
  return reply({error:"SERVICE_UNAVAILABLE"},503);
 }
});
