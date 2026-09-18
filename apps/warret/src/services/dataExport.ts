import { Platform } from 'react-native';
import type { Product, ProductCategory } from '../data/products';

export type ExportFormat = 'PDF' | 'CSV' | 'JSON';

type ExportInput = {
  products: Product[];
  productCategories: ProductCategory[];
  format: ExportFormat;
  includeAttachments?: boolean;
};

const escapeCsv = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const fileBase = () => {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
  return `warret-export-${stamp}`;
};

const htmlEscape = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function buildCsv(products: Product[], includeAttachments = true) {
  const headers = [
    'Name', 'Brand', 'Status', 'Warranty start', 'Warranty end', 'Date added',
    'Type', 'Category', 'Seller', 'Serial/model', 'Documents', 'Reminders',
  ];
  const rows = products.map((product) => [
    product.name,
    product.brand,
    product.status,
    product.warrantyStart,
    product.warrantyEnd,
    product.dateAdded,
    product.type,
    product.category || '',
    product.seller || '',
    product.serialNumber || '',
    includeAttachments ? ((product.docEntries || []).map((doc) => `${doc.label}:${doc.fileName}:${doc.expiry || 'no expiry'}`).join(' | ') || product.docs.join(' | ')) : '',
    (product.reminders || []).join(' | '),
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
}

function buildJson(products: Product[], productCategories: ProductCategory[], includeAttachments = true) {
  return JSON.stringify({
    schema: 'warret.export',
    version: 1,
    generatedAt: new Date().toISOString(),
    data: {
      products: products.map(({ ownerId, ...product }) => ({
        ...product,
        docs: includeAttachments ? product.docs : [],
        // Export metadata only. Secure document links are intentionally
        // short-lived and should be regenerated from the product page.
        docEntries: includeAttachments ? product.docEntries?.map(({ uri, ...entry }) => entry) : [],
      })),
      productCategories,
    },
  }, null, 2);
}

function buildHtml(products: Product[], includeAttachments = true) {
  const rows = products.map((product) => `
    <tr>
      <td>${htmlEscape(product.name)}</td>
      <td>${htmlEscape(product.brand)}</td>
      <td>${htmlEscape(product.status)}</td>
      <td>${htmlEscape(product.warrantyEnd || product.expires)}</td>
      <td>${includeAttachments ? htmlEscape(product.docs.length) : 'Hidden'}</td>
    </tr>
  `).join('');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #23212B; padding: 30px; }
    h1 { color: #5B4DF0; margin: 0 0 8px; }
    p { color: #77727F; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 22px; }
    th { color: #77727F; text-transform: uppercase; font-size: 11px; letter-spacing: .5px; text-align: left; }
    td, th { border-bottom: 1px solid #EEEAFE; padding: 10px 8px; font-size: 13px; }
    td { font-weight: 700; }
  </style>
</head>
<body>
  <h1>Warret export</h1>
  <p>${products.length} product${products.length === 1 ? '' : 's'} exported on ${htmlEscape(new Date().toLocaleString())}</p>
  <table>
    <thead><tr><th>Name</th><th>Brand</th><th>Status</th><th>Warranty end</th><th>Docs</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

const pdfSafe = (value: unknown) => String(value ?? '').replace(/[^\x20-\x7E]/g, '').replace(/[()\\]/g, '\\$&');

function buildSimplePdf(products: Product[], includeAttachments = true) {
  const lines = [
    'Warret export',
    `Generated: ${new Date().toLocaleString()}`,
    `Products: ${products.length}`,
    '',
    ...products.flatMap((product) => [
      `${product.name} - ${product.brand}`,
      `Status: ${product.status}; Warranty end: ${product.warrantyEnd || product.expires}`,
      `Documents: ${includeAttachments ? product.docs.length : 'Not included'}`,
      '',
    ]),
  ];
  const perPage = 42;
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / perPage)) }, (_, pageIndex) =>
    lines.slice(pageIndex * perPage, (pageIndex + 1) * perPage),
  );
  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    `2 0 obj << /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >> endobj`,
    '3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    ...pages.flatMap((pageLines, pageIndex) => {
      const pageId = pageObjectIds[pageIndex];
      const contentId = pageId + 1;
      const stream = pageLines
        .map((line, index) => `BT /F1 ${pageIndex === 0 && index === 0 ? 16 : 10} Tf 42 ${760 - index * 17} Td (${pdfSafe(line)}) Tj ET`)
        .join('\n');
      return [
        `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >> endobj`,
        `${contentId} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
      ];
    }),
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += `${object}\n`;
  }
  const xrefStart = body.length;
  const size = objects.length + 1;
  body += `xref\n0 ${size}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\n`;
  body += `trailer << /Root 1 0 R /Size ${size} >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Blob([body], { type: 'application/pdf' });
}

async function downloadWebFile(fileName: string, mimeType: string, content: string | Blob) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function shareNativeFile(fileName: string, content: string, mimeType: string) {
  const FileSystem = await import('expo-file-system/legacy');
  const Sharing = await import('expo-sharing');
  const path = `${FileSystem.cacheDirectory || ''}${fileName}`;
  await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(path, { mimeType, dialogTitle: 'Export Warret data' });
}

export const DataExportService = {
  async exportData({ products, productCategories, format, includeAttachments = true }: ExportInput): Promise<{ fileName: string }> {
    const base = fileBase();
    if (format === 'CSV') {
      const fileName = `${base}.csv`;
      const content = buildCsv(products, includeAttachments);
      if (Platform.OS === 'web') await downloadWebFile(fileName, 'text/csv;charset=utf-8', content);
      else await shareNativeFile(fileName, content, 'text/csv');
      return { fileName };
    }

    if (format === 'JSON') {
      const fileName = `${base}.json`;
      const content = buildJson(products, productCategories, includeAttachments);
      if (Platform.OS === 'web') await downloadWebFile(fileName, 'application/json;charset=utf-8', content);
      else await shareNativeFile(fileName, content, 'application/json');
      return { fileName };
    }

    const fileName = `${base}.pdf`;
    const html = buildHtml(products, includeAttachments);
    if (Platform.OS === 'web') {
      await downloadWebFile(fileName, 'application/pdf', buildSimplePdf(products, includeAttachments));
    } else {
      const Print = await import('expo-print');
      const Sharing = await import('expo-sharing');
      const { uri } = await Print.printToFileAsync({ html });
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export Warret data', UTI: 'com.adobe.pdf' });
    }
    return { fileName };
  },
};
