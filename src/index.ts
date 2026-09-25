// @ts-check

/** @typedef {'multiple-choice'|'true-false'|'short-answer'} QuestionType */
/** @typedef {{id:string,text:string,correct:boolean}} Choice */
/** @typedef {{id:string,type:QuestionType,text:string,choices:Choice[],answer?:string,lockChoices:boolean,group?:string,section:string}} Question */
/** @typedef {{questions:Question[],warnings:string[],sourceFormat:string}} Exam */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function clean(value) { return String(value ?? '').trim(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function rich(value) {
  return esc(value).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/_([^_\n]+)_/g, '<em>$1</em>').replace(/\n/g, '<br>');
}
function plain(value) { return String(value ?? '').replace(/\*\*|_/g, ''); }
function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function normalize(text) {
  return String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim();
}
function hashSeed(seed) {
  let h = 2166136261 >>> 0;
  for (const char of String(seed)) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function randomFrom(seed) {
  let a = hashSeed(seed);
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffled(items, random) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function detectFormat(text) {
  if (/^ANSWER:\s*[A-Z]/mi.test(text)) return 'aiken';
  if (/::[^:]+::[\s\S]*\{[=~]/.test(text)) return 'gift';
  return 'text';
}

/** Parse đề text, Aiken hoặc GIFT mà không dùng API Node. */
export function docDe(input, options = {}) {
  const text = normalize(input);
  const format = options.format || detectFormat(text);
  if (format === 'aiken') return parseAiken(text);
  if (format === 'gift') return parseGift(text);
  return parseText(text);
}

function parseText(text) {
  const warnings = [];
  const questions = [];
  const lines = text.split('\n');
  let current = null;
  let section = 'I';
  let group;
  const finish = () => {
    if (!current) return;
    if (current.type !== 'short-answer' && current.choices.length < 2) {
      warnings.push(`Câu ${current.id} có ít hơn 2 phương án/ý.`);
    }
    if (current.type === 'multiple-choice' && current.choices.filter((x) => x.correct).length !== 1) {
      warnings.push(`Câu ${current.id} cần đúng 1 đáp án đúng.`);
    }
    questions.push(current); current = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let match;
    if ((match = line.match(/^\[phan:\s*([^\]]+)\]$/i))) { finish(); section = clean(match[1]); continue; }
    if ((match = line.match(/^\[nhom:\s*([^\]]+)\]$/i))) { finish(); group = clean(match[1]); continue; }
    if (/^\[\/nhom\]$/i.test(line)) { finish(); group = undefined; continue; }
    match = line.match(/^(?:Câu|Cau|Question)\s*(\d+)\s*[.:)]\s*(.*)$/i);
    if (match) {
      finish();
      let body = clean(match[2]);
      const lockChoices = /\[giu-thu-tu\]/i.test(body);
      const isTf = /\[(?:dung-sai|đúng-sai|true-false)\]/i.test(body);
      const isShort = /\[(?:tra-loi-ngan|trả-lời-ngắn|short-answer)\]/i.test(body);
      body = body.replace(/\[(?:giu-thu-tu|dung-sai|đúng-sai|true-false|tra-loi-ngan|trả-lời-ngắn|short-answer)\]/gi, '').trim();
      current = {id:match[1], type:isShort ? 'short-answer' : isTf ? 'true-false' : 'multiple-choice', text:body, choices:[], lockChoices, group, section};
      continue;
    }
    if (!current) { warnings.push(`Bỏ qua dòng ngoài câu hỏi: ${line}`); continue; }
    if (current.type === 'short-answer' && (match = line.match(/^(?:Đáp án|Dap an|Answer)\s*:\s*(.+)$/i))) {
      current.answer = clean(match[1]); continue;
    }
    if (current.type === 'true-false') {
      match = line.match(/^(\*)?\s*([a-d])\s*[.)]\s*(.*?)(?:\s*\[(Đ|D|S|T|F)\])?$/i);
      if (match) {
        const marker = (match[4] || '').toUpperCase();
        current.choices.push({id:match[2].toLowerCase(), text:clean(match[3]), correct:Boolean(match[1]) || ['Đ','D','T'].includes(marker)}); continue;
      }
    }
    match = line.match(/^(\*)?\s*([A-Z])\s*[.)]\s*(.+)$/);
    if (match) {
      current.choices.push({id:match[2], text:clean(match[3]), correct:Boolean(match[1])}); continue;
    }
    current.text += `\n${line}`;
  }
  finish();
  if (!questions.length) warnings.push('Không tìm thấy câu hỏi nào.');
  return {questions, warnings, sourceFormat:'text'};
}

function parseAiken(text) {
  const questions = [];
  const warnings = [];
  for (const [index, block] of text.split(/\n\s*\n/).entries()) {
    const lines = block.split('\n').map(clean).filter(Boolean);
    const answerLine = lines.find((line) => /^ANSWER:/i.test(line));
    const optionLines = lines.filter((line) => /^[A-Z][.)]\s+/.test(line));
    const questionLines = lines.filter((line) => !/^[A-Z][.)]\s+/.test(line) && !/^ANSWER:/i.test(line));
    if (!answerLine || optionLines.length < 2 || !questionLines.length) { warnings.push(`Khối Aiken ${index + 1} không hợp lệ.`); continue; }
    const answer = answerLine.replace(/^ANSWER:\s*/i, '').trim().toUpperCase();
    questions.push({id:String(index + 1), type:'multiple-choice', text:questionLines.join('\n'), choices:optionLines.map((line) => ({id:line[0], text:line.slice(2).trim(), correct:line[0] === answer})), lockChoices:false, section:'I'});
  }
  return {questions, warnings, sourceFormat:'aiken'};
}

function parseGift(text) {
  const questions = [];
  const warnings = [];
  const regex = /(?:::([^:\n]+)::)?\s*([^{}]+?)\s*\{([^{}]*)\}/gs;
  let match; let index = 0;
  while ((match = regex.exec(text))) {
    index++;
    const choices = [];
    for (const answer of match[3].matchAll(/([=~])([^=~\n]+)/g)) {
      choices.push({id:LETTERS[choices.length], text:clean(answer[2].replace(/\\([{}~=#])/g, '$1')), correct:answer[1] === '='});
    }
    if (choices.length < 2) { warnings.push(`Câu GIFT ${index} chưa được hỗ trợ hoặc thiếu phương án.`); continue; }
    questions.push({id:String(index), type:'multiple-choice', text:clean(match[2]), choices, lockChoices:false, section:'I'});
  }
  if (!questions.length) warnings.push('Không tìm thấy câu GIFT hỗ trợ được.');
  return {questions, warnings, sourceFormat:'gift'};
}

function orderQuestions(questions, random) {
  const result = [];
  const sections = [];
  for (const question of questions) if (!sections.includes(question.section)) sections.push(question.section);
  for (const section of sections) {
    const source = questions.filter((q) => q.section === section);
    const units = [];
    const grouped = new Map();
    for (const q of source) {
      if (q.group) {
        if (!grouped.has(q.group)) { const unit = []; grouped.set(q.group, unit); units.push(unit); }
        grouped.get(q.group).push(q);
      } else units.push([q]);
    }
    for (const unit of shuffled(units, random)) result.push(...(unit[0].group ? shuffled(unit, random) : unit));
  }
  return result;
}

function answerOf(question) {
  if (question.type === 'short-answer') return question.answer || '';
  if (question.type === 'true-false') return question.choices.map((choice) => choice.correct ? 'Đ' : 'S').join('');
  const index = question.choices.findIndex((choice) => choice.correct);
  return index < 0 ? '' : LETTERS[index];
}

function mixChoices(question, random, counts, balance) {
  if (question.type === 'short-answer' || question.choices.length < 2) return question;
  if (question.lockChoices) {
    if (balance && question.type === 'multiple-choice') {
      const fixed = question.choices.findIndex((x) => x.correct);
      if (fixed >= 0) counts[fixed] = (counts[fixed] || 0) + 1;
    }
    return question;
  }
  let choices;
  if (question.type === 'multiple-choice' && balance && question.choices.filter((x) => x.correct).length === 1) {
    const correct = question.choices.find((x) => x.correct);
    const wrong = shuffled(question.choices.filter((x) => !x.correct), random);
    const eligible = Array.from({length:question.choices.length}, (_, i) => i);
    const min = Math.min(...eligible.map((i) => counts[i] || 0));
    const targets = eligible.filter((i) => (counts[i] || 0) === min);
    const target = targets[Math.floor(random() * targets.length)];
    choices = wrong; choices.splice(target, 0, correct); counts[target] = (counts[target] || 0) + 1;
  } else choices = shuffled(question.choices, random);
  return {...question, choices:choices.map((choice, index) => ({...choice, id:question.type === 'true-false' ? String.fromCharCode(97 + index) : LETTERS[index]}))};
}

/** Trộn một Exam thành nhiều mã đề bằng seed tái lập. */
export function tronDe(exam, options = {}) {
  const count = Math.max(1, Number(options.soMa ?? options.count ?? 4));
  const start = Number(options.maBatDau ?? options.startCode ?? 101);
  const seed = options.seed ?? 1;
  const balance = options.canBang !== false && options.balance !== false;
  const versions = [];
  const signatures = new Set();
  const warnings = [...(exam.warnings || [])];
  for (let versionIndex = 0; versionIndex < count; versionIndex++) {
    let mixed; let signature = '';
    for (let attempt = 0; attempt < 100; attempt++) {
      const random = randomFrom(`${seed}:${versionIndex}:${attempt}`);
      const ordered = orderQuestions(exam.questions, random);
      const counts = [];
      mixed = ordered.map((source) => mixChoices(clone(source), random, counts, balance));
      signature = mixed.map((q) => q.id).join('|');
      if (!signatures.has(signature) || exam.questions.length < 2) break;
    }
    if (signatures.has(signature) && exam.questions.length >= 2) warnings.push(`Không thể tạo thứ tự câu riêng cho mã ${start + versionIndex}; cấu trúc nhóm/phần có thể đang khóa toàn bộ đề.`);
    signatures.add(signature);
    versions.push({code:String(start + versionIndex), questions:mixed || [], answers:(mixed || []).map((q, i) => ({question:i + 1, answer:answerOf(q), originalId:q.id}))});
  }
  return {seed:String(seed), versions, warnings};
}

function header(meta, code) {
  return `<header><div><strong>${esc(meta.school || 'TRƯỜNG: ____________________')}</strong><br>${esc(meta.title || 'ĐỀ KIỂM TRA')}</div><div class="code">MÃ ĐỀ<br><strong>${esc(code)}</strong></div></header><div class="meta">Thời gian: ${esc(meta.duration || '_____ phút')} · Họ và tên: ____________________ · Lớp: ______</div>`;
}

/** Xuất một mã đề thành HTML A4 độc lập. */
export function xuatHtml(version, meta = {}) {
  let lastSection = '';
  const body = version.questions.map((q, index) => {
    const section = q.section !== lastSection ? `<h2>PHẦN ${esc(q.section)}</h2>` : '';
    lastSection = q.section;
    const choices = q.type === 'short-answer'
      ? '<div class="short">Trả lời: ................................................................</div>'
      : `<ol class="choices" type="${q.type === 'true-false' ? 'a' : 'A'}">${q.choices.map((c) => `<li>${rich(c.text)}</li>`).join('')}</ol>`;
    return `${section}<section class="question"><p><strong>Câu ${index + 1}.</strong> ${rich(q.text)}</p>${choices}</section>`;
  }).join('\n');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(meta.title || 'Đề kiểm tra')} - ${esc(version.code)}</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:14px/1.45 Arial,sans-serif;color:#111;max-width:180mm;margin:auto}header{display:flex;justify-content:space-between;text-align:center;border-bottom:2px solid #111;padding-bottom:10px}.code{border:1px solid #111;padding:5px 14px;min-width:85px}.meta{margin:12px 0}h2{font-size:15px;margin:18px 0 8px}.question{break-inside:avoid;margin:0 0 12px}.question p{margin:0}.choices{display:grid;grid-template-columns:1fr 1fr;gap:3px 28px;margin:5px 0}.short{margin:10px 0 18px}@media(max-width:600px){.choices{grid-template-columns:1fr}}</style></head><body>${header(meta, version.code)}${body}</body></html>`;
}

/** Xuất một mã đề dạng text thuần. */
export function xuatText(version, meta = {}) {
  const lines = [`${meta.title || 'ĐỀ KIỂM TRA'} — MÃ ĐỀ ${version.code}`, `Thời gian: ${meta.duration || '_____ phút'}`, ''];
  let lastSection = '';
  version.questions.forEach((q, index) => {
    if (q.section !== lastSection) { lines.push(`PHẦN ${q.section}`, ''); lastSection = q.section; }
    lines.push(`Câu ${index + 1}. ${plain(q.text)}`);
    if (q.type === 'short-answer') lines.push('Trả lời: ____________________');
    else q.choices.forEach((choice, i) => lines.push(`${q.type === 'true-false' ? String.fromCharCode(97 + i) : LETTERS[i]}. ${plain(choice.text)}`));
    lines.push('');
  });
  return lines.join('\n');
}

/** Xuất đáp án mọi mã đề theo CSV UTF-8. */
export function xuatCsv(result) {
  const rows = [['ma_de','cau','dap_an']];
  for (const version of result.versions) for (const answer of version.answers) rows.push([version.code, answer.question, answer.answer]);
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

/** Xuất bảng đáp án tổng hợp dạng HTML. */
export function xuatBangDapAnHtml(result, meta = {}) {
  const columns = Math.max(0, ...result.versions.map((v) => v.answers.length));
  const head = Array.from({length:columns}, (_, i) => `<th>${i + 1}</th>`).join('');
  const rows = result.versions.map((v) => `<tr><th>${esc(v.code)}</th>${Array.from({length:columns}, (_, i) => `<td>${esc(v.answers[i]?.answer || '')}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Bảng đáp án</title><style>@page{size:A4 landscape;margin:12mm}body{font:13px Arial,sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:5px;text-align:center}h1{text-align:center;font-size:20px}</style></head><body><h1>BẢNG ĐÁP ÁN — ${esc(meta.title || '')}</h1><p>Seed: <code>${esc(result.seed)}</code></p><table><thead><tr><th>Mã đề</th>${head}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

export function xuatAiken(exam) {
  return exam.questions.filter((q) => q.type === 'multiple-choice').map((q) => `${q.text}\n${q.choices.map((c, i) => `${LETTERS[i]}. ${c.text}`).join('\n')}\nANSWER: ${answerOf(q)}`).join('\n\n') + '\n';
}

export function xuatGift(exam) {
  const protect = (value) => String(value).replace(/([{}~=#])/g, '\\$1');
  return exam.questions.filter((q) => q.type === 'multiple-choice').map((q, i) => `::Câu ${i + 1}::${protect(q.text)} {${q.choices.map((c) => `${c.correct ? '=' : '~'}${protect(c.text)}`).join('')}}`).join('\n\n') + '\n';
}

function findZipEntry(data, wanted) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('DOCX/ZIP không có central directory hợp lệ.');
  const decoder = new TextDecoder();
  let offset = view.getUint32(eocd + 16, true);
  const total = view.getUint16(eocd + 10, true);
  for (let n = 0; n < total; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Central directory của DOCX bị lỗi.');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength));
    if (name === wanted) {
      const localName = view.getUint16(localOffset + 26, true);
      const localExtra = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localName + localExtra;
      return {method, bytes:data.subarray(start, start + compressedSize)};
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`Không tìm thấy ${wanted} trong DOCX.`);
}

function decodeXml(xml) {
  return xml.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function normalizeDocxLine(line) {
  let value = line;
  for (const marker of ['\\*\\*', '_']) {
    const open = marker === '\\*\\*' ? '**' : '_';
    const question = new RegExp(`^${marker}(C(?:âu|au)\\s*\\d+\\s*[.:)])\\s*([\\s\\S]*?)${marker}$`, 'i');
    const option = new RegExp(`^${marker}(\\*?[A-Da-d]\\s*[.)])\\s*([\\s\\S]*?)${marker}$`);
    value = value.replace(question, (_, label, body) => `${label} ${open}${body}${open}`);
    value = value.replace(option, (_, label, body) => `${label} ${open}${body}${open}`);
    value = value.replace(new RegExp(`^${marker}(C(?:âu|au)\\s*\\d+\\s*[.:)]|\\*?[A-Da-d]\\s*[.)])${marker}\\s*`, 'i'), '$1 ');
  }
  return value;
}

/** Đọc ArrayBuffer/Uint8Array DOCX zero-dep; ảnh bị bỏ qua và có cảnh báo. */
export async function docDeDocx(input) {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const entry = findZipEntry(data, 'word/document.xml');
  let bytes;
  if (entry.method === 0) bytes = entry.bytes;
  else if (entry.method === 8) {
    if (typeof DecompressionStream !== 'undefined') {
      try { bytes = new Uint8Array(await new Response(new Blob([entry.bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
      catch { const zlib = await import('node:zlib'); bytes = new Uint8Array(zlib.inflateRawSync(entry.bytes)); }
    } else { const zlib = await import('node:zlib'); bytes = new Uint8Array(zlib.inflateRawSync(entry.bytes)); }
  } else throw new Error(`DOCX dùng phương thức nén ${entry.method} chưa được hỗ trợ.`);
  const xml = new TextDecoder().decode(bytes);
  const paragraphs = [];
  for (const paragraph of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    let line = '';
    for (const run of paragraph[1].matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
      const body = run[1];
      const bold = /<w:b(?:\s|\/|>)/.test(body);
      const italic = /<w:i(?:\s|\/|>)/.test(body);
      let value = Array.from(body.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g), (m) => decodeXml(m[1])).join('');
      value += (body.match(/<w:tab\b/g) || []).map(() => '\t').join('');
      value += (body.match(/<w:br\b/g) || []).map(() => '\n').join('');
      if (value && (bold || italic)) value = `${bold ? '**' : ''}${italic ? '_' : ''}${value}${italic ? '_' : ''}${bold ? '**' : ''}`;
      line += value;
    }
    if (line.trim()) paragraphs.push(normalizeDocxLine(line.trim()));
  }
  const exam = docDe(paragraphs.join('\n'));
  if (/<(?:w:drawing|w:pict)\b/.test(xml)) exam.warnings.push('DOCX có ảnh; v0.1 bỏ qua ảnh và chỉ giữ nội dung chữ.');
  return exam;
}

export const VERSION = '0.1.0';
