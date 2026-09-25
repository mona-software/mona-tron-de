# Nhật ký chạy thử v0.1.0

Ngày chạy: 2026-09-25  
Node.js: v22.22.0

## Lệnh CLI theo brief

```bash
node dist/cli.js examples/vat-ly-10.txt \
  --so-ma 8 \
  --ma-bat-dau 101 \
  --out tron/ \
  --seed 7 \
  --tieu-de "Kiểm tra giữa kỳ I - Vật lý 10"
```

Kết quả:

```text
Đã tạo 8 mã đề trong ./tron
Seed: 7 · Số câu: 20
```

Các file sinh ra gồm `ma-101.html`…`ma-108.html`, tám file text tương ứng, `dap-an.csv`, `bang-dap-an.html` và `thong-tin.json`.

## Quality gate

Kết quả cuối:

```bash
npm run lint
npm run build
npm test
```

```text
Lint đạt: 3 file.
Đã build ESM, CJS, browser IIFE và khai báo kiểu (10 exports).
1..10
# tests 10
# pass 10
# fail 0
```
