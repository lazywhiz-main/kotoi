import { TYPE_COLORS, wobblePath } from './shared.js';

export function renderMapCanvas(container, spec, exploration, onSelect) {
  container.innerHTML = '';
  container.classList.remove('empty');

  const W = container.clientWidth || 640;
  const H = Math.max(460, W * 0.85);
  container.style.height = `${H}px`;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', W);
  bg.setAttribute('height', H);
  bg.setAttribute('fill', '#14110e');
  svg.appendChild(bg);

  const cx = W / 2;
  const cy = H / 2;
  const rHub = Math.min(W, H) * 0.22;
  const rQ = Math.min(W, H) * 0.38;
  const deco = spec.decoration ?? {};

  const hubs = spec.hubs ?? [];
  const hubCount = Math.max(hubs.length, 1);

  // center
  const centerG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const centerR = 44;
  const cCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  cCircle.setAttribute('cx', cx);
  cCircle.setAttribute('cy', cy);
  cCircle.setAttribute('r', centerR);
  cCircle.setAttribute('fill', 'rgba(236,231,221,0.1)');
  cCircle.setAttribute('stroke', '#ece7dd');
  cCircle.setAttribute('stroke-width', '2');
  centerG.appendChild(cCircle);

  const cLabel = spec.center?.label ?? exploration.short_label ?? exploration.title;
  const cLines = splitLines(cLabel, 8);
  cLines.forEach((ln, i) => {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', cx);
    t.setAttribute('y', cy - 6 + i * 13);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('fill', '#ece7dd');
    t.setAttribute('font-size', '11');
    t.setAttribute('font-weight', '700');
    t.textContent = ln;
    centerG.appendChild(t);
  });
  svg.appendChild(centerG);

  hubs.forEach((hub, hi) => {
    const angle = ((hub.angle ?? -90 + hi * (360 / hubCount)) * Math.PI) / 180;
    const hx = cx + rHub * Math.cos(angle);
    const hy = cy + rHub * Math.sin(angle);

    const hubPath = deco.wobbly_lines
      ? wobblePath(cx, cy, hx, hy, 6)
      : `M ${cx} ${cy} L ${hx} ${hy}`;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', hubPath);
    line.setAttribute('stroke', '#4a443b');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('fill', 'none');
    svg.appendChild(line);

    // hub sticky note
    const hw = 72;
    const hh = 34;
    const hubG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    hubG.setAttribute(
      'transform',
      `translate(${hx - hw / 2}, ${hy - hh / 2}) rotate(${((hi % 3) - 1) * 2}, ${hw / 2}, ${hh / 2})`,
    );

    const sticky = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    sticky.setAttribute('width', hw);
    sticky.setAttribute('height', hh);
    sticky.setAttribute('rx', 4);
    sticky.setAttribute('fill', deco.sticky_notes ? 'rgba(227,182,101,0.18)' : 'rgba(28,24,21,0.9)');
    sticky.setAttribute('stroke', deco.sticky_notes ? 'rgba(227,182,101,0.45)' : '#3a342c');
    hubG.appendChild(sticky);

    const ht = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    ht.setAttribute('x', hw / 2);
    ht.setAttribute('y', hh / 2 + 4);
    ht.setAttribute('text-anchor', 'middle');
    ht.setAttribute('fill', '#e6e1d6');
    ht.setAttribute('font-size', '10');
    ht.setAttribute('font-weight', '600');
    ht.textContent = (hub.label ?? '').slice(0, 8);
    hubG.appendChild(ht);
    svg.appendChild(hubG);

    // notes on inner ring
    (hub.notes ?? []).forEach((note, ni) => {
      const na = angle + ((ni - (hub.notes.length - 1) / 2) * 18 * Math.PI) / 180;
      const nx = cx + (rHub * 0.55) * Math.cos(na);
      const ny = cy + (rHub * 0.55) * Math.sin(na);
      const nLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      nLine.setAttribute('d', wobblePath(hx, hy, nx, ny, 4));
      nLine.setAttribute('stroke', '#3a342c');
      nLine.setAttribute('stroke-width', '1');
      nLine.setAttribute('fill', 'none');
      svg.appendChild(nLine);

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', nx);
      dot.setAttribute('cy', ny);
      dot.setAttribute('r', 5);
      dot.setAttribute('fill', '#6f695e');
      svg.appendChild(dot);
    });

    // questions on outer ring
    (hub.questions ?? []).forEach((q, qi) => {
      const offset = (q.angle_offset ?? (qi - (hub.questions.length - 1) / 2) * 14) * (Math.PI / 180);
      const qa = angle + offset;
      const qx = cx + rQ * Math.cos(qa);
      const qy = cy + rQ * Math.sin(qa);

      const qLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      qLine.setAttribute('d', wobblePath(hx, hy, qx, qy, 5));
      qLine.setAttribute('stroke', '#3a342c');
      qLine.setAttribute('stroke-width', '1');
      qLine.setAttribute('fill', 'none');
      qLine.setAttribute('stroke-dasharray', '3 2');
      svg.appendChild(qLine);

      const tc = deco.show_type_colors !== false ? TYPE_COLORS[q.question_type] : null;
      const qg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      qg.style.cursor = 'pointer';

      const qc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      qc.setAttribute('cx', qx);
      qc.setAttribute('cy', qy);
      qc.setAttribute('r', 14);
      qc.setAttribute('fill', tc?.bg ?? 'rgba(236,231,221,0.08)');
      qc.setAttribute('stroke', tc?.text ?? '#9c9488');
      qc.setAttribute('stroke-width', '1.5');
      qg.appendChild(qc);

      const num = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      num.setAttribute('x', qx);
      num.setAttribute('y', qy + 4);
      num.setAttribute('text-anchor', 'middle');
      num.setAttribute('fill', tc?.text ?? '#ece7dd');
      num.setAttribute('font-size', '10');
      num.setAttribute('font-weight', '700');
      num.textContent = String(qi + 1);
      qg.appendChild(num);

      qg.addEventListener('click', () => onSelect?.(q));
      svg.appendChild(qg);
    });
  });

  // subtitle below center
  if (spec.center?.subtitle) {
    const st = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    st.setAttribute('x', cx);
    st.setAttribute('y', H - 18);
    st.setAttribute('text-anchor', 'middle');
    st.setAttribute('fill', '#6f695e');
    st.setAttribute('font-size', '10');
    st.textContent = spec.center.subtitle.slice(0, 48);
    svg.appendChild(st);
  }

  container.appendChild(svg);
}

function splitLines(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const mid = Math.ceil(text.length / 2);
  return [text.slice(0, mid), text.slice(mid)];
}
