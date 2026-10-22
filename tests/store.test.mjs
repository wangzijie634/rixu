import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, parseMarkdown, STORAGE_KEY, BACKUP_KEY, localDate } from '../dist/lib/store.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    writes: [],
    failKey: null,
    failAll: false,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (this.failAll || this.failKey === key) throw new Error('QuotaExceededError');
      this.writes.push(key);
      values.set(key, value);
    }
  };
}

function makeSnippet(store, overrides = {}) {
  return store.addSnippet({ title: '跟进邮件', content: '你好，\n\n方便时请告知进展。\n谢谢！', category: '工作', notes: '只用于搜索的内部备注', ...overrides });
}

test('首次使用采用当地日期，返回不可变的示例和成功保存状态', () => {
  const store = createStore(memoryStorage());
  assert.equal(store.status.saved, true);
  assert.equal(store.status.error, null);
  assert.equal(store.state.tasks.length, 4);
  assert.equal(store.state.tasks.filter(item => item.done).length, 2);
  assert.ok(store.state.tasks.every(item => item.date === localDate()));
  assert.equal(store.state.snippets[0].pinned, true);
  assert.ok(store.state.snippets.every(item => item.copyCount === 0));
  assert.ok(Object.isFrozen(store.state));
  assert.ok(Object.isFrozen(store.state.snippets[0]));
});

test('撤销删除片段保留原标识、复制统计、时间和全部内容，冲突时仅更换标识', () => {
  const store = createStore(memoryStorage());
  const id = makeSnippet(store, { pinned: true });
  store.recordCopy(id);
  store.recordCopy(id);
  const original = store.state.snippets.find(item => item.id === id);
  store.deleteSnippet(id);

  assert.equal(store.restoreSnippet(original), id);
  assert.deepEqual(store.state.snippets.find(item => item.id === id), original);
  const collisionId = store.restoreSnippet(original);
  assert.notEqual(collisionId, id);
  assert.deepEqual(store.state.snippets.find(item => item.id === collisionId), { ...original, id: collisionId });
  assert.deepEqual(store.state.snippets.find(item => item.id === id), original);

  // Restoring records must not alter the separate "new snippet" semantics.
  const newId = store.addSnippet(original);
  assert.notEqual(newId, id);
  assert.equal(store.state.snippets.find(item => item.id === newId).copyCount, 0);
});

test('撤销删除任务保留原标识、完成状态和安排，冲突时仅更换标识', () => {
  const store = createStore(memoryStorage());
  const original = store.state.tasks[0];
  assert.equal(original.done, true);
  store.deleteTask(original.id);

  assert.equal(store.restoreTask(original), original.id);
  assert.deepEqual(store.state.tasks.find(item => item.id === original.id), original);
  const collisionId = store.restoreTask(original);
  assert.notEqual(collisionId, original.id);
  assert.deepEqual(store.state.tasks.find(item => item.id === collisionId), { ...original, id: collisionId });
  assert.deepEqual(store.state.tasks.find(item => item.id === original.id), original);
});

test('撤销删除的持久化失败保持当前状态，之后可以再次恢复原记录', () => {
  const disk = memoryStorage();
  const store = createStore(disk);
  const original = store.state.snippets[0];
  store.deleteSnippet(original.id);
  const afterDeletion = store.state;

  disk.failKey = STORAGE_KEY;
  assert.throws(() => store.restoreSnippet(original), /保存失败/);
  assert.strictEqual(store.state, afterDeletion);
  disk.failKey = null;
  store.restoreSnippet(original);
  assert.deepEqual(store.state.snippets.find(item => item.id === original.id), original);
});

test('主存储写入失败不发布更改，通知调用者，并且可以重试', () => {
  const disk = memoryStorage();
  const store = createStore(disk);
  const oldState = store.state;
  const oldDisk = disk.getItem(STORAGE_KEY);
  const events = [];
  const errors = [];
  store.subscribe((state, event) => events.push({ state, event }));
  store.onError(error => errors.push(error));

  // The backup write succeeds, then the authoritative primary write fails.
  disk.failKey = STORAGE_KEY;
  assert.throws(() => makeSnippet(store), error => error.code === 'STORAGE_WRITE');
  assert.strictEqual(store.state, oldState);
  assert.equal(disk.getItem(STORAGE_KEY), oldDisk);
  assert.equal(events.length, 0);
  assert.equal(errors.length, 1);
  assert.strictEqual(store.status.error, errors[0]);

  disk.failKey = null;
  assert.equal(store.retryPersist(), true);
  const id = makeSnippet(store);
  assert.ok(store.state.snippets.some(item => item.id === id));
  assert.equal(store.status.error, null);
  assert.equal(events.at(-1).event.type, 'snippet:add');
  assert.equal(createStore(disk).state.snippets[0].id, id);
});

test('完全禁止本地存储时显式报告错误，保存失败保持原状态', () => {
  const store = createStore({
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('SecurityError'); }
  });
  const oldState = store.state;
  assert.equal(store.status.error.code, 'STORAGE_READ');
  assert.equal(store.status.saved, false);
  assert.throws(() => store.updateSettings({ displayName: '测试用户' }), /保存失败/);
  assert.strictEqual(store.state, oldState);
});

test('损坏主数据从有效备份恢复，首次打开不覆盖原文，保存前归档原文', () => {
  const validStore = createStore(memoryStorage());
  const backup = validStore.exportJSON();
  const damaged = '{"state":文件未写完整';
  const disk = memoryStorage({ [STORAGE_KEY]: damaged, [BACKUP_KEY]: backup });
  const recovered = createStore(disk);

  assert.equal(recovered.status.recovered, true);
  assert.equal(recovered.status.error.code, 'STORAGE_RECOVERY');
  assert.equal(recovered.status.saved, false);
  assert.deepEqual(recovered.state, validStore.state);
  assert.equal(recovered.exportRecoveryData(), damaged);
  assert.equal(disk.getItem(STORAGE_KEY), damaged);
  assert.equal(disk.writes.length, 0);

  const id = makeSnippet(recovered);
  assert.ok(recovered.status.recoveryKey);
  assert.equal(disk.getItem(recovered.status.recoveryKey), damaged);
  assert.equal(recovered.exportRecoveryData(), damaged);
  assert.ok(createStore(disk).state.snippets.some(item => item.id === id));
});

test('主数据与备份均损坏时保留原文，归档失败也不覆盖或提交更改', () => {
  const damaged = 'BROKEN ORIGINAL';
  const disk = memoryStorage({ [STORAGE_KEY]: damaged, [BACKUP_KEY]: 'BROKEN BACKUP' });
  const store = createStore(disk);
  const previous = store.state;
  assert.equal(store.status.recovered, false);
  assert.equal(store.status.error.code, 'STORAGE_RECOVERY');
  assert.equal(disk.writes.length, 0);

  disk.failAll = true;
  assert.throws(() => makeSnippet(store), /保存失败/);
  assert.strictEqual(store.state, previous);
  assert.equal(disk.getItem(STORAGE_KEY), damaged);
  assert.equal(store.exportRecoveryData(), damaged);

  disk.failAll = false;
  store.retryPersist();
  assert.equal(store.status.saved, true);
  assert.equal(store.exportRecoveryData(), damaged);
});

test('JSON 合并保留现有记录，为碰撞标识生成独立 ID', () => {
  const store = createStore(memoryStorage());
  const id = makeSnippet(store, { pinned: true });
  store.recordCopy(id);
  const previous = store.state;
  const result = store.importJSON(store.exportJSON(), { mode: 'merge' });

  assert.deepEqual(result, { snippets: previous.snippets.length, tasks: previous.tasks.length });
  assert.equal(store.state.snippets.length, previous.snippets.length * 2);
  assert.equal(store.state.tasks.length, previous.tasks.length * 2);
  for (const key of ['snippets', 'tasks']) {
    assert.equal(new Set(store.state[key].map(item => item.id)).size, store.state[key].length);
    for (const item of previous[key]) assert.deepEqual(store.state[key].find(entry => entry.id === item.id), item);
  }
  const copied = store.state.snippets.filter(item => item.title === '跟进邮件');
  assert.equal(copied.length, 2);
  assert.ok(copied.every(item => item.copyCount === 1 && item.pinned && item.notes === '只用于搜索的内部备注'));
});

test('JSON 替换能完整还原；错误格式、重复 ID、无效时间均不改变原状态', () => {
  const store = createStore(memoryStorage());
  const exported = store.exportJSON();
  const expected = store.state;
  store.deleteSnippet(store.state.snippets[0].id);
  store.importJSON(exported);
  assert.deepEqual(store.state, expected);
  const oldState = store.state;

  const duplicate = JSON.parse(exported);
  duplicate.state.snippets.push(duplicate.state.snippets[0]);
  const invalidTask = JSON.parse(exported);
  invalidTask.state.tasks[0].end = '08:00';
  const invalidDate = JSON.parse(exported);
  invalidDate.state.tasks[0].date = '2026-02-30';
  for (const raw of ['{"snippets":[]}', 'not JSON', JSON.stringify(duplicate), JSON.stringify(invalidTask), JSON.stringify(invalidDate)]) {
    assert.throws(() => store.importJSON(raw));
    assert.strictEqual(store.state, oldState);
  }
});

const markerLibrary = [
  '<!-- bubble-garden-notes:v1 -->',
  '<!-- 文本库说明 -->',
  '',
  '<!-- bubble id="first" color="4" fence="first-boundary" remark="邮件 &amp; 模板" -->',
  '你好，',
  '',
  '这是第一段。',
  '',
  '',
  '谢谢！',
  '<!-- /bubble id="first" fence="first-boundary" -->',
  '',
  '<!-- bubble id="second" remark="地址&#10;备注" -->',
  'hello@example.com',
  '<!-- /bubble id="second" -->',
  ''
].join('\n');

test('bubble Markdown 备注只作标题，不进入复制正文；空行完整保留', () => {
  const parsed = parseMarkdown(markerLibrary, { category: '生活' });
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].title, '邮件 & 模板');
  assert.equal(parsed[0].content, '你好，\n\n这是第一段。\n\n\n谢谢！');
  assert.equal(parsed[0].category, '生活');
  assert.ok(!parsed[0].content.includes('邮件 & 模板'));
  assert.equal(parsed[1].title, '地址\n备注');
  assert.equal(parsed[1].content, 'hello@example.com');

  const store = createStore(memoryStorage());
  const originalCount = store.state.snippets.length;
  assert.equal(store.importMarkdown(markerLibrary, { category: '生活' }), 2);
  assert.equal(store.state.snippets.length, originalCount + 2);
  assert.equal(store.state.snippets[0].content, parsed[0].content);
});

test('普通 Markdown 保留整个正文和标题，BOM 与 CRLF 仅规范编码和换行', () => {
  const source = '\uFEFF# 工作笔记\r\n\r\n## 上午\r\n正文\r\n\r\n## 下午\r\n另一段\r\n';
  const parsed = parseMarkdown(source);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, '工作笔记');
  assert.equal(parsed[0].content, '# 工作笔记\n\n## 上午\n正文\n\n## 下午\n另一段\n');
});

test('Markdown 不完整、重复标识和标记外正文导致整次导入取消', () => {
  const store = createStore(memoryStorage());
  const oldState = store.state;
  const invalidFiles = [
    '   ',
    markerLibrary.replace('<!-- /bubble id="first" fence="first-boundary" -->', ''),
    `${markerLibrary}\n不在标记内的孤立文字`,
    markerLibrary.replaceAll('id="second"', 'id="first"')
  ];
  for (const raw of invalidFiles) {
    assert.throws(() => store.importMarkdown(raw));
    assert.strictEqual(store.state, oldState);
  }
});
