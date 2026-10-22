import { initGlassOptics } from './glass-optics.js';
import { createImageCropEditor } from './image-crop.js';

const THEMES = [
  { id:'signal', tone:'light', name:'石墨红', description:'冷白 · 石墨 · 信号红', colors:['#eef1f5','#fcfcfc','#c20000','#020d26','#526f91'] },
  { id:'cobalt', tone:'light', name:'冰川蓝', description:'冰蓝 · 钢蓝 · 孔雀青', colors:['#c9daed','#dfebf8','#234f9b','#172f51','#226f78'] },
  { id:'forest', tone:'light', name:'松庭绿', description:'鼠尾草 · 翡翠 · 松绿', colors:['#b8cdbd','#d1e1cf','#246548','#173b2f','#325d68'] },
  { id:'violet', tone:'light', name:'雾藤紫', description:'灰藤 · 葡萄紫 · 玫瑰', colors:['#c9bedb','#e0d5ee','#67418b','#382849','#7e4167'] },
  { id:'graphite', tone:'dark', name:'钛灰青', description:'钛灰 · 银青 · 雾蓝', colors:['#242d31','#354247','#a7d4c6','#e3eeeb','#bbc9e0'] },
  { id:'midnight', tone:'dark', name:'午夜蓝', description:'深海 · 冰蓝 · 鸢尾', colors:['#10151e','#192231','#83b8ff','#edf3fc','#c2b6e9'] },
];
const THEME_IDS = new Set(THEMES.map(theme=>theme.id));
const DEFAULT_COVER = './assets/morning-desk.png';

export function initAppearance({ getSettings, saveSettings, notify, icon }) {
  const root=document.documentElement;
  const dialog=document.querySelector('#appearanceDialog');
  const fileInput=document.querySelector('#appearanceImageInput');
  const glassOptics=initGlassOptics();
  const cropEditor=createImageCropEditor({icon});
  let media={cover:null,wallpaper:null};
  let connected=false;
  let busy=false;
  let busyKind=null;
  let busyLabel='';
  let error='';
  let originButton=null;

  const $=selector=>dialog.querySelector(selector);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const settings=()=>getSettings()||{};
  const currentTheme=()=>THEME_IDS.has(settings().theme)?settings().theme:'signal';
  const material=()=>settings().cardMaterial==='plain'?'plain':'glass';
  function normalizeMedia(entry,kind) {
    if(!entry)return null;
    const url=new URL(entry.url,location.origin);
    const version=String(entry.version??'');
    if(url.origin!==location.origin||url.pathname!==`/media/${kind}.webp`||!/^[a-zA-Z0-9._-]{1,100}$/.test(version))return null;
    return {url:`${url.pathname}?v=${encodeURIComponent(version)}`,version};
  }
  function apply() {
    root.dataset.theme=currentTheme();root.dataset.themeTone=THEMES.find(theme=>theme.id===currentTheme()).tone;root.dataset.material=material();
    const wallpaper=Boolean(media.wallpaper&&settings().wallpaperEnabled===true);
    document.body.classList.toggle('wallpaper-on',wallpaper);
    document.body.classList.toggle('custom-cover',Boolean(media.cover));
    document.body.style.setProperty('--wallpaper-image',media.wallpaper?`url("${media.wallpaper.url}")`:'none');
    document.body.dataset.wallpaperSrc=wallpaper?media.wallpaper.url:'';
    const cover=document.querySelector('.cover-card>img');
    if(cover){const src=media.cover?.url||DEFAULT_COVER;if(cover.getAttribute('src')!==src){cover.src=src;cover.style.display='';}cover.alt=media.cover?'我的工作台封面图片':'晨光照进书桌，给忙碌的一天留一点安静';}
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',THEMES.find(t=>t.id===currentTheme()).colors[0]);
    glassOptics.refresh();
  }
  function setError(message) {error=message;const box=$('#appearanceError');if(box)box.textContent=message;}
  function persist(patch) {
    try {saveSettings(patch);apply();return true;}
    catch(cause){setError(cause.message||'外观设置未能保存，请重试。');notify(cause.message||'外观设置未能保存，请重试。');return false;}
  }
  async function loadMedia({quiet=false}={}) {
    try {
      const response=await fetch('/api/appearance',{cache:'no-store'});
      if(!response.ok)throw new Error('图片服务尚未就绪，请重新启动日序后重试。');
      const data=await response.json();
      media={cover:normalizeMedia(data.cover,'cover'),wallpaper:normalizeMedia(data.wallpaper,'wallpaper')};
      connected=true;apply();return true;
    }catch(cause){connected=false;if(!quiet)setError(cause.message||'无法读取已保存图片，请重试。');return false;}
  }
  function sectionMedia(kind,title,description) {
    const isCover=kind==='cover';const custom=media[kind];
    const src=custom?.url||(isCover?DEFAULT_COVER:null);
    return `<section class="appearance-media-block"><div class="appearance-image-preview ${isCover?'cover-preview':'wallpaper-preview'} ${custom?'has-custom':''}">${src?`<img src="${escape(src)}" alt="${title}预览">`:`<div class="plain-background-preview">${icon('image')}<span>默认纯色背景</span></div>`}<span class="image-preview-label">${custom?'已保存自定义图片':isCover?'默认封面':'默认纯色'}</span></div><h3>${title}</h3><p>${description}</p><div class="appearance-media-actions"><button class="btn" data-appearance-action="upload-${kind}" ${busy?'disabled':''}>${icon('upload')}${busyKind===kind?busyLabel:custom?'替换图片':'上传图片'}</button><button class="text-btn" data-appearance-action="reset-${kind}" ${busy||!custom?'disabled':''}>恢复默认</button></div>${!isCover?`<label class="appearance-switch"><input type="checkbox" id="wallpaperEnabled" ${custom&&settings().wallpaperEnabled===true?'checked':''} ${!custom||busy?'disabled':''}><span>显示背景壁纸</span></label>`:''}</section>`;
  }
  function renderDialog() {
    const scroll=dialog.scrollTop;
    dialog.innerHTML=`<div class="dialog-heading"><div><h2 id="appearanceTitle">让工作台，更像你。</h2><p class="appearance-intro">换一套配色，留住自己的节奏。</p></div><button class="icon-btn" data-appearance-action="close" aria-label="关闭外观设置">${icon('close')}</button></div><div class="appearance-body"><section class="appearance-section"><div class="appearance-section-title"><h3>工作台配色</h3><span>选择后自动保存</span></div><div class="theme-options">${THEMES.map(theme=>`<button class="theme-option ${currentTheme()===theme.id?'selected':''}" data-theme-choice="${theme.id}" aria-pressed="${currentTheme()===theme.id}"><span class="theme-miniature" style="--preview-ground:${theme.colors[0]};--preview-surface:${theme.colors[1]};--preview-accent:${theme.colors[2]};--preview-ink:${theme.colors[3]};--preview-secondary:${theme.colors[4]}"><span class="theme-preview-nav"></span><span class="theme-preview-panel"></span><span class="theme-preview-accent"></span><span class="theme-preview-secondary"></span></span><span class="theme-option-label"><strong>${theme.name}</strong>${currentTheme()===theme.id?icon('check'):''}</span><small>${theme.description}</small></button>`).join('')}</div></section><section class="appearance-section material-choice"><div><h3>卡片材质</h3><p>玻璃透出壁纸，素面保留纯色卡片。</p></div><div class="view-controls" aria-label="卡片材质"><button data-material-choice="glass" class="${material()==='glass'?'active':''}" aria-pressed="${material()==='glass'}">玻璃</button><button data-material-choice="plain" class="${material()==='plain'?'active':''}" aria-pressed="${material()==='plain'}">素面</button></div></section><section class="appearance-section"><div class="appearance-section-title"><h3>你的图片</h3><span>支持 JPG、PNG、WebP 等常见格式</span></div><div class="appearance-media-grid">${sectionMedia('cover','左侧封面','上传后拖动、缩放图片，选择封面要展示的区域。')}${sectionMedia('wallpaper','背景壁纸','按当前屏幕比例预览，选择壁纸要展示的区域。')}</div><p class="appearance-storage-note">${icon('archive')}确认裁剪后保存到本地项目，并替换之前的同类图片；取消编辑会保留原图。</p></section><p id="appearanceError" class="form-error" role="alert">${escape(error)}</p><div class="appearance-status" role="status" aria-live="polite">${busy?`${busyLabel}，请稍候…`:connected?'图片已连接到本地项目':'图片服务连接中'}</div></div>`;
    dialog.scrollTop=scroll;
  }
  async function open() {
    originButton=document.activeElement;error='';renderDialog();
    if(!dialog.open)dialog.showModal();
    await loadMedia();if(dialog.open)renderDialog();
  }
  function close(){if(busy)return;dialog.close();originButton?.focus?.();}
  function chooseFile(kind) {
    if(busy)return;
    fileInput.dataset.kind=kind;fileInput.value='';fileInput.click();
  }
  function imageAspect(kind) {
    if(kind==='wallpaper')return Math.max(1,document.documentElement.clientWidth)/Math.max(1,window.innerHeight);
    const cover=document.querySelector('.cover-card');
    const box=cover?.getBoundingClientRect();
    if(box?.width&&box?.height)return box.width/box.height;
    // The theme panel is also available outside the home route. Measure the
    // existing responsive grid rules rather than guessing the cover's ratio.
    const view=document.querySelector('#view');
    const probe=document.createElement('div');probe.className='studio-grid';
    probe.style.cssText=`position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;width:${Math.max(1,view.clientWidth)}px`;
    probe.innerHTML='<section class="cover-card"></section>';view.append(probe);
    try{const rect=probe.firstElementChild.getBoundingClientRect();return rect.width/rect.height||1;}
    finally{probe.remove();}
  }
  async function upload(file,kind) {
    if(busy||!['cover','wallpaper'].includes(kind))return;
    const wasOpen=dialog.open,scroll=dialog.scrollTop,aspect=imageAspect(kind);
    busy=true;busyKind=kind;busyLabel='正在读取';error='';if(wasOpen)renderDialog();
    try{
      const saved=await cropEditor.open({file,kind,aspect,onReady:()=>{if(dialog.open)dialog.close('crop');},onSave:async blob=>{
        const response=await fetch(`/api/media/${kind}`,{method:'PUT',headers:{'Content-Type':'image/webp'},body:blob});
        const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'图片未能保存，请重试。');
        const entry=normalizeMedia(data,kind);
        if(!entry)throw new Error('图片已经保存，但预览未能刷新，请刷新网页。');
        media={...media,[kind]:entry};connected=true;
        if(kind==='wallpaper'&&!persist({wallpaperEnabled:true}))throw new Error('壁纸已经保存，但外观设置未能保存，请重试或重新启用壁纸。');
        apply();
      }});
      if(saved)notify(kind==='cover'?'封面已裁剪并替换原图':'壁纸已裁剪并启用');
    }catch(cause){setError(cause.message||'图片上传失败，请重试。');notify(cause.message||'图片上传失败，请重试。');}
    finally{
      busy=false;busyKind=null;busyLabel='';fileInput.value='';
      if(wasOpen){renderDialog();if(!dialog.open)dialog.showModal();dialog.scrollTop=scroll;$(`[data-appearance-action="upload-${kind}"]`)?.focus({preventScroll:true});}
    }
  }
  async function reset(kind) {
    if(busy||!media[kind])return;busy=true;busyKind=kind;busyLabel='正在恢复';error='';renderDialog();
    try{
      const response=await fetch(`/api/media/${kind}`,{method:'DELETE'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'恢复默认失败，请重试。');
      media={...media,[kind]:null};
      if(kind==='wallpaper')persist({wallpaperEnabled:false});
      apply();await loadMedia({quiet:true});notify(kind==='cover'?'已恢复默认封面':'已恢复默认纯色背景');
    }catch(cause){setError(cause.message);notify(cause.message);}
    finally{busy=false;busyKind=null;busyLabel='';renderDialog();}
  }
  document.addEventListener('click',event=>{
    const themeButton=event.target.closest('[data-theme-choice]');
    if(themeButton){if(persist({theme:themeButton.dataset.themeChoice})){error='';renderDialog();$(`[data-theme-choice="${currentTheme()}"]`)?.focus();}return;}
    const materialButton=event.target.closest('[data-material-choice]');
    if(materialButton){if(persist({cardMaterial:materialButton.dataset.materialChoice})){error='';renderDialog();$(`[data-material-choice="${material()}"]`)?.focus();}return;}
    const trigger=event.target.closest('[data-appearance-action]');if(!trigger)return;
    const action=trigger.dataset.appearanceAction;
    if(action==='open')void open();else if(action==='close')close();else if(action.startsWith('upload-'))chooseFile(action.slice(7));else if(action.startsWith('reset-'))void reset(action.slice(6));
  });
  dialog.addEventListener('change',event=>{if(event.target.id==='wallpaperEnabled'){persist({wallpaperEnabled:event.target.checked});renderDialog();$('#wallpaperEnabled')?.focus();}});
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  fileInput.addEventListener('change',()=>{const file=fileInput.files[0];if(file)void upload(file,fileInput.dataset.kind);});
  apply();void loadMedia({quiet:true});
  return {apply,open,refresh:loadMedia};
}
