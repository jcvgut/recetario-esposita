import {normalize,validateRecipe,parseBackup,makeBackup,openDatabase,dbRead,dbWrite,fingerprint,MAX_BACKUP_BYTES} from './data.js';
const $=id=>document.getElementById(id);
const state={db:null,recipes:[],tab:'recipes',current:null,draft:null,original:'',loading:false,backupUrl:null,offlineReady:false};
let toastTimer,draftTimer,draftQueue=Promise.resolve(),backupDirty=true;
const icon=name=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('icon');svg.setAttribute('aria-hidden','true');const use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href','#i-'+name);svg.append(use);return svg;};
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
function error(e){console.error(e);toast(e?.name==='QuotaExceededError'?'No hay espacio suficiente. Guarda una copia y libera espacio antes de continuar.':e?.message||'No se pudo completar. Tus recetas se conservan.');}
function loading(value,label='Guardando…'){state.loading=value;$('busy').hidden=!value;$('busy-text').textContent=label;}
function openDialog(el){el.showModal();document.body.classList.add('modal-open');}
function closeDialog(el){el.close();if(!document.querySelector('dialog[open]'))document.body.classList.remove('modal-open');}
function confirmAction(title,body,label='Continuar'){
 return new Promise(resolve=>{
  const d=$('confirm-dialog');$('confirm-title').textContent=title;$('confirm-body').textContent=body;$('confirm-yes').textContent=label;
  const finish=value=>{closeDialog(d);$('confirm-no').onclick=null;$('confirm-yes').onclick=null;d.oncancel=null;resolve(value);};
  $('confirm-no').onclick=()=>finish(false);$('confirm-yes').onclick=()=>finish(true);d.oncancel=e=>{e.preventDefault();finish(false);};openDialog(d);
 });
}
function empty(message,body){const box=document.createElement('div');box.className='empty-state';box.append(icon(state.tab==='favorites'?'heart':'book'));const h=document.createElement('h3');h.textContent=message;const p=document.createElement('p');p.textContent=body;box.append(h,p);return box;}
function render(){
 const list=$('recipe-list');list.replaceChildren();const query=normalize($('search').value.trim());
 const rows=state.recipes.filter(r=>(state.tab!=='favorites'||r.favorite)&&normalize(r.title).includes(query)).sort((a,b)=>a.title.localeCompare(b.title,'es',{sensitivity:'base'}));
 $('collection-title').textContent=state.tab==='favorites'?'Mis favoritas':'Mis recetas';$('recipe-count').textContent=rows.length+(rows.length===1?' receta':' recetas');
 if(!rows.length){list.append(empty(query?'Ese sabor aún no aparece':state.tab==='favorites'?'Tus favoritas, cerquita':'Aquí empieza tu libro',query?'Prueba con otro nombre.':state.tab==='favorites'?'Toca el corazón de una receta para guardarla aquí.':'Guarda tu primera receta y haz de este rincón algo tuyo.'));return;}
 for(const recipe of rows){
  const card=document.createElement('div');card.className='recipe-card';
  const open=document.createElement('button');open.className='card-open';open.setAttribute('aria-label','Abrir receta: '+recipe.title);open.onclick=()=>readRecipe(recipe.id);
  let cover;if(recipe.image){cover=document.createElement('img');cover.src=recipe.image;cover.alt='';cover.loading='lazy';cover.decoding='async';}else{cover=document.createElement('span');cover.append(icon('book'));}cover.className='cover';
  const words=document.createElement('span');words.className='card-words';const h=document.createElement('h3');h.textContent=recipe.title;const p=document.createElement('p');p.textContent=recipe.body.trim().replace(/\s+/g,' ').slice(0,120)||'Un nuevo recuerdo para tu cocina';words.append(h,p);open.append(cover,words);
  const favorite=document.createElement('button');favorite.className='heart-button'+(recipe.favorite?' is-favorite':'');favorite.setAttribute('aria-label',(recipe.favorite?'Quitar de favoritas: ':'Añadir a favoritas: ')+recipe.title);favorite.setAttribute('aria-pressed',String(!!recipe.favorite));favorite.append(icon('heart'));favorite.onclick=()=>toggleFavorite(recipe.id);
  card.append(open,favorite);list.append(card);
 }
}
function selectTab(tab){if(state.loading)return;state.tab=tab;$('settings-view').hidden=tab!=='settings';$('recipes-view').hidden=tab==='settings';for(const name of ['recipes','favorites','settings']){const button=$('tab-'+name);button.classList.toggle('selected',name===tab);if(name===tab)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}if(tab==='settings')prepareBackup().catch(error);else render();window.scrollTo({top:0});}
function refreshFavorite(){const r=state.recipes.find(r=>r.id===state.current);if(!r)return;const b=$('reader-favorite');b.replaceChildren(icon('heart'),document.createTextNode(r.favorite?'Una de tus favoritas':'Guardar en favoritas'));b.classList.toggle('is-favorite',!!r.favorite);b.setAttribute('aria-pressed',String(!!r.favorite));}
async function toggleFavorite(id){
 if(state.loading)return;const r=state.recipes.find(r=>r.id===id);if(!r)return;loading(true);
 try{const next={...r,favorite:!r.favorite,updated:Date.now()};await dbWrite(state.db,'recipes',s=>s.put(next));state.recipes=state.recipes.map(x=>x.id===id?next:x);backupDirty=true;render();refreshFavorite();}catch(e){error(e);}finally{loading(false);}
}
function readRecipe(id){const r=state.recipes.find(r=>r.id===id);if(!r)return;state.current=id;$('reader-title').textContent=r.title;$('reader-body').textContent=r.body||'Esta receta se guarda con su imagen.';$('reader-photo-button').hidden=!r.image;if(r.image)$('reader-photo').src=r.image;else $('reader-photo').removeAttribute('src');refreshFavorite();if(!$('reader').open)openDialog($('reader'));$('reader').scrollTop=0;}
function editorValue(){return {title:$('recipe-title').value,body:$('recipe-text').value,image:state.draft?.image||null,favorite:!!state.draft?.favorite};}
function dirty(){return JSON.stringify(editorValue())!==state.original;}
function updateImage(){const image=state.draft.image;$('choose-image').hidden=!!image;$('image-preview-box').hidden=!image;if(image)$('image-preview').src=image;else $('image-preview').removeAttribute('src');}
function openEditor(recipe=null,restored=false){state.draft=recipe?{...recipe}:{id:null,title:'',body:'',image:null,favorite:false};$('recipe-title').value=state.draft.title;$('recipe-text').value=state.draft.body;$('editor-heading').textContent=state.draft.id?'Un toque a tu receta.':'Una nueva receta.';updateImage();state.original=restored?'':JSON.stringify(editorValue());if($('reader').open)closeDialog($('reader'));openDialog($('editor'));$('editor').scrollTop=0;}
function queueDraft(){clearTimeout(draftTimer);if(!$('editor').open)return;const draft={...state.draft,...editorValue()};draftQueue=draftQueue.then(()=>dbWrite(state.db,'meta',s=>s.put({key:'draft',value:draft}))).catch(()=>toast('No se pudo guardar el borrador. Mantén la pantalla abierta y pulsa Guardar.'));}
function scheduleDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(queueDraft,500);}
async function clearDraft(){clearTimeout(draftTimer);await draftQueue;await dbWrite(state.db,'meta',s=>s.delete('draft'));}
async function cancelEditor(){if(state.loading)return;if(dirty()&&!await confirmAction('¿Salir sin guardar?','Los cambios de esta receta se perderán. Puedes seguir editándola.','Salir'))return;try{await clearDraft();closeDialog($('editor'));state.draft=null;}catch(e){error(e);}}
async function saveRecipe(e){
 e.preventDefault();if(state.loading)return;let fields;try{fields=validateRecipe(editorValue());}catch(e){error(e);return;}loading(true,'Guardando tu receta…');
 try{const recipe={...fields,id:state.draft.id||crypto.randomUUID(),updated:Date.now()};await dbWrite(state.db,'recipes',s=>s.put(recipe));state.recipes=state.recipes.filter(x=>x.id!==recipe.id).concat(recipe);backupDirty=true;await clearDraft();closeDialog($('editor'));state.draft=null;render();readRecipe(recipe.id);toast('Una receta más, guardada con amor ♡');if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});}catch(e){error(e);}finally{loading(false);}
}
function loadImage(source){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('No se pudo abrir la imagen. Prueba con una captura de pantalla o una imagen JPG o PNG.'));img.src=source;});}
async function chooseImage(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>30*1024*1024){toast('Elige una imagen de menos de 30 MB.');return;}loading(true,'Preparando tu imagen…');let url;
 try{url=URL.createObjectURL(file);const img=await loadImage(url);const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);let quality=.88,image;do{image=canvas.toDataURL('image/jpeg',quality);quality-=.1;}while(image.length>1500000&&quality>=.38);if(image.length>2800000)throw new Error('Esta imagen ocupa demasiado. Prueba una captura más pequeña.');state.draft.image=image;updateImage();queueDraft();}catch(e){error(e);}finally{if(url)URL.revokeObjectURL(url);loading(false);}
}
async function deleteRecipe(){if(state.loading)return;const r=state.recipes.find(r=>r.id===state.current);if(!r)return;if(!await confirmAction('¿Eliminar esta receta?','Se eliminará «'+r.title+'». Esta acción no se puede deshacer.','Eliminar'))return;loading(true);try{await dbWrite(state.db,'recipes',s=>s.delete(r.id));state.recipes=state.recipes.filter(x=>x.id!==r.id);backupDirty=true;closeDialog($('reader'));render();toast('Receta eliminada.');}catch(e){error(e);}finally{loading(false);}}
async function prepareBackup(){if(!backupDirty&&state.backupUrl)return;const raw=makeBackup(state.recipes);const blob=new Blob([raw],{type:'application/json'});if(blob.size>MAX_BACKUP_BYTES)throw new Error('Tu colección supera los 100 MB por copia de esta versión.');if(state.backupUrl)URL.revokeObjectURL(state.backupUrl);state.backupBlob=blob;state.backupName='recetario-'+new Date().toISOString().slice(0,10)+'.json';state.backupUrl=URL.createObjectURL(blob);const a=$('backup-download');a.href=state.backupUrl;a.download=state.backupName;a.hidden=true;backupDirty=false;}
async function exportBackup(){if(state.loading)return;try{await prepareBackup();const file=new File([state.backupBlob],state.backupName,{type:'application/json'});$('backup-download').hidden=false;if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Copia de mi recetario'});toast('Si guardaste el archivo, tu copia está lista.');}else{$('backup-download').click();toast('Guarda el archivo descargado fuera de la aplicación.');}}catch(e){if(e.name!=='AbortError')error(e);}}
async function importBackup(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>MAX_BACKUP_BYTES){toast('Elige una copia de menos de 100 MB.');return;}loading(true,'Revisando tu copia…');let recipes;
 try{recipes=parseBackup(await file.text());for(const r of recipes)if(r.image){const img=await loadImage(r.image);if(img.naturalWidth>4096||img.naturalHeight>4096)throw new Error('La copia contiene una imagen demasiado grande.');}}catch(e){error(e);return;}finally{loading(false);}
 if(!recipes.length){toast('La copia no contiene recetas.');return;}
 if(!await confirmAction('Recuperar '+recipes.length+' recetas','Se añadirán a tu recetario. Las que ya tienes se conservarán y las recetas exactamente iguales no se duplicarán.','Recuperar'))return;
 loading(true,'Recuperando tus sabores…');try{
  const existing=new Set();for(const r of state.recipes)existing.add(await fingerprint(r));const additions=[];
  for(const r of recipes){const key=await fingerprint(r);if(existing.has(key))continue;existing.add(key);additions.push({...r,id:crypto.randomUUID(),updated:Date.now()});}
  await dbWrite(state.db,'recipes',s=>{for(const r of additions)s.add(r);});state.recipes.push(...additions);backupDirty=true;await prepareBackup();render();toast(additions.length+' recetas recuperadas.');
 }catch(e){error(e);}finally{loading(false);}
}
function connection(){ $('connection-label').textContent=state.offlineReady?'Lista sin internet':navigator.onLine?'En tu dispositivo':'Sin conexión';}
async function setupOffline(){
 const status=$('offline-status');if(!('serviceWorker' in navigator)||!window.isSecureContext){status.textContent='Abre la dirección HTTPS publicada para descargar el uso sin internet.';return;}
 try{const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});await navigator.serviceWorker.ready;
  state.offlineReady=true;status.textContent='Lista para crear y consultar recetas e imágenes sin conexión.';connection();
  registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)toast('Hay una actualización. Cierra y vuelve a abrir el recetario cuando termines de editar.');});});
 }catch{status.textContent='Aún no está lista sin conexión. Con internet, cierra y vuelve a abrir la aplicación.';}
}
$('new-recipe').onclick=()=>openEditor();$('tab-recipes').onclick=()=>selectTab('recipes');$('tab-favorites').onclick=()=>selectTab('favorites');$('tab-settings').onclick=()=>selectTab('settings');document.querySelector('.brand').onclick=e=>{e.preventDefault();selectTab('recipes');};
$('search').oninput=render;$('reader-back').onclick=()=>closeDialog($('reader'));$('reader-edit').onclick=()=>openEditor(state.recipes.find(r=>r.id===state.current));$('reader-favorite').onclick=()=>toggleFavorite(state.current);$('delete-recipe').onclick=deleteRecipe;
$('recipe-form').onsubmit=saveRecipe;$('cancel-editor').onclick=cancelEditor;$('editor').oncancel=e=>{e.preventDefault();cancelEditor();};$('recipe-title').oninput=scheduleDraft;$('recipe-text').oninput=scheduleDraft;
$('choose-image').onclick=()=>$('image-input').click();$('image-input').onchange=chooseImage;$('remove-image').onclick=()=>{state.draft.image=null;updateImage();queueDraft();};
$('reader-photo-button').onclick=()=>{$('full-photo').src=$('reader-photo').src;openDialog($('photo-viewer'));};$('close-photo').onclick=()=>closeDialog($('photo-viewer'));
for(const id of ['reader','photo-viewer'])$(id).addEventListener('close',()=>{if(!document.querySelector('dialog[open]'))document.body.classList.remove('modal-open');});
$('export').onclick=exportBackup;$('import').onclick=()=>$('backup-input').click();$('backup-input').onchange=importBackup;
window.addEventListener('online',connection);window.addEventListener('offline',connection);
window.addEventListener('beforeunload',e=>{if($('editor').open&&dirty()){queueDraft();e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')queueDraft();});
async function init(){loading(true,'Abriendo tu recetario…');try{
 state.db=await openDatabase();state.recipes=await dbRead(state.db,'recipes');render();const draft=await dbRead(state.db,'meta','draft');loading(false);
 if(draft?.value&&await confirmAction('Te quedó una receta pendiente','Encontramos un borrador sin guardar. ¿Quieres seguir donde lo dejaste?','Continuar'))openEditor(draft.value,true);
 else if(draft)await dbWrite(state.db,'meta',s=>s.delete('draft'));
 }catch(e){error(e);$('new-recipe').disabled=true;$('export').disabled=true;$('import').disabled=true;$('recipe-list').replaceChildren(empty('No pudimos abrir tu recetario','Cierra y vuelve a abrir la aplicación. Si estás en navegación privada, usa una ventana normal.'));}finally{loading(false);}connection();setupOffline();}
init();
