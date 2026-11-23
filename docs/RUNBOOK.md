# Alpha Books Price Control — Runbook

## Dừng khẩn cấp

1. Tắt global auto switch.
2. Tắt từng SKU có vấn đề.
3. Không retry các request timeout cho tới khi đọc lại trạng thái Shopee.
4. Ghi lại `worker_run_id`, SKU, item/model, promotion và timestamp.

## Khi dữ liệu đối thủ lỗi

- Giữ nguyên giá.
- Đánh dấu observation stale/invalid.
- Không thay bằng `0`, `null` được hiểu là giá thấp nhất, hoặc giá listing không đúng model.
- Kiểm tra nguồn, HTTP status, challenge/CAPTCHA và thời điểm observation.

## Khi giá bị hệ thống khác ghi đè

- Đọc lại giá/promotion hiện tại.
- So sánh với snapshot decision.
- Không gửi lại mù quáng.
- Xác định hệ thống sở hữu quyền ghi (ví dụ Nhanh.vn) trước khi bật Auto.

## Khôi phục

- Review từng decision bị chặn.
- Không rollback hàng loạt bằng dữ liệu cũ nếu chưa xác minh giá hiện tại.
- Xuất lịch sử decision/execution để đối soát.

## Bí mật

Không dán token, partner key, refresh token hoặc file runtime config vào chat, frontend, log hay Git. Secret chỉ được nạp ở worker/server runtime.
