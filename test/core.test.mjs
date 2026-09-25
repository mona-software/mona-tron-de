import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { docDe, docDeDocx, tronDe, xuatCsv, xuatHtml, xuatAiken, xuatGift } from '../dist/index.js';

const basic = `
[phan: I]
Câu 1. Hai cộng hai bằng mấy?
A. 3
*B. 4
C. 5
D. 6

Câu 2. Chọn câu kết. [giu-thu-tu]
A. Mở đầu
B. Thân bài
C. Bổ sung
*D. Kết thúc

[nhom: doc]
Câu 3. Đoạn đọc — câu một?
*A. Đúng
B. Sai
C. Không rõ
D. Cả hai

Câu 4. Đoạn đọc — câu hai?
A. Sai
*B. Đúng
C. Không rõ
D. Cả hai
[/nhom]

Câu 5. Kiểm tra bốn ý. [dung-sai]
*a) Ý thứ nhất.
b) Ý thứ hai.
*c) Ý thứ ba.
d) Ý thứ tư.

[phan: II]
Câu 6. Ba nhân bốn bằng bao nhiêu? [tra-loi-ngan]
Đáp án: 12
`;

test('parse text nhận đủ loại câu và đáp án', () => {
  const exam = docDe(basic);
  assert.equal(exam.questions.length, 6);
  assert.equal(exam.questions[0].choices.find((x) => x.correct).text, '4');
  assert.equal(exam.questions[4].type, 'true-false');
  assert.deepEqual(exam.questions[4].choices.map((x) => x.correct), [true, false, true, false]);
  assert.equal(exam.questions[5].answer, '12');
});

test('đáp án theo đúng vị trí mới; câu khóa không đổi', () => {
  const result = tronDe(docDe(basic), {soMa:8, seed:7});
  for (const version of result.versions) {
    for (let i = 0; i < version.questions.length; i++) {
      const q = version.questions[i];
      const answer = version.answers[i].answer;
      if (q.type === 'multiple-choice') assert.equal(q.choices['ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(answer)].correct, true);
      if (q.id === '2') assert.deepEqual(q.choices.map((x) => x.text), ['Mở đầu','Thân bài','Bổ sung','Kết thúc']);
    }
  }
});

test('câu cùng nhóm luôn đi liền và vẫn được đảo trong nhóm', () => {
  const result = tronDe(docDe(basic), {soMa:8, seed:'nhom'});
  let reversed = false;
  for (const version of result.versions) {
    const ids = version.questions.map((q) => q.id);
    assert.equal(Math.abs(ids.indexOf('3') - ids.indexOf('4')), 1);
    if (ids.indexOf('4') < ids.indexOf('3')) reversed = true;
  }
  assert.equal(reversed, true);
});

test('Đúng/Sai đảo ý nhưng mapping đúng; trả lời ngắn giữ nguyên', () => {
  const result = tronDe(docDe(basic), {soMa:5, seed:19});
  for (const version of result.versions) {
    const tf = version.questions.find((q) => q.id === '5');
    const answer = version.answers[version.questions.indexOf(tf)].answer;
    assert.equal(answer, tf.choices.map((x) => x.correct ? 'Đ' : 'S').join(''));
    const short = version.questions.find((q) => q.id === '6');
    assert.equal(short.answer, '12');
  }
});

test('cùng seed cho kết quả giống hệt, seed khác cho kết quả khác', () => {
  const exam = docDe(basic);
  assert.deepEqual(tronDe(exam, {soMa:4, seed:7}), tronDe(exam, {soMa:4, seed:7}));
  assert.notDeepEqual(tronDe(exam, {soMa:4, seed:7}).versions, tronDe(exam, {soMa:4, seed:8}).versions);
});

test('cân bằng đáp án A/B/C/D trong đề 20 câu', async () => {
  const exam = docDe(await readFile('examples/vat-ly-10.txt', 'utf8'));
  const result = tronDe(exam, {soMa:12, seed:7});
  for (const version of result.versions) {
    const counts = Object.fromEntries(['A','B','C','D'].map((x) => [x, 0]));
    version.answers.forEach((x) => counts[x.answer]++);
    for (const count of Object.values(counts)) assert.ok(count >= 4 && count <= 6, JSON.stringify(counts));
  }
});

test('Aiken và GIFT đọc/xuất lại được', () => {
  const exam = docDe(basic);
  const aiken = docDe(xuatAiken(exam), {format:'aiken'});
  const gift = docDe(xuatGift(exam), {format:'gift'});
  assert.equal(aiken.questions.length, 4);
  assert.equal(gift.questions.length, 4);
  assert.equal(aiken.questions[0].choices.find((x) => x.correct).text, '4');
  assert.equal(gift.questions[0].choices.find((x) => x.correct).text, '4');
});

test('CSV và HTML có dữ liệu cần thiết', () => {
  const result = tronDe(docDe(basic), {soMa:2, seed:3, maBatDau:201});
  assert.match(xuatCsv(result), /ma_de,cau,dap_an/);
  assert.match(xuatCsv(result), /201,1,/);
  assert.match(xuatHtml(result.versions[0], {title:'Giữa kỳ'}), /MÃ ĐỀ/);
  assert.match(xuatHtml(result.versions[0], {title:'Giữa kỳ'}), /Giữa kỳ/);
});

function storedZip(name, content) {
  const encoder = new TextEncoder();
  const fileName = encoder.encode(name);
  const body = encoder.encode(content);
  const total = 30 + fileName.length + body.length + 46 + fileName.length + 22;
  const out = new Uint8Array(total); const view = new DataView(out.buffer); let p = 0;
  const u16 = (value) => { view.setUint16(p, value, true); p += 2; };
  const u32 = (value) => { view.setUint32(p, value, true); p += 4; };
  u32(0x04034b50); u16(20); u16(0); u16(0); u16(0); u16(0); u32(0); u32(body.length); u32(body.length); u16(fileName.length); u16(0);
  out.set(fileName, p); p += fileName.length; out.set(body, p); p += body.length;
  const centralOffset = p;
  u32(0x02014b50); u16(20); u16(20); u16(0); u16(0); u16(0); u16(0); u32(0); u32(body.length); u32(body.length); u16(fileName.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(0);
  out.set(fileName, p); p += fileName.length;
  const centralSize = p - centralOffset;
  u32(0x06054b50); u16(0); u16(0); u16(1); u16(1); u32(centralSize); u32(centralOffset); u16(0);
  return out;
}

test('DOCX tối giản được đọc và giữ định dạng cơ bản', async () => {
  const xml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
  <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 1. Hai cộng hai?</w:t></w:r></w:p>
  <w:p><w:r><w:t>A. 3</w:t></w:r></w:p>
  <w:p><w:r><w:rPr><w:i/></w:rPr><w:t>*B. 4</w:t></w:r></w:p>
  <w:p><w:r><w:t>C. 5</w:t></w:r><w:drawing/></w:p>
  <w:p><w:r><w:t>D. 6</w:t></w:r></w:p>
  </w:body></w:document>`;
  const exam = await docDeDocx(storedZip('word/document.xml', xml));
  assert.equal(exam.questions.length, 1);
  assert.equal(exam.questions[0].choices.find((x) => x.correct).text, '_4_');
  assert.match(xuatHtml(tronDe(exam, {soMa:1}).versions[0]), /<em>4<\/em>/);
  assert.match(exam.warnings.join(' '), /bỏ qua ảnh/);
});

test('bundle CommonJS và browser IIFE đều cung cấp API', async () => {
  const require = createRequire(import.meta.url);
  const cjs = require('../dist/index.cjs');
  assert.equal(cjs.VERSION, '0.1.0');
  const code = await readFile('dist/browser.js', 'utf8');
  const context = {globalThis:{}, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, DataView, Map, Set, console};
  vm.runInNewContext(code, context);
  assert.equal(context.globalThis.MonaTronDe.VERSION, '0.1.0');
  assert.equal(context.globalThis.MonaTronDe.docDe(basic).questions.length, 6);
});
