'use strict';
(() => {
  const E = window.RoomEngine;
  const $ = id => document.getElementById(id);
  const KEY = 'room-to-live.project.v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = value => String(Number(value.toFixed(1)));
  const labels = { desk: '書桌', chair: '椅子', bed: '床', drawer: '抽屜櫃', table: '餐桌' };
  const colors = { desk: ['#eee2ca', '#b8a17c'], chair: ['#dbe5ea', '#88a0ac'], bed: ['#dfe9dd', '#859e87'], drawer: ['#7c9c83', '#456d53'], table: ['#ead7bf', '#af8e65'] };
  const paths = {
    desk: '<rect x="3" y="5" width="18" height="10" rx="2"/><path d="M5 15v6m14-6v6M9 9h6"/>',
    chair: '<path d="M6 4h12v9H6V4Zm-2 9h16v5H4v-5Zm2 5v3m12-3v3"/>',
    bed: '<path d="M3 10v11m18-11v11M3 17h18M5 10V5h14v5M3 10h18v7H3v-7Zm4 0V8h4v2m2 0V8h4v2"/>',
    drawer: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 12h16M10 7h4m-4 10h4"/>',
    table: '<ellipse cx="12" cy="8" rx="9" ry="5"/><path d="M5 12v9m14-9v9"/>',
    undo: '<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 7 7v4"/>',
    redo: '<path d="m16 4 5 5-5 5m5-5H11a7 7 0 0 0-7 7v4"/>',
    rotate: '<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
    cursor: '<path d="m5 3 14 10-7 1-3 7L5 3Z"/>',
  };
  function icon(name) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${paths[name] || paths.desk}</svg>`; }
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
  let state = E.sampleProject('before'), selectedId = 'sample-drawer', alerts = [], past = [], future = [];
  let drag = null, confirmation = null, toastTimer, storageBlocked = false;
  function warn(message) { $('storageWarning').textContent = message; $('storageWarning').hidden = false; }
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) { state = E.parseBackup(saved); selectedId = state.items[0]?.id || null; }
  } catch { storageBlocked = true; warn('原有配置無法讀取，已保留原資料並暫停覆寫。你仍可使用範例；匯入有效配置後可恢復儲存。'); }
  function save() {
    if (storageBlocked) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); $('storageWarning').hidden = true; }
    catch { warn('目前無法儲存到瀏覽器，請先匯出配置，避免關閉後遺失。'); }
  }
  function toast(message) { clearTimeout(toastTimer); $('toastText').textContent = message; $('toast').classList.add('show'); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 5500); }
  $('dismissToast').onclick = () => $('toast').classList.remove('show');
  function commit(next, message = '') {
    try {
      next = E.validateProject(next);
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      past.push(clone(state)); if (past.length > 40) past.shift(); future = [];
      state = next; if (!state.items.some(i => i.id === selectedId)) selectedId = state.items[0]?.id || null;
      save(); render(); if (message) toast(message);
    } catch (error) { toast(error.message); }
  }
  function selected() { return state.items.find(i => i.id === selectedId); }
  function patchSelected(patch, message = '') {
    if (!selected()) return;
    const next = clone(state); Object.assign(next.items.find(i => i.id === selectedId), patch); commit(next, message);
  }
  function rectMarkup(r, attrs = '') { return `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" ${attrs}/>`; }
  function renderSvg() {
    const svg = $('roomSvg');
    const w = state.room.width, h = state.room.depth;
    const pad = Math.max(45, Math.max(w, h) * .08);
    svg.setAttribute('viewBox', `${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`);
    const font = Math.max(9, Math.min(22, Math.max(w, h) / 34));
    const chunks = [`<title>可拖曳的家具配置平面圖</title><defs><pattern id="roomGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e8e8dc" stroke-width="0.5"/></pattern><pattern id="overlapHatch" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7 7 0" stroke="#cf604c" stroke-width="1"/></pattern></defs>`,
      `<rect x="0" y="0" width="${w}" height="${h}" fill="#fcfbf5" stroke="#a8b79f" stroke-width="2"/><rect x="0" y="0" width="${w}" height="${h}" fill="url(#roomGrid)" pointer-events="none"/>`,
      `<path d="M0 ${-pad*.45}H${w}M0 ${-pad*.6}V${-pad*.3}M${w} ${-pad*.6}V${-pad*.3}" fill="none" stroke="#a0aa9a" stroke-width=".8"/><text x="${w/2}" y="${-pad*.62}" text-anchor="middle" font-size="${font}" fill="#71826f" font-family="sans-serif">${fmt(w)} cm</text>`,
      `<text transform="translate(${-pad*.5} ${h/2}) rotate(-90)" text-anchor="middle" font-size="${font}" fill="#71826f" font-family="sans-serif">${fmt(h)} cm</text>`];
    for (const item of state.items) {
      const u = E.useRect(item); if (!u) continue;
      const bad = alerts.some(a => a.level === 'error' && (a.id.startsWith(`use:${item.id}:`) || a.id === `boundary:use:${item.id}`));
      chunks.push(rectMarkup(u, `fill="${bad ? '#f5cbb5' : '#e2eddb'}" fill-opacity=".6" stroke="${bad ? '#d77758' : '#8eac7c'}" stroke-width="1.1" stroke-dasharray="5 3" pointer-events="none"`));
      if (u.width > font*4 && u.height > font*1.5) chunks.push(`<text x="${u.x+u.width/2}" y="${u.y+u.height/2+font*.3}" text-anchor="middle" font-size="${font*.8}" fill="${bad ? '#a5543c' : '#718a64'}" pointer-events="none">使用空間</text>`);
    }
    for (const item of state.items) {
      const b = E.bodyRect(item), isSelected = item.id === selectedId;
      const bodyBad = alerts.some(a => a.level === 'error' && (a.kind === 'body' && a.items.includes(item.id) || a.id === `boundary:body:${item.id}`));
      const [fill, stroke] = colors[item.type];
      const centerX = b.x+b.width/2, centerY = b.y+b.height/2;
      let detail = '';
      if (item.type === 'bed') detail = rectMarkup({x:b.x+b.width*.09,y:b.y+b.height*.07,width:b.width*.82,height:b.height*.2}, 'fill="#f7f8ef" rx="4" pointer-events="none"');
      if (item.type === 'drawer') {
        const horiz = item.rotation === 0 || item.rotation === 180;
        const hx = item.rotation === 90 ? b.x+b.width*.2 : item.rotation === 270 ? b.x+b.width*.8 : centerX;
        const hy = item.rotation === 180 ? b.y+b.height*.2 : item.rotation === 0 ? b.y+b.height*.8 : centerY;
        detail = `<path d="${horiz ? `M${hx-b.width*.12} ${hy}h${b.width*.24}` : `M${hx} ${hy-b.height*.12}v${b.height*.24}`}" stroke="#e9f0df" stroke-width="2" pointer-events="none"/>`;
      }
      chunks.push(`<g class="room-furniture${isSelected ? ' selected' : ''}${bodyBad ? ' invalid' : ''}" data-item-id="${esc(item.id)}" tabindex="0" role="button" aria-label="${esc(item.name)}，${fmt(item.width)} 乘 ${fmt(item.depth)} 公分，點選編輯"><title>${esc(item.name)} · ${fmt(item.width)} × ${fmt(item.depth)} cm</title>${rectMarkup(b, `class="furniture-body" fill="${fill}" stroke="${bodyBad ? '#ce5b48' : stroke}" stroke-width="${isSelected ? 2.8 : 1.2}" rx="3"`)}${detail}<text class="furniture-name" x="${centerX}" y="${centerY+font*.3}" text-anchor="middle" font-size="${Math.max(6, Math.min(font, b.width/(item.name.length+1)))}" fill="${item.type==='drawer' ? '#ffffff' : '#466049'}" pointer-events="none">${esc(item.name)}</text>${isSelected ? rectMarkup({x:b.x-3,y:b.y-3,width:b.width+6,height:b.height+6}, 'fill="none" stroke="#254d3e" stroke-width=".8" stroke-dasharray="3 3" pointer-events="none"') : ''}</g>`);
    }
    for (const a of alerts) {
      if (!a.rect || a.kind === 'boundary') continue;
      chunks.push(rectMarkup(a.rect, `fill="${a.level === 'warning' ? '#edc66d' : 'url(#overlapHatch)'}" fill-opacity=".7" stroke="${a.level==='warning' ? '#bd952f' : '#c35d48'}" stroke-width="1" pointer-events="none"`));
    }
    if (!state.items.length) chunks.push(`<text x="${w/2}" y="${h/2}" text-anchor="middle" font-size="${font*1.2}" fill="#84947d">從家具庫加入第一件家具</text>`);
    svg.innerHTML = chunks.join('');
  }
  function renderInspector() {
    const item = selected();
    $('emptyInspector').hidden = !!item; $('propertyForm').hidden = !item;
    $('inspectorTitle').textContent = item ? item.name : '讓空間，有你的樣子';
    $('selectedType').textContent = item ? `${labels[item.type]} · 所有尺寸以公分表示` : '點選一件家具，開始調整。';
    $('propertyError').hidden = true;
    if (!item) return;
    ['Name','Width','Depth','X','Y','Clearance'].forEach(key => { $('item'+key).value = item[key.charAt(0).toLowerCase()+key.slice(1)]; });
    $('itemActive').checked = item.active;
    $('rotationValue').textContent = `${{0:'↓',90:'←',180:'↑',270:'→'}[item.rotation]} ${item.rotation}°`;
  }
  function renderAlerts() {
    const errors = alerts.filter(a => a.level === 'error').length, warnings = alerts.length-errors;
    $('statusPill').textContent = errors ? `${errors} 處空間阻擋` : warnings ? `${warnings} 處同時使用提醒` : '目前配置，沒有空間衝突';
    $('statusPill').className = `status-pill ${alerts.length ? 'warning' : 'ok'}`;
    $('alertsCount').textContent = `${alerts.length} 個提醒`;
    $('alertsList').innerHTML = alerts.length ? alerts.map(a => `<article class="alert-row ${a.level}"><span class="alert-icon" aria-hidden="true">${a.level==='error' ? '!' : '↔'}</span><div class="alert-copy"><strong>${a.level==='error' ? '需要留意的空間' : '同時使用可能衝突'}</strong><p>${esc(a.message)}</p></div><div class="alert-actions"><button class="button ghost small" data-select="${esc(a.items[0])}">查看家具 ↗</button></div></article>`).join('') : '<article class="alert-row ok"><span class="alert-icon" aria-hidden="true">✓</span><div class="alert-copy"><strong>這個配置，暫時沒有發現衝突。</strong><p>可以繼續預演其他家具。結果依輸入尺寸判斷，仍請保留實際使用餘裕。</p></div></article>';
  }
  function render() {
    alerts = E.analyze(state);
    $('roomWidth').value = state.room.width; $('roomDepth').value = state.room.depth;
    $('roomLabel').textContent = `${fmt(state.room.width)} × ${fmt(state.room.depth)} cm`;
    $('itemCount').textContent = `${state.items.length} / 50 件`;
    $('undoBtn').disabled = !past.length; $('redoBtn').disabled = !future.length;
    const used = state.items.filter(i=>i.clearance>0);
    const allOpen = used.length > 0 && used.every(i=>i.active), allClosed = used.length > 0 && used.every(i=>!i.active);
    $('openBtn').classList.toggle('active',allOpen); $('closedBtn').classList.toggle('active',allClosed);
    $('openBtn').setAttribute('aria-pressed',String(allOpen)); $('closedBtn').setAttribute('aria-pressed',String(allClosed));
    $('objectList').innerHTML = state.items.map(i=>`<button class="object-chip${i.id===selectedId?' selected':''}" data-select="${esc(i.id)}" aria-pressed="${i.id===selectedId}">${esc(i.name)}</button>`).join('');
    renderSvg(); renderInspector(); renderAlerts();
  }
  function select(id) { selectedId = id; renderSvg(); renderInspector(); $('objectList').querySelectorAll('[data-select]').forEach(b=>{b.classList.toggle('selected',b.dataset.select===id);b.setAttribute('aria-pressed',String(b.dataset.select===id));}); }
  function undo() { if (!past.length) return; future.push(clone(state)); state = past.pop(); selectedId = state.items.some(i=>i.id===selectedId)?selectedId:state.items[0]?.id; save(); render(); }
  function redo() { if (!future.length) return; past.push(clone(state)); state=future.pop(); selectedId=state.items.some(i=>i.id===selectedId)?selectedId:state.items[0]?.id; save(); render(); }
  $('undoBtn').onclick = undo; $('redoBtn').onclick = redo;
  document.addEventListener('click',event=>{
    const add = event.target.closest('[data-add]');
    if (add) {
      if (state.items.length>=50) { toast('最多可放置 50 件家具，請先刪除一些或匯出備份。'); return; }
      const item=E.makeItem(add.dataset.add,state.items.length); const next=clone(state); next.items.push(item); selectedId=item.id; commit(next,'已加入家具，拖曳或在右側調整尺寸。');
    }
    const pick = event.target.closest('[data-select]'); if(pick) select(pick.dataset.select);
  });
  $('roomForm').onsubmit=event=>{event.preventDefault();const next=clone(state);next.room={width:Number($('roomWidth').value),depth:Number($('roomDepth').value)};commit(next,'已更新房間尺寸。');};
  $('propertyForm').onsubmit=event=>{
    event.preventDefault(); if(!selected())return;
    const next=clone(state), item=next.items.find(i=>i.id===selectedId);
    Object.assign(item,{name:$('itemName').value.trim(),width:Number($('itemWidth').value),depth:Number($('itemDepth').value),x:Number($('itemX').value),y:Number($('itemY').value),clearance:Number($('itemClearance').value),active:$('itemActive').checked});
    try{E.validateProject(next);commit(next,'已更新，空間檢查也一起調整了。');}catch(error){$('propertyError').textContent=error.message;$('propertyError').hidden=false;}
  };
  $('rotateBtn').onclick=()=>{if(selected())patchSelected({rotation:(selected().rotation+90)%360},'家具與使用方向已旋轉 90°。');};
  $('itemActive').onchange=()=>$('propertyForm').requestSubmit();
  function removeSelected(){if(!selected())return;const next=clone(state);next.items=next.items.filter(i=>i.id!==selectedId);commit(next,'已移除家具，可按復原還原。');}
  $('deleteBtn').onclick=removeSelected;
  function setAllActive(active){const next=clone(state);next.items.forEach(i=>{if(i.clearance>0)i.active=active;});commit(next,active?'開始預演所有家具的使用空間。':'已收起使用範圍，仍會檢查家具本體。');}
  $('openBtn').onclick=()=>setAllActive(true);$('closedBtn').onclick=()=>setAllActive(false);
  function requestReplace(next,title,text,after=null){confirmation=()=>{if(after)after();commit(next,'已載入配置，可按復原回到前一個版本。');};$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmDialog').showModal();}
  $('beforeBtn').onclick=()=>requestReplace(E.sampleProject('before'),'載入抽屜卡住的範例？','目前配置會被取代。範例包含一張書桌、一張床與一個抽屜櫃，可使用復原回到目前配置。');
  $('afterBtn').onclick=()=>requestReplace(E.sampleProject('after'),'看看調整後的空間？','將載入相同房間與家具，並把櫃子移至左下方，保留完整的拉出範圍。可使用復原返回。');
  $('emptyBtn').onclick=()=>requestReplace(E.sampleProject('empty'),'建立空白房間？','會移除目前所有家具，保留為 360 × 300 cm 的空房間。可使用復原返回。');
  $('acceptConfirm').onclick=()=>{const action=confirmation;confirmation=null;$('confirmDialog').close();if(action)action();};
  $('cancelConfirm').onclick=()=>{confirmation=null;$('confirmDialog').close();};
  $('confirmDialog').addEventListener('cancel',()=>{confirmation=null;});
  function point(event){const svg=$('roomSvg'),p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
  $('roomSvg').addEventListener('pointerdown',event=>{
    if(event.button!==0)return;const itemNode=event.target.closest('[data-item-id]');if(!itemNode)return;
    event.preventDefault();select(itemNode.dataset.itemId);$('roomSvg').focus();const p=point(event),item=selected();
    drag={pointerId:event.pointerId,start:p,x:item.x,y:item.y,before:clone(state),moved:false};$('roomSvg').setPointerCapture(event.pointerId);
  });
  $('roomSvg').addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;const p=point(event),item=selected();if(!item)return;
    const snap=value=>$('snapGrid').checked?Math.round(value/5)*5:Math.round(value*10)/10;
    item.x=snap(Math.max(-100,Math.min(state.room.width+100,drag.x+p.x-drag.start.x)));
    item.y=snap(Math.max(-100,Math.min(state.room.depth+100,drag.y+p.y-drag.start.y)));
    drag.moved=item.x!==drag.x||item.y!==drag.y;alerts=E.analyze(state);renderSvg();renderInspector();renderAlerts();
  });
  $('roomSvg').addEventListener('pointerup',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;const before=drag.before,moved=drag.moved;drag=null;
    if($('roomSvg').hasPointerCapture(event.pointerId))$('roomSvg').releasePointerCapture(event.pointerId);
    if(moved){past.push(before);if(past.length>40)past.shift();future=[];save();}render();
  });
  $('roomSvg').addEventListener('pointercancel',()=>{if(drag){state=drag.before;drag=null;render();}});
  $('roomSvg').addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){const node=event.target.closest('[data-item-id]');if(node){event.preventDefault();select(node.dataset.itemId);$('roomSvg').focus();}}
  });
  document.addEventListener('keydown',event=>{
    if(event.target.matches('input,textarea,select')||$('confirmDialog').open)return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();return;}
    if(!selected())return;
    const delta=event.shiftKey?10:1,keys={ArrowLeft:[-delta,0],ArrowRight:[delta,0],ArrowUp:[0,-delta],ArrowDown:[0,delta]};
    if(keys[event.key]&&($('roomSvg').contains(event.target)||event.target===$('roomSvg'))){event.preventDefault();const [dx,dy]=keys[event.key];patchSelected({x:selected().x+dx,y:selected().y+dy});}
    if((event.key==='Delete'||event.key==='Backspace')&&($('roomSvg').contains(event.target)||event.target===$('roomSvg'))){event.preventDefault();removeSelected();}
  });
  function download(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('exportBtn').onclick=()=>{download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'room-to-live.json');toast('配置已送交下載，請確認檔案已保存。');};
  $('importBtn').onclick=()=>$('fileInput').click();
  $('fileInput').onchange=async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    try{if(file.size>1024*1024)throw new Error('配置檔超過 1 MB。');const next=E.parseBackup(await file.text());requestReplace(next,'匯入這份配置？',`這份配置有 ${next.items.length} 件家具，將取代目前配置。匯入後可按復原返回。`,()=>{storageBlocked=false;});}
    catch(error){toast(`無法匯入：${error.message}`);}
  };
  $('pngBtn').onclick=()=>{
    const svg=$('roomSvg').cloneNode(true);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width','1600');svg.setAttribute('height','1200');
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'}));
    const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1200;const ctx=canvas.getContext('2d');ctx.fillStyle='#f6f5ef';ctx.fillRect(0,0,1600,1200);ctx.drawImage(img,0,0,1600,1200);URL.revokeObjectURL(url);canvas.toBlob(blob=>{if(blob){download(blob,'room-to-live.png');toast('配置圖片已送交下載。');}else toast('圖片匯出失敗，請先匯出 JSON 配置。');},'image/png');};
    img.onerror=()=>{URL.revokeObjectURL(url);toast('圖片匯出失敗，請先匯出 JSON 配置。');};img.src=url;
  };
  window.addEventListener('storage',event=>{if(event.key===KEY&&event.newValue){try{state=E.parseBackup(event.newValue);past=[];future=[];selectedId=state.items[0]?.id;render();toast('已同步另一個分頁的配置。');}catch{warn('另一個分頁的配置無法讀取，目前畫面已保留，請先匯出備份。');storageBlocked=true;}}});
  render();
})();
