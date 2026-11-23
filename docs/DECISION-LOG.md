# Decision Log

## 2026-11-23 — Giữ hệ thống cũ, thêm vùng vận hành mới

PriceTrack hiện là Firebase/Gatsby JavaScript app phục vụ theo dõi URL công khai. Không ghi đè hoặc di chuyển toàn bộ code cũ ngay; thêm `apps/admin`, `packages/pricing-engine` và migration riêng để giảm rủi ro.

## 2026-11-23 — Pricing engine thuần và deterministic

Quyết định giá phải tái lập được, test được và giải thích được. LLM không tham gia vào mỗi lượt tính giá.

## 2026-11-23 — Monitor là mặc định

Mất dữ liệu, dữ liệu cũ, thiếu model, campaign xung đột hoặc chưa xác minh promotion đều dẫn đến giữ nguyên giá và ghi reason code.

## 2026-11-23 — Read-before-write và read-back bắt buộc

API nhận request thành công chưa chứng minh giá đã áp dụng. Worker phải đọc trạng thái trước ghi và đọc lại sau ghi.

## 2026-11-23 — Mock phải có nhãn

Khi chưa có credentials/link thật, dashboard dùng fixture có nhãn `mock`/`simulated`; không được hiển thị như dữ liệu Shopee production.
