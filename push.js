// 每小時由 GitHub Actions 執行：到了設定的提醒時間，就推播今天的讀書任務。
const fs=require('fs'),webpush=require('web-push');
const raw=process.env.PUSH_SUB,priv=process.env.VAPID_PRIVATE;
if(!raw||!priv){console.log('PUSH_SUB 或 VAPID_PRIVATE 尚未設定，略過。');process.exit(0)}
const {sub,s}=JSON.parse(raw);
const S=Object.assign({start:'2026-10-19',exam:'2026-11-29',off:[5,6],workMin:90,offMin:240,pw:19,po:10},s);
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const seg=html.slice(html.indexOf('const pd='),html.indexOf("let tab='today'"));
const P=new Function('S',seg+';return {tasksFor,isOff,diff,todayStr};')(S);
const force=process.env.FORCE==='true';
const hour=new Date().getHours(),d=P.todayStr,t=P.tasksFor(d);
if(!t&&!force){console.log('今天不在計畫範圍內');process.exit(0)}
const want=P.isOff(d)?S.po:S.pw;
if(hour!==want&&!force){console.log(`現在 ${hour} 點，提醒時間是 ${want} 點，略過。`);process.exit(0)}
const left=P.diff(d,S.exam);
let title,body;
if(!t){title='多益衝刺';body='測試通知：提醒功能已經設定好了。'}
else{
  const mins=t.list.reduce((a,x)=>a+x.m,0);
  title=left===0?'今天考多益，加油！':`多益倒數 ${left} 天｜${t.type}`;
  body=t.list.map(x=>x.t).join('、')+(mins?`，共 ${Math.floor(mins/60)?Math.floor(mins/60)+' 小時 ':''}${mins%60?mins%60+' 分':''}`:'');
}
webpush.setVapidDetails('mailto:noreply@example.com',process.env.VAPID_PUBLIC,priv);
webpush.sendNotification(sub,JSON.stringify({title,body}),{TTL:3600})
  .then(()=>console.log('已送出：',title,body))
  .catch(e=>{console.error('送出失敗',e.statusCode,e.body);process.exit(1)});
