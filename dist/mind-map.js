// Copyright (c) 2026 Hữu Hoà <nguyenhuuhoa@proton.me>
// SPDX-License-Identifier: MIT
// Derived from: https://github.com/kyle6317/examaplus

/**
 * mind-map.js
 * Module khởi tạo và render sơ đồ tư duy từ Markdown (dùng jsMind)
 *
 * Export:
 *   renderMindMap(containerId, markdown) → Promise<{ jm, notes }>
 *   destroyMindMap(instance) → void
 */

// ── Paper color palette ───────────────────────────────────────────────────────
const BRANCH_COLORS = [
  { bg: '#dbeafe', fg: '#1e4e8c' },
  { bg: '#dcfce7', fg: '#166534' },
  { bg: '#fef9c3', fg: '#854d0e' },
  { bg: '#fce7f3', fg: '#9d174d' },
  { bg: '#ede9fe', fg: '#4c1d95' },
  { bg: '#ffedd5', fg: '#9a3412' },
];
const ROOT_STYLE = { bg: '#27251f', fg: '#faf9f6' };

// ── Parse Markdown headings into tree ─────────────────────────────────────────
function parseMarkdownToTree(md) {
  const lines = md.split('\n');
  const headings = [];
  lines.forEach(line => {
    const m = line.match(/^(#{1,6})\s+(.*)/);
    if (m) headings.push({ level: m[1].length, text: m[2].trim() });
  });
  if (!headings.length) return null;

  let idCount = 0;
  const nextId = () => 'n' + (++idCount);
  const rootNode = { id: 'root', topic: headings[0].text, children: [] };
  const stack = [{ level: headings[0].level, node: rootNode }];

  headings.slice(1).forEach(h => {
    while (stack.length > 1 && stack[stack.length - 1].level >= h.level) stack.pop();
    const parent = stack[stack.length - 1].node;
    const node = { id: nextId(), topic: h.text, children: [] };
    parent.children.push(node);
    stack.push({ level: h.level, node });
  });

  return rootNode;
}

// ── Parse leaf notes from markdown ───────────────────────────────────────────
function parseLeafNotes(md) {
  const map = {};
  const lines = md.split('\n');
  const sections = [];
  let current = null;

  lines.forEach(line => {
    const m = line.match(/^(#{1,6})\s+(.*)/);
    if (m) {
      if (current) sections.push(current);
      current = { level: m[1].length, title: m[2].trim(), bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  });
  if (current) sections.push(current);

  sections.forEach(sec => {
    const body = sec.bodyLines.join('\n').trim();
    if (body) map[sec.title] = { title: sec.title, text: body };
  });
  return map;
}

function assignColors(node, colorIdx) {
  const c = BRANCH_COLORS[colorIdx];
  node._bg = c.bg;
  node._fg = c.fg;
  (node.children || []).forEach(child => assignColors(child, colorIdx));
}

// ── Touch support: pan bằng scroll, pinch-to-zoom ────────────────────────────
/**
 * Tại sao lần trước không hoạt động:
 *   - jsMind pan KHÔNG dùng mousemove để move element — nó dùng e_panel.scrollBy()
 *   - Dispatch MouseEvent giả sang container KHÔNG trigger được scrollBy vì
 *     handler của jsMind bind vào closure riêng, không phải DOM event chain chuẩn.
 *
 * Cách đúng:
 *   1. Tìm e_panel (div.jsmind-inner) — đây là scrollable container thật
 *   2. Pan = gọi trực tiếp ePanel.scrollBy(dx, dy)
 *   3. Pinch = gọi jm.view.set_zoom() trực tiếp
 *   4. Tap ngắn = dispatch mousedown + click để jsMind select/click node
 */
function installTouchSupport(container, jm) {
  const ePanel = container.querySelector('.jsmind-inner');
  if (!ePanel) return;

  let startX = 0, startY = 0;
  let lastX = 0, lastY = 0;
  let startDist = 0;
  let isPinching = false;
  let isDragging = false;
  let tapTarget = null;
  let tapTime = 0;
  const TAP_MOVE_LIMIT = 8;   // px — di chuyển ít hơn mức này = tap
  const TAP_TIME_LIMIT = 250; // ms

  function touchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isPinching = false;
      isDragging = true;
      startX = lastX = e.touches[0].clientX;
      startY = lastY = e.touches[0].clientY;
      tapTarget = e.target;
      tapTime = Date.now();

      // Dispatch mousedown để jsMind nhận biết node được chạm vào
      tapTarget.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true,
        clientX: startX, clientY: startY,
      }));

    } else if (e.touches.length === 2) {
      isDragging = false;
      isPinching = true;
      startDist = touchDist(e.touches);
      e.preventDefault();
    }
  }, { passive: false });

  container.addEventListener('touchmove', (e) => {
    if (isPinching && e.touches.length === 2) {
      e.preventDefault();
      const dist = touchDist(e.touches);
      if (startDist > 0) {
        const ratio = dist / startDist;
        const newZoom = jm.view.zoom_current * ratio;
        jm.view.set_zoom(newZoom);
      }
      startDist = touchDist(e.touches);

    } else if (isDragging && e.touches.length === 1) {
      const cx = e.touches[0].clientX;
      const cy = e.touches[0].clientY;
      const totalMoved = Math.abs(cx - startX) + Math.abs(cy - startY);

      if (totalMoved > TAP_MOVE_LIMIT) {
        // Đã xác định là drag — ngăn scroll trang
        e.preventDefault();
        // Scroll e_panel trực tiếp — đây là cách jsMind pan thật sự hoạt động
        ePanel.scrollBy(lastX - cx, lastY - cy);
      }

      lastX = cx;
      lastY = cy;
    }
  }, { passive: false });

  container.addEventListener('touchend', (e) => {
    if (isDragging) {
      const moved = Math.abs(lastX - startX) + Math.abs(lastY - startY);
      const elapsed = Date.now() - tapTime;

      if (moved < TAP_MOVE_LIMIT && elapsed < TAP_TIME_LIMIT && tapTarget) {
        // Tap ngắn → dispatch click để jsMind xử lý click node / expander
        tapTarget.dispatchEvent(new MouseEvent('click', {
          bubbles: true, cancelable: true,
          clientX: lastX, clientY: lastY,
        }));
      }
    }
    isDragging = false;
    isPinching = false;
    startDist = 0;
  }, { passive: true });

  container.addEventListener('touchcancel', () => {
    isDragging = false;
    isPinching = false;
    startDist = 0;
  }, { passive: true });
}

// ── Render mind map ───────────────────────────────────────────────────────────
export async function renderMindMap(containerId, markdown) {
  if (typeof jsMind === 'undefined') await loadJsMind();

  const tree = parseMarkdownToTree(markdown);
  if (!tree) return null;

  const notes = parseLeafNotes(markdown);

  const dirs = ['right', 'left'];
  (tree.children || []).forEach((child, i) => {
    child._dir = dirs[i % 2];
    assignColors(child, i % BRANCH_COLORS.length);
  });

  function toJsNode(node) {
    const n = { id: node.id, topic: node.topic };
    if (node.id === 'root') {
      n['background-color'] = ROOT_STYLE.bg;
      n['foreground-color'] = ROOT_STYLE.fg;
    } else if (node._bg) {
      n['background-color'] = node._bg;
      n['foreground-color'] = node._fg;
    }
    if (node._dir) n.direction = node._dir;
    if (node.children && node.children.length) n.children = node.children.map(toJsNode);
    return n;
  }

  const mindData = {
    meta: { name: 'theory', author: '', version: '1' },
    format: 'node_tree',
    data: toJsNode(tree)
  };

  const container = document.getElementById(containerId);
  if (container) container.innerHTML = '';

  const jm = new jsMind({
    container: containerId,
    editable: false,
    theme: 'default',
    view: {
      engine: 'canvas',
      hmargin: 80,
      vmargin: 40,
      line_width: 1.5,
      line_color: '#d6d0c4',
      line_style: 'curved',
      draggable: true,
      hide_scrollbars_when_draggable: true,
    },
    layout: { hspace: 36, vspace: 14, pspace: 14 },
  });

  jm.show(mindData);

  // Gắn touch support sau khi jsMind đã render xong DOM
  requestAnimationFrame(() => {
    if (container) installTouchSupport(container, jm);
  });

  return { jm, notes };
}

// ── Destroy ───────────────────────────────────────────────────────────────────
export function destroyMindMap(instance) {
  try { instance?.jm?.destroy?.(); } catch (_) {}
}

// ── Lazy-load jsMind + draggable from CDN ─────────────────────────────────────
let _jsMindLoaded = false;
function loadJsMind() {
  if (_jsMindLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (!document.querySelector('link[rel="stylesheet"][href*="jsmind"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/jsmind@0.9.1/style/jsmind.css';
      document.head.appendChild(link);
    }
    const s1 = document.createElement('script');
    s1.src = 'https://cdn.jsdelivr.net/npm/jsmind@0.9.1/es6/jsmind.js';
    s1.onload = () => {
      const s2 = document.createElement('script');
      s2.src = 'https://cdn.jsdelivr.net/npm/jsmind@0.9.1/es6/jsmind.draggable-node.js';
      s2.onload = () => { _jsMindLoaded = true; resolve(); };
      s2.onerror = reject;
      document.head.appendChild(s2);
    };
    s1.onerror = reject;
    document.head.appendChild(s1);
  });
}
