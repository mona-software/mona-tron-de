import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';

await mkdir('dist', {recursive:true});
const source = await readFile('src/index.ts', 'utf8');
const cli = await readFile('src/cli.ts', 'utf8');
const names = Array.from(source.matchAll(/^export (?:async )?function\s+(\w+)|^export const\s+(\w+)/gm), (match) => match[1] || match[2]);

await writeFile('dist/index.js', source);
await writeFile('dist/index.cjs', `'use strict';\n${source.replace(/^export /gm, '')}\nmodule.exports = { ${names.join(', ')} };\n`);
await writeFile('dist/browser.js', `// mona-tron-de v0.1.0 — browser IIFE\n(function(global){\n'use strict';\n${source.replace(/^export /gm, '')}\nglobal.MonaTronDe = { ${names.join(', ')} };\n})(typeof globalThis !== 'undefined' ? globalThis : window);\n`);
await writeFile('dist/index.d.ts', await readFile('src/index.d.ts', 'utf8'));
await writeFile('dist/cli.js', cli);
await chmod('dist/cli.js', 0o755);
console.log(`Đã build ESM, CJS, browser IIFE và khai báo kiểu (${names.length} exports).`);
