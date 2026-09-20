import type { Product, SareeTryOnAssets } from './types';
import { buildSareeSvg, toDataUri } from './svg';

/**
 * Standard anchor set for a 400x640 saree SVG. All sarees in this seed use
 * the same drape geometry, so they share this anchor definition. Real
 * catalogs would tune anchors per garment.
 *
 * All coordinates are in the [0..1] space of the garment image, matching
 * the contract in `SareeTryOnAssets.anchors`.
 */
const standardAnchors: SareeTryOnAssets['anchors'] = {
  shoulderLine: { left: [0.15, 0.093], right: [0.85, 0.093] },
  waist: { left: [0.10, 0.469], right: [0.90, 0.469] },
  hem: { left: [0.075, 0.968], right: [0.925, 0.968] },
};

/** Base URL for resized Unsplash catalog card images (600 wide, portrait crop). */
const U = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=600&auto=format&fit=crop&crop=top&q=80`;

interface SeedSpec {
  id: string;
  sku: string;
  name: string;
  price: number;
  fabric: string;
  brand: string;
  drapingStyle: SareeTryOnAssets['drapingStyle'];
  body: string;
  pallu: string;
  border: string;
  motif?: string;
  pattern: NonNullable<SareeTryOnAssets['kind'] | never> extends never ? never : 'dots' | 'stripes' | 'floral' | 'plain' | 'kalamkari' | 'zari';
  colorNames: [string, string, string];
  subcategory?: string;
  /** Unsplash photo URL shown in the catalog card. Falls back to SVG thumbnail if omitted. */
  photo?: string;
}

const specs: SeedSpec[] = [
  {
    id: 'sar_001',
    sku: 'KAN-RED-001',
    name: 'Kanjivaram Ruby Bloom',
    price: 24800,
    fabric: 'Silk',
    brand: 'Heritage Looms',
    drapingStyle: 'nivi',
    body: '#8b1e2e',
    pallu: '#b33951',
    border: '#f2c14e',
    motif: '#f6e2b3',
    pattern: 'floral',
    colorNames: ['Ruby', 'Rose', 'Gold'],
    subcategory: 'Kanjivaram',
    photo: U('1617627143750-d86bc21e42bb'),
  },
  {
    id: 'sar_002',
    sku: 'BAN-EMR-002',
    name: 'Banarasi Emerald Zari',
    price: 18990,
    fabric: 'Silk',
    brand: 'Varanasi Weavers',
    drapingStyle: 'nivi',
    body: '#0f5132',
    pallu: '#146c43',
    border: '#e0b437',
    motif: '#f4d35e',
    pattern: 'zari',
    colorNames: ['Emerald', 'Forest', 'Zari Gold'],
    subcategory: 'Banarasi',
    photo: U('1610189012906-4c0aa9b9781e'),
  },
  {
    id: 'sar_003',
    sku: 'CHT-INDGO-003',
    name: 'Chettinad Indigo Stripes',
    price: 4499,
    fabric: 'Cotton',
    brand: 'South Cotton Co.',
    drapingStyle: 'south',
    body: '#243b6b',
    pallu: '#3a5aa1',
    border: '#f2e1c1',
    motif: '#e8ecf1',
    pattern: 'stripes',
    colorNames: ['Indigo', 'Denim', 'Cream'],
    subcategory: 'Chettinad',
    photo: U('1630880276407-7e0c38d4df24'),
  },
  {
    id: 'sar_004',
    sku: 'KAL-PSTL-004',
    name: 'Kalamkari Coral Pastel',
    price: 6250,
    fabric: 'Cotton',
    brand: 'Andhra Kalamkari',
    drapingStyle: 'nivi',
    body: '#f5b7a1',
    pallu: '#e59866',
    border: '#7b3f00',
    motif: '#5d3413',
    pattern: 'kalamkari',
    colorNames: ['Coral', 'Peach', 'Earth'],
    subcategory: 'Kalamkari',
    photo: U('1678705730064-a7ecbab4b3fb'),
  },
  {
    id: 'sar_005',
    sku: 'MYS-MID-005',
    name: 'Mysore Midnight Crepe',
    price: 12990,
    fabric: 'Silk crepe',
    brand: 'Mysore Silks',
    drapingStyle: 'nivi',
    body: '#1c1f3a',
    pallu: '#2b2f5c',
    border: '#c9a227',
    motif: '#e6c85c',
    pattern: 'dots',
    colorNames: ['Midnight', 'Sapphire', 'Amber'],
    subcategory: 'Mysore',
    photo: U('1649793061426-b36b041ced21'),
  },
  {
    id: 'sar_006',
    sku: 'BEN-BLK-006',
    name: 'Bengali Ivory Baluchari',
    price: 15800,
    fabric: 'Tussar silk',
    brand: 'Bishnupur Studio',
    drapingStyle: 'bengali',
    body: '#efe6d0',
    pallu: '#a3121a',
    border: '#a3121a',
    motif: '#5c0f13',
    pattern: 'floral',
    colorNames: ['Ivory', 'Cherry', 'Wine'],
    subcategory: 'Baluchari',
    photo: U('1609748340041-f5d61e061ebc'),
  },
  {
    id: 'sar_007',
    sku: 'GUJ-BAND-007',
    name: 'Gujarati Bandhani Marigold',
    price: 7899,
    fabric: 'Georgette',
    brand: 'Kutch Bandhej',
    drapingStyle: 'gujarati',
    body: '#e58e2b',
    pallu: '#c0392b',
    border: '#4d1a0a',
    motif: '#ffffff',
    pattern: 'dots',
    colorNames: ['Marigold', 'Vermilion', 'Cocoa'],
    subcategory: 'Bandhani',
    photo: U('1614940685083-c5409b57da6e'),
  },
  {
    id: 'sar_008',
    sku: 'MAH-PAI-008',
    name: 'Maharashtrian Paithani Peacock',
    price: 21500,
    fabric: 'Silk',
    brand: 'Yeola Handlooms',
    drapingStyle: 'maharashtrian',
    body: '#0f766e',
    pallu: '#5b21b6',
    border: '#f59e0b',
    motif: '#fde68a',
    pattern: 'floral',
    colorNames: ['Teal', 'Violet', 'Turmeric'],
    subcategory: 'Paithani',
    photo: U('1641699862936-be9f49b1c38d'),
  },
  {
    id: 'sar_009',
    sku: 'LIN-MIN-009',
    name: 'Linen Minimalist Sand',
    price: 3450,
    fabric: 'Linen',
    brand: 'Everyday Drape',
    drapingStyle: 'nivi',
    body: '#d6c9a8',
    pallu: '#a49373',
    border: '#5a4a2c',
    motif: '#3b2f1b',
    pattern: 'plain',
    colorNames: ['Sand', 'Mocha', 'Chestnut'],
    subcategory: 'Linen',
    photo: U('1739429942851-9083ee185d3d'),
  },
  {
    id: 'sar_010',
    sku: 'ORG-PET-010',
    name: 'Organza Petal Pink',
    price: 9990,
    fabric: 'Organza',
    brand: 'Blossom Drape',
    drapingStyle: 'nivi',
    body: '#f7cad0',
    pallu: '#f28fa9',
    border: '#7d0633',
    motif: '#ffffff',
    pattern: 'floral',
    colorNames: ['Petal', 'Rose', 'Merlot'],
    subcategory: 'Organza',
    photo: U('1775486101623-3eb0f11d1e37'),
  },
];

function specToProduct(s: SeedSpec): Product {
  const svg = buildSareeSvg({
    bodyHex: s.body,
    palluHex: s.pallu,
    borderHex: s.border,
    motifHex: s.motif,
    patternKind: s.pattern,
  });
  const dataUri = toDataUri(svg);

  const tryOn: SareeTryOnAssets = {
    kind: 'saree',
    garment: { src: dataUri, width: 400, height: 640, alt: `${s.name} draped saree render` },
    pallu: { x: 0.15, y: 0.093, w: 0.35, h: 0.32 },
    border: { x: 0.075, y: 0.938, w: 0.85, h: 0.031 },
    primaryColors: [
      { hex: s.body, name: s.colorNames[0] },
      { hex: s.pallu, name: s.colorNames[1] },
      { hex: s.border, name: s.colorNames[2] },
    ],
    drapingStyle: s.drapingStyle,
    anchors: standardAnchors,
  };

  return {
    id: s.id,
    sku: s.sku,
    name: s.name,
    category: 'saree',
    subcategory: s.subcategory,
    price: s.price,
    currency: 'INR',
    brand: s.brand,
    colors: tryOn.primaryColors,
    fabric: s.fabric,
    images: s.photo
      ? [{ src: s.photo, width: 600, alt: `${s.name} — worn saree photo` }, tryOn.garment!]
      : [tryOn.garment!],
    tryOnAssets: tryOn,
    metadata: { seed: true },
  };
}

/**
 * Floral Chiffon Ivory — a real multi-part saree entry.
 *
 * Photo placement: put the actual saree photos at these paths under /public:
 *   public/images/sarees/sar_011/body.jpg    — flat-lay of full fabric (top view)
 *   public/images/sarees/sar_011/border.jpg  — top-border detail shot
 *   public/images/sarees/sar_011/pallu.jpg   — pallu panel detail
 *   public/images/sarees/sar_011/blouse.jpg  — blouse piece fabric
 *
 * Until those files exist the product falls back gracefully: the renderer
 * loads each image and skips any that fail, using the body image as fallback.
 */
const floralChiffonIvory: Product = {
  id: 'sar_011',
  sku: 'CHF-FLR-011',
  name: 'Floral Chiffon Ivory',
  category: 'saree',
  subcategory: 'Chiffon',
  price: 8499,
  currency: 'INR',
  brand: 'Garden Weaves',
  colors: [
    { hex: '#f5f0e8', name: 'Ivory' },
    { hex: '#d4847c', name: 'Dusty Rose' },
    { hex: '#c0a882', name: 'Silver Sequin' },
  ],
  fabric: 'Chiffon',
  images: [
    { src: '/images/sarees/sar_011/body.jpg', alt: 'Floral chiffon saree — full flat lay' },
    { src: '/images/sarees/sar_011/border.jpg', alt: 'Top-border detail with silver sequins' },
    { src: '/images/sarees/sar_011/pallu.jpg', alt: 'Pallu panel with floral print' },
    { src: '/images/sarees/sar_011/blouse.jpg', alt: 'Champagne silk blouse piece with white embroidery' },
  ],
  tryOnAssets: {
    kind: 'saree',
    parts: {
      body:   { src: '/images/sarees/sar_011/body.jpg',   alt: 'Floral chiffon body fabric' },
      border: { src: '/images/sarees/sar_011/border.jpg', alt: 'Silver sequin border strip' },
      pallu:  { src: '/images/sarees/sar_011/pallu.jpg',  alt: 'Floral pallu panel' },
      blouse: { src: '/images/sarees/sar_011/blouse.jpg', alt: 'Champagne silk blouse' },
    },
    primaryColors: [
      { hex: '#f5f0e8', name: 'Ivory' },
      { hex: '#d4847c', name: 'Dusty Rose' },
      { hex: '#c0a882', name: 'Silver Sequin' },
    ],
    drapingStyle: 'nivi',
    anchors: standardAnchors,
  },
  metadata: { seed: true, multiPart: true },
};

let cached: Product[] | null = null;

/** Deterministic, memoized product catalog. Safe to call anywhere. */
export function seedProducts(): Product[] {
  if (cached) return cached;
  cached = [...specs.map(specToProduct), floralChiffonIvory];
  return cached;
}
