import { urlToBase64, hexToRgb } from './pdf-utils';

export interface PdfBrandingOptions {
  logoUrl?: string;
  companyName?: string;
  footerText?: string;
  headerColor?: string;
}

export async function exportPdf({
  title,
  columns,
  rows,
  filename,
  brandingOptions,
}: {
  title: string;
  columns: string[];
  rows: string[][];
  filename: string;
  brandingOptions?: PdfBrandingOptions;
}) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  let titleY = 40; // unchanged from original when no branding

  if (brandingOptions) {
    const { logoUrl, companyName, headerColor } = brandingOptions;

    // Optional coloured header strip
    const normalised = headerColor?.toLowerCase().replace(/\s/g, '') ?? '';
    const isColoured = normalised && normalised !== '#ffffff' && normalised !== '#fff';
    if (isColoured) {
      const [r, g, b] = hexToRgb(headerColor!);
      doc.setFillColor(r, g, b);
      doc.rect(0, 0, pageW, 50, 'F');
    }

    // Logo
    let textX = 36;
    if (logoUrl) {
      const img = await urlToBase64(logoUrl);
      if (img) {
        try {
          const fmt = img.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          doc.addImage(img, fmt, 36, 10, 30, 30);
          textX = 76;
        } catch {
          // continue without logo if rendering fails
        }
      }
    }

    // Company name
    if (companyName) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(isColoured ? 255 : 50);
      doc.text(companyName, textX, 30);
    }

    doc.setTextColor(0);
    titleY = 70; // title sits below the branding strip
  }

  // Title — same Y as original (40) when no branding, 70 when branding present
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(title, 40, titleY);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 40, titleY + 16);
  doc.setTextColor(0);

  autoTable(doc, {
    head: [columns],
    body: rows,
    startY: titleY + 30, // 70 when no branding — identical to original
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 40, right: 40 },
  });

  // Optional footer text stamped on every page
  if (brandingOptions?.footerText) {
    const pageCount = (doc as any).internal.getNumberOfPages();
    const pageH = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(brandingOptions.footerText, pageW / 2, pageH - 20, { align: 'center' });
    }
    doc.setTextColor(0);
  }

  doc.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`);
}
