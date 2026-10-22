/** Local calendar utilities. Dates are YYYY-MM-DD; clock times are HH:mm. */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = value => String(value).padStart(2, '0');

/** Parse a local calendar date. Invalid inputs return null. */
export function parseDate(value) {
  const match = typeof value === 'string' && DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(2000, 0, 1, 12);
  date.setFullYear(year, month - 1, day);
  if (year < 1 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** Never derive a local calendar day with toISOString(). */
export function localDate(value = new Date()) {
  if (typeof value === 'string') {
    if (!parseDate(value)) throw new RangeError('日期格式应为 YYYY-MM-DD');
    return value;
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new RangeError('无效日期');
  return `${String(value.getFullYear()).padStart(4, '0')}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function addDays(value, amount) {
  const date = parseDate(value);
  if (!date || !Number.isInteger(amount)) throw new RangeError('日期或天数无效');
  date.setDate(date.getDate() + amount);
  return localDate(date);
}

export function weekDates(value = localDate()) {
  const date = parseDate(value);
  if (!date) throw new RangeError('无效日期');
  const monday = addDays(value, -((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function addMonths(value, amount) {
  const date = parseDate(value);
  if (!date || !Number.isInteger(amount)) throw new RangeError('日期或月份数无效');
  const target = new Date(date.getTime());
  target.setDate(1);
  target.setMonth(target.getMonth() + amount);
  const last = new Date(target.getTime());
  last.setMonth(last.getMonth() + 1, 0);
  target.setDate(Math.min(date.getDate(), last.getDate()));
  return localDate(target);
}

/** A fixed six-week, Monday-first calendar grid. */
export function monthCells(value = localDate(), today = localDate()) {
  const date = parseDate(value);
  if (!date) throw new RangeError('无效日期');
  const first = `${value.slice(0, 7)}-01`;
  const start = weekDates(first)[0];
  return Array.from({ length: 42 }, (_, index) => {
    const day = addDays(start, index);
    return { date: day, day: Number(day.slice(-2)), isCurrentMonth: day.slice(0, 7) === value.slice(0, 7), isToday: day === today };
  });
}

/** 24:00 is allowed as an interval end. Invalid times return NaN. */
export function toMinutes(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value)) return NaN;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatTime(value) {
  if (!Number.isInteger(value) || value < 0 || value > 1440) return '';
  return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
}

const startOf = task => task.start ?? task.startTime;
const endOf = task => task.end ?? task.endTime;

export function validateTask(task) {
  const errors = {};
  if (!task || typeof task !== 'object') return { valid: false, errors: { task: '请填写任务信息' } };
  if (typeof task.title !== 'string' || !task.title.trim()) errors.title = '请填写任务名称';
  else if (task.title.length > 200) errors.title = '任务名称不能超过 200 个字符';
  if (!parseDate(task.date)) errors.date = '请选择有效日期';
  const start = toMinutes(startOf(task));
  const end = toMinutes(endOf(task));
  if (!Number.isFinite(start) || start >= 1440) errors.start = '请选择有效的开始时间';
  if (!Number.isFinite(end)) errors.end = '请选择有效的结束时间';
  else if (Number.isFinite(start) && end <= start) errors.end = '结束时间需要晚于开始时间';
  const description = task.description ?? task.notes ?? '';
  if (typeof description !== 'string' || description.length > 10000) errors.description = '备注不能超过 10000 个字符';
  return { valid: Object.keys(errors).length === 0, errors };
}

/** Adjacent appointments do not conflict. Conflicts are advisory only. */
export function findConflicts(tasks, candidate, excludeId = candidate?.id) {
  const start = toMinutes(startOf(candidate ?? {}));
  const end = toMinutes(endOf(candidate ?? {}));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  return tasks.filter(task => task.date === candidate.date && (excludeId == null || task.id !== excludeId)
    && toMinutes(startOf(task)) < end && toMinutes(endOf(task)) > start)
    .sort((a, b) => toMinutes(startOf(a)) - toMinutes(startOf(b)));
}

/**
 * Layout one day's tasks without mutating them. top/height are minutes from
 * startHour; left/width and topPercent/heightPercent are percentages.
 * Each connected overlap group shares the number of simultaneously used columns.
 * minDisplayMinutes reserves column space for visually enlarged short tasks;
 * the returned top/height always retain the actual scheduled times.
 */
export function layoutTasks(tasks, { startHour = 0, endHour = 24, minDisplayMinutes = 0 } = {}) {
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour) || startHour < 0 || endHour > 24 || endHour <= startHour) {
    throw new RangeError('日程显示时间范围无效');
  }
  if (!Number.isFinite(minDisplayMinutes) || minDisplayMinutes < 0 || minDisplayMinutes > 1440) {
    throw new RangeError('日程最小显示时长无效');
  }
  const occupiedEnd = task => task.startMinutes + Math.max(task.endMinutes - task.startMinutes, minDisplayMinutes);
  const from = startHour * 60;
  const until = endHour * 60;
  const valid = tasks.map(task => ({ ...task, startMinutes: toMinutes(startOf(task)), endMinutes: toMinutes(endOf(task)) }))
    .filter(task => Number.isFinite(task.startMinutes) && Number.isFinite(task.endMinutes)
      && task.endMinutes > task.startMinutes && task.endMinutes > from && task.startMinutes < until)
    .sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes || String(a.id ?? '').localeCompare(String(b.id ?? '')));
  const groups = [];
  let group = [];
  let groupEnd = -1;
  for (const task of valid) {
    if (group.length && task.startMinutes >= groupEnd) { groups.push(group); group = []; groupEnd = -1; }
    group.push(task);
    groupEnd = Math.max(groupEnd, occupiedEnd(task));
  }
  if (group.length) groups.push(group);
  return groups.flatMap(items => {
    const columnEnds = [];
    for (const task of items) {
      let column = columnEnds.findIndex(end => end <= task.startMinutes);
      if (column < 0) column = columnEnds.length;
      columnEnds[column] = occupiedEnd(task);
      task.column = column;
    }
    return items.map(task => {
      const top = Math.max(task.startMinutes, from) - from;
      const height = Math.min(task.endMinutes, until) - Math.max(task.startMinutes, from);
      return { ...task, top, height, columns: columnEnds.length, left: task.column / columnEnds.length * 100,
        width: 100 / columnEnds.length, topPercent: top / (until - from) * 100, heightPercent: height / (until - from) * 100 };
    });
  });
}

/** Map a vertical offset inside the full-day timeline to minutes after midnight. */
export function minuteAtOffset(offset, height) {
  if (!Number.isFinite(offset) || !Number.isFinite(height) || height <= 0) return NaN;
  return Math.min(1440, Math.max(0, offset / height * 1440));
}

/**
 * Turn a pointer drag into a snapped time range. A drag shorter than
 * clickThreshold minutes becomes a click block using clickDuration.
 */
export function timeRangeFromDrag(startMinute, endMinute, { step = 15, minimum = 15, clickThreshold = 5, clickDuration = 60 } = {}) {
  if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute)) throw new RangeError('拖动时间无效');
  if (!Number.isInteger(step) || step <= 0 || step > 1440) throw new RangeError('对齐间隔无效');
  if (!Number.isInteger(minimum) || minimum < 0 || minimum > 1440) throw new RangeError('最短时长无效');
  if (!Number.isInteger(clickThreshold) || clickThreshold < 0) throw new RangeError('点击阈值无效');
  if (!Number.isInteger(clickDuration) || clickDuration <= 0 || clickDuration > 1440) throw new RangeError('默认时长无效');
  const clamp = value => Math.min(1440, Math.max(0, value));
  const low = clamp(Math.min(startMinute, endMinute));
  const high = clamp(Math.max(startMinute, endMinute));
  // Pointer coordinates can land a hair below or above an exact step boundary.
  const epsilon = 0.001;
  if (high - low < clickThreshold) {
    const start = Math.max(0, Math.min(1440 - clickDuration, Math.floor((low + epsilon) / step) * step));
    return { startMinutes: start, endMinutes: start + clickDuration };
  }
  let start = Math.floor((low + epsilon) / step) * step;
  let end = Math.ceil((high - epsilon) / step) * step;
  if (end - start < minimum) end = Math.min(1440, start + minimum);
  if (end - start < minimum) start = Math.max(0, end - minimum);
  return { startMinutes: start, endMinutes: end };
}

const escapeICS = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');

/** RFC 5545 content lines fold after at most 75 UTF-8 octets. */
function foldLine(line) {
  const encoder = new TextEncoder();
  const lines = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const length = encoder.encode(char).length;
    if (octets + length > 75) { lines.push(current); current = ' '; octets = 1; }
    current += char;
    octets += length;
  }
  lines.push(current);
  return lines.join('\r\n');
}

function stableUID(task) {
  const value = String(task.id ?? `${task.date}|${startOf(task)}|${endOf(task)}|${task.title}`);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `${(hash >>> 0).toString(16)}@focus-workbench.local`;
}

function calendarTime(date, time) {
  if (time === '24:00') return `${addDays(date, 1).replaceAll('-', '')}T000000`;
  return `${date.replaceAll('-', '')}T${time.replace(':', '')}00`;
}

/** Floating local times preserve the schedule's displayed clock times on import. */
export function createICalendar(tasks, { name = '我的日程', now = new Date() } = {}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new RangeError('导出时间无效');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Focus Workbench//Daily Planner//ZH-CN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escapeICS(name)}`];
  for (const task of tasks) {
    const validation = validateTask(task);
    if (!validation.valid) throw new RangeError(Object.values(validation.errors).join('；'));
    lines.push('BEGIN:VEVENT', `UID:${stableUID(task)}`, `DTSTAMP:${stamp}`,
      `DTSTART:${calendarTime(task.date, startOf(task))}`, `DTEND:${calendarTime(task.date, endOf(task))}`,
      `SUMMARY:${escapeICS(task.title.trim())}`);
    if (task.description || task.notes) lines.push(`DESCRIPTION:${escapeICS(task.description ?? task.notes)}`);
    if (task.category) lines.push(`CATEGORIES:${escapeICS(task.category)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
