// รูปช่อดอกไม้ที่แนบมา ใช้ข้อมูลเดียวกันทั้งหน้าเว็บและเซิร์ฟเวอร์
// ใช้พาธแบบ relative เพื่อเปิดได้ทั้งในโฟลเดอร์และ GitHub Pages
const FLOWER_CATALOG_VERSION = 1;
const FLOWER_CATALOG = [
  {
    catalog_key: 'crimson-celebration', name: 'Crimson Celebration',
    category: 'ช่อดอกไม้', price: 0,
    description: 'ช่อดอกไม้โทนแดงและชมพู แซมดอกไม้สีขาว ห่อกระดาษสีแดงและดำ',
    image: 'images/crimson-celebration.webp', featured: false, active: true
  },
  {
    catalog_key: 'golden-sunshine', name: 'Golden Sunshine',
    category: 'ช่อดอกไม้', price: 0,
    description: 'ช่อกุหลาบสีเหลืองสดใส แซมดอกไม้สีขาว ห่อกระดาษสีขาวพร้อมริบบิ้นสีทอง',
    image: 'images/golden-sunshine.webp', featured: false, active: true
  },
  {
    catalog_key: 'modern-love-letter', name: 'Modern Love Letter',
    category: 'ช่อดอกไม้', price: 0,
    description: 'ช่อกุหลาบสีแดง ห่อกระดาษลายตัวอักษร ผูกริบบิ้นสีแดง',
    image: 'images/modern-love-letter.webp', featured: false, active: true
  },
  {
    catalog_key: 'pink-melody', name: 'Pink Melody',
    category: 'ช่อดอกไม้', price: 0,
    description: 'ช่อกุหลาบสีชมพูอ่อน แซมดอกไม้สีขาว ห่อกระดาษและริบบิ้นสีชมพู',
    image: 'images/pink-melody.webp', featured: false, active: true
  },
  {
    catalog_key: 'scarlet-passion', name: 'Scarlet Passion',
    category: 'ช่อดอกไม้', price: 0,
    description: 'ช่อกุหลาบสีแดง ห่อกระดาษสีขาว ตกแต่งด้วยริบบิ้นสีแดง',
    image: 'images/scarlet-passion.webp', featured: false, active: true
  },
  {
    catalog_key: 'soft-blossom', name: 'Soft Blossom',
    category: 'ช่อดอกไม้', price: 0,
    description: 'ช่อกุหลาบสีชมพู แซมดอกไม้สีขาวและใบไม้ ห่อกระดาษสีชมพูอ่อน',
    image: 'images/soft-blossom.webp', featured: false, active: true
  },
  {
    catalog_key: 'sunset-vibes', name: 'Sunset Vibes',
    category: 'ช่อดอกไม้', price: 0,
    description: 'ช่อดอกไม้หลากสี โทนเหลือง ส้ม และแดง ห่อกระดาษสีม่วงอ่อน',
    image: 'images/sunset-vibes.webp', featured: false, active: true
  },
  {
    catalog_key: 'velvet-romance', name: 'Velvet Romance',
    category: 'ช่อดอกไม้', price: 0,
    description: 'ช่อกุหลาบโทนม่วงอ่อน จัดเป็นทรงกลม ห่อกระดาษสีชมพู',
    image: 'images/velvet-romance.webp', featured: false, active: true
  }
];

// เซิร์ฟเวอร์ Node.js อ่านแค็ตตาล็อกชุดเดียวกับเบราว์เซอร์
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FLOWER_CATALOG_VERSION, FLOWER_CATALOG };
}
