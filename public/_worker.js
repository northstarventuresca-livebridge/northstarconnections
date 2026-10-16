// North Star Connections • Cloudflare Pages advanced mode
const reply=(body,status=200,h={})=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...h}});
const err=(message,status=400)=>reply({error:message},status);
const id=()=>crypto.randomUUID();
const hex=a=>Array.from(a).map(x=>x.toString(16).padStart(2,"0")).join("");
const bytes=s=>Uint8Array.from((s||"").match(/.{1,2}/g)||[],c=>parseInt(c,16));
const hash=async s=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))));
async function passHash(p,salt){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(p),"PBKDF2",false,["deriveBits"]);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt:bytes(salt),iterations:100000,hash:"SHA-256"},key,256)));}
const clean=(s,n=200)=>String(s??"").trim().slice(0,n).replace(/[<>]/g,"");
const https=s=>{try{const u=new URL(s);return u.protocol==="https:"?u.toString().slice(0,500):"";}catch{return "";}}
const input=async r=>{if(Number(r.headers.get("content-length"))>45000)throw Error("Submission is too large.");const s=await r.text();if(s.length>45000)throw Error("Submission is too large.");return JSON.parse(s||"{}");};
const ck="__Host-nsc_session";
const tokenFrom=r=>(r.headers.get("cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(ck+"="))?.slice(ck.length+1)||"";
async function me(r,e){const token=tokenFrom(r);if(!token)return null;return await e.DB.prepare("SELECT u.id,u.email,u.full_name,u.role,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(await hash(token),Date.now()).first();}
const required=u=>{if(!u||u.status!=="active")throw Object.assign(Error("Please sign in first."),{status:401});};
const admin=u=>{required(u);if(u.role!=="admin")throw Object.assign(Error("Administrator only."),{status:403});};
async function limit(e,k,max=12){const key=await hash(k),window=Math.floor(Date.now()/900000),row=await e.DB.prepare("SELECT attempts FROM auth_attempts WHERE identifier=? AND window_at=?").bind(key,window).first();if(row?.attempts>=max)throw Object.assign(Error("Too many requests. Try again in 15 minutes."),{status:429});await e.DB.prepare("INSERT INTO auth_attempts(identifier,window_at,attempts) VALUES(?,?,1) ON CONFLICT(identifier,window_at) DO UPDATE SET attempts=attempts+1").bind(key,window).run();}
function tokens(t){return new Set(String(t||"").toLowerCase().replace(/web\s*site/g,"website").replace(/web\s*development/g,"website").replace(/lawn\s*care/g,"lawn").replace(/stump\s*removal/g,"stump").replace(/graphic\s*design/g,"design").split(/[^a-z0-9]+/).filter(w=>w.length>2&&!["the","and","for","who","that","with","someone","services","service","looking","needs","need","offer","offering","work","company","business","your","their","able","help","our","all"].includes(w)));}
function similarity(a,b){const x=tokens(a),y=tokens(b);if(!x.size||!y.size)return 0;let n=0;for(const v of x)if(y.has(v))n++;return n/Math.min(x.size,y.size);}
function score(a,b){if(!a.offers||!a.needs||!b.offers||!b.needs)return 0;const x=similarity(a.needs,b.offers),y=similarity(b.needs,a.offers);return x&&y?Math.round(Math.sqrt(x*y)*100):0;}
function gallery(v){try{const x=JSON.parse(v||"[]");return Array.isArray(x)?x:[]}catch{return [];}}
function redact(s,p){let value=String(s||"");for(const t of [p.business_name,p.full_name].filter(x=>x&&x.length>3))value=value.split(t).join("a local professional");return value;}
function listing(p,auth){let title=clean((p.offers||"").split(/[\n,;]/)[0],45)||"Local service";const x={id:p.connection_id||p.user_id,owner_id:p.user_id,alias:title+" partner",headline:redact(p.headline,p),region:p.region,years:p.years,about:redact(p.about,p),offers:redact(p.offers,p),needs:redact(p.needs,p),portfolio:gallery(p.portfolio),updated_at:p.updated_at};if(auth)Object.assign(x,{business_name:p.business_name,full_name:p.full_name,email:p.email,phone:p.phone,website:p.website});return x;}
async function send(e,to,subject,message){if(!e.SMTP2GO_API_KEY)return false;try{const r=await fetch("https://api.smtp2go.com/v3/email/send",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({api_key:e.SMTP2GO_API_KEY,sender:e.MAIL_FROM||"North Star Connections <support@northstarventures.ca>",to:[to],subject,text_body:message})});return r.ok;}catch{return false;}}

const unix=()=>Math.floor(Date.now()/1000);
async function tier(e,u){
 if(!u)return {unlimited:false,active:false,plan:"free"};
 const m=await e.DB.prepare("SELECT status,paid_until,customer_ref FROM memberships WHERE user_id=?").bind(u.id).first();
 const active=!!m&&["active","trialing"].includes(m.status)&&m.paid_until>unix();
 return {unlimited:u.role==="admin"||active,active,plan:active?"unlimited":"free",customer:m?.customer_ref||null,paid_until:m?.paid_until||0};
}
async function allPublic(e){
 const now=unix();
 const [bases,extras]=await Promise.all([
   e.DB.prepare("SELECT p.*,u.full_name,u.email,u.role FROM profiles p JOIN users u ON p.user_id=u.id WHERE p.published=1 AND u.status='active' ORDER BY p.updated_at DESC LIMIT 450").all(),
   e.DB.prepare("SELECT c.id AS connection_id,c.user_id,c.headline,c.region,c.about,c.offers,c.needs,c.portfolio,c.published,c.updated_at,p.business_name,p.years,p.phone,p.website,u.full_name,u.email,u.role FROM connection_points c JOIN profiles p ON p.user_id=c.user_id JOIN users u ON u.id=c.user_id LEFT JOIN memberships m ON m.user_id=c.user_id WHERE c.published=1 AND u.status='active' AND (u.role='admin' OR (m.status IN ('active','trialing') AND m.paid_until>?)) ORDER BY c.updated_at DESC LIMIT 450").bind(now).all()
 ]);
 return [...(bases.results||[]),...(extras.results||[])].sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));
}
function connectionInput(b){
 const x={headline:clean(b.headline,140),region:clean(b.region,90),about:clean(b.about,2500),offers:clean(b.offers,1200),needs:clean(b.needs,1200),published:b.published?1:0};
 const portfolio=Array.isArray(b.portfolio)?b.portfolio.slice(0,10).map(t=>({url:https(t.url)||(/^\/media\/p\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp|gif)$/.test(t.url||"")?t.url:""),label:clean(t.label,100)})).filter(x=>x.url):[];
 if(x.published&&(!x.headline||!x.region||!x.offers||!x.needs))throw Object.assign(Error("Complete the headline, location, offered services and requested services before publishing."),{status:400});
 return {...x,portfolio:JSON.stringify(portfolio)};
}
async function stripeRequest(e,path,params){
 if(!e.STRIPE_SECRET_KEY)return null;
 const res=await fetch("https://api.stripe.com/v1/"+path,{method:"POST",headers:{"authorization":"Bearer "+e.STRIPE_SECRET_KEY,"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams(params)});
 const data=await res.json();
 if(!res.ok)throw Object.assign(Error(data.error?.message||"Payment service is temporarily unavailable."),{status:502});
 return data;
}
async function stripeRetrieve(e,path){
 const res=await fetch("https://api.stripe.com/v1/"+path,{headers:{"authorization":"Bearer "+e.STRIPE_SECRET_KEY}});
 const data=await res.json();if(!res.ok)throw Error("Unable to confirm subscription.");return data;
}
async function saveStripeSubscription(e,sub,ownerHint){
 const customer=typeof sub.customer==="string"?sub.customer:sub.customer?.id;
 const userId=sub.metadata?.user_id||ownerHint;
 const found=userId?await e.DB.prepare("SELECT id FROM users WHERE id=?").bind(userId).first():null;
 const known=found?found.id:(await e.DB.prepare("SELECT user_id FROM memberships WHERE subscription_ref=? OR customer_ref=?").bind(sub.id,customer||"").first())?.user_id;
 if(!known)return;
 const expiry=Number(sub.current_period_end||sub.items?.data?.[0]?.current_period_end||0);
 const status=clean(sub.status,30);
 await e.DB.prepare("INSERT INTO memberships(user_id,customer_ref,subscription_ref,status,paid_until) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET customer_ref=excluded.customer_ref,subscription_ref=excluded.subscription_ref,status=excluded.status,paid_until=excluded.paid_until,updated_at=CURRENT_TIMESTAMP").bind(known,customer||null,sub.id,status,expiry).run();
}
async function stripeWebhook(r,e){
 if(!e.STRIPE_WEBHOOK_SECRET)return err("Webhook not configured.",503);
 const body=await r.text(),header=r.headers.get("stripe-signature")||"",time=header.match(/(?:^|,)t=(\d+)/)?.[1];
 const signatures=[...header.matchAll(/(?:^|,)v1=([a-f0-9]{64})/g)].map(x=>x[1]);
 if(!time||!signatures.length||Math.abs(unix()-Number(time))>300)return err("Invalid signature.",400);
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(e.STRIPE_WEBHOOK_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signed=hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(time+"."+body))));
 if(!signatures.some(v=>v===signed))return err("Invalid signature.",400);
 const event=JSON.parse(body),object=event.data?.object;
 if(event.type?.startsWith("customer.subscription.")&&object?.id)await saveStripeSubscription(e,object);
 if(event.type==="checkout.session.completed"&&object?.mode==="subscription"&&object.subscription){
   const sub=await stripeRetrieve(e,"subscriptions/"+encodeURIComponent(object.subscription));
   await saveStripeSubscription(e,sub,object.client_reference_id||object.metadata?.user_id);
 }
 return reply({received:true});
}

async function matchNew(e,p){
 if(!p.published||!p.offers||!p.needs)return;
 const source={...p,connection_id:p.connection_id||p.id||p.user_id};
 const everyone=await allPublic(e);
 const owner=await e.DB.prepare("SELECT email FROM users WHERE id=?").bind(p.user_id).first();
 for(const other of everyone){
   if(other.user_id===p.user_id||score(p,other)<22)continue;
   const [a,b]=[source.connection_id,other.connection_id||other.user_id].sort();
   const write=await e.DB.prepare("INSERT OR IGNORE INTO connection_match_alerts(connection_a,connection_b) VALUES(?,?)").bind(a,b).run();
   if(!(write.meta?.changes>0))continue;
   for(const [who,ref] of [[p.user_id,other.connection_id||other.user_id],[other.user_id,source.connection_id]])
     await e.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body,related_id) VALUES(?,?,'match',?,?,?)").bind(id(),who,"A two-way service match","Another member offers what you need, and needs what you offer.",ref).run();
   await Promise.all([send(e,other.email,"New service match","Sign in to North Star Connections to view your match."),send(e,owner?.email,"New service match","Sign in to North Star Connections to view your match.")]);
 }
}
async function api(r,e,c,u){const p=u.pathname,m=r.method,user=await me(r,e);if(m!=="GET"&&m!=="HEAD"&&r.headers.get("origin")&&r.headers.get("origin")!==u.origin)return err("Invalid origin.",403);
if(m==="GET"&&p==="/api/health")return reply({ok:true,database:!!e.DB,media:!!e.MEDIA,email:!!e.SMTP2GO_API_KEY,billing:!!(e.STRIPE_SECRET_KEY&&e.STRIPE_WEBHOOK_SECRET)});
if(m==="POST"&&p==="/api/billing/webhook")return stripeWebhook(r,e);
if(m==="GET"&&p==="/api/me"){if(!user)return reply({user:null});const prof=await e.DB.prepare("SELECT * FROM profiles WHERE user_id=?").bind(user.id).first();const count=await e.DB.prepare("SELECT count(*) c FROM notifications WHERE user_id=? AND read_at IS NULL").bind(user.id).first();const extras=await e.DB.prepare("SELECT * FROM connection_points WHERE user_id=? ORDER BY created_at ASC LIMIT 200").bind(user.id).all();const plan=await tier(e,user);return reply({user,profile:{...prof,portfolio:gallery(prof?.portfolio)},connections:(extras.results||[]).map(x=>({...x,portfolio:gallery(x.portfolio)})),membership:{unlimited:plan.unlimited,plan:plan.plan,paid_until:plan.paid_until,checkout_available:!!(e.STRIPE_SECRET_KEY&&e.STRIPE_WEBHOOK_SECRET)},unread:count?.c||0});}
if(m==="POST"&&p==="/api/auth/register"){const b=await input(r),email=clean(b.email,220).toLowerCase(),name=clean(b.name,100),password=String(b.password||"");if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name||password.length<10||password.length>128)return err("Enter a name, valid email and a password of at least 10 characters.");await limit(e,"register:"+r.headers.get("cf-connecting-ip"),10);let role="member";if(email==="northstarventures.ca@gmail.com"){if(!e.ADMIN_SETUP_HASH||(await hash(String(b.adminCode||"")))!==e.ADMIN_SETUP_HASH)return err("Administrator setup code required for this email.",403);role="admin";}const exists=await e.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();if(exists)return err("This email is already registered.",409);const salt=hex(crypto.getRandomValues(new Uint8Array(16))),password_hash=await passHash(password,salt),userId=id();await e.DB.batch([e.DB.prepare("INSERT INTO users(id,email,password_hash,salt,full_name,role) VALUES(?,?,?,?,?,?)").bind(userId,email,password_hash,salt,name,role),e.DB.prepare("INSERT INTO profiles(user_id) VALUES(?)").bind(userId)]);const token=hex(crypto.getRandomValues(new Uint8Array(32)));await e.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await hash(token),userId,Date.now()+604800000).run();return reply({ok:true},201,{"set-cookie":ck+"="+token+"; Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=Lax"});}
if(m==="POST"&&p==="/api/auth/login"){const b=await input(r),email=clean(b.email,220).toLowerCase();await limit(e,"login:"+r.headers.get("cf-connecting-ip")+":"+email,10);const row=await e.DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();const tested=await passHash(String(b.password||""),row?.salt||hex(new Uint8Array(16)));if(!row||tested!==row.password_hash)return err("Email or password is incorrect.",401);if(row.status!=="active")return err("Account is suspended.",403);const token=hex(crypto.getRandomValues(new Uint8Array(32)));await e.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await hash(token),row.id,Date.now()+604800000).run();return reply({ok:true},200,{"set-cookie":ck+"="+token+"; Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=Lax"});}
if(m==="POST"&&p==="/api/auth/logout"){const t=tokenFrom(r);if(t)await e.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await hash(t)).run();return reply({ok:true},200,{"set-cookie":ck+"=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax"});}
if(m==="POST"&&p==="/api/auth/password"){required(user);const b=await input(r);if(String(b.password||"").length<10)return err("New password needs 10 characters.");const row=await e.DB.prepare("SELECT salt,password_hash FROM users WHERE id=?").bind(user.id).first();if(await passHash(String(b.old||""),row.salt)!==row.password_hash)return err("Current password is incorrect.",401);const salt=hex(crypto.getRandomValues(new Uint8Array(16)));await e.DB.prepare("UPDATE users SET salt=?,password_hash=? WHERE id=?").bind(salt,await passHash(b.password,salt),user.id).run();await e.DB.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash!=?").bind(user.id,await hash(tokenFrom(r))).run();return reply({ok:true});}
if(m==="GET"&&p==="/api/listings"){
 const q=clean(u.searchParams.get("q"),100).toLowerCase();let result=(await allPublic(e)).map(x=>listing(x,!!user&&user.status==="active"));
 if(q)result=result.filter(x=>(x.offers+" "+x.needs+" "+x.headline+" "+x.region).toLowerCase().includes(q));
 return reply({listings:result,total:result.length});
}
if(m==="GET"&&p.startsWith("/api/listings/")){
 const key=p.split("/")[3],row=(await allPublic(e)).find(x=>(x.connection_id||x.user_id)===key);
 if(!row)return err("Listing not found.",404);
 return reply({profile:listing(row,!!user&&user.status==="active")});
}
if(m==="PUT"&&p==="/api/profile"){required(user);const b=await input(r),x={business_name:clean(b.business_name,100),headline:clean(b.headline,140),region:clean(b.region,90),years:clean(b.years,30),about:clean(b.about,2500),offers:clean(b.offers,1200),needs:clean(b.needs,1200),website:https(b.website),phone:clean(b.phone,50)};const images=Array.isArray(b.portfolio)?b.portfolio.slice(0,10).map(t=>({url:https(t.url)||(/^\/media\/p\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp|gif)$/.test(t.url||"")?t.url:""),label:clean(t.label,100)})).filter(t=>t.url):[];const published=b.published?1:0;if(published&&(!x.headline||!x.region||!x.offers||!x.needs))return err("Add a headline, location, services offered and services wanted first.");await e.DB.prepare("UPDATE profiles SET business_name=?,headline=?,region=?,years=?,about=?,offers=?,needs=?,portfolio=?,website=?,phone=?,published=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(x.business_name,x.headline,x.region,x.years,x.about,x.offers,x.needs,JSON.stringify(images),x.website,x.phone,published,user.id).run();const updated=await e.DB.prepare("SELECT * FROM profiles WHERE user_id=?").bind(user.id).first();if(published)c.waitUntil(matchNew(e,updated));return reply({ok:true});}
if(m==="POST"&&p==="/api/connections"){
 required(user);const plan=await tier(e,user);if(!plan.unlimited)return err("Your first connection is free forever. The Unlimited plan lets you publish separate specialized connection points for $20 CAD per year.",403);
 await limit(e,"connections:"+user.id,50);
 const x=connectionInput(await input(r)),newId=id();
 await e.DB.prepare("INSERT INTO connection_points(id,user_id,headline,region,about,offers,needs,portfolio,published) VALUES(?,?,?,?,?,?,?,?,?)").bind(newId,user.id,x.headline,x.region,x.about,x.offers,x.needs,x.portfolio,x.published).run();
 if(x.published)c.waitUntil(matchNew(e,{...x,connection_id:newId,user_id:user.id}));
 return reply({ok:true,id:newId},201);
}
if((m==="PUT"||m==="DELETE")&&p.startsWith("/api/connections/")){
 required(user);const key=p.split("/")[3],old=await e.DB.prepare("SELECT * FROM connection_points WHERE id=? AND user_id=?").bind(key,user.id).first();
 if(!old)return err("Connection point not found.",404);
 if(m==="DELETE"){await e.DB.prepare("DELETE FROM connection_points WHERE id=? AND user_id=?").bind(key,user.id).run();return reply({ok:true});}
 const plan=await tier(e,user),x=connectionInput(await input(r));
 if(x.published&&!plan.unlimited)return err("Unlimited membership is required to publish additional connection points.",403);
 await e.DB.prepare("UPDATE connection_points SET headline=?,region=?,about=?,offers=?,needs=?,portfolio=?,published=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(x.headline,x.region,x.about,x.offers,x.needs,x.portfolio,x.published,key,user.id).run();
 if(x.published)c.waitUntil(matchNew(e,{...x,connection_id:key,user_id:user.id}));
 return reply({ok:true});
}
if(m==="POST"&&p==="/api/billing/checkout"){
 required(user);const plan=await tier(e,user);
 if(plan.active)return err("Your Unlimited membership is already active.");
 if(!e.STRIPE_SECRET_KEY||!e.STRIPE_WEBHOOK_SECRET)return err("Online membership checkout is being configured. Contact support@northstarventures.ca for early access.",503);
 await limit(e,"checkout:"+user.id,12);
 const values={"mode":"subscription","client_reference_id":user.id,"metadata[user_id]":user.id,"subscription_data[metadata][user_id]":user.id,"line_items[0][price]":e.STRIPE_UNLIMITED_PRICE_ID||"price_1URIjWFCz4V2Eq00lhkyDON1","line_items[0][quantity]":"1","success_url":u.origin+"/?membership=success","cancel_url":u.origin+"/?membership=cancel"};
 if(plan.customer)values.customer=plan.customer;else values.customer_email=user.email;
 const checkout=await stripeRequest(e,"checkout/sessions",values);
 const checkoutUrl=new URL(checkout.url||"");
 if(checkoutUrl.hostname!=="checkout.stripe.com"||checkoutUrl.protocol!=="https:")return err("Unable to open secure checkout.",502);
 return reply({url:checkoutUrl.toString()});
}
if(m==="POST"&&p==="/api/billing/portal"){
 required(user);const plan=await tier(e,user);
 if(!plan.customer)return err("No billed membership found.");
 if(!e.STRIPE_SECRET_KEY)return err("Billing portal unavailable.",503);
 const portal=await stripeRequest(e,"billing_portal/sessions",{customer:plan.customer,return_url:u.origin+"/"});
 return reply({url:portal.url});
}
if(m==="POST"&&p==="/api/upload"){required(user);if(!e.MEDIA)return err("Uploads unavailable.",503);const type=(r.headers.get("content-type")||"").split(";")[0].toLowerCase(),ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"}[type];if(!ext)return err("Choose a JPG, PNG, WebP or GIF.");const buf=await r.arrayBuffer();if(buf.byteLength>4*1024*1024||buf.byteLength<20)return err("Images must be under 4 MB.");const a=new Uint8Array(buf),ok=ext==="jpg"?a[0]===255&&a[1]===216:ext==="png"?a[0]===137&&a[1]===80:ext==="webp"?String.fromCharCode(...a.slice(0,4))==="RIFF":String.fromCharCode(...a.slice(0,3))==="GIF";if(!ok)return err("Image format mismatch.");const key="p/"+user.id+"/"+id()+"."+ext;await e.MEDIA.put(key,buf,{httpMetadata:{contentType:type}});return reply({url:"/media/"+key},201);}
if(m==="GET"&&p==="/api/matches"){
 required(user);
 const people=await allPublic(e),mine=people.filter(x=>x.user_id===user.id),others=people.filter(x=>x.user_id!==user.id);
 const best=new Map();
 for(const own of mine)for(const other of others){const percent=score(own,other);if(percent<22)continue;const key=other.connection_id||other.user_id;const old=best.get(key);if(!old||percent>old.score)best.set(key,{score:percent,profile:listing(other,true),my_connection:own.headline});}
 return reply({matches:[...best.values()].sort((a,b)=>b.score-a.score).slice(0,80)});
}
if(m==="GET"&&p==="/api/notifications"){required(user);const x=await e.DB.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 80").bind(user.id).all();return reply({notifications:x.results||[]});}
if(m==="POST"&&p==="/api/notifications/read"){required(user);await e.DB.prepare("UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(user.id).run();return reply({ok:true});}
if(m==="GET"&&p==="/api/proposals"){required(user);const x=await e.DB.prepare("SELECT q.*,a.full_name sender_name,b.full_name receiver_name FROM proposals q JOIN users a ON a.id=q.sender_id JOIN users b ON b.id=q.receiver_id WHERE sender_id=? OR receiver_id=? ORDER BY created_at DESC LIMIT 120").bind(user.id,user.id).all();return reply({proposals:x.results||[]});}
if(m==="POST"&&p==="/api/proposals"){required(user);const b=await input(r),to=clean(b.receiver_id,60),message=clean(b.message,2000);if(to===user.id)return err("Cannot propose to yourself.");if(message.length<15)return err("Please describe the exchange in a little more detail.");const other=await e.DB.prepare("SELECT u.email,u.status FROM users u WHERE u.id=?").bind(to).first();if(!other||other.status!=="active"||!(await allPublic(e)).some(x=>x.user_id===to))return err("Member unavailable.",404);await limit(e,"proposal:"+user.id,30);const proposal=id();await e.DB.batch([e.DB.prepare("INSERT INTO proposals(id,sender_id,receiver_id,message) VALUES(?,?,?,?)").bind(proposal,user.id,to,message),e.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body,related_id) VALUES(?,?,'proposal',?,?,?)").bind(id(),to,"New exchange proposal","A member has offered a trade.",proposal)]);c.waitUntil(send(e,other.email,"New service exchange proposal","You have a new proposal on North Star Connections. Sign in to view it."));return reply({ok:true},201);}
if(m==="PATCH"&&p.startsWith("/api/proposals/")){required(user);const b=await input(r),status=clean(b.status,20),qid=p.split("/")[3];if(!["pending","accepted","declined"].includes(status))return err("Invalid status.");const q=await e.DB.prepare("SELECT * FROM proposals WHERE id=? AND receiver_id=?").bind(qid,user.id).first();if(!q)return err("Proposal not found.",404);await e.DB.batch([e.DB.prepare("UPDATE proposals SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,qid),e.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body,related_id) VALUES(?,?,'proposal',?,?,?)").bind(id(),q.sender_id,"Proposal "+status,"A member has "+status+" your exchange proposal.",qid)]);return reply({ok:true});}
if(p.startsWith("/api/admin/")){admin(user);
if(m==="GET"&&p==="/api/admin/overview"){const [a,b,d,f,x]=await Promise.all([e.DB.prepare("SELECT count(*) c FROM users").first(),e.DB.prepare("SELECT count(*) c FROM profiles WHERE published=1").first(),e.DB.prepare("SELECT count(*) c FROM proposals").first(),e.DB.prepare("SELECT count(*) c FROM match_alerts").first(),e.DB.prepare("SELECT u.id,u.email,u.full_name,u.role,u.status,u.created_at,p.business_name,p.headline,p.offers,p.needs,p.published,p.region FROM users u LEFT JOIN profiles p ON p.user_id=u.id ORDER BY u.created_at DESC LIMIT 500").all()]);return reply({stats:{members:a.c,live:(await allPublic(e)).length,proposals:d.c,matches:f.c},members:x.results||[]});}
if(m==="GET"&&p==="/api/admin/connections"){const x=await e.DB.prepare("SELECT c.*,u.email,u.full_name FROM connection_points c JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC LIMIT 500").all();return reply({connections:x.results||[]});}
if(m==="PATCH"&&p.startsWith("/api/admin/connections/")){const key=p.split("/")[4],b=await input(r);if(typeof b.published!=="boolean")return err("Publication flag required.");const found=await e.DB.prepare("SELECT id FROM connection_points WHERE id=?").bind(key).first();if(!found)return err("Not found.",404);await e.DB.prepare("UPDATE connection_points SET published=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(b.published?1:0,key).run();return reply({ok:true});}
if(m==="GET"&&p==="/api/admin/proposals"){const x=await e.DB.prepare("SELECT q.*,a.email sender_email,b.email receiver_email FROM proposals q JOIN users a ON a.id=q.sender_id JOIN users b ON b.id=q.receiver_id ORDER BY q.created_at DESC LIMIT 500").all();return reply({proposals:x.results||[]});}
if(m==="PATCH"&&p.startsWith("/api/admin/members/")){const uid=p.split("/")[4],b=await input(r);if(uid===user.id)return err("Cannot change your own administrator permissions.",403);if(!(await e.DB.prepare("SELECT id FROM users WHERE id=?").bind(uid).first()))return err("Not found.",404);if(["admin","member"].includes(b.role))await e.DB.prepare("UPDATE users SET role=? WHERE id=?").bind(b.role,uid).run();if(["active","suspended"].includes(b.status)){await e.DB.prepare("UPDATE users SET status=? WHERE id=?").bind(b.status,uid).run();if(b.status==="suspended")await e.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(uid).run();}if(typeof b.published==="boolean")await e.DB.prepare("UPDATE profiles SET published=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(b.published?1:0,uid).run();return reply({ok:true});}}
return err("Not found.",404);}
export default {async fetch(request,env,ctx){const url=new URL(request.url);try{if(url.pathname.startsWith("/api/"))return env.DB?await api(request,env,ctx,url):err("Database not configured.",503);if(url.pathname.startsWith("/media/")){if(!env.MEDIA)return err("Images unavailable.",503);const k=url.pathname.slice(7);if(!/^p\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp|gif)$/.test(k))return err("Not found.",404);const obj=await env.MEDIA.get(k);if(!obj)return err("Not found.",404);return new Response(obj.body,{headers:{"content-type":obj.httpMetadata?.contentType||"image/jpeg","cache-control":"public,max-age=604800","x-content-type-options":"nosniff"}});}return env.ASSETS.fetch(request);}catch(e){return err(e?.message||"Unexpected error.",e?.status||500);}}};
