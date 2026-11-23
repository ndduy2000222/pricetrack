export type RowStatus = 'within' | 'review' | 'blocked'

export type PriceRow = {
  id: string
  sku: string
  title: string
  author: string
  competitor: string
  competitorPrice: number
  currentPrice: number
  proposedPrice: number
  floorPrice: number
  ceilingPrice: number
  status: RowStatus
  updatedAt: string
  reason: string
}

export const priceRows: PriceRow[] = [
  { id: '1', sku: 'ABK0019', title: 'Đắc Nhân Tâm', author: 'Dale Carnegie', competitor: 'Tiki', competitorPrice: 72000, currentPrice: 79000, proposedPrice: 72000, floorPrice: 62000, ceilingPrice: 89000, status: 'within', updatedAt: '10:22 26/01', reason: '—' },
  { id: '2', sku: 'ABK0027', title: 'Nhà Giả Kim', author: 'Paulo Coelho', competitor: 'Fahasa', competitorPrice: 65000, currentPrice: 69000, proposedPrice: 65000, floorPrice: 55000, ceilingPrice: 79000, status: 'within', updatedAt: '10:21 26/01', reason: '—' },
  { id: '3', sku: 'ABK0034', title: 'Tư Duy Nhanh và Chậm', author: 'Daniel Kahneman', competitor: 'Tiki', competitorPrice: 149000, currentPrice: 159000, proposedPrice: 149000, floorPrice: 129000, ceilingPrice: 179000, status: 'review', updatedAt: '10:20 26/01', reason: 'Chênh lệch -6,3% so với đối thủ' },
  { id: '4', sku: 'ABK0041', title: 'Atomic Habits (Thói Quen Tí Hon)', author: 'James Clear', competitor: 'Shopee', competitorPrice: 136000, currentPrice: 149000, proposedPrice: 139000, floorPrice: 129000, ceilingPrice: 169000, status: 'review', updatedAt: '10:20 26/01', reason: 'Cạnh tranh mạnh (Shopee thấp hơn 8,7%)' },
  { id: '5', sku: 'ABK0056', title: 'Muôn Kiếp Nhân Sinh (Tập 1)', author: 'Nguyên Phong', competitor: 'Fahasa', competitorPrice: 92000, currentPrice: 99000, proposedPrice: 92000, floorPrice: 79000, ceilingPrice: 109000, status: 'within', updatedAt: '10:22 26/01', reason: '—' },
  { id: '6', sku: 'ABK0063', title: 'Sapiens: Lược Sử Loài Người', author: 'Yuval Noah Harari', competitor: 'Tiki', competitorPrice: 189000, currentPrice: 199000, proposedPrice: 189000, floorPrice: 169000, ceilingPrice: 229000, status: 'blocked', updatedAt: '10:18 26/01', reason: 'Đang khóa cập nhật: giá dưới mức sàn (169.000 ₫)' },
  { id: '7', sku: 'ABK0075', title: 'Đắm Bị Ghét', author: 'Ichiro Kishimi & Koga Fumitake', competitor: 'Shopee', competitorPrice: 78000, currentPrice: 85000, proposedPrice: 78000, floorPrice: 72000, ceilingPrice: 95000, status: 'within', updatedAt: '10:20 26/01', reason: '—' },
  { id: '8', sku: 'ABK0080', title: 'Ikigai: Đi Tìm Lý Do Thức Dậy Mỗi Sáng', author: 'Héctor García & Francesc Miralles', competitor: 'Lazada', competitorPrice: 88000, currentPrice: 95000, proposedPrice: 88000, floorPrice: 79000, ceilingPrice: 105000, status: 'review', updatedAt: '10:19 26/01', reason: 'Chênh lệch -7,4% so với đối thủ' },
  { id: '9', sku: 'ABK0091', title: 'Quảng Gánh Lo Đi và Vui Sống', author: 'Dale Carnegie', competitor: 'Tiki', competitorPrice: 59000, currentPrice: 65000, proposedPrice: 59000, floorPrice: 52000, ceilingPrice: 75000, status: 'within', updatedAt: '10:21 26/01', reason: '—' },
  { id: '10', sku: 'ABK0104', title: 'Điều Nhỏ Bé Kỳ Diệu', author: 'Héctor García', competitor: 'Fahasa', competitorPrice: 68000, currentPrice: 75000, proposedPrice: 68000, floorPrice: 59000, ceilingPrice: 85000, status: 'blocked', updatedAt: '10:17 26/01', reason: 'Tạm dừng cập nhật: đang rà soát biến động > 15% trong 1h' }
]

export const formatVnd = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} ₫`
