import type {Document} from './model';
type Build={type:'build';id:number;doc:Document};
type Message={type:string;id?:number;message?:string;[key:string]:any};

/** One worker, one active build, and at most one pending (latest) document. */
export class CadClient {
 private worker:Worker|null=null;
 private ready=false;
 private failed=false;
 private failureMessage='';
 private active:number|null=null;
 private latest:Build|null=null;
 private pending:Build|null=null;
 private timer:ReturnType<typeof setTimeout>|undefined;
 constructor(
  private createWorker:()=>Worker,
  private receive:(message:Message)=>void,
  private timeoutMs=120000,
 ){}
 private arm(message:string){
  clearTimeout(this.timer);
  this.timer=setTimeout(()=>this.fail(message),this.timeoutMs);
 }
 private fail(message:string){
  clearTimeout(this.timer);this.worker?.terminate();this.worker=null;
  this.ready=false;this.failed=true;this.active=null;this.failureMessage=message;
  this.receive({type:'fatal',message});
 }
 private start(){
  this.failed=false;this.ready=false;this.active=null;
  this.receive({type:'progress',phase:'starting'});
  this.arm('计算线程未能启动，可能是网络或浏览器兼容问题。请重试，或在手机系统浏览器中打开。');
  try{
   const worker=this.createWorker();this.worker=worker;
   worker.onmessage=e=>{
    if(this.worker!==worker)return;
    const m=e.data as Message;
    if(m.type==='progress'){
     this.arm(m.phase==='compile'?'建模引擎初始化超时，请重试，或关闭其他页面后再试。':'建模引擎加载暂时没有进展，请检查网络后重试。');
     this.receive(m);return;
    }
    if(m.type==='ready'){
     clearTimeout(this.timer);this.ready=true;this.receive(m);this.flush();return;
    }
    if(m.type==='fatal'){this.fail(m.message||'建模引擎启动失败。');return;}
    if(m.type==='built'||m.type==='error'){
     if(m.id!==this.active)return;
     clearTimeout(this.timer);this.active=null;this.receive(m);this.flush();return;
    }
    this.receive(m);
   };
   worker.onerror=e=>{if(this.worker===worker)this.fail('建模引擎启动或运行失败：'+(e.message||'浏览器没有提供错误详情。'));};
   worker.onmessageerror=()=>{if(this.worker===worker)this.fail('浏览器无法接收建模计算结果，请重试。');};
   worker.postMessage({type:'init'});
  }catch(err){this.fail('无法启动建模引擎：'+(err instanceof Error?err.message:String(err)));}
 }
 private flush(){
  if(!this.worker||!this.ready||this.active!==null||!this.pending)return;
  const message=this.pending;this.pending=null;this.active=message.id;
  this.receive({type:'building',id:message.id});
  this.arm('实体或三视图计算超过 2 分钟，已停止计算。工程参数仍然保留，可重试或保存。');
  try{this.worker.postMessage(message);}catch(err){this.fail('无法发送建模参数：'+String(err));}
 }
 postMessage(message:any){
  if(message.type==='build'){
   this.latest=message;this.pending=message;
   if(this.failed)this.receive({type:'fatal',message:this.failureMessage});
   else if(!this.worker)this.start();else this.flush();
  }else if(this.worker&&this.ready)this.worker.postMessage(message);
 }
 retry(){
  clearTimeout(this.timer);this.worker?.terminate();this.worker=null;
  this.pending=this.latest;this.start();
 }
}
