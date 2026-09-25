#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { docDe, docDeDocx, tronDe, xuatHtml, xuatText, xuatCsv, xuatBangDapAnHtml } from './index.js';

function help() {
  console.log(`mona-tron-de <de-goc.txt|.docx> [tùy chọn]

  --so-ma <n>          Số mã đề (mặc định: 4)
  --ma-bat-dau <n>     Mã đầu tiên (mặc định: 101)
  --out <thư-mục>      Nơi ghi kết quả (mặc định: tron)
  --seed <giá-trị>     Seed tái lập (mặc định: 1)
  --tieu-de <text>     Tiêu đề kỳ thi
  --truong <text>      Tên trường
  --thoi-gian <text>   Thời gian làm bài
  --khong-can-bang     Không cân bằng vị trí A/B/C/D
  --help               Xem trợ giúp`);
}

function parseArgs(argv) {
  const result = {input:'', soMa:4, maBatDau:101, out:'tron', seed:'1', tieuDe:'ĐỀ KIỂM TRA', truong:'', thoiGian:'_____ phút', canBang:true};
  const valueFlags = new Map([['--so-ma','soMa'],['--ma-bat-dau','maBatDau'],['--out','out'],['--seed','seed'],['--tieu-de','tieuDe'],['--truong','truong'],['--thoi-gian','thoiGian']]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return {...result, help:true};
    if (arg === '--khong-can-bang') { result.canBang = false; continue; }
    if (valueFlags.has(arg)) {
      if (argv[i + 1] == null) throw new Error(`Thiếu giá trị cho ${arg}.`);
      result[valueFlags.get(arg)] = argv[++i]; continue;
    }
    if (arg.startsWith('-')) throw new Error(`Tùy chọn không hợp lệ: ${arg}`);
    if (!result.input) result.input = arg;
    else throw new Error(`Chỉ nhận một file đầu vào: ${arg}`);
  }
  result.soMa = Number(result.soMa); result.maBatDau = Number(result.maBatDau);
  if (!Number.isInteger(result.soMa) || result.soMa < 1 || result.soMa > 999) throw new Error('--so-ma phải là số nguyên từ 1 đến 999.');
  if (!Number.isInteger(result.maBatDau)) throw new Error('--ma-bat-dau phải là số nguyên.');
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { help(); return; }
  if (!args.input) { help(); throw new Error('Chưa có file đề gốc.'); }
  const inputPath = resolve(args.input);
  const raw = await readFile(inputPath);
  const exam = extname(inputPath).toLowerCase() === '.docx' ? await docDeDocx(raw) : docDe(raw.toString('utf8'));
  if (!exam.questions.length) throw new Error(`Không đọc được câu hỏi. ${exam.warnings.join(' ')}`);
  const result = tronDe(exam, {soMa:args.soMa, maBatDau:args.maBatDau, seed:args.seed, canBang:args.canBang});
  const output = resolve(args.out);
  await mkdir(output, {recursive:true});
  const meta = {title:args.tieuDe, school:args.truong, duration:args.thoiGian};
  for (const version of result.versions) {
    await writeFile(join(output, `ma-${version.code}.html`), xuatHtml(version, meta));
    await writeFile(join(output, `ma-${version.code}.txt`), xuatText(version, meta));
  }
  await writeFile(join(output, 'dap-an.csv'), xuatCsv(result));
  await writeFile(join(output, 'bang-dap-an.html'), xuatBangDapAnHtml(result, meta));
  await writeFile(join(output, 'thong-tin.json'), JSON.stringify({seed:result.seed, soMa:result.versions.length, warnings:result.warnings}, null, 2) + '\n');
  console.log(`Đã tạo ${result.versions.length} mã đề trong ${output}`);
  console.log(`Seed: ${result.seed} · Số câu: ${exam.questions.length}`);
  for (const warning of result.warnings) console.warn(`Cảnh báo: ${warning}`);
}

main().catch((error) => { console.error(`Lỗi: ${error.message}`); process.exitCode = 1; });
