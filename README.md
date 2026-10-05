# mona-tron-de

A JavaScript library and CLI that shuffles a teacher's multiple-choice exam into several numbered variants, keeps the answer mapping correct and produces printable pages plus an answer key.

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933)](https://nodejs.org/)

The tool targets Vietnamese exams: the plain-text input syntax, CLI options and generated files use Vietnamese. It reads plain text, Aiken, GIFT and DOCX, and supports locked choices, reading-comprehension groups, exam sections, four-statement true/false questions and short-answer questions. The same seed always produces the same result. A web version is available at [mona.media/tron-de-thi-trac-nghiem-online](https://mona.media/tron-de-thi-trac-nghiem-online/).

## Sample output

| Variant 101, A4 print | Answer key |
| --- | --- |
| ![Variant 101 printed on A4](docs/ma-de-101.png) | ![Answer key for all variants](docs/bang-dap-an.png) |

## Install

Requires Node.js 18+. No runtime dependencies.

```bash
git clone https://github.com/mona-software/mona-tron-de
cd mona-tron-de
npm install
npm run build
```

## Quick start

```bash
node dist/cli.js examples/vat-ly-10.txt --so-ma 8 --ma-bat-dau 101 --out tron/ --seed 7 --tieu-de "Kiểm tra giữa kỳ I - Vật lý 10"
```

```text
Đã tạo 8 mã đề trong .../tron
Seed: 7 · Số câu: 20
```

```text
tron/
├── ma-101.html       # A4 page for printing
├── ma-101.txt
├── ...
├── dap-an.csv        # ma_de,cau,dap_an (variant, question, answer)
├── bang-dap-an.html  # answer key for all variants
└── thong-tin.json    # seed, variant count and warnings
```

## Usage

```bash
node dist/cli.js <exam.txt|exam.docx> [options]
```

| Option | Description | Default |
| --- | --- | --- |
| `--so-ma <n>` | Number of variants (1–999) | `4` |
| `--ma-bat-dau <n>` | First variant code | `101` |
| `--out <dir>` | Output directory | `tron` |
| `--seed <value>` | Seed for reproducible shuffling | `1` |
| `--tieu-de <text>` | Exam title | `ĐỀ KIỂM TRA` |
| `--truong <text>` | School name | empty |
| `--thoi-gian <text>` | Time allowed | `_____ phút` |
| `--khong-can-bang` | Do not balance answer positions A/B/C/D | balancing on |
| `--help` | Show help | |

`.docx` files are read as DOCX; any other file is read as UTF-8 text, with Aiken and GIFT detected automatically.

### Plain-text format

```text
[phan: I]
Câu 1. Đơn vị SI của vận tốc là gì?
A. km/h
*B. m/s
C. m
D. s

Câu 2. Chọn câu kết. [giu-thu-tu]
A. Mở đầu
B. Thân bài
C. Bổ sung
*D. Kết thúc

[nhom: doc-hieu-1]
Câu 3. Câu hỏi thứ nhất của đoạn đọc...
*A. Đúng
B. Sai
C. Chưa rõ
D. Không có
Câu 4. Câu hỏi thứ hai của đoạn đọc...
A. Sai
*B. Đúng
C. Chưa rõ
D. Không có
[/nhom]
```

| Marker | Meaning |
| --- | --- |
| `*` before a choice | Correct answer |
| `[giu-thu-tu]` | Lock the order of this question's choices |
| `[nhom: name]` … `[/nhom]` | Keep these questions together; they can still be reordered within the group |
| `[phan: I]` | Section; questions are shuffled only within their section |
| `[dung-sai]` | True/false question with statements `a)`–`d)`; mark true statements with `*` |
| `[tra-loi-ngan]` | Short-answer question, followed by a line `Đáp án: <answer>` |

See [`examples/`](examples/) for complete samples.

### Answer balancing

With balancing on (the default), each unlocked multiple-choice question places its correct answer in the position used least so far. When the number of unlocked questions is divisible by four, A/B/C/D are evenly distributed; otherwise the counts differ by at most one. Locked questions count toward the distribution. If sections and groups make it impossible for two variants to have different question orders, the result includes a warning.

## Library API

```js
import { docDe, tronDe, xuatHtml, xuatCsv } from 'mona-tron-de';

const exam = docDe(textContent);
const result = tronDe(exam, {
  soMa: 8,
  maBatDau: 101,
  seed: 7,
  canBang: true
});

const html = xuatHtml(result.versions[0], {
  school: 'Trường THPT Ví Dụ',
  title: 'Kiểm tra giữa kỳ I - Vật lý 10',
  duration: '45 phút'
});
const csv = xuatCsv(result);
```

| Function | Purpose |
| --- | --- |
| `docDe(text, { format? })` | Parse plain text, Aiken or GIFT (`format`: `text`, `aiken`, `gift`; detected when omitted) |
| `await docDeDocx(data)` | Parse a DOCX from an `ArrayBuffer` or `Uint8Array` |
| `tronDe(exam, { soMa, maBatDau, seed, canBang })` | Create variants; returns `{ seed, versions, warnings }` |
| `xuatHtml`, `xuatText` | Render one variant as A4 HTML or text |
| `xuatCsv`, `xuatBangDapAnHtml` | Render the answer key as CSV or HTML |
| `xuatAiken`, `xuatGift` | Export an exam as Aiken or GIFT |

Parsing, shuffling and rendering do not use `fs`, so they also run in the browser. The build produces ESM (`dist/index.js`), CommonJS (`dist/index.cjs`), a browser IIFE that sets `globalThis.MonaTronDe` (`dist/browser.js`) and TypeScript declarations.

The DOCX reader unzips `word/document.xml`, keeps basic bold and italic formatting and warns when the document contains images.

## Known limitations

- DOCX: only text from `word/document.xml` is read; images, Office Math equations, complex tables, headers/footers and tracked changes are not reproduced.
- DOCX bold/italic is kept at the basic run level; styles inherited from the theme are not analyzed.
- GIFT support covers multiple-choice questions with `=correct` and `~wrong`; matching, numerical and embedded answers are not supported.
- No DOCX output; printable output is A4 HTML.
- Locked questions or missing/invalid answers in the source can prevent exact balancing; check `warnings` and `thong-tin.json`.

## Development

```bash
npm run build
npm test
npm run lint
```

Issues and pull requests should include a minimal sample exam, the expected result and a regression test. Do not add copyrighted exams or student data to the repository.

## License

MIT, see [LICENSE](LICENSE).

**`mona-tron-de` is a product of MONA Software, a member of The MONA Group.**
