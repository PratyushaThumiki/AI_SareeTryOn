/**
 * Build a stylized SVG for a saree using a simple body/pallu/border palette.
 *
 * The SVG is designed so its coordinate system matches the anchor spec in
 * `SareeTryOnAssets.anchors` — width 400, height 640. The garment renderer
 * uses the anchors to warp this SVG onto the wearer's shoulders/waist/hem,
 * so keep the anchor rectangle stable.
 *
 * We generate an SVG rather than shipping PNGs so the whole demo works
 * with zero external network requests. In production, replace this with
 * real transparent PNGs or high-res assets from the retailer's CDN.
 */
export interface SareeSvgSpec {
  bodyHex: string;
  palluHex: string;
  borderHex: string;
  motifHex?: string;
  patternKind?: 'dots' | 'stripes' | 'floral' | 'plain' | 'kalamkari' | 'zari';
}

function motifPattern(id: string, motif: string, kind: SareeSvgSpec['patternKind']) {
  switch (kind) {
    case 'dots':
      return `<pattern id="${id}" width="18" height="18" patternUnits="userSpaceOnUse">
        <circle cx="9" cy="9" r="2.2" fill="${motif}" opacity="0.75"/>
      </pattern>`;
    case 'stripes':
      return `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
        <line x1="0" y1="0" x2="0" y2="12" stroke="${motif}" stroke-width="2" opacity="0.6"/>
      </pattern>`;
    case 'floral':
      return `<pattern id="${id}" width="40" height="40" patternUnits="userSpaceOnUse">
        <g fill="${motif}" opacity="0.75">
          <circle cx="20" cy="20" r="3"/>
          <circle cx="8" cy="12" r="1.6"/>
          <circle cx="32" cy="12" r="1.6"/>
          <circle cx="8" cy="28" r="1.6"/>
          <circle cx="32" cy="28" r="1.6"/>
        </g>
      </pattern>`;
    case 'zari':
      return `<pattern id="${id}" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <path d="M0,0 L20,20 M10,-5 L30,15" stroke="${motif}" stroke-width="1" opacity="0.5"/>
      </pattern>`;
    case 'kalamkari':
      return `<pattern id="${id}" width="60" height="60" patternUnits="userSpaceOnUse">
        <g fill="none" stroke="${motif}" stroke-width="1.2" opacity="0.6">
          <path d="M10,30 Q30,5 50,30 Q30,55 10,30 Z"/>
          <circle cx="30" cy="30" r="4"/>
        </g>
      </pattern>`;
    default:
      return `<pattern id="${id}" width="1" height="1"><rect width="1" height="1" fill="transparent"/></pattern>`;
  }
}

export function buildSareeSvg(spec: SareeSvgSpec): string {
  const w = 400;
  const h = 640;
  const patternId = `p-${Math.random().toString(36).slice(2, 8)}`;
  const motif = spec.motifHex ?? '#ffffff';

  // The garment shape: a trapezoidal drape narrowing at the waist and
  // flaring at the hem, plus a pallu ribbon over the left shoulder.
  // Bounding box matches (0,0)..(w,h). Anchors defined in seed data must
  // stay in the [0..1] space of this box.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    ${motifPattern(patternId, motif, spec.patternKind ?? 'plain')}
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.28"/>
    </linearGradient>
  </defs>

  <!-- Body of the saree: shoulders to hem -->
  <path d="M60,60 L340,60 L370,620 L30,620 Z" fill="${spec.bodyHex}"/>
  <path d="M60,60 L340,60 L370,620 L30,620 Z" fill="url(#${patternId})"/>
  <path d="M60,60 L340,60 L370,620 L30,620 Z" fill="url(#shade)"/>

  <!-- Border along the hem -->
  <rect x="30" y="600" width="340" height="20" fill="${spec.borderHex}"/>
  <rect x="30" y="596" width="340" height="4" fill="${motif}" opacity="0.7"/>

  <!-- Pallu draped over the left shoulder -->
  <path d="M60,60 L200,60 L180,260 L40,320 Z" fill="${spec.palluHex}"/>
  <path d="M60,60 L200,60 L180,260 L40,320 Z" fill="url(#${patternId})" opacity="0.9"/>
  <path d="M60,60 L200,60 L200,72 L60,72 Z" fill="${spec.borderHex}"/>

  <!-- Waist tuck highlight -->
  <path d="M40,300 L360,300 L365,320 L35,320 Z" fill="${spec.borderHex}" opacity="0.55"/>
</svg>`;
}

export function toDataUri(svg: string): string {
  // encodeURIComponent produces valid URL-safe content, and keeps the SVG
  // human-readable in devtools. Not base64: the output is smaller for
  // hand-drawn SVGs and does not require btoa/Buffer plumbing.
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
