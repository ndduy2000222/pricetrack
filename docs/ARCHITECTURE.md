# Alpha Books Price Control — Architecture

## Nguyên tắc

- Giữ nguyên `functions/` và `hosting/` của PriceTrack cũ; không trộn dữ liệu công khai với dữ liệu vận hành nội bộ.
- Tách ba trách nhiệm: thu thập giá, tính quyết định, thực thi cập nhật.
- Quyết định giá là hàm xác định, không gọi LLM trong mỗi lượt chạy.
- Mọi đường ghi đều có dry-run, idempotency, re-check trước ghi và read-back sau ghi.
- Mặc định an toàn: Monitor, fail closed, giữ nguyên giá khi mất dữ liệu.

## Thành phần

```text
apps/admin (Next.js + TypeScript)
  ├─ server actions / route handlers
  ├─ Supabase browser/server clients
  └─ Monitor, Review queue, SKU detail, settings

packages/pricing-engine (pure TypeScript)
  ├─ normalize observations
  ├─ calculate proposal
  ├─ evaluate safety gates
  └─ produce immutable decision + reason codes

worker-functions (Node worker)
  ├─ scheduler
  ├─ competitor source adapters
  ├─ Shopee seller adapter (read-first, write gated)
  └─ execution lock + retry/read-back

Supabase/Postgres
  ├─ shops, shop_tokens
  ├─ own_products, own_models
  ├─ competitor_links, competitor_observations
  ├─ pricing_rules, pricing_decisions
  └─ execution_attempts, worker_runs
```

## Data boundaries

- Token và partner key chỉ nằm trong worker/server secret store; không có `NEXT_PUBLIC_` secret.
- `public` tables bật RLS. User ownership/organization scoping được kiểm tra ở policy, không chỉ ở UI.
- Competitor observation luôn có `source`, `observed_at`, `fresh_until`, `availability`, `item_id`, `model_id` và `raw_ref`.
- Decision lưu input snapshot để giải thích tại sao một giá được đề xuất hoặc bị chặn.

## Luồng Monitor

```text
worker tick
  → load active SKU + links
  → collect observations
  → persist observations
  → pricing-engine.calculate()
  → persist decision
  → if Monitor: stop
```

## Luồng Review/Auto

```text
approved decision / auto decision
  → acquire per-SKU lock
  → check global/SKU stop switch
  → read current Shopee promotion + model price
  → compare expected version/current price
  → execute one bounded write
  → read back and reconcile
  → persist attempt + outcome
```

## Ghi chú tích hợp Shopee

Shopee Open Platform cần app credentials, authorization code/access token và chữ ký request. Mốc đầu chỉ xây adapter contract và read-only path; endpoint cụ thể, quyền promotion và hạn mức phải được xác minh từ tài liệu/app thực tế trước khi bật write path.
