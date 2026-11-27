# Alpha Books Price Control — PRD

## Mục tiêu

Xây công cụ nội bộ để Alpha Books theo dõi giá theo đúng phân loại sản phẩm, tính giá cạnh tranh trong giới hạn lợi nhuận, và chỉ thực thi thay đổi khi có đủ dữ liệu và quyền rõ ràng.

## Phạm vi MVP

- Một shop Shopee.
- Tối đa 20 SKU thử nghiệm.
- Mỗi SKU tối đa 3 đối thủ, ghép thủ công tới đúng item/model.
- Giá tham chiếu là giá sau giảm trực tiếp của đúng model, không tính voucher cá nhân, xu, phí vận chuyển hoặc giá livestream.
- Ba chế độ: Monitor (mặc định), Review, Auto.
- Có giá sàn/trần, quy tắc giảm theo tiền hoặc phần trăm, làm tròn, khoảng nghỉ và giới hạn biến động.
- Có lịch sử dữ liệu, quyết định và kết quả thực thi.
- Worker chạy độc lập với trình duyệt.

## Ngoài phạm vi MVP

- Tự động khám phá đối thủ.
- Tự động vượt CAPTCHA hoặc cơ chế kiểm soát truy cập.
- Tối ưu lợi nhuận bằng mô hình ML/LLM.
- Voucher cá nhân, xu, phí vận chuyển, livestream và campaign chưa xác minh.
- Cập nhật hàng loạt trước khi có thử nghiệm ghi/đọc lại trên một SKU được cho phép.

## Quy tắc giá

Với các đối thủ hợp lệ còn hàng và dữ liệu chưa quá cũ:

```text
reference = min(valid_competitor_prices)
money_target = reference - delta_amount
percent_target = reference * (1 - delta_percent)
candidate = rule.mode == "amount" ? money_target : percent_target
proposal = round_then_clamp(candidate, floor_price, ceiling_price)
```

Không được cập nhật khi thiếu model, dữ liệu cũ/bất thường, SKU bị dừng, promotion không tương thích, chưa hết cooldown, vượt giới hạn ngày hoặc đề xuất không còn hợp lệ.

Nếu giá sàn làm mất mức chênh mục tiêu, phải ghi rõ lý do thay vì cố giảm tiếp.

## Điều kiện nghiệm thu mốc đầu

- Logic giá có test cho tiền, phần trăm, sàn/trần, làm tròn, dữ liệu cũ, hết hàng, tăng giá và cooldown.
- Monitor chỉ đọc và không tạo lệnh ghi.
- Review chỉ chạy proposal còn hạn và đã duyệt.
- Auto chỉ chạy khi bật rõ ràng.
- Mỗi quyết định lưu được giá trước/sau, nguồn tham chiếu, phiên bản rule, thời gian và lý do.
- Dashboard hiển thị trạng thái worker và phân biệt dữ liệu thật/mock.

## Thông tin cần chủ dự án cung cấp ở mốc tích hợp

1. Khoảng 10 URL sản phẩm Shopee Việt Nam để kiểm chứng nguồn giá.
2. Shop Alpha Books, item/model dùng cho lần đọc dữ liệu đầu tiên.
3. Trạng thái app Shopee Open Platform, quyền được cấp và môi trường sandbox/production.
4. Hệ thống khác đang đồng bộ giá lên Shopee (ví dụ Nhanh.vn) và quy tắc ưu tiên khi xung đột.
