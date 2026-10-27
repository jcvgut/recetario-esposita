export const BACKUP_FORMAT = 'recetario-esposita';
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
export function normalize(value) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es'); }
export function validateRecipe(value) {
 if (!value || typeof value !== 'object' || typeof value.title !== 'string' || !value.title.trim() || value.title.length>300 || typeof value.body !== 'string' || value.body.length>100000) throw new Error('Hay una receta con título o texto no válido.');
 let image=value.image || null;
 if(image !== null && (typeof image!=='string' || image.length>2800000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)))throw new Error('La copia contiene una imagen no compatible.');
 return {title:value.title.trim(),body:value.body,image,favorite:value.favorite===true};
}
export function parseBackup(raw) {
 if(typeof raw!=='string' || new TextEncoder().encode(raw).length>MAX_BACKUP_BYTES)throw new Error('La copia supera el límite de 100 MB.');
 let data;try{data=JSON.parse(raw);}catch{throw new Error('El archivo no es una copia JSON válida.');}
 if(!data || data.format!==BACKUP_FORMAT || data.version!==1 || !Array.isArray(data.recipes))throw new Error('Este archivo no es una copia compatible del recetario.');
 return data.recipes.map(r=>{
  if(!r||typeof r!=='object')throw new Error('La copia contiene una receta no válida.');
  let image=r.image||null;
  // Las copias Android guardan el JPEG como base64 sin prefijo.
  if(image && typeof image==='string' && !image.startsWith('data:'))image='data:image/jpeg;base64,'+image;
  return validateRecipe({...r,image});
 });
}
export function makeBackup(recipes) { return JSON.stringify({format:BACKUP_FORMAT,version:1,createdAt:new Date().toISOString(),recipes:recipes.map(validateRecipe)}); }
export function openDatabase() {
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('recetario-esposita',1);
  request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('recipes',{keyPath:'id'});db.createObjectStore('meta',{keyPath:'key'});};
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
  request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Cierra las otras ventanas del recetario y vuelve a abrirlo.'));
 });
}
export function dbRead(db,store,key) {
 return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly');const request=key===undefined?tx.objectStore(store).getAll():tx.objectStore(store).get(key);let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
export function dbWrite(db,store,operation) {
 return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');try{operation(tx.objectStore(store));}catch(e){tx.abort();reject(e);return;}tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('No se pudo completar el guardado.'));});
}
export async function fingerprint(recipe) {
 const bytes=new TextEncoder().encode(JSON.stringify([recipe.title,recipe.body,recipe.image||null]));
 const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
}
