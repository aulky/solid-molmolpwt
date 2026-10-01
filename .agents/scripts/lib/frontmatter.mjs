// Tolerant YAML-frontmatter parser for kit files (rules, skills, agents). Zero dependencies.
// Supports: plain / "double" / 'single' scalars (multi-line too), block scalars (| |- |+ > >- >+),
// block sequences (indented or at the key's column), nested block maps, flow [lists] and {maps},
// comments, CRLF, BOM. It never throws: problems are returned in `errors` / `duplicates`.
// `styles` records how each key's value was written (e.g. globs: "double" vs "seq"), keyed by
// dotted path ("globs", "metadata.icon"), so validators can enforce quoting conventions.
import fs from 'node:fs';

/** Split a document into frontmatter YAML text and body. */
export function splitFrontmatter(text) {
  let t = String(text ?? '');
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  const lines = t.split(/\r?\n/);
  if (lines[0].replace(/\s+$/, '') !== '---') {
    return { hasFrontmatter: false, closed: false, yaml: '', body: t, bodyLine: 1, endLine: 0 };
  }
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i].replace(/\s+$/, '');
    if (l === '---' || l === '...') {
      return {
        hasFrontmatter: true, closed: true,
        yaml: lines.slice(1, i).join('\n'),
        body: lines.slice(i + 1).join('\n'),
        bodyLine: i + 2, endLine: i + 1,
      };
    }
  }
  return { hasFrontmatter: true, closed: false, yaml: lines.slice(1).join('\n'), body: '', bodyLine: lines.length + 1, endLine: 0 };
}

/** Parse a document's frontmatter. Line numbers in errors are 1-based file lines. */
export function parseFrontmatter(text) {
  const s = splitFrontmatter(text);
  const out = { ...s, data: {}, styles: {}, errors: [], duplicates: [] };
  if (!s.hasFrontmatter) return out;
  if (!s.closed) out.errors.push({ line: 1, message: 'frontmatter opened with --- but never closed' });
  const y = parseYaml(s.yaml, { lineOffset: 1 });
  out.data = y.data && typeof y.data === 'object' && !Array.isArray(y.data) ? y.data : {};
  if (y.data !== null && (typeof y.data !== 'object' || Array.isArray(y.data))) {
    out.errors.push({ line: 2, message: 'frontmatter is not a key: value mapping' });
  }
  out.styles = y.styles;
  out.errors.push(...y.errors);
  out.duplicates = y.duplicates;
  return out;
}

/** Read and parse a file's frontmatter; returns null data on read failure (never throws). */
export function readFrontmatterFile(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    return { ...parseFrontmatter(''), readError: String(e && e.message || e), text: '' };
  }
  return { ...parseFrontmatter(text), text };
}

// ---------------------------------------------------------------------------------------------
const KEY_RE = /^(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|([^\s"'#\-?:[\]{},][^#]*?|-[^\s#][^#]*?))\s*:(?:[ \t]+(.*))?$/;
const SEQ_RE = /^-(?:[ \t]+(.*))?$/;

/** Parse a YAML subset. Returns { data, styles, errors, duplicates }. */
export function parseYaml(text, { lineOffset = 0 } = {}) {
  const errors = [];
  const duplicates = [];
  const styles = {};
  const raw = String(text ?? '').split(/\r?\n/);
  const lines = raw.map((r, i) => {
    const m = /^[ \t]*/.exec(r)[0];
    if (m.includes('\t') && r.trim() && !r.trim().startsWith('#')) {
      errors.push({ line: i + 1 + lineOffset, message: 'tab used for indentation (YAML forbids tabs)' });
    }
    const content = r.slice(m.length).replace(/\s+$/, '');
    return { n: i + 1 + lineOffset, indent: m.length, content, blank: content === '' || content.startsWith('#') };
  });
  const ctx = { lines, errors, duplicates, styles };
  const first = nextContent(ctx, 0);
  if (first >= lines.length) return { data: null, styles, errors, duplicates };
  const res = parseNode(ctx, first, lines[first].indent, '');
  const after = nextContent(ctx, res.next);
  if (after < lines.length) {
    errors.push({ line: lines[after].n, message: `unexpected content: ${clip(lines[after].content)}` });
  }
  return { data: res.value, styles, errors, duplicates };
}

function clip(s) { return s.length > 60 ? s.slice(0, 57) + '...' : s; }

function nextContent(ctx, i) {
  while (i < ctx.lines.length && ctx.lines[i].blank) i++;
  return i;
}

function parseNode(ctx, i, indent, path) {
  const line = ctx.lines[i];
  if (SEQ_RE.test(line.content)) return parseSeq(ctx, i, indent, path);
  if (KEY_RE.test(line.content) && !/^["'[{]/.test(line.content.trim()) || /^["'].*["']\s*:(\s|$)/.test(line.content)) {
    return parseMap(ctx, i, indent, path);
  }
  // A bare scalar node (e.g. a value on the line after its key).
  const v = parseInlineValue(ctx, i, line.content, indent - 1, path, true);
  return { value: v.value, next: v.next, style: v.style };
}

function parseMap(ctx, i, indent, path) {
  const obj = {};
  const { lines } = ctx;
  while (true) {
    i = nextContent(ctx, i);
    if (i >= lines.length) break;
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      ctx.errors.push({ line: line.n, message: `unexpected indentation: ${clip(line.content)}` });
      i++;
      continue;
    }
    const m = KEY_RE.exec(line.content);
    if (!m) {
      if (SEQ_RE.test(line.content)) break; // sequence at parent's column ends this map
      ctx.errors.push({ line: line.n, message: `expected "key: value": ${clip(line.content)}` });
      i++;
      continue;
    }
    const key = m[1] !== undefined ? unescapeDouble(m[1]) : m[2] !== undefined ? m[2].replace(/''/g, "'") : m[3].trim();
    const rest = (m[4] ?? '').trim();
    const kpath = path ? `${path}.${key}` : key;
    if (Object.prototype.hasOwnProperty.call(obj, key)) ctx.duplicates.push({ key: kpath, line: line.n });
    let value;
    let style;
    let next;
    if (rest === '' || rest.startsWith('#')) {
      const j = nextContent(ctx, i + 1);
      if (j < lines.length && lines[j].indent > indent) {
        const r = parseNode(ctx, j, lines[j].indent, kpath);
        value = r.value; style = r.style; next = r.next;
      } else if (j < lines.length && lines[j].indent === indent && SEQ_RE.test(lines[j].content)) {
        const r = parseSeq(ctx, j, indent, kpath);
        value = r.value; style = r.style; next = r.next;
      } else {
        value = null; style = 'empty'; next = i + 1;
      }
    } else {
      const r = parseInlineValue(ctx, i, rest, indent, kpath, false);
      value = r.value; style = r.style; next = r.next;
    }
    obj[key] = value;
    ctx.styles[kpath] = { style, line: line.n };
    i = next;
  }
  return { value: obj, next: i, style: 'map' };
}

function parseSeq(ctx, i, indent, path) {
  const arr = [];
  const { lines } = ctx;
  while (true) {
    i = nextContent(ctx, i);
    if (i >= lines.length) break;
    const line = lines[i];
    if (line.indent !== indent) {
      if (line.indent > indent) {
        ctx.errors.push({ line: line.n, message: `unexpected indentation in list: ${clip(line.content)}` });
        i++;
        continue;
      }
      break;
    }
    const m = SEQ_RE.exec(line.content);
    if (!m) break;
    const rest = (m[1] ?? '').trim();
    const ipath = `${path}[${arr.length}]`;
    if (rest === '' || rest.startsWith('#')) {
      const j = nextContent(ctx, i + 1);
      if (j < lines.length && lines[j].indent > indent) {
        const r = parseNode(ctx, j, lines[j].indent, ipath);
        arr.push(r.value); i = r.next;
      } else { arr.push(null); i++; }
      continue;
    }
    const offset = line.content.indexOf(rest);
    const isNestedSeq = SEQ_RE.test(rest);
    const isMapItem = !/^["'[{|>]/.test(rest) && KEY_RE.test(rest);
    if (isNestedSeq || isMapItem) {
      // Re-parse the item as a node that starts at the column of `rest`.
      const saved = lines[i];
      lines[i] = { ...saved, indent: indent + offset, content: rest };
      const r = parseNode(ctx, i, indent + offset, ipath);
      lines[i] = saved;
      arr.push(r.value); i = r.next;
      continue;
    }
    const r = parseInlineValue(ctx, i, rest, indent, ipath, false);
    arr.push(r.value); i = r.next;
  }
  return { value: arr, next: i, style: 'seq' };
}

// Parse a value that starts on line i (text = remainder after "key:" or "- ").
// parentIndent = indentation of the owning key/item; continuation lines must be deeper.
function parseInlineValue(ctx, i, text, parentIndent, path, standalone) {
  const { lines } = ctx;
  const c = text[0];
  if (c === '|' || c === '>') {
    const hm = /^([|>])([+-]?)(\d?)([+-]?)\s*(#.*)?$/.exec(text);
    if (hm) return parseBlockScalar(ctx, i, hm, parentIndent);
  }
  if (c === '"' || c === "'") {
    let acc = text;
    let j = i;
    let end = findQuoteEnd(acc, c);
    while (end < 0 && j + 1 < lines.length) {
      j++;
      const l = lines[j];
      acc += '\n' + l.content;
      end = findQuoteEnd(acc, c);
    }
    if (end < 0) {
      ctx.errors.push({ line: lines[i].n, message: `unterminated ${c === '"' ? 'double' : 'single'}-quoted string` });
      return { value: acc.slice(1), next: j + 1, style: c === '"' ? 'double' : 'single' };
    }
    const inner = acc.slice(1, end);
    const tail = acc.slice(end + 1).trim();
    if (tail && !tail.startsWith('#')) {
      ctx.errors.push({ line: lines[j].n, message: `unexpected text after quoted string: ${clip(tail)}` });
    }
    const folded = foldQuoted(inner);
    const value = c === '"' ? unescapeDouble(folded) : folded.replace(/''/g, "'");
    return { value, next: j + 1, style: c === '"' ? 'double' : 'single' };
  }
  if (c === '[' || c === '{') {
    let acc = text;
    let j = i;
    while (!flowBalanced(acc) && j + 1 < lines.length) { j++; acc += ' ' + lines[j].content; }
    const r = parseFlow(acc, 0);
    if (r.error) ctx.errors.push({ line: lines[i].n, message: `invalid flow collection: ${r.error}` });
    const tail = acc.slice(r.end).trim();
    if (tail && !tail.startsWith('#')) ctx.errors.push({ line: lines[j].n, message: `unexpected text after flow collection: ${clip(tail)}` });
    return { value: r.value, next: j + 1, style: c === '[' ? 'flow-seq' : 'flow-map' };
  }
  // Plain scalar, possibly continued on deeper-indented lines.
  const parts = [stripComment(text)];
  let j = i + 1;
  let pendingBlank = 0;
  while (j < lines.length) {
    const l = lines[j];
    if (l.content === '') { pendingBlank++; j++; continue; }
    if (l.indent <= parentIndent || l.content.startsWith('#')) break;
    if (standalone && l.indent < lines[i].indent) break;
    parts.push(pendingBlank ? '\n'.repeat(pendingBlank) : ' ');
    parts.push(stripComment(l.content));
    pendingBlank = 0;
    j++;
  }
  // Do not swallow trailing blank lines.
  while (j - 1 > i && lines[j - 1].content === '') j--;
  const joined = parts.join('').replace(/ ?\n ?/g, '\n');
  return { value: coerce(joined), next: j, style: 'plain' };
}

function parseBlockScalar(ctx, i, hm, parentIndent) {
  const { lines } = ctx;
  const kind = hm[1];
  const chomp = hm[2] || hm[4] || '';
  const explicit = hm[3] ? Number(hm[3]) : 0;
  let j = i + 1;
  let blockIndent = explicit ? parentIndent + explicit : -1;
  const body = [];
  while (j < lines.length) {
    const rawLine = ctx.lines[j];
    const isEmpty = rawLine.content === '';
    if (!isEmpty) {
      if (blockIndent < 0) {
        if (rawLine.indent <= parentIndent) break;
        blockIndent = rawLine.indent;
      }
      if (rawLine.indent < blockIndent) break;
      body.push(' '.repeat(rawLine.indent - blockIndent) + rawLine.content);
    } else {
      body.push('');
    }
    j++;
  }
  // Trailing empty lines belong to chomping, not content.
  let trailing = 0;
  while (body.length && body[body.length - 1] === '') { body.pop(); trailing++; }
  // Give trailing blank lines back to the outer parser position (they are blank anyway).
  let value;
  if (kind === '|') {
    value = body.join('\n');
  } else {
    value = '';
    let prevMore = false;
    let started = false;
    let empties = 0;
    for (const l of body) {
      if (l === '') { empties++; continue; }
      const more = /^[ \t]/.test(l);
      if (!started) { value += '\n'.repeat(empties) + l; started = true; }
      else if (empties === 0) value += (more || prevMore ? '\n' : ' ') + l;
      else value += '\n'.repeat(empties + (more || prevMore ? 1 : 0)) + l;
      empties = 0;
      prevMore = more;
    }
  }
  if (value !== '' || trailing) {
    if (chomp === '-') { /* strip */ }
    else if (chomp === '+') value += '\n' + '\n'.repeat(trailing);
    else if (value !== '') value += '\n';
  }
  return { value, next: j, style: kind === '|' ? 'literal' : 'folded' };
}

function findQuoteEnd(s, q) {
  for (let k = 1; k < s.length; k++) {
    const ch = s[k];
    if (q === '"' && ch === '\\') { k++; continue; }
    if (ch === q) {
      if (q === "'" && s[k + 1] === "'") { k++; continue; }
      return k;
    }
  }
  return -1;
}

function foldQuoted(inner) {
  if (!inner.includes('\n')) return inner;
  const ls = inner.split('\n');
  let out = ls[0].replace(/[ \t]+$/, '');
  let empties = 0;
  for (let k = 1; k < ls.length; k++) {
    const t = ls[k].trim();
    if (t === '') { empties++; continue; }
    if (out.endsWith('\\') && !out.endsWith('\\\\')) out = out.slice(0, -1) + t;
    else out += (empties ? '\n'.repeat(empties) : ' ') + t;
    empties = 0;
  }
  return out + (empties ? '\n'.repeat(empties) : '');
}

function unescapeDouble(s) {
  return s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (m, e) => {
    switch (e[0]) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '0': return '\0';
      case 'b': return '\b';
      case 'e': return '\x1b';
      case ' ': return ' ';
      case '/': return '/';
      case '"': return '"';
      case '\\': return '\\';
      case 'x': case 'u': case 'U': return String.fromCodePoint(parseInt(e.slice(1), 16));
      default: return m; // unknown escape: keep verbatim (tolerant)
    }
  });
}

function stripComment(s) {
  const m = /(^|[ \t])#/.exec(s);
  return (m ? s.slice(0, m.index) : s).trim();
}

function coerce(v) {
  const s = v.trim();
  if (s === '' || s === '~' || /^null$/i.test(s)) return null;
  if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
  if (/^[-+]?\d+$/.test(s) && s.replace(/^[-+]/, '').length < 16) return Number(s);
  if (/^[-+]?(\d+\.\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s);
  return s;
}

function flowBalanced(s) {
  let depth = 0;
  let q = null;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (q) {
      if (q === '"' && ch === '\\') { k++; continue; }
      if (ch === q) { if (q === "'" && s[k + 1] === "'") { k++; continue; } q = null; }
      continue;
    }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') { depth--; if (depth === 0) return true; }
  }
  return depth <= 0;
}

// Minimal flow parser: returns { value, end, error }.
function parseFlow(s, pos) {
  const open = s[pos];
  const close = open === '[' ? ']' : '}';
  const isSeq = open === '[';
  const out = isSeq ? [] : {};
  let k = pos + 1;
  const skipWs = () => { while (k < s.length && /\s/.test(s[k])) k++; };
  const readScalar = (stopChars) => {
    skipWs();
    const ch = s[k];
    if (ch === '"' || ch === "'") {
      const end = findQuoteEnd(s.slice(k), ch);
      if (end < 0) { const v = s.slice(k + 1); k = s.length; return { v, err: 'unterminated string' }; }
      const inner = s.slice(k + 1, k + end);
      k += end + 1;
      return { v: ch === '"' ? unescapeDouble(inner) : inner.replace(/''/g, "'") };
    }
    if (ch === '[' || ch === '{') { const r = parseFlow(s, k); k = r.end; return { v: r.value, err: r.error }; }
    let start = k;
    while (k < s.length && !stopChars.includes(s[k])) k++;
    return { v: coerce(s.slice(start, k)) };
  };
  let error = null;
  while (true) {
    skipWs();
    if (k >= s.length) { error = error || `missing "${close}"`; break; }
    if (s[k] === close) { k++; break; }
    if (isSeq) {
      const r = readScalar([',', ']']);
      if (r.err) error = r.err;
      if (!(r.v === null && s[k] === ']' && out.length === 0)) out.push(r.v);
    } else {
      const kr = readScalar([':', ',', '}']);
      skipWs();
      let val = null;
      if (s[k] === ':') { k++; const vr = readScalar([',', '}']); val = vr.v; if (vr.err) error = vr.err; }
      if (kr.v !== null) out[String(kr.v)] = val;
    }
    skipWs();
    if (s[k] === ',') { k++; continue; }
    if (s[k] === close) { k++; break; }
    if (k < s.length) { error = error || `unexpected "${s[k]}"`; k++; }
  }
  return { value: out, end: k, error };
}
