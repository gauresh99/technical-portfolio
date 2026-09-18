// Local warranty document parser — no API calls.
// PDFs: pdfjs-dist text layer extraction.
// Images (digital copies, screenshots): tesseract.js OCR.
// Camera scans of physical docs: caller skips parsing, goes to manual entry.

export type ParsedWarranty = {
  name: string | null;
  brand: string | null;
  warrantyEnd: string | null;
  warrantyStart: string | null;
};

// ─────────────────────────────────────────────────────────────
// DATE UTILITIES
// ─────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan: '01', january: '01', feb: '02', february: '02',
  mar: '03', march: '03', apr: '04', april: '04',
  may: '05', jun: '06', june: '06', jul: '07', july: '07',
  aug: '08', august: '08', sep: '09', sept: '09', september: '09',
  oct: '10', october: '10', nov: '11', november: '11',
  dec: '12', december: '12',
};

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function extractDate(snippet: string): string | null {
  let m: RegExpMatchArray | null;

  // YYYY-MM-DD or YYYY/MM/DD
  m = snippet.match(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  m = snippet.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](20\d{2})\b/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  // "18 Dec 2026" or "18th December 2026"
  m = snippet.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(20\d{2})\b/);
  if (m) {
    const mo = MONTH_MAP[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2, '0')}`;
  }

  // "Dec 18, 2026" or "December 18 2026"
  m = snippet.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(20\d{2})\b/);
  if (m) {
    const mo = MONTH_MAP[m[1].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[2].padStart(2, '0')}`;
  }

  return null;
}

function firstDateAfterKeyword(text: string, kwIdx: number): string | null {
  return extractDate(text.substring(kwIdx, kwIdx + 180));
}

// ─────────────────────────────────────────────────────────────
// BRAND LIST
// ─────────────────────────────────────────────────────────────

const BRANDS = [
  'Western Digital', 'Eureka Forbes', 'Sennheiser', 'Mitsubishi', 'Portronics',
  'OnePlus', 'Motorola', 'Panasonic', 'Microsoft', 'Logitech', 'Fujifilm',
  'Corsair', 'Samsung', 'Philips', 'Whirlpool', 'Micromax', 'Zebronics',
  'Toshiba', 'Seagate', 'Kingston', 'Crucial', 'SanDisk', 'Olympus',
  'Huawei', 'Realme', 'Xiaomi', 'Redmi', 'Apple', 'Lenovo', 'Google',
  'Canon', 'Nikon', 'Havells', 'Godrej', 'Voltas', 'Daikin', 'Hitachi',
  'Prestige', 'Pigeon', 'Syska', 'Epson', 'Brother', 'Intex', 'Nokia',
  'Bajaj', 'Bosch', 'Haier', 'Honor', 'iRobot', 'NVIDIA', 'Razer',
  'Dyson', 'Intel', 'GoPro', 'Bose', 'Boat', 'Dell', 'Oppo', 'Sony',
  'Asus', 'Acer', 'Vivo', 'DJI', 'AMD', 'JBL', 'LG', 'HP',
];

// ─────────────────────────────────────────────────────────────
// TEXT → FIELDS
// ─────────────────────────────────────────────────────────────

function parseWarrantyText(text: string): ParsedWarranty {
  const lc = text.toLowerCase();

  // ── Expiry date ──────────────────────────────────────────
  let warrantyEnd: string | null = null;
  const expiryKws = [
    'valid until', 'valid till', 'valid upto', 'valid up to', 'valid through',
    'warranty expir', 'warranty end', 'expiry date', 'expiration date',
    'coverage expires', 'valid to:', 'till date', 'warranty valid up to',
    'warranty date', 'end date',
  ];
  for (const kw of expiryKws) {
    const idx = lc.indexOf(kw);
    if (idx !== -1) {
      warrantyEnd = firstDateAfterKeyword(text, idx);
      if (warrantyEnd) break;
    }
  }

  // ── Purchase / start date ────────────────────────────────
  let warrantyStart: string | null = null;
  const startKws = [
    'purchase date', 'date of purchase', 'invoice date', 'bill date',
    'order date', 'transaction date', 'date of sale', 'sold on', 'bought on',
    'sale date', 'purchase on',
  ];
  for (const kw of startKws) {
    const idx = lc.indexOf(kw);
    if (idx !== -1) {
      warrantyStart = firstDateAfterKeyword(text, idx);
      if (warrantyStart) break;
    }
  }

  // ── Infer expiry from purchase date + warranty period ────
  if (!warrantyEnd && warrantyStart) {
    const yearMatch =
      text.match(/\b(\d+)\s*-?\s*years?\s+warranty\b/i) ||
      text.match(/warranty\s*period[:\s]+(\d+)\s*year/i);
    const monthMatch =
      text.match(/\b(\d+)\s*-?\s*months?\s+warranty\b/i) ||
      text.match(/warranty\s*period[:\s]+(\d+)\s*month/i);

    const start = new Date(`${warrantyStart}T00:00:00`);
    if (Number.isFinite(start.getTime())) {
      if (yearMatch) {
        start.setFullYear(start.getFullYear() + parseInt(yearMatch[1], 10));
        warrantyEnd = toISO(start);
      } else if (monthMatch) {
        start.setMonth(start.getMonth() + parseInt(monthMatch[1], 10));
        warrantyEnd = toISO(start);
      }
    }
  }

  // ── Brand ────────────────────────────────────────────────
  let brand: string | null = null;
  // Explicit label first
  const brandLabel = text.match(
    /(?:Brand|Manufacturer|Make|Sold[\s]by|Vendor|Mfr\.?)[\s:]+([A-Za-z][A-Za-z0-9\s.&-]{1,28}?)(?:\n|$|,|\s{2,})/im,
  );
  if (brandLabel) {
    brand = brandLabel[1].trim();
  } else {
    // Longest-match scan (prevents "LG" matching inside "Logitech")
    for (const b of BRANDS) {
      const re = new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(text)) { brand = b; break; }
    }
  }

  // ── Product name ─────────────────────────────────────────
  let name: string | null = null;
  // Explicit label
  const nameLabel = text.match(
    /(?:Product[\s]*(?:Name|Description)?|Item(?:[\s]Name)?|Device|Model(?:[\s]Name)?)[\s:]+([A-Za-z0-9][^\n,]{4,80}?)(?:\n|$)/im,
  );
  if (nameLabel) {
    name = nameLabel[1].trim().replace(/\s+/g, ' ');
  }
  // Fallback: line containing brand + a model-number-like token
  if (!name && brand) {
    const re = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const modelToken = /[A-Z]\d|\d[A-Z]|\b[A-Z]{2,}\d|\b\d{3,}/;
    for (const line of text.split('\n').map(l => l.trim())) {
      if (line.length > 4 && line.length < 100 && re.test(line) && modelToken.test(line)) {
        name = line.replace(/\s+/g, ' ');
        break;
      }
    }
  }

  return { name, brand, warrantyEnd, warrantyStart };
}

// ─────────────────────────────────────────────────────────────
// PDF TEXT EXTRACTION (pdfjs-dist, runs in browser only)
// ─────────────────────────────────────────────────────────────

async function extractTextFromPdf(uri: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // Load worker from CDN to avoid bundler complexity
  (pdfjs as any).GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${(pdfjs as any).version}/build/pdf.worker.min.js`;

  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const pdf = await (pdfjs as any).getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = (content.items as any[])
      .filter((item: any) => 'str' in item)
      .map((item: any) => (item.str as string))
      .join(' ');
    pages.push(pageText);
  }
  return pages.join('\n');
}

// ─────────────────────────────────────────────────────────────
// IMAGE OCR (tesseract.js, runs in browser only)
// ─────────────────────────────────────────────────────────────

async function extractTextFromImage(
  uri: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const { default: Tesseract } = await import('tesseract.js');
  const result = await (Tesseract as any).recognize(uri, 'eng', {
    logger: (m: any) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round((m.progress as number) * 100));
      }
    },
  });
  return result.data.text as string;
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────

export async function parseWarrantyDocument(
  uri: string,
  mimeType: string,
  onProgress?: (pct: number) => void,
): Promise<ParsedWarranty> {
  let text = '';

  if (mimeType === 'application/pdf') {
    text = await extractTextFromPdf(uri);
  } else if (mimeType.startsWith('image/')) {
    text = await extractTextFromImage(uri, onProgress);
  } else {
    throw new Error(`Unsupported file type: ${mimeType}. Upload a PDF or image.`);
  }

  return parseWarrantyText(text);
}
