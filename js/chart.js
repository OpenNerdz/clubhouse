// Score trend: one line, one dot per round, hover/keyboard readout.
import { h, add, formatShortDate, formatFullDate } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function niceTicks(min, max) {
  const span = max - min;
  const step = span <= 8 ? 2 : span <= 20 ? 5 : 10;
  const lo = Math.floor((min - 1) / step) * step;
  const hi = Math.ceil((max + 1) / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return { lo, hi, ticks };
}

/** rounds: oldest first, each with date, score, course. */
export function scoreChart(rounds, { onCleanup, height = 200 } = {}) {
  const first = rounds[0];
  const last = rounds[rounds.length - 1];
  const wrap = h('div', {
    class: 'chart',
    tabindex: '0',
    role: 'img',
    'aria-label': `Score trend over your last ${rounds.length} rounds, from ${first.score} on ${formatFullDate(first.date)} to ${last.score} on ${formatFullDate(last.date)}. Use the arrow keys to read each round.`,
  });
  const tip = h('div', { class: 'chart-tip', hidden: true });
  wrap.append(tip);

  let width = 0;
  let points = [];
  let active = -1;
  let cross;
  let hoverDot;

  function draw() {
    width = wrap.clientWidth;
    if (!width) return;
    const m = { top: 14, right: 34, bottom: 26, left: 34 };
    const scores = rounds.map((r) => r.score);
    const { lo, hi, ticks } = niceTicks(Math.min(...scores), Math.max(...scores));
    const iw = width - m.left - m.right;
    const ih = height - m.top - m.bottom;
    const x = (i) => m.left + (rounds.length === 1 ? iw / 2 : (i / (rounds.length - 1)) * iw);
    const y = (v) => m.top + ((hi - v) / (hi - lo)) * ih;

    const svg = el('svg', { width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' });
    for (const t of ticks) {
      svg.append(el('line', { class: 'grid', x1: m.left, x2: width - m.right, y1: y(t), y2: y(t) }));
      const label = el('text', { class: 'axis', x: m.left - 8, y: y(t), 'text-anchor': 'end', 'dominant-baseline': 'middle' });
      label.textContent = t;
      svg.append(label);
    }
    const xFirst = el('text', { class: 'axis', x: x(0), y: height - 6, 'text-anchor': rounds.length === 1 ? 'middle' : 'start' });
    xFirst.textContent = formatShortDate(first.date);
    svg.append(xFirst);
    if (rounds.length > 1) {
      const xLast = el('text', { class: 'axis', x: x(rounds.length - 1), y: height - 6, 'text-anchor': 'end' });
      xLast.textContent = formatShortDate(last.date);
      svg.append(xLast);
    }

    points = rounds.map((r, i) => ({ x: x(i), y: y(r.score), r }));
    cross = el('line', { class: 'crosshair', y1: m.top, y2: height - m.bottom, x1: 0, x2: 0, visibility: 'hidden' });
    svg.append(cross);
    if (points.length > 1) {
      svg.append(el('path', { class: 'line', d: points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') }));
    }
    for (const p of points) svg.append(el('circle', { class: 'dot', cx: p.x, cy: p.y, r: 4 }));
    // The best round gets the same red-pen ring as on the scorecard.
    let bestI = 0;
    points.forEach((p, i) => { if (p.r.score <= points[bestI].r.score) bestI = i; });
    const b = points[bestI];
    const ring = el('path', {
      class: 'pen',
      d: `M${b.x - 9} ${b.y + 4}c-3-8 5-14 12-14 8 0 13 5 12 11-1 7-9 10-15 9-6-1-10-5-9-11 1-3 4-5 8-6`,
    });
    svg.append(ring);
    hoverDot = el('circle', { class: 'dot dot-active', cx: 0, cy: 0, r: 6, visibility: 'hidden' });
    svg.append(hoverDot);

    const end = points[points.length - 1];
    const endLabel = el('text', { class: 'end-label', x: end.x + 10, y: end.y, 'dominant-baseline': 'middle' });
    endLabel.textContent = end.r.score;
    svg.append(endLabel);

    const old = wrap.querySelector('svg');
    if (old) old.replaceWith(svg);
    else wrap.prepend(svg);
    if (active >= 0) show(active);
  }

  function show(i) {
    active = i;
    const p = points[i];
    if (!p) return;
    cross.setAttribute('x1', p.x);
    cross.setAttribute('x2', p.x);
    cross.setAttribute('visibility', 'visible');
    hoverDot.setAttribute('cx', p.x);
    hoverDot.setAttribute('cy', p.y);
    hoverDot.setAttribute('visibility', 'visible');
    tip.replaceChildren();
    add(tip,
      h('strong', null, String(p.r.score)),
      h('span', null, formatFullDate(p.r.date)),
      p.r.course ? h('span', null, p.r.course) : null);
    tip.hidden = false;
    const tw = tip.offsetWidth;
    const left = Math.min(Math.max(p.x - tw / 2, 0), width - tw);
    tip.style.left = `${left}px`;
    const above = p.y - tip.offsetHeight - 14;
    tip.style.top = `${above >= 0 ? above : p.y + 14}px`;
  }

  function hide() {
    active = -1;
    tip.hidden = true;
    if (cross) cross.setAttribute('visibility', 'hidden');
    if (hoverDot) hoverDot.setAttribute('visibility', 'hidden');
  }

  function nearest(clientX) {
    const left = wrap.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i].x - (clientX - left)) < Math.abs(points[best].x - (clientX - left))) best = i;
    }
    return best;
  }

  wrap.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  wrap.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  wrap.addEventListener('pointerleave', hide);
  wrap.addEventListener('focus', () => show(points.length - 1));
  wrap.addEventListener('blur', hide);
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(Math.max(0, (active < 0 ? points.length : active) - 1));
    else if (e.key === 'ArrowRight') show(Math.min(points.length - 1, active + 1));
    else if (e.key === 'Escape') hide();
    else return;
    e.preventDefault();
  });

  const ro = new ResizeObserver(() => {
    if (wrap.clientWidth !== width) draw();
  });
  ro.observe(wrap);
  if (onCleanup) onCleanup(() => ro.disconnect());
  return wrap;
}
