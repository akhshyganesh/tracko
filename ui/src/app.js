import * as bridge from './bridge.js';
import { runTurn, describeError } from './agent.js';
import { TOOLS } from './tools.js';
import { codex } from './codex.js';
import { PROVIDERS, provider } from './providers.js';

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,10);
const pl=n=>n===1?'':'s';
const DAY=864e5;
const sod=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const at=(d,h,m=0)=>{const x=new Date(d);x.setHours(h,m,0,0);return x};
const dayKey=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')};
const keyDate=k=>{const[y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)};
const WD=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const fmtTime=d=>new Date(d).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const fmtDate=(d,o={weekday:'short',month:'short',day:'numeric'})=>new Date(d).toLocaleDateString([],o);
const daysFromToday=ts=>Math.round((sod(ts)-sod(Date.now()))/DAY);
function fmtWhen(ts){const d=daysFromToday(ts);if(d===0)return fmtTime(ts);if(d===-1)return 'Yesterday';if(d<0&&d>-7)return WD[new Date(ts).getDay()].slice(0,3);return fmtDate(ts,{month:'short',day:'numeric'})}
function fmtRemind(ts){const d=daysFromToday(ts);const day=d===0?'Today':d===1?'Tomorrow':d===-1?'Yesterday':(d>1&&d<7)?WD[new Date(ts).getDay()].slice(0,3):fmtDate(ts,{month:'short',day:'numeric'});return day+' '+fmtTime(ts)}
function dayLabel(ts){const d=daysFromToday(ts);return d===0?'Today':d===-1?'Yesterday':fmtDate(ts)}
function lastWd(n){let d=addDays(sod(Date.now()),-1);while(d.getDay()!==n)d=addDays(d,-1);return d}
function nextWd(n){let d=addDays(sod(Date.now()),1);while(d.getDay()!==n)d=addDays(d,1);return d}
function weekStart(d){const x=sod(d);return addDays(x,-((x.getDay()+6)%7))}
const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

const P={
 chat:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
 cal:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 clip:'<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
 up:'<path d="M12 19V5M5 12l7-7 7 7"/>',
 bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
 check:'<path d="M20 6 9 17l-5-5"/>',
 x:'<path d="M18 6 6 18M6 6l12 12"/>',
 moon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
 reset:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
 trash:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
 chev:'<path d="m9 18 6-6-6-6"/>',
 chevd:'<path d="m6 9 6 6 6-6"/>',
 folder:'<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" fill="currentColor" fill-opacity=".16"/>',
 tray:'<path d="M3 13h5l1.5 2.5h5L16 13h5"/><path d="M5.6 5h12.8L21 13v5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-5z" fill="currentColor" fill-opacity=".12"/>',
 folderplus:'<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><path d="M12 10.5v6M9 13.5h6"/>',
 download:'<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 19h14"/>',
 focus:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>',
 blank:'',
 pleft:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
 pright:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
 width:'<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
 dots:'<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
 archive:'<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
 pin:'<path d="M12 17v5M9 3h6l-1 6 4 3v2H6v-2l4-3z"/>',
 edit:'<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
 chart:'<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
 warn:'<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
 gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
};
// A bucket's mark: its color on a folder (Inbox gets a tray).
const bmark=(b,extra='')=>`<span class="bmark" style="color:${b?b.color:'var(--faint)'}${extra}">${ico(b&&b.id==='inbox'?'tray':'folder')}</span>`;
const ico=n=>`<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`;

/* ---------- data ---------- */
const BUCKETS0=[
 {id:'inbox',name:'Inbox',color:'#8b8e94',about:'Chats tracko could not place yet. Pick a bucket in the chat, or move it from the header.',kw:[]},
 {id:'work',name:'Work',color:'#60a5fa',about:'Day job: tickets, code reviews, deploys and the weekly timesheet.',kw:['app','ticket','timesheet','pr','deploy','deployed','staging','api','bug','signup','renewal','renewals','jordan','riley','taylor','standup','sprint','release','review']},
 {id:'side',name:'Side project',color:'#fb923c',about:'A small app I build on weekends.',kw:['side project','prototype','sdk','classifier','prompt','ui','idea']},
 {id:'personal',name:'Personal',color:'#f472b6',about:'Life admin, health and family.',kw:['gym','groceries','mom','dad','dentist','doctor','rent','bill','electricity','passport','router','wifi','home','birthday','bank','walk']},
 {id:'learning',name:'Learning',color:'#facc15',about:'Books, talks and things I am practising.',kw:['read','book','course','learn','talk','chapter','ddia','article','video','typescript','practice']}
];
const NEWC=['#22d3ee','#fb7185','#a3e635','#f97316','#94a3b8','#4ade80'];
const SWATCH=['#60a5fa','#22d3ee','#2dd4bf','#4ade80','#a3e635','#facc15','#fb923c','#f87171','#f472b6','#94a3b8'];
const MODELS=[['claude-opus-5-5','Opus 5.5','best answers, slower'],['claude-sonnet-5-5','Sonnet 5.5','good balance'],['claude-haiku-5-5','Haiku 5.5','fastest and cheapest']];
const DEFAULTS={model:'claude-opus-5-5',sorting:'balanced',autoMemory:true,popups:true,recap:true,remindTime:'09:00',eodTime:'17:00',about:'',instructions:'',chatWidth:'wide',accent:null,budget:0,budgetWarned:'',provider:null,models:{},efforts:{},paths:{}};
const CLAUDE_EFFORTS=['low','medium','high','xhigh','max'];
// $ per million tokens: input, output, cache read. Cache writes bill at 1.25x input.
const PRICE={'claude-opus-5-5':[4,20,.2],'claude-sonnet-5-5':[2,10,.2],'claude-haiku-5-5':[.1,.5,.01]};
const ACCENTS=[['#8794a8','Slate'],['#2dd4bf','Teal'],['#60a5fa','Blue'],['#4ade80','Green'],['#facc15','Yellow'],['#fb923c','Orange'],['#fb7185','Rose'],['#f472b6','Pink']];
const ACCENT0='#8794a8';
// The app mark (Stack): a dark tile with three trays. The trays follow your accent color.
const MARK=`<svg viewBox="100 100 824 824" aria-hidden="true"><rect x="100" y="100" width="824" height="824" rx="186" fill="#1f2228"/><rect x="316" y="268" width="392" height="120" rx="40" style="fill:var(--accent-deep)"/><rect x="270" y="360" width="484" height="140" rx="46" style="fill:var(--accent)"/><rect x="224" y="472" width="576" height="284" rx="64" fill="#dde2ea"/><path d="M408 618l72 72 140-140" fill="none" stroke="#1b1e24" stroke-width="60" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const PROMPTS0=[
 {name:'sync',text:"Sync me up on today: what's due or overdue, what's on today's list, what I've done so far, and what I should do next."},
 {name:'standup',text:"Write my standup: what I finished since my last workday, what's still pending from before (overdue first), and anything that looks stuck. Short bullets."},
 {name:'recap',text:"How am I doing? Recap this week compared with last week: what got done, what's still open, what's slipping, and which bucket took most of my time. If I name a bucket, recap just that one."}
];
const BINSTR={work:'Keep ticket numbers in the text. For timesheets, group the week by ticket.',side:'Treat ideas as notes unless I say I will do it.'};
const MEMRE=/^\s*(i prefer|i like|i love|i hate|i don'?t like|i usually|i always|i never|i work|i'm a|i am a|my (manager|boss|team|lead|reviewer|name|role|job)\b|call me|from now on|going forward)/i;
function withDefaults(s){
 s.settings={...DEFAULTS,...(s.settings||{})};
 const st=s.settings;st.models={...(st.models||{})};st.efforts={...(st.efforts||{})};st.paths={...(st.paths||{})};
 // Older saves kept one Claude model plus separate Codex fields.
 if(st.provider==='claude')st.provider='claude-api';
 if(st.accent==='#94a3b8')st.accent=null; // old slate default, now softer
 if(st.model&&!st.models['claude-api'])st.models['claude-api']=st.model;
 if(st.model&&!st.models['claude-code'])st.models['claude-code']=st.model;
 if(st.effort&&!st.efforts['claude-api'])st.efforts['claude-api']=st.effort;
 if(st.codexModel&&!st.models.codex)st.models.codex=st.codexModel;
 if(st.codexEffort&&!st.efforts.codex)st.efforts.codex=st.codexEffort;
 if(st.codexPath&&!st.paths.codex)st.paths.codex=st.codexPath;
 if(!s.memories)s.memories=[];
 if(!s.usage)s.usage=[];
 if(!s.prompts)s.prompts=PROMPTS0.map(p=>({id:uid(),...p}));
 const OLD={standup:['Summarize what I did yesterday across all buckets, for standup.'],timesheet:['Recap last week for my timesheet, grouped by day.'],open:["What's still open across all my buckets?"],friday:['What did I do last Friday?']};
 if(!s.promptsV2){
  s.prompts=s.prompts.filter(p=>!(OLD[p.name]||[]).includes(p.text));
  for(const d of [...PROMPTS0].reverse())if(!s.prompts.some(p=>p.name===d.name))s.prompts.unshift({id:uid(),...d});
  s.promptsV2=true;
 }
 s.buckets.forEach(b=>{if(b.instructions==null)b.instructions=BINSTR[b.id]||'';if(!b.kw)b.kw=[]});
 return s;
}
const hm=s=>{const[h,m]=String(s||'09:00').split(':').map(Number);return[h||0,m||0]};
const atT=(d,key)=>{const[h,m]=hm(S.settings[key]);return at(d,h,m)};
let saveT;const saveSoon=()=>{clearTimeout(saveT);saveT=setTimeout(save,300)};
let S;
const B=id=>S.buckets.find(b=>b.id===id)||S.buckets[0];
const TH=id=>S.threads.find(t=>t.id===id)||null;
const evT=it=>it.type==='task'&&it.done&&it.doneAt?it.doneAt:it.ts;
function itemsIn(from,to){return S.items.filter(i=>{const e=evT(i);return e>=+from&&e<+to}).sort((a,b)=>evT(a)-evT(b))}
const threadsOf=bid=>S.threads.filter(t=>t.bucket===bid&&!t.archived).sort((a,b)=>(!!b.pinned-!!a.pinned)||b.updated-a.updated);
const activeBuckets=()=>S.buckets.filter(b=>!b.archived);
const live=i=>!B(i.bucket).archived;
const stripTags=x=>String(x||'').replace(/<[^>]+>/g,'');
const tok=x=>Math.ceil(String(x||'').length/4);
const cost=(m,i,o,cw=0,cr=0)=>{const p=PRICE[m];if(!p)return 0;return (i*p[0]+cw*p[0]*1.25+cr*p[2]+o*p[1])/1e6};
const modelName=id=>(MODELS.find(x=>x[0]===id)||[0,0])[1]||(codex.models.find(x=>x.id===id)||{}).name||id;
const providerName=id=>provider(id)?.name||'';
const fmtTok=n=>n>=1e6?(n/1e6).toFixed(n>=1e7?0:1)+'M':n>=1e3?(n/1e3).toFixed(n>=1e4?0:1)+'k':String(Math.round(n));
const fmtUSD=(x,d=2)=>x>0&&x<10**-d?'<$'+(10**-d).toFixed(d):'$'+x.toFixed(d);
const usageIn=(from,to)=>S.usage.filter(u=>u.ts>=+from&&u.ts<+to);
const uIn=u=>u.in+(u.cw||0)+(u.cr||0);
const uCost=u=>u.billed===false?0:cost(u.model,u.in,u.out,u.cw,u.cr);
const sumU=a=>a.reduce((t,u)=>({in:t.in+uIn(u),out:t.out+u.out,cost:t.cost+uCost(u),n:t.n+1}),{in:0,out:0,cost:0,n:0});
const monthStart=()=>{const d=sod(Date.now());d.setDate(1);return d};
// Rough size of a chat in tokens (~4 characters each), used for the context meter.
function ctxTokens(th){return tok(buildPrompt())+900+th.msgs.reduce((a,m)=>a+tok(stripTags(m.text))+(m.image?1500:0)+(m.itemIds?m.itemIds.length*40:0),0)}
function trackUsage(th,m,quiet){
 // Replies from an AI provider carry real counts. Offline-rule replies cost nothing and aren't recorded.
 const a=m.apiUsage;if(!a)return;
 const model=a.model||currentModel();
 const billed=a.billed!==false;
 m.usage={model,effort:a.effort||null,via:a.via||null,in:a.in+a.cw+a.cr,out:a.out,cost:billed?cost(model,a.in,a.out,a.cw,a.cr):0};
 S.usage.push({ts:m.ts,model,via:a.via||null,billed,in:a.in,cw:a.cw,cr:a.cr,out:a.out,thread:th.id,bucket:th.bucket});
 const b=+S.settings.budget;
 if(!quiet&&b>0){const ms=sumU(usageIn(monthStart(),addDays(sod(Date.now()),1))).cost,mk=dayKey(monthStart());
  if(ms>=b*.8&&S.settings.budgetWarned!==mk){S.settings.budgetWarned=mk;setTimeout(()=>flashMsg(`You've used ${Math.round(ms/b*100)}% of this month's $${b} budget`),900)}}
}
const pending=t=>t.msgs.some(m=>m.ask&&!m.resolved&&!m.undone);
function parseState(txt){try{const s=JSON.parse(txt);if(s&&s.v===2&&Array.isArray(s.items))return withDefaults(s)}catch(e){}return null}
// Saves go to a file through the Rust side. Several quick changes are written once.
let saveTimer=null,saving=Promise.resolve();
function flush(){clearTimeout(saveTimer);saveTimer=null;const txt=JSON.stringify(S);saving=saving.then(()=>bridge.saveState(txt)).catch(e=>flashMsg('Could not save: '+(e?.message||e)));return saving}
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(flush,250)}
function fresh(){
 return withDefaults({v:2,promptsV2:true,items:[],threads:[],memories:[],usage:[],settings:{...DEFAULTS},buckets:[
  {id:'inbox',name:'Inbox',color:'#8b8e94',about:'Chats tracko could not place yet. Pick a bucket in the chat, or move it from the header.',kw:[]},
  {id:'work',name:'Work',color:'#60a5fa',about:'Your job: tickets, reviews, meetings and deploys.',kw:['ticket','pr','review','deploy','meeting','standup','sprint','release','bug','timesheet']},
  {id:'personal',name:'Personal',color:'#f472b6',about:'Life admin, health and family.',kw:['gym','groceries','mom','dad','dentist','doctor','rent','bill','passport','home','birthday','bank']}]});
}
let keyState={has:false,source:null};

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function seed(){
 const t0=sod(Date.now());
 S=withDefaults({v:2,buckets:BUCKETS0.map(b=>({...b,kw:[...b.kw]})),items:[],threads:[],
  settings:{...DEFAULTS,
   about:"I'm a software engineer. Most of my week is tickets, code reviews and deploys. On weekends I build a side project.",
   budget:20,
   instructions:'Keep replies short. Keep ticket numbers when I log work. If a message mentions an APP ticket, it belongs in Work.'},
  memories:[
   {id:uid(),text:'I fill my timesheet on Friday afternoons',source:'you',thread:null,ts:+at(addDays(t0,-30),9)},
   {id:uid(),text:'I prefer standup notes as short bullets, one line each',source:'you',thread:null,ts:+at(addDays(t0,-40),9)}
  ]});
 const rnd=mulberry32(42),pick=a=>a[Math.floor(rnd()*a.length)];
 const now=Date.now(),t=sod(now);
 const add=o=>{const it={id:uid(),type:'log',done:false,doneAt:null,remindAt:null,thread:null,...o};S.items.push(it);return it};
 const T={
  work:['Fixed {t}, renewal date was off by one day','Reviewed PR for the checkout flow','Paired with Jordan on billing API pagination','Updated my timesheet','Wrote tests for discount codes in {t}','Deployed {t} to staging','Standup and sprint planning','Looked into the slow customer search query','Merged {t} after review','Answered a support question about expired accounts','Cleaned up feature flags in {t}','Demoed {t} to the product team'],
  side:['Sketched the main screen of the app','Tried out tool calling','Wrote a first prompt for sorting notes','Read the SDK docs on sessions','Listed the features I would use every day'],
  personal:['Gym, leg day','Paid the electricity bill','Groceries for the week','Called mom','Went for a long walk','Fixed the bathroom tap'],
  learning:['Read a chapter of Designing Data-Intensive Applications','Watched a talk on local-first apps','TypeScript generics practice','Read an article on SQLite in production']
 };
 const tk=()=>'APP-'+(100+Math.floor(rnd()*160));
 const y=addDays(t,-1),f=lastWd(5),skip=new Set([dayKey(y),dayKey(f)]);
 for(let i=364;i>=2;i--){
  const d=addDays(t,-i);if(skip.has(dayKey(d)))continue;
  if((i>40&&i<49)||(i>200&&i<212))continue;
  const wd=d.getDay(),weekend=wd===0||wd===6;
  let n=weekend?Math.floor(rnd()*3)-1:Math.floor(rnd()*6);
  if(!weekend&&rnd()<.08)n=0;
  for(let j=0;j<n;j++){
   const b=weekend?pick(['personal','learning','personal',i<21?'side':'learning']):(rnd()<.7?'work':pick(['personal','learning',i<21?'side':'work']));
   add({bucket:b,text:pick(T[b]).replace('{t}',tk()),ts:+at(d,8+Math.floor(rnd()*11),Math.floor(rnd()*60))});
  }
 }
 add({bucket:'personal',text:'Gym, leg day',ts:+at(y,18)});
 [['work','Updated my timesheet for the week',16,20],['work','Paired with Jordan on billing API pagination',11,0],['work','Wrote tests for discount codes in APP-219',14,30],['learning','Watched a talk on local-first apps',21,0]]
  .forEach(([b,x,h,m])=>add({bucket:b,text:x,ts:+at(f,h,m)}));
 add({type:'task',bucket:'work',text:'Reply to Taylor about the Q4 release date',ts:+at(addDays(t,-2),15)});
 add({type:'note',bucket:'work',text:'Staging deploys go out at 2pm. Ask in the releases channel before merging.',ts:+at(addDays(t,-20),10)});

 const mk=(bucket,title='')=>{const th={id:uid(),bucket,title,created:0,updated:0,msgs:[]};S.threads.push(th);return th};
 const say=(th,text,ts)=>{if(!th.title)th.title=makeTitle(text);if(!th.created)th.created=ts;th.msgs.push({id:uid(),role:'user',ts,text});const r=ruleReply(th,text,null,ts+4000);th.msgs.push(r);th.updated=ts+4000;return (r.itemIds||[]).map(id=>S.items.find(i=>i.id===id))};
 let th=mk('work','Timesheet');
 say(th,'The timesheet project code is ENG-OPS-04',+at(addDays(t,-33),9));
 say(th,'Remind me friday 4pm to fill my timesheet for this week',+at(addDays(t,-2),11));
 th=mk('work','Monday at work');
 say(th,'Fixed the renewal date off-by-one in APP-231. Did standup, then sprint planning for the next two weeks.',+at(y,10,20));
 say(th,'Deployed APP-228 to staging. Wrote the release notes for APP-228 too.',+at(y,15,5));
 say(th,"Need to review Riley's PR on payment retries",+at(y,16,10))[0].remindAt=now+3*36e5;
 say(th,'My reviewer for billing API changes is Jordan',+at(y,16,30));
 th=mk('side','Side project plan');
 say(th,'Remember: keep it simple, every feature has to be something I use daily',+at(addDays(t,-8),22));
 say(th,'Need to decide storage: SQLite or a JSON file',+at(addDays(t,-4),21));
 say(th,'Tried tool calling with a tiny prototype. Need to write the sorting prompt next.',+at(y,20,30));
 th=mk('learning','DDIA notes');
 say(th,'DDIA chapter 3 has the clearest explanation of B-trees vs LSM trees',+at(addDays(t,-15),21));
 say(th,'Need to finish DDIA chapter 5 by sunday 10am',+at(addDays(t,-6),20));
 th=mk('inbox','Errands');
 say(th,'Renew passport photos',+at(addDays(t,-9),12));
 say(th,'Need to book a dentist appointment',+at(addDays(t,-3),19))[0].remindAt=now-15*6e4;
 const plan=(txt,k)=>{const i=S.items.find(x=>x.text===txt);if(i)i.today=k};
 th=mk('inbox');
 say(th,'Fixed the date of birth validation on the signup form, APP-214. Need to ask Jordan if the same rule applies to renewals. Remind me Thursday to check the staging deploy.',now-55*6e4);
 say(th,'what did I do last friday?',now-30*6e4);
 th=mk('inbox');
 say(th,'Remember the router admin password is on the sticker under the box',now-38*6e4);
 th=mk('inbox');
 say(th,'Need to look into the export idea from the call',now-10*6e4);
 const tkd=dayKey(t);plan("Review Riley's PR on payment retries",tkd);plan('Book a dentist appointment',tkd);plan('Write the sorting prompt next',tkd);plan('Reply to Taylor about the Q4 release date',dayKey(y));
 return S;
}

/* ---------- offline rules: used when no AI provider is connected ---------- */
const WDN='(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|mon|tues|tue|wed|thurs|thur|thu|fri)';
const WMAP={sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
function isQuestion(t){return /\?\s*$/.test(t)||/^(what|when|where|which|who|how|show|did|find|list|search|summarize|summarise|recap)\b/i.test(t.trim())}
function splitParts(t){return t.split(/\n+/).flatMap(l=>l.split(/(?<=[.!?;])\s+(?=[A-Z#])/)).map(s=>s.replace(/^\s*[-*•]\s*/,'').trim()).filter(s=>s.length>1)}
function guessType(p){
 const l=p.toLowerCase();
 if(/\b(remind me|don'?t forget|do not forget)\b/.test(l))return 'task';
 if(/^\s*(remember|note|fyi|tip|idea)\b/.test(l))return 'note';
 if(/^\s*(todo|to do|task)\b/.test(l))return 'task';
 if(/\b(fixed|finished|shipped|merged|deployed|reviewed|wrote|paired|called|paid|watched|updated|sent|met|talked|completed|closed|built|cleaned|demoed|went|did|done|submitted|filled|bought|booked|tried)\b/.test(l))return 'log';
 if(/\b(need to|have to|gotta|should|must|follow up|ask|check|book|buy|send|email|call|review|finish|fix|write|schedule|renew|pay|reply|decide|try|look into)\b/.test(l))return 'task';
 return 'note';
}
// Finds a reminder time in text. Returns {ts, day, time} or null; day/time say which parts were given.
function whenParts(src){
 const l=src.toLowerCase().replace(new RegExp('\\bnot (?:today|tonight|tomorrow|'+WDN.slice(3,-1)+')\\b','g'),' '),now=new Date();
 let d=null,day=false,time=false,m;
 if(m=l.match(/\bin (\d+)\s*(min|mins|minutes?|h|hrs?|hours?|days?)\b/)){const u=m[2][0];return {ts:+now+(+m[1])*(u==='m'?6e4:u==='h'?36e5:DAY),day:true,time:true}}
 if(/\btonight\b/.test(l)){d=at(now,20);day=time=true}
 else if(/\btoday\b/.test(l)){d=atT(now,'remindTime');if(d<now)d=new Date(+now+36e5);day=true}
 else if(/\btomorrow\b/.test(l)){d=atT(addDays(now,1),'remindTime');day=true}
 else if(/\b(eod|end of day)\b/.test(l)){d=atT(now,'eodTime');day=time=true}
 else if(/\bnext week\b/.test(l)){d=atT(nextWd(1),'remindTime');day=true}
 else if(m=l.match(new RegExp('\\b'+WDN+'\\b'))){d=atT(nextWd(WMAP[m[0].slice(0,3)]),'remindTime');day=true}
 if((m=l.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/))||(m=l.match(/\bat (\d{1,2})(?::(\d{2}))?\b/))){
  let h=+m[1];const mi=+(m[2]||0);
  if(m[3]==='pm'&&h<12)h+=12;if(m[3]==='am'&&h===12)h=0;if(!m[3]&&h<8)h+=12;
  if(h<24){time=true;if(!d){d=at(now,h,mi);if(d<now)d=addDays(d,1)}else d.setHours(h,mi,0,0)}
 }
 return d?{ts:+d,day,time}:null;
}
// The words after "remind me" decide the time, so "move it to tomorrow, remind me at 6pm today" means today.
const REMIND_RE=/\b(?:remind me|reminder|don'?t forget|do not forget)\b/i;
function parseWhen(s){
 const k=s.search(REMIND_RE);
 const w=(k>=0&&whenParts(s.slice(k)))||whenParts(s);
 return w?w.ts:null;
}
function stripWhen(s){
 return s.replace(/\b(remind me|don'?t forget|do not forget)( to)?\b/gi,' ')
  .replace(new RegExp('\\b(on |by |this |next )?'+WDN+'\\b','gi'),' ')
  .replace(/\b(by |on )?(tomorrow|tonight|next week|eod|end of day)\b/gi,' ')
  .replace(/\bin \d+\s*(min|mins|minutes?|h|hrs?|hours?|days?)\b/gi,' ')
  .replace(/\b(at |by )?\d{1,2}(:\d{2})?\s*(am|pm)\b/gi,' ')
  .replace(/\bat \d{1,2}(:\d{2})?\b/gi,' ');
}
function clean(p,hasWhen){
 let s=p.replace(/#[a-z][\w-]*/gi,' ');
 if(hasWhen)s=stripWhen(s);
 s=s.replace(/^\s*(remember|note|fyi|tip|idea)\b( that)?\s*[:,-]?\s*/i,'')
  .replace(/^\s*(todo|to do|task)\s*[:,-]\s*/i,'')
  .replace(/^\s*(i\s+)?(need to|have to|gotta|got to|should|must|want to)\s+/i,'')
  .replace(/^\s*(today\s+)?(i\s+)?(just\s+)?/i,'')
  .replace(/^\s*to\s+/i,'')
  .replace(/\s{2,}/g,' ').replace(/\s+([.,!?;:])/g,'$1').trim().replace(/^[,;:-]\s*/,'').replace(/[.;,]+$/,'');
 return s?s[0].toUpperCase()+s.slice(1):p.trim();
}
function makeTitle(t){
 let s=splitParts(t||'')[0]||t||'Screenshot';
 s=(isQuestion(s)?s.trim():clean(s,false)).replace(/\s+/g,' ');
 if(s.length>44)s=s.slice(0,44).replace(/\s+\S*$/,'')+'…';
 return s?s[0].toUpperCase()+s.slice(1):'New chat';
}
function ensureBucket(name){
 const id=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||uid();
 let b=S.buckets.find(x=>x.id===id||x.name.toLowerCase()===name.toLowerCase());
 if(!b){b={id,name:name[0].toUpperCase()+name.slice(1),color:NEWC[S.buckets.length%NEWC.length],about:'New bucket. tracko writes a summary once a few things land here.',instructions:'',kw:[name.toLowerCase()]};S.buckets.push(b)}
 return b.id;
}
function scoreB(b,text){
 const l=text.toLowerCase();let s=l.includes(b.name.toLowerCase())?3:0;
 for(const k of b.kw)if(new RegExp('\\b'+reEsc(k)+'\\b').test(l))s++;
 return s;
}
// Where should a chat go? Confident = one clear winner. Otherwise ask.
function placeThread(text){
 const tag=text.match(/#([a-z][\w-]{1,30})/i);
 if(tag)return {confident:true,id:ensureBucket(tag[1]),ranked:[]};
 const sc=activeBuckets().filter(b=>b.id!=='inbox').map(b=>({id:b.id,s:scoreB(b,text)})).sort((a,c)=>c.s-a.s);
 const a=sc[0],c=sc[1]||{s:0};
 const mode=S.settings.sorting;
 const ok=!!a&&a.s>0&&(mode==='more'?(a.s>=2&&c.s===0):mode==='less'?a.s>c.s:(c.s===0||(a.s>=2&&a.s>=2*c.s)));
 return {confident:ok,id:a&&a.id,ranked:sc.map(x=>x.id)};
}
function moveThread(th,to){
 const from=th.bucket;if(from===to)return;
 th.bucket=to;
 S.items.forEach(i=>{if(i.thread===th.id&&i.bucket===from)i.bucket=to});
 th.msgs.forEach(m=>{if(m.ask&&!m.resolved)m.resolved=to});
}
function file(text,img,ts,bucket,threadId){
 const tag=text.match(/#([a-z][\w-]{1,30})/i),b=tag?ensureBucket(tag[1]):bucket;
 let made;
 if(img)made=[{type:'note',text:clean(text,false)||'Screenshot',image:img}];
 else made=splitParts(text).map(p=>{
  const type=guessType(p);let remindAt=null;
  if(type==='task'){remindAt=parseWhen(p);if(!remindAt&&/remind me|forget/i.test(p))remindAt=+atT(addDays(new Date(),1),'remindTime')}
  let txt;
  const k=p.search(/[,;.]?\s*\b(?:remind me|don'?t forget|do not forget)\b/i),head=k>0?p.slice(0,k).trim():'';
  if(remindAt&&head.length>3)txt=clean(head,false);else txt=clean(p,!!remindAt);
  return {type,text:txt,remindAt};
 });
 const ids=made.map(m=>{const it={id:uid(),ts,done:false,doneAt:null,remindAt:null,bucket:b,thread:threadId,...m};S.items.push(it);return it.id});
 return {id:uid(),role:'ai',ts,kind:'filed',itemIds:ids,note:img?'Connect an AI provider in Settings to have screenshots read. For now it is saved as a note.':''};
}
const CORR_RE=/^\s*(?:no[,.]?\s+|actually[,.]?\s+|sorry[,.]?\s+)?(?:(?:the\s+|that\s+|this\s+)?reminder\s+(?:is|should be|for)|(?:change|move|set|make|update|fix)\s+(?:the\s+|that\s+|this\s+|it\s+)?(?:reminder|it|time|date)?|it(?:'s| is)\s+(?:today|tonight|tomorrow)|(?:today|tonight|tomorrow),?\s+not\b)/i;
function correctLast(th,text,ts){
 const w=whenParts(text);if(!w)return null;
 const ids=new Set(th.msgs.flatMap(m=>m.role==='ai'?(m.filedIds||m.itemIds||[]):[]));
 const it=S.items.filter(i=>ids.has(i.id)&&i.type==='task'&&!i.done).sort((a,b)=>(!!b.remindAt-!!a.remindAt)||b.ts-a.ts)[0];
 if(!it)return null;
 const old=it.remindAt?new Date(it.remindAt):null,n=new Date(w.ts);
 if(old&&w.day&&!w.time)n.setHours(old.getHours(),old.getMinutes(),0,0);
 if(old&&w.time&&!w.day)n.setFullYear(old.getFullYear(),old.getMonth(),old.getDate());
 it.remindAt=+n;shown.delete(it.id);
 return {id:uid(),role:'ai',ts,kind:'agent',text:`Updated the reminder on "${it.text}" to ${fmtRemind(it.remindAt)}.`,itemIds:[],filedIds:[],shownIds:[],updatedIds:[it.id],memIds:[]};
}
// Data behind /sync, /standup and /recap. Used directly by the offline rules, and handed to
// the AI with the prompt so it doesn't have to search for it.
const BUILTIN=['sync','standup','recap'];
function lastWorkday(){const t=sod(Date.now());let d=addDays(t,-1);while(d.getDay()===0||d.getDay()===6)d=addDays(d,-1);return d}
function bucketArg(args){const a=String(args||'').trim().toLowerCase();if(!a)return null;return S.buckets.find(b=>b.name.toLowerCase()===a||b.id===a)||S.buckets.find(b=>b.name.toLowerCase().includes(a))||null}
function promptData(name,args){
 const now=Date.now(),t=sod(now),tom=addDays(t,1),tk=todayKey(),b=bucketArg(args);
 const inB=i=>!b||i.bucket===b.id;
 const open=S.items.filter(i=>i.type==='task'&&!i.done&&live(i)&&inB(i));
 const isDone=i=>i.type==='log'||(i.type==='task'&&i.done);
 const byDue=(x,y)=>(x.remindAt||9e15)-(y.remindAt||9e15)||x.ts-y.ts;
 if(name==='sync'){
  const overdue=open.filter(i=>i.remindAt&&i.remindAt<now).sort(byDue);
  const dueLater=open.filter(i=>i.remindAt&&i.remindAt>=now&&i.remindAt<+tom).sort(byDue);
  const list=open.filter(i=>i.today===tk&&!overdue.includes(i)&&!dueLater.includes(i));
  const done=itemsIn(t,tom).filter(i=>isDone(i)&&inB(i));
  return {kind:'sync',b,overdue,dueLater,list,done,next:overdue[0]||dueLater[0]||list[0]||open.sort(byDue)[0]||null};
 }
 if(name==='standup'){
  const since=lastWorkday();
  const done=itemsIn(since,t).filter(i=>isDone(i)&&inB(i));
  const today=itemsIn(t,tom).filter(i=>isDone(i)&&inB(i));
  const pending=open.filter(i=>i.ts<+t).sort((x,y)=>(!!(y.remindAt&&y.remindAt<now)-!!(x.remindAt&&x.remindAt<now))||byDue(x,y));
  const stuck=pending.filter(i=>i.ts<+addDays(t,-7));
  return {kind:'standup',b,since,done,today,pending,stuck};
 }
 const ws=weekStart(t),pws=addDays(ws,-7);
 const done=itemsIn(ws,tom).filter(i=>isDone(i)&&inB(i)),prev=itemsIn(pws,ws).filter(i=>isDone(i)&&inB(i));
 const added=S.items.filter(i=>i.ts>=+ws&&inB(i)&&i.type!=='log');
 const overdue=open.filter(i=>i.remindAt&&i.remindAt<now).sort(byDue);
 const per=b?[]:S.buckets.map(x=>({b:x,n:done.filter(i=>i.bucket===x.id).length})).filter(x=>x.n).sort((x,y)=>y.n-x.n);
 const days=new Set(done.map(i=>dayKey(evT(i)))).size;
 return {kind:'recap',b,done,prev,added,open,overdue,per,days};
}
function promptSnapshot(name,args){
 const d=promptData(name,args),line=i=>`- ${i.id} | ${B(i.bucket).name} | ${typeName(i)} | ${i.text}${i.remindAt&&!i.done?' | reminder '+localIso(i.remindAt):''} | ${dayKey(evT(i))}`;
 const sec=(t,a,n=30)=>`${t} (${a.length}):\n`+(a.length?a.slice(0,n).map(line).join('\n'):'- none');
 const head=d.b?`Only bucket ${d.b.name} (id ${d.b.id}).\n`:'';
 if(d.kind==='sync')return head+[sec('Overdue',d.overdue),sec('Due later today',d.dueLater),sec("On today's list",d.list),sec('Done today',d.done)].join('\n\n');
 if(d.kind==='standup')return head+`Last workday: ${dayKey(d.since)}.\n`+[sec('Done since then',d.done),sec('Done today so far',d.today),sec('Still pending from before today',d.pending),sec('Open more than a week',d.stuck,10)].join('\n\n');
 return head+`This week so far: ${d.done.length} done on ${d.days} day(s). Last week: ${d.prev.length} done.\n`
  +(d.per.length?'Done by bucket this week: '+d.per.map(x=>`${x.b.name} ${x.n}`).join(', ')+'\n':'')
  +[sec('Done this week',d.done,40),sec('Added this week',d.added,20),sec('Overdue',d.overdue),`Open tasks: ${d.open.length}`].join('\n\n');
}
// Offline version: plain counts and lists, no AI.
function builtinReply(name,args,ts){
 const d=promptData(name,args),pl2=(n,w)=>`${n} ${w}${n===1?'':'s'}`,inB=d.b?` in ${d.b.name}`:'';
 let text,show=[];
 if(d.kind==='sync'){
  const parts=[`${pl2(d.done.length,'thing')} done today${inB}`];
  if(d.overdue.length)parts.push(`**${d.overdue.length} overdue**`);
  if(d.dueLater.length)parts.push(`${d.dueLater.length} due later today`);
  if(d.list.length)parts.push(`${d.list.length} on today's list`);
  text=`${fmtDate(Date.now(),{weekday:'long',month:'long',day:'numeric'})}: ${parts.join(', ')}.`+(d.next?`\nNext up: ${d.next.text}${d.next.remindAt?` (${fmtRemind(d.next.remindAt)})`:''}.`:'\nNothing pending. A clear day.');
  show=[...d.overdue,...d.dueLater,...d.list,...d.done.slice(-8)];
 }else if(d.kind==='standup'){
  const since=daysFromToday(+d.since)===-1?'yesterday':fmtDate(d.since,{weekday:'long'});
  text=`Since ${since}${inB}: ${pl2(d.done.length,'thing')} done${d.today.length?`, plus ${d.today.length} today`:''}.\n${d.pending.length?`${pl2(d.pending.length,'task')} still pending from before`:'Nothing pending from before'}${d.stuck.length?`, ${d.stuck.length} of them open for over a week`:''}.`;
  show=[...d.done,...d.today,...d.pending.slice(0,15)];
 }else{
  const diff=d.done.length-d.prev.length;
  text=`This week${inB}: **${d.done.length} done** across ${pl2(d.days,'day')} (${diff===0?'same as':diff>0?`${diff} more than`:`${-diff} fewer than`} last week). ${d.added.length} added, ${d.open.length} still open${d.overdue.length?`, **${d.overdue.length} overdue**`:''}.`
   +(d.per.length?`\nMost done in ${d.per[0].b.name} (${d.per[0].n})${d.per.length>1?', then '+d.per.slice(1,3).map(x=>`${x.b.name} (${x.n})`).join(', '):''}.`:'');
  show=[...d.overdue,...d.done.slice(-12)];
 }
 return {id:uid(),role:'ai',ts,kind:'agent',text,itemIds:[],filedIds:[],shownIds:[...new Set(show.map(i=>i.id))],updatedIds:[],memIds:[]};
}
function ruleReply(th,text,img,ts=Date.now(),opt={}){
 const scope=th.bucket==='inbox'?null:th.bucket;
 if(opt.prompt&&BUILTIN.includes(opt.name))return builtinReply(opt.name,opt.args,ts);
 if(opt.prompt)return answer(text,ts,scope,{noKw:true});
 if(text&&!img&&isQuestion(text))return answer(text,ts,scope);
 if(text&&!img&&CORR_RE.test(text)){const c=correctLast(th,text,ts);if(c)return c}
 if(text&&!img&&S.settings.autoMemory&&MEMRE.test(text)){
  const t=text.trim().replace(/[.]+$/,''),mem={id:uid(),text:t[0].toUpperCase()+t.slice(1),source:'chat',thread:th.id,ts};
  S.memories.unshift(mem);
  return {id:uid(),role:'ai',ts,kind:'memory',memId:mem.id};
 }
 const extra={};
 if(th.bucket==='inbox'){
  const p=placeThread(th.msgs.filter(m=>m.role==='user').map(m=>m.text).join('\n'));
  if(p.confident){moveThread(th,p.id);extra.moved=p.id}
  else extra.ask=p.ranked;
 }
 return {...file(text,img,ts,th.bucket,th.id),...extra};
}
// ---------- AI replies (Claude or Codex) ----------
const localIso=t=>{const d=new Date(t);return dayKey(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
const typeName=i=>i.type==='note'?'note':i.type==='log'||i.done?'done':'task';
function searchItems(a){
 let res=S.items.slice();
 if(a.from_date){const f=keyDate(a.from_date);if(!isNaN(f))res=res.filter(i=>evT(i)>=+f)}
 if(a.to_date){const t=keyDate(a.to_date);if(!isNaN(t))res=res.filter(i=>evT(i)<+addDays(t,1))}
 if(a.bucket_id)res=res.filter(i=>i.bucket===a.bucket_id);
 const k=a.kind||'any';
 if(k==='open_task')res=res.filter(i=>i.type==='task'&&!i.done);else if(k==='done')res=res.filter(i=>i.type==='log'||i.done);
 else if(k==='note')res=res.filter(i=>i.type==='note');else if(k==='reminder')res=res.filter(i=>i.remindAt&&!i.done);
 if(a.query){const toks=a.query.toLowerCase().split(/\s+/).filter(w=>w.length>1);if(toks.length)res=res.filter(i=>toks.some(t=>i.text.toLowerCase().includes(t)))}
 res.sort((x,y)=>evT(y)-evT(x));
 if(!res.length)return 'No matching items.';
 const more=res.length>60?`\n(${res.length-60} more not shown. Narrow the search.)`:'';
 return res.slice(0,60).map(i=>`${i.id} | ${dayKey(evT(i))} | ${B(i.bucket).name} | ${typeName(i)} | ${i.text}${i.remindAt&&!i.done?' | reminder '+localIso(i.remindAt):''}`).join('\n')+more;
}
// What the model sees of earlier turns: text only, with a short note of what each reply saved.
function aiSummary(m){
 const parts=[];if(m.text)parts.push(stripTags(m.text));
 const its=(m.filedIds||(m.kind==='filed'?m.itemIds:[])||[]).map(id=>S.items.find(i=>i.id===id)).filter(Boolean);
 const desc=i=>`${typeName(i)} "${i.text}" (id ${i.id}${i.remindAt&&!i.done?', reminder '+localIso(i.remindAt):''})`;
 if(its.length&&!m.undone)parts.push('[Saved: '+its.map(desc).join('; ')+']');
 const up=(m.updatedIds||[]).map(id=>S.items.find(i=>i.id===id)).filter(Boolean);
 if(up.length)parts.push('[Updated: '+up.map(desc).join('; ')+']');
 if(m.moved)parts.push(`[Moved this chat to ${B(m.moved).name}]`);
 if(m.ask&&!m.resolved)parts.push('[Asked the user to pick a bucket]');
 return parts.join(' ').trim();
}
function apiHistory(th){
 const out=[],n=th.msgs.length;
 th.msgs.forEach((m,k)=>{
  if(m.role==='user'){
   const content=[];
   if(m.image){
    const mm=/^data:([^;]+);base64,(.*)$/.exec(m.image);
    if(k===n-1&&mm)content.push({type:'image',source:{type:'base64',media_type:mm[1],data:mm[2]}});
    else content.push({type:'text',text:'[The user attached a screenshot here.]'});
   }
   content.push({type:'text',text:(m.prompt?`(Saved prompt /${m.prompt}) `:'')+(m.text||'(no text, see the screenshot)')});
   out.push({role:'user',content});
  }else{const t=aiSummary(m);if(t)out.push({role:'assistant',content:t})}
 });
 return out;
}
async function agentReply(th,text,img,opt={}){
 const ts=Date.now(),m={id:uid(),role:'ai',ts,kind:'agent',text:'',itemIds:[],filedIds:[],shownIds:[],updatedIds:[],memIds:[]};
 const handlers={
  file_items:({items,bucket_id})=>{
   const bid=bucket_id&&S.buckets.some(b=>b.id===bucket_id)?bucket_id:th.bucket;
   const made=(items||[]).filter(x=>x&&x.text).map(x=>{
    let r=null;if(x.type==='task'&&x.remind_at){const d=new Date(x.remind_at);if(!isNaN(d))r=+d}
    const it={id:uid(),type:['task','note','log'].includes(x.type)?x.type:'note',text:String(x.text).trim(),remindAt:r,bucket:bid,thread:th.id,ts:Date.now(),done:false,doneAt:null};
    S.items.push(it);m.filedIds.push(it.id);return it;
   });
   return `Saved ${made.length} item(s) to ${B(bid).name}: `+made.map(i=>i.id).join(', ');
  },
  move_chat:({bucket_id})=>{
   const b=S.buckets.find(x=>x.id===bucket_id&&!x.archived);if(!b)throw new Error('No bucket with id '+bucket_id);
   moveThread(th,b.id);m.moved=b.id;return 'Moved the chat to '+b.name;
  },
  ask_bucket:({bucket_ids,new_bucket})=>{
   m.ask=(bucket_ids||[]).filter(id=>S.buckets.some(b=>b.id===id&&b.id!=='inbox'&&!b.archived));
   if(new_bucket)m.askNew=String(new_bucket).slice(0,40);
   return 'The user will see bucket buttons. Tell them briefly why you are asking.';
  },
  create_bucket:({name,description})=>{
   const id=ensureBucket(String(name).slice(0,40));const b=B(id);if(description&&b.about.startsWith('New bucket'))b.about=String(description);
   return `Bucket ${b.name} has id ${b.id}`;
  },
  save_memory:({text})=>{
   if(!S.settings.autoMemory)return 'Memory saving is turned off by the user. Do not save memories.';
   const mem={id:uid(),text:String(text).trim(),source:'chat',thread:th.id,ts:Date.now()};S.memories.unshift(mem);m.memIds.push(mem.id);return 'Saved to memory';
  },
  search_history:(a)=>searchItems(a),
  update_items:({updates})=>{
   const done=[];
   for(const u of updates||[]){
    const it=S.items.find(i=>i.id===u.item_id);if(!it){done.push(`${u.item_id}: not found`);continue}
    if(u.text&&u.text.trim())it.text=u.text.trim();
    if(u.clear_reminder)it.remindAt=null;
    else if(u.remind_at){const d=new Date(u.remind_at);if(!isNaN(d)){it.remindAt=+d;shown.delete(it.id)}}
    if(u.done===true&&it.type==='task'){it.done=true;it.doneAt=Date.now()}else if(u.done===false){it.done=false;it.doneAt=null}
    if(!m.updatedIds.includes(it.id))m.updatedIds.push(it.id);
    done.push(`${it.id}: "${it.text}"${it.remindAt?' reminder '+localIso(it.remindAt):''}${it.done?' (done)':''}`);
   }
   return 'Updated:\n'+done.join('\n');
  },
  show_items:({item_ids})=>{const ok=(item_ids||[]).filter(id=>S.items.some(i=>i.id===id));m.shownIds.push(...ok.filter(id=>!m.shownIds.includes(id)));return `Showing ${ok.length} item(s)`}
 };
 const b=B(th.bucket),now=new Date();
 const ctx=[`Now: ${fmtDate(now,{weekday:'long',year:'numeric',month:'long',day:'numeric'})}, ${fmtTime(now)} (local time ${localIso(now)}).`,
  `This chat: "${th.title}" in bucket ${b.name} (id ${b.id}).${th.bucket==='inbox'?' It is not sorted yet.':''}`,
  opt.prompt?'The user ran a saved prompt. Answer it fully, in short plain sentences or bullets, and call show_items with the items you mention.':'',
  opt.prompt&&BUILTIN.includes(opt.name)?'Data for this prompt (already gathered, no need to search):\n'+promptSnapshot(opt.name,opt.args):''].filter(Boolean).join('\n');
 const prov=provider(activeProvider()),model=currentModel(),effort=currentEffort();
 try{
  const hist=apiHistory(th),last=th.msgs[th.msgs.length-1];
  // Harnesses get the chat as one text message; the Claude API gets real turns.
  const earlier=hist.slice(0,-1).map(h=>(h.role==='user'?'User: ':'tracko: ')+(Array.isArray(h.content)?h.content.filter(c=>c.type==='text').map(c=>c.text).join(' '):h.content)).join('\n');
  const input=(earlier?'Earlier in this chat:\n'+earlier+'\n\n':'')+'New message from the user:\n'+(last.prompt?`(Saved prompt /${last.prompt}) `:'')+(last.text||'(no text, see the screenshot)');
  const r=await prov.turn({customPath:S.settings.paths[prov.id]||'',model,effort,instructions:buildPrompt(),context:ctx,input,image:last.image||null,
   system:[{type:'text',text:buildPrompt(),cache_control:{type:'ephemeral'}},{type:'text',text:ctx}],messages:hist,tools:TOOLS,handlers});
  m.text=r.text||(m.filedIds.length?'Saved.':'Done.');
  m.apiUsage={model:r.model||model,effort,via:prov.id,billed:r.billed,in:r.usage.in,out:r.usage.out,cw:r.usage.cacheW,cr:r.usage.cacheR};
 }catch(e){m.kind='error';m.text=prov.id==='claude-api'?describeError(e):`${prov.name} couldn't reply: ${e?.message||e}`}
 m.itemIds=m.filedIds;
 if(m.ask&&!m.ask.length&&!m.askNew)delete m.ask;
 if(m.askNew&&!m.ask)m.ask=[];
 return m;
}
const ready=()=>PROVIDERS.filter(p=>p.state.status==='ready');
function activeProvider(){
 const r=ready(),want=r.find(p=>p.id===S.settings.provider);
 return (want||r[0]||null)?.id||null;
}
const shownProvider=()=>provider(activeProvider())||PROVIDERS.find(p=>p.id==='claude-api');
function modelInfo(){
 const p=shownProvider(),ms=p.models(),id=S.settings.models[p.id];
 return ms.find(m=>m.id===id)||ms.find(m=>m.isDefault)||ms[0]||null;
}
function currentModel(){return modelInfo()?.id||null}
function currentEffort(){const m=modelInfo(),e=S.settings.efforts[shownProvider().id];return m?(m.efforts.includes(e)?e:m.defaultEffort):e||'low'}
function effortOptions(){return modelInfo()?.efforts||[]}
const effortLabel=e=>e?e==='xhigh'?'Extra high':e[0].toUpperCase()+e.slice(1):'Default';
async function reply(th,text,img,ts=Date.now(),opt={}){
 if(activeProvider())return agentReply(th,text,img,opt);
 return ruleReply(th,text,img,ts,opt);
}

function answer(q,ts=Date.now(),scope=null,opt={}){
 const l=q.toLowerCase();
 let r=null,m;
 if(/yesterday/.test(l))r=range('yesterday');
 else if(/\btoday\b/.test(l))r=range('today');
 else if(/last week/.test(l))r=range('lastweek');
 else if(/this week/.test(l))r=range('thisweek');
 else if(m=l.match(/(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/)){const n=WD.findIndex(w=>w.toLowerCase()===m[1]);const f=lastWd(n);r={from:f,to:addDays(f,1),label:(/last/.test(l)?'Last ':'On ')+WD[n],sub:fmtDate(f)}}
 let b=S.buckets.find(x=>x.id!=='inbox'&&(l.includes(x.name.toLowerCase())||new RegExp('\\b'+reEsc(x.id)+'\\b').test(l)));
 if(!b&&scope&&!/\b(all|everything|everywhere|every bucket)\b/.test(l))b=B(scope);
 const wantRemind=/remind/.test(l),wantOpen=/\b(todo|to do|open|pending|tasks?)\b/.test(l),wantNotes=/\b(notes?|remember|saved)\b/.test(l);
 const stop=new Set('what when where which who how did do does i me my we the a an on in at to for of is are was were have has show list find search about anything everything things thing stuff any last this week yesterday today get got work worked done todo tasks task open pending remind reminders reminder notes note remember saved there with from and or all everywhere every bucket'.split(' ').concat(WD.map(w=>w.toLowerCase())));
 const kws=opt.noKw?[]:l.replace(/[^a-z0-9\- ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!stop.has(w)&&!(b&&(b.name.toLowerCase().includes(w)||b.id===w)));
 let res=S.items.slice();
 if(r)res=res.filter(i=>{const e=evT(i);return e>=+r.from&&e<+r.to});
 if(b)res=res.filter(i=>i.bucket===b.id);
 if(wantRemind)res=res.filter(i=>i.remindAt&&!i.done);
 else if(wantOpen)res=res.filter(i=>i.type==='task'&&!i.done);
 else if(wantNotes)res=res.filter(i=>i.type==='note');
 if(kws.length)res=res.filter(i=>kws.some(k=>i.text.toLowerCase().includes(k)));
 const nothingAsked=!r&&!b&&!wantRemind&&!wantOpen&&!wantNotes&&!kws.length;
 res.sort((a,c)=>r?evT(a)-evT(c):evT(c)-evT(a));
 const n=res.length,nb=new Set(res.map(i=>i.bucket)).size,inB=b?` in ${esc(b.name)}`:'';
 let text;
 if(nothingAsked)text='Ask me about a day ("last friday"), a bucket ("open tasks in tracko"), or a word you remember.';
 else if(!n)text=`I couldn't find anything${inB} for that. Try a day like "last friday", or a word from the note.${scope?' Add "everywhere" to search all buckets.':''}`;
 else if(wantRemind)text=`You have ${n} reminder${pl(n)} coming up${inB}.`;
 else if(wantOpen)text=`${n} open task${pl(n)}${inB}.`;
 else if(r)text=`${r.label} <span class="faint">(${esc(r.sub)})</span> you had ${n} thing${pl(n)}${nb>1&&!b?` across ${nb} buckets`:inB}.`;
 else text=`Found ${n} thing${pl(n)}${kws.length?` mentioning "${esc(kws.join(' '))}"`:''}${inB}.`;
 if(b&&b.id===scope&&n)text+=` <span class="faint">Only this bucket. Say "everywhere" to search all.</span>`;
 const lim=opt.noKw?40:12;
 if(n>lim)text+=` <span class="faint">Showing ${lim}. Press ⌘K to search all of them.</span>`;
 return {id:uid(),role:'ai',ts,kind:'answer',text,itemIds:res.slice(0,lim).map(i=>i.id)};
}
function range(k){
 const t=sod(Date.now()),md={month:'short',day:'numeric'};
 if(k==='yesterday'){const f=addDays(t,-1);return{from:f,to:t,label:'Yesterday',sub:fmtDate(f)}}
 if(k==='friday'){const f=lastWd(5);return{from:f,to:addDays(f,1),label:'Last Friday',sub:fmtDate(f)}}
 if(k==='lastweek'){const ws=weekStart(t),f=addDays(ws,-7);return{from:f,to:ws,label:'Last week',sub:fmtDate(f,md)+' to '+fmtDate(addDays(ws,-1),md)}}
 if(k==='thisweek'){const ws=weekStart(t);return{from:ws,to:addDays(t,1),label:'This week',sub:fmtDate(ws,md)+' to today'}}
 return{from:t,to:addDays(t,1),label:'Today',sub:fmtDate(t)};
}

/* ---------- ui state ---------- */
const ui={view:'chat',thread:null,newBucket:null,bucket:null,recall:'yesterday',day:dayKey(addDays(new Date(),-1)),tl:30,draft:'',pendingImage:null,typing:null,flash:null,sf:'all',sel:0,res:[],collapsed:new Set(),stab:'general',setOpen:false,sbucket:null,renaming:null,renameWhere:null,slash:null,slashSel:0};
let searchOpen=false;
const PREF_K='tracko-ui';
const prefs={sw:264,rw:340,rOpen:typeof innerWidth!=='undefined'&&innerWidth>=1280,sideOff:false};
try{Object.assign(prefs,JSON.parse(localStorage.getItem(PREF_K))||{})}catch(e){}
if(prefs.rw<300||prefs.rw===400)prefs.rw=340;
const savePrefs=()=>{try{localStorage.setItem(PREF_K,JSON.stringify(prefs))}catch(e){}};
const todayKey=()=>dayKey(new Date());

/* ---------- components ---------- */
const chip=b=>`<button class="chip" data-act="bucket" data-b="${b.id}">${bmark(b)}${esc(b.name)}</button>`;
const empty=t=>`<div class="empty">${t}</div>`;
function typeLabel(it){return it.type==='note'?['note','Note']:it.type==='log'||it.done?['log','Done']:['task','Task']}
function itemRow(it,o={}){
 const b=B(it.bucket),due=it.remindAt&&!it.done&&it.remindAt<=Date.now();
 const lead=it.type==='task'?`<button class="chk" data-act="toggle" data-id="${it.id}" title="${it.done?'Mark open':'Mark done'}">${it.done?ico('check'):''}</button>`:`<span class="tp ${it.type}">${it.type==='log'?'Done':'Note'}</span>`;
 const tk=todayKey(),planned=it.type==='task'&&it.today===tk;
 const sun=it.type==='task'&&!it.done?`<button class="ib ${planned?'sunon':''}" data-act="today" data-id="${it.id}" title="${planned?'Remove from today':'Add to today'}">${ico('sun')}</button>`:'';
 const link=!o.compact&&it.thread&&ui.view!=='chat'&&TH(it.thread)?`<button class="chip" data-act="thread" data-t="${it.thread}" title="Open the chat this came from">${ico('chat')}chat</button>`:'';
 const bell=it.type==='task'&&!it.done&&!it.remindAt?`<button class="ib" data-act="remmenu" data-id="${it.id}" title="Add a reminder">${ico('bell')}</button>`:'';
 return `<div class="item ${o.compact?'compact':''} ${it.done?'done':''} ${ui.flash===it.id?'flash':''}" data-id="${it.id}">${lead}
 <div class="ibody"><div class="itext" data-edit="${it.id}" title="Double-click to edit">${esc(it.text)}</div>${it.image?`<img class="thumb" src="${it.image}" alt="">`:''}
  <div class="meta">${o.bucket===false?'':chip(b)}<span>${fmtWhen(evT(it))}</span>${it.remindAt&&!it.done?`<button class="rp ${due?'due':''}" data-act="remmenu" data-id="${it.id}" title="Change the reminder">${ico('bell')}${due?'Due ':''}${fmtRemind(it.remindAt)}</button>`:''}${planned&&!o.compact&&!it.done?`<span class="rp" style="color:var(--warn)">${ico('sun')}Today</span>`:''}${link}</div>
  ${o.snooze&&due?`<div class="snz"><button class="btn pri" data-act="finish" data-id="${it.id}">Done</button><button class="btn" data-act="snooze" data-k="1h" data-id="${it.id}">1 hour</button><button class="btn" data-act="snooze" data-k="tonight" data-id="${it.id}">Tonight</button><button class="btn" data-act="snooze" data-k="tomorrow" data-id="${it.id}">Tomorrow</button></div>`:''}
 </div>
 <div class="acts">${sun}${bell}${o.compact?'':dd('move',it.bucket,`${bmark(b)}${esc(b.name)}`,'mini',`data-id="${it.id}" title="Move to bucket"`)}<button class="ib" data-act="del" data-id="${it.id}" title="Delete">${ico('trash')}</button></div>
 </div>`;
}
function grouped(items,emptyText='Nothing here.'){
 if(!items.length)return empty(emptyText);
 return S.buckets.map(b=>{const g=items.filter(i=>i.bucket===b.id);if(!g.length)return '';
  return `<div class="grp"><div class="grp-h">${bmark(b)}${esc(b.name)}<span class="faint">${g.length}</span></div>${g.map(i=>itemRow(i,{bucket:false})).join('')}</div>`}).join('');
}
function threadRow(t,showBucket){
 const last=[...t.msgs].reverse().find(m=>m.role==='user'),b=B(t.bucket);
 return `<button class="trow" data-act="thread" data-t="${t.id}"><span class="ib">${ico('chat')}</span><span class="tb"><div class="tt">${esc(t.title)}</div><div class="tprev">${esc(last?last.text||'Screenshot':'')}</div></span>
 <span class="tmeta">${pending(t)?'<span class="pendtag">needs a bucket</span>':''}${showBucket?`<span class="chip">${bmark(b)}${esc(b.name)}</span>`:''}${fmtWhen(t.updated)}</span></button>`;
}
function heatmap(bid,weeks=53){
 const counts={};for(const it of S.items){if(bid&&it.bucket!==bid)continue;const k=dayKey(evT(it));counts[k]=(counts[k]||0)+1}
 const today=sod(Date.now()),start=addDays(weekStart(today),-7*(weeks-1));
 let cols='',months='',lastM=-1,total=0;
 for(let w=0;w<weeks;w++){
  const ws=addDays(start,7*w),m=ws.getMonth();
  months+=`<span>${m!==lastM&&w<weeks-2?fmtDate(ws,{month:'short'}):''}</span>`;lastM=m;
  let cells='';
  for(let d=0;d<7;d++){
   const day=addDays(ws,d),k=dayKey(day);
   if(day>today){cells+='<i class="hc fut"></i>';continue}
   const c=counts[k]||0;total+=c;
   const lv=c===0?0:c<=2?1:c<=4?2:c<=6?3:4;
   cells+=`<button class="hc l${lv} ${ui.day===k?'sel':''}" data-act="day" data-day="${k}" title="${c} thing${pl(c)} on ${fmtDate(day)}"></button>`;
  }
  cols+=`<div class="hcol">${cells}</div>`;
 }
 return {total,html:`<div class="hm"><div class="hmi"><div class="hm-months">${months}</div><div class="hm-body"><div class="hm-days"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span></span></div><div class="hm-grid">${cols}</div></div><div class="hm-leg">Less <i class="hc l0"></i><i class="hc l1"></i><i class="hc l2"></i><i class="hc l3"></i><i class="hc l4"></i> More</div></div></div>`};
}
function dayPanel(bid){
 if(!ui.day)return `<div class="daypanel">${empty('Click any day to see what happened.')}</div>`;
 const from=keyDate(ui.day);let its=itemsIn(from,addDays(from,1));if(bid)its=its.filter(i=>i.bucket===bid);
 const rel=dayLabel(+from);
 return `<div class="daypanel"><div class="card-h"><h3>${rel}${rel!==fmtDate(from)?` <span class="faint" style="font-weight:400">${fmtDate(from)}</span>`:''}</h3><span class="faint small">${its.length} thing${pl(its.length)}</span>
 <div class="r"><button class="ib" data-act="copy" data-k="day" data-b="${bid||''}" title="Copy as text">${ico('copy')}</button><button class="ib" data-act="day" data-day="" title="Close">${ico('x')}</button></div></div>
 ${its.length?(bid?its.map(i=>itemRow(i,{bucket:false})).join(''):grouped(its)):empty('Nothing that day.')}</div>`;
}

/* ---------- chat ---------- */
function filedLead(its,m){
 const bs=[...new Set(its.map(i=>i.bucket))];
 const to=m.moved||m.resolved;
 if(m.ask&&!m.resolved)return `Saved ${its.length===1?'it':its.length+' things'}, but I'm not sure which bucket this chat belongs to.`;
 if(to)return `Moved this chat to <b>${esc(B(to).name)}</b>.`;
 return bs.length===1?`Saved to <b>${esc(B(bs[0]).name)}</b>.`:`Saved across ${bs.length} buckets.`;
}
function filedCounts(its){
 const c={log:0,task:0,note:0};its.forEach(i=>c[i.type]++);
 const parts=[];if(c.log)parts.push(`${c.log} done`);if(c.task)parts.push(`${c.task} task${pl(c.task)}`);if(c.note)parts.push(`${c.note} note${pl(c.note)}`);
 const r=its.find(i=>i.remindAt&&!i.done);if(r)parts.push(`reminder ${fmtRemind(r.remindAt)}`);
 return parts.join(', ');
}
function askBox(m){
 const opts=(m.ask||[]).filter(id=>S.buckets.some(b=>b.id===id));
 activeBuckets().forEach(b=>{if(b.id!=='inbox'&&!opts.includes(b.id))opts.push(b.id)});
 return `<div class="ask"><p>Which bucket should this chat go in? Everything in it moves together.</p><div class="opts">
 ${opts.map(id=>{const b=B(id);return `<button class="btn" data-act="pick" data-msg="${m.id}" data-b="${id}">${bmark(b)}${esc(b.name)}</button>`}).join('')}
 <button class="btn" data-act="picknew" data-msg="${m.id}" ${m.askNew?`data-name="${esc(m.askNew)}"`:''}>${ico('plus')}${m.askNew?'New bucket: '+esc(m.askNew):'New bucket'}</button><button class="btn" data-act="pickinbox" data-msg="${m.id}">Leave in Inbox</button></div></div>`;
}
function mdLite(t){
 return esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\n/g,'<br>');
}
function streamHTML(){
 const th=TH(ui.thread);
 if(!th){
  const nb=ui.newBucket&&B(ui.newBucket);
  return `<div class="hero"><div class="av">${MARK}</div>${nb?`<h2>New chat in ${esc(nb.name)}</h2><p>Everything you say here stays in ${esc(nb.name)}. Tasks, notes and done items get pulled out as you go.</p>`
   :`<h2>What's on your mind?</h2><p>A one-liner, a messy paragraph, or a screenshot. I'll put this chat in the right bucket, or ask you when I'm not sure.</p>`}
   <div class="sugs">${S.prompts.slice(0,4).map(p=>`<button class="sug pr" data-act="runprompt" data-id="${p.id}" title="${esc(p.text)}">/${esc(p.name)}</button>`).join('')}</div></div>`;
 }
 let h='<div class="thread">',last='';
 for(const m of th.msgs){
  const k=dayKey(m.ts);if(k!==last){h+=`<div class="dsep">${dayLabel(m.ts)}</div>`;last=k}
  if(m.role==='user'){h+=`<div class="msg user" data-mid="${m.id}"><div class="bubble">${m.prompt?`<span class="ptag">/${esc(m.prompt)}${m.promptArgs?' '+esc(m.promptArgs):''}</span>`:''}${m.image?`<img src="${m.image}" alt="">`:''}${esc(m.text)}</div></div>`;continue}
  const its=(m.itemIds||[]).map(id=>S.items.find(i=>i.id===id)).filter(Boolean);
  let body;
  if(m.kind==='filed'){
   if(m.undone)body=`<div class="ait faint">Undone. Nothing was saved.</div>`;
   else if(!its.length)body=`<div class="ait faint">Those items were deleted.</div>`;
   else body=`<div class="ait">${filedLead(its,m)} <span class="faint">${filedCounts(its)}.</span>${m.note?` <span class="faint">${esc(m.note)}</span>`:''}</div>
    <div class="filed">${its.map(i=>itemRow(i,{bucket:i.bucket!==th.bucket})).join('')}</div>`;
  }else if(m.kind==='agent'||m.kind==='error'){
   const filed=(m.filedIds||[]).map(id=>S.items.find(i=>i.id===id)).filter(Boolean),shown=(m.shownIds||[]).map(id=>S.items.find(i=>i.id===id)).filter(Boolean);
   const mems=(m.memIds||[]).map(id=>S.memories.find(x=>x.id===id)).filter(Boolean),upd=(m.updatedIds||[]).map(id=>S.items.find(i=>i.id===id)).filter(Boolean);
   body=`<div class="ait ${m.kind==='error'?'errt':''}">${m.kind==='error'?ico('warn'):''}${mdLite(m.text)}${m.moved?` <span class="faint">Moved this chat to ${esc(B(m.moved).name)}.</span>`:''}</div>`
    +(m.undone?`<div class="ait faint">Undone. Nothing was saved.</div>`:filed.length?`<div class="filed">${filed.map(i=>itemRow(i,{bucket:i.bucket!==th.bucket})).join('')}</div>`:'')
    +(upd.length?`<div class="filed" style="margin-top:8px">${upd.map(i=>itemRow(i,{bucket:i.bucket!==th.bucket})).join('')}</div><div class="mnote">${ico('check')}Changed in place. No new item was added.</div>`:'')
    +(shown.length?`<div class="filed" style="margin-top:8px">${shown.map(i=>itemRow(i,{bucket:i.bucket!==th.bucket})).join('')}</div>`:'')
    +mems.map(x=>`<div class="filed" style="margin-top:8px"><div class="item"><span class="tp mem">Memory</span><div class="ibody"><div class="itext">${esc(x.text)}</div></div><div class="acts"><button class="ib" data-act="delmem" data-id="${x.id}" title="Remove this memory">${ico('trash')}</button></div></div></div>`).join('')
    +(m.kind==='error'?`<div class="ffoot" style="justify-content:flex-start;padding-left:0"><button class="btn" data-act="retry" data-msg="${m.id}">Try again</button>${/key/i.test(m.text)?`<button class="btn" data-act="settings" data-tab="general">Open settings</button>`:''}</div>`:'');
  }else if(m.kind==='memory'){
   const mem=S.memories.find(x=>x.id===m.memId);
   body=mem?`<div class="ait">Saved to memory. I'll keep this in mind in every chat.</div>`+(x=>`<div class="filed" style="margin-top:8px"><div class="item"><span class="tp mem">Memory</span><div class="ibody"><div class="itext">${esc(x.text)}</div></div><div class="acts"><button class="ib" data-act="delmem" data-id="${x.id}" title="Remove this memory">${ico('trash')}</button></div></div></div>`)(mem):`<div class="ait faint">Memory removed.</div>`;
  }else body=`<div class="ait">${m.text}</div>${its.length?`<div class="filed">${its.map(i=>itemRow(i,{bucket:i.bucket!==th.bucket})).join('')}</div>`:''}`;
  const u=m.usage,saved=(m.filedIds||(m.kind==='filed'?m.itemIds:[])||[]).some(id=>S.items.some(i=>i.id===id));
  const listed=(m.shownIds&&m.shownIds.length)||(m.kind==='answer'&&its.length);
  const hasMem=(m.memIds||[]).length||m.kind==='memory';
  const acts=[saved&&!m.undone?`<button data-act="undo" data-msg="${m.id}" title="Remove what this reply saved">${ico('reset')}Undo</button>`:'',
   listed?`<button data-act="copymsg" data-msg="${m.id}" title="Copy the list as text">${ico('copy')}Copy</button>`:'',
   hasMem?`<button data-act="settings" data-tab="memories">${ico('gear')}Memories</button>`:'',
   u?`<span>${esc(modelName(u.model))}${u.effort?' · '+esc(u.effort):''} · ${fmtTok(u.in)} in · ${fmtTok(u.out)} out${u.cost?' · '+fmtUSD(u.cost,3):''}</span>`:''].filter(Boolean).join('');
  h+=`<div class="msg ai" data-mid="${m.id}"><div class="aib">${body}${acts?`<div class="macts">${acts}</div>`:''}</div></div>`;
 }
 if(ui.typing===th.id)h+=`<div class="msg ai"><div class="aib"><div class="typing"><span></span><span></span><span></span></div></div></div>`;
 return h+'</div>';
}
function headHTML(){
 const th=TH(ui.thread);
 const cur=th?th.bucket:ui.newBucket||'';
 const b=cur?B(cur):null;
 return `${dd('movethread',cur,`${bmark(b)}${esc(b?b.name:'Let tracko pick a bucket')}`,'bpick',`title="${th?'Move this chat':'Start this chat in a bucket'}"`)}
 <span class="faint">/</span><span class="ctitle" data-tauri-drag-region>${th&&ui.renaming===th.id&&ui.renameWhere==='head'?`<input class="inp rn" data-rn="${th.id}" value="${esc(th.title)}">`:th?esc(th.title):'New chat'}</span>${th&&th.archived?'<span class="pendtag">Archived</span>':''}
 <div class="r" style="display:flex;gap:4px;align-items:center"><button class="btn" data-act="cwidth" title="Change chat width">${ico('width')}${{compact:'Compact',wide:'Wide',full:'Full'}[S.settings.chatWidth]}</button>${th?ctxMeter(th)+`<button class="ib" data-act="tmenu" data-t="${th.id}" data-w="head" title="Chat options">${ico('dots')}</button>`:''}${panelBtn()}</div>`;
}
function chatView(){
 const th=TH(ui.thread),bn=th&&th.bucket!=='inbox'?B(th.bucket).name:ui.newBucket?B(ui.newBucket).name:'';
 if(th&&(th.archived||B(th.bucket).archived))return `<div class="chat"><div id="chead" data-tauri-drag-region>${headHTML()}</div><div class="streamwrap"><div class="scroll" id="stream">${streamHTML()}</div><div class="rail" id="rail" hidden></div></div>
 <div class="cwrap"><div class="banner" style="max-width:var(--cw);margin:0 auto">${ico('archive')}${th.archived?'This chat is archived. Restore it to keep chatting.':`This chat's bucket, ${esc(B(th.bucket).name)}, is archived.`}<button class="btn pri" data-act="${th.archived?'trestore':'brestore'}" data-t="${th.id}" data-b="${th.bucket}">Restore</button></div></div></div>`;
 return `<div class="chat"><div id="chead" data-tauri-drag-region>${headHTML()}</div><div class="streamwrap"><div class="scroll" id="stream">${streamHTML()}</div><div class="rail" id="rail" hidden></div></div>
 <div class="cwrap"><div class="nudges" id="nudges">${nudgesHTML()}</div><div class="composer" id="composer"><div class="slash" id="slash" hidden></div><div id="att"></div>
  <textarea id="inp" rows="1" placeholder="${bn?`Message ${esc(bn)}...`:'Drop anything. A one-liner, a paragraph, a screenshot...'}"></textarea>
  <div class="crow"><button class="ib" data-act="attach" title="Attach an image">${ico('clip')}</button><span id="pickers" class="pickers">${pickersHTML()}</span><span class="hint">Enter to send. Type / for prompts, Tab to add a bucket. End with ? to ask.</span><button class="send" id="sendb" data-act="send" title="Send">${ico('up')}</button></div>
 </div></div></div>`;
}

/* ---------- pages ---------- */
function todayView(){
 const now=new Date(),h=now.getHours(),greet=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
 const open=S.items.filter(i=>i.type==='task'&&!i.done&&live(i)).sort((a,b)=>(a.remindAt||9e15)-(b.remindAt||9e15)||b.ts-a.ts);
 const rem=S.items.filter(i=>i.remindAt&&!i.done&&live(i)).sort((a,b)=>a.remindAt-b.remindAt);
 const due=rem.filter(i=>i.remindAt<=+now);
 const y=range('yesterday'),yc=itemsIn(y.from,y.to).length;
 const r=range(ui.recall),ri=itemsIn(r.from,r.to);
 const hm=heatmap(null),unsorted=S.threads.filter(t=>!t.archived&&pending(t));
 return `<header class="ph" data-tauri-drag-region><div class="grow" data-tauri-drag-region><div class="eyebrow">${fmtDate(now,{weekday:'long',month:'long',day:'numeric'})}</div><h1>${greet}</h1>
 <p class="sub">${[due.length?`${due.length} reminder${pl(due.length)} due`:'Nothing due right now',`${open.length} open task${pl(open.length)}`,`${yc} thing${pl(yc)} yesterday`].join(' · ')}</p></div><div class="hbtns">${panelBtn()}</div></header>
 ${unsorted.length?`<section class="card"><div class="card-h"><h3>Chats waiting for a bucket</h3><span class="r faint small">${unsorted.length}</span></div>${unsorted.map(t=>threadRow(t,false)).join('')}</section>`:''}
 <div class="grid2">
  <section class="card"><div class="card-h"><h3>Reminders</h3><span class="r faint small">${rem.length} upcoming</span></div>
   <div class="scrollbox">${rem.length?rem.map(i=>itemRow(i,{snooze:true})).join(''):empty('No reminders. Say "remind me friday to..." in a chat.')}</div></section>
  <section class="card"><div class="card-h"><h3>Look back</h3><div class="r"><div class="tabs">${['yesterday','friday','lastweek'].map(k=>`<button class="tab ${ui.recall===k?'on':''}" data-act="recall" data-k="${k}">${range(k).label}</button>`).join('')}</div>
   <button class="ib" data-act="copy" data-k="recall" title="Copy as text for standup or timesheet">${ico('copy')}</button></div></div>
   <div class="faint small" style="margin:-4px 6px 4px">${esc(r.sub)} · ${ri.length} thing${pl(ri.length)}</div>
   <div class="scrollbox">${grouped(ri,'Nothing logged. A quiet one.')}</div></section>
 </div>
 <section class="card"><div class="card-h"><h3>Activity</h3><span class="r faint small">${hm.total} things in the last year</span></div>${hm.html}${dayPanel(null)}</section>
 <section class="card"><div class="card-h"><h3>Open tasks</h3><span class="r faint small">${open.length}</span></div>${grouped(open,'All clear.')}</section>`;
}
function bucketView(){
 const b=S.buckets.find(x=>x.id===ui.bucket);if(!b){ui.view='today';return todayView()}
 const its=S.items.filter(i=>i.bucket===b.id),chats=threadsOf(b.id);
 const open=its.filter(i=>i.type==='task'&&!i.done).sort((a,c)=>(a.remindAt||9e15)-(c.remindAt||9e15)||c.ts-a.ts);
 const notes=its.filter(i=>i.type==='note').sort((a,c)=>c.ts-a.ts);
 const tl=its.filter(i=>i.type==='log'||(i.type==='task'&&i.done)).sort((a,c)=>evT(c)-evT(a));
 if(ui.flash){const ix=tl.findIndex(i=>i.id===ui.flash);if(ix>=ui.tl)ui.tl=ix+10}
 const d30=+addDays(sod(Date.now()),-30),done30=tl.filter(i=>evT(i)>=d30).length;
 let tlh='',last='';
 for(const i of tl.slice(0,ui.tl)){const k=dayKey(evT(i));if(k!==last){tlh+=`<div class="tl-day">${dayLabel(evT(i))}</div>`;last=k}tlh+=itemRow(i,{bucket:false})}
 const hm=heatmap(b.id);
 return `<header class="ph" data-tauri-drag-region><div class="grow" data-tauri-drag-region><div class="eyebrow">${bmark(b)}Bucket</div><h1>${esc(b.name)}</h1>
 <p class="sub">${esc(b.about)}</p>${b.instructions?`<p class="sub small" style="margin-top:6px"><span class="faint">Instructions:</span> ${esc(b.instructions)}</p>`:''}
 <div class="stats"><span><b>${chats.length}</b> chat${pl(chats.length)}</span><span><b>${open.length}</b> open</span><span><b>${notes.length}</b> to remember</span><span><b>${done30}</b> done in the last 30 days</span></div></div>
 <div class="hbtns">${panelBtn()}<button class="btn big" data-act="bsettings" data-b="${b.id}" title="Bucket settings">${ico('gear')}Settings</button><button class="btn pri big" data-act="newchat" data-b="${b.id}">${ico('plus')}New chat here</button></div></header>
 ${b.archived?`<div class="banner">${ico('archive')}This bucket is archived. It's hidden from the sidebar and its reminders are paused.<button class="btn pri" data-act="brestore" data-b="${b.id}">Restore</button></div>`:''}
 <div class="grid2">
  <section class="card"><div class="card-h"><h3>Chats</h3><span class="r faint small">${chats.length}</span></div>${chats.length?chats.map(t=>threadRow(t,false)).join(''):empty('No chats yet. Start one and it stays in this bucket.')}</section>
  <div>
   <section class="card"><div class="card-h"><h3>Open tasks</h3><span class="r faint small">${open.length}</span></div>${open.length?open.map(i=>itemRow(i,{bucket:false})).join(''):empty('All clear.')}</section>
   <section class="card"><div class="card-h"><h3>Things to remember</h3><span class="r faint small">${notes.length}</span></div>${notes.length?notes.map(i=>itemRow(i,{bucket:false})).join(''):empty('Start a message with "remember" to save one here.')}</section>
  </div>
 </div>
 <section class="card"><div class="card-h"><h3>Activity</h3><span class="r faint small">${hm.total} things in the last year</span></div>${hm.html}${dayPanel(b.id)}</section>
 <section class="card"><div class="card-h"><h3>Timeline</h3><span class="r faint small">${tl.length} done</span></div>${tlh||empty('Nothing done yet.')}${tl.length>ui.tl?`<button class="btn more" data-act="more">Show more</button>`:''}</section>`;
}

/* ---------- chat and bucket actions ---------- */
function ctxMeter(th){
 const used=ctxTokens(th),max=1e6,p=used/max,spent=S.usage.filter(u=>u.thread===th.id).reduce((a,u)=>a+uCost(u),0),r=6.5,c=2*Math.PI*r;
 return `<button class="ctxm" data-act="settings" data-tab="usage" title="${used.toLocaleString()} of ${max.toLocaleString()} tokens in context (${(p*100).toFixed(1)}%). ${fmtUSD(spent)} spent in this chat."><svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="${r}" class="trk"/><circle cx="9" cy="9" r="${r}" class="val" stroke-dasharray="${Math.max(c*p,.6).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 9 9)"/></svg>${fmtTok(used)}${spent>0?' · '+fmtUSD(spent):''}</button>`;
}
function threadMenu(id,w){
 const t=TH(id);if(!t)return [];
 if(t.archived)return [{label:'Open',icon:'chat',act:'thread',data:{t:id}},{label:'Restore',icon:'reset',act:'trestore',data:{t:id}},'-',{label:'Delete',icon:'trash',act:'tdelete',data:{t:id},danger:1}];
 return [{label:'Rename',icon:'edit',act:'trename',data:{t:id,w}},{label:t.pinned?'Unpin':'Pin to top',icon:'pin',act:'tpin',data:{t:id}},{label:'Archive',icon:'archive',act:'tarchive',data:{t:id}},'-',{label:'Delete',icon:'trash',act:'tdelete',data:{t:id},danger:1}];
}
function bucketMenu(id){
 const b=S.buckets.find(x=>x.id===id);if(!b)return [];
 const base=[{label:'New chat here',icon:'plus',act:'newchat',data:{b:id}},{label:'Open bucket',icon:'cal',act:'bucket',data:{b:id}},{label:'Bucket settings',icon:'gear',act:'bsettings',data:{b:id}}];
 if(id==='inbox')return base;
 return [...base,'-',b.archived?{label:'Restore bucket',icon:'reset',act:'brestore',data:{b:id}}:{label:'Archive bucket',icon:'archive',act:'barchive',data:{b:id}},{label:'Delete bucket',icon:'trash',act:'delbucket',data:{b:id},danger:1}];
}
// Dropdowns are drawn by tracko instead of the OS, so they match the theme everywhere.
function ddOptions(kind,el){
 if(kind==='model'){
  const r=ready(),list=r.length?r:[shownProvider()],out=[];
  for(const p of list){if(list.length>1)out.push({head:p.name});out.push(...p.models().map(m=>({v:p.id+':'+m.id,label:m.name,sub:m.sub||''})))}
  return out;
 }
 if(kind==='effort')return effortOptions().map(e=>({v:e,label:effortLabel(e)}));
 if(kind==='move'){const it=S.items.find(i=>i.id===el.dataset.id);return S.buckets.filter(x=>!x.archived||(it&&x.id===it.bucket)).map(x=>({v:x.id,label:x.name,bucket:x.id}))}
 if(kind==='movethread'){const th=TH(ui.thread);return (th?[]:[{v:'',label:'Let tracko pick a bucket',bucket:''}]).concat(S.buckets.filter(x=>(th||x.id!=='inbox')&&(!x.archived||(th&&x.id===th.bucket))).map(x=>({v:x.id,label:x.name,bucket:x.id})))}
 return [];
}
function pickersHTML(){return modelPicker('msel')+dd('effort',currentEffort(),esc(effortLabel(currentEffort())),'msel','title="Effort: how long it thinks before replying"')}
function modelPicker(cls){const p=shownProvider().id,id=currentModel();return dd('model',p+':'+(id||''),esc(id?modelName(id):'Model'),cls,'title="Model"')}
function dd(kind,cur,label,cls,extra=''){return `<button class="dd ${cls||''}" data-act="dd" data-dd="${kind}" data-v="${esc(cur)}" ${extra}><span class="ddl">${label}</span>${ico('chevd')}</button>`}
function openMenu(x,y,items){
 const m=$('#menu');if(!items.length)return;
 m.innerHTML=items.map(it=>it==='-'?'<div class="msep"></div>':it.head?`<div class="mh">${esc(it.head)}</div>`:`<button class="mi ${it.danger?'danger':''} ${it.on?'on':''}" data-act="${it.act}" ${Object.entries(it.data||{}).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ')}>${it.bucket!==undefined?bmark(it.bucket?B(it.bucket):null):ico(it.icon)}<span class="ml">${esc(it.label)}</span>${it.sub?`<span class="ms">${esc(it.sub)}</span>`:''}${it.on?ico('check'):''}</button>`).join('');
 m.hidden=false;const r=m.getBoundingClientRect();
 m.style.left=Math.max(8,Math.min(x,innerWidth-r.width-8))+'px';m.style.top=Math.max(8,Math.min(y,innerHeight-r.height-8))+'px';
}
const closeMenu=()=>{const m=$('#menu');if(m){m.hidden=true;m.style.minWidth='';m.dataset.owner=''}};
function openModal(html){settleAsk(false);$('#dlg').innerHTML=html;$('#modal').classList.add('on')}
const closeModal=()=>{settleAsk(false);$('#modal').classList.remove('on')};
let askResolve=null;
function settleAsk(v){const r=askResolve;askResolve=null;if(r)r(v)}
function ask({title,body='',ok='OK',cancel='Cancel',danger=false,icon=null}){
 openModal(`<div class="cf">${icon?`<span class="cf-ico ${danger?'bad':''}">${ico(icon)}</span>`:''}<div class="cf-t"><h3>${title}</h3>${body?`<p>${body}</p>`:''}</div></div>
  <div class="mrow"><button class="btn" data-act="cfno">${esc(cancel)}</button><button class="btn ${danger?'dangerf':'pri'}" data-act="cfok" autofocus>${esc(ok)}</button></div>`);
 setTimeout(()=>$('#dlg [data-act=cfok]')?.focus(),30);
 return new Promise(res=>{askResolve=res});
}
function focusRename(){const i=document.querySelector('[data-rn]');if(i&&document.activeElement!==i){i.focus();i.select()}}
function commitRename(el,cancel){
 const t=TH(el.dataset.rn);if(!t||ui.renaming!==t.id)return;
 if(!cancel&&el.value.trim())t.title=el.value.trim();
 ui.renaming=null;save();refresh();
}
function archiveThread(t){
 t.archived=true;t.pinned=false;save();
 if(ui.view==='chat'&&ui.thread===t.id)newChat(null);else refresh();
 flashMsg('Chat archived',{label:'Undo',fn:()=>{t.archived=false;save();refresh()}});
}
function archiveBucket(b){
 b.archived=true;save();refresh();
 flashMsg(b.name+' archived. Its reminders are paused.',{label:'Undo',fn:()=>{b.archived=false;save();refresh()}});
}
function archiveView(){
 const ts=S.threads.filter(t=>t.archived).sort((a,b)=>b.updated-a.updated),bs=S.buckets.filter(b=>b.archived);
 const trow=t=>{const b=B(t.bucket),last=[...t.msgs].reverse().find(m=>m.role==='user');return `<div class="arow"><span class="ib">${ico('chat')}</span><div class="tb" data-act="thread" data-t="${t.id}"><div class="tt">${esc(t.title)}</div><div class="tprev">${esc(last?last.text:'')}</div></div><span class="tmeta"><span class="chip">${bmark(b)}${esc(b.name)}</span>${fmtWhen(t.updated)}</span><button class="btn" data-act="trestore" data-t="${t.id}">Restore</button><button class="ib" data-act="tdelete" data-t="${t.id}" title="Delete">${ico('trash')}</button></div>`};
 const brow=b=>{const nc=S.threads.filter(t=>t.bucket===b.id).length,ni=S.items.filter(i=>i.bucket===b.id).length;return `<div class="arow">${bmark(b,';margin:0 6px')}<div class="tb" data-act="bucket" data-b="${b.id}"><div class="tt">${esc(b.name)}</div><div class="tprev">${nc} chat${pl(nc)} · ${ni} item${pl(ni)}</div></div><button class="btn" data-act="brestore" data-b="${b.id}">Restore</button><button class="ib" data-act="delbucket" data-b="${b.id}" title="Delete">${ico('trash')}</button></div>`};
 return `<header class="ph" data-tauri-drag-region><div class="grow" data-tauri-drag-region><div class="eyebrow">${ico('archive')}Archive</div><h1>Archived</h1><p class="sub">Archived chats and buckets are hidden from the sidebar, and their reminders are paused. Search still finds them. Restore brings them back as they were.</p></div></header>
 <section class="card"><div class="card-h"><h3>Chats</h3><span class="r faint small">${ts.length}</span></div>${ts.map(trow).join('')||empty('No archived chats.')}</section>
 <section class="card"><div class="card-h"><h3>Buckets</h3><span class="r faint small">${bs.length}</span></div>${bs.map(brow).join('')||empty('No archived buckets.')}</section>`;
}
function niceMax(x){const p=10**Math.floor(Math.log10(x));for(const m of [1,2,2.5,5,10])if(m*p>=x)return m*p;return 10*p}
function setUsage(){
 const t=sod(Date.now()),tom=addDays(t,1),st=S.settings;
 const tiles=[['Today',usageIn(t,tom)],['This week',usageIn(weekStart(t),tom)],['This month',usageIn(monthStart(),tom)]].map(([l,a])=>{const u=sumU(a);return `<div class="tile"><div class="tl">${l}</div><div class="tv">${fmtUSD(u.cost)}</div><div class="ts">${fmtTok(u.in+u.out)} tokens · ${u.n} call${pl(u.n)}</div></div>`}).join('');
 const days=[];for(let i=29;i>=0;i--){const d=addDays(t,-i),u=sumU(usageIn(d,addDays(d,1)));days.push({d,...u})}
 const top=niceMax(Math.max(...days.map(x=>x.cost),.01));
 const bars=days.map((x,i)=>`<div class="bcol ${i<4?'el':i>25?'er':''}" data-tip="${fmtDate(x.d)}: ${fmtUSD(x.cost)} · ${fmtTok(x.in+x.out)} tokens"><div class="bar" style="height:${(x.cost/top*100).toFixed(1)}%"></div></div>`).join('');
 const month=sumU(usageIn(monthStart(),tom)),bud=+st.budget,pct=bud>0?month.cost/bud:0;
 const mcol=pct>=1?'var(--bad)':pct>=.8?'var(--warn)':'var(--accent)';
 const mtxt=bud>0?(pct>=1?`${ico('warn')}Over budget. ${fmtUSD(month.cost)} of ${fmtUSD(bud)} used this month.`:pct>=.8?`${ico('warn')}Close to budget. ${Math.round(pct*100)}% of ${fmtUSD(bud)} used.`:`${Math.round(pct*100)}% of ${fmtUSD(bud)} used this month.`):'No budget set. Add one to get a warning at 80%.';
 const all=usageIn(monthStart(),tom),tot=Math.max(month.cost,1e-9);
 const byModel=[...new Set(all.map(u=>u.model))].map(id=>({name:modelName(id),...sumU(all.filter(u=>u.model===id))}));
 const byBucket=S.buckets.map(b=>({b,...sumU(all.filter(u=>u.bucket===b.id))})).filter(x=>x.n).sort((a,c)=>c.cost-a.cost);
 return `<p class="lead">What tracko has used. Each reply in a chat shows its own count when you hover it.</p>
 <div class="tiles">${tiles}</div>
 <div class="card"><div class="card-h"><h3>Daily cost, last 30 days</h3><span class="r faint small">Hover a bar for details</span></div>
  <div class="chart"><div class="gl" style="top:0"><span>${fmtUSD(top)}</span></div><div class="gl" style="top:50%"><span>${fmtUSD(top/2)}</span></div><div class="bars">${bars}</div></div>
  <div class="xl"><span>${fmtDate(days[0].d,{month:'short',day:'numeric'})}</span><span>${fmtDate(days[15].d,{month:'short',day:'numeric'})}</span><span>Today</span></div>
  <details style="margin-top:12px"><summary>Show as a table</summary><table class="utab" style="margin-top:8px"><tr><th>Day</th><th class="num">Tokens</th><th class="num">Calls</th><th class="num">Cost</th></tr>${[...days].reverse().map(x=>`<tr><td>${fmtDate(x.d)}</td><td class="num">${fmtTok(x.in+x.out)}</td><td class="num">${x.n}</td><td class="num">${fmtUSD(x.cost)}</td></tr>`).join('')}</table></details>
 </div>
 <div class="card">
  ${fld('Monthly budget','Shows a warning when this month reaches 80%. Set 0 for no budget.',`<input type="number" min="0" step="1" class="inp" style="width:110px" data-set="budget" value="${bud||0}">`)}
  <div class="meter"><i style="width:${Math.min(100,pct*100).toFixed(1)}%;background:${mcol}"></i></div>
  <div class="mstat" style="color:${pct>=.8?mcol:'var(--muted)'}">${mtxt}</div>
 </div>
 <div class="grid2">
  <section class="card"><div class="card-h"><h3>This month by model</h3></div><table class="utab"><tr><th>Model</th><th class="num">In</th><th class="num">Out</th><th class="num">Cost</th></tr>${byModel.map(x=>`<tr><td>${esc(x.name)}</td><td class="num">${fmtTok(x.in)}</td><td class="num">${fmtTok(x.out)}</td><td class="num">${fmtUSD(x.cost)}</td></tr>`).join('')||'<tr><td colspan="4" class="faint">Nothing yet.</td></tr>'}</table></section>
  <section class="card"><div class="card-h"><h3>This month by bucket</h3></div><table class="utab"><tr><th>Bucket</th><th style="width:30%"></th><th class="num">Cost</th></tr>${byBucket.map(x=>`<tr><td><span class="chip">${bmark(x.b)}${esc(x.b.name)}</span></td><td><div class="share" style="width:${(x.cost/tot*100).toFixed(0)}%"></div></td><td class="num">${fmtUSD(x.cost)}</td></tr>`).join('')||'<tr><td colspan="3" class="faint">Nothing yet.</td></tr>'}</table></section>
 </div>
 <p class="fhelp">Prices per million tokens: Opus 5.5 $4 in / $20 out, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50. Counts come from each reply, including cached input, which costs less. Replies through Claude Code or Codex show tokens only, since your plan covers them. Replies made by offline rules cost nothing and aren't counted.</p>`;
}

/* ---------- settings ---------- */
const STABS=[['general','General'],['usage','Usage'],['instructions','Instructions'],['memories','Memories'],['prompts','Saved prompts'],['buckets','Buckets'],['data','Data']];
const fld=(label,help,control,stack)=>`<div class="field ${stack?'stack':''}"><div><div class="flabel">${label}</div>${help?`<div class="fhelp">${help}</div>`:''}</div>${control?`<div>${control}</div>`:''}</div>`;
const seg=(key,val,opts)=>`<div class="seg">${opts.map(([v,l])=>`<button class="${val===v?'on':''}" data-act="seg" data-key="${key}" data-val="${v}">${l}</button>`).join('')}</div>`;
const tog=key=>`<button class="tog ${S.settings[key]?'on':''}" data-act="tog" data-key="${key}" role="switch" aria-checked="${!!S.settings[key]}" title="${S.settings[key]?'On':'Off'}"></button>`;
function buildPrompt(){
 const st=S.settings,L=[`You are tracko, a personal tracker in a desktop app. The user sends quick one-liners, messy paragraphs, screenshots or questions.

How to handle a message:
- Split it into items and save them with file_items. A task is something to do, a note is something to remember, a log is something the user already did. Keep the user's wording, names and ticket numbers. One short line per item. A screenshot usually becomes notes or tasks taken from what it shows.
- Give a task a reminder only when the user mentions a day or time. A day without a time means ${st.remindTime}. "End of day" means ${st.eodTime}.
- Every chat belongs to one bucket. When the chat is still in Inbox: ${{more:'call move_chat only when one bucket is an obvious match, otherwise call ask_bucket',balanced:'call move_chat when one bucket clearly fits better than the others, otherwise call ask_bucket',less:'call move_chat with the best match, and use ask_bucket only when two buckets fit equally well'}[st.sorting]}. If nothing fits, call ask_bucket with a suggested new_bucket name. Never create a bucket unless the user asks for it.${st.autoMemory?'\n- When the user states a lasting fact or preference about themselves, call save_memory instead of saving a note.':''}
- For questions about their history, call search_history, then answer briefly and call show_items with the matching ids.
- When the user corrects something already saved (a wrong day or time, wording, or says it's done), call update_items on that item. Never save a second copy. The ids are in the [Saved: ...] notes in earlier replies.
- After using tools, reply in one or two plain sentences. Don't list the saved items, the app shows them. No markdown headings.`];
 if(st.about.trim())L.push('','# About the user',st.about.trim());
 if(st.instructions.trim())L.push('','# How to work',st.instructions.trim());
 if(S.memories.length)L.push('','# Memories',...S.memories.map(m=>'- '+m.text));
 L.push('','# Buckets (id: name)',...S.buckets.filter(b=>!b.archived).map(b=>`- ${b.id}: ${b.name}. ${b.about}${b.instructions?`\n  Instructions: ${b.instructions}`:''}${b.kw.length?`\n  Sorting hints: ${b.kw.join(', ')}`:''}`));
 L.push('','# Settings',`- When unsure about a bucket: ${{more:'ask the user unless one bucket is obvious',balanced:'move when one bucket clearly wins, otherwise ask',less:'pick the best match, only ask on a tie'}[st.sorting]}`,`- Default reminder time ${st.remindTime}, end of day ${st.eodTime}`);
 return L.join('\n');
}
function setGeneral(){
 const st=S.settings;
 const act=activeProvider(),r=ready();
 const badge={ready:['ok','Connected'],signedOut:['','Not signed in'],missing:['','Not installed'],checking:['','Checking...'],error:['bad','Not working'],unknown:['','Not checked']};
 const rows=PROVIDERS.map(p=>{
  const s0=p.state,[cls,label]=badge[s0.status]||badge.unknown,inUse=s0.status==='ready'&&p.id===act;
  let body='';
  if(s0.status==='ready')body=`<div class="fhelp">${esc(s0.account||'')}${s0.path&&p.id!=='claude-api'?` <span class="faint">· ${esc(s0.path)}</span>`:''}</div>`
   +`<div class="crow2">${r.length>1&&!inUse?`<button class="btn" data-act="puse" data-p="${p.id}">Use for replies</button>`:''}${p.id==='claude-api'&&s0.source!=='env'?`<button class="btn" data-act="clearkey">Remove key</button>`:`<button class="btn" data-act="pcheck" data-p="${p.id}">Check again</button>`}</div>`;
  else if(s0.status==='checking')body='';
  else if(p.id==='claude-api')body=bridge.inApp?`<div class="fhelp" style="margin-top:6px">${p.setup.signedOut}</div><div class="addrow" style="margin-top:8px"><input class="inp" id="keyin" type="password" placeholder="sk-ant-..." autocomplete="off"><button class="btn pri big" data-act="savekey">Save key</button></div>`:'<div class="fhelp" style="margin-top:6px">Only in the desktop app.</div>';
  else{
   const hint=s0.status==='error'?`Couldn't use it: ${esc(s0.error)}`:(p.setup[s0.status]||'');
   body=`<div class="fhelp" style="margin-top:6px">${hint}</div><div class="addrow" style="margin-top:8px">`
    +(s0.status==='signedOut'&&p.signIn?`<button class="btn pri big" data-act="psignin" data-p="${p.id}">Sign in</button>`:'')
    +(s0.status!=='signedOut'?`<input class="inp" id="path-${p.id}" placeholder="Path to ${p.id==='claude-code'?'claude':'codex'} (optional)" value="${esc(S.settings.paths[p.id]||'')}">`:'')
    +`<button class="btn big" data-act="pcheck" data-p="${p.id}">Check again</button></div>`;
  }
  return `<div class="conn"><div class="conn-h"><div><div class="flabel">${esc(p.name)}</div><div class="fhelp">${p.how}</div></div><span class="cstat ${cls}">${cls==='ok'?ico('check'):''}${inUse?'In use':label}</span></div>${body}</div>`;
 }).join('');
 return `<p class="lead">How tracko thinks, and when it nudges you.</p>
 <div class="sh" style="margin-top:0">Connections</div>
 <div class="card">${rows}
  ${!r.length&&bridge.inApp?`<div class="fhelp" style="margin-top:10px">With nothing connected, tracko sorts messages with simple offline rules.</div>`:''}
 </div>
 <div class="card">
 ${fld('Model','Used for sorting, replies and recaps. The chat box has the same picker.',modelPicker('inp ddw'))}
 ${fld('Effort','How long the model thinks before replying. Low is quickest and fine for everyday notes. Higher helps with long recaps.',dd('effort',currentEffort(),esc(effortLabel(currentEffort())),'inp ddw'))}
 ${fld('When a chat could fit more than one bucket',{more:'tracko asks unless one bucket is an obvious match.',balanced:'tracko moves the chat when one bucket clearly wins, and asks otherwise.',less:'tracko picks the best match and only asks on a tie. You can always move a chat yourself.'}[st.sorting],seg('sorting',st.sorting,[['more','Ask me more'],['balanced','Balanced'],['less','Ask me less']]))}
 </div>
 <div class="sh">Appearance</div>
 <div class="card">
 ${fld('Theme','',seg('theme',themePref(),[['dark','Dark'],['light','Light'],['system','System']]))}
 ${fld('Accent color','Buttons, highlights, the heatmap and the app mark. Pick a preset or any color.',accentCtl())}
 ${fld('Chat width','Compact reads like a column. Full uses the whole window. The button in the chat header switches it too.',seg('chatWidth',st.chatWidth,[['compact','Compact'],['wide','Wide'],['full','Full']]))}
 ${fld('Sidebar width','Drag the edge of the sidebar to resize it. Double-click the edge to reset.',`<button class="btn big" data-act="resetlayout">Reset layout</button>`)}
 </div>
 <div class="sh">Reminders</div>
 <div class="card">
 ${fld('Default reminder time','Used when you say "tomorrow" or a day without a time.',`<input type="time" class="inp" data-set="remindTime" value="${esc(st.remindTime)}">`)}
 ${fld('End of day','Used when you say "eod".',`<input type="time" class="inp" data-set="eodTime" value="${esc(st.eodTime)}">`)}
 ${fld('Reminder pop-ups','Show a card in the corner when a reminder is due.',tog('popups'))}
 ${fld('Morning recap','Show what you did yesterday when you open the app. On Mondays it shows last Friday.',tog('recap'))}
 </div>`;
}
function setInstr(){
 const st=S.settings;
 return `<p class="lead">tracko reads this before every chat. Write it the way you'd brief a new teammate.</p>
 <div class="card">
 ${fld('About you','Your role, your projects, the people you work with.',`<textarea class="inp" rows="4" data-set="about" placeholder="I'm a developer on...">${esc(st.about)}</textarea>`,true)}
 ${fld('How tracko should work','Rules for every chat. Tone, format, what to keep and what to skip.',`<textarea class="inp" rows="5" data-set="instructions" placeholder="Keep replies short...">${esc(st.instructions)}</textarea>`,true)}
 </div>
 <p class="fhelp" style="margin:-4px 2px 16px">Each bucket can have its own instructions too. <button class="chip" style="color:var(--accent)" data-act="stab" data-tab="buckets">Edit bucket instructions</button></p>
 <div class="card"><details><summary>Preview what the assistant sees before each chat</summary><pre class="prev" id="prevp">${esc(buildPrompt())}</pre></details></div>`;
}
function setMem(){
 return `<p class="lead">Facts about you that tracko keeps across every chat. Edit or delete anything.</p>
 <div class="card">${fld('Save memories from chats','When you say things like "I prefer..." or "my manager is...", tracko saves it here and tells you in the chat.',tog('autoMemory'))}</div>
 <div class="card">
  <div class="addrow"><input class="inp" id="newmem" placeholder="Add a memory, e.g. I'm off every second Friday"><button class="btn pri big" data-act="addmem">Add</button></div>
  ${S.memories.length?S.memories.map(m=>`<div class="lrow"><span class="tp mem" style="margin-top:6px">Memory</span><div class="ibody"><input class="inp ghost" data-mf="${m.id}" value="${esc(m.text)}">
   <div class="meta" style="margin:2px 6px 0"><span>${m.source==='chat'?'Saved from a chat':'Added by you'} · ${fmtWhen(m.ts)}</span>${m.thread&&TH(m.thread)?`<button class="chip" data-act="thread" data-t="${m.thread}">${ico('chat')}open chat</button>`:''}</div></div>
   <button class="ib" data-act="delmem" data-id="${m.id}" title="Delete">${ico('trash')}</button></div>`).join(''):empty('No memories yet.')}
 </div>`;
}
function setPrompts(){
 return `<p class="lead">Shortcuts for things you ask often. Type / in any chat to use one. They also show on the new chat screen.</p>
 <div class="card">${S.prompts.map(p=>`<div class="lrow"><div class="ibody"><div style="display:flex;align-items:center;gap:2px;margin-bottom:6px"><span class="faint">/</span><input class="inp ghost" data-pf="${p.id}:name" value="${esc(p.name)}" style="font-weight:600;max-width:240px"></div>
  <textarea class="inp" rows="2" data-pf="${p.id}:text" placeholder="What should this prompt ask?">${esc(p.text)}</textarea></div><button class="ib" data-act="delprompt" data-id="${p.id}" title="Delete">${ico('trash')}</button></div>`).join('')||empty('No saved prompts.')}
  <button class="btn" data-act="addprompt" style="margin-top:10px">${ico('plus')}Add prompt</button></div>`;
}
function setBuckets(){
 return `<p class="lead">Name, color, and how tracko handles each bucket. Sorting hints are words that mean a message belongs there.</p>
 <div style="margin-bottom:12px"><button class="btn pri big" data-act="addbucket">${ico('plus')}New bucket</button></div>
 ${S.buckets.map(b=>{const open=ui.sbucket===b.id,nc=S.threads.filter(t=>t.bucket===b.id).length,ni=S.items.filter(i=>i.bucket===b.id).length,inbox=b.id==='inbox';
 return `<div class="bset"><button class="bset-h" data-act="sbucket" data-b="${b.id}">${bmark(b)}<b>${esc(b.name)}</b>${b.archived?'<span class="pendtag">Archived</span>':''}<span class="faint small">${nc} chat${pl(nc)} · ${ni} item${pl(ni)}</span><span class="chev ${open?'open':''}">${ico('chev')}</span></button>
 ${open?`<div class="bset-b">
  ${inbox?fld('Inbox','Holds chats tracko could not place. It cannot be renamed or deleted.','',true):fld('Name','',`<input class="inp" data-bf="${b.id}:name" value="${esc(b.name)}">`,true)}
  ${fld('Color','',`<div class="sw">${SWATCH.map(c=>`<button class="${b.color===c?'on':''}" style="background:${c}" data-act="bcolor" data-b="${b.id}" data-c="${c}"></button>`).join('')}<span class="swsep"></span><input type="color" data-bcolor="${b.id}" value="${b.color}" title="Pick any color"></div>`,true)}
  ${fld('What this bucket is for','tracko keeps this summary up to date. You can rewrite it.',`<textarea class="inp" rows="2" data-bf="${b.id}:about">${esc(b.about)}</textarea>`,true)}
  ${inbox?'':fld('Instructions for this bucket','Added to every chat in this bucket.',`<textarea class="inp" rows="3" data-bf="${b.id}:instructions" placeholder="e.g. Group my week by ticket for timesheets">${esc(b.instructions||'')}</textarea>`,true)}
  ${inbox?'':fld('Sorting hints','Comma separated. tracko adds to these as it learns.',`<input class="inp" data-bf="${b.id}:kw" value="${esc(b.kw.join(', '))}">`,true)}
  ${inbox?'':`<div style="display:flex;gap:8px;margin-top:8px"><button class="btn" data-act="bucket" data-b="${b.id}">Open bucket</button><button class="btn" data-act="${b.archived?'brestore':'barchive'}" data-b="${b.id}">${ico(b.archived?'reset':'archive')}${b.archived?'Restore':'Archive'}</button><button class="btn danger" data-act="delbucket" data-b="${b.id}">${ico('trash')}Delete bucket</button></div>`}
 </div>`:''}</div>`}).join('')}`;
}
function setData(){
 return `<p class="lead">${bridge.inApp?'Everything is saved in one file on this computer, in the app data folder. Nothing is uploaded except the messages sent to your AI provider.':'Running in a browser, so data is kept in this browser only.'}</p>
 <div class="card">
 ${fld('Export','Save all chats, items, buckets, memories and settings as one JSON file in your Downloads folder.',`<button class="btn big" data-act="export">Save backup</button>`)}
 ${fld('Import','Replace everything here with a backup file.',`<button class="btn big" data-act="import">Choose file</button>`)}
 </div>
 <div class="card">
 ${fld('Load demo data','Replace everything with sample chats and history, to try things out.',`<button class="btn big" data-act="reset">Load demo</button>`)}
 ${fld('Start empty','Delete all chats, items, buckets and memories. Settings and saved prompts stay.',`<button class="btn big danger" data-act="wipe">Delete everything</button>`)}
 </div>
 <p class="fhelp">${S.threads.length} chats · ${S.items.length} items · ${S.buckets.length} buckets · ${S.memories.length} memories · about ${Math.max(1,Math.round(JSON.stringify(S).length/1024))} KB</p>`;
}
function settingsView(){
 const tab=STABS.find(t=>t[0]===ui.stab)||STABS[0];
 const body={usage:setUsage,general:setGeneral,instructions:setInstr,memories:setMem,prompts:setPrompts,buckets:setBuckets,data:setData}[tab[0]]();
 return `<nav class="setnav"><div class="sttl">${ico('gear')}Settings</div>${STABS.map(([k,v])=>`<button class="nav ${tab[0]===k?'on':''}" data-act="stab" data-tab="${k}">${v}${k==='memories'?`<span class="count">${S.memories.length}</span>`:k==='prompts'?`<span class="count">${S.prompts.length}</span>`:''}</button>`).join('')}</nav>
 <div class="setmain"><div class="seth" data-tauri-drag-region><h2>${tab[1]}</h2><button class="ib" data-act="closeset" title="Close (Esc)">${ico('x')}</button></div><div class="setb" id="setb"><div class="sbody">${body}</div></div></div>`;
}
function renderSettings(top){
 if(!ui.setOpen)return;
 const b=$('#setb'),y=top??(b?b.scrollTop:0);
 $('#setdlg').innerHTML=settingsView();
 $('#setb').scrollTop=y;
}
function openSettings(tab){closeSearch();closeMenu();if(tab)ui.stab=tab;ui.setOpen=true;$('#setm').classList.add('on');renderSettings(0);renderSide()}
function closeSettings(){ui.setOpen=false;$('#setm').classList.remove('on');$('#setdlg').innerHTML='';refresh()}
function themePref(){try{return localStorage.getItem('tracko-theme')||'dark'}catch(e){return 'dark'}}
function applyTheme(pref){
 try{localStorage.setItem('tracko-theme',pref)}catch(e){}
 document.documentElement.dataset.theme=pref==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):pref;
 applyAccent();
}
const hexRgb=h=>{const n=parseInt(h.slice(1),16);return[n>>16&255,n>>8&255,n&255]};
const rgbHex=a=>'#'+a.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
function lum(h){const c=hexRgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]}
// Accent comes from settings. Light theme gets a darker shade so text on white stays readable.
function applyAccent(){
 const st=document.documentElement.style,a=S&&S.settings&&S.settings.accent;
 if(!a||!/^#[0-9a-f]{6}$/i.test(a)){st.removeProperty('--accent');st.removeProperty('--accent-ink');return}
 let c=a;
 if(document.documentElement.dataset.theme==='light'){let k=0;while(lum(c)>.2&&k<8){c=rgbHex(hexRgb(c).map(v=>v*.86));k++}}
 st.setProperty('--accent',c);st.setProperty('--accent-ink',lum(c)>.18?'#0b0f12':'#ffffff');
}
function accentCtl(){
 const cur=(S.settings.accent||ACCENT0).toLowerCase();
 return `<div class="sw">${ACCENTS.map(([c,n])=>`<button class="${cur===c?'on':''}" style="background:${c}" data-act="accent" data-c="${c}" title="${n}"></button>`).join('')}<span class="swsep"></span><input type="color" data-accent value="${cur}" title="Pick any color"></div>`;
}
// ---------- updates ----------
// GitHub repo whose latest release the update check compares against. Forks can point this at their own repo or blank it to turn checks off.
const UPDATE_REPO='akhshyganesh/tracko';
const upd={current:'',latest:null,url:null,checked:0};
const verGt=(a,b)=>{const x=a.replace(/^v/,'').split('.').map(Number),y=b.replace(/^v/,'').split('.').map(Number);for(let i=0;i<3;i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0)}return false};
async function checkUpdate(manual){
 if(!upd.current)upd.current=await bridge.appVersion();
 if(!UPDATE_REPO){if(manual)flashMsg(`You're on tracko v${upd.current}. Update checks start once the project has a GitHub repo.`);return}
 try{
  const r=await bridge.latestRelease(UPDATE_REPO);upd.checked=Date.now();
  if(r&&verGt(r.tag,upd.current)){upd.latest=r.tag.replace(/^v/,'');upd.url=r.url}else{upd.latest=null}
  renderSide();
  if(manual)flashMsg(upd.latest?`tracko v${upd.latest} is available`:`You're up to date (v${upd.current})`,upd.latest?{label:'Download',fn:()=>bridge.openLink(upd.url)}:null);
 }catch(e){if(manual)flashMsg("Couldn't check for updates: "+(e?.message||e))}
}
function renderTopbar(){
 const t=$('#topbar');if(!t)return;
 const wc=bridge.inApp&&!bridge.isMac;
 t.innerHTML=`<button class="tb ${prefs.sideOff?'':'on'}" data-act="sidebar" title="${prefs.sideOff?'Show':'Hide'} sidebar (Ctrl+B)">${ico('pleft')}</button>`
  +`<button class="tb ${prefs.rOpen?'on':''}" data-act="panel" title="Focus: today's list and reminders (Ctrl+.)">${ico('focus')}</button>`
  +(wc?`<span class="tbsep"></span><button class="wbtn" data-act="wmin" title="Minimize"><svg viewBox="0 0 12 12"><path d="M3 6h6"/></svg></button><button class="wbtn" data-act="wmax" title="Maximize"><svg viewBox="0 0 12 12"><rect x="3" y="3" width="6" height="6" rx="1"/></svg></button><button class="wbtn wx" data-act="wclose" title="Close"><svg viewBox="0 0 12 12"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5"/></svg></button>`:'');
}
function applyLayout(){
 const a=$('#app');if(!a)return;
 renderTopbar();
 a.style.setProperty('--sw',(prefs.sideOff?0:prefs.sw)+'px');a.style.setProperty('--rw',prefs.rw+'px');
 a.classList.toggle('sideoff',!!prefs.sideOff);
 a.classList.toggle('ropen',!!prefs.rOpen);
 ['compact','wide','full'].forEach(w=>a.classList.toggle('cw-'+w,S.settings.chatWidth===w));
}
const panelBtn=()=>''; // the Focus toggle lives in the top-right toolbar now
function ctxBucket(){
 if(ui.view==='chat'){const th=TH(ui.thread);if(th&&th.bucket!=='inbox')return th.bucket;return ui.newBucket||null}
 if(ui.view==='bucket')return ui.bucket;
 return null;
}
// Focus card: date + progress, a week of activity, the one thing to do next, then tabs.
function prow(it){
 const due=it.remindAt&&!it.done&&it.remindAt<=Date.now(),b=B(it.bucket),planned=it.type==='task'&&it.today===todayKey();
 const lead=it.type==='task'?`<button class="pchk ${it.done?'on':''}" data-act="toggle" data-id="${it.id}" title="${it.done?'Mark open':'Mark done'}">${it.done?ico('check'):''}</button>`:`<span class="tp ${it.type}">${it.type==='log'?'Done':'Note'}</span>`;
 return `<div class="prow ${it.done?'done':''}" data-id="${it.id}">${lead}<div class="pbody"><div class="ptext">${esc(it.text)}</div>
  <div class="pmeta">${bmark(b)}${esc(b.name)}${it.remindAt&&!it.done?`<button class="prem ${due?'due':''}" data-act="remmenu" data-id="${it.id}">${ico('bell')}${fmtRemind(it.remindAt)}</button>`:''}</div></div>
  ${it.type==='task'&&!it.done?`<button class="ib ${planned?'sunon':''}" data-act="today" data-id="${it.id}" title="${planned?'Remove from today':'Add to today'}">${ico('sun')}</button>`:''}</div>`;
}
function panelHTML(){
 const tk=todayKey(),now=Date.now(),t=sod(now);
 const list=S.items.filter(i=>i.type==='task'&&i.today===tk&&live(i)).sort((a,b)=>(a.done-b.done)||(a.remindAt||9e15)-(b.remindAt||9e15)||a.ts-b.ts);
 const left=S.items.filter(i=>i.type==='task'&&!i.done&&i.today&&i.today<tk&&live(i));
 const up=S.items.filter(i=>i.remindAt&&!i.done&&live(i)&&i.today!==tk).sort((a,b)=>a.remindAt-b.remindAt);
 const th=ui.view==='chat'?TH(ui.thread):null,cb=ctxBucket();
 const chat=th?S.items.filter(i=>i.thread===th.id).sort((a,b)=>((a.type==='task'&&!a.done)?0:1)-((b.type==='task'&&!b.done)?0:1)||b.ts-a.ts):[];
 const dn=list.filter(i=>i.done).length,tot=list.length;
 // the one thing to do next: overdue first, then the soonest reminder today, then today's list
 const openAll=S.items.filter(i=>i.type==='task'&&!i.done&&live(i));
 const next=openAll.filter(i=>i.remindAt&&i.remindAt<+addDays(t,1)).sort((a,b)=>a.remindAt-b.remindAt)[0]||list.find(i=>!i.done)||null;
 // last 7 days of activity
 const days=[...Array(7)].map((_,k)=>{const d=addDays(t,k-6);return {d,n:itemsIn(d,addDays(d,1)).length}});
 const mx=Math.max(1,...days.map(x=>x.n));
 const r=15,c=2*Math.PI*r,p=tot?dn/tot:0;
 const tab=ui.ptab==='chat'&&!th?'today':ui.ptab||'today';
 const tabs=[['today',"Today",list.filter(i=>!i.done).length],['up','Upcoming',up.length],...(th?[['chat','This chat',chat.length]]:[])];
 const body=tab==='up'?(up.slice(0,20).map(prow).join('')||`<div class="pempty">${ico('bell')}No reminders coming up.</div>`)
  :tab==='chat'?(chat.slice(0,20).map(prow).join('')||`<div class="pempty">${ico('chat')}Nothing saved from this chat yet.</div>`)
  :(left.length?`<button class="carry" data-act="carry">${ico('reset')}${left.length} left from before. Bring ${left.length===1?'it':'them'} over</button>`:'')
   +(list.map(prow).join('')||`<div class="pempty">${ico('sun')}Nothing planned yet. Add one below, or tap the sun on any task.</div>`);
 return `<button class="ib fx-x" data-act="panel" title="Close Focus (Ctrl+.)">${ico('x')}</button><div class="fx-h" data-tauri-drag-region>
  <div class="fx-date" data-tauri-drag-region><div class="fx-day">${fmtDate(now,{weekday:'long'})}</div><div class="fx-sub">${fmtDate(now,{month:'long',day:'numeric'})}${tot?` · ${dn} of ${tot} done`:''}</div></div>
  <div class="fx-ring" title="${tot?`${dn} of ${tot} on today's list done`:'Nothing planned for today'}"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="${r}" class="trk"/><circle cx="20" cy="20" r="${r}" class="val" stroke-dasharray="${(c*p).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 20 20)"/></svg><span>${tot?Math.round(p*100)+'%':'–'}</span></div>
 </div>
 <div class="fx-week">${days.map(x=>`<div class="fx-col ${daysFromToday(+x.d)===0?'now':''}" title="${x.n} thing${pl(x.n)} on ${fmtDate(x.d)}"><i style="height:${Math.max(8,x.n/mx*100)}%"></i><span>${fmtDate(x.d,{weekday:'narrow'})}</span></div>`).join('')}</div>
 ${next?`<div class="fx-next"><div class="fx-lab">${ico('clock')}Next up${next.remindAt?` · <span class="${next.remindAt<now?'due':''}">${next.remindAt<now?'overdue':fmtRemind(next.remindAt)}</span>`:''}</div>
  <div class="fx-nt">${esc(next.text)}</div>
  <div class="fx-na"><button class="btn pri" data-act="finish" data-id="${next.id}">${ico('check')}Done</button>${next.remindAt?`<button class="btn" data-act="snooze" data-k="1h" data-id="${next.id}">1 hour</button><button class="btn" data-act="snooze" data-k="tomorrow" data-id="${next.id}">Tomorrow</button>`:''}</div></div>`:''}
 <div class="fx-tabs">${tabs.map(([k,l,n])=>`<button class="${tab===k?'on':''}" data-act="ptab" data-k="${k}">${l}${n?`<b>${n}</b>`:''}</button>`).join('')}</div>
 <div class="rp-b">${body}</div>
 <div class="fx-add">${ico('plus')}<input id="qadd" placeholder="Add a task for today${cb?' in '+esc(B(cb).name):''}..." autocomplete="off" title="Add &quot;friday 3pm&quot; for a reminder"></div>`;
}
function renderPanel(){
 const rp=$('#rp');if(!rp)return;
 if(!$('#app').classList.contains('ropen')){rp.innerHTML='';return}
 const q=$('#qadd'),val=q?q.value:'',foc=document.activeElement===q,top=$('#rp .rp-b')?.scrollTop||0;
 rp.innerHTML=panelHTML();
 const q2=$('#qadd');q2.value=val;if(foc)q2.focus();
 $('#rp .rp-b').scrollTop=top;
}
function quickAdd(text){
 const tag=text.match(/#([a-z][\w-]{1,30})/i),remindAt=parseWhen(text);
 S.items.push({id:uid(),type:'task',text:clean(text,!!remindAt),remindAt,bucket:tag?ensureBucket(tag[1]):ctxBucket()||'inbox',thread:null,ts:Date.now(),done:false,doneAt:null,today:todayKey()});
 save();refresh();
}
function updSlash(){
 const el=$('#slash');if(!el)return;
 const m=ui.draft.match(/^\/(\S*)$/);
 if(!m){el.hidden=true;ui.slash=null;return}
 const q=m[1].toLowerCase();ui.slash=S.prompts.filter(p=>p.name.toLowerCase().includes(q));
 if(!(ui.slashSel<ui.slash.length))ui.slashSel=0;
 el.hidden=false;
 el.innerHTML=ui.slash.length?ui.slash.map((p,i)=>`<button class="${i===ui.slashSel?'sel':''}" data-act="runprompt" data-id="${p.id}"><b>/${esc(p.name)}</b><span>${esc(p.text)}</span></button>`).join('')
  :`<div class="empty" style="padding:8px 10px">No saved prompt called "${esc(q)}". <button class="chip" style="color:var(--accent)" data-act="settings" data-tab="prompts">Add one in Settings</button></div>`;
}

/* ---------- render ---------- */
function threadSideRow(t){
 if(ui.renaming===t.id&&ui.renameWhere!=='head')return `<div class="thrw"><input class="inp rn" data-rn="${t.id}" value="${esc(t.title)}"></div>`;
 return `<div class="thrw ${ui.view==='chat'&&ui.thread===t.id?'on':''}" data-tctx="${t.id}"><button class="nav thr" data-act="thread" data-t="${t.id}">${t.pinned?`<span class="pin" title="Pinned">${ico('pin')}</span>`:''}<span class="nm">${esc(t.title)}</span>${pending(t)?'<span class="pend" title="Needs a bucket"></span>':''}</button><button class="ib tmore" data-act="tmenu" data-t="${t.id}" data-w="side" title="Chat options">${ico('dots')}</button></div>`;
}
function renderSide(){
 const now=Date.now(),due=S.items.filter(i=>i.remindAt&&!i.done&&i.remindAt<=now&&live(i)).length;
 const dark=document.documentElement.dataset.theme==='dark',narch=S.threads.filter(t=>t.archived).length+S.buckets.filter(b=>b.archived).length;
 const groups=activeBuckets().map(b=>{
  const ts=threadsOf(b.id),open=S.items.filter(i=>i.bucket===b.id&&i.type==='task'&&!i.done).length;
  if(b.id==='inbox'&&!ts.length)return '';
  const col=ui.collapsed.has(b.id),onB=ui.view==='bucket'&&ui.bucket===b.id;
  const list=col?'':ts.slice(0,5).map(threadSideRow).join('')
   +(ts.length>5?`<button class="nav thr more" data-act="bucket" data-b="${b.id}">${ts.length-5} more</button>`:'');
  return `<div class="bgrp"><div class="brow ${onB?'on':''}" data-bctx="${b.id}"><button class="chev ${col?'':'open'}" data-act="collapse" data-b="${b.id}" title="${col?'Show':'Hide'} chats">${ico('chev')}</button>
   <button class="nav" data-act="bucket" data-b="${b.id}">${bmark(b)}<span class="nm">${esc(b.name)}</span><span class="count">${b.id==='inbox'?ts.length:open||''}</span></button>
   <button class="ib bmore" data-act="bmenu" data-b="${b.id}" title="Bucket options">${ico('dots')}</button><button class="ib addc" data-act="newchat" data-b="${b.id}" title="New chat in ${esc(b.name)}">${ico('plus')}</button></div>${list}</div>`;
 }).join('');
 $('#side').innerHTML=`<div class="macgap" data-tauri-drag-region></div><div class="brand" data-tauri-drag-region><span class="logo">${MARK}</span>tracko</div>
 <div class="navrow ${ui.view==='today'?'on':''}"><button class="nav" data-act="nav" data-view="today">${ico('cal')} Today${due?`<span class="badge">${due}</span>`:''}</button>
  <button class="ib" data-act="search" title="Search (${bridge.isMac?'⌘':'Ctrl+'}K)">${ico('search')}</button><button class="ib" data-act="newchat" data-b="" title="New chat">${ico('edit')}</button><button class="ib" data-act="addbucket" title="New bucket">${ico('folderplus')}</button></div>
 <div class="bgap"></div>
 ${groups}
 <div class="foot">${narch?`<button class="nav ${ui.view==='archive'?'on':''}" data-act="nav" data-view="archive">${ico('archive')} Archived<span class="count">${narch}</span></button>`:''}
  <div class="footrow"><button class="nav ${ui.setOpen?'on':''}" data-act="settings" data-tab="general">${ico('gear')} Settings</button>
  <button class="ib" data-act="theme" title="${dark?'Light':'Dark'} mode">${ico(dark?'sun':'moon')}</button>
  <button class="ib upd ${upd.latest?'has':''}" data-act="update" title="${upd.latest?`Update available: v${esc(upd.latest)}`:`tracko v${esc(upd.current||'')}. Check for updates`}">${ico('download')}</button></div>
 </div>`;
}
function renderStream(toBottom){
 const st=$('#stream');if(!st)return;
 const top=st.scrollTop;st.innerHTML=streamHTML();
 st.scrollTop=toBottom?st.scrollHeight:top;
 renderRail();renderNudges();
}
// Left-edge rail: a dash per message you sent. Hover to preview, click to jump.
function renderRail(){
 const el=$('#rail'),th=TH(ui.thread);if(!el)return;
 const us=th?th.msgs.filter(m=>m.role==='user'):[];
 if(us.length<2){el.innerHTML='';el.hidden=true;return}
 el.hidden=false;
 el.innerHTML=us.slice(-60).map(m=>{const t=(m.prompt?'/'+m.prompt+(m.promptArgs?' '+m.promptArgs:''):m.text||'Screenshot').replace(/\s+/g,' ');
  return `<button class="dash" data-act="jump" data-msg="${m.id}" data-tip="${esc(t.length>90?t.slice(0,90)+'…':t)}"></button>`}).join('');
 markRail();
}
function markRail(){
 const st=$('#stream'),el=$('#rail');if(!st||!el||el.hidden)return;
 const top=st.getBoundingClientRect().top+40;let cur=null;
 st.querySelectorAll('.msg.user').forEach(n=>{if(n.getBoundingClientRect().top<=top+st.clientHeight/3)cur=n.dataset.mid});
 if(!cur){const f=st.querySelector('.msg.user');cur=f&&f.dataset.mid}
 el.querySelectorAll('.dash').forEach(d=>d.classList.toggle('on',d.dataset.msg===cur));
}
// ---------- floating cards above the chat box ----------
function nudgeOff(k){return (prefs.dismissed||{})[k]===todayKey()}
function nudgesHTML(){
 const out=[],th=TH(ui.thread),now=Date.now();
 const card=(k,icon,title,sub,actions,dismiss=true)=>`<div class="nudge" data-k="${k}"><span class="nico">${ico(icon)}</span><div class="ntext"><div class="nt">${title}</div>${sub?`<div class="ns">${sub}</div>`:''}</div><div class="nacts">${actions}</div>${dismiss?`<button class="ib" data-act="ndismiss" data-k="${k}" title="Hide for today">${ico('x')}</button>`:''}</div>`;
 const ask=th&&!th.archived?[...th.msgs].reverse().find(m=>m.ask&&!m.resolved&&!m.undone):null;
 if(ask){
  const opts=(ask.ask||[]).filter(id=>S.buckets.some(b=>b.id===id&&!b.archived));
  activeBuckets().forEach(b=>{if(b.id!=='inbox'&&!opts.includes(b.id))opts.push(b.id)});
  out.push(card('ask','chat','Which bucket should this chat go in?','Everything in it moves together.',
   opts.slice(0,4).map(id=>{const b=B(id);return `<button class="btn" data-act="pick" data-msg="${ask.id}" data-b="${id}">${bmark(b)}${esc(b.name)}</button>`}).join('')
   +`<button class="btn" data-act="picknew" data-msg="${ask.id}" ${ask.askNew?`data-name="${esc(ask.askNew)}"`:''}>${ico('plus')}${ask.askNew?esc(ask.askNew):'New'}</button>`,false));
 }
 if(bridge.inApp&&!ready().length&&PROVIDERS.every(p=>p.state.status!=='checking'&&p.state.status!=='unknown')&&!nudgeOff('connect'))
  out.push(card('connect','gear','Connect an AI','Claude Code, Codex or an API key. Until then tracko uses simple offline rules.',`<button class="btn pri" data-act="settings" data-tab="general">Open connections</button>`));
 const due=S.items.filter(i=>i.remindAt&&!i.done&&i.remindAt<=now&&live(i)).length;
 if(due&&!nudgeOff('due'))out.push(card('due','bell',`${due} reminder${pl(due)} due`,'Finish, snooze or move them.',`<button class="btn" data-act="nav" data-view="today">Review</button>`));
 const syncP=S.prompts.find(p=>p.name==='sync'),ranSync=S.threads.some(t=>t.msgs.some(m=>m.prompt==='sync'&&daysFromToday(m.ts)===0));
 if(!th&&syncP&&new Date().getHours()<12&&!ranSync&&!nudgeOff('sync'))out.push(card('sync','sun','Start the day','See what is due, what is on your list, and what to do first.',`<button class="btn" data-act="runprompt" data-id="${syncP.id}">Run /sync</button>`));
 return out.slice(0,2).join('');
}
function renderNudges(){const el=$('#nudges');if(el)el.innerHTML=nudgesHTML()}
function renderMain(){
 const v=$('#view');
 if(ui.view==='chat'){
  v.innerHTML=chatView();
  const ta=$('#inp');if(ta){ta.value=ui.draft;autosize(ta);renderAttach();updSend()}
  const st=$('#stream');st.scrollTop=st.scrollHeight;st.addEventListener('scroll',markRail,{passive:true});renderRail();
  if(ta&&!ui.renaming&&matchMedia('(hover:hover)').matches)ta.focus();
 }else v.innerHTML=`<div class="scroll"><div class="page">${ui.view==='bucket'?bucketView():ui.view==='archive'?archiveView():todayView()}</div></div>`;
 document.querySelectorAll('.hm').forEach(h=>h.scrollLeft=h.scrollWidth);
}
function render(){applyLayout();renderSide();renderMain();renderPanel();focusRename()}
function refresh(){
 applyLayout();renderSide();
 if(ui.view==='chat'&&$('#stream')){$('#chead').innerHTML=headHTML();renderStream(false);const pk=$('#pickers');if(pk)pk.innerHTML=pickersHTML()}
 else{
  const sc=$('#view .scroll'),top=sc?sc.scrollTop:0,hl=[...document.querySelectorAll('.hm')].map(h=>h.scrollLeft);
  renderMain();
  const sc2=$('#view .scroll');if(sc2)sc2.scrollTop=top;
  document.querySelectorAll('.hm').forEach((h,i)=>{if(hl[i]!=null)h.scrollLeft=hl[i]});
 }
 renderPanel();focusRename();renderSettings();
 if(searchOpen)renderResults();
}
function go(view){if(ui.setOpen){ui.setOpen=false;$('#setm').classList.remove('on')}ui.view=view;ui.flash=null;$('#app').classList.remove('menu');render();const sc=$('#view .scroll');if(sc)sc.scrollTop=0}
function openThread(id){closeSearch();ui.thread=id;ui.newBucket=null;go('chat')}
function newChat(bid){ui.thread=null;ui.newBucket=bid||null;go('chat')}

/* ---------- composer ---------- */
function autosize(ta){ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,220)+'px'}
function updSend(){const b=$('#sendb');if(b)b.disabled=!ui.draft.trim()&&!ui.pendingImage}
function renderAttach(){const a=$('#att');if(a)a.innerHTML=ui.pendingImage?`<div class="attw"><img src="${ui.pendingImage}" alt=""><button class="ib" data-act="unattach" title="Remove">${ico('x')}</button></div>`:'';updSend()}
function readImage(f){
 if(!f||!f.type.startsWith('image/'))return;
 const r=new FileReader();
 r.onload=()=>{const img=new Image();img.onload=()=>{const sc=Math.min(1,900/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);c.getContext('2d').drawImage(img,0,0,c.width,c.height);ui.pendingImage=c.toDataURL('image/jpeg',.8);if(ui.view!=='chat')go('chat');renderAttach()};img.src=r.result};
 r.readAsDataURL(f);
}
function send(p=null,args=''){
 if(!p){const mm=/^\/(\S+)\s*(.*)$/s.exec(ui.draft.trim()),hit=mm&&S.prompts.find(x=>x.name.toLowerCase()===mm[1].toLowerCase());if(hit){p=hit;args=mm[2].trim()}}
 const text=p?p.text+(args?`\n\nFocus on: ${args}`:''):ui.draft.trim(),img=p?null:ui.pendingImage;
 if(!text&&!img)return;
 let th=TH(ui.thread);
 if(!th){const n=Date.now();th={id:uid(),bucket:ui.newBucket||'inbox',title:p?p.name[0].toUpperCase()+p.name.slice(1)+(args?' '+args:'')+', '+fmtDate(n):makeTitle(text||'Screenshot'),created:n,updated:n,msgs:[]};S.threads.push(th);ui.thread=th.id;ui.newBucket=null}
 th.msgs.push({id:uid(),role:'user',ts:Date.now(),text,image:img,prompt:p?p.name:null,promptArgs:args||null});th.updated=Date.now();ui.slash=null;
 ui.draft='';ui.pendingImage=null;ui.typing=th.id;render();save();
 setTimeout(async()=>{
  const m=await reply(th,text,img,Date.now(),{prompt:!!p,name:p?.name,args});ui.typing=null;trackUsage(th,m);th.msgs.push(m);th.updated=Date.now();save();
  if(m.moved)flashMsg('Moved this chat to '+B(m.moved).name);
  if(m.kind==='memory')flashMsg('Saved to memory');
  const nSaved=(m.filedIds||(m.kind==='filed'?m.itemIds:[])||[]).length;
  if(nSaved)flashMsg(`${m.moved?'Moved to '+B(m.moved).name+'. ':''}Saved ${nSaved} item${pl(nSaved)}`,{label:'Undo',fn:()=>{const ids=m.filedIds||m.itemIds||[];S.items=S.items.filter(i=>!ids.includes(i.id));m.undone=true;save();refresh()}});
  renderSide();renderPanel();if(ui.view==='chat'&&ui.thread===th.id){$('#chead').innerHTML=headHTML();renderStream(true)}
 },activeProvider()?0:500);
}

/* ---------- search ---------- */
function openSearch(){if(ui.setOpen)closeSettings();searchOpen=true;$('#search').classList.add('on');const i=$('#sq');i.value='';ui.sel=0;i.focus();renderResults()}
function closeSearch(){searchOpen=false;$('#search').classList.remove('on')}
function renderResults(){
 const q=$('#sq').value.trim().toLowerCase(),toks=q.split(/\s+/).filter(Boolean);
 const F={all:'All',chat:'Chats',task:'Open tasks',note:'Notes',log:'Done',remind:'Reminders'};
 const hit=s=>toks.every(t=>s.toLowerCase().includes(t));
 const ok=i=>ui.sf==='all'||(ui.sf==='task'?i.type==='task'&&!i.done:ui.sf==='note'?i.type==='note':ui.sf==='log'?(i.type==='log'||i.done):ui.sf==='remind'?(i.remindAt&&!i.done):false);
 const thr=(ui.sf==='all'||ui.sf==='chat')?S.threads.filter(t=>hit(t.title+' '+B(t.bucket).name+' '+t.msgs.filter(m=>m.role==='user').map(m=>m.text).join(' '))).sort((a,b)=>b.updated-a.updated).slice(0,ui.sf==='chat'?60:(toks.length?6:4)):[];
 const its=ui.sf==='chat'?[]:S.items.filter(i=>ok(i)&&hit(i.text+' '+B(i.bucket).name)).sort((a,b)=>evT(b)-evT(a)).slice(0,60);
 const res=[...thr.map(t=>({k:'t',t})),...its.map(i=>({k:'i',i}))];
 ui.res=res;if(ui.sel>=res.length)ui.sel=Math.max(0,res.length-1);
 const re=toks.length?new RegExp('('+toks.map(t=>reEsc(esc(t))).join('|')+')','gi'):null;
 const hl=s=>re?esc(s).replace(re,'<mark>$1</mark>'):esc(s);
 $('#sf').innerHTML=Object.entries(F).map(([k,v])=>`<button class="tab ${ui.sf===k?'on':''}" data-act="sf" data-f="${k}">${v}</button>`).join('');
 $('#sres').innerHTML=(q?'':`<div class="pal-lbl">Recent</div>`)+(res.length?res.map((r,ix)=>{
  if(r.k==='t'){const b=B(r.t.bucket);return `<button class="res ${ix===ui.sel?'sel':''}" data-act="result" data-ix="${ix}"><span class="tp chat">Chat</span><span class="rt">${hl(r.t.title)}</span><span class="chip small">${bmark(b)}${esc(b.name)}</span><span class="faint small">${fmtWhen(r.t.updated)}</span></button>`}
  const i=r.i,[c,l]=typeLabel(i),b=B(i.bucket);
  return `<button class="res ${ix===ui.sel?'sel':''}" data-act="result" data-ix="${ix}"><span class="tp ${c}">${l}</span><span class="rt">${hl(i.text)}</span><span class="chip small">${bmark(b)}${esc(b.name)}</span><span class="faint small">${fmtWhen(evT(i))}</span></button>`}).join(''):empty('No matches.'));
 const s=$('#sres .res.sel');if(s)s.scrollIntoView({block:'nearest'});
}
function openRes(r){
 if(!r)return;
 if(r.k==='t'){openThread(r.t.id);return}
 const it=r.i;closeSearch();ui.bucket=it.bucket;ui.tl=30;ui.day=dayKey(evT(it));ui.view='bucket';ui.flash=it.id;render();
 const el=document.querySelector(`.item[data-id="${it.id}"]`);if(el)el.scrollIntoView({block:'center'});
 setTimeout(()=>{ui.flash=null},1900);
}

/* ---------- toasts ---------- */
const toastQ=[],shown=new Set();let toastCur=null;
function checkReminders(){if(!S.settings.popups)return;const now=Date.now();S.items.filter(i=>i.remindAt&&!i.done&&i.remindAt<=now&&!shown.has(i.id)&&live(i)).forEach(i=>{shown.add(i.id);toastQ.push({kind:'remind',id:i.id});if(now-i.remindAt<36e5&&!document.hasFocus())bridge.notify('Reminder',i.text)});nextToast()}
function nextToast(){if(toastCur||!toastQ.length)return;toastCur=toastQ.shift();renderToast()}
function closeToast(){toastCur=null;$('#toast').innerHTML='';setTimeout(nextToast,500)}
function renderToast(){
 const t=toastCur,el=$('#toast');if(!t){el.innerHTML='';return}
 if(t.kind==='remind'){
  const it=S.items.find(i=>i.id===t.id);if(!it||it.done||!it.remindAt){closeToast();return}
  el.innerHTML=`<div class="toast"><div class="toast-h">${ico('bell')}Reminder<span class="faint">${fmtRemind(it.remindAt)}</span><button class="ib" data-act="tclose" title="Dismiss">${ico('x')}</button></div>
  <div class="toast-t">${esc(it.text)}</div><div class="meta">${chip(B(it.bucket))}</div>
  <div class="toast-a"><button class="btn pri" data-act="tdone" data-id="${it.id}">Done</button><button class="btn" data-act="tsnooze" data-k="1h" data-id="${it.id}">1 hour</button><button class="btn" data-act="tsnooze" data-k="tomorrow" data-id="${it.id}">Tomorrow</button></div></div>`;
 }else{
  const r=range(t.k),its=itemsIn(r.from,r.to),bs=S.buckets.filter(b=>its.some(i=>i.bucket===b.id));
  el.innerHTML=`<div class="toast"><div class="toast-h">${ico('clock')}${r.label}, quick recap<button class="ib" data-act="tclose" title="Dismiss">${ico('x')}</button></div>
  <div class="toast-t">You got through ${its.length} thing${pl(its.length)} across ${bs.length} bucket${pl(bs.length)}.</div>
  <div class="recap">${bs.map(b=>{const g=its.filter(i=>i.bucket===b.id);return `<div>${bmark(b)}<span class="t">${esc(g[0].text)}${g.length>1?` <span class="faint">+${g.length-1}</span>`:''}</span></div>`}).join('')}</div>
  <div class="toast-a"><button class="btn pri" data-act="trecall" data-k="${t.k}">Show me</button><button class="btn" data-act="tclose">Later</button></div></div>`;
 }
}
function snoozeTime(k){const now=new Date(),tm=+atT(addDays(now,1),'remindTime');if(k==='1h')return +now+36e5;if(k==='tonight'){const t=at(now,20);return t>now?+t:tm}return tm}

/* ---------- misc ---------- */
let flashT;
function flashMsg(m,act){
 const f=$('#flash');f.textContent=m;f.style.pointerEvents=act?'auto':'none';
 if(act){const b=document.createElement('button');b.textContent=act.label;b.onclick=()=>{act.fn();f.classList.remove('on')};f.appendChild(b)}
 f.classList.add('on');clearTimeout(flashT);flashT=setTimeout(()=>f.classList.remove('on'),act?5000:2200);
}
function copyItems(title,items){
 const lines=[title];
 for(const b of S.buckets){const g=items.filter(i=>i.bucket===b.id);if(!g.length)continue;lines.push('',b.name,...g.map(i=>'- '+i.text+(i.type==='task'&&!i.done?' (open)':'')))}
 const txt=lines.join('\n'),ok=()=>flashMsg('Copied. Paste it into standup or your timesheet.');
 const fallback=()=>{const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');ok()}catch(e){flashMsg('The browser blocked copying.')}ta.remove()};
 if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(txt).then(ok,fallback);else fallback();
}
// New bucket window: name, color, and what it's for. onDone(id) runs after it's created.
let newBucketDone=null,newBucketColor=null;
function openNewBucket(onDone,suggest=''){
 newBucketDone=onDone;newBucketColor=SWATCH[S.buckets.length%SWATCH.length];
 openModal(`<h3>New bucket</h3><p>A place for one area of your life or work. tracko files chats and items here.</p>
  <label class="mlab">Name</label><input class="inp" id="nbname" placeholder="e.g. Work, Health, Side project" value="${esc(suggest)}" maxlength="40" autocomplete="off">
  <label class="mlab">Color</label><div class="sw" id="nbsw">${SWATCH.map(c=>`<button class="${c===newBucketColor?'on':''}" style="background:${c}" data-act="nbcolor" data-c="${c}"></button>`).join('')}</div>
  <label class="mlab">What it's for <span class="faint">(optional)</span></label><input class="inp" id="nbabout" placeholder="Helps tracko sort messages here" maxlength="140" autocomplete="off">
  <div class="mrow"><button class="btn" data-act="mclose">Cancel</button><button class="btn pri" data-act="nbsave">Create bucket</button></div>`);
 setTimeout(()=>{const i=$('#nbname');i.focus();i.select()},30);
}
function saveNewBucket(){
 const name=$('#nbname')?.value.trim();if(!name){$('#nbname')?.focus();flashMsg('Give the bucket a name');return}
 const exists=S.buckets.find(b=>b.name.toLowerCase()===name.toLowerCase());
 const id=ensureBucket(name),b=B(id);
 if(!exists){b.color=newBucketColor||b.color;const about=$('#nbabout')?.value.trim();if(about)b.about=about}
 save();closeModal();const cb=newBucketDone;newBucketDone=null;if(cb)cb(id);
 flashMsg(exists?`${b.name} already exists`:`Created ${b.name}`);
}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
 if(!e.target.closest('[data-act=tmenu],[data-act=bmenu],[data-act=dd],[data-act=remmenu]'))closeMenu();
 if(e.target.id==='modal'){closeModal();return}
 if(e.target.id==='setm'){closeSettings();return}
 if(e.target.id==='search'){closeSearch();return}
 const el=e.target.closest('[data-act]');if(!el)return;
 const a=el.dataset.act,id=el.dataset.id,it=id&&S.items.find(i=>i.id===id);
 switch(a){
  case 'nav':go(el.dataset.view);break;
  case 'bucket':closeSearch();ui.bucket=el.dataset.b;ui.tl=30;go('bucket');break;
  case 'thread':openThread(el.dataset.t);break;
  case 'newchat':closeSearch();newChat(el.dataset.b);break;
  case 'collapse':{const b=el.dataset.b;ui.collapsed.has(b)?ui.collapsed.delete(b):ui.collapsed.add(b);renderSide()}break;
  case 'addbucket':openNewBucket(b=>{if(ui.setOpen){ui.sbucket=b;refresh()}else{ui.bucket=b;go('bucket')}});break;
  case 'nbcolor':newBucketColor=el.dataset.c;document.querySelectorAll('#nbsw button').forEach(x=>x.classList.toggle('on',x.dataset.c===newBucketColor));break;
  case 'nbsave':saveNewBucket();break;
  case 'search':openSearch();break;
  case 'toggle':if(it){it.done=!it.done;it.doneAt=it.done?Date.now():null;save();refresh()}break;
  case 'finish':case 'tdone':if(it){if(it.type==='task'){it.done=true;it.doneAt=Date.now()}else it.remindAt=null;save();refresh()}if(a==='tdone')closeToast();break;
  case 'snooze':case 'tsnooze':if(it){it.remindAt=snoozeTime(el.dataset.k);shown.delete(it.id);save();refresh();flashMsg('Snoozed to '+fmtRemind(it.remindAt))}if(a==='tsnooze')closeToast();break;
  case 'del':if(it){S.items=S.items.filter(i=>i!==it);save();refresh();flashMsg('Deleted')}break;
  case 'undo':{const th=TH(ui.thread),m=th&&th.msgs.find(x=>x.id===el.dataset.msg);if(m){const ids=m.filedIds||m.itemIds||[];S.items=S.items.filter(i=>!ids.includes(i.id));m.undone=true;save();refresh()}}break;
  case 'pick':case 'picknew':case 'pickinbox':{
   const th=TH(ui.thread),m=th&&th.msgs.find(x=>x.id===el.dataset.msg);if(!m)break;
   if(a==='pickinbox'){m.resolved='inbox';save();refresh();break}
   if(a==='picknew'){openNewBucket(to=>{moveThread(th,to);save();refresh();flashMsg('Moved this chat to '+B(to).name)},el.dataset.name||'');break}
   const to=el.dataset.b;moveThread(th,to);save();refresh();flashMsg('Moved this chat to '+B(to).name);
  }break;
  case 'settings':openSettings(el.dataset.tab);break;
  case 'closeset':closeSettings();break;
  case 'stab':ui.stab=el.dataset.tab;renderSettings(0);break;
  case 'bsettings':ui.sbucket=el.dataset.b;openSettings('buckets');break;
  case 'sbucket':ui.sbucket=ui.sbucket===el.dataset.b?null:el.dataset.b;refresh();break;
  case 'seg':if(el.dataset.key==='theme')applyTheme(el.dataset.val);else S.settings[el.dataset.key]=el.dataset.val;save();refresh();break;
  case 'tog':S.settings[el.dataset.key]=!S.settings[el.dataset.key];save();refresh();break;
  case 'bcolor':{const b=S.buckets.find(x=>x.id===el.dataset.b);if(b){b.color=el.dataset.c;save();refresh()}}break;
  case 'delbucket':{const b=S.buckets.find(x=>x.id===el.dataset.b);if(!b||b.id==='inbox')break;
   const nc=S.threads.filter(t=>t.bucket===b.id).length,ni=S.items.filter(i=>i.bucket===b.id).length;
   openModal(`<div class="cf"><span class="cf-ico bad">${ico('trash')}</span><div class="cf-t"><h3>Delete ${esc(b.name)}?</h3><p>It has ${nc} chat${pl(nc)} and ${ni} item${pl(ni)}. Choose what happens to them.</p></div></div><div class="acts2"><button class="btn" data-act="bdelmove" data-b="${b.id}">Keep them, move to Inbox</button><button class="btn danger" data-act="bdelall" data-b="${b.id}">${ico('trash')}Delete the bucket and everything in it</button><button class="btn" data-act="mclose">Cancel</button></div>`)}break;
  case 'bdelmove':case 'bdelall':{const b=S.buckets.find(x=>x.id===el.dataset.b);if(!b)break;closeModal();
   if(a==='bdelall'){const tids=new Set(S.threads.filter(t=>t.bucket===b.id).map(t=>t.id));S.threads=S.threads.filter(t=>!tids.has(t.id));S.items=S.items.filter(i=>i.bucket!==b.id);if(tids.has(ui.thread))ui.thread=null}
   else{S.threads.forEach(t=>{if(t.bucket===b.id)t.bucket='inbox'});S.items.forEach(i=>{if(i.bucket===b.id)i.bucket='inbox'})}
   S.buckets=S.buckets.filter(x=>x!==b);if(ui.bucket===b.id)ui.bucket=null;ui.sbucket=null;save();refresh();flashMsg('Deleted '+b.name)}break;
  case 'addmem':{const i=$('#newmem'),v=i&&i.value.trim();if(v){S.memories.unshift({id:uid(),text:v,source:'you',thread:null,ts:Date.now()});save();refresh();$('#newmem')?.focus()}}break;
  case 'delmem':S.memories=S.memories.filter(m=>m.id!==id);save();refresh();flashMsg('Memory deleted');break;
  case 'addprompt':{const p={id:uid(),name:'new-prompt',text:''};S.prompts.push(p);save();refresh();const n=document.querySelector(`[data-pf="${p.id}:name"]`);if(n){n.focus();n.select()}}break;
  case 'delprompt':S.prompts=S.prompts.filter(p=>p.id!==id);save();refresh();break;
  case 'runprompt':{const p=S.prompts.find(x=>x.id===id);if(p&&p.text.trim())send(p);else flashMsg('That prompt is empty. Fill it in under Settings.')}break;
  case 'copymsg':{const th=TH(ui.thread),m=th&&th.msgs.find(x=>x.id===el.dataset.msg);if(m)copyItems(m.text.replace(/<[^>]+>/g,'').split('. ')[0],(m.shownIds&&m.shownIds.length?m.shownIds:m.itemIds).map(i=>S.items.find(x=>x.id===i)).filter(Boolean))}break;
  case 'export':bridge.exportBackup(JSON.stringify(S,null,2),`tracko-backup-${dayKey(new Date())}.json`).then(p=>flashMsg('Backup saved to '+p)).catch(e=>flashMsg('Could not save the backup: '+(e?.message||e)));break;
  case 'import':$('#importf').click();break;
  case 'wipe':ask({title:'Delete everything?',body:'All chats, items, buckets and memories will be removed from this computer. Your settings and saved prompts stay. This can\'t be undone, so save a backup first if you might want it.',ok:'Delete everything',danger:true,icon:'trash'}).then(ok=>{if(!ok)return;S={v:2,buckets:[{...BUCKETS0[0],kw:[],instructions:''}],items:[],threads:[],settings:S.settings,memories:[],prompts:S.prompts};save();ui.thread=null;ui.bucket=null;shown.clear();refresh();flashMsg('Everything deleted. Fresh start.')});break;
  case 'sidebar':prefs.sideOff=!prefs.sideOff;savePrefs();applyLayout();break;
  case 'panel':togglePanel();break;
  case 'cwidth':{const o=['compact','wide','full'],n=o[(o.indexOf(S.settings.chatWidth)+1)%3];S.settings.chatWidth=n;save();refresh();flashMsg('Chat width: '+n[0].toUpperCase()+n.slice(1))}break;
  case 'today':if(it){it.today=it.today===todayKey()?null:todayKey();save();refresh();flashMsg(it.today?'Added to today':'Removed from today')}break;
  case 'carry':{const tk=todayKey();S.items.forEach(i=>{if(i.type==='task'&&!i.done&&i.today&&i.today<tk)i.today=tk});save();refresh()}break;
  case 'accent':S.settings.accent=el.dataset.c===ACCENT0?null:el.dataset.c;applyAccent();save();refresh();break;
  case 'resetlayout':prefs.sw=264;prefs.rw=320;prefs.sideOff=false;savePrefs();refresh();flashMsg('Layout reset');break;
  case 'tmenu':{const r=el.getBoundingClientRect();openMenu(r.left,r.bottom+4,threadMenu(el.dataset.t,el.dataset.w))}break;
  case 'bmenu':{const r=el.getBoundingClientRect();openMenu(r.left,r.bottom+4,bucketMenu(el.dataset.b))}break;
  case 'trename':{const id=el.dataset.t;ui.renaming=id;ui.renameWhere=el.dataset.w==='head'||prefs.sideOff?'head':'side';
   if(ui.renameWhere==='head'&&(ui.view!=='chat'||ui.thread!==id)){ui.thread=id;go('chat')}else refresh();
   if(!document.querySelector('[data-rn]')){ui.renameWhere='head';ui.thread=id;go('chat')}}break;
  case 'tpin':{const t=TH(el.dataset.t);if(t){t.pinned=!t.pinned;save();refresh();flashMsg(t.pinned?'Pinned to the top of '+B(t.bucket).name:'Unpinned')}}break;
  case 'tarchive':{const t=TH(el.dataset.t);if(t)archiveThread(t)}break;
  case 'trestore':{const t=TH(el.dataset.t);if(t){t.archived=false;save();refresh();flashMsg('Chat restored')}}break;
  case 'tdelete':{const t=TH(el.dataset.t);if(!t)break;ask({title:'Delete this chat?',body:`<b>${esc(t.title)}</b> will be deleted. Tasks and notes it saved stay in their buckets. This can't be undone.`,ok:'Delete chat',danger:true,icon:'trash'}).then(ok=>{if(!ok)return;S.threads=S.threads.filter(x=>x!==t);save();if(ui.thread===t.id&&ui.view==='chat')newChat(null);else refresh();flashMsg('Chat deleted')})}break;
  case 'barchive':{const b=S.buckets.find(x=>x.id===el.dataset.b);if(b&&b.id!=='inbox')archiveBucket(b)}break;
  case 'brestore':{const b=S.buckets.find(x=>x.id===el.dataset.b);if(b){b.archived=false;save();refresh();flashMsg(b.name+' restored')}}break;
  case 'mclose':closeModal();break;
  case 'savekey':{const i=$('#keyin'),v=i&&i.value.trim();if(!v){flashMsg('Paste your API key first');break}
   const go2=()=>bridge.setKey(v).then(async()=>{keyState=await bridge.keyStatus();refresh();await provider('claude-api').refresh();refresh();flashMsg('Claude API is connected')}).catch(e=>flashMsg('Could not save the key: '+(e?.message||e)));
   if(/^sk-ant-/.test(v))go2();else ask({title:'Save this key anyway?',body:"It doesn't look like an Anthropic API key. Those start with <code>sk-ant-</code>.",ok:'Save anyway',icon:'warn'}).then(ok=>{if(ok)go2()})}break;
  case 'clearkey':ask({title:'Remove the API key?',body:'The key is deleted from this computer. tracko switches to another connection, or to offline rules if none is connected.',ok:'Remove key',danger:true,icon:'trash'}).then(ok=>{if(ok)bridge.clearKey().then(async()=>{keyState=await bridge.keyStatus();await provider('claude-api').refresh();refresh();flashMsg('API key removed')})});break;
  case 'retry':{const th=TH(ui.thread);if(!th)break;const k=th.msgs.findIndex(x=>x.id===el.dataset.msg);if(k<1)break;
   const u=th.msgs[k-1];th.msgs.splice(k,1);ui.typing=th.id;renderStream(true);
   reply(th,u.text,u.image,Date.now(),{prompt:!!u.prompt,name:u.prompt,args:u.promptArgs||''}).then(m=>{ui.typing=null;trackUsage(th,m);th.msgs.push(m);th.updated=Date.now();save();refresh();renderStream(true)})}break;
  case 'dd':{const m=$('#menu');if(!m.hidden&&m.dataset.owner===el.dataset.dd+(el.dataset.id||'')){closeMenu();break}
   const r=el.getBoundingClientRect(),cur=el.dataset.v;
   openMenu(r.left,r.bottom+4,ddOptions(el.dataset.dd,el).map(o=>o.head?{head:o.head}:({label:o.label,sub:o.sub,bucket:o.bucket,icon:'blank',on:o.v===cur,act:'ddpick',data:{dd:el.dataset.dd,v:o.v,id:el.dataset.id||''}})));
   m.dataset.owner=el.dataset.dd+(el.dataset.id||'');if(r.width>m.offsetWidth)m.style.minWidth=r.width+'px'}break;
  case 'ddpick':{const v=el.dataset.v,k=el.dataset.dd;
   if(k==='model'){const [pid,id]=v.split(/:(.*)/);S.settings.provider=pid;S.settings.models[pid]=id;save();refresh();flashMsg(`${modelName(id)} via ${providerName(pid)}`)}
   else if(k==='effort'){S.settings.efforts[shownProvider().id]=v;save();refresh();flashMsg('Effort set to '+effortLabel(v))}
   else if(k==='move'){const it=S.items.find(i=>i.id===el.dataset.id);if(it&&it.bucket!==v){it.bucket=v;save();refresh();flashMsg('Moved to '+B(v).name)}}
   else if(k==='movethread'){const th=TH(ui.thread);if(th){if(th.bucket!==v){moveThread(th,v);save();refresh();flashMsg('Moved this chat to '+B(v).name)}}else{ui.newBucket=v||null;const d=ui.draft;render();ui.draft=d}}}break;
  case 'wmin':bridge.win.min();break;
  case 'wmax':bridge.win.max();break;
  case 'wclose':bridge.win.close();break;
  case 'remmenu':{if(!it)break;const r=el.getBoundingClientRect(),now=new Date(),t=atT(now,'remindTime');
   const opts=[['later','In 1 hour',fmtTime(+now+36e5)],['tonight','Tonight',fmtTime(at(now,20))],['tomorrow','Tomorrow',fmtTime(atT(addDays(now,1),'remindTime'))],['monday','Next Monday',fmtTime(t)],['pick','Pick a date and time',''],['none','Remove reminder','']];
   openMenu(r.left,r.bottom+4,opts.filter(o=>o[0]!=='none'||it.remindAt).map(([k,l,sub])=>({label:l,sub,icon:k==='none'?'x':k==='pick'?'cal':'clock',act:'remset',data:{id:it.id,k},danger:k==='none'?1:0})))}break;
  case 'remset':{if(!it)break;const k=el.dataset.k,now=new Date();
   if(k==='pick'){const v=it.remindAt?localIso(it.remindAt):localIso(+now+36e5);
    openModal(`<h3>Reminder</h3><p>${esc(it.text)}</p><input type="datetime-local" class="inp" id="dtin" value="${v}" style="margin-bottom:14px"><div class="acts2"><button class="btn pri" data-act="remsave" data-id="${it.id}">Save reminder</button><button class="btn" data-act="mclose">Cancel</button></div>`);break}
   it.remindAt=k==='none'?null:k==='later'?+now+36e5:k==='tonight'?+at(now,20):k==='tomorrow'?+atT(addDays(now,1),'remindTime'):+atT(nextWd(1),'remindTime');
   shown.delete(it.id);save();refresh();flashMsg(it.remindAt?'Reminder set for '+fmtRemind(it.remindAt):'Reminder removed')}break;
  case 'remsave':{const v=$('#dtin')?.value,d=v?new Date(v):null;if(!it||!d||isNaN(d)){flashMsg('Pick a date and time');break}
   it.remindAt=+d;shown.delete(it.id);closeModal();save();refresh();flashMsg('Reminder set for '+fmtRemind(it.remindAt))}break;
  case 'pcheck':{const p=provider(el.dataset.p);if(!p)break;const inp=$('#path-'+p.id);if(inp){S.settings.paths[p.id]=inp.value.trim();save()}
   p.state.status='checking';refresh();p.refresh(S.settings.paths[p.id]).then(()=>{refresh();if(p.state.status==='ready')flashMsg(p.name+' is connected')})}break;
  case 'psignin':{const p=provider(el.dataset.p);if(!p?.signIn)break;flashMsg('Finish signing in in your browser');
   p.signIn().then(()=>{refresh();flashMsg(p.state.status==='ready'?p.name+' is connected':'Sign-in did not finish')}).catch(e=>{refresh();flashMsg(String(e?.message||e))})}break;
  case 'puse':S.settings.provider=el.dataset.p;save();refresh();flashMsg(providerName(el.dataset.p)+' will answer new messages');break;
  case 'jump':{const n=document.querySelector(`#stream [data-mid="${el.dataset.msg}"]`);if(n){n.scrollIntoView({block:'center',behavior:'smooth'});n.classList.remove('flashm');void n.offsetWidth;n.classList.add('flashm')}}break;
  case 'ndismiss':prefs.dismissed={...(prefs.dismissed||{}),[el.dataset.k]:todayKey()};savePrefs();renderNudges();break;
  case 'ptab':ui.ptab=el.dataset.k;renderPanel();break;
  case 'update':if(upd.latest&&upd.url)bridge.openLink(upd.url);else checkUpdate(true);break;
  case 'cfok':{const r=askResolve;askResolve=null;$('#modal').classList.remove('on');if(r)r(true)}break;
  case 'cfno':closeModal();break;
  case 'recall':ui.recall=el.dataset.k;refresh();break;
  case 'day':ui.day=el.dataset.day&&ui.day!==el.dataset.day?el.dataset.day:null;refresh();break;
  case 'copy':if(el.dataset.k==='recall'){const r=range(ui.recall);copyItems(`${r.label} (${r.sub})`,itemsIn(r.from,r.to))}
   else if(ui.day){const f=keyDate(ui.day);let its=itemsIn(f,addDays(f,1));if(el.dataset.b)its=its.filter(i=>i.bucket===el.dataset.b);copyItems(fmtDate(f),its)}break;
  case 'sug':{const ta=$('#inp');ta.value=el.dataset.text;ui.draft=ta.value;autosize(ta);updSend();ta.focus()}break;
  case 'attach':$('#file').click();break;
  case 'unattach':ui.pendingImage=null;renderAttach();break;
  case 'send':send();break;
  case 'theme':applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');refresh();break;
  case 'reset':ask({title:'Load the demo data?',body:'Sample chats and history replace everything you have now. Save a backup first if you want to keep your data.',ok:'Load demo',danger:true,icon:'reset'}).then(ok=>{if(!ok)return;seed();save();ui.thread=null;ui.newBucket=null;ui.day=dayKey(addDays(new Date(),-1));shown.clear();go('chat')});break;
  case 'sf':ui.sf=el.dataset.f;ui.sel=0;renderResults();$('#sq').focus();break;
  case 'result':openRes(ui.res[+el.dataset.ix]);break;
  case 'more':ui.tl+=30;refresh();break;
  case 'menu':$('#app').classList.toggle('menu');break;
  case 'tclose':closeToast();break;
  case 'trecall':ui.recall=el.dataset.k;closeToast();go('today');break;
 }
});
document.addEventListener('change',e=>{
 const el=e.target;
 if(el.dataset.act==='move'){const it=S.items.find(i=>i.id===el.dataset.id);if(it){it.bucket=el.value;save();refresh();flashMsg('Moved to '+B(el.value).name)}}
 if(el.dataset.act==='movethread'){
  const th=TH(ui.thread);
  if(th){moveThread(th,el.value);save();refresh();flashMsg('Moved this chat to '+B(el.value).name)}
  else{ui.newBucket=el.value||null;const d=ui.draft;render();ui.draft=d}
 }
 if(el.id==='file'){readImage(el.files[0]);el.value=''}
 if('accent' in el.dataset||el.dataset.bcolor){save();refresh()}
 if(el.dataset.set==='budget'){S.settings.budget=Math.max(0,+el.value||0);save();refresh()}
 if(el.dataset.set==='model')flashMsg('Model set to '+MODELS.find(m=>m[0]===el.value)[1]);
 if(el.dataset.pf&&el.dataset.pf.endsWith(':name')){const p=S.prompts.find(x=>x.id===el.dataset.pf.split(':')[0]);if(p){if(!p.name)p.name='prompt';el.value=p.name;save()}}
 if(el.id==='importf'&&el.files[0]){const r=new FileReader();r.onload=()=>{let d;try{d=JSON.parse(r.result)}catch(x){}
  if(!d||d.v!==2||!Array.isArray(d.items)||!Array.isArray(d.threads)||!Array.isArray(d.buckets)){flashMsg('That file is not a tracko backup.');return}
  ask({title:'Replace everything with this backup?',body:`The backup has ${d.threads.length} chat${pl(d.threads.length)} and ${d.items.length} item${pl(d.items.length)}. What you have now will be replaced.`,ok:'Replace',danger:true,icon:'archive'}).then(ok=>{if(!ok)return;
  S=withDefaults(d);save();ui.thread=null;ui.bucket=null;shown.clear();render();flashMsg('Backup imported')})};r.readAsText(el.files[0]);el.value=''}
});
document.addEventListener('input',e=>{
 const el=e.target;
 if(el.id==='inp'){ui.draft=el.value;autosize(el);updSend();updSlash()}
 if(el.dataset.set){S.settings[el.dataset.set]=el.value;saveSoon();document.querySelectorAll(`[data-set="${el.dataset.set}"]`).forEach(x=>{if(x!==el)x.value=el.value})}
 if(el.dataset.bf){const[id,f]=el.dataset.bf.split(':'),b=S.buckets.find(x=>x.id===id);if(b){if(f==='kw')b.kw=el.value.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);else if(f==='name'){if(el.value.trim())b.name=el.value.trim()}else b[f]=el.value;saveSoon();if(f==='name')renderSide()}}
 if(el.dataset.mf){const m=S.memories.find(x=>x.id===el.dataset.mf);if(m){m.text=el.value;saveSoon()}}
 if(el.dataset.pf){const[id,f]=el.dataset.pf.split(':'),p=S.prompts.find(x=>x.id===id);if(p){p[f]=f==='name'?el.value.toLowerCase().replace(/[^a-z0-9-]/g,''):el.value;saveSoon()}}
 if('accent' in el.dataset){S.settings.accent=el.value;applyAccent();saveSoon()}
 if(el.dataset.bcolor){const b=S.buckets.find(x=>x.id===el.dataset.bcolor);if(b){b.color=el.value;saveSoon();renderSide()}}
 const pv=$('#prevp');if(pv&&(el.dataset.set||el.dataset.bf||el.dataset.mf))pv.textContent=buildPrompt();
 if(e.target.id==='sq'){ui.sel=0;renderResults()}
});
document.addEventListener('keydown',e=>{
 const k=e.key;
 if((e.metaKey||e.ctrlKey)&&k.toLowerCase()==='k'){e.preventDefault();searchOpen?closeSearch():openSearch();return}
 if((e.metaKey||e.ctrlKey)&&k.toLowerCase()==='b'){e.preventDefault();prefs.sideOff=!prefs.sideOff;savePrefs();applyLayout();return}
 if((e.metaKey||e.ctrlKey)&&k==='.'){e.preventDefault();togglePanel();return}
 if(e.target.id==='qadd'&&k==='Enter'){e.preventDefault();const v=e.target.value.trim();if(v){e.target.value='';quickAdd(v);$('#qadd')?.focus()}return}
 if(e.target.dataset&&e.target.dataset.itedit){if(k==='Enter'){e.preventDefault();commitItemEdit(e.target)}else if(k==='Escape')commitItemEdit(e.target,true);return}
 if(e.target.dataset&&e.target.dataset.rn){if(k==='Enter'){e.preventDefault();commitRename(e.target)}else if(k==='Escape'){commitRename(e.target,true)}return}
 if(k==='Escape'&&(!$('#menu').hidden||$('#modal').classList.contains('on'))){closeMenu();closeModal();return}
 if(k==='Escape'&&ui.setOpen&&!searchOpen){closeSettings();return}
 if(searchOpen){
  if(k==='Escape')closeSearch();
  else if(k==='ArrowDown'){e.preventDefault();ui.sel=Math.min(ui.sel+1,ui.res.length-1);renderResults()}
  else if(k==='ArrowUp'){e.preventDefault();ui.sel=Math.max(ui.sel-1,0);renderResults()}
  else if(k==='Enter'){e.preventDefault();openRes(ui.res[ui.sel])}
  return;
 }
 if(e.target.id==='inp'&&ui.slash&&!$('#slash').hidden){
  if(k==='ArrowDown'||k==='ArrowUp'){e.preventDefault();const n=ui.slash.length;if(n){ui.slashSel=(ui.slashSel+(k==='ArrowDown'?1:n-1))%n;updSlash()}return}
  if(k==='Tab'&&ui.slash.length){e.preventDefault();const ta=e.target;ta.value='/'+ui.slash[ui.slashSel].name+' ';ui.draft=ta.value;updSlash();updSend();return}
  if(k==='Enter'&&ui.slash.length){e.preventDefault();send(ui.slash[ui.slashSel]);return}
  if(k==='Escape'){$('#slash').hidden=true;ui.slash=null;return}
 }
 if((e.target.id==='nbname'||e.target.id==='nbabout')&&k==='Enter'){e.preventDefault();saveNewBucket();return}
 if(e.target.id==='newmem'&&k==='Enter'){e.preventDefault();$('[data-act=addmem]').click();return}
 if(e.target.id==='inp'&&k==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();return}
 if(k==='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){e.preventDefault();openSearch()}
 if(k==='Escape')$('#app').classList.remove('menu');
});
document.addEventListener('mousemove',e=>{if(!searchOpen)return;const r=e.target.closest('.res');if(r&&+r.dataset.ix!==ui.sel){ui.sel=+r.dataset.ix;document.querySelectorAll('#sres .res').forEach((x,i)=>x.classList.toggle('sel',i===ui.sel))}});
document.addEventListener('paste',e=>{if(searchOpen)return;const f=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'));if(f){e.preventDefault();readImage(f.getAsFile())}});
document.addEventListener('dragover',e=>{e.preventDefault();$('#composer')?.classList.add('drag')});
document.addEventListener('dragleave',e=>{if(!e.relatedTarget)$('#composer')?.classList.remove('drag')});
document.addEventListener('drop',e=>{e.preventDefault();$('#composer')?.classList.remove('drag');readImage(e.dataTransfer?.files?.[0])});

function togglePanel(){prefs.rOpen=!prefs.rOpen;savePrefs();applyLayout();renderPanel()}
let drag=null;
document.addEventListener('pointerdown',e=>{const r=e.target.closest('.rz');if(!r)return;drag=r.id;r.classList.add('drag');document.body.classList.add('resizing');r.setPointerCapture(e.pointerId);e.preventDefault()});
document.addEventListener('pointermove',e=>{if(!drag)return;if(drag==='rzl')prefs.sw=Math.round(Math.max(200,Math.min(440,e.clientX)));else prefs.rw=Math.round(Math.max(300,Math.min(520,innerWidth-e.clientX)));applyLayout()});
document.addEventListener('pointerup',e=>{if(!drag)return;if(drag==='rzl'&&e.clientX<140){prefs.sideOff=true;prefs.sw=264;applyLayout();flashMsg('Sidebar hidden. Ctrl+B brings it back.')}$('#'+drag)?.classList.remove('drag');document.body.classList.remove('resizing');drag=null;savePrefs()});
document.addEventListener('dblclick',e=>{const r=e.target.closest('.rz');if(!r)return;if(r.id==='rzl')prefs.sw=264;else prefs.rw=340;applyLayout();savePrefs()});

document.addEventListener('dblclick',e=>{
 const t=e.target.closest('[data-edit]');if(!t||t.querySelector('input'))return;
 const it=S.items.find(i=>i.id===t.dataset.edit);if(!it)return;
 t.innerHTML=`<input class="inp ghost" data-itedit="${it.id}" value="${esc(it.text)}" style="width:100%">`;const i=t.querySelector('input');i.focus();i.select();
});
function commitItemEdit(el,cancel){const it=S.items.find(i=>i.id===el.dataset.itedit);if(!it||el.dataset.done)return;el.dataset.done=1;if(!cancel&&el.value.trim()&&el.value.trim()!==it.text){it.text=el.value.trim();save();flashMsg('Saved')}refresh()}
document.addEventListener('contextmenu',e=>{
 const t=e.target.closest('[data-tctx]'),b=e.target.closest('[data-bctx]');
 if(t){e.preventDefault();openMenu(e.clientX,e.clientY,threadMenu(t.dataset.tctx,'side'))}
 else if(b){e.preventDefault();openMenu(e.clientX,e.clientY,bucketMenu(b.dataset.bctx))}
});
document.addEventListener('focusout',e=>{if(e.target.dataset&&e.target.dataset.rn)commitRename(e.target);if(e.target.dataset&&e.target.dataset.itedit)commitItemEdit(e.target)});
addEventListener('wheel',e=>{if(!e.target.closest('#menu'))closeMenu()},{passive:true});addEventListener('touchmove',closeMenu,{passive:true});addEventListener('resize',closeMenu);

/* ---------- boot ---------- */
applyTheme(themePref());
matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{if(themePref()==='system'){applyTheme('system');renderSide()}});
if(bridge.inApp)document.documentElement.classList.add(bridge.isMac?'mac':'wc');
$('#menub').innerHTML=ico('menu');$('#mpanel').innerHTML=ico('focus');$('#sicon').innerHTML=ico('search');
(async()=>{
 try{S=parseState(await bridge.loadState())}catch(e){S=null;console.error(e)}
 if(!S)S=fresh();
 save();
 applyAccent();
 try{keyState=await bridge.keyStatus()}catch(e){keyState={has:false,source:null}}
 render();
 Promise.all(PROVIDERS.map(p=>p.refresh(S.settings.paths[p.id]).catch(()=>{}))).then(()=>refresh());
 checkUpdate(false);setInterval(()=>checkUpdate(false),6*36e5);
 bridge.onClose(()=>flush());
})();
setTimeout(()=>{if(!S)return;
 const k=new Date().getDay()===1?'friday':'yesterday',r=range(k);
 if(S.settings.recap&&itemsIn(r.from,r.to).length)toastQ.push({kind:'recall',k});
 checkReminders();nextToast();
},1200);
setInterval(()=>{if(S){checkReminders();renderSide()}},20000);
