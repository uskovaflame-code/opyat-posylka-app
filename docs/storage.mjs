import {validateState} from './model.mjs';
const PREFIX='opyat_v2_',HEAD=PREFIX+'head',PART=3500,MAX_PARTS=300;
const empty=()=>({parcels:[]});
function split(text){const parts=[];for(let i=0;i<text.length;){let end=Math.min(text.length,i+PART);if(end<text.length&&text.charCodeAt(end-1)>=0xd800&&text.charCodeAt(end-1)<=0xdbff)end--;parts.push(text.slice(i,end));i=end}return parts}
const key=(generation,index)=>PREFIX+generation+'_'+index;
export function createStorage({telegram,localStorage,uuid=()=>crypto.randomUUID().replaceAll('-','')}={}){
 const inTelegram=!!telegram?.initData;
 const cloud=inTelegram&&telegram?.isVersionAtLeast?.('6.9')?telegram.CloudStorage:null;
 const localKey='opyat-posylka-browser-v2';
 const call=(method,...args)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Telegram не ответил. Проверьте интернет и попробуйте ещё раз.')),20000);
  try{cloud[method](...args,(error,value)=>{clearTimeout(timer);error?reject(Error('Не удалось сохранить данные в Telegram: '+String(error))):resolve(value)})}catch{clearTimeout(timer);reject(Error('Облачное хранилище Telegram недоступно'))}
 });
 function parseHead(value){if(!value)return null;const h=JSON.parse(value);if(!/^[a-zA-Z0-9_-]{1,80}$/.test(h.generation)||!Number.isInteger(h.parts)||h.parts<1||h.parts>MAX_PARTS)throw Error('Не удалось прочитать сохранение. Восстановите JSON-копию.');return h}
 async function getHead(){return parseHead(await call('getItem',HEAD))}
 async function load(){
  if(inTelegram&&!cloud)throw Error('Обновите Telegram, чтобы сохранять покупки в облаке.');
  if(cloud){const h=await getHead();if(!h)return {state:empty(),revision:null,mode:'telegram'};const keys=Array.from({length:h.parts},(_,i)=>key(h.generation,i)),values=await call('getItems',keys);if(keys.some(k=>typeof values[k]!=='string'))throw Error('Сохранение неполное. Откройте приложение заново.');const state=JSON.parse(keys.map(k=>values[k]).join(''));validateState(state);return {state,revision:h.generation,mode:'telegram'}}
  try{const raw=localStorage.getItem(localKey);if(!raw)return {state:empty(),revision:null,mode:'browser'};const saved=JSON.parse(raw);validateState(saved.state);return {...saved,mode:'browser'}}catch{throw Error('Не удалось открыть данные браузера. Проверьте доступ к хранилищу или восстановите JSON-копию.')}
 }
 async function save(state,expected){
  validateState(state);const text=JSON.stringify(state),generation=uuid();
  if(inTelegram&&!cloud)throw Error('Обновите Telegram для сохранения покупок.');
  if(!cloud){const current=await load();if(current.revision!==expected)throw Error('Данные изменились в другом окне. Обновите приложение.');try{localStorage.setItem(localKey,JSON.stringify({state,revision:generation}))}catch{throw Error('Не удалось сохранить на устройстве. Освободите место и сделайте JSON-копию.')}return {revision:generation}}
  const parts=split(text);if(parts.length>MAX_PARTS)throw Error('Хранилище заполнено. Сохраните JSON-копию и удалите завершённые посылки.');
  const before=await getHead();if((before?.generation??null)!==expected)throw Error('Данные изменились на другом устройстве. Закройте и откройте приложение.');
  const keys=parts.map((_,i)=>key(generation,i));
  try{
   for(let i=0;i<parts.length;i+=4){const writes=await Promise.allSettled(parts.slice(i,i+4).map((value,j)=>call('setItem',keys[i+j],value).then(ok=>{if(ok!==true)throw Error('Telegram не подтвердил сохранение')})));const failed=writes.find(w=>w.status==='rejected');if(failed)throw failed.reason}
   const latest=await getHead();if((latest?.generation??null)!==expected)throw Error('Данные изменились на другом устройстве. Откройте приложение заново.');
   const head={generation,parts:parts.length,previous:before?{generation:before.generation,parts:before.parts}:null};
   if(await call('setItem',HEAD,JSON.stringify(head))!==true)throw Error('Telegram не подтвердил сохранение');
   if((await getHead())?.generation!==generation)throw Error('Одновременное изменение на другом устройстве. Откройте приложение заново.');
   const stale=before?.previous;if(stale&&/^[a-zA-Z0-9_-]{1,80}$/.test(stale.generation)&&Number.isInteger(stale.parts)&&stale.parts>0&&stale.parts<=MAX_PARTS){try{await call('removeItems',Array.from({length:stale.parts},(_,i)=>key(stale.generation,i)))}catch{}}
   return {revision:generation};
  }catch(error){
   // Only discard this attempt when no active snapshot references it.
   try{const active=await getHead();if(active?.generation!==generation&&active?.previous?.generation!==generation)await call('removeItems',keys)}catch{}
   throw error;
  }
 }
 return {load,save,mode:cloud?'telegram':'browser'};
}
