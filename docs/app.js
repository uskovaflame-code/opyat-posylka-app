import {calculate,validateState,matchesSearch,COLORS,clientName,clientList,scopedParcels,scopeSummary,putItem,trackList,parcelItemDefaults,trackKey,groupByTrack} from './model.mjs?v=20261125-yuan';
import {createStorage} from './storage.mjs?v=20261110-mobile2';

const $=s=>document.querySelector(s),tg=window.Telegram?.WebApp;tg?.ready();tg?.expand();
let deviceStorage;try{deviceStorage=window.localStorage}catch{deviceStorage=null}
const store=createStorage({telegram:tg,localStorage:deviceStorage});
let state,revision,selected,clientSelection='*',filter='all',editing=null,busy=false;
let arrivalPreview=null,arrivalTools=null;
let sharedTrack=null,trackGroups=new Map();
const rubles=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'});
const money=c=>rubles.format(c/100);
const groupedNumber=new Intl.NumberFormat('ru-RU');
function yuan(units){
 const fraction=String(units%10000n).padStart(4,'0').replace(/0{1,2}$/u,'');
 return groupedNumber.format(units/10000n)+','+fraction+' ¥';
}
const warehouseFlag='<svg class="warehouse-flag" viewBox="0 0 30 20" role="img" aria-label="Китай"><path fill="#de2910" d="M0 0h30v20H0z"/><g fill="#ffde00"><path d="M0-3 0.674-0.927 2.853-0.927 1.09 0.354 1.763 2.427 0 1.146-1.763 2.427-1.09 0.354-2.853-0.927-0.674-0.927Z" transform="translate(5 5)"/><path d="M0-3 0.674-0.927 2.853-0.927 1.09 0.354 1.763 2.427 0 1.146-1.763 2.427-1.09 0.354-2.853-0.927-0.674-0.927Z" transform="translate(10 2) scale(.34) rotate(23)"/><path d="M0-3 0.674-0.927 2.853-0.927 1.09 0.354 1.763 2.427 0 1.146-1.763 2.427-1.09 0.354-2.853-0.927-0.674-0.927Z" transform="translate(12 4) scale(.34) rotate(45)"/><path d="M0-3 0.674-0.927 2.853-0.927 1.09 0.354 1.763 2.427 0 1.146-1.763 2.427-1.09 0.354-2.853-0.927-0.674-0.927Z" transform="translate(12 7) scale(.34) rotate(15)"/><path d="M0-3 0.674-0.927 2.853-0.927 1.09 0.354 1.763 2.427 0 1.146-1.763 2.427-1.09 0.354-2.853-0.927-0.674-0.927Z" transform="translate(10 9) scale(.34) rotate(45)"/></g></svg>';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=s=>String(s??'').replace('.',',');const dateNow=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const uid=()=>crypto.randomUUID();const parcel=()=>state?.parcels.find(p=>p.id===selected);
function notice(text,error=false){$('#notice').hidden=!text;$('#notice').textContent=text;$('#notice').classList.toggle('error',error)}
async function api(method='GET',body){return method==='GET'?store.load():store.save(body.state,body.revision)}
async function commit(next,{selection,clientSelection:nextClient}={}){if(busy)throw Error('Дождитесь сохранения');validateState(next);busy=true;$('#saveStatus').textContent='Сохраняем…';try{const r=await api('PUT',{state:next,revision});state=next;revision=r.revision;if(selection!==undefined)selected=selection;if(nextClient!==undefined)clientSelection=nextClient;$('#saveStatus').textContent=store.mode==='telegram'?'Сохранено в вашем Telegram':'Сохранено в этом браузере';try{tg?.HapticFeedback?.notificationOccurred('success')}catch{}render()}catch(e){$('#saveStatus').textContent='Не сохранено';throw e}finally{busy=false}}

const client=()=>clientSelection==='*'?null:clientSelection==='self'?'':clientSelection.slice(7);
const scope=()=>scopedParcels(state,selected==='*'?null:selected,client());
function renderGroups(){
 const clients=clientList(state),chosen=client();
 if(chosen&&!clients.some(([key])=>key===chosen))clients.push([chosen,chosen]);
 $('#clientSelect').innerHTML='<option value="*">Все клиенты и мои покупки</option><option value="self">Для себя / без клиента</option>'+clients.map(([key,name])=>'<option value="client:'+esc(key)+'">'+esc(name)+'</option>').join('');$('#clientSelect').value=clientSelection;
 $('#parcelCount').textContent=state.parcels.length;
 const cards=scopedParcels(state,null,client()),all=scopeSummary(cards);
 $('#parcelCards').innerHTML='<button class="parcel-tile '+(selected==='*'?'selected':'')+'" data-parcel="*"><b>Все посылки</b><span>'+state.parcels.length+' посылок · '+all.count+' товаров</span><strong>'+money(all.delivery)+' доставка</strong></button>'+cards.map(p=>{const s=scopeSummary([p]);return '<div class="parcel-tile parcel-with-tariff '+(p.id===selected?'selected':'')+'" data-parcel="'+esc(p.id)+'" role="group" aria-label="Посылка '+esc(p.name)+'"><button class="parcel-open" data-parcel="'+esc(p.id)+'"><b>'+esc(p.name)+'</b><span>'+s.count+' товаров · '+num(s.weight.toFixed(3))+' кг</span><strong>'+money(s.delivery)+' доставка'+(s.pending?' · не вся':'')+'</strong></button><button class="parcel-tariff '+(p.tariff===null||p.tariff===''?'missing':'')+'" data-tariff="'+esc(p.id)+'" aria-label="Тариф доставки посылки '+esc(p.name)+'">'+(p.tariff===null||p.tariff===''?'＋ Указать тариф доставки':'Доставка: '+esc(num(p.tariff))+' ₽/кг · изменить')+'</button></div>'}).join('');
 const who=clientSelection==='*'?'Все покупки':clientSelection==='self'?'Для себя / без клиента':$('#clientSelect').selectedOptions[0]?.textContent||client();
 $('#scopeLabel').textContent=who+' · '+(parcel()?.name||'все посылки')+'. Итоги учитывают выбранного клиента. Поиск и статусы меняют только список товаров.';
 $('#exportScope').textContent=who+' · '+(parcel()?.name||'все посылки')+' · Excel / треки .txt';
 return who;
}

function render(){
 if(!state)return;
 if(selected!=='*'&&!state.parcels.some(p=>p.id===selected))selected=state.parcels[0]?.id||'*';
 trackGroups=groupByTrack(state.parcels);
 if(!trackGroups.has(sharedTrack))sharedTrack=null;
 const who=renderGroups();$('#parcelSelect').innerHTML='<option value="*">Все посылки</option>'+state.parcels.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');$('#parcelSelect').value=selected||'';
 const p=parcel();$('#addItem').disabled=!state.parcels.length;$('#parcelSettings').disabled=!p;$('#exportCsv').disabled=!state.parcels.length;$('#exportXlsx').disabled=!state.parcels.length;$('#exportTracks').disabled=!state.parcels.length;$('#importArrivals').disabled=!state.parcels.length;
 if(!state.parcels.length){showTrackView([]);$('#summary').innerHTML='';$('#count').textContent='0';$('#items').innerHTML='<li class="empty">Создайте первую посылку кнопкой ＋ сверху.</li>';return}
 const parcels=scope(),s=scopeSummary(parcels),weight=s.weight;
 $('#summary').innerHTML=`<div class="hero"><span class="label">${esc(who)} · ${s.pending?'Текущая сумма посылки':'Полная стоимость посылки'}</span><strong>${money(s.total)}</strong><small>${s.pending?`Доставка ещё не рассчитана для ${s.pending} из ${s.count} товаров`:'Покупки и доставка учтены'}</small></div><div class="stats"><div class="stat"><span>Покупки · ${s.count} поз.</span><strong>${money(s.goods)}</strong><span class="purchase-yuan" aria-label="Сумма покупок в юанях">${yuan(s.yuanUnits)}</span></div><div class="stat"><span>Доставка${s.pending?' · рассчитанная часть':''}</span><strong>${money(s.delivery)}</strong></div></div><div class="progressline"><span>На складе ${s.arrived} из ${s.count}</span><span>${num(weight.toFixed(3))} кг${p&&p.tariff!==null?' · '+num(p.tariff)+' ₽/кг':''}</span></div><div class="progress"><meter aria-label="Товары на складе" min="0" max="${s.count||1}" value="${s.arrived}"></meter></div>`;
 renderItems(parcels,s);
}
const trackCountLabel=count=>count+' '+(count%100>=11&&count%100<=14?'товаров':count%10===1?'товар':count%10>=2&&count%10<=4?'товара':'товаров');
function showTrackView(items){
 const active=sharedTrack!==null;
 $('#sharedTrackBar').hidden=!active;
 $('#productSearch').hidden=active;
 $('#filters').hidden=active;
 $('#sharedTrackLabel').textContent=active?'Трек: '+(items[0]?.i.track||sharedTrack):'';
}
function itemTrack(i){
 if(!i.track)return '';
 const count=trackGroups.get(trackKey(i.track))?.length??0;
 const badge=count>1?`<button type="button" class="track-count" data-shared="${esc(i.id)}">${trackCountLabel(count)} <span aria-hidden="true">›</span></button>`:'';
 return `<div class="track track-line"><span>Трек: ${esc(i.track)}</span>${badge}</div>`;
}
function itemActions(i,p){
 const edit=`data-edit="${esc(i.id)}" data-source="${esc(p.id)}"`;
 if(!trackKey(i.track))return `<button class="edit" ${edit} aria-label="Изменить ${esc(i.name)}">⋯</button>`;
 return `<details class="track-actions"><summary class="edit" aria-label="Действия для товара ${esc(i.name)}">⋯</summary><div class="track-actions-panel"><button type="button" ${edit}>Изменить товар</button><button type="button" data-add-track="${esc(i.id)}" data-source="${esc(p.id)}">＋ Добавить товар с этим треком</button></div></details>`;
}
function renderItems(parcels,s){
 if(!state)return;parcels??=scope();s??=scopeSummary(parcels);
 const search=$('#search').value;const items=sharedTrack?(trackGroups.get(sharedTrack)||[]):parcels.flatMap(p=>p.items.map(i=>({p,i}))).filter(({i})=>matchesSearch(i,search,$('#searchMode').value)).filter(({p,i})=>filter==='all'||filter==='waiting'&&!i.arrived||filter==='arrived'&&i.arrived||filter==='pending'&&calculate(i,p.tariff).delivery===null||filter==='checked'&&i.checked);
 showTrackView(items);
 $('#count').textContent=sharedTrack?items.length:items.length===s.count?items.length:`${items.length} / ${s.count}`;
 $('#items').innerHTML=items.length?items.map(({i,p})=>{const c=calculate(i,p.tariff);return `<li data-weight-pending="${i.weight==null||i.weight===''}" class="card ${i.checked?'verified color-'+esc(i.color||'green'):''}"><div class="cardhead"><div><h3 title="${esc(i.name)}">${esc(i.name)}</h3><div class="ownership"><span>${esc(clientName(i.client)||'Для себя / без клиента')}</span><span>▣ ${esc(p.name)}</span></div><span class="badge ${i.arrived?'arrived':''}">${i.arrived?warehouseFlag+'На складе':'◷ Ждём поступления'}</span>${itemTrack(i)}${i.date?`<div class="track">Поступление: ${esc(i.date.split('-').reverse().join('.'))}</div>`:''}</div>${itemActions(i,p)}</div><div class="cardgrid"><div><span>Цена товара</span><b>${money(c.goods)}</b><br><small>${esc(num(i.price))} ¥ × ${esc(num(i.rate))}</small></div><div><span>Вес</span><b>${i.weight===null?'Ещё неизвестен':esc(num(i.weight))+' кг'}</b></div><div><span>Доставка</span><b>${c.delivery===null?'Не рассчитана':money(c.delivery)}</b></div></div>${i.note?`<p class="note">${esc(i.note)}</p>`:''}<div class="cardfoot"><button class="statusbtn" data-toggle="${esc(i.id)}" data-source="${esc(p.id)}">${i.arrived?warehouseFlag+'На складе · изменить':'Отметить на складе'}</button><div>${c.delivery===null?'Пока':'Итого'} <strong>${money(c.total)}</strong></div></div><div class="verification"><button class="statusbtn" data-check="${esc(i.id)}" data-source="${esc(p.id)}">${i.checked?'✓ Получено и проверено · снять отметку':'Получено и проверено'}</button>${i.checked?'<span>Цвет можно изменить через ⋯</span>':''}</div></li>`}).join(''):'<li class="empty">Здесь пока нет товаров.<br>Добавьте покупку или измените фильтр.</li>';
 $('#filters').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));
}
const field=(name,label,value='',extra='')=>`<label>${label}<input name="${name}" value="${esc(value)}" ${extra}></label>`;
function itemClientPicker(parcel,current=''){
 const {clients}=parcelItemDefaults(parcel),name=clientName(current),key=name.toLocaleLowerCase('ru');
 const existing=clients.find(([id])=>id===key),mode=name?(existing?'existing:'+existing[0]:'new'):'self';
 return '<label>Клиент<select name="clientChoice" id="itemClientChoice"><option value="self" '+(mode==='self'?'selected':'')+'>Для себя / без клиента</option>'+clients.map(([id,name])=>'<option value="existing:'+esc(id)+'" '+(mode==='existing:'+id?'selected':'')+'>'+esc(name)+'</option>').join('')+'<option value="new" '+(mode==='new'?'selected':'')+'>＋ Новый клиент</option></select></label><label id="newClientLabel" '+(mode==='new'?'':'hidden')+'>Имя нового клиента<input name="client" maxlength="100" value="'+esc(existing?.[1]||name)+'" '+(mode==='new'?'required':'disabled')+' placeholder="Введите имя один раз"></label>';
}
function selectItemClient(){
 const f=$('#editorForm'),choice=f.elements.clientChoice.value,isNew=choice==='new';
 $('#newClientLabel').hidden=!isNew;f.elements.client.disabled=!isNew;f.elements.client.required=isNew;
 f.elements.client.value=choice.startsWith('existing:')?f.elements.clientChoice.selectedOptions[0].textContent:'';
}
function openEditor(type,id=null,sourceId=null,presetTrack=''){
 if(!state||busy)return;
 arrivalPreview=null;$('#saveRecord').textContent='Сохранить';$('#saveRecord').disabled=false;
 const p=(sourceId?state.parcels.find(p=>p.id===sourceId):parcel())||state.parcels[0],i=type==='item'&&id?p?.items.find(i=>i.id===id):null;editing={type,id,sourceId:type==='item'&&id?p.id:null};$('#formError').textContent='';$('#deleteRecord').hidden=!id||type==='tariff';$('#deleteRecord').textContent=type==='parcel'?'Удалить посылку':'Удалить товар';
 if(type==='arrival'){$('#dialogTitle').textContent='Поступление по списку';$('#deleteRecord').hidden=true;$('#saveRecord').textContent='Найти товары';$('#fields').innerHTML='<p class="help arrival-intro">Вставьте сообщение склада или загрузите .txt. Поддерживается и список «Ваши треки»: номер трека, затем дата на следующей строке. Можно вставить несколько страниц; раздел «Ожидание» пропускается. Ищем во всех ваших посылках и у всех клиентов, независимо от фильтров. Поступление будет отмечено после проверки списка.</p><button type="button" class="textbtn arrival-upload" id="loadArrivalText">↑ Загрузить .txt</button><input type="file" id="arrivalTextFile" accept=".txt,text/plain" hidden><label>Сообщение о прибытии<textarea name="arrivalText" id="arrivalText" maxlength="200000" placeholder="• JT1234567890123; Дата прибытия: 18.11.2026"></textarea></label><div id="arrivalResult"></div>';$('#loadArrivalText').onclick=()=>$('#arrivalTextFile').click();$('#arrivalTextFile').onchange=readArrivalFile}
 else if(type==='tariff'){$('#dialogTitle').textContent='Доставка посылки';$('#fields').innerHTML='<p class="tariff-parcel-name">'+esc(p.name)+'</p>'+field('tariff','Стоимость доставки за 1 кг, ₽',p.tariff??'','inputmode="decimal" placeholder="Например, 410"')+'<p class="help">Один тариф для всех товаров этой посылки. Доставка каждого товара = его вес × этот тариф. После сохранения все суммы пересчитаются автоматически.</p>'}
 else if(type==='parcel'){$('#dialogTitle').textContent=id?'Настройки посылки':'Новая посылка';$('#fields').innerHTML=field('name','Название посылки',id?p.name:'','required maxlength="100" placeholder="Например, Ноябрь"')+field('tariff','Доставка за 1 кг, ₽',id?p.tariff??'':'','inputmode="decimal" placeholder="Внесёте после получения"')+'<p class="help">Тариф применяется ко всем товарам этой посылки. Вес и цена каждого товара сохраняются отдельно.</p>'}
 else{$('#dialogTitle').textContent=i?'Изменить покупку':'Новая покупка';const defaultClient=i?.client??(clientSelection.startsWith('client:')?$('#clientSelect').selectedOptions[0]?.textContent||client():'');const defaultRate=i?.rate??parcelItemDefaults(p).rate;editing.rateDirty=false;$('#fields').innerHTML='<label>Посылка<select name="parcelId" required>'+state.parcels.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===p.id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label><p class="help">При переносе товара доставка пересчитается по тарифу новой посылки.</p>'+'<div id="itemClientPicker">'+itemClientPicker(p,defaultClient)+'</div>'+field('name','Название товара',i?.name||'','required maxlength="200" placeholder="Что заказали?"')+`<div class="pair">${field('price','Цена в юанях, ¥',i?.price??'','required inputmode="decimal" placeholder="129,36"')}${field('rate','Курс, ₽ за 1 ¥',defaultRate,'required inputmode="decimal" placeholder="Введите свой курс"')}</div><p class="help">Курс можно изменить для этой покупки.</p><div id="livecalc" class="livecalc">Укажите цену и курс</div>`+field('weight','Вес, кг',i?.weight??'','inputmode="decimal" placeholder="Например, 1,14"')+field('track','Трек-номер · необязательно',i?.track??presetTrack,'maxlength="100"')+`<label class="check"><input name="arrived" type="checkbox" ${i?.arrived?'checked':''}>Товар поступил на склад в Китае</label>`+field('date','Дата поступления · необязательно',i?.date||'','type="date"')+`<label class="check"><input name="checked" type="checkbox" ${i?.checked?'checked':''}>Получено и проверено</label><fieldset class="colorpicker"><legend>Цвет всей проверенной позиции</legend>${Object.entries(COLORS).map(([key,label])=>`<label class="swatch color-${key}" title="${label}"><input type="radio" name="color" value="${key}" ${(i?.color||'green')===key?'checked':''}><span>${label}</span></label>`).join('')}</fieldset><label>Заметка<textarea name="note" maxlength="1000">${esc(i?.note||'')}</textarea></label>`;updateLive()}
 document.body.classList.add('dialog-open');updateViewport();$('#editor').showModal();$('#fields').scrollTop=0;
 if(matchMedia('(max-width:700px)').matches)$('#editor').focus({preventScroll:true});else $('#fields input:not([type=file]):not(:disabled),#fields textarea').focus({preventScroll:true});
}
function updateLive(event){if(editing?.type==='arrival'){arrivalPreview=null;$('#arrivalResult').innerHTML='';$('#formError').textContent='';$('#saveRecord').textContent='Найти товары';$('#saveRecord').disabled=false;return}if(editing?.type!=='item')return;const f=$('#editorForm');
 if(event?.target.name==='rate')editing.rateDirty=true;
 if(event?.type==='change'&&event.target.name==='clientChoice')selectItemClient();
 if(event?.type==='change'&&event.target.name==='parcelId'){
  const target=state.parcels.find(p=>p.id===f.elements.parcelId.value);
  $('#itemClientPicker').innerHTML=itemClientPicker(target,f.elements.client.value);
  if(!editing.id&&!editing.rateDirty)f.elements.rate.value=parcelItemDefaults(target).rate;
 }
 try{const c=calculate({price:f.elements.price.value,rate:f.elements.rate.value,weight:f.elements.weight.value||null},state.parcels.find(p=>p.id===f.elements.parcelId.value).tariff);$('#livecalc').textContent=`Товар: ${money(c.goods)}${c.delivery!==null?' · Доставка: '+money(c.delivery)+' · Итого: '+money(c.total):(state.parcels.find(p=>p.id===f.elements.parcelId.value).tariff==null||state.parcels.find(p=>p.id===f.elements.parcelId.value).tariff===''?' · Укажите тариф доставки в карточке посылки':' · Укажите вес товара для расчёта доставки')}`}catch{$('#livecalc').textContent='Введите цену и курс; вес можно добавить позже'}}
$('#importArrivals').onclick=()=>openEditor('arrival');
$('#newParcel').onclick=$('#newParcelWide').onclick=()=>openEditor('parcel');$('#parcelSettings').onclick=()=>openEditor('parcel',selected);$('#addItem').onclick=()=>openEditor('item');$('#closeDialog').onclick=()=>$('#editor').close();$('#parcelSelect').onchange=e=>{selected=e.target.value;render()};$('#clientSelect').onchange=e=>{clientSelection=e.target.value;render()};$('#parcelCards').onclick=e=>{const t=e.target.closest('[data-tariff]');if(t){const id=t.dataset.tariff;selected=id;render();openEditor('tariff',id,id);return}const b=e.target.closest('[data-parcel]');if(b){selected=b.dataset.parcel;render()}};let searchFrame;$('#search').oninput=()=>{cancelAnimationFrame(searchFrame);searchFrame=requestAnimationFrame(()=>renderItems())};$('#searchMode').onchange=()=>{$('#search').placeholder=$('#searchMode').value==='track'?'Введите трек или его часть':'Название или трек-номер';renderItems()};
$('#filters').onclick=e=>{if(e.target.dataset.filter){filter=e.target.dataset.filter;renderItems()}};
$('#leaveSharedTrack').onclick=()=>{
 sharedTrack=null;renderItems();
 $('#items').querySelector('[data-shared]')?.focus({preventScroll:true});
};
document.addEventListener('click',event=>{
 const clicked=event.target.closest('.track-actions');
 document.querySelectorAll('.track-actions[open]').forEach(menu=>{if(menu!==clicked)menu.open=false});
});
$('#items').addEventListener('keydown',event=>{
 const menu=event.target.closest('.track-actions[open]');
 if(event.key==='Escape'&&menu){menu.open=false;menu.querySelector('summary')?.focus()}
});
$('#items').onclick=async e=>{
 const related=e.target.closest('[data-shared]');
 if(related){
  const item=state.parcels.flatMap(p=>p.items).find(i=>i.id===related.dataset.shared);
  if(!item)return;
  sharedTrack=trackKey(item.track);renderItems();
  $('#leaveSharedTrack').focus({preventScroll:true});
  $('#sharedTrackBar').scrollIntoView({block:'nearest'});
  return;
 }
 const add=e.target.closest('[data-add-track]');
 if(add){
  const item=state.parcels.find(p=>p.id===add.dataset.source)?.items.find(i=>i.id===add.dataset.addTrack);
  if(item){add.closest('details').open=false;openEditor('item',null,add.dataset.source,item.track)}
  return;
 }
 const edit=e.target.closest('[data-edit]'),toggle=e.target.closest('[data-toggle]'),check=e.target.closest('[data-check]');if(edit){const menu=edit.closest('details');if(menu)menu.open=false;openEditor('item',edit.dataset.edit,edit.dataset.source)}if((toggle||check)&&!busy){const next=structuredClone(state),i=next.parcels.find(p=>p.id===(toggle||check).dataset.source).items.find(i=>i.id===(toggle?.dataset.toggle||check?.dataset.check));if(check){i.checked=!i.checked;i.color=i.color||'green'}else i.arrived=!i.arrived;try{await commit(next)}catch(e){notice(e.message,true)}}};
$('#editorForm').oninput=$('#editorForm').onchange=updateLive;
$('#editorForm').onsubmit=async e=>{e.preventDefault();if(busy)return;if(editing?.type==='arrival'){await submitArrivals();return}const f=e.target,v=name=>f.elements[name].value.trim().replace(',','.');let next=structuredClone(state),newId,nextClient;
 try{if(editing.type==='tariff'){next.parcels.find(p=>p.id===editing.id).tariff=v('tariff')||null}
 else if(editing.type==='parcel'){const p={...(editing.id?next.parcels.find(p=>p.id===editing.id):{}),id:editing.id||uid(),name:f.elements.name.value.trim(),tariff:v('tariff')||null,items:editing.id?next.parcels.find(p=>p.id===editing.id).items:[]};if(editing.id)next.parcels[next.parcels.findIndex(p=>p.id===editing.id)]=p;else{next.parcels.unshift(p);newId=p.id}}
 else{const i={id:editing.id||uid(),name:f.elements.name.value.trim(),client:clientName(f.elements.client.value),price:v('price'),rate:v('rate'),weight:v('weight')||null,track:f.elements.track.value.trim(),arrived:f.elements.arrived.checked,date:f.elements.date.value,note:f.elements.note.value.trim(),checked:f.elements.checked.checked,color:f.elements.color.value};if(i.date&&!i.arrived)throw Error('Для даты поступления отметьте «Товар поступил на склад»');next=putItem(state,editing.sourceId,f.elements.parcelId.value,i);newId=selected==='*'?'*':f.elements.parcelId.value;if(clientSelection!=='*')nextClient=i.client?'client:'+i.client.toLocaleLowerCase('ru'):'self'}
 $('#saveRecord').disabled=true;await commit(next,{selection:newId,clientSelection:nextClient});$('#editor').close();
 }catch(e){$('#formError').textContent=e.message}finally{$('#saveRecord').disabled=false}};
$('#deleteRecord').onclick=async()=>{if(busy)return;const p=parcel();if(!confirm(editing.type==='parcel'?`Удалить посылку «${p.name}» и все её товары?`:'Удалить этот товар?'))return;const next=structuredClone(state);if(editing.type==='parcel')next.parcels=next.parcels.filter(p=>p.id!==editing.id);else next.parcels.find(p=>p.id===editing.sourceId).items=next.parcels.find(p=>p.id===editing.sourceId).items.filter(i=>i.id!==editing.id);try{await commit(next);$('#editor').close()}catch(e){$('#formError').textContent=e.message}};
function download(name,data,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([data],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('#exportXlsx').onclick=async()=>{if(!state?.parcels.length||busy)return;const button=$('#exportXlsx');button.disabled=true;button.textContent='Готовим Excel…';try{const title=(parcel()?.name||'Все посылки')+(client()===null?'':' — '+(client()||'Для себя'));const {exportXlsx}=await import('./xlsx.mjs');const bytes=exportXlsx(scope(),title);const filename=(title.replace(/[\\/:*?"<>|]/g,'-').slice(0,90)||'Покупки')+'.xlsx';const file=new File([bytes],filename,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});if(tg?.initData&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Мои посылки'});notice('Выберите сохранение файла или отправку через меню телефона.')}else{download(filename,bytes,file.type);notice('Excel готов. Откройте загрузки браузера; на iPhone используйте «Поделиться» → «Сохранить в Файлы».')}}catch(e){if(e.name!=='AbortError')notice(e.message||'Не удалось скачать Excel',true)}finally{button.disabled=false;button.textContent='↓ Скачать Excel'}};
$('#exportTracks').onclick=async()=>{
 if(!state?.parcels.length||busy)return;
 const button=$('#exportTracks');button.disabled=true;
 try{
  const tracks=trackList(scope());if(!tracks.length){notice('В выбранных посылках у этого клиента пока нет трек-номеров.');return}
  const filename='треки-'+dateNow()+'.txt',text=tracks.join('\r\n')+'\r\n';
  const file=new File([text],filename,{type:'text/plain;charset=utf-8'});
  if(tg?.initData&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Трек-номера'});notice('Список готов: '+tracks.length+' треков. В меню телефона можно сохранить или отправить файл.')}
  else{download(filename,text,file.type);notice('Скачан список: '+tracks.length+' треков, каждый с новой строки. Без повторов, названий и цен.')}
 }catch(e){if(e.name!=='AbortError')notice(e.message||'Не удалось выгрузить треки',true)}
 finally{button.disabled=false}
};
$('#shareApp').onclick=async()=>{const url='https://uskovaflame-code.github.io/opyat-posylka-app/';try{if(navigator.share)await navigator.share({title:'Это последнее, честно',text:'Приложение для покупок и посылок 📦',url});else if(tg?.initData)tg.openTelegramLink('https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent('Это последнее, честно 📦'));else{await navigator.clipboard.writeText(url);notice('Ссылка скопирована. Отправьте её подруге — её список покупок начнётся с нуля.')}}catch(e){if(e.name!=='AbortError')notice('Ссылка для подруги: '+url)}};
$('#backup').onclick=()=>{if(state)download('мои-покупки-'+dateNow()+'.json',JSON.stringify({format:'china-purchases-v1',state},null,2),'application/json')};
$('#restore').onclick=()=>$('#restoreFile').click();$('#restoreFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>4000000)throw Error('Файл слишком большой');const data=JSON.parse(await file.text());if(data.format!=='china-purchases-v1')throw Error('Выберите копию данных этого приложения');validateState(data.state);if(!confirm(`Заменить текущие данные? В копии ${data.state.parcels.length} посылок. Сначала сохраните копию текущих данных.`))return;await commit(data.state);notice('Данные восстановлены')}catch(e){notice(e.message,true)}finally{e.target.value=''}};
$('#exportCsv').onclick=()=>{if(!state?.parcels.length)return;const rows=[['Товар','Дата склада','Трек','Цена, ¥','Курс, ₽/¥','Цена, ₽','Вес, кг','Тариф, ₽/кг','Доставка, ₽','Итого, ₽','Статус','Клиент','Посылка'],...scope().flatMap(p=>p.items.map(i=>{const c=calculate(i,p.tariff);return[i.name,i.date,i.track,i.price,i.rate,(c.goods/100).toFixed(2),i.weight??'',p.tariff??'',c.delivery===null?'':(c.delivery/100).toFixed(2),(c.total/100).toFixed(2),i.arrived?'На складе':'Ждём склад',i.client||'Для себя / без клиента',p.name]}))];const quote=v=>'"'+String(/^[=+\-@\t\r]/.test(String(v))?"'"+v:v).replaceAll('"','""')+'"';download('покупки-'+dateNow()+'.csv','\uFEFF'+rows.map(r=>r.map(quote).join(';')).join('\r\n'),'text/csv;charset=utf-8')};
try{const r=await api();state=r.state;revision=r.revision;validateState(state);$('#saveStatus').textContent=store.mode==='telegram'?'Сохранено в вашем Telegram':'Сохранено в этом браузере';if(r.mode==='browser')notice('В браузере покупки сохраняются только на этом устройстве. Для личного облачного сохранения откройте приложение через @opyatposylka_bot в Telegram.');else notice('Ваши покупки сохраняются отдельно в вашем аккаунте Telegram.');render()}catch(e){notice(e.message,true);$('#items').innerHTML='<li class="empty">Не удалось открыть покупки. Проверьте подключение и обновите страницу.</li>';$('#saveStatus').textContent='Нет подключения';$('#addItem').disabled=true;$('#newParcel').disabled=true;$('#newParcelWide').disabled=true;$('#parcelSettings').disabled=true}

// Follow the visible viewport, including an on-screen keyboard and Telegram resizing.
let viewportFrame;
function updateViewport(){cancelAnimationFrame(viewportFrame);viewportFrame=requestAnimationFrame(()=>{const v=window.visualViewport;const height=Math.min(v?.height||innerHeight,tg?.viewportHeight||innerHeight);document.documentElement.style.setProperty('--usable-height',height+'px');document.documentElement.style.setProperty('--viewport-top',(v?.offsetTop||0)+'px');const active=document.activeElement;if($('#editor').open&&active?.closest('#fields'))active.scrollIntoView({block:'nearest',behavior:'instant'})})}
window.visualViewport?.addEventListener('resize',updateViewport);window.visualViewport?.addEventListener('scroll',updateViewport);window.addEventListener('resize',updateViewport);tg?.onEvent?.('viewportChanged',updateViewport);updateViewport();
$('#editor').addEventListener('close',()=>document.body.classList.remove('dialog-open'));
$('#fields').addEventListener('focusin',e=>{if(e.target.matches('input,select,textarea'))requestAnimationFrame(()=>e.target.scrollIntoView({block:'nearest',behavior:'instant'}))});


async function readArrivalFile(event){
 const file=event.target.files[0];if(!file)return;
 try{
  if(file.size>600000)throw Error('Файл слишком большой. Загрузите текстовый файл до 600 КБ.');
  const bytes=new Uint8Array(await file.arrayBuffer());let text;
  try{const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';text=new TextDecoder(encoding,{fatal:true}).decode(bytes)}catch{throw Error('Не удалось прочитать текст. Сохраните .txt в UTF-8 или вставьте сообщение вручную.')}
  if(text.length>200000)throw Error('В файле слишком много текста. Вставьте только сообщение о прибытии.');
  $('#arrivalText').value=text;updateLive();
 }catch(error){$('#formError').textContent=error.message}finally{event.target.value=''}
}
function arrivalDate(value){return value.split('-').reverse().join('.')}
function showArrivalPreview(plan){
 const show=(list,render)=>list.slice(0,200).map(render).join('')+(list.length>200?'<li>И ещё '+(list.length-200)+' записей.</li>':'');
 const items=show(plan.changes,item=>'<li><strong>'+esc(item.name)+'</strong><span>'+esc(item.client||'Для себя / без клиента')+' · '+esc(item.parcelName)+'</span><span class="arrival-track">'+esc(item.track)+'</span><b>🇨🇳 '+esc(arrivalDate(item.arrivalDate))+'</b></li>');
 let html='<p class="arrival-summary" role="status">'+(plan.changes.length?'Товаров к отметке: '+plan.changes.length+'.':'Новых отметок нет.')+'</p>';
 if(items)html+='<ul class="arrival-matches" aria-label="Товары к поступлению">'+items+'</ul>';
 if(plan.already.length)html+='<p class="help">Уже отмечено с этой датой: '+plan.already.length+'. Повторно не изменятся.</p>';
 if(plan.unknown.length)html+='<details open><summary>Треки не найдены: '+plan.unknown.length+'</summary><ul class="arrival-warnings">'+show(plan.unknown,row=>'<li>'+esc(row.track)+'</li>')+'</ul></details>';
 if(plan.dateConflicts.length)html+='<details open><summary>Другая дата в карточке: '+plan.dateConflicts.length+'</summary><ul class="arrival-warnings">'+show(plan.dateConflicts,row=>'<li><strong>'+esc(row.name)+'</strong> · '+esc(row.parcelName)+'<br>'+esc(row.track)+'<br>В карточке '+esc(arrivalDate(row.date))+', в сообщении '+esc(arrivalDate(row.arrivalDate))+'. Этот товар не изменится.</li>')+'</ul></details>';
 if(plan.issues.length)html+='<details open><summary>Строки, требующие проверки: '+plan.issues.length+'</summary><ul class="arrival-warnings">'+show(plan.issues,row=>'<li>'+esc(row.track||('Строка '+row.line))+': '+esc(row.reason)+(row.text?'<br>'+esc(row.text.slice(0,180)):'')+'</li>')+'</ul></details>';
 $('#arrivalResult').innerHTML=html;
}
async function submitArrivals(){
 const button=$('#saveRecord'),text=$('#arrivalText').value;
 button.disabled=true;$('#formError').textContent='';
 try{
  if(!text.trim())throw Error('Вставьте сообщение или загрузите .txt.');
  arrivalTools??=await import('./arrivals.mjs?v=20261122-arrival-pages');
  if(!arrivalPreview||arrivalPreview.text!==text||arrivalPreview.revision!==revision){
   const parsed=arrivalTools.parseArrivalText(text);
   if(!parsed.entries.length&&!parsed.issues.length)throw Error('Не найден список с датами. Укажите трек и «Дата прибытия: 18.11.2026» на одной строке через «;» или на двух соседних строках.');
   const plan=arrivalTools.planArrivals(state,parsed);arrivalPreview={text,revision,plan};showArrivalPreview(plan);$('#arrivalResult').scrollIntoView({block:'start',behavior:'instant'});
   button.textContent=plan.changes.length?'Отметить поступление ('+plan.changes.length+')':'Нет новых поступлений';
  }else{
   const count=arrivalPreview.plan.changes.length;if(!count)return;
   await commit(arrivalTools.applyArrivals(state,arrivalPreview.plan));$('#editor').close();arrivalPreview=null;notice('🇨🇳 Поступление отмечено. Товаров обновлено: '+count+'. Даты взяты из сообщения.');
  }
 }catch(error){$('#formError').textContent=error.message}
 finally{button.disabled=!!(arrivalPreview&&!arrivalPreview.plan.changes.length)}
}
