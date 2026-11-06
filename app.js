'use strict';
const $ = id => document.getElementById(id);
const key = r => `${r.type}:${r.id}`;
const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const persist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { $('status').textContent = 'Browser storage unavailable. Your finds last for this session.'; } };
const valid = r => r && /^(album|track)$/.test(r.type) && /^\d+$/.test(r.id) && /^\d+$/.test(r.art) && /^https:\/\/[^/]+\.bandcamp\.com\//.test(r.url) && Array.isArray(r.tags);
const releases = (window.CATALOG?.releases || []).filter(valid);
let saved = read('opencrate-saved', []); saved = Array.isArray(saved) ? saved.filter(valid) : [];
let history = read('opencrate-history', []); history = Array.isArray(history) ? history.filter(valid).slice(0,100) : [];
let current = null, trail = [], position = -1, bag = [], selected = new Set();
const genres = [...new Set(releases.flatMap(r => r.tags))].sort();
const pretty = tag => ({'hip-hop-rap':'Hip-hop / Rap','r-b-soul':'R&B / Soul','drum-bass':'Drum & Bass','idm':'IDM','j-pop':'J-pop','k-pop':'K-pop'}[tag] || tag.replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase()));
function pool(){ return releases.filter(r => !selected.size || r.tags.some(t => selected.has(t))); }
function shuffled(items){ const a = [...items]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function renderGenres(){
 $('tags').replaceChildren(); const query=$('search').value.trim().toLowerCase();
 for(const tag of genres.filter(t => (pretty(t)+' '+t).toLowerCase().includes(query))){
  const b=document.createElement('button');b.className='tag';b.textContent=pretty(tag);b.setAttribute('aria-pressed',selected.has(tag));
  b.onclick=()=>{selected.has(tag)?selected.delete(tag):selected.add(tag);filtersChanged();};$('tags').append(b);
 }
 if(!$('tags').children.length) $('tags').textContent='No matching genres in this catalog.';
 $('all').setAttribute('aria-pressed',!selected.size);
 $('filter-note').textContent=selected.size?`${selected.size} genre${selected.size===1?'':'s'} selected · matches any selected genre.`:'Every genre is in play.';
}
function filtersChanged(){bag=[];renderGenres();next();}
function updateSave(){ $('save').textContent=current && saved.some(r=>key(r)===key(current))?'♥ Saved':'♡ Save';$('saved-count').textContent=saved.length; }
function show(r){
 current=r;$('title').textContent=r.title;$('artist').textContent=r.artist;$('release-tag').textContent=r.tags.map(pretty).join(' / ');
 $('cover').hidden=false;$('cover-empty').hidden=true;$('cover-empty').style.display='none';$('cover').src=`https://f4.bcbits.com/img/a${r.art}_10.jpg`;$('cover').alt=`Cover of ${r.title}`;
 $('cover').onerror=()=>{$('cover').hidden=true;$('cover-empty').style.display='grid';};
 const iframe=document.createElement('iframe');iframe.title=`Bandcamp player: ${r.title}`;iframe.src=`https://bandcamp.com/EmbeddedPlayer/${r.type}=${r.id}/size=large/bgcol=1c1f1b/linkcol=c6ef83/artwork=none/tracklist=false/transparent=true/`;iframe.setAttribute('allow','autoplay');$('player').replaceChildren(iframe);
 $('bandcamp').href=r.url;$('bandcamp').hidden=false;$('save').disabled=false;$('previous').disabled=position<=0;$('sequence').textContent=String(position+1).padStart(3,'0');
 $('status').textContent=`${pool().length.toLocaleString()} releases in your crate · N for next`;
 history=[r,...history.filter(x=>key(x)!==key(r))].slice(0,100);persist('opencrate-history',history);updateSave();renderLists();
}
function next(){
 if(!releases.length)return;
 if(!bag.length)bag=shuffled(pool().filter(r=>!current || key(r)!==key(current)));
 if(!bag.length){$('status').textContent='No other releases match. Try another genre.';return;}
 const r=bag.pop();trail=trail.slice(0,position+1);trail.push(r);position=trail.length-1;show(r);
}
function jump(r){trail=trail.slice(0,position+1);trail.push(r);position=trail.length-1;show(r);}
function list(target, rows){
 $(target).replaceChildren();if(!rows.length){$(target).textContent='Nothing here yet. Keep exploring.';return;}
 for(const r of rows){const row=document.createElement('div');row.className='list-row';const img=document.createElement('img');img.src=`https://f4.bcbits.com/img/a${r.art}_7.jpg`;img.alt='';img.loading='lazy';const b=document.createElement('button');b.textContent=r.title;const s=document.createElement('small');s.textContent=r.artist;b.append(s);b.onclick=()=>jump(r);const a=document.createElement('a');a.textContent='Bandcamp ↗';a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';row.append(img,b,a);$(target).append(row);}
}
function renderLists(){list('saved-list',saved);list('history-list',history.slice(0,20));$('history-count').textContent=Math.min(history.length,20);}
$('next').onclick=next;$('previous').onclick=()=>{if(position>0)show(trail[--position]);};
$('reset').onclick=$('all').onclick=()=>{selected.clear();$('search').value='';filtersChanged();};
$('search').oninput=renderGenres;
$('save').onclick=()=>{if(!current)return;const exists=saved.some(r=>key(r)===key(current));saved=exists?saved.filter(r=>key(r)!==key(current)):[current,...saved];persist('opencrate-saved',saved);updateSave();renderLists();};
$('saved-toggle').onclick=()=>{$('saved-panel').hidden=!$('saved-panel').hidden;if(!$('saved-panel').hidden)$('saved-panel').scrollIntoView({behavior:'smooth',block:'start'});};
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(saved,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='opencrate-favorites.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='n'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(document.activeElement.tagName)){e.preventDefault();next();}});
$('genre-count').textContent=genres.length;renderGenres();updateSave();renderLists();
if(releases.length){$('next').disabled=false;$('catalog-info').textContent=`${releases.length.toLocaleString()} releases · ${genres.length} tags · Updated ${new Date(window.CATALOG.updated).toLocaleDateString()} · Random picks from a cached catalog`;next();}
else {$('title').textContent='The crate is empty.';$('status').textContent='Catalog missing. Run the refresh workflow, or check that catalog.js was uploaded.';}
