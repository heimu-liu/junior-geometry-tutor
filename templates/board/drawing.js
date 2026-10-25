/* GeometryDrawing: dependency-free, SVG user drawing layer.
 * Saved items are plain JSON: { id, type, style, points? / cx,cy,r? / x,y,text,fontSize? }.
 * Only the supplied userGroup is rendered or cleared; the problem diagram is untouched.
 */
(function (global) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const TOOLS = new Set(['pen', 'line', 'straight', 'triangle', 'rightTriangle', 'circle', 'eraser', 'select', 'text', 'pan']);
  const DRAWABLE = new Set(['pen', 'line', 'straight', 'triangle', 'rightTriangle', 'circle', 'text']);
  const DEFAULT_STYLE = { color: '#285749', width: 3, dashed: false };
  const clone = value => JSON.parse(JSON.stringify(value));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const bounded = value => finite(value) && Math.abs(value) <= 1e7;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let idCounter = 0;

  function uid() {
    return global.crypto && typeof global.crypto.randomUUID === 'function'
      ? global.crypto.randomUUID()
      : 'drawing-' + Date.now().toString(36) + '-' + (++idCounter).toString(36);
  }

  function element(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }

  function safeStyle(style, fallback) {
    const input = style || {};
    const base = fallback || DEFAULT_STYLE;
    const color = typeof input.color === 'string' && /^(#[\da-f]{3,8}|[a-z]{1,30}|(?:rgb|hsl)a?\([\d\s.,%+\-/]+\))$/i.test(input.color)
      ? input.color : base.color;
    return {
      color,
      width: finite(input.width) ? Math.min(40, Math.max(0.5, input.width)) : base.width,
      dashed: typeof input.dashed === 'boolean' ? input.dashed : base.dashed
    };
  }

  function segmentDistance(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return distance(p, a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
    return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
  }

  function inPolygon(p, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  class GeometryDrawing {
    constructor(svgElement, userGroupElement, options) {
      if (!svgElement || svgElement.namespaceURI !== SVG_NS || !userGroupElement || !svgElement.contains(userGroupElement)) {
        throw new TypeError('GeometryDrawing requires an SVG and its dedicated user drawing group.');
      }
      this.svg = svgElement;
      this.group = userGroupElement;
      this.options = options || {};
      this.items = [];
      this.tool = 'pen';
      this.style = { ...DEFAULT_STYLE };
      this.selectedId = null;
      this.undoStack = [];
      this.redoStack = [];
      this.gesture = null;
      this.draft = null;
      this.destroyed = false;
      this.nodes = new Map();
      const initial = this.svg.viewBox && this.svg.viewBox.baseVal;
      this.initialView = initial && initial.width > 0 && initial.height > 0
        ? { x: initial.x, y: initial.y, width: initial.width, height: initial.height }
        : { x: 0, y: 0, width: 1000, height: 700 };
      this.world = { ...this.initialView };
      this.previousTouchAction = this.svg.style.touchAction;
      this.previousUserSelect = this.svg.style.userSelect;
      this.previousCursor = this.svg.style.cursor;
      this.svg.style.touchAction = 'none';
      this.svg.style.userSelect = 'none';
      this.setView(this.initialView);
      this.handlers = {
        down: event => this._down(event),
        move: event => this._move(event),
        up: event => this._up(event),
        cancel: event => this._cancel(event),
        lost: event => this._cancel(event)
      };
      this.svg.addEventListener('pointerdown', this.handlers.down);
      global.addEventListener('pointermove', this.handlers.move, { passive: false });
      global.addEventListener('pointerup', this.handlers.up);
      global.addEventListener('pointercancel', this.handlers.cancel);
      this.svg.addEventListener('lostpointercapture', this.handlers.lost);
      this._cursor();
      this._render();
    }

    setTool(name) {
      if (!TOOLS.has(name)) return false;
      this._cancel();
      this.tool = name;
      if (name !== 'select') this.selectedId = null;
      this._cursor();
      this._render();
      if (typeof this.options.onToolChange === 'function') this.options.onToolChange(name);
      return true;
    }

    setStyle(style) {
      this.style = safeStyle(style, this.style);
    }

    getState() {
      return { canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0, count: this.items.length, tool: this.tool };
    }

    getItems() {
      return clone(this.items);
    }

    setItems(items) {
      this._cancel();
      const ids = new Set();
      this.items = (Array.isArray(items) ? items : []).slice(0, 10000).map(item => {
        const clean = this._cleanItem(item);
        if (!clean) return null;
        if (ids.has(clean.id)) clean.id = uid();
        ids.add(clean.id);
        return clean;
      }).filter(Boolean);
      this.undoStack = [];
      this.redoStack = [];
      this.selectedId = null;
      this._render();
      this._emit();
    }

    undo() {
      this._cancel();
      if (!this.undoStack.length) return false;
      this.redoStack.push(clone(this.items));
      this.items = this.undoStack.pop();
      this.selectedId = null;
      this._render();
      this._emit();
      return true;
    }

    redo() {
      this._cancel();
      if (!this.redoStack.length) return false;
      this.undoStack.push(clone(this.items));
      this.items = this.redoStack.pop();
      this.selectedId = null;
      this._render();
      this._emit();
      return true;
    }

    clear() {
      this._cancel();
      if (!this.items.length) return false;
      const before = clone(this.items);
      this.items = [];
      this.selectedId = null;
      this._commit(before);
      return true;
    }

    deleteSelected() {
      this._cancel();
      if (!this.selectedId || !this.items.some(item => item.id === this.selectedId)) return false;
      const before = clone(this.items);
      this.items = this.items.filter(item => item.id !== this.selectedId);
      this.selectedId = null;
      this._commit(before);
      return true;
    }

    setView(view) {
      if (!view || !bounded(view.x) || !bounded(view.y) || !finite(view.width) || !finite(view.height) || view.width <= 0 || view.height <= 0) return false;
      this.svg.setAttribute('viewBox', [view.x, view.y, view.width, view.height].join(' '));
      const clip=this.svg.querySelector('[data-view-clip]');
      if(clip)for(const key of ['x','y','width','height'])clip.setAttribute(key,view[key]);
      return true;
    }

    resetView() {
      this._cancel();
      this.setView(this.initialView);
      this._emit();
    }

    destroy() {
      this._cancel();
      this.destroyed = true;
      this.svg.removeEventListener('pointerdown', this.handlers.down);
      global.removeEventListener('pointermove', this.handlers.move);
      global.removeEventListener('pointerup', this.handlers.up);
      global.removeEventListener('pointercancel', this.handlers.cancel);
      this.svg.removeEventListener('lostpointercapture', this.handlers.lost);
      this.svg.style.touchAction = this.previousTouchAction;
      this.svg.style.userSelect = this.previousUserSelect;
      this.svg.style.cursor = this.previousCursor;
    }

    _cleanItem(input) {
      if (!input || !DRAWABLE.has(input.type)) return null;
      const item = {
        id: typeof input.id === 'string' && input.id.length > 0 && input.id.length <= 150 ? input.id : uid(),
        type: input.type,
        style: safeStyle(input.style)
      };
      if (item.type === 'circle') {
        if (![input.cx, input.cy, input.r].every(bounded) || input.r <= 0) return null;
        Object.assign(item, { cx: input.cx, cy: input.cy, r: input.r });
      } else if (item.type === 'text') {
        if (!bounded(input.x) || !bounded(input.y) || typeof input.text !== 'string' || !input.text.trim()) return null;
        Object.assign(item, {
          x: input.x, y: input.y, text: input.text.slice(0, 2000),
          fontSize: finite(input.fontSize) ? Math.min(200, Math.max(10, input.fontSize)) : 24
        });
      } else {
        if (!Array.isArray(input.points)) return null;
        const points = input.points.slice(0, 20000);
        if (!points.every(p => p && bounded(p.x) && bounded(p.y))) return null;
        const min = item.type === 'pen' ? 1 : item.type === 'triangle' || item.type === 'rightTriangle' ? 3 : 2;
        if (points.length < min) return null;
        item.points = points.slice(0, item.type === 'pen' ? points.length : min).map(p => ({ x: p.x, y: p.y }));
      }
      return item;
    }

    _matrix() {
      try {
        const matrix = this.svg.getScreenCTM();
        return matrix ? matrix.inverse() : null;
      } catch (_) { return null; }
    }

    _point(event, inverse) {
      const matrix = inverse || this._matrix();
      if (!matrix) return null;
      const point = this.svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const result = point.matrixTransform(matrix);
      return bounded(result.x) && bounded(result.y) ? { x: result.x, y: result.y } : null;
    }

    _tolerance(pixels) {
      const matrix = this._matrix();
      return matrix ? pixels * Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d)) : pixels;
    }

    _view() {
      const v = this.svg.viewBox.baseVal;
      return { x: v.x, y: v.y, width: v.width, height: v.height };
    }

    _down(event) {
      if (this.destroyed || this.gesture || (event.button !== 0 && event.button !== 1)) return;
      if (event.isPrimary === false) return;
      const point = this._point(event);
      if (!point) return;
      if (event.cancelable) event.preventDefault();
      const mode = event.button === 1 ? 'pan' : this.tool;
      this.gesture = {
        pointerId: event.pointerId, mode, start: point, last: point,
        before: clone(this.items), inverse: this._matrix(), view: this._view(), changed: false
      };
      try { this.svg.setPointerCapture(event.pointerId); } catch (_) { /* Window listeners also finish outside drags. */ }
      if (mode === 'pan') {
        this.svg.style.cursor = 'grabbing';
      } else if (mode === 'select') {
        const hit = this._hit(point, true);
        this.selectedId = hit ? hit.id : null;
        this.gesture.itemId = this.selectedId;
        this.gesture.original = hit ? clone(hit) : null;
        this._render();
      } else if (mode === 'eraser') {
        this.selectedId = null;
        this._eraseAt(point);
      } else if (mode !== 'text') {
        this.selectedId = null;
        this.draft = { id: uid(), type: mode, style: { ...this.style } };
        this._updateDraft(point);
        this._render();
      }
    }

    _move(event) {
      const gesture = this.gesture;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (event.cancelable) event.preventDefault();
      const point = this._point(event, gesture.mode === 'pan' ? gesture.inverse : null);
      if (!point) return;
      if (gesture.mode === 'pan') {
        const dx = point.x - gesture.start.x, dy = point.y - gesture.start.y;
        this.setView({ ...gesture.view, x: gesture.view.x - dx, y: gesture.view.y - dy });
        gesture.changed = Math.abs(dx) + Math.abs(dy) > 0;
      } else if (gesture.mode === 'select' && gesture.original) {
        const dx = point.x - gesture.start.x, dy = point.y - gesture.start.y;
        const moved = clone(gesture.original);
        if (moved.points) moved.points = moved.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        else if (moved.type === 'circle') { moved.cx += dx; moved.cy += dy; }
        else { moved.x += dx; moved.y += dy; }
        this.items = this.items.map(item => item.id === moved.id ? moved : item);
        gesture.changed = Math.abs(dx) + Math.abs(dy) > this._tolerance(0.5);
        this._render();
      } else if (gesture.mode === 'eraser') {
        const length = distance(gesture.last, point);
        if (length === 0) return;
        const steps = Math.min(300, Math.max(1, Math.ceil(length / Math.max(0.1, this._tolerance(4)))));
        for (let i = 1; i <= steps; i++) this._eraseAt({
          x: gesture.last.x + (point.x - gesture.last.x) * i / steps,
          y: gesture.last.y + (point.y - gesture.last.y) * i / steps
        }, false);
        this._render();
      } else if (this.draft) {
        if (gesture.mode === 'pen' && typeof event.getCoalescedEvents === 'function') {
          event.getCoalescedEvents().forEach(sample => {
            const position = this._point(sample);
            if (position) this._updateDraft(position);
          });
        }
        this._updateDraft(point);
        this._render();
      }
      gesture.last = point;
    }

    _up(event) {
      const gesture = this.gesture;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      this._move(event);
      this.gesture = null;
      try { if (this.svg.hasPointerCapture(event.pointerId)) this.svg.releasePointerCapture(event.pointerId); } catch (_) { /* Already released by the browser. */ }
      this._cursor();
      if (gesture.mode === 'text') {
        const position = { ...gesture.start };
        const style = { ...this.style };
        let answered = false;
        if (typeof this.options.onRequestText === 'function') this.options.onRequestText(position, value => {
          if (answered || this.destroyed) return;
          answered = true;
          if (typeof value !== 'string' || !value.trim()) return;
          const before = clone(this.items);
          this.items.push({ id: uid(), type: 'text', style, ...position, text: value.trim().slice(0, 2000), fontSize: Math.min(200, Math.max(22, style.width * 6)) });
          this._commit(before);
        });
      } else if (this.draft) {
        const item = this.draft;
        this.draft = null;
        if (this._drawable(item)) {
          this.items.push(item);
          this._commit(gesture.before);
        } else this._render();
      } else if ((gesture.mode === 'select' || gesture.mode === 'eraser') && gesture.changed) {
        this._commit(gesture.before);
      } else if (gesture.mode === 'pan' && gesture.changed) {
        this._emit();
      } else {
        if (gesture.mode === 'select') this.items = gesture.before;
        this._render();
      }
    }

    _cancel(event) {
      const gesture = this.gesture;
      if (!gesture || (event && gesture.pointerId !== event.pointerId)) return;
      this.gesture = null;
      this.draft = null;
      this.items = gesture.before;
      if (gesture.mode === 'pan') this.setView(gesture.view);
      try { if (this.svg.hasPointerCapture(gesture.pointerId)) this.svg.releasePointerCapture(gesture.pointerId); } catch (_) { /* A canceled pointer may already be released. */ }
      this._cursor();
      this._render();
    }

    _updateDraft(point) {
      const item = this.draft;
      const start = this.gesture.start;
      if (item.type === 'pen') {
        if (!item.points) item.points = [{ ...start }];
        if (item.points.length < 20000 && distance(item.points[item.points.length - 1], point) >= this._tolerance(0.7)) item.points.push({ ...point });
      } else if (item.type === 'line' || item.type === 'straight') {
        item.points = [{ ...start }, { ...point }];
      } else if (item.type === 'circle') {
        Object.assign(item, { cx: start.x, cy: start.y, r: distance(start, point) });
      } else {
        const x = Math.min(start.x, point.x), y = Math.min(start.y, point.y);
        const width = Math.abs(point.x - start.x), height = Math.abs(point.y - start.y);
        item.points = item.type === 'triangle'
          ? [{ x: x + width / 2, y }, { x: x + width, y: y + height }, { x, y: y + height }]
          : [{ x, y }, { x, y: y + height }, { x: x + width, y: y + height }];
      }
    }

    _drawable(item) {
      const minimum = this._tolerance(2);
      if (item.type === 'pen') return item.points.length > 0;
      if (item.type === 'circle') return item.r >= minimum;
      if (item.type === 'line' || item.type === 'straight') return distance(item.points[0], item.points[1]) >= minimum;
      const xs = item.points.map(p => p.x), ys = item.points.map(p => p.y);
      return Math.max(...xs) - Math.min(...xs) >= minimum && Math.max(...ys) - Math.min(...ys) >= minimum;
    }

    _lineEnds(item) {
      if (item.type !== 'straight') return item.points;
      const [a, b] = item.points;
      const dx = b.x - a.x, dy = b.y - a.y;
      const { x, y, width, height } = this.world;
      const candidates = [];
      const add = t => {
        const p = { x: a.x + t * dx, y: a.y + t * dy };
        if (p.x >= x - 0.001 && p.x <= x + width + 0.001 && p.y >= y - 0.001 && p.y <= y + height + 0.001) candidates.push({ ...p, t });
      };
      if (Math.abs(dx) > 1e-8) { add((x - a.x) / dx); add((x + width - a.x) / dx); }
      if (Math.abs(dy) > 1e-8) { add((y - a.y) / dy); add((y + height - a.y) / dy); }
      candidates.sort((p, q) => p.t - q.t);
      return candidates.length > 1 ? [candidates[0], candidates[candidates.length - 1]] : item.points;
    }

    _shape(item) {
      const style = item.style;
      const attrs = { fill: 'none', stroke: style.color, 'stroke-width': style.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none' };
      if (style.dashed) attrs['stroke-dasharray'] = Math.max(6, style.width * 3) + ' ' + Math.max(4, style.width * 2);
      if (item.type === 'circle') return element('circle', { ...attrs, cx: item.cx, cy: item.cy, r: item.r });
      if (item.type === 'text') {
        const text = element('text', { x: item.x, y: item.y, fill: style.color, 'font-size': item.fontSize, 'font-family': 'system-ui, sans-serif', 'pointer-events': 'none' });
        item.text.split(/\r?\n/).slice(0, 50).forEach((line, index) => {
          const span = element('tspan', { x: item.x, dy: index ? item.fontSize * 1.3 : 0 });
          span.textContent = line || ' ';
          text.appendChild(span);
        });
        return text;
      }
      const points = this._lineEnds(item);
      if (item.type === 'triangle' || item.type === 'rightTriangle') {
        return element('polygon', { ...attrs, points: points.map(p => p.x + ',' + p.y).join(' ') });
      }
      const path = points.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' ');
      return element('path', { ...attrs, d: points.length === 1 ? path + ' l0.01 0' : path });
    }

    _render() {
      const fragment = document.createDocumentFragment();
      this.nodes = new Map();
      this.items.forEach(item => {
        const node = element('g', { 'data-geometry-user-id': item.id });
        node.appendChild(this._shape(item));
        this.nodes.set(item.id, node);
        fragment.appendChild(node);
      });
      if (this.draft) {
        const preview = element('g', { 'data-geometry-ui': 'preview', opacity: 0.78 });
        preview.appendChild(this._shape(this.draft));
        fragment.appendChild(preview);
      }
      this.group.replaceChildren(fragment);
      const selected = this.nodes.get(this.selectedId);
      if (selected) {
        const bbox = this._bounds(this.items.find(item => item.id === this.selectedId));
        const padding = this._tolerance(6);
        this.group.appendChild(element('rect', {
          'data-geometry-ui': 'selection', x: bbox.x - padding, y: bbox.y - padding,
          width: bbox.width + padding * 2, height: bbox.height + padding * 2,
          fill: 'none', stroke: '#16785c', 'stroke-width': 1.5,
          'stroke-dasharray': '5 4', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none'
        }));
      }
    }

    _bounds(item) {
      const node = this.nodes.get(item.id);
      if (node) {
        try {
          const box = node.getBBox();
          if (box.width > 0 || box.height > 0) return box;
        } catch (_) { /* Detached or hidden SVG: use geometry below. */ }
      }
      if (item.type === 'circle') return { x: item.cx - item.r, y: item.cy - item.r, width: item.r * 2, height: item.r * 2 };
      if (item.type === 'text') {
        const lines = item.text.split(/\r?\n/);
        return { x: item.x, y: item.y - item.fontSize, width: Math.max(...lines.map(line => line.length)) * item.fontSize, height: lines.length * item.fontSize * 1.3 };
      }
      const points = this._lineEnds(item), xs = points.map(p => p.x), ys = points.map(p => p.y);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
    }

    _hit(point, selectInterior) {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const item = this.items[i];
        const tolerance = this._tolerance(8) + item.style.width / 2;
        if (item.type === 'text') {
          const box = this._bounds(item);
          if (point.x >= box.x - tolerance && point.x <= box.x + box.width + tolerance && point.y >= box.y - tolerance && point.y <= box.y + box.height + tolerance) return item;
        } else if (item.type === 'circle') {
          const d = distance(point, { x: item.cx, y: item.cy });
          if (Math.abs(d - item.r) <= tolerance || (selectInterior && d <= item.r)) return item;
        } else {
          const points = this._lineEnds(item);
          const closed = item.type === 'triangle' || item.type === 'rightTriangle';
          if (selectInterior && closed && inPolygon(point, points)) return item;
          if (points.length === 1 && distance(point, points[0]) <= tolerance) return item;
          for (let j = 1; j < points.length; j++) if (segmentDistance(point, points[j - 1], points[j]) <= tolerance) return item;
          if (closed && segmentDistance(point, points[points.length - 1], points[0]) <= tolerance) return item;
        }
      }
      return null;
    }

    _eraseAt(point, render) {
      const hit = this._hit(point, false);
      if (!hit) return;
      this.items = this.items.filter(item => item.id !== hit.id);
      this.gesture.changed = true;
      if (render !== false) this._render();
    }

    _commit(before) {
      this.undoStack.push(before);
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack = [];
      this._render();
      this._emit();
    }

    _emit() {
      if (typeof this.options.onChange === 'function') this.options.onChange(this.getState());
    }

    _cursor() {
      this.svg.style.cursor = this.tool === 'pan' ? 'grab' : this.tool === 'select' ? 'default' : this.tool === 'text' ? 'text' : 'crosshair';
    }
  }

  global.GeometryDrawing = GeometryDrawing;
})(window);
