import { readFile } from 'node:fs/promises';
const files = ['src/index.ts', 'src/cli.ts', 'scripts/build.mjs'];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
for (const file of files) {
  const text = await readFile(file, 'utf8');
  if (/\t/.test(text)) throw new Error(`${file}: không dùng tab.`);
  if (/[ \t]+$/m.test(text)) throw new Error(`${file}: có khoảng trắng cuối dòng.`);
  new AsyncFunction(text.replace(/^#!.*\n/, '').replace(/^import .*$/gm, '').replace(/^export /gm, ''));
}
console.log(`Lint đạt: ${files.length} file.`);
