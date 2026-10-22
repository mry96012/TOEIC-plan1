// 每小時由 GitHub Actions 執行：從 Firestore 讀取每支裝置的訂閱與設定，到了提醒時間就推播當天任務。
const fs=require('fs'),webpush=require('web-push'),admin=require('firebase-admin');
const sa=process.env.FIREBASE_SA,priv=process.env.VAPID_PRIVATE;
if(!sa||!priv){console.log('FIREBASE_SA 或 VAPID_PRIVATE 尚未設定，略過。');process.exit(0)}
admin.initializeApp({credential:admin.credential.cert(JSON.parse(sa))});
const db=admin.firestore();
webpush.setVapidDetails('mailto:noreply@example.com',process.env.VAPID_PUBLIC,priv);
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const seg=html.slice(html.indexOf('const pd='),html.indexOf("let tab='today'"));
const force=process.env.FORCE==='true',hour=new Date().getHours();

function message(s,lastSent){
  const S=Object.assign({start:'2026-10-19',exam:'2026-11-29',off:[5,6],workMin:90,offMin:240,pw:19,po:10},s);
  const P=new Function('S',seg+';return {tasksFor,isOff,diff,todayStr};')(S);
  const d=P.todayStr,t=P.tasksFor(d);
  if(!t)return force?{day:null,title:'多益衝刺',body:'測試通知：提醒功能已經設定好了。'}:null;
  // 考試日固定早上 7 點提醒；其他日子依上班日／休假日設定。
  // GitHub 排程常會延遲，所以只要在提醒時間後 3 小時內、且今天還沒送過，就補送。
  const want=t.type==='考試日'?7:(P.isOff(d)?S.po:S.pw);
  if(!force&&(hour<want||hour>=want+3||lastSent===d))return null;
  const left=P.diff(d,S.exam),mins=t.list.reduce((a,x)=>a+x.m,0);
  const h=Math.floor(mins/60),m=mins%60;
  return{day:d,title:left===0?'今天考多益，加油！':`多益倒數 ${left} 天｜${t.type}`,
    body:left===0?t.list[0].d:t.list.map(x=>x.t).join('、')+(mins?`，共 ${h?h+' 小時 ':''}${m?m+' 分':''}`.trimEnd():'')};
}

(async()=>{
  const snap=await db.collection('toeic_push').get();
  console.log(`共 ${snap.size} 台裝置，現在 ${hour} 點`);
  let fail=0;
  for(const doc of snap.docs){
    const {sub,s}=doc.data();
    const sentRef=db.collection('toeic_sent').doc(doc.id);
    const sent=(await sentRef.get()).data()||{};
    const msg=message(s||{},sent.day);
    if(!msg){console.log(doc.id.slice(0,6),'不是提醒時間');continue}
    try{
      await webpush.sendNotification(sub,JSON.stringify({title:msg.title,body:msg.body}),{TTL:3600});
      if(msg.day&&!force)await sentRef.set({day:msg.day});
      console.log(doc.id.slice(0,6),'已送出：',msg.title)}
    catch(e){
      if(e.statusCode===404||e.statusCode===410){await doc.ref.delete();await sentRef.delete();console.log(doc.id.slice(0,6),'訂閱已失效，已移除')}
      else{fail++;console.error(doc.id.slice(0,6),'送出失敗',e.statusCode,e.body)}
    }
  }
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
