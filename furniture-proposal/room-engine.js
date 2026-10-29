(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoomEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EPSILON = 1e-7;
  const TYPES = Object.freeze(['desk', 'chair', 'bed', 'drawer', 'table']);
  const ROTATIONS = Object.freeze([0, 90, 180, 270]);
  const FIELDS = ['id', 'name', 'type', 'x', 'y', 'width', 'depth', 'rotation', 'clearance', 'active'];
  const templates = Object.freeze({
    desk: { name: '書桌', width: 120, depth: 60, clearance: 0 },
    chair: { name: '椅子', width: 50, depth: 50, clearance: 70 },
    bed: { name: '床', width: 120, depth: 180, clearance: 0 },
    drawer: { name: '抽屜櫃', width: 80, depth: 40, clearance: 60 },
    table: { name: '餐桌', width: 100, depth: 70, clearance: 0 },
  });

  function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function exactKeys(value, keys, label) {
    if (!plain(value)) throw new Error(`${label}格式不正確。`);
    if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
      throw new Error(`${label}欄位不完整，或含有不支援的欄位。`);
    }
  }

  function finite(value, min, max, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${label}必須是 ${min}～${max} 之間的數字。`);
    }
    return value;
  }

  function validateProject(raw) {
    exactKeys(raw, ['version', 'room', 'items'], '配置');
    if (raw.version !== 1) throw new Error('不支援這份配置檔的版本。');
    exactKeys(raw.room, ['width', 'depth'], '房間');
    const room = {
      width: finite(raw.room.width, 40, 2000, '房間寬度'),
      depth: finite(raw.room.depth, 40, 2000, '房間深度'),
    };
    if (!Array.isArray(raw.items) || raw.items.length > 50) throw new Error('家具清單格式不正確，最多可放置 50 件家具。');
    const ids = new Set();
    const items = raw.items.map((item, index) => {
      const label = `第 ${index + 1} 件家具`;
      exactKeys(item, FIELDS, label);
      if (typeof item.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(item.id)) throw new Error(`${label}的識別碼格式不正確。`);
      if (ids.has(item.id)) throw new Error('配置包含重複的家具識別碼。');
      ids.add(item.id);
      if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60) throw new Error(`${label}名稱必須是 1～60 個字。`);
      if (typeof item.type !== 'string' || !TYPES.includes(item.type)) throw new Error(`${label}類型不支援。`);
      if (!ROTATIONS.includes(item.rotation)) throw new Error(`${label}方向必須是 0、90、180 或 270 度。`);
      if (typeof item.active !== 'boolean') throw new Error(`${label}的使用狀態格式不正確。`);
      return {
        id: item.id,
        name: item.name,
        type: item.type,
        x: finite(item.x, -2000, 4000, `${label}水平位置`),
        y: finite(item.y, -2000, 4000, `${label}垂直位置`),
        width: finite(item.width, 5, 1000, `${label}寬度`),
        depth: finite(item.depth, 5, 1000, `${label}深度`),
        rotation: item.rotation,
        clearance: finite(item.clearance, 0, 200, `${label}操作空間`),
        active: item.active,
      };
    });
    return { version: 1, room, items };
  }

  function bodyRect(item) {
    const sideways = item.rotation === 90 || item.rotation === 270;
    return { x: item.x, y: item.y, width: sideways ? item.depth : item.width, height: sideways ? item.width : item.depth };
  }

  function useRect(item) {
    if (!item.active || item.clearance <= 0) return null;
    const body = bodyRect(item), c = item.clearance;
    switch (item.rotation) {
      case 90: return { x: body.x - c, y: body.y, width: c, height: body.height };
      case 180: return { x: body.x, y: body.y - c, width: body.width, height: c };
      case 270: return { x: body.x + body.width, y: body.y, width: c, height: body.height };
      default: return { x: body.x, y: body.y + body.height, width: body.width, height: c };
    }
  }

  function overlap(a, b) {
    if (!a || !b) return null;
    const left = Math.max(a.x, b.x), top = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    if (right - left <= EPSILON || bottom - top <= EPSILON) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function outside(rect, room) {
    return rect.x < -EPSILON || rect.y < -EPSILON || rect.x + rect.width > room.width + EPSILON || rect.y + rect.height > room.depth + EPSILON;
  }

  function number(value) { return Number(value.toFixed(2)).toString(); }

  function analyze(project) {
    const result = [];
    const entries = project.items.map(item => ({ item, body: bodyRect(item), use: useRect(item) }));
    for (const entry of entries) {
      const { item, body, use } = entry;
      if (outside(body, project.room)) {
        result.push({ id: `boundary:body:${item.id}`, kind: 'boundary', level: 'error', items: [item.id], message: `「${item.name}」的家具本體超出房間邊界。`, rect: { ...body } });
      }
      if (use && outside(use, project.room)) {
        result.push({ id: `boundary:use:${item.id}`, kind: 'boundary', level: 'error', items: [item.id], message: `「${item.name}」的使用範圍超出房間邊界。`, rect: { ...use } });
      }
    }
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i], b = entries[j];
        const bodyHit = overlap(a.body, b.body);
        if (bodyHit) result.push({ id: `body:${a.item.id}:${b.item.id}`, kind: 'body', level: 'error', items: [a.item.id, b.item.id], message: `「${a.item.name}」與「${b.item.name}」的家具本體重疊。`, rect: bodyHit });
        for (const [source, target] of [[a, b], [b, a]]) {
          const hit = overlap(source.use, target.body);
          if (!hit) continue;
          const depth = source.item.rotation === 0 || source.item.rotation === 180 ? hit.height : hit.width;
          result.push({ id: `use:${source.item.id}:${target.item.id}`, kind: 'use', level: 'error', items: [source.item.id, target.item.id], message: `「${source.item.name}」的使用範圍與「${target.item.name}」重疊 ${number(depth)} 公分。`, rect: hit });
        }
        const shared = overlap(a.use, b.use);
        if (shared) result.push({ id: `shared:${a.item.id}:${b.item.id}`, kind: 'shared', level: 'warning', items: [a.item.id, b.item.id], message: `「${a.item.name}」與「${b.item.name}」的使用範圍重疊，同時使用可能衝突。`, rect: shared });
      }
    }
    return result;
  }

  function newId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function makeItem(type, index = 0) {
    if (typeof type !== 'string' || !TYPES.includes(type)) throw new Error('不支援這種家具類型。');
    const base = templates[type];
    const offset = Number.isInteger(index) && index >= 0 ? index % 10 * 12 : 0;
    return { id: newId(), name: base.name, type, x: 24 + offset, y: 24 + offset, width: base.width, depth: base.depth, rotation: 0, clearance: base.clearance, active: true };
  }

  function sampleProject(mode = 'before') {
    if (!['before', 'after', 'empty'].includes(mode)) throw new Error('不支援這種範例配置。');
    const project = { version: 1, room: { width: 360, depth: 300 }, items: [] };
    if (mode === 'empty') return project;
    project.items = [
      { id: 'sample-desk', name: '書桌', type: 'desk', x: 40, y: 30, width: 120, depth: 60, rotation: 0, clearance: 0, active: true },
      { id: 'sample-bed', name: '床', type: 'bed', x: 220, y: 120, width: 120, depth: 180, rotation: 0, clearance: 0, active: true },
      { id: 'sample-drawer', name: '抽屜櫃', type: 'drawer', x: mode === 'after' ? 20 : 240, y: mode === 'after' ? 200 : 40, width: 80, depth: 40, rotation: 0, clearance: 60, active: true },
    ];
    return project;
  }

  function parseBackup(text) {
    if (typeof text !== 'string') throw new Error('請選擇文字格式的 JSON 配置檔。');
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('無法解析 JSON，請選擇本工具匯出的配置檔。'); }
    return validateProject(data);
  }

  return Object.freeze({ TYPES, ROTATIONS, bodyRect, useRect, overlap, validateProject, analyze, makeItem, sampleProject, parseBackup });
});
