# Chính sách bảo mật

## Phiên bản được hỗ trợ

| Phiên bản | Hỗ trợ |
| --- | --- |
| `main` (mới nhất) | Có |
| Phiên bản cũ hơn | Không |

## Báo cáo lỗ hổng

**Không mở issue công khai cho lỗ hổng chưa được vá.**

1. Vào tab **Security** của repo → **Report a vulnerability** (private advisory).
2. Hoặc gửi email tới `kiritovn777@gmail.com`.

Vui lòng ghi rõ:

- commit hoặc phiên bản,
- các bước tái hiện,
- mức ảnh hưởng (rò rỉ proxy, ghi log mật khẩu, đọc/ghi file ngoài ý muốn, thực thi mã...).

Thời gian phản hồi dự kiến: trong vòng 7 ngày.

## Phạm vi

Trong phạm vi:

- rò rỉ thông tin xác thực proxy (mật khẩu bị ghi log hoặc bị commit),
- path traversal khi đọc/ghi profile, config, file proxy,
- chèn lệnh hoặc thực thi mã từ config / dữ liệu website,
- lỗi trong `src/`, script `.cmd`, test.

Ngoài phạm vi:

- proxy, website, dịch vụ bên thứ ba,
- cấu hình sai của người dùng (ví dụ tự đưa `proxies.txt` lên mạng),
- việc website chặn bằng captcha / Cloudflare / chặn IP.

## Nguyên tắc bảo mật của dự án

- Không commit `config.json`, `proxies.txt`, `data/`, `logs/` — đã có trong `.gitignore`.
- Mật khẩu proxy bị thay bằng `***` trong label và log.
- File proxy, profile, log chỉ đọc/ghi trong thư mục dự án.
- Chỉ dùng proxy và website mà bạn có quyền.
