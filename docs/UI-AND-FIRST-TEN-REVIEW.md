# Workspace redesign and first-page discovery — 2026-11-27

## UI reference

- Reference: https://github.com/twentyhq/twenty (approximately 61.5k stars when checked). Stars indicate adoption, not an objective design ranking.
- A sparse reference checkout is in `C:/Users/Admin/Documents/ChatGPT/DUY/ui-references/twenty`.
- The application has an independently implemented workspace layout. No Twenty application source was copied into pricetrack and no claim of installing Twenty is made.
- New shell, navigation, compact metrics strip, toolbar, table, shop panel and connection-page appearance are in `market-workspace.css` and `price-control-dashboard.tsx`.
- Removed the demo section and its request from the dashboard. It no longer mixes unrelated demo books with the operating catalog.
- Default pagination is 10 SKUs. Missing competitor prices render as empty cells; only matched comparisons with a URL render a price. This does not mean an empty cell proves a shop does not stock a title.

## Discovery scope

The first 10 catalog SKUs observed in production (8 distinct title searches, including the combo and its individual variants):

| Own row key | SKU/variant | Title |
| --- | --- | --- |
| 10000729880:0 | 8935251416909 | Những Kẻ Xuất Chúng |
| 10083476974:0 | 8935251417609 | Sức Mạnh Của Tập Trung |
| 1018729662:0 | 8936066708227 | Phân Tích Chứng Khoán |
| 1018996338:7645630960 | 8935251400243 / Xanh | Israel Đã Kiến Tạo Tương Lai Như Thế Nào? |
| 1019536041:0 | 8935251419573 | Mưu Hèn Kế Bẩn Nơi Công Sở — Tập 2 |
| 10216330635:0 | 8935251418439 | Donald Trump — Chiến Lược Đầu Tư Bất Động Sản |
| 1028516826:0 | 8935251406276 | Tâm Lý Thị Trường Chứng Khoán |
| 10297680683:126792906433 | COMBO 2 CUỐN | Đắc Nhân Tâm + Quẳng Gánh Lo Đi Và Vui Sống |
| 10297680683:126792906434 | 8935270704704 / ĐẮC NHÂN TÂM | Same listing, individual variant |
| 10297680683:126792906435 | 8935086854747 / QUẲNG GÁNH LO ĐI | Same listing, individual variant |

Searched each title and both individual variants with each of the five exact shop names. Shop home pages were also inspected. Search coverage is not proof of an exhaustive search of every shop's private catalog.

## Candidate findings (excluded from live price calculations)

| Shop | Product URL | Observation and exclusion |
| --- | --- | --- |
| Trạm Đọc HCM | https://shopee.vn/product/1001400922/23870814358 | Những Kẻ Xuất Chúng, 2026, soft cover; visible description includes own SKU 8935251416909. Search index shows after-voucher price, crawled last week. Opening the live page showed product metadata but no price and redirected to CAPTCHA. No current pre-voucher price verified. |
| Omega Plus Books Store | https://shopee.vn/product/1690535378/48705640184 | Đắc Nhân Tâm; search index shows 73,100 VND promotion / 86,000 VND list, crawled last month. Not a new live observation; do not assign today's observedAt or use for current recommendations. |
| Nhà Sách Trạm Đọc | https://shopee.vn/product/408127245/13723957095 | Đắc Nhân Tâm Omega Plus; index explicitly says sold out. Excluded. |
| Read Station | https://shopee.vn/product/1059664593/22184230323 | Mưu Hèn Kế Bẩn combo/individual listing; indexed selected variant is volume 1 and price is after voucher. Cannot compare with own volume 2. |
| Read Station Bookstore | https://shopee.vn/product/1136807242/24674647647 | Mưu Hèn Kế Bẩn combo/volume 2 candidate; indexed price is after voucher. Exact target-shop identity and current pre-voucher price still require verification. |
| Read Station | https://shopee.vn/product/1059664593/27203397176 | Quẳng Gánh Lo, pocket edition, sold out and after-voucher price. Excluded. |

No new current matched competitor price was verified in this run. No candidate was imported as a live price. No Affiliate key was used. Required next step: user completes the Shopee CAPTCHA in the existing Chrome session, then resume live verification before saving offers.
