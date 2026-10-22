/**
 * ====================================================================
 * CẤU HÌNH HÌNH ẢNH NỀN VÀ THÔNG SỐ HIỆU ỨNG NƯỚC (WATER CONFIGURATION)
 * ====================================================================
 * Bạn có thể dễ dàng thay thế URL hình ảnh nền (đáy hồ, cá, hồ sen...) 
 * ngay tại biến DEFAULT_BACKGROUND_URL bên dưới hoặc nhập trực tiếp từ giao diện.
 */

export interface PresetBackground {
  id: string;
  name: string;
  url: string;
  description: string;
}

// 1. URL HÌNH ẢNH NỀN MẶC ĐỊNH (Thay URL hình ảnh của bạn tại đây)
export const DEFAULT_BACKGROUND_URL = '/assets/aistudio/floor_soil_f1c93232.jpg';

// 2. URL BẢN ĐỒ TÁN XẠ CAUSTICS (Tạo vệt sáng dưới nước)
export const DEFAULT_CAUSTICS_URL = '/assets/aistudio/caustics_a3f84f5c.png';

// 3. DANH SÁCH HÌNH ẢNH NỀN MẪU CÓ SẴN
export const BACKGROUND_PRESETS: PresetBackground[] = [
  {
    id: 'user_soil',
    name: 'Đáy hồ tự nhiên (File của bạn)',
    url: '/assets/aistudio/floor_soil_f1c93232.jpg',
    description: 'Bề mặt đáy bùn cát tự nhiên với sỏi nhỏ ven hồ',
  },
  {
    id: 'procedural_river_pebbles',
    name: 'Suối sỏi cuội trong vắt',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><defs><radialGradient id="g1" cx="30%" cy="30%"><stop offset="0%" stop-color="%235a6b7c"/><stop offset="100%" stop-color="%23242f3d"/></radialGradient><radialGradient id="g2" cx="40%" cy="40%"><stop offset="0%" stop-color="%238a7b69"/><stop offset="100%" stop-color="%2343382c"/></radialGradient><radialGradient id="g3" cx="30%" cy="30%"><stop offset="0%" stop-color="%23687c64"/><stop offset="100%" stop-color="%23293826"/></radialGradient></defs><rect width="800" height="800" fill="%231e293b"/><circle cx="120" cy="180" r="95" fill="url(%23g1)"/><circle cx="340" cy="140" r="130" fill="url(%23g2)"/><circle cx="620" cy="220" r="110" fill="url(%23g3)"/><circle cx="200" cy="420" r="140" fill="url(%23g3)"/><circle cx="500" cy="460" r="160" fill="url(%23g1)"/><circle cx="680" cy="620" r="100" fill="url(%23g2)"/><circle cx="280" cy="680" r="120" fill="url(%23g1)"/><circle cx="100" cy="600" r="80" fill="url(%23g2)"/><circle cx="440" cy="280" r="85" fill="url(%23g1)"/></svg>',
    description: 'Những viên đá cuội sông suối được mài nhẵn tự nhiên',
  },
  {
    id: 'procedural_golden_sand',
    name: 'Cát vàng óng ả',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><defs><linearGradient id="sand" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%23c29b63"/><stop offset="50%" stop-color="%23ab844d"/><stop offset="100%" stop-color="%238a6635"/></linearGradient></defs><rect width="800" height="800" fill="url(%23sand)"/><circle cx="200" cy="250" r="18" fill="%236d522c" opacity="0.6"/><circle cx="520" cy="380" r="26" fill="%236d522c" opacity="0.5"/><circle cx="380" cy="600" r="15" fill="%236d522c" opacity="0.7"/><circle cx="650" cy="180" r="22" fill="%236d522c" opacity="0.6"/></svg>',
    description: 'Cát thạch anh lấp lánh dưới làn nước trong',
  },
  {
    id: 'procedural_deep_zen',
    name: 'Hồ đá đen Thiền Zen',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><defs><radialGradient id="zen" cx="50%" cy="50%"><stop offset="0%" stop-color="%231a232e"/><stop offset="100%" stop-color="%230b0f14"/></radialGradient></defs><rect width="800" height="800" fill="url(%23zen)"/><circle cx="220" cy="300" r="130" fill="%23151b22" stroke="%232d3748" stroke-width="2"/><circle cx="580" cy="450" r="160" fill="%2310151c" stroke="%232d3748" stroke-width="2"/><circle cx="400" cy="200" r="90" fill="%23151b22" stroke="%232d3748" stroke-width="2"/></svg>',
    description: 'Đá phiến đen tĩnh lặng phong cách Nhật Bản',
  },
];
