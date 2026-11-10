export function decimal(value, scale=4) {
  const s=String(value??'').trim().replace(',','.');
  if(!new RegExp(`^\\d{1,9}(?:\\.\\d{1,${scale}})?$`).test(s)) throw Error('Введите неотрицательное число, до '+scale+' знаков после запятой');
  const [a,b='']=s.split('.'); return BigInt(a)*10n**BigInt(scale)+BigInt(b.padEnd(scale,'0'));
}
const rounded=(n,d)=>(n+d/2n)/d;
export const COLORS={green:'Зелёный',blue:'Голубой',yellow:'Жёлтый',pink:'Розовый',lilac:'Сиреневый'};
export const clientName=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ');
export const clientKey=value=>clientName(value).toLocaleLowerCase('ru');
export function clientList(state){
  const clients=new Map();
  for(const p of state.parcels)for(const i of p.items){const name=clientName(i.client);if(name&&!clients.has(clientKey(name)))clients.set(clientKey(name),name)}
  return [...clients].sort((a,b)=>a[1].localeCompare(b[1],'ru'));
}
// null means all clients; an empty string selects purchases without a client.
export function scopedParcels(state,parcelId=null,client=null){
  return state.parcels.filter(p=>parcelId===null||p.id===parcelId).map(p=>({...p,items:p.items.filter(i=>client===null||clientKey(i.client)===clientKey(client))}));
}
export function scopeSummary(parcels){
  let weight=0n;
  const total={goods:0,delivery:0,total:0,pending:0,arrived:0,count:0,weight:0,missingWeight:0};
  for(const p of parcels){const s=summary(p);for(const key of ['goods','delivery','total','pending','arrived'])total[key]+=s[key];total.count+=p.items.length;
    for(const i of p.items)if(i.weight==null||i.weight==='')total.missingWeight++;else weight+=decimal(i.weight,6);
  }total.weight=Number(weight)/1000000;return total;
}
export function putItem(state,sourceId,targetId,item){
  const next=structuredClone(state),target=next.parcels.find(p=>p.id===targetId);
  if(!target)throw Error('Выберите существующую посылку');
  const source=sourceId===null?null:next.parcels.find(p=>p.id===sourceId);
  if(sourceId!==null&&!source?.items.some(i=>i.id===item.id))throw Error('Товар не найден в исходной посылке');
  if(sourceId===targetId)source.items[source.items.findIndex(i=>i.id===item.id)]=item;
  else{if(source)source.items=source.items.filter(i=>i.id!==item.id);target.items.unshift(item)}
  validateState(next);return next;
}
export function matchesSearch(item,query,mode='all'){
  const q=String(query).trim().toLocaleLowerCase('ru');
  if(!q)return true;
  const track=s=>String(s).toLocaleLowerCase('ru').replace(/[\s\-–—]+/g,'');
  const nameMatch=item.name.toLocaleLowerCase('ru').includes(q);
  const trackMatch=!!track(q)&&track(item.track).includes(track(q));
  return mode==='track'?trackMatch:mode==='name'?nameMatch:nameMatch||trackMatch;
}
export function calculate(item,tariff){
  const goods=rounded(decimal(item.price)*decimal(item.rate),1000000n);
  const delivery=item.weight==null||item.weight===''||tariff==null||tariff===''?null:rounded(decimal(item.weight,6)*decimal(tariff),100000000n);
  if(goods+(delivery??0n)>10000000000n)throw Error('Слишком большая сумма товара');
  return {goods:Number(goods),delivery:delivery===null?null:Number(delivery),total:Number(goods+(delivery??0n))};
}
export function summary(parcel){
  return parcel.items.reduce((a,i)=>{const c=calculate(i,parcel.tariff); a.goods+=c.goods;a.delivery+=c.delivery??0;a.total+=c.total;a.pending+=c.delivery===null?1:0;a.arrived+=i.arrived?1:0;return a},{goods:0,delivery:0,total:0,pending:0,arrived:0});
}
export function validateState(state){
  if(!state||!Array.isArray(state.parcels)||state.parcels.length>200)throw Error('Неверные данные посылок');
  const ids=new Set();let count=0;
  const str=(v,max=200)=>{if(typeof v!=='string'||v.length>max)throw Error('Неверное текстовое поле')};
  const id=v=>{str(v,80);if(!/^[a-zA-Z0-9_-]+$/.test(v)||ids.has(v))throw Error('Повторный или неверный идентификатор');ids.add(v)};
  for(const p of state.parcels){id(p.id);str(p.name,100);if(!p.name.trim())throw Error('Укажите название посылки');if(p.tariff!==null&&p.tariff!=='')decimal(p.tariff);if(!Array.isArray(p.items))throw Error('Нет товаров');
    for(const i of p.items){if(++count>10000)throw Error('Слишком много товаров');id(i.id);str(i.name);if(!i.name.trim())throw Error('Укажите название товара');decimal(i.price);if(decimal(i.rate)===0n)throw Error('Курс должен быть больше нуля');if(i.weight!==null&&i.weight!=='')decimal(i.weight,6);str(i.track,100);str(i.date,10);str(i.note,1000);if(typeof i.arrived!=='boolean')throw Error('Неверный статус');if(i.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(i.date)||!Number.isFinite(Date.parse(i.date))||new Date(i.date).toISOString().slice(0,10)!==i.date))throw Error('Неверная дата');calculate(i,p.tariff);}
    for(const i of p.items){if(i.client!==undefined)str(i.client,100);if(i.checked!==undefined&&typeof i.checked!=='boolean')throw Error('Неверная отметка проверки');if(i.color!==undefined&&!Object.hasOwn(COLORS,i.color))throw Error('Неверный цвет позиции');}
  }return state;
}
