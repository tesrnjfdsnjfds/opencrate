'use strict';
const $ = id => document.getElementById(id);
const key = r => `${r.type}:${r.id}`;
const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const persist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { $('status').textContent = 'Browser storage unavailable. Your finds last for this session.'; } };
const valid = r => r && /^(album|track)$/.test(r.type) && /^\d+$/.test(r.id) && /^\d+$/.test(r.art) && /^https:\/\/[^/]+\.bandcamp\.com\//.test(r.url) && Array.isArray(r.tags);
const catalog = window.CATALOG || {};
const releases = (catalog.releases || []).filter(valid);
const chunked = catalog.format === 2;
const total = chunked ? catalog.total : releases.length;
const chunks = new Map(), indexCache = new Map();
let activeIndices = null, poolCount = total, busy = false, rebuildPool = true;
let recentIndices = new Set(), recentQueue = [];
async function fetchJSON(path, cache, limit) {
 if (!/^data\/[a-z]+-[a-f0-9]{16}\.json$/.test(path)) throw new Error('Invalid catalog file path');
 if (cache.has(path)) { const value=cache.get(path);cache.delete(path);cache.set(path,value);return value; }
 const pending = fetch(path).then(r=>{if(!r.ok)throw new Error(`Catalog file unavailable (${r.status})`);return r.json();}).catch(error=>{cache.delete(path);throw error;});
 cache.set(path,pending);while(cache.size>limit)cache.delete(cache.keys().next().value);return pending;
}
async function buildPool() {
 if (!selected.size) return null;
 if (!chunked) return releases.map((r,i)=>r.tags.some(t=>selected.has(t))?i:-1).filter(i=>i>=0);
 const lists=await Promise.all([...selected].map(async tag=>{const data=await fetchJSON(catalog.indexFiles[tag],indexCache,12);return Array.isArray(data)?data:data[tag];}));
 const merged=new Set();
 for(const list of lists){if(!Array.isArray(list))throw new Error('Invalid genre index');for(const n of list){if(!Number.isInteger(n)||n<0||n>=total)throw new Error('Invalid release index');merged.add(n);}}
 return [...merged];
}
async function releaseAt(n) {
 if(!chunked)return releases[n];
 const chunk=await fetchJSON(catalog.chunks[Math.floor(n/catalog.chunkSize)],chunks,8);
 const r=chunk[n%catalog.chunkSize];if(!valid(r))throw new Error('Invalid release record');return r;
}
function setBusy(value) {
 busy=value;$('next').disabled=value || !total;$('previous').disabled=value || position<=0;
 $('all').disabled=value;$('reset').disabled=value;
 for(const button of document.querySelectorAll('#tags button, .list-row button'))button.disabled=value;
}

let saved = read('opencrate-saved', []); saved = Array.isArray(saved) ? saved.filter(valid) : [];
let history = read('opencrate-history', []); history = Array.isArray(history) ? history.filter(valid).slice(0,100) : [];
let current = null, trail = [], position = -1, selected = new Set();
const genres = (chunked ? Object.keys(catalog.genreCounts) : [...new Set(releases.flatMap(r => r.tags))]).sort();
const pretty = tag => ({'hip-hop-rap':'Hip-hop / Rap','r-b-soul':'R&B / Soul','drum-bass':'Drum & Bass','idm':'IDM','j-pop':'J-pop','k-pop':'K-pop'}[tag] || tag.replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase()));
function renderGenres(){
 $('tags').replaceChildren(); const query=$('search').value.trim().toLowerCase();
 for(const tag of genres.filter(t => (pretty(t)+' '+t).toLowerCase().includes(query))){
  const b=document.createElement('button');b.className='tag';b.disabled=busy;b.textContent=pretty(tag);b.setAttribute('aria-pressed',selected.has(tag));
  b.onclick=()=>{selected.has(tag)?selected.delete(tag):selected.add(tag);filtersChanged();};$('tags').append(b);
 }
 if(!$('tags').children.length) $('tags').textContent='No matches';
 $('all').setAttribute('aria-pressed',!selected.size);
 if($('selection-count')) $('selection-count').textContent=selected.size || '';
 $('filter-note').textContent=selected.size?`${selected.size} genre${selected.size===1?'':'s'} selected · matches any selected genre.`:'Every genre is in play.';
}
function filtersChanged(){rebuildPool=true;recentIndices.clear();recentQueue=[];renderGenres();next();}
function updateSave(){ const active=!!current && saved.some(r=>key(r)===key(current));$('save').textContent=active?'♥':'♡';$('save').setAttribute('aria-pressed',active);$('save').setAttribute('aria-label',active?'Unsave release':'Save release');$('save').title=active?'Unsave release':'Save release';$('saved-count').textContent=saved.length || ''; }
function show(r){
 current=r;$('title').textContent=r.title;$('artist').textContent=r.artist;$('release-tag').textContent=r.tags.map(pretty).join(' / ');
 $('cover').hidden=false;$('cover-empty').hidden=true;$('cover-empty').style.display='none';$('cover').src=`https://f4.bcbits.com/img/a${r.art}_10.jpg`;$('cover').alt=`Cover of ${r.title}`;
 $('cover').onerror=()=>{$('cover').hidden=true;$('cover-empty').style.display='grid';};
 const iframe=document.createElement('iframe');iframe.title=`Bandcamp player: ${r.title}`;iframe.src=`https://bandcamp.com/EmbeddedPlayer/${r.type}=${r.id}/size=large/bgcol=111111/linkcol=aaaaaa/artwork=none/tracklist=false/transparent=true/`;iframe.setAttribute('allow','autoplay');$('player').replaceChildren(iframe);
 $('bandcamp').href=r.url;$('bandcamp').hidden=false;$('save').disabled=false;$('previous').disabled=position<=0;$('sequence').textContent=String(position+1).padStart(3,'0');
 $('status').textContent='';
 history=[r,...history.filter(x=>key(x)!==key(r))].slice(0,100);persist('opencrate-history',history);updateSave();renderLists();
}
async function next(){
 if(busy || !total)return;
 setBusy(true);$('status').textContent='Loading…';
 try {
  if(rebuildPool){const indices=await buildPool();activeIndices=indices;poolCount=indices===null?total:indices.length;rebuildPool=false;}
  if(!poolCount){$('status').textContent='No releases match these genres.';return;}
  if(recentIndices.size>=poolCount){recentIndices.clear();recentQueue=[];}
  let n;
  for(let attempt=0;attempt<100;attempt++){
   const offset=Math.floor(Math.random()*poolCount);n=activeIndices===null?offset:activeIndices[offset];
   if(!recentIndices.has(n))break;
  }
  let r=await releaseAt(n);
  if(current && key(r)===key(current) && poolCount>1){
   const offset=activeIndices===null?n:activeIndices.indexOf(n);n=activeIndices===null?(offset+1)%poolCount:activeIndices[(offset+1)%poolCount];r=await releaseAt(n);
  }
  recentIndices.add(n);recentQueue.push(n);if(recentQueue.length>4000)recentIndices.delete(recentQueue.shift());
  trail=trail.slice(0,position+1);trail.push(r);position=trail.length-1;show(r);
 } catch(error){$('status').textContent='Could not load the catalog. Check that the data folder was uploaded, then click Next to retry.';}
 finally{setBusy(false);}
}
function jump(r){if(busy)return;trail=trail.slice(0,position+1);trail.push(r);position=trail.length-1;show(r);}
function list(target, rows){
 $(target).replaceChildren();if(!rows.length){$(target).textContent='Empty';return;}
 for(const r of rows){const row=document.createElement('div');row.className='list-row';const img=document.createElement('img');img.src=`https://f4.bcbits.com/img/a${r.art}_7.jpg`;img.alt='';img.loading='lazy';const b=document.createElement('button');b.disabled=busy;b.textContent=r.title;const s=document.createElement('small');s.textContent=r.artist;b.append(s);b.onclick=()=>jump(r);const a=document.createElement('a');a.textContent='Bandcamp ↗';a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';row.append(img,b,a);$(target).append(row);}
}
function renderLists(){list('saved-list',saved);list('history-list',history.slice(0,20));$('history-count').textContent=Math.min(history.length,20);}
$('next').onclick=next;$('previous').onclick=()=>{if(!busy && position>0)show(trail[--position]);};
$('reset').onclick=$('all').onclick=()=>{selected.clear();$('search').value='';filtersChanged();};
$('search').oninput=renderGenres;
$('save').onclick=()=>{if(!current)return;const exists=saved.some(r=>key(r)===key(current));saved=exists?saved.filter(r=>key(r)!==key(current)):[current,...saved];persist('opencrate-saved',saved);updateSave();renderLists();};
$('saved-toggle').onclick=()=>{$('saved-panel').hidden=!$('saved-panel').hidden;if(!$('saved-panel').hidden)$('saved-panel').scrollIntoView({behavior:'smooth',block:'start'});};
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(saved,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='opencrate-favorites.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='n'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();next();}});
$('genre-count').textContent=genres.length;renderGenres();updateSave();renderLists();
if(total){$('next').disabled=false;$('catalog-info').textContent=`${total.toLocaleString()} releases · ${genres.length} tags · Updated ${new Date(catalog.updated).toLocaleDateString()} · Random picks from a cached catalog`;next();}
else {$('title').textContent='The crate is empty.';$('status').textContent='Catalog missing. Run the refresh workflow, or check that catalog.js was uploaded.';}
