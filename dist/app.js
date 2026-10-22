import { createStore } from './lib/store.js';
import { initAppearance } from './lib/appearance.js';
import { localDate, addDays, addMonths, weekDates, monthCells, toMinutes, formatTime, validateTask, findConflicts, layoutTasks, createICalendar, minuteAtOffset, timeRangeFromDrag } from './lib/calendar.js';

const $ = (s, root = document) => root.querySelector(s);
const store = createStore();
const paths = {
  home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m3 10h2m4 0h2m-8 4h2',
  layers:'m12 3 10 5-10 5L2 8zm-10 9 10 5 10-5M2 16l10 5 10-5',
  star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
  search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  plus:'M12 5v14M5 12h14',
  chevron:'m9 5 7 7-7 7',
  left:'m15 5-7 7 7 7',
  arrow:'M5 12h14m-5-5 5 5-5 5',
  chevrons:'m8 9 4-4 4 4m-8 6 4 4 4-4',
  clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  check:'m5 12 4 4L19 6',
  copy:'M9 9h12v12H9zM15 5V3H3v12h2',
  edit:'m16 3 5 5M4 16 16 4a3 3 0 0 1 4 4L8 20l-5 1z',
  trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  more:'M5 12h.01M12 12h.01M19 12h.01',
  archive:'M3 3h18v5H3zm2 5v13h14V8m-10 4h6',
  help:'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4m.1 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  grid:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
  list:'M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01',
  menu:'M4 6h16M4 12h16M4 18h16',
  close:'m6 6 12 12M6 18 18 6',
  flag:'M4 22V3m0 0c6-4 10 4 16 0v11c-6 4-10-4-16 0',
  download:'M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5',
  upload:'M12 16V4m-5 5 5-5 5 5M3 16v5h18v-5',
  file:'M14 2H4v20h16V8zm0 0v6h6M8 13h8m-8 4h5',
  leaf:'M20 3C9 1 2 8 5 16c7 6 17 0 15-13M4 21 16 9',
  play:'m9 5 11 7-11 7z',
  pause:'M8 5v14M16 5v14',
  reset:'M3 11a9 9 0 1 1 2 7M3 4v7h7',
  expand:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  book:'M12 5C8 2 4 3 2 4v16c3-2 7-2 10 0m0-15c4-3 8-2 10-1v16c-3-2-7-2-10 0z',
  pin:'m16 3 5 5-4 1-3 6-5-5 6-3zM9 15l-6 6',
  sun:'M12 3V1m0 22v-2M3 12H1m22 0h-2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  image:'M3 3h18v18H3zM3 16l6-6 4 4 3-3 5 5M8 7h.01',
  'flip-x':'M12 2v20M9 6 3 12l6 6zM15 6l6 6-6 6z',
  'flip-y':'M2 12h20M6 9l6-6 6 6zM6 15l6 6 6-6z',
  palette:'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4 1 1 0 0 1 .7-1.7H18a4 4 0 0 0 4-4c0-5-4.5-8.9-10-8.9M7 11h.01M9 7h.01M14 6h.01M18 10h.01',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;
const hydrateIcons = (root = document) => root.querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon); });
const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const today = () => localDate();
const parseDay = d => new Date(d + 'T12:00:00');
const dateLabel = (date, opts = {month:'long', day:'numeric'}) => parseDay(date).toLocaleDateString('zh-CN', opts);
const sameMonth = (a,b) => a.slice(0,7) === b.slice(0,7);
const days = ['一','二','三','四','五','六','日'];
const ui = { route:'home', date:today(), month:today(), category:'全部', query:'', favoritesOnly:false, snippetView:'grid', plannerView:'day', selected:new Set(), copied:null, importText:null, importName:'', importType:null };
let toastTimer;
let focusOrigin = null;
const focus = { duration:25*60, remaining:25*60, running:false, endAt:0 };
let appearance;

function notify(message, undo) {
  const t = $('#toast');
  t.replaceChildren(document.createTextNode(message));
  if (undo) { const b=document.createElement('button');b.textContent='撤销';b.onclick=()=>{try{undo();t.classList.remove('show')}catch(err){notify(err.message)}};t.append(b); }
  clearTimeout(toastTimer);t.classList.add('show');toastTimer=setTimeout(()=>t.classList.remove('show'),undo?9000:3500);
}
function safe(fn) { try { return fn(); } catch(err) { notify(err.message || '操作未完成，请重试'); return null; } }
function saveStatus() {
  const status=store.status;const root=$('#storageStatus');root.classList.toggle('error',Boolean(status.error));
  root.innerHTML=`<span class="status-dot"></span><span>${status.error?'保存需要注意，点击重试':'已保存到此浏览器'}</span>`;
  root.title=status.error?.message || '数据保存在当前浏览器，建议定期导出备份';
  root.onclick=status.error?()=>safe(()=>{store.retryPersist();notify('数据已保存')}):null;
}
const tasksOn = date => store.state.tasks.filter(t=>t.date===date).sort((a,b)=>a.start.localeCompare(b.start));
const categoryTag = cat => `<span class="category-tag" data-category="${e(cat)}">${e(cat)}</span>`;
function stats(date) { const tasks=tasksOn(date);const done=tasks.filter(t=>t.done).length;return {tasks,done,pending:tasks.length-done,minutes:tasks.reduce((sum,t)=>sum+toMinutes(t.end)-toMinutes(t.start),0),progress:tasks.length?Math.round(done/tasks.length*100):0}; }
function durationText(minutes) { const hours=Math.floor(minutes/60),mins=minutes%60;return hours?(mins?`${hours} 小时 ${mins} 分钟`:`${hours} 小时`):`${mins} 分钟`; }
function monthStats(month) {
  const tasks=store.state.tasks.filter(t=>t.date.slice(0,7)===month.slice(0,7));const done=tasks.filter(t=>t.done).length;
  const perDay=new Map();for(const t of tasks)perDay.set(t.date,(perDay.get(t.date)||0)+toMinutes(t.end)-toMinutes(t.start));
  const busiest=[...perDay.entries()].sort((a,b)=>b[1]-a[1])[0];
  return {tasks,done,minutes:tasks.reduce((sum,t)=>sum+toMinutes(t.end)-toMinutes(t.start),0),progress:tasks.length?Math.round(done/tasks.length*100):0,activeDays:perDay.size,busiest:busiest?{date:busiest[0],minutes:busiest[1]}:null};
}
function renderDailyProgress(s) {
  return `<div class="rhythm-track" role="progressbar" aria-label="当天任务完成进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.progress}" aria-valuetext="${s.done} / ${s.tasks.length} 项已完成" data-progress="${s.progress}"><span class="rhythm-filled" style="width:${s.progress}%" aria-hidden="true">${s.progress ? `${s.progress}%` : ''}</span><span class="rhythm-rest" aria-hidden="true">${s.progress ? '' : '0%'}</span></div>`;
}
function heading(title, subtitle, action='task') {
  const isSnippet=action==='snippet';
  return `<div class="breadcrumb-row"><div class="breadcrumb">${icon('home')}<span>我的工作台</span>${icon('chevron')}<strong>${e({home:'今日概览',planner:'日程计划',snippets:'信息速取',favorites:'我的收藏'}[ui.route])}</strong></div><span class="date-stamp">${icon('sun')}${dateLabel(today(),{year:'numeric',month:'long',day:'numeric',weekday:'long'})}</span></div><div class="page-heading"><div><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></div><div class="heading-actions">${isSnippet?`<button class="btn quiet" data-action="import">${icon('upload')}导入<span class="optional">内容</span></button>`:''}<button class="btn primary" data-action="new-${action}">${icon('plus')}新建${isSnippet?'片段':'任务'}</button></div></div>`;
}
function summary(date) {
  const s=stats(date);const hours=Math.floor(s.minutes/60), mins=s.minutes%60;
  return `<div class="day-summary"><div class="summary-item"><span class="summary-value">${s.tasks.length}<small>项</small></span><span class="summary-label">今日计划</span></div><div class="summary-item"><span class="summary-value">${s.done}<small>项</small></span><span class="summary-label">已经完成</span></div><div class="summary-item"><span class="summary-value">${hours||mins}<small>${hours?'小时':'分钟'}${hours&&mins?' '+mins+'分':''}</small></span><span class="summary-label">安排时长</span></div><div class="summary-progress"><span>完成进度</span><span class="progress-track"><span class="progress-fill" style="width:${s.progress}%"></span></span><span>${s.progress}%</span></div></div>`;
}
function weekStrip() {
  return `<div class="week-strip">${weekDates(ui.date).map((date,i)=>`<button class="week-day ${date===ui.date?'active':''} ${tasksOn(date).length?'has-task':''}" data-action="select-date" data-date="${date}" aria-label="${dateLabel(date,{month:'long',day:'numeric',weekday:'long'})}" aria-pressed="${date===ui.date}"><span>周${days[i]}</span><b>${Number(date.slice(8))}</b><i></i></button>`).join('')}</div>`;
}
function empty(title, desc, action, label) {return `<div class="empty-state">${icon('leaf')}<h3>${e(title)}</h3><p>${e(desc)}</p>${action?`<button class="btn" data-action="${action}">${icon('plus')}${e(label)}</button>`:''}</div>`;}
function taskRow(t) {
  return `<div class="task-row ${t.done?'done':''}" data-task-row="${e(t.id)}"><button class="task-check ${t.done?'done':''}" data-action="toggle-task" data-id="${e(t.id)}" aria-label="${t.done?'标为未完成':'完成任务'}：${e(t.title)}" aria-pressed="${t.done}">${t.done?icon('check'):''}</button><div class="task-copy"><button class="task-title-btn" data-action="edit-task" data-id="${e(t.id)}"><span class="task-title">${e(t.title)}</span></button><div class="task-meta">${categoryTag(t.category)}<span class="meta-separator">·</span>${icon('clock')}<span>${e(t.start)} – ${e(t.end)}</span>${t.priority==='high'?`<span class="priority-mark">${icon('flag')}优先</span>`:''}</div></div><span class="task-time">${toMinutes(t.end)-toMinutes(t.start)} 分钟</span><button class="icon-btn task-options" data-action="edit-task" data-id="${e(t.id)}" aria-label="编辑任务：${e(t.title)}">${icon('more')}</button></div>`;
}
function miniCalendar() {
  return `<div class="mini-calendar"><div class="month-heading"><span>${dateLabel(ui.month,{year:'numeric',month:'long'})}</span><div><button class="icon-btn" data-action="month-prev" aria-label="上个月">${icon('left')}</button><button class="icon-btn" data-action="month-next" aria-label="下个月">${icon('chevron')}</button></div></div><div class="calendar-grid">${days.map(d=>`<span class="day-label">${d}</span>`).join('')}${monthCells(ui.month).map(day=>`<button class="calendar-day ${day.isCurrentMonth?'':'outside'} ${day.date===today()?'today':''} ${day.date===ui.date?'selected':''} ${tasksOn(day.date).length?'has-task':''}" data-action="select-date" data-date="${day.date}" aria-label="${day.date}${tasksOn(day.date).length?'，有'+tasksOn(day.date).length+'项任务':''}" aria-pressed="${day.date===ui.date}">${day.day}</button>`).join('')}</div><div class="calendar-caption"><span class="status-dot"></span>日期下的圆点表示当天有计划</div></div>`;
}
function snippetCard(s) {
  const selected=ui.selected.has(s.id);
  return `<article class="snippet-card ${selected?'selected':''}" data-snippet="${e(s.id)}">
    <div class="snippet-card-top"><div class="snippet-tags"><input class="select-box" type="checkbox" aria-label="选择片段：${e(s.title)}" data-select="${e(s.id)}" ${selected?'checked':''}>${categoryTag(s.category)}</div><button class="icon-btn ${s.pinned?'pinned-icon':''}" data-action="pin-snippet" data-id="${e(s.id)}" aria-label="${s.pinned?'取消收藏':'收藏'}：${e(s.title)}" aria-pressed="${s.pinned}">${icon(s.pinned?'pin':'star')}</button></div>
    <div class="snippet-reading"><h3>${e(s.title)}</h3><p class="snippet-content">${e(s.content)}</p></div>
    <div class="snippet-actions"><span><button class="icon-btn" data-action="preview-snippet" data-id="${e(s.id)}" aria-label="查看全文：${e(s.title)}">${icon('file')}</button><button class="icon-btn" data-action="edit-snippet" data-id="${e(s.id)}" aria-label="编辑片段：${e(s.title)}">${icon('edit')}</button></span><button class="copy-btn ${ui.copied===s.id?'copied':''}" data-action="copy-snippet" data-id="${e(s.id)}">${icon(ui.copied===s.id?'check':'copy')}${ui.copied===s.id?'已复制':'复制内容'}</button></div>
  </article>`;
}
function renderHome() {
  const s=stats(ui.date);const isToday=ui.date===today();const fav=store.state.snippets.filter(s=>s.pinned);const quick=[...fav,...store.state.snippets.filter(s=>!s.pinned)].slice(0,3);
  return heading(isToday?'让今天，井然有序<span class="heading-dot">。</span>':'为这一天，留点计划<span class="heading-dot">。</span>',isToday?`今天${s.pending?'还有 '+s.pending+' 项待办':'的安排已就绪'}，把时间留给真正重要的事。`:`${dateLabel(ui.date,{month:'long',day:'numeric',weekday:'long'})} · ${s.tasks.length} 项安排，按自己的节奏前行。`)+summary(ui.date)+`<div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div class="panel-title">${icon('calendar')}<h2>${isToday?'今日日程':dateLabel(ui.date)+'日程'}</h2><span class="section-count">${s.tasks.length}</span></div><a class="text-btn" href="#planner">完整计划${icon('arrow')}</a></div>${weekStrip()}<div class="task-list">${s.tasks.slice(0,4).map(taskRow).join('')||empty('给这一天一个开始','安排一件重要的小事，从容地完成它。','new-task','安排第一个任务')}</div><div class="panel-foot">${s.tasks.length>4?`<a class="text-btn" href="#planner">还有 ${s.tasks.length-4} 项计划，查看全部 ${icon('arrow')}</a>`:''}<button class="add-inline" data-action="new-task">${icon('plus')}添加一项计划</button></div></section><section class="panel calendar-panel home-calendar"><div class="panel-heading"><div class="panel-title"><h2>日历</h2></div><button class="text-btn" data-action="today">回到今天</button></div>${miniCalendar()}<div class="calendar-bottom">${icon('leaf')}<div><strong>按自己的节奏，把事情做好</strong><small>清晰的计划，也要留一点空白。</small></div></div></section></div><section><div class="section-head"><div><h2>随手取用<span class="section-count">${store.state.snippets.length} 条片段</span></h2><p>常用的信息，不必每次重新输入。</p></div><div><button class="text-btn" data-action="new-snippet">${icon('plus')}新建片段</button><a class="text-btn" href="#snippets">全部片段 ${icon('arrow')}</a></div></div><div class="snippet-grid">${quick.map(snippetCard).join('')||empty('把常用文字放在这里','邮件回复、地址、工作模板，随用随取。','new-snippet','新建片段')}</div></section>`;
}
function filteredSnippets() {
  const q=ui.query.trim().toLocaleLowerCase();
  return store.state.snippets.filter(s=>(!ui.favoritesOnly||s.pinned)&&(ui.category==='全部'||s.category===ui.category)&&(!q||`${s.title} ${s.content} ${s.notes||''} ${s.category}`.toLocaleLowerCase().includes(q))).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt));
}
function renderSnippets() {
  const list=filteredSnippets();const favorites=ui.favoritesOnly;
  return heading('常用信息，一取即用。','保存文字、链接与灵感，下一次需要时直接复制。','snippet')+`
    <div class="toolbar"><div class="toolbar-left"><label class="input-search">${icon('search')}<span class="sr-only">搜索片段</span><input id="snippetSearch" type="search" placeholder="搜索标题、内容或备注…" value="${e(ui.query)}"></label></div>
      <div class="toolbar-right"><div class="section-filter">${['全部',...store.state.categories].map(cat=>`<button class="filter-chip ${ui.category===cat?'active':''}" data-action="filter" data-category="${e(cat)}" aria-pressed="${ui.category===cat}">${e(cat)}</button>`).join('')}</div>
        <button class="filter-chip favorite-filter ${favorites?'active':''}" data-action="favorites-filter" aria-pressed="${favorites}">${icon('star')}仅收藏</button>
        <div class="view-controls"><button class="${ui.snippetView==='grid'?'active':''}" data-action="snippet-view" data-mode="grid" aria-label="网格视图">${icon('grid')}</button><button class="${ui.snippetView==='list'?'active':''}" data-action="snippet-view" data-mode="list" aria-label="列表视图">${icon('list')}</button></div>
      </div>
    </div>
    ${ui.selected.size?`<div class="bulk-bar"><span>已选择 ${ui.selected.size} 条</span><button class="btn" data-action="copy-selected">${icon('copy')}合并复制</button><button class="text-btn" data-action="clear-selection">取消选择</button></div>`:''}
    <div class="result-label">${ui.category==='全部'?'所有分类':e(ui.category)} · ${list.length} 条${favorites?'收藏':''}片段 <button class="text-btn" data-action="select-all">选择当前结果</button></div>
    <div class="snippet-grid full ${ui.snippetView==='list'?'list':''}" id="snippetResults">${list.map(snippetCard).join('')||empty(favorites?'还没有收藏的片段':ui.query?'没有找到匹配的内容':'这一分类还很安静',favorites?'点击片段上的星标，把它留在手边。':ui.query?'换一个关键词，或新建一条片段。':'把下一次会用到的信息放进来。','new-snippet','新建片段')}</div>`;
}
function renderTimeline() {
  const tasks=tasksOn(ui.date);const px=1.08;const now=new Date();const nowMin=now.getHours()*60+now.getMinutes();
  const layout=layoutTasks(tasks,{startHour:0,endHour:24,minDisplayMinutes:31});
  return `<div class="panel"><div class="panel-heading"><div class="panel-title"><h2>${dateLabel(ui.date,{month:'long',day:'numeric',weekday:'long'})}</h2><span class="section-count">${tasks.length} 项</span></div><span class="form-note drag-hint">${icon('plus')}在时间轴上拖动，快速安排一段时间</span></div><div class="timeline-wrap"><div class="timeline" id="dayTimeline" style="height:${24*60*px}px" aria-label="${dateLabel(ui.date,{month:'long',day:'numeric',weekday:'long'})}全天时间轴">${Array.from({length:25},(_,i)=>`<div class="time-line ${i===24?'last':''}" style="top:${i*60*px}px"><span class="time-label">${String(i).padStart(2,'0')}:00</span></div>`).join('')}${layout.map(t=>`<button class="timeline-task ${t.done?'done':''}" style="top:${t.top*px}px;height:${Math.max(t.height*px-4,29)}px;left:calc(${t.left}% + 6px);width:calc(${t.width}% - 12px)" data-action="edit-task" data-id="${e(t.id)}" aria-label="${e(t.title)}，${t.start}至${t.end}"><strong>${t.done?'已完成 · ':''}${e(t.title)}</strong>${t.height>=45?`<small>${t.start} – ${t.end} · ${e(t.category)}</small>`:''}</button>`).join('')}<div class="drag-selection" id="dragSelection" hidden></div>${ui.date===today()?`<div class="now-line" style="top:${nowMin*px}px" aria-label="当前时间"></div>`:''}</div></div>${!tasks.length?'<div class="panel-foot"><button class="add-inline" data-action="new-task">'+icon('plus')+'快速添加第一项任务</button></div>':''}</div>`;
}
function setupTimelineDrag() {
  const timeline=$('#dayTimeline');if(!timeline)return;
  const selection=$('#dragSelection');let pointerId=null,startY=0,startMinute=0,currentMinute=0,dragging=false;
  const minuteAt=event=>{const rect=timeline.getBoundingClientRect();return minuteAtOffset(event.clientY-rect.top,rect.height);};
  const paintSelection=()=>{const from=Math.floor((Math.min(startMinute,currentMinute)+.001)/15)*15,to=Math.min(1440,Math.ceil((Math.max(startMinute,currentMinute)-.001)/15)*15);selection.style.top=`${from/1440*100}%`;selection.style.height=`${Math.max((to-from)/1440*100,.4)}%`;selection.innerHTML=`<strong>${formatTime(from)} – ${formatTime(to)}</strong><span>${durationText(to-from)}</span>`;selection.hidden=false;timeline.classList.add('is-dragging');};
  const reset=()=>{if(pointerId!==null&&timeline.hasPointerCapture(pointerId))timeline.releasePointerCapture(pointerId);pointerId=null;dragging=false;selection.hidden=true;timeline.classList.remove('is-dragging');};
  const taskAt=(x,y)=>[...timeline.querySelectorAll('.timeline-task')].reverse().find(task=>{const rect=task.getBoundingClientRect();return x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom;});
  const clearHover=()=>timeline.querySelectorAll('.timeline-task.hovered').forEach(task=>task.classList.remove('hovered'));
  timeline.addEventListener('pointerdown',event=>{if(event.button!==0||pointerId!==null||event.target.closest('button')?.dataset.action==='edit-task')return;clearHover();pointerId=event.pointerId;startY=event.clientY;startMinute=currentMinute=minuteAt(event);dragging=false;timeline.setPointerCapture(pointerId);});
  timeline.addEventListener('pointermove',event=>{if(pointerId===null){clearHover();taskAt(event.clientX,event.clientY)?.classList.add('hovered');return;}if(event.pointerId!==pointerId)return;currentMinute=minuteAt(event);if(!dragging&&Math.abs(event.clientY-startY)<5)return;dragging=true;paintSelection();});
  timeline.addEventListener('pointerleave',clearHover);
  timeline.addEventListener('pointerup',event=>{if(event.pointerId!==pointerId)return;const wasDragging=dragging;if(wasDragging)currentMinute=minuteAt(event);const task=wasDragging?null:taskAt(event.clientX,event.clientY);reset();if(wasDragging){const range=timeRangeFromDrag(startMinute,currentMinute,{clickThreshold:0});showTask(null,ui.date,{start:formatTime(range.startMinutes),end:formatTime(range.endMinutes)});}else if(task){showTask(task.dataset.id);}else{const range=timeRangeFromDrag(startMinute,startMinute);showTask(null,ui.date,{start:formatTime(range.startMinutes),end:formatTime(range.endMinutes)});}});
  timeline.addEventListener('pointercancel',event=>{if(event.pointerId===pointerId)reset();});
}
function renderMonth() {
  const m=monthStats(ui.month);const cells=monthCells(ui.month);
  return `<section class="panel month-panel"><div class="month-panel-head"><div><h2>本月一览</h2><p>${m.tasks.length?`${m.tasks.length} 项计划，已完成 ${m.done} 项，累计安排 ${durationText(m.minutes)}。`:'这个月还没有安排计划，从今天开始也不晚。'}</p></div><div class="month-score"><strong>${m.progress}%</strong><span>本月完成度</span><span class="progress-track"><span class="progress-fill" style="width:${m.progress}%"></span></span></div></div><div class="month-weekdays">${days.map(d=>`<span>周${d}</span>`).join('')}</div><div class="month-grid">${cells.map(day=>{const tasks=tasksOn(day.date),done=tasks.filter(t=>t.done).length,complete=tasks.length>0&&done===tasks.length;return `<button class="month-cell ${day.isCurrentMonth?'':'outside'} ${day.isToday?'today':''} ${day.date===ui.date?'selected':''} ${tasks.length?'has-task':''} ${complete?'complete':''}" data-action="month-open-day" data-date="${day.date}" aria-label="${dateLabel(day.date,{month:'long',day:'numeric',weekday:'short'})}${tasks.length?`，${tasks.length} 项计划，已完成 ${done} 项`:'，暂无计划'}"><span class="month-cell-head"><span class="month-day">${day.day}</span>${tasks.length?`<span class="month-cell-count">${done}/${tasks.length}</span>`:''}</span>${tasks.length?`<span class="month-cell-tasks">${tasks.slice(0,2).map(t=>`<span class="month-task ${t.done?'done':''}"><span class="month-task-dot"></span><span>${e(t.title)}</span></span>`).join('')}${tasks.length>2?`<span class="month-more">还有 ${tasks.length-2} 项</span>`:''}</span><span class="month-meter"><span style="width:${Math.round(done/tasks.length*100)}%"></span></span>`:''}</button>`;}).join('')}</div><div class="month-legend"><span><span class="month-legend-dot"></span>有计划</span><span><span class="month-legend-meter"></span>完成进度</span><span>点击日期查看当天安排</span></div></section>`;
}
function renderMonthAside() {
  const m=monthStats(ui.month);
  return `<aside class="planner-sidebar"><section class="panel planner-notes"><h3>本月成果</h3><p>${m.tasks.length} 项计划 · 已完成 ${m.done} 项</p><span class="progress-track" style="width:100%;margin:13px 0"><span class="progress-fill" style="width:${m.progress}%"></span></span><p>${durationText(m.minutes)} 已投入 · ${m.activeDays} 天有安排</p>${m.busiest?`<p class="month-best">最投入的一天是 ${dateLabel(m.busiest.date,{month:'long',day:'numeric'})}，共 ${durationText(m.busiest.minutes)}。</p>`:'<p class="month-best">新的一个月，慢慢积累自己的节奏。</p>'}<button class="text-btn" data-action="export-month">${icon('download')}导出整月日程</button></section><section class="panel calendar-panel"><div class="panel-heading"><div class="panel-title"><h2>选择日期</h2></div></div>${miniCalendar()}</section></aside>`;
}
function renderStudioHome() {
  const s=stats(ui.date);const isToday=ui.date===today();
  const week=weekDates(ui.date);const weekTasks=store.state.tasks.filter(t=>week.includes(t.date));
  const minutes=weekTasks.reduce((n,t)=>n+toMinutes(t.end)-toMinutes(t.start),0);
  const amounts=week.map(d=>tasksOn(d).reduce((n,t)=>n+toMinutes(t.end)-toMinutes(t.start),0));const peak=Math.max(...amounts,60);

  return `<div class="studio-heading"><div><h1>${isToday?'今天，按自己的节奏。':'这一天，按自己的节奏。'}</h1><p>${dateLabel(ui.date,{year:'numeric',month:'long',day:'numeric',weekday:'long'})}<span>把时间留给重要的事。</span></p></div><button class="studio-date" data-action="date-picker">${icon('calendar')}<span>${dateLabel(ui.date)}</span>${icon('chevron')}</button></div>
  <div class="studio-overview"><div class="rhythm-progress"><div class="rhythm-label"><span>每天进一点，也很好</span><span>${s.done} / ${s.tasks.length} 项已完成</span></div>${renderDailyProgress(s)}</div><div class="studio-metrics"><div><span>${String(s.tasks.length).padStart(2,'0')}</span><small>今日安排</small></div><div><span>${String(s.done).padStart(2,'0')}</span><small>已经完成</small></div><div><span>${store.state.snippets.length}</span><small>可用片段</small></div></div></div>
  <div class="studio-grid">
    <section class="cover-card"><img src="./assets/morning-desk.png" alt="晨光照进书桌，给忙碌的一天留一点安静" onerror="this.style.display='none'"><div class="cover-top"><span>我的一方天地</span></div><div class="cover-caption"><p>少一点忙乱，<br>多一点<span>从容。</span></p><span>Make room for what matters.</span></div><button class="cover-link" data-action="new-task" aria-label="从安排一件事开始">${icon('arrow')}</button></section>
    <section class="activity-card studio-card"><div class="studio-card-head"><h2>一周节奏</h2><a class="circle-link" href="#planner" aria-label="查看一周计划">${icon('arrow')}</a></div><div class="activity-value">${(minutes/60).toFixed(1)}<span>h</span></div><p class="activity-label">本周已安排时间</p><div class="activity-bars">${week.map((d,i)=>`<button class="activity-bar-column ${d===ui.date?'selected':''}" data-action="select-date" data-date="${d}" aria-label="${dateLabel(d)}，安排 ${amounts[i]} 分钟"><span class="bar-space"><span class="activity-bar" style="height:${amounts[i]?Math.max(8,amounts[i]/peak*100):2}%"></span></span><span class="bar-day">${days[i]}</span></button>`).join('')}</div><p class="activity-bottom">${weekTasks.length?'每一段投入，都算数。':'这一周，还可以慢慢安排。'}</p></section>
    <section class="focus-card studio-card"><div class="studio-card-head"><h2>专注一刻</h2><button class="circle-link" data-action="focus-duration" aria-label="切换专注时长">${icon('expand')}</button></div><div class="focus-dial"><svg viewBox="0 0 220 220" aria-hidden="true"><circle class="dial-ticks" cx="110" cy="110" r="93"/><circle class="dial-track" cx="110" cy="110" r="93"/><circle id="focusArc" cx="110" cy="110" r="93"/></svg><div class="focus-dial-content"><span id="focusTime">25:00</span><small id="focusState">一次，只做一件事</small></div></div><div class="focus-controls"><button class="focus-control" data-action="focus-toggle" id="focusToggle" aria-label="开始专注">${icon('play')}</button><button class="focus-control" data-action="focus-reset" aria-label="重置计时">${icon('reset')}</button><button class="focus-length" data-action="focus-duration" id="focusDuration">25 分钟</button></div></section>
    <section class="studio-agenda"><div class="agenda-heading"><div class="agenda-top"><div><h2>${isToday?'今日计划':'当天计划'}</h2><p>腾出时间，慢慢完成。</p></div><button class="circle-link" data-action="new-task" aria-label="新建任务">${icon('plus')}</button></div><div class="agenda-date-nav"><button class="icon-btn" data-action="date-prev" aria-label="前一天">${icon('left')}</button><button class="agenda-date-button" data-action="date-picker">${dateLabel(ui.date,{month:'long',day:'numeric',weekday:'short'})}</button><button class="icon-btn" data-action="date-next" aria-label="后一天">${icon('chevron')}</button></div><div class="agenda-total"><span>待办任务</span><span>${s.pending}<small> / ${s.tasks.length}</small></span></div></div><div class="studio-task-list">${s.tasks.slice(0,6).map(taskRow).join('')||empty('留一点时间给自己','从一件小事，开始这一天。','new-task','安排第一件事')}</div><div class="agenda-bottom"><div><span class="agenda-dot"></span>${s.pending?`还有 ${s.pending} 件事，按自己的节奏来。`:s.tasks.length?'做得很好，今天的安排已完成。':'不必把每一分钟都填满。'}</div><a href="#planner">打开完整日程${icon('arrow')}</a></div></section>
    <section class="studio-calendar studio-card"><div class="studio-card-head"><h2>日历</h2><button class="text-btn" data-action="today">今天</button></div>${miniCalendar()}<a class="studio-calendar-foot studio-calendar-summary" href="#planner" aria-label="查看${dateLabel(ui.date)}的${s.tasks.length}项日程"><span class="calendar-summary-copy"><strong>${s.tasks.length} 项安排</strong><small>${s.minutes?`已安排 ${Math.floor(s.minutes/60)?Math.floor(s.minutes/60)+' 小时':''}${s.minutes%60?' '+s.minutes%60+' 分钟':''}`:'尚未安排'}</small></span>${icon('arrow')}</a></section>
  </div>`;
}
function updateFocus() {
  const remaining=focus.running?Math.max(0,Math.ceil((focus.endAt-Date.now())/1000)):focus.remaining;
  const time=$('#focusTime');if(time)time.textContent=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
  const arc=$('#focusArc');if(arc)arc.style.strokeDashoffset=String(440*(1-remaining/focus.duration));
  const state=$('#focusState');if(state)state.textContent=focus.running?'专注进行中':remaining===0?'做得很好，休息一下':'一次，只做一件事';
  const button=$('#focusToggle');if(button){button.innerHTML=icon(focus.running?'pause':'play');button.setAttribute('aria-label',focus.running?'暂停专注':'开始专注');button.classList.toggle('running',focus.running);}
  const length=$('#focusDuration');if(length)length.textContent=`${focus.duration/60} 分钟`;
}
function toggleFocus() {if(focus.running){focus.remaining=Math.max(0,Math.ceil((focus.endAt-Date.now())/1000));focus.running=false;}else{if(focus.remaining<=0)focus.remaining=focus.duration;focus.endAt=Date.now()+focus.remaining*1000;focus.running=true;}updateFocus();}
function showDatePicker() {
  $('#utilityContent').innerHTML=`<form id="datePickerForm"><div class="dialog-heading"><h2 id="utilityTitle">想安排哪一天？</h2><button type="button" class="icon-btn" data-action="close-utility" aria-label="关闭">${icon('close')}</button></div><div class="dialog-body"><div class="form-field"><label for="jumpDate">选择日期</label><input type="date" id="jumpDate" name="date" value="${ui.date}" required></div></div><div class="dialog-foot"><button type="button" class="btn" data-action="today">回到今天</button><span class="spacer"></span><button type="submit" class="btn primary">查看这一天</button></div></form>`;
  $('#datePickerForm').onsubmit=event=>{event.preventDefault();const value=$('#jumpDate').value;if(!value)return;ui.date=value;ui.month=value;$('#utilityDialog').close();render();};openDialog($('#utilityDialog'));
}
function renderWeek() {
  return `<div class="panel week-planner-scroll"><div class="week-planner">${weekDates(ui.date).map((date,i)=>`<div class="week-column ${date===today()?'today':''}"><div class="week-column-heading">周${days[i]}<b>${Number(date.slice(8))}</b></div>${tasksOn(date).map(t=>`<button class="week-event" data-action="edit-task" data-id="${e(t.id)}">${t.done?icon('check'):''}${e(t.title)}<small>${t.start} – ${t.end}</small></button>`).join('')||'<div class="week-empty">暂无安排</div>'}<button class="week-add" data-action="new-task" data-date="${date}" aria-label="添加${date}的任务">${icon('plus')}</button></div>`).join('')}</div></div>`;
}
function renderPlanner() {
  const s=stats(ui.date);const dates=weekDates(ui.date);const monthMode=ui.plannerView==='month';const unit=monthMode?'月':ui.plannerView==='week'?'周':'天';
  const label=monthMode?dateLabel(ui.month,{year:'numeric',month:'long'}):ui.plannerView==='week'?`${dateLabel(dates[0])} – ${dateLabel(dates[6])}`:dateLabel(ui.date,{year:'numeric',month:'long',day:'numeric'});
  const body=ui.plannerView==='week'?renderWeek():ui.plannerView==='month'?renderMonth():ui.plannerView==='day'?renderTimeline():`<section class="panel"><div class="panel-heading"><div class="panel-title"><h2>当天任务</h2><span class="section-count">${s.tasks.length}</span></div><span class="form-note">已完成 ${s.done} / ${s.tasks.length}</span></div><div class="task-list">${s.tasks.map(taskRow).join('')||empty('这一天，尚待安排','从一项清晰的小任务开始。','new-task','添加任务')}</div><div class="panel-foot"><button class="add-inline" data-action="new-task">${icon('plus')}添加一项计划</button></div></section>`;
  const aside=monthMode?renderMonthAside():`<aside class="planner-sidebar"><section class="panel calendar-panel"><div class="panel-heading"><div class="panel-title"><h2>选择日期</h2></div></div>${miniCalendar()}</section><section class="panel planner-notes"><h3>当天安排</h3><p>${s.tasks.length} 项任务 · 已完成 ${s.done} 项</p><span class="progress-track" style="width:100%;margin:13px 0"><span class="progress-fill" style="width:${s.progress}%"></span></span><p>安排时长 ${durationText(s.minutes)}</p><button class="text-btn" data-action="export-day">${icon('download')}导出当天日程</button></section></aside>`;
  return heading('给重要的事，留出时间。','安排每天的任务，也为自己留一点余地。')+`<div class="planner-toolbar"><div class="date-navigator"><strong>${label}</strong><button class="icon-btn" data-action="date-prev" aria-label="上一${unit}">${icon('left')}</button><button class="icon-btn" data-action="date-next" aria-label="下一${unit}">${icon('chevron')}</button><button class="btn quiet" data-action="today">今天</button></div><div class="view-controls">${[['day','日视图'],['week','周视图'],['month','月视图'],['list','任务清单']].map(([mode,label])=>`<button class="${ui.plannerView===mode?'active':''}" data-action="planner-mode" data-mode="${mode}">${label}</button>`).join('')}</div></div><div class="planner-grid ${monthMode?'month-layout':''}"><div>${body}</div>${aside}</div>`;
}
function render() {
  const active=document.activeElement;const preserveSearch=active?.id==='snippetSearch';const position=preserveSearch?active.selectionStart:null;
  $('#view').innerHTML=ui.route==='home'?renderStudioHome():ui.route==='planner'?renderPlanner():renderSnippets();
  $('#sidebarCategories').innerHTML=store.state.categories.map(cat=>`<a class="category-nav" href="#snippets" data-category-link="${e(cat)}"><span class="category-dot"></span>${e(cat)}<small>${store.state.snippets.filter(s=>s.category===cat).length}</small></a>`).join('');
  document.querySelectorAll('[data-route]').forEach(a=>{a.classList.toggle('active',a.dataset.route===ui.route);if(a.dataset.route===ui.route)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const count=tasksOn(today()).filter(t=>!t.done).length;$('#pendingCount').textContent=count||'';$('#pendingCount').hidden=!count;saveStatus();
  if(preserveSearch){const el=$('#snippetSearch');el?.focus();if(el&&position!==null)try{el.setSelectionRange(position,position)}catch{}}
  updateFocus();
  if(ui.route==='planner')$('.date-navigator strong')?.setAttribute('data-action','date-picker');
  setupTimelineDrag();
  appearance?.apply();
}
function route() {
  const [name='home', parameters='']=(location.hash.replace('#','')||'home').split('?');
  ui.favoritesOnly=name==='favorites'||name==='snippets'&&new URLSearchParams(parameters).get('filter')==='favorites';
  ui.route=name==='favorites'?'snippets':['home','planner','snippets'].includes(name)?name:'home';
  if(name==='favorites')history.replaceState(null,'','#snippets?filter=favorites');
  ui.selected.clear();ui.query='';ui.category='全部';$('#sidebar').classList.remove('open');render();
}
function openDialog(dialog) {focusOrigin=document.activeElement;if(!dialog.open)dialog.showModal();}
function closeEditor() {$('#editorDialog').close();focusOrigin?.focus?.();}
function catOptions(value) {return store.state.categories.map(c=>`<option value="${e(c)}" ${value===c?'selected':''}>${e(c)}</option>`).join('');}
function showTask(id, date, range = {}) {
  const t=store.state.tasks.find(t=>t.id===id);const day=date||ui.date;const defaultStart=range.start||'09:00';const defaultEnd=range.end||'10:00';const inputEnd=value=>value==='24:00'?'23:59':value;
  $('#editorContent').innerHTML=`<form id="taskForm"><div class="dialog-heading"><h2 id="editorTitle">${t?'编辑任务':'安排一项任务'}</h2><button type="button" class="icon-btn" data-action="close-editor" aria-label="关闭">${icon('close')}</button></div><div class="dialog-body"><div class="form-field"><label for="taskTitle">任务名称</label><input id="taskTitle" name="title" maxlength="120" value="${e(t?.title)}" required placeholder="这段时间，想完成什么？" autofocus></div><div class="form-field"><label for="taskDate">安排日期</label><input id="taskDate" name="date" type="date" value="${e(t?.date||day)}" required></div><div class="form-row"><div class="form-field"><label for="taskStart">开始时间</label><input id="taskStart" name="start" type="time" value="${e(t?.start||defaultStart)}" required></div><div class="form-field"><label for="taskEnd">结束时间</label><input id="taskEnd" name="end" type="time" value="${e(inputEnd(t?.end||defaultEnd))}" required></div></div><div class="form-row"><div class="form-field"><label for="taskCategory">分类</label><select id="taskCategory" name="category">${catOptions(t?.category||'工作')}</select></div><div class="form-field"><label for="taskPriority">优先级</label><select id="taskPriority" name="priority"><option value="low" ${t?.priority==='low'?'selected':''}>低 · 有空再做</option><option value="medium" ${!t||t.priority==='medium'?'selected':''}>普通 · 按计划完成</option><option value="high" ${t?.priority==='high'?'selected':''}>高 · 优先完成</option></select></div></div><div class="form-field"><label for="taskNotes">备注 <span class="form-note">选填</span></label><textarea class="short" id="taskNotes" name="notes" maxlength="4000" placeholder="补充说明、准备事项、相关链接…">${e(t?.notes)}</textarea></div><p class="form-error" id="formError" role="alert"></p><p class="form-note" id="conflictNote"></p></div><div class="dialog-foot">${t?`<button type="button" class="text-btn" style="color:var(--negative)" data-action="delete-task" data-id="${e(t.id)}">${icon('trash')}删除任务</button>`:''}<span class="spacer"></span><button type="button" class="btn" data-action="close-editor">取消</button><button class="btn primary" type="submit">${t?'保存更改':'添加任务'}</button></div></form>`;
  const form=$('#taskForm');
  const conflicts=()=>{const data=Object.fromEntries(new FormData(form));const matches=findConflicts(store.state.tasks,data,t?.id);$('#conflictNote').textContent=matches.length?`时间与「${matches[0].title}」重叠，仍可保存，请确认安排。`:'';};
  form.addEventListener('input',conflicts);form.addEventListener('change',conflicts);
  form.onsubmit=event=>{event.preventDefault();const data=Object.fromEntries(new FormData(form));const check=validateTask(data);if(!check.valid){$('#formError').textContent=Object.values(check.errors).flat().join('；');return;}try{if(t)store.updateTask(t.id,data);else store.addTask({...data,done:false});ui.date=data.date;ui.month=data.date;closeEditor();render();notify(t?'任务已更新':'已加入当天计划');}catch(err){$('#formError').textContent=err.message;}};
  openDialog($('#editorDialog'));conflicts();
}
function showSnippet(id) {
  const s=store.state.snippets.find(s=>s.id===id);
  $('#editorContent').innerHTML=`<form id="snippetForm"><div class="dialog-heading"><h2 id="editorTitle">${s?'编辑信息片段':'保存一条常用信息'}</h2><button type="button" class="icon-btn" data-action="close-editor" aria-label="关闭">${icon('close')}</button></div><div class="dialog-body"><div class="form-field"><label for="snippetTitle">片段标题</label><input id="snippetTitle" name="title" value="${e(s?.title)}" maxlength="120" required placeholder="给它起个方便查找的名字" autofocus></div><div class="form-field"><label for="snippetContent">复制内容</label><textarea id="snippetContent" name="content" maxlength="100000" required placeholder="保存常用回复、链接、地址或提示词…">${e(s?.content)}</textarea><span class="form-note">保留原始换行和格式，复制时只复制这里的内容。</span></div><div class="form-row"><div class="form-field"><label for="snippetCategory">分类</label><select id="snippetCategory" name="category">${catOptions(s?.category||(ui.category!=='全部'?ui.category:'工作'))}</select></div><div class="form-field"><label for="snippetNotes">备注 <span class="form-note">选填，不参与复制</span></label><input id="snippetNotes" name="notes" maxlength="4000" value="${e(s?.notes)}" placeholder="用途或查找关键词"></div></div><label class="inline-check"><input type="checkbox" name="pinned" ${s?.pinned?'checked':''}>收藏此片段，方便随手取用</label><p class="form-error" id="formError" role="alert"></p></div><div class="dialog-foot">${s?`<button type="button" class="text-btn" style="color:var(--negative)" data-action="delete-snippet" data-id="${e(s.id)}">${icon('trash')}删除片段</button>`:''}<span class="spacer"></span><button type="button" class="btn" data-action="close-editor">取消</button><button class="btn primary" type="submit">保存片段</button></div></form>`;
  $('#snippetForm').onsubmit=event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.target));data.pinned=data.pinned==='on';if(!data.title.trim()||!data.content.trim()){$('#formError').textContent='请填写标题和复制内容。';return;}try{if(s)store.updateSnippet(s.id,data);else store.addSnippet(data);closeEditor();notify('片段已保存，随时取用');}catch(err){$('#formError').textContent=err.message;}};
  openDialog($('#editorDialog'));
}
function previewSnippet(id) {
  const s=store.state.snippets.find(s=>s.id===id);if(!s)return;
  $('#editorContent').innerHTML=`<div class="dialog-heading"><h2 id="editorTitle">${e(s.title)}</h2><button class="icon-btn" data-action="close-editor" aria-label="关闭">${icon('close')}</button></div><div class="dialog-body"><div class="preview-meta">${categoryTag(s.category)}${s.notes?' · '+e(s.notes):''}</div><pre class="content-preview">${e(s.content)}</pre></div><div class="dialog-foot"><span class="form-note">已复制 ${s.copyCount} 次</span><span class="spacer"></span><button class="btn" data-action="edit-snippet" data-id="${e(s.id)}">${icon('edit')}编辑</button><button class="btn primary" data-action="copy-snippet" data-id="${e(s.id)}">${icon('copy')}复制内容</button></div>`;
  openDialog($('#editorDialog'));
}
async function writeClipboard(content) {
  try { if(navigator.clipboard&&isSecureContext){await navigator.clipboard.writeText(content);return;} }catch{ /* The browser may deny clipboard access; keep a gesture-based fallback. */ }
  const active=document.activeElement;const text=document.createElement('textarea');text.value=content;text.style.cssText='position:fixed;top:0;left:-9999px;';const parent=$('dialog[open]')||document.body;parent.append(text);text.focus();text.select();let copied=false;try{copied=document.execCommand('copy');}finally{text.remove();active?.focus?.();}if(!copied)throw new Error('浏览器未允许复制，请在全文预览中选中文字手动复制。');
}
async function copySnippet(id) {
  const s=store.state.snippets.find(s=>s.id===id);if(!s)return;
  try{await writeClipboard(s.content);ui.copied=id;try{store.recordCopy(id);notify('已复制，可直接粘贴使用');}catch{notify('内容已复制，但复制次数未能保存');}render();setTimeout(()=>{if(ui.copied===id){ui.copied=null;render();}},2200);}catch(err){notify(err.message);previewSnippet(id);}
}
function download(name, content, type='application/json') {const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportCalendar(all=false, month=null) {const items=all?store.state.tasks:month?store.state.tasks.filter(t=>t.date.slice(0,7)===month.slice(0,7)):tasksOn(ui.date);if(!items.length){notify('没有可导出的日程，请先添加任务');return;}const name=all?'全部日程':month||ui.date;try{download(`日序-${name}.ics`,createICalendar(items,{name:'日序 Daymark'}),'text/calendar;charset=utf-8');notify('日历文件已导出，可导入你的日历应用');}catch(err){notify('导出未完成：'+err.message);}}
function showBackup() {
  $('#utilityContent').innerHTML=`<div class="dialog-heading"><h2 id="utilityTitle">数据与备份</h2><button class="icon-btn" data-action="close-utility" aria-label="关闭">${icon('close')}</button></div><div class="dialog-body"><div class="backup-stats"><span><b>${store.state.tasks.length}</b>项任务</span><span><b>${store.state.snippets.length}</b>条片段</span><span><b>${store.state.categories.length}</b>个分类</span></div><section class="utility-block"><h3>给工作台留一份备份</h3><p>任务和片段保存在当前浏览器。换设备或清理浏览器前，导出一份 JSON 文件；需要时可以完整恢复。</p><div class="utility-actions"><button class="btn" data-action="export-json">${icon('download')}导出完整备份</button><button class="btn" data-action="import">${icon('upload')}导入备份 / 文本</button></div>${store.exportRecoveryData()?'<button class="text-btn" data-action="export-recovery">导出异常原始数据</button>':''}</section><section class="utility-block"><h3>带到你的日历里</h3><p>以 .ics 格式导出日程，可导入 Apple、Outlook 或其他支持 iCalendar 的日历应用。</p><div class="utility-actions"><button class="btn" data-action="export-day">导出所选日期</button><button class="btn" data-action="export-all">导出全部日程</button></div></section><section class="utility-block"><h3>管理信息分类</h3><p>按自己的工作习惯，为片段和任务增加分类。</p><form id="categoryForm" style="display:flex;gap:8px"><label class="sr-only" for="newCategory">新分类名称</label><input class="form-select" id="newCategory" placeholder="例如：常用链接" maxlength="40" required><button class="btn" type="submit">添加分类</button></form></section></div>`;
  $('#categoryForm').onsubmit=event=>{event.preventDefault();const name=$('#newCategory').value.trim();if(name&&safe(()=>{store.addCategory(name);return true;})){notify('分类已添加');showBackup();}};
  openDialog($('#utilityDialog'));
}
function showHelp() {
  $('#utilityContent').innerHTML=`<div class="dialog-heading"><h2 id="utilityTitle">把日序用顺手</h2><button class="icon-btn" data-action="close-utility" aria-label="关闭">${icon('close')}</button></div><div class="dialog-body help-list"><p><strong>规划一天</strong><br>点击「新建任务」，设置日期、开始与结束时间；在日视图的 24 小时时间轴上按住鼠标滑动，也能直接圈出一段时间并打开任务窗口。日程计划里可切换日视图、周视图、月视图与任务清单；点击任务名称编辑，点击方框完成任务。</p><p><strong>常用文字，一键带走</strong><br>在「信息速取」保存常用内容，点击「复制内容」后直接粘贴。备注只用于查找，不会跟着复制；收藏的内容可以在信息速取中通过「仅收藏」筛选查看。</p><p><strong>批量复制与导入</strong><br>勾选多条片段可合并复制。支持导入普通文本、Markdown，以及气泡笔记的分隔格式；JSON 备份可以合并或替换导入。</p><p><strong>键盘也很顺手</strong><br><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd> 搜索任务和片段；<kbd>N</kbd> 新建当前页面内容；<kbd>Esc</kbd> 关闭弹窗。</p><p><strong>你的数据，记得带走</strong><br>初次打开提供可编辑的示例。全部更改自动保存到当前浏览器；使用「数据与备份」导出完整备份。不同浏览器与设备间不会自动同步。</p></div>`;
  openDialog($('#utilityDialog'));
}
function showImport() {
  const json=ui.importType==='json';
  $('#utilityContent').innerHTML=`<div class="dialog-heading"><h2 id="utilityTitle">导入${json?'工作台备份':'信息片段'}</h2><button class="icon-btn" data-action="close-utility" aria-label="关闭">${icon('close')}</button></div><form id="importForm"><div class="dialog-body"><p class="readable-note">已选择：${e(ui.importName)}<br>${json?'JSON 备份将经过格式检查后导入。':'支持普通文本、Markdown，以及气泡笔记的 bubble 分隔格式。'}</p>${json?`<div class="import-options"><label><input type="radio" name="mode" value="merge" checked>合并导入，保留工作台已有内容</label><label><input type="radio" name="mode" value="replace">替换所有任务和片段（先自动下载当前备份）</label></div>`:`<div class="form-field" style="margin-top:16px"><label for="importCategory">导入到分类</label><select name="category" id="importCategory">${catOptions('工作')}</select></div>`}<p class="form-error" id="importError" role="alert"></p></div><div class="dialog-foot"><span class="spacer"></span><button class="btn" type="button" data-action="close-utility">取消</button><button class="btn primary" type="submit">确认导入</button></div></form>`;
  $('#importForm').onsubmit=event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.target));try{if(json){if(data.mode==='replace')download(`日序-导入前备份-${today()}.json`,store.exportJSON());const result=store.importJSON(ui.importText,{mode:data.mode});notify(`已导入 ${result.snippets} 条片段、${result.tasks} 项任务`);}else{const count=store.importMarkdown(ui.importText,{category:data.category});notify(`已导入 ${count} 条信息片段`);}$('#utilityDialog').close();ui.importText=null;ui.selected.clear();render();}catch(err){$('#importError').textContent=err.message;}};
  openDialog($('#utilityDialog'));
}
function showDelete(kind,id) {
  const snippet=kind==='snippet';const item=(snippet?store.state.snippets:store.state.tasks).find(t=>t.id===id);if(!item)return;
  $('#utilityContent').innerHTML=`<div class="dialog-heading"><h2 id="utilityTitle">删除这${snippet?'条片段':'项任务'}？</h2><button class="icon-btn" data-action="close-utility" aria-label="关闭">${icon('close')}</button></div><div class="dialog-body"><p class="readable-note">「${e(item.title)}」将从工作台移除。</p><p class="form-error" id="deleteError" role="alert"></p></div><div class="dialog-foot"><span class="spacer"></span><button class="btn" data-action="close-utility">保留</button><button class="btn danger" id="confirmDelete">确认删除</button></div>`;
  $('#confirmDelete').onclick=()=>{try{snippet?store.deleteSnippet(id):store.deleteTask(id);$('#utilityDialog').close();closeEditor();ui.selected.delete(id);notify(snippet?'片段已删除':'任务已删除',()=>snippet?store.restoreSnippet(item):store.restoreTask(item));}catch(err){$('#deleteError').textContent=err.message;}};
  openDialog($('#utilityDialog'));
}
function commandResults() {
  const q=$('#commandSearch').value.trim().toLocaleLowerCase();
  const snippets=store.state.snippets.filter(s=>!q||`${s.title} ${s.content} ${s.notes||''}`.toLocaleLowerCase().includes(q)).slice(0,5);
  const tasks=store.state.tasks.filter(t=>!q||`${t.title} ${t.notes||''}`.toLocaleLowerCase().includes(q)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
  $('#commandResults').innerHTML=snippets.map(s=>`<button class="command-result" data-action="search-snippet" data-id="${e(s.id)}">${icon('layers')}<span><strong>${e(s.title)}</strong><small>${e(s.content.slice(0,90))}</small></span><em>信息片段</em></button>`).join('')+tasks.map(t=>`<button class="command-result" data-action="search-task" data-id="${e(t.id)}">${icon('calendar')}<span><strong>${e(t.title)}</strong><small>${e(t.date)} · ${t.start} – ${t.end}</small></span><em>${t.done?'已完成':'待办任务'}</em></button>`).join('')||empty('没有找到匹配内容','试试标题、备注或更短的关键词。');
}
function showSearch() {$('#commandSearch').value='';commandResults();openDialog($('#searchDialog'));$('#commandSearch').focus();}

document.addEventListener('click',async event=>{
  const categoryLink=event.target.closest('[data-category-link]');
  if(categoryLink){event.preventDefault();ui.category=categoryLink.dataset.categoryLink;ui.query='';ui.route='snippets';ui.selected.clear();if(location.hash!=='#snippets'){history.pushState(null,'','#snippets');}$('#sidebar').classList.remove('open');render();return;}
  const b=event.target.closest('[data-action]');if(!b)return;
  const {action,id,date,mode,category}=b.dataset;
  if(action==='date-picker'){showDatePicker();return;}
  if(action==='focus-toggle'){toggleFocus();return;}
  if(action==='focus-reset'){focus.running=false;focus.remaining=focus.duration;updateFocus();notify('计时已重置');return;}
  if(action==='focus-duration'){focus.running=false;const mins=focus.duration/60;focus.duration=(mins===25?50:mins===50?15:25)*60;focus.remaining=focus.duration;updateFocus();notify(`专注时长已切换为 ${focus.duration/60} 分钟`);return;}
  if(action==='new-task'){showTask(null,date);return;}
  if(action==='new-snippet'){showSnippet();return;}
  if(action==='edit-task'){showTask(id);return;}
  if(action==='toggle-task'){safe(()=>store.toggleTask(id));return;}
  if(action==='edit-snippet'){showSnippet(id);return;}
  if(action==='preview-snippet'){previewSnippet(id);return;}
  if(action==='copy-snippet'){await copySnippet(id);return;}
  if(action==='pin-snippet'){safe(()=>{const pinned=store.togglePin(id);notify(pinned?'已加入收藏':'已取消收藏');});return;}
  if(action==='favorites-filter'){ui.favoritesOnly=!ui.favoritesOnly;ui.selected.clear();history.replaceState(null,'',ui.favoritesOnly?'#snippets?filter=favorites':'#snippets');render();return;}
  if(action==='delete-task'||action==='delete-snippet'){showDelete(action==='delete-task'?'task':'snippet',id);return;}
  if(action==='close-editor'){closeEditor();return;}
  if(action==='close-utility'){$('#utilityDialog').close();return;}
  if(action==='select-date'){ui.date=date;if(!sameMonth(ui.month,date))ui.month=date;render();return;}
  if(action==='month-prev'||action==='month-next'){ui.month=addMonths(ui.month,action==='month-prev'?-1:1);render();return;}
  if(action==='today'){ui.date=today();ui.month=today();if($('#datePickerForm'))$('#utilityDialog').close();render();return;}
  if(action==='date-prev'||action==='date-next'){
    const delta=action==='date-prev'?-1:1;
    if(ui.route==='planner'&&ui.plannerView==='month')ui.month=addMonths(ui.month,delta);
    else{ui.date=addDays(ui.date,delta*(ui.route==='planner'&&ui.plannerView==='week'?7:1));ui.month=ui.date;}
    render();return;
  }
  if(action==='planner-mode'){ui.plannerView=mode;render();return;}
  if(action==='month-open-day'){ui.date=date;ui.month=date;ui.plannerView='day';render();return;}
  if(action==='filter'){ui.category=category;ui.selected.clear();render();return;}
  if(action==='snippet-view'){ui.snippetView=mode;render();return;}
  if(action==='clear-selection'){ui.selected.clear();render();return;}
  if(action==='select-all'){filteredSnippets().forEach(s=>ui.selected.add(s.id));render();return;}
  if(action==='copy-selected'){const snippets=store.state.snippets.filter(s=>ui.selected.has(s.id));try{await writeClipboard(snippets.map(s=>s.content).join('\n\n'));notify(`已合并复制 ${snippets.length} 条片段`);}catch(err){notify(err.message);}return;}
  if(action==='search'){showSearch();return;}
  if(action==='close-search'){$('#searchDialog').close();return;}
  if(action==='search-snippet'){$('#searchDialog').close();previewSnippet(id);return;}
  if(action==='search-task'){$('#searchDialog').close();showTask(id);return;}
  if(action==='menu'){$('#sidebar').classList.toggle('open');return;}
  if(action==='backup'){showBackup();return;}
  if(action==='help'){showHelp();return;}
  if(action==='export-json'){download(`日序-完整备份-${today()}.json`,store.exportJSON());notify('完整备份已导出');return;}
  if(action==='export-recovery'){download(`日序-恢复原始数据-${today()}.txt`,store.exportRecoveryData(),'text/plain');return;}
  if(action==='export-day'){exportCalendar();return;}
  if(action==='export-month'){exportCalendar(false,ui.month);return;}
  if(action==='export-all'){exportCalendar(true);return;}
  if(action==='import'){$('#importFile').value='';$('#importFile').click();return;}
});
document.addEventListener('input',event=>{if(event.target.id==='snippetSearch'){ui.query=event.target.value;if(!event.isComposing)render();}if(event.target.id==='commandSearch')commandResults();});
document.addEventListener('compositionend',event=>{if(event.target.id==='snippetSearch'){ui.query=event.target.value;render();}});
document.addEventListener('change',event=>{if(event.target.dataset.select){const id=event.target.dataset.select;event.target.checked?ui.selected.add(id):ui.selected.delete(id);render();}});
$('#importFile').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;if(file.size>8*1024*1024){notify('文件超过 8 MB，请拆分后再导入');return;}try{ui.importText=await file.text();ui.importName=file.name;ui.importType=file.name.toLowerCase().endsWith('.json')?'json':'markdown';showImport();}catch{notify('文件读取失败，请重新选择');}});
document.addEventListener('keydown',event=>{
  const typing=event.target.matches('input,textarea,select,[contenteditable="true"]');
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(!$('dialog[open]'))showSearch();return;}
  if(!typing&&!$('dialog[open]')&&event.key.toLowerCase()==='n'){event.preventDefault();ui.route==='snippets'||ui.route==='favorites'?showSnippet():showTask();}
  if(!typing&&!$('dialog[open]')&&event.key==='/'){event.preventDefault();showSearch();}
  if(event.key==='Escape')$('#sidebar').classList.remove('open');
});
document.addEventListener('pointerdown',event=>{if($('#sidebar').classList.contains('open')&&!event.target.closest('#sidebar')&&!event.target.closest('[data-action="menu"]'))$('#sidebar').classList.remove('open');});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',event=>{if(event.target===d){const r=d.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)d.close();}}));
window.addEventListener('hashchange',route);
window.addEventListener('popstate',route);
store.subscribe(()=>render());
store.onError(()=>saveStatus());
appearance=initAppearance({getSettings:()=>store.state.settings,saveSettings:patch=>store.updateSettings(patch),notify,icon});
hydrateIcons();route();
if(store.status.error)setTimeout(()=>notify(store.status.error.message),100);
setInterval(()=>{if(focus.running&&Date.now()>=focus.endAt){focus.running=false;focus.remaining=0;notify('专注结束，给自己一点休息时间。');}if(focus.running||$('#focusTime'))updateFocus();},1000);
