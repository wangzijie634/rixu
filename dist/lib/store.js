/** Local-first data model. Mutations persist atomically before notifying the UI. */
export const STORAGE_KEY = 'shiguang-workbench-v1';
export const BACKUP_KEY = `${STORAGE_KEY}:backup`;
const FORMAT = 'shiguang-workbench';
const MAX_ITEMS = 10000;
const DEFAULT_CATEGORIES = ['工作', '学习', '生活', '灵感'];
const DEFAULT_SETTINGS = { weekStart: 1, dayStart: '08:00', dayEnd: '22:00', displayName: '朋友' };

export class StoreError extends Error {
  constructor(message, code = 'VALIDATION', cause) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function uid(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function fail(message) { throw new StoreError(message); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}格式不正确。`);
  return value;
}
function text(value, label, max, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > max) fail(`${label}${allowEmpty ? '' : '不能为空，且'}必须是 ${max.toLocaleString()} 字以内的文字。`);
  return value;
}
function boolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label}必须是布尔值。`);
  return value;
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDate(date) === value;
}
function validTime(value) { return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
function snippet(value) {
  object(value, '文字');
  const count = value.copyCount ?? 0;
  if (!Number.isSafeInteger(count) || count < 0) fail('复制次数必须是非负整数。');
  const timestamp = value.updatedAt || new Date().toISOString();
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) fail('文字更新时间无效。');
  return {
    id: text(value.id, '文字标识', 200), title: text(value.title, '标题', 200),
    content: text(value.content, '正文', 500000), category: text(value.category, '文字分类', 40),
    pinned: boolean(value.pinned ?? false, '收藏状态'), copyCount: count, updatedAt: timestamp,
    notes: text(value.notes ?? '', '文字备注', 10000, true)
  };
}
function task(value) {
  object(value, '任务');
  if (!validDate(value.date)) fail('请选择有效的任务日期。');
  if (!validTime(value.start) || !validTime(value.end)) fail('开始与结束时间需使用 HH:mm 格式。');
  if (value.end <= value.start) fail('结束时间须晚于开始时间；跨天安排请拆成两项任务。');
  const priority = value.priority ?? 'medium';
  if (!['high', 'medium', 'low'].includes(priority)) fail('优先级须为 high、medium 或 low。');
  return {
    id: text(value.id, '任务标识', 200), title: text(value.title, '任务标题', 200),
    date: value.date, start: value.start, end: value.end, category: text(value.category, '任务分类', 40),
    priority, done: boolean(value.done ?? false, '完成状态'), notes: text(value.notes ?? '', '任务备注', 10000, true)
  };
}
function settings(value) {
  object(value, '设置');
  const result = { ...DEFAULT_SETTINGS };
  for (const [key, entry] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('设置字段无效。');
    if (!['string', 'number', 'boolean'].includes(typeof entry) && entry !== null) fail('设置仅支持文字、数字和布尔值。');
    if (typeof entry === 'number' && !Number.isFinite(entry)) fail('设置数字无效。');
    if (typeof entry === 'string' && entry.length > 1000) fail('设置文字过长。');
    result[key] = entry;
  }
  return result;
}
function validateState(value) {
  object(value, '备份');
  if (!Array.isArray(value.snippets) || !Array.isArray(value.tasks) || !Array.isArray(value.categories)) fail('备份须包含 snippets、tasks、categories 数组。');
  if (value.snippets.length > MAX_ITEMS || value.tasks.length > MAX_ITEMS || value.categories.length > 100) fail('备份条目数量超出上限。');
  const result = {
    snippets: value.snippets.map(snippet), tasks: value.tasks.map(task),
    categories: [...new Set(value.categories.map(item => text(item, '分类名称', 40)))],
    settings: settings(value.settings ?? {})
  };
  if (!result.categories.length) fail('至少保留一个分类。');
  for (const list of [result.snippets, result.tasks]) {
    if (new Set(list.map(item => item.id)).size !== list.length) fail('备份中存在重复的条目标识。');
    for (const item of list) if (!result.categories.includes(item.category)) result.categories.push(item.category);
  }
  if (result.categories.length > 100) fail('分类数量超出上限。');
  return result;
}
function parseJSON(raw) {
  if (typeof raw !== 'string' || raw.length > 20000000) fail('请选择 20 MB 以内的 JSON 备份。');
  let data;
  try { data = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { fail('JSON 文件无法解析，请检查文件是否完整。'); }
  if (data?.format !== undefined) {
    if (data.format !== FORMAT || data.version !== 1) fail('该文件不是受支持的时光工作台备份。');
    return validateState(data.state);
  }
  return validateState(data);
}
function envelope(state) { return JSON.stringify({ format: FORMAT, version: 1, exportedAt: new Date().toISOString(), state }, null, 2); }

function seedState() {
  const now = new Date().toISOString();
  const today = localDate();
  const snippets = [
    ['工作邮件开场', '你好，\n\n关于我们讨论的事项，整理如下，供你参考。如有需要补充的内容，欢迎随时沟通。\n\n祝好！', '工作', true, 0],
    ['邮件结束语', '以上信息供你参考。\n\n感谢你的时间，祝工作顺利！', '工作', false, 0],
    ['会议纪要模板', '会议主题：\n参会人员：\n\n一、讨论要点\n\n二、待办事项\n负责人 / 截止日期 / 下一步行动', '工作', false, 0],
    ['学习复盘提示', '今天学到了什么？\n有什么还没理解？\n用自己的话解释一个概念。\n明天可以实践的一个小步骤是什么？', '学习', true, 0],
    ['礼貌跟进进度', '你好，想跟进一下这项工作的进展。方便时请告知目前的状态，以及是否有需要我配合的地方。谢谢！', '工作', false, 0],
    ['把灵感留住', '先记录，再打磨。\n\n想法：\n它能解决什么问题：\n可以尝试的最小一步：', '灵感', false, 0]
  ].map(([title, content, category, pinned, copyCount]) => ({ id: uid('snippet'), title, content, category, pinned, copyCount, updatedAt: now }));
  const tasks = [
    ['整理今天的优先事项', '09:00', '09:30', '工作', 'medium', true, '挑出最重要的三件事，给它们留出时间。'],
    ['推进个人项目', '10:30', '12:00', '工作', 'high', true, '把通知放一边，一次只做一件事。'],
    ['阅读与学习', '14:00', '15:00', '学习', 'medium', false, '读一个章节，写下三个收获。'],
    ['整理资料与收尾', '16:00', '17:00', '工作', 'low', false, '整理今天的资料，记录明天继续的起点。']
  ].map(([title, start, end, category, priority, done, notes]) => ({ id: uid('task'), title, date: today, start, end, category, priority, done, notes }));
  return { snippets, tasks, categories: [...DEFAULT_CATEGORIES], settings: { ...DEFAULT_SETTINGS } };
}

function decodeEntities(value, line) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  return value.replace(/&([^&;\s]+);/g, (entity, name) => {
    if (Object.hasOwn(named, name)) return named[name];
    if (!name.startsWith('#')) return entity;
    if (!/^#(?:\d+|x[\da-f]+)$/i.test(name)) fail(`第 ${line} 行的备注转义无效。`);
    const hex = /^#x/i.test(name);
    const point = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (point < 0 || point > 0x10ffff || point >= 0xd800 && point <= 0xdfff) fail(`第 ${line} 行的备注字符无效。`);
    return String.fromCodePoint(point);
  });
}
function marker(line, number) {
  const match = /^\s*<!--\s*(\/?)bubble((?:\s+[a-z]+="[^"\r\n]*")*)\s*-->\s*$/.exec(line);
  if (!match) fail(`第 ${number} 行的 bubble 标记不完整。`);
  const attrs = {};
  for (const attr of match[2].matchAll(/\s+([a-z]+)="([^"\r\n]*)"/g)) {
    const [, key, value] = attr;
    if (Object.hasOwn(attrs, key) || !(match[1] ? ['id', 'fence'] : ['id', 'fence', 'color', 'remark']).includes(key)) fail(`第 ${number} 行含无效或重复的标记属性。`);
    attrs[key] = value;
  }
  if (attrs.fence !== undefined && (!/^[A-Za-z0-9_-]+$/.test(attrs.fence) || attrs.id === undefined)) fail(`第 ${number} 行的 fence 标记无效。`);
  if (attrs.color !== undefined && !/^(?:[0-9]|1[01])$/.test(attrs.color)) fail(`第 ${number} 行的颜色标记无效。`);
  if (attrs.id !== undefined) {
    try { attrs.id = decodeURIComponent(attrs.id); } catch { fail(`第 ${number} 行的标识编码无效。`); }
    if (!attrs.id) fail(`第 ${number} 行的标识不能为空。`);
  }
  return { closing: !!match[1], ...attrs, remark: attrs.remark === undefined ? '' : decodeEntities(attrs.remark, number) };
}
function titleFor(content) { return content.split('\n').find(line => line.trim())?.replace(/^#{1,6}\s*/, '').trim().slice(0, 60) || '未命名文字'; }

/** Parse plain Markdown as one entry, or bubble-garden marker blocks as a library. */
export function parseMarkdown(raw, { category = '工作', title } = {}) {
  if (typeof raw !== 'string' || raw.length > 20000000) fail('请选择 20 MB 以内的 Markdown 或文本文件。');
  const source = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!source.trim()) fail('文件为空，没有可以导入的文字。');
  const lines = source.split('\n');
  const hasMarkers = lines.some(line => /^\s*<!--\s*\/?bubble(?=\s|>|$)/.test(line));
  const knownFormat = lines.some(line => line.trim() === '<!-- bubble-garden-notes:v1 -->');
  const now = new Date().toISOString();
  const make = (content, remark = '') => snippet({ id: uid('snippet'), title: remark.trim().slice(0, 200) || title || titleFor(content), content, category, pinned: false, copyCount: 0, updatedAt: now });
  if (!hasMarkers && !knownFormat) return [make(source)];
  const entries = [];
  const ids = new Set();
  let begun = false;
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].trim()) continue;
    if (!begun && /^\s*<!--[\s\S]*-->\s*$/.test(lines[index]) && !/^\s*<!--\s*\/?bubble(?=\s|>|$)/.test(lines[index])) continue;
    const open = marker(lines[index], index + 1);
    if (open.closing) fail(`第 ${index + 1} 行缺少对应的开始标记。`);
    begun = true;
    if (open.id && ids.has(open.id)) fail(`第 ${index + 1} 行有重复的文字标识。`);
    if (open.id) ids.add(open.id);
    let end = -1;
    for (let next = index + 1; next < lines.length; next++) {
      if (!/^\s*<!--\s*\/bubble(?=\s|>|$)/.test(lines[next])) continue;
      let close;
      try { close = marker(lines[next], next + 1); } catch { continue; }
      if (close.id === open.id && close.fence === open.fence) { end = next; break; }
    }
    if (end === -1) fail(`第 ${index + 1} 行缺少匹配的结束标记，导入已取消。`);
    entries.push(make(lines.slice(index + 1, end).join('\n'), open.remark));
    if (entries.length > MAX_ITEMS) fail('导入条目数量超出上限。');
    index = end;
  }
  if (!entries.length) fail('文件中没有可以导入的文字。');
  return entries;
}

/**
 * createStore([Storage]) -> immutable state, subscribe(fn), onError(fn), CRUD.
 * subscribe receives (state, {type,...}); onError receives StoreError.
 * Every mutation throws on validation or storage failure; the previous state
 * remains untouched. The caller can keep its form open and show error.message.
 * Inspect status after construction for blocked storage or recovered corruption.
 */
export function createStore(storage) {
  const listeners = new Set();
  const errorListeners = new Set();
  let current;
  let lastSaved = null;
  let unreadableRaw = null;
  let storageAvailable = storage;
  let status = { saved: false, error: null, recovered: false, recoveryKey: null };

  function report(error) {
    status = { ...status, error };
    for (const listener of errorListeners) { try { listener(error); } catch (callbackError) { console.error(callbackError); } }
    return error;
  }
  function notify(event) {
    for (const listener of listeners) { try { listener(current, event); } catch (callbackError) { console.error(callbackError); } }
  }
  function persist(next) {
    const serialized = envelope(next);
    try {
      if (storageAvailable === undefined) storageAvailable = globalThis.localStorage;
      if (!storageAvailable || typeof storageAvailable.setItem !== 'function') throw new Error('浏览器未提供本地存储。');
      // Preserve unreadable data before allowing any replacement. Never delete
      // it on recovery, so the user can export it for manual repair.
      if (unreadableRaw !== null) {
        const recoveryKey = status.recoveryKey || `${STORAGE_KEY}:recovery:${Date.now()}-${uid('raw')}`;
        storageAvailable.setItem(recoveryKey, unreadableRaw);
        status = { ...status, recoveryKey };
        unreadableRaw = null;
      }
      if (lastSaved !== null) storageAvailable.setItem(BACKUP_KEY, lastSaved);
      storageAvailable.setItem(STORAGE_KEY, serialized);
      lastSaved = serialized;
      status = { ...status, saved: true, error: null };
    } catch (cause) {
      throw report(new StoreError('浏览器保存失败，刚才的更改尚未保存。请检查存储空间或浏览器权限，再重试；也可以导出备份。', 'STORAGE_WRITE', cause));
    }
  }
  function transact(type, update) {
    const draft = clone(current);
    const result = update(draft);
    const next = validateState(draft);
    persist(next);
    current = freeze(next);
    notify({ type, result });
    return result;
  }
  function locate(list, id) {
    const item = list.find(entry => entry.id === id);
    if (!item) fail('这条内容已不存在，请刷新后重试。');
    return item;
  }
  function category(draft, name) {
    const value = text(name, '分类名称', 40);
    if (!draft.categories.includes(value)) draft.categories.push(value);
    return value;
  }

  try {
    if (storageAvailable === undefined) storageAvailable = globalThis.localStorage;
    if (!storageAvailable || typeof storageAvailable.getItem !== 'function') throw new Error('本地存储不可用。');
    const raw = storageAvailable.getItem(STORAGE_KEY);
    if (raw !== null) {
      try { current = parseJSON(raw); lastSaved = raw; status.saved = true; }
      catch (cause) {
        unreadableRaw = raw;
        const backup = storageAvailable.getItem(BACKUP_KEY);
        if (backup !== null) {
          try { current = parseJSON(backup); lastSaved = backup; status.recovered = true; }
          catch { /* Keep the damaged original and show an explicit recovery error. */ }
        }
        status.error = new StoreError(current ? '上次保存的数据异常，已载入上一份有效备份。原始数据将保留，请导出当前备份。' : '本地数据无法读取，当前展示示例内容。原始数据已保留，可导出后检查或导入有效备份。', 'STORAGE_RECOVERY', cause);
      }
    }
  } catch (cause) {
    status.error = new StoreError('无法访问浏览器存储。当前展示示例内容；保存操作会提示失败，请允许本地存储后重试。', 'STORAGE_READ', cause);
  }
  if (!current) current = validateState(seedState());
  current = freeze(current);
  // Do not overwrite corrupt or inaccessible storage just by opening the app.
  if (!status.error && !status.saved) {
    try { persist(current); } catch { /* Exposed through status; no data is lost. */ }
  }

  return {
    get state() { return current; },
    get status() { return { ...status }; },
    getState() { return current; },
    subscribe(listener) {
      if (typeof listener !== 'function') fail('订阅者必须是函数。');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onError(listener) {
      if (typeof listener !== 'function') fail('错误订阅者必须是函数。');
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
    addSnippet(input) {
      const item = snippet({ ...input, id: uid('snippet'), pinned: input.pinned ?? false, copyCount: 0, updatedAt: new Date().toISOString(), category: input.category || '工作' });
      return transact('snippet:add', draft => { category(draft, item.category); draft.snippets.unshift(item); return item.id; });
    },
    restoreSnippet(input) {
      const item = snippet(input);
      return transact('snippet:restore', draft => {
        while (draft.snippets.some(entry => entry.id === item.id)) item.id = uid('snippet');
        category(draft, item.category);
        draft.snippets.unshift(item);
        return item.id;
      });
    },
    updateSnippet(id, patch) {
      return transact('snippet:update', draft => {
        const index = draft.snippets.findIndex(item => item.id === id);
        const previous = locate(draft.snippets, id);
        const next = snippet({ ...previous, ...patch, id, updatedAt: new Date().toISOString() });
        category(draft, next.category); draft.snippets[index] = next; return id;
      });
    },
    deleteSnippet(id) {
      return transact('snippet:delete', draft => { locate(draft.snippets, id); draft.snippets = draft.snippets.filter(item => item.id !== id); return id; });
    },
    togglePin(id) { return transact('snippet:pin', draft => { const item = locate(draft.snippets, id); item.pinned = !item.pinned; return item.pinned; }); },
    recordCopy(id) { return transact('snippet:copy', draft => { const item = locate(draft.snippets, id); item.copyCount += 1; return item.copyCount; }); },
    addTask(input) {
      const item = task({ ...input, id: uid('task'), date: input.date || localDate(), category: input.category || '工作' });
      return transact('task:add', draft => { category(draft, item.category); draft.tasks.push(item); return item.id; });
    },
    restoreTask(input) {
      const item = task(input);
      return transact('task:restore', draft => {
        while (draft.tasks.some(entry => entry.id === item.id)) item.id = uid('task');
        category(draft, item.category);
        draft.tasks.push(item);
        return item.id;
      });
    },
    updateTask(id, patch) {
      return transact('task:update', draft => {
        const index = draft.tasks.findIndex(item => item.id === id);
        const next = task({ ...locate(draft.tasks, id), ...patch, id });
        category(draft, next.category); draft.tasks[index] = next; return id;
      });
    },
    deleteTask(id) { return transact('task:delete', draft => { locate(draft.tasks, id); draft.tasks = draft.tasks.filter(item => item.id !== id); return id; }); },
    toggleTask(id) { return transact('task:toggle', draft => { const item = locate(draft.tasks, id); item.done = !item.done; return item.done; }); },
    updateSettings(patch) { return transact('settings:update', draft => { draft.settings = settings({ ...draft.settings, ...patch }); }); },
    addCategory(name) { return transact('category:add', draft => category(draft, name)); },
    renameCategory(previous, next) {
      return transact('category:rename', draft => {
        if (!draft.categories.includes(previous)) fail('分类不存在。');
        text(next, '分类名称', 40);
        draft.categories = [...new Set(draft.categories.map(item => item === previous ? next : item))];
        for (const item of [...draft.snippets, ...draft.tasks]) if (item.category === previous) item.category = next;
      });
    },
    deleteCategory(name, replacement) {
      return transact('category:delete', draft => {
        if (name === replacement || !draft.categories.includes(replacement)) fail('请选择另一个有效分类接收内容。');
        draft.categories = draft.categories.filter(item => item !== name);
        for (const item of [...draft.snippets, ...draft.tasks]) if (item.category === name) item.category = replacement;
      });
    },
    importMarkdown(raw, options) {
      const entries = parseMarkdown(raw, options);
      return transact('import:markdown', draft => { for (const item of entries) category(draft, item.category); draft.snippets.unshift(...entries); return entries.length; });
    },
    importJSON(raw, { mode = 'replace' } = {}) {
      const imported = parseJSON(raw);
      if (!['replace', 'merge'].includes(mode)) fail('请选择 replace 或 merge 导入方式。');
      return transact('import:json', draft => {
        if (mode === 'replace') Object.assign(draft, imported);
        else {
          // Import collisions as distinct records; the current data is retained.
          for (const key of ['snippets', 'tasks']) {
            const used = new Set(draft[key].map(item => item.id));
            for (const item of imported[key]) { if (used.has(item.id)) item.id = uid(key === 'tasks' ? 'task' : 'snippet'); used.add(item.id); draft[key].push(item); }
          }
          draft.categories = [...new Set([...draft.categories, ...imported.categories])];
        }
        return { snippets: imported.snippets.length, tasks: imported.tasks.length };
      });
    },
    exportJSON() { return envelope(current); },
    exportRecoveryData() {
      if (unreadableRaw !== null) return unreadableRaw;
      if (!status.recoveryKey) return null;
      try { return storageAvailable.getItem(status.recoveryKey); }
      catch (cause) { throw report(new StoreError('无法读取原始恢复数据。', 'STORAGE_READ', cause)); }
    },
    retryPersist() { persist(current); notify({ type: 'storage:retry' }); return true; }
  };
}
