# Alpha Books Price Control

## Phạm vi đã triển khai

- Đọc danh sách sản phẩm của shop qua Shopee Open API, phân trang theo `next_offset` và lấy tối đa 100 sản phẩm mỗi trang.
- Đọc thông tin cơ bản theo lô tối đa 50 `item_id`, sau đó đọc model/SKU và giá/tồn kho từng sản phẩm có biến thể.
- Xuất catalog ra JSON, CSV và XLSX qua `/api/catalog`.
- Phân tích giá qua `/api/price-review`, có bộ lọc/bảng trên dashboard và xuất CSV/XLSX.
- Chỉ đọc, đối chiếu và đề xuất. Không có route cập nhật giá Shopee; `writesEnabled` luôn là `false`.
- Token refresh được mã hóa AES-256-GCM khi Supabase và khóa mã hóa đã được cấu hình. Access token/refresh token không được đưa vào URL, log, file xuất hay UI.

## Những trường Shopee không bảo đảm cung cấp

API có thể trả tên, SKU, item/model ID, giá, tồn kho, trạng thái, điều kiện và các attribute được shop khai báo. ISBN/EAN, tác giả, nhà xuất bản, ấn bản, loại bìa, số tập và quy cách combo không phải trường bắt buộc/chuẩn chung của catalog Shopee. Ứng dụng chỉ đọc các attribute khớp tên; nếu không có thì ghi vào `unsupportedFields` và để trống, không suy đoán từ tên sách.

## Nguồn dữ liệu đối thủ

Shopee Open API shop-level đang dùng trong ứng dụng chỉ phục vụ catalog và giá của shop Alpha Books. Không coi endpoint đó là API tìm giá của shop khác. Bộ phân tích nhận tối đa 5 feed đối thủ đã được người quản trị phê duyệt qua `SHOPEE_COMPETITOR_FEED_URL_1` tới `_5` (vẫn hỗ trợ biến cũ `SHOPEE_COMPETITOR_FEED_URL`) và chỉ bật khi `SHOPEE_COMPETITOR_SOURCE_APPROVED=true`. Feed có thể do một scraper/worker được phép vận hành, nhưng Price Control chỉ nhận JSON đã chuẩn hóa; không tự vượt CAPTCHA, không dùng proxy né chặn và không đưa scraper chạy trong request Vercel.

Feed phải cung cấp tối thiểu: `isbn` hoặc `ean` nếu có, tên, tác giả, nhà xuất bản, ấn bản, loại bìa, số tập/combo, trạng thái còn hàng, điều kiện hàng, shop, giá niêm yết, giá khuyến mãi, phí vận chuyển, voucher có áp dụng đại trà, link Shopee và `observedAt`. Không có feed hợp lệ thì hệ thống không tự cào trang Shopee và không tạo đề xuất cạnh tranh.

## Quy tắc ghép và đề xuất

1. Ưu tiên ISBN/EAN chính xác.
2. Nếu không có ISBN/EAN, yêu cầu tên và các thuộc tính sách phù hợp: tác giả, nhà xuất bản, ấn bản, loại bìa, số tập/combo.
3. Loại hàng hết, hàng cũ, biến thể khác, dữ liệu quá cũ và kết quả không đủ tin cậy.
4. Hiển thị riêng giá niêm yết, giá khuyến mãi, phí vận chuyển và voucher; không trộn biến thể.
5. Giá mục tiêu mặc định thấp hơn đối thủ hợp lệ rẻ nhất theo buffer cấu hình được.
6. Giá sàn tính từ giá vốn, phí sàn, chi phí vận hành và biên lợi nhuận tối thiểu. Thiếu một dữ liệu thì chỉ mô phỏng và ghi `chưa đủ dữ liệu để quyết định`.

## Đầu vào kinh doanh cần cung cấp

- Giá vốn theo từng SKU: `PRICE_COSTS_JSON`.
- Phí sàn phần trăm: `PRICE_PLATFORM_FEE_PERCENT`.
- Chi phí vận hành trên đơn: `PRICE_OPERATION_COST_VND`.
- Lợi nhuận tối thiểu: `PRICE_MIN_MARGIN_VND`.
- Mức thấp hơn đối thủ: `PRICE_BUFFER_AMOUNT_VND` hoặc `PRICE_BUFFER_PERCENT`.
- Tuổi tối đa của quan sát đối thủ: `PRICE_COMPETITOR_MAX_AGE_MINUTES`.
- Quy tắc áp dụng phí vận chuyển/voucher cho người mua phổ thông.

Không có số liệu mặc định về giá vốn, phí, biên lợi nhuận hoặc mức giảm trong code.

## Giai đoạn kiểm thử và mở rộng

- Kiểm thử logic: sách đơn, nhiều model, combo và không có đối thủ.
- Kiểm thử live: đồng bộ thử một trang, đối chiếu thủ công vài link Shopee, kiểm tra quan sát giá và trạng thái token.
- Mở rộng toàn shop sau khi Product Management permission và endpoint `get_item_list` hoạt động ổn định.
- Theo dõi số SKU đồng bộ, số ghép chắc chắn, số cần duyệt, trường thiếu, tuổi dữ liệu và giới hạn/rate limit API.

## Việc cần làm ở môi trường production

1. Áp dụng migration `supabase/migrations/202611230002_shopee_token_credentials.sql`.
2. Cấu hình `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` và `SHOPEE_TOKEN_ENCRYPTION_KEY` trên Vercel.
3. Lưu `SHOPEE_REFRESH_TOKEN` một lần từ luồng OAuth hiện tại; sau đó kiểm tra `/api/shopee/token-status` chỉ để xem trạng thái an toàn.
4. Bảo đảm app Shopee được cấp Product Management permission. Nếu `get_item_list` vẫn bị từ chối, phải cấp quyền lại/re-authorize một lần; không đổi sang nguồn không được phép.
5. Chỉ bật competitor feed sau khi xác nhận quyền sử dụng, schema, tần suất cập nhật và điều khoản của nguồn.

Tài liệu tham chiếu API: [Shopee get_item_list](https://open.shopee.com/documents/v2/v2.product.get_item_list?module=89&type=1) và [schema get_item_list](https://raw.githubusercontent.com/congminh1254/shopee-sdk/main/schemas/v2.product.get_item_list.json).
