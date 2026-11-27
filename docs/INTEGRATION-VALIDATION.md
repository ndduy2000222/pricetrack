# Integration Validation

## Trạng thái ngày 2026-11-23

| Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Repo PriceTrack | Đã khảo sát | Firebase Functions + Gatsby + Firestore; có scraper Shopee cũ |
| Shopee seller authorization | Chưa xác minh | Chưa có app status, partner credentials hoặc shop authorization |
| Đọc item/model của shop mình | Chưa chạy thật | Cần shop_id/access token và quyền product |
| Đọc promotion/discount | Chưa chạy thật | Cần xác minh quyền và endpoint hiện hành trong app |
| Ghi promotion | Chưa chạy | Bị khóa theo yêu cầu an toàn |
| Giá đối thủ | Chưa chạy | Chưa có 10 URL được chủ dự án cung cấp |
| Đọc giá SKU shop mình | Đã có client read-only | `get_model_list` + HMAC signature; cần credentials để chạy thật |
| Dashboard live polling | Đã có | `/api/sku-prices`, refresh 30 giây; không phải WebSocket |
| CAPTCHA/access controls | Không vượt | Nếu nguồn bị chặn, phải đổi nguồn hoặc dùng người hỗ trợ |

## Nguồn đã kiểm tra

- [Shopee Open Platform API reference](https://open.shopee.com/documents/v2/api-reference)
- [Shopee Open Platform documents](https://open.shopee.com/documents)
- [Product item list reference](https://open.shopee.com/documents/v2/v2.product.get_item_list?module=89&type=1)
- [Discount reference](https://open.shopee.com/documents/v2/v2.discount.get_discount?module=99&type=1)

Portal Open Platform trả 403 khi truy cập tự động trong môi trường khảo sát, vì vậy không được coi snippet tìm kiếm hay SDK cộng đồng là bằng chứng đủ cho production. Khi có quyền truy cập app, cần lưu request/response đã che bí mật vào run artifact.

Client hiện dùng endpoint shop-level `GET /api/v2/product/get_model_list` để đọc `current_price` theo `item_id` và lọc `model_id`. Secret chỉ được đọc ở server/worker qua `SHOPEE_PARTNER_KEY`, `SHOPEE_ACCESS_TOKEN`; tuyệt đối không đặt các biến này dưới tiền tố `NEXT_PUBLIC_`.

## Gate để bật write

1. App được Shopee phê duyệt đúng quyền.
2. Đọc thành công shop/item/model/promotion.
3. Hiển thị cho chủ dự án shop, SKU, promotion, giá hiện tại và giá sẽ đổi.
4. Chủ dự án duyệt một SKU cụ thể.
5. Ghi một lần với idempotency key.
6. Đọc lại xác nhận giá/promotion sau ghi.
7. Chạy lại timeout/retry test mà không tạo duplicate write.
8. Chỉ sau đó mới cân nhắc Auto cho nhóm SKU nhỏ.
