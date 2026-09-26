/**
 * The sandbox a generated shell runs in. Generated code is an untrusted guest:
 *  - rendered in <iframe sandbox="allow-scripts" srcdoc=…>: opaque origin, so no cookies, storage,
 *    session, zkLogin or device keys; no forms, popups or top navigation;
 *  - a CSP with default-src 'none': no fetch/XHR/WebSocket/images from the network. Data is PUSHED
 *    in by the OS; the shell never fetches anything;
 *  - the only way out is `suica.propose(actionId)`, which asks the OS to run one of the actions the
 *    trusted function already built. The fixed Signing dialog (and the AgentCap on-chain) still decide.
 */

/** Messages OS → shell. */
export type ToShell = { type: "suica:data"; bundle: unknown; app: { title: string; ens: string; target: string; prompt: string; vibe: string; preview: boolean } };
/** Messages shell → OS. */
export type FromShell =
  | { type: "suica:ready"; painted: boolean }
  | { type: "suica:propose"; actionId: string }
  | { type: "suica:error"; message: string };

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:";

/** Small Win98 vocabulary the generated code can lean on so it looks native. */
export const BASE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#c0c0c0;color:#000;font:12px/1.3 "Tahoma","MS Sans Serif","Segoe UI",sans-serif;-webkit-font-smoothing:none}
.raised{background:#c0c0c0;box-shadow:inset -1px -1px #0a0a0a,inset 1px 1px #fff,inset -2px -2px #808080,inset 2px 2px #dfdfdf}
.sunken{background:#fff;box-shadow:inset -1px -1px #fff,inset 1px 1px #808080,inset -2px -2px #dfdfdf,inset 2px 2px #0a0a0a}
.btn{font:inherit;min-width:64px;padding:3px 10px;border:0;background:#c0c0c0;cursor:pointer;box-shadow:inset -1px -1px #0a0a0a,inset 1px 1px #fff,inset -2px -2px #808080,inset 2px 2px #dfdfdf}
.btn:active{box-shadow:inset -1px -1px #fff,inset 1px 1px #0a0a0a,inset -2px -2px #dfdfdf,inset 2px 2px #808080}
.title{background:linear-gradient(90deg,#000080,#1084d0);color:#fff;font-weight:700;padding:2px 4px}
.up{color:#007000}.down{color:#b00000}.mono{font-family:"Lucida Console","Courier New",monospace}
`;

/** Injected before the generated code: the whole API surface a shell gets. */
const PRELUDE = `(()=>{
const send=(m)=>parent.postMessage(m,"*");
let data=null;const subs=[];let readySent=false;
const usd=(v)=>(v<0?"-$":"$")+Math.abs(+v||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:Math.abs(v)<1?4:2});
const pct=(v)=>((v>0?"+":"")+(+v||0).toFixed(1)+"%");
function painted(){
  for(const c of document.querySelectorAll("canvas")){
    try{const x=c.getContext("2d");if(!x||!c.width||!c.height)continue;
      const d=x.getImageData(0,0,c.width,c.height).data;const f=d[0]+","+d[1]+","+d[2];
      for(let i=0;i<d.length;i+=4*97){if(d[i]+","+d[i+1]+","+d[i+2]!==f)return true}}catch(e){return true}
  }
  return (document.body.innerText||"").trim().length>20||document.body.querySelectorAll("*").length>12;
}
window.suica={
  onData(cb){subs.push(cb);if(data)try{cb(data)}catch(e){report(e)}},
  propose(actionId){send({type:"suica:propose",actionId:String(actionId)})},
  ready(){if(readySent)return;readySent=true;let done=false;const go=()=>{if(done)return;done=true;send({type:"suica:ready",painted:painted()})};requestAnimationFrame(()=>requestAnimationFrame(go));setTimeout(go,250)},
  get data(){return data},
  fmt:{usd,pct},
};
function report(e){send({type:"suica:error",message:String((e&&e.message)||e).slice(0,300)})}
window.addEventListener("error",(e)=>report(e.error||e.message));
window.addEventListener("unhandledrejection",(e)=>report(e.reason));
window.addEventListener("message",(e)=>{
  if(e.source!==parent||!e.data||e.data.type!=="suica:data")return;
  data={bundle:e.data.bundle,app:e.data.app};
  for(const cb of subs)try{cb(data)}catch(err){report(err)}
});
})();`;

/** The complete document for one generated shell. `body` is exactly what the model wrote. */
export function srcdocFor(body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>${BASE_CSS}</style><script>${PRELUDE}</script></head><body>${body}</body></html>`;
}

/** The sandbox attribute. Never add allow-same-origin: with srcdoc that would hand the guest our origin. */
export const SANDBOX = "allow-scripts";
