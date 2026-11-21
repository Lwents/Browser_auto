# Browser Auto

Công cụ mở nhiều cửa sổ trình duyệt, **mỗi cửa sổ dùng một proxy riêng**, tự động lướt báo / xem sản phẩm như người thật, hết thời gian thì đóng, **xoay sang proxy khác** rồi mở lại và lướt tiếp.

Dự án nằm tại `D:\Browser_auto`.

## Tính năng

- Mỗi worker là một cửa sổ Chromium riêng, có profile, cookie, user-agent, locale và proxy riêng.
- Chạy song song nhiều cửa sổ (`pool.concurrency`).
- Kiểm tra proxy trước khi chạy, tự đánh dấu proxy chết và cho proxy nghỉ (cooldown).
- Tự lấy quốc gia / múi giờ từ IP proxy để chỉnh locale, timezone cho tự nhiên.
- Hành vi giống người thật:
  - rê chuột ngẫu nhiên,
  - cuộn trang từng đoạn, thỉnh thoảng cuộn ngược,
  - dừng đọc 35–100 giây mỗi bài,
  - bấm link bài viết / sản phẩm ngẫu nhiên,
  - đọc bài liên quan, xem thêm sản phẩm,
  - nghỉ giữa các phiên.
- Tự đóng popup / overlay quảng cáo chặn thao tác.
- Hết `sessionMinutes` thì đóng trình duyệt, chọn proxy tiếp theo và bắt đầu phiên mới.
- Giữ profile/cookie giữa các phiên (có thể đổi sang profile tạm bằng `profileMode: "ephemeral"`).
- Log ra console và file, thống kê số phiên / trang / click / lỗi.

## Yêu cầu

- Windows 10/11 (code chạy được trên macOS/Linux, nhưng script `.cmd` chỉ dành cho Windows).
- Node.js >= 20.
- Kết nối mạng tới proxy và tới các website cần lướt.
- Proxy còn hạn, đúng định dạng.

## Cài đặt

```bat
cd /d D:\Browser_auto
npm install
npx playwright install chromium
```

Hoặc chạy `setup.cmd`.

Nếu mạng phải đi qua proxy, đặt biến môi trường `HTTP_PROXY` / `HTTPS_PROXY` trước khi cài Playwright.

## Bắt đầu nhanh

1. Mở `proxies.txt` và thêm proxy, mỗi dòng một proxy.
2. Mở `config.json` (tự sinh từ `config.example.json` ở lần chạy đầu) để chỉnh số cửa sổ, thời gian phiên, website.
3. Chạy:

```bat
npm start
```

Hoặc nhấp đôi `start.cmd`.

Kiểm tra proxy trước:

```bat
npm run check
```

Chạy thử 1 phiên mỗi worker rồi dừng:

```bat
npm run once
```

## Định dạng proxy

Mỗi dòng trong `proxies.txt`:

```text
host:port
host:port:user:pass
user:pass@host:port
http://user:pass@host:port
socks5://user:pass@host:port
socks5://host:port
direct
```

- `direct` = không dùng proxy, chỉ dùng để test.
- Dòng bắt đầu bằng `#` là ghi chú.
- Mật khẩu chứa `:` hoặc `@` vẫn được hỗ trợ.
- Nên có **số proxy >= số cửa sổ** để mỗi cửa sổ dùng một proxy khác nhau.
- Proxy xoay (rotating proxy) chỉ tính là 1 proxy; muốn nhiều IP cùng lúc thì thêm nhiều endpoint.

## Cấu hình chính (`config.json`)

### `browser`

| Khóa | Ý nghĩa |
|---|---|
| `headless` | `false` = hiện cửa sổ, `true` = chạy ẩn. |
| `profileMode` | `persistent` giữ cookie/profile; `ephemeral` tạo profile tạm mỗi phiên. |
| `profilesDir` | Nơi lưu profile trình duyệt. |
| `viewport` | Khoảng kích thước cửa sổ ngẫu nhiên. |
| `defaultLocale`, `defaultTimezone` | Dùng khi không xác định được quốc gia của proxy. |
| `closePopups` | Tự đóng tab popup. |
| `extraArgs` | Thêm tham số Chromium nếu cần. |

### `pool`

| Khóa | Ý nghĩa |
|---|---|
| `concurrency` | Số cửa sổ chạy song song. |
| `sessionMinutes` | Thời gian mỗi phiên (ngẫu nhiên trong khoảng). Hết giờ → xoay proxy. |
| `idleBetweenSessionsSeconds` | Nghỉ giữa các phiên. |
| `sitesPerSession` | Số website tối đa mỗi phiên. |
| `maxCyclesPerWorker` | `0` = chạy mãi; `1` = mỗi worker chạy 1 phiên. |
| `recentProxyMemory` | Không lặp lại proxy vừa dùng trong N lượt. |

### `proxy`

| Khóa | Ý nghĩa |
|---|---|
| `file` | File proxy, mặc định `proxies.txt`. |
| `checkOnStart` | Kiểm tra toàn bộ proxy khi khởi động. |
| `checkUrl` | URL dùng để test proxy (mặc định ipify). |
| `checkAttempts` | Số lần thử lại trước khi đánh dấu chết. |
| `maxFailures` | Số lần lỗi trước khi cho proxy nghỉ. |
| `cooldownMinutes` | Thời gian proxy nghỉ sau khi lỗi. |
| `geoLookup` | Lấy quốc gia / timezone từ IP qua ip-api.com. |

### `behavior`

| Khóa | Ý nghĩa |
|---|---|
| `clickLinkChance` | Xác suất bấm vào bài / sản phẩm. |
| `readSeconds` | Thời gian đọc một bài. |
| `shortReadSeconds` | Thời gian xem một sản phẩm / bài ngắn. |
| `idleBreakChance` | Xác suất nghỉ tại chỗ giữa các website. |
| `idleBreakSeconds` | Thời gian nghỉ tại chỗ. |
| `dismissOverlays` | Tự đóng popup / overlay. |

### `sites.categories`

Mỗi nhóm có:

```json
{
  "weight": 45,
  "behavior": "news",
  "sites": [
    { "name": "VnExpress", "url": "https://vnexpress.net/" }
  ]
}
```

- `behavior`: `news`, `shopping` hoặc `generic`.
- `weight`: trọng số chọn nhóm.
- `enabled: false`: tắt nhóm.
- Có thể thêm website bất kỳ; nên dùng trang chủ hoặc trang danh mục.

## Dòng lệnh

```text
node src/index.js [tùy chọn]

-c, --config <file>       File cấu hình
-w, --workers <n>         Số cửa sổ song song
    --session <a-b>       Thời gian phiên, phút (vd: 8-15)
    --sites <a-b>         Số website mỗi phiên
    --headless            Chạy ẩn
    --headed              Hiện cửa sổ
    --once                Mỗi worker chạy 1 phiên
    --check-proxies       Chỉ kiểm tra proxy
    --proxy-file <file>   File proxy khác
    --reset-profiles      Xóa profile/cookie cũ
    --debug               Log chi tiết
```

Ví dụ:

```bat
node src/index.js --workers 5 --session 10-20 --sites 3-6
node src/index.js --headless --workers 3
node src/index.js --check-proxies --proxy-file proxies-vn.txt
```

## Cách hoạt động

```text
main
 ├─ ProxyPool: nạp → kiểm tra → lấy IP/geo → cấp proxy
 ├─ Worker 1: profile w1 + proxy A → lướt 8-15 phút → đóng → proxy B → ...
 ├─ Worker 2: profile w2 + proxy B → lướt 8-15 phút → đóng → proxy C → ...
 └─ Worker 3: profile w3 + proxy C → lướt 8-15 phút → đóng → proxy A → ...
```

- **Mỗi cửa sổ là một browser context riêng**, không phải tab trong cùng một cửa sổ. Chromium không hỗ trợ proxy riêng cho từng tab; context/profile riêng là cách tách proxy đúng.
- Trong một cửa sổ có thể mở nhiều tab, nhưng các tab đó dùng chung proxy của cửa sổ.
- Worker chọn proxy theo kiểu ít dùng gần đây nhất, tránh lặp lại proxy vừa dùng.
- Hết phiên, worker đóng context (lưu cookie nếu persistent), nghỉ vài chục giây, lấy proxy khác rồi mở lại.
- Proxy lỗi liên tiếp sẽ bị cho nghỉ; hết thời gian nghỉ được thử lại.

## Log và thống kê

- `logs/activity-YYYY-MM-DD.log`: log chữ.
- `logs/events-YYYY-MM-DD.jsonl`: sự kiện JSON (kết thúc phiên, tổng kết).
- `data/profiles/w1`, `w2`, ...: profile trình duyệt.
- `data/workers/w1.json`: fingerprint (user-agent, viewport) của từng worker.

Xóa profile cũ:

```bat
node src/index.js --reset-profiles
```

## Lưu ý

- Công cụ **không giải captcha**, không vượt qua cơ chế chống bot chuyên sâu. Website có Cloudflare / captcha / chặn datacenter proxy có thể vẫn chặn.
- Nên dùng proxy dân cư (residential) hoặc proxy tĩnh chất lượng nếu muốn lướt ổn định.
- Chạy headed (`headless: false`) thường dễ qua kiểm tra hơn headless.
- Mỗi cửa sổ Chromium tốn khá nhiều RAM; giảm `concurrency` nếu máy yếu.
- SOCKS5 có username/password có thể không được Chromium hỗ trợ đầy đủ; nếu lỗi, dùng HTTP proxy.
- Chỉ dùng proxy mà bạn có quyền sử dụng. Tuân thủ điều khoản của website và pháp luật; không dùng để spam, gian lận hoặc tấn công.

## Xử lý sự cố

| Lỗi | Cách xử lý |
|---|---|
| `Executable doesn't exist` | Chạy `npx playwright install chromium` hoặc `setup.cmd`. |
| `Không có proxy nào sống` | Kiểm tra mạng, định dạng proxy, chạy `npm run check`. |
| Proxy auth fail | Kiểm tra user/pass; thử `http://user:pass@host:port`. |
| Trình duyệt không mở | Chạy `--headed`, xem log, kiểm tra firewall. |
| Profile bị khóa | Đóng các cửa sổ Chrome/Chromium còn sót, chạy `--reset-profiles`. |
| Website chặn | Đổi proxy, giảm concurrency, chạy headed, tăng thời gian đọc. |
| Tốn RAM | Giảm `--workers`, dùng `profileMode: "ephemeral"`. |

## Cấu trúc dự án

```text
src/
  index.js              CLI, khởi động, dừng, tổng kết
  config.js             đọc/merge/validate config
  logger.js             log console + file + JSONL
  proxy/
    parse.js            parse nhiều định dạng proxy
    pool.js             kiểm tra, geo, cooldown, cấp proxy
  browser/
    worker.js           vòng đời worker + phiên + xoay proxy
    fingerprint.js      UA, viewport, locale, timezone, init script
    human.js            chuột, cuộn, đọc, click, đóng overlay
    sites.js            hành vi news / shopping / generic
test/                   unit test
config.example.json     cấu hình mẫu
proxies.example.txt     định dạng proxy mẫu
start.cmd / setup.cmd   tiện ích Windows
```

## Kiểm thử

```bat
npm test
```

## Giấy phép

MIT.
