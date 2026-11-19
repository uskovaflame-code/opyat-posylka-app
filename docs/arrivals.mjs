const MAX_TEXT=200000;
export const arrivalTrackKey=value=>String(value??'').normalize('NFKC').replace(/[\s\u200b-\u200d\ufeff]+/gu,'').toUpperCase();
function isoDate(day,month,year){
 const value=`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:null;
}
export function parseArrivalText(text){
 if(typeof text!=='string'||text.length>MAX_TEXT)throw Error('Сообщение слишком большое. Вставьте до 200 000 символов.');
 const records=new Map(),issues=[],conflicts=new Set();
 for(const [index,raw] of text.split(/\r?\n|\r/).entries()){
  const line=raw.replace(/[\u200b-\u200d\ufeff]/gu,'').replace(/\u00a0/g,' ').trim();
  if(!line)continue;
  // Only explicit receipt rows are data; headings and other Telegram text are ignored.
  const match=line.match(/^[•●▪◦*\-–—]?\s*([A-Za-z0-9][A-Za-z0-9 \t\-]{4,99})\s*[;；]\s*Дата\s+(?:прибытия|поступления)\s*:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*[.;]?\s*$/iu);
  if(!match){
   if(/Дата\s+(?:прибытия|поступления)\s*:/iu.test(line))issues.push({line:index+1,text:line,reason:'Не распознан трек или дата. Нужен формат «ТРЕК; Дата прибытия: 18.11.2026».'});
   continue;
  }
  const key=arrivalTrackKey(match[1]),date=isoDate(match[2],match[3],match[4]);
  if(key.length<6||key.length>100||!date){issues.push({line:index+1,text:line,reason:!date?'Некорректная календарная дата.':'Трек должен содержать от 6 до 100 символов.'});continue}
  const old=records.get(key);
  if(old&&old.date!==date)conflicts.add(key);
  else if(!old)records.set(key,{key,track:match[1].trim(),date});
 }
 const entries=[];
 for(const record of records.values()){
  if(conflicts.has(record.key))issues.push({track:record.track,reason:'В сообщении для этого трека разные даты. Уточните дату и вставьте список заново.'});
  else entries.push(record);
 }
 return {entries,issues};
}
export function planArrivals(state,parsed){
 const itemsByTrack=new Map();
 for(const parcel of state.parcels)for(const item of parcel.items){
  const key=arrivalTrackKey(item.track);if(!key)continue;
  const items=itemsByTrack.get(key)||[];items.push({parcelId:parcel.id,parcelName:parcel.name,itemId:item.id,name:item.name,client:item.client||'',track:item.track,arrived:item.arrived,date:item.date||''});itemsByTrack.set(key,items);
 }
 const changes=[],already=[],dateConflicts=[],unknown=[];
 for(const entry of parsed.entries){
  const matches=itemsByTrack.get(entry.key);
  if(!matches){unknown.push(entry);continue}
  for(const match of matches){
   if(match.date&&match.date!==entry.date){dateConflicts.push({...match,arrivalDate:entry.date});continue}
   if(match.arrived&&match.date===entry.date){already.push(match);continue}
   changes.push({...match,arrivalDate:entry.date});
  }
 }
 return {changes,already,dateConflicts,unknown,issues:parsed.issues};
}
export function applyArrivals(state,plan){
 const next=structuredClone(state),seen=new Set();
 for(const change of plan.changes){
  const id=change.parcelId+'\0'+change.itemId;if(seen.has(id))throw Error('Повтор товара в списке поступления.');seen.add(id);
  const item=next.parcels.find(p=>p.id===change.parcelId)?.items.find(i=>i.id===change.itemId);
  if(!item||arrivalTrackKey(item.track)!==arrivalTrackKey(change.track)||item.arrived!==change.arrived||(item.date||'')!==change.date)throw Error('Товар изменился после проверки. Найдите товары заново.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(change.arrivalDate)||!isoDate(change.arrivalDate.slice(8),change.arrivalDate.slice(5,7),change.arrivalDate.slice(0,4)))throw Error('Неверная дата поступления.');
  item.arrived=true;item.date=change.arrivalDate;
 }
 return next;
}
