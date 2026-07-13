import { TYPE_COLORS, ICONS, wobblePath } from './shared.js';

export function renderStructuredCanvas(container, spec, exploration, onSelect) {
  container.innerHTML = '';
  container.classList.remove('empty');

  const W = container.clientWidth || 640;
  const H = Math.max(480, Math.round(W * 0.72));
  container.style.height = `${H}px`;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // paper texture background
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', W);
  bg.setAttribute('height', H);
  bg.setAttribute('fill', '#1a1612');
  svg.appendChild(bg);

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <filter id="paper-noise" x="0" y="0">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 0.04 0"/>
    </filter>
  `;
  svg.appendChild(defs);
  const noise = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  noise.setAttribute('width', W);
  noise.setAttribute('height', H);
  noise.setAttribute('filter', 'url(#paper-noise)');
  noise.setAttribute('opacity', '0.35');
  svg.appendChild(noise);

  // headline
  const headline = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  headline.setAttribute('x', W / 2);
  headline.setAttribute('y', 36);
  headline.setAttribute('text-anchor', 'middle');
  headline.setAttribute('fill', '#ece7dd');
  headline.setAttribute('font-size', '18');
  headline.setAttribute('font-weight', '700');
  headline.textContent = spec.headline ?? exploration.title;
  svg.appendChild(headline);

  if (spec.subtitle) {
    const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    sub.setAttribute('x', W / 2);
    sub.setAttribute('y', 58);
    sub.setAttribute('text-anchor', 'middle');
    sub.setAttribute('fill', '#9c9488');
    sub.setAttribute('font-size', '11');
    sub.textContent = spec.subtitle;
    svg.appendChild(sub);
  }

  const blocks = spec.blocks ?? [];
  const centers = new Map();

  for (const block of blocks) {
    const bx = (block.x ?? 0.1) * W;
    const by = (block.y ?? 0.2) * H + 40;
    const bw = (block.w ?? 0.35) * W;
    const bh = (block.h ?? 0.16) * H;
    centers.set(block.id, { x: bx + bw / 2, y: by + bh / 2 });
  }

  for (const edge of spec.edges ?? []) {
    const a = centers.get(edge.from);
    const b = centers.get(edge.to);
    if (!a || !b) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', wobblePath(a.x, a.y, b.x, b.y, 10));
    path.setAttribute('stroke', '#8a8577');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('fill', 'none');
    svg.appendChild(path);
    if (edge.label) {
      const lx = (a.x + b.x) / 2;
      const ly = (a.y + b.y) / 2 - 6;
      const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lbl.setAttribute('x', lx);
      lbl.setAttribute('y', ly);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('fill', '#6f695e');
      lbl.setAttribute('font-size', '9');
      lbl.textContent = edge.label;
      svg.appendChild(lbl);
    }
  }

  for (const block of blocks) {
    const bx = (block.x ?? 0.1) * W;
    const by = (block.y ?? 0.2) * H + 40;
    const bw = (block.w ?? 0.35) * W;
    const bh = (block.h ?? 0.16) * H;
    const rot = ((block.id?.charCodeAt(1) ?? 0) % 5) - 2;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${bx + bw / 2}, ${by + bh / 2}) rotate(${rot}) translate(${-bw / 2}, ${-bh / 2})`);
    g.style.cursor = block.question_id ? 'pointer' : 'default';

    const typeStyle = block.question_type ? TYPE_COLORS[block.question_type] : null;
    const fill = typeStyle?.bg ?? 'rgba(236,231,221,0.08)';
    const stroke = typeStyle?.text ?? '#4a443b';

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', bw);
    rect.setAttribute('height', bh);
    rect.setAttribute('rx', 8);
    rect.setAttribute('fill', fill);
    rect.setAttribute('stroke', stroke);
    rect.setAttribute('stroke-width', '1.2');
    g.appendChild(rect);

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', 10);
    icon.setAttribute('y', 22);
    icon.setAttribute('font-size', '14');
    icon.textContent = ICONS[block.icon] ?? '·';
    g.appendChild(icon);

    const kind = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    kind.setAttribute('x', 30);
    kind.setAttribute('y', 18);
    kind.setAttribute('fill', '#6f695e');
    kind.setAttribute('font-size', '9');
    kind.setAttribute('font-weight', '700');
    kind.textContent = block.kind ?? '';
    g.appendChild(kind);

    wrapText(svg, g, block.text ?? '', 12, 30, bw - 20, bh - 36, '#e6e1d6', 12);

    if (block.question_id) {
      g.addEventListener('click', () => onSelect?.(block));
    }

    svg.appendChild(g);
  }

  container.appendChild(svg);
}

function wrapText(svg, parent, text, x, y, maxWidth, maxHeight, fill, fontSize) {
  const words = text.split('');
  let line = '';
  let ly = y;
  const lineHeight = fontSize * 1.45;
  const lines = [];

  for (const ch of words) {
    const test = line + ch;
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('font-size', fontSize);
    t.textContent = test;
    svg.appendChild(t);
    const w = t.getComputedTextLength();
    svg.removeChild(t);
    if (w > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const maxLines = Math.floor(maxHeight / lineHeight);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    shown[shown.length - 1] = shown[shown.length - 1].slice(0, -1) + '…';
  }

  shown.forEach((ln, i) => {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', ly + i * lineHeight);
    t.setAttribute('fill', fill);
    t.setAttribute('font-size', fontSize);
    t.textContent = ln;
    parent.appendChild(t);
  });
}
