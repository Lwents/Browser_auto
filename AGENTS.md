# AGENTS.md

## Bối cảnh
`D:\Browser_auto` — công cụ Node.js + Playwright mở nhiều cửa sổ Chromium, **mỗi cửa sổ một proxy riêng**, lướt báo / sản phẩm như người thật, hết `sessionMinutes` thì đóng, xoay proxy, mở lại.

Repo: https://github.com/Lwents/Browser_auto

## Cấu trúc
```text
src/index.js            CLI, khởi động, kiểm tra proxy, tổng kết
src/config.js           default + merge + validate config
src/logger.js           log console/file + JSONL
src/proxy/parse.js      parse host:port[:user:pass], user:pass@host:port, URL, direct
src/proxy/pool.js       check song song, geo ip-api, cooldown, acquire/release
src/browser/worker.js   vòng đời worker, launch context theo proxy, rotate
src/browser/fingerprint.js  UA/viewport/locale/timezone theo geo + init script
src/browser/human.js    chuột, cuộn, đọc, click link (verify + hit-test), dismissOverlays
src/browser/sites.js    flow news / shopping / generic
test/                   node:test (15 test)
SECURITY.md             chính sách báo cáo lỗ hổng
.gitattributes          chuẩn hóa LF, .cmd dùng CRLF
```

## Lệnh
```bat
npm install
npm test                          :: 15 test
npm start                         :: chạy theo config.json
npm run once                      :: mỗi worker 1 phiên
npm run check                     :: chỉ kiểm tra proxy
node src/index.js --config data/rotation-config.json --proxy-file data/proxy-mix.txt
Get-ChildItem src,test -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

## Quyết định quan trọng
- Playwright pin `1.65.0` để dùng Chromium `chromium-1254` đã cache (`C:\Users\Lwent\AppData\Local\ms-playwright`); mạng tải browser mới hay fail.
- Mỗi "tab" thực chất là **một browser context/window riêng** — Chromium không cho proxy riêng từng tab. Đã ghi rõ trong README.
- `profileMode: persistent` giữ cookie qua các lần xoay proxy; `ephemeral` tạo profile tạm.
- Proxy chết: retry `checkAttempts`, sau `maxFailures` thì cooldown `cooldownMinutes`.
- `dismissOverlays` chạy cả sau load lẫn trước khi click (TGDD chèn popup full-screen muộn).
- Click link phải: lọc link ngang, hit-test, verify URL đổi, news chỉ nhận URL dạng bài.

## Trạng thái
- Hoàn chỉnh, test pass, smoke test pass: direct, HTTP proxy thật, 2 worker, xoay proxy 2 chu kỳ, ephemeral, dead-proxy exit 1, shopping TGDD.
- README.md + AGENTS.md + SECURITY.md đã có; đã bật security policy để GitHub hết cảnh báo "No security policy detected".

## TODO / lưu ý
- Chưa có CI; chưa test trên Linux/macOS.
- SOCKS5 có auth có thể không chạy với Chromium → khuyến nghị HTTP proxy.
- Không giải captcha/Cloudflare.
- File local không commit: `config.json`, `proxies.txt`, `data/`, `logs/`.
- Không ghi proxy thật / mật khẩu vào README, AGENTS, commit.
