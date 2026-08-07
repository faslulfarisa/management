import type { jsPDF as JsPDFType } from 'jspdf';
import { urlToBase64, hexToRgb, numberToWords } from './pdf-utils';
import type { EnrichedPayslipDetail } from '@/types/employee';

// A4 in points
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;

function fmt(n: number): string {
  return 'Rs. ' + Math.round(n).toLocaleString('en-IN');
}

function imgFormat(dataUrl: string): string {
  const m = dataUrl.match(/data:image\/([^;]+);/);
  const t = m?.[1]?.toLowerCase() ?? 'jpeg';
  if (t === 'png') return 'PNG';
  if (t === 'gif') return 'GIF';
  if (t === 'webp') return 'WEBP';
  return 'JPEG';
}

export async function generatePayslipPdf(
  data: EnrichedPayslipDetail,
  opts?: { download?: boolean; filename?: string },
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc: JsPDFType = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const { company, employee, period, earnings, deductions, fines, totals, attendance, payment } = data;

  const headerColor = company.header_color || '#1e40af';
  const accentColor = company.accent_color || '#1e40af';
  const [hr, hg, hb] = hexToRgb(headerColor);
  const [ar, ag, ab] = hexToRgb(accentColor);

  // ── Watermark — drawn first so it renders behind all content ─────────────
  if (company.watermark_enabled && company.watermark_text) {
    doc.setFontSize(72);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(235, 235, 235);
    doc.text(company.watermark_text, PAGE_W / 2, PAGE_H / 2, { align: 'center', angle: 45 });
  }

  // ── Header: thin accent bar + light background ────────────────────────────
  // Thin brand accent bar (top 3pt)
  doc.setFillColor(hr, hg, hb);
  doc.rect(0, 0, PAGE_W, 3, 'F');

  // Light header background
  doc.setFillColor(249, 250, 251);
  doc.rect(0, 3, PAGE_W, 81, 'F');

  // Header bottom border
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(0, 84, PAGE_W, 84);

  // Logo
  let textX = MARGIN;
  if (company.logo_url) {
    const logoData = await urlToBase64(company.logo_url);
    if (logoData) {
      try {
        doc.addImage(logoData, imgFormat(logoData), MARGIN, 14, 44, 44);
        textX = MARGIN + 54;
      } catch { /* skip logo on render failure */ }
    }
  }

  // Company name
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text(company.name, textX, 30);

  if (company.show_address && company.address) {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(company.address, textX, 42, { maxWidth: 260 });
  }

  const contactParts: string[] = [];
  if (company.phone) contactParts.push(company.phone);
  if (company.email) contactParts.push(company.email);
  if (company.show_gstin && company.gstin) contactParts.push('GSTIN: ' + company.gstin);
  if (contactParts.length) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175);
    doc.text(contactParts.join('  |  '), textX, 54, { maxWidth: 260 });
  }

  // "PAYSLIP" label right-aligned — dark, professional
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(55, 65, 81);
  doc.text('PAYSLIP', PAGE_W - MARGIN, 30, { align: 'right' });

  if (period.payslip_number) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(period.payslip_number, PAGE_W - MARGIN, 42, { align: 'right' });
  }

  // ── Employee information band (y: 92–160) ────────────────────────────────
  doc.setFillColor(249, 250, 251);
  doc.rect(MARGIN, 92, CONTENT_W, 64, 'F');

  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.rect(MARGIN, 92, CONTENT_W, 64, 'S');

  // Left column: name, designation, DOJ, UAN
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text(`${employee.first_name} ${employee.last_name}`, MARGIN + 8, 108);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  const designation = [employee.designation_name, employee.department_name].filter(Boolean).join(' · ');
  if (designation) doc.text(designation, MARGIN + 8, 120);
  if (employee.date_of_joining) doc.text('DOJ: ' + employee.date_of_joining, MARGIN + 8, 132);
  if (employee.uan_number) doc.text('UAN: ' + employee.uan_number, MARGIN + 8, 144);

  // Right column: emp code, period, branch, payment date, PAN
  const rx = PAGE_W / 2 + 10;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  doc.text('Emp Code: ' + employee.employee_code, rx, 108);
  doc.text('Pay Period: ' + period.period_label, rx, 120);
  if (employee.branch_name) doc.text('Branch: ' + employee.branch_name, rx, 132);
  const payDate = payment?.payment_date ?? payment?.paid_at ?? data.paid_at;
  if (payDate) {
    doc.text('Payment Date: ' + new Date(payDate).toLocaleDateString('en-IN'), rx, 144);
  }
  if (employee.pan_number) doc.text('PAN: ' + employee.pan_number, rx, 156);

  // Divider below employee band
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 162, PAGE_W - MARGIN, 162);

  // ── Earnings / Deductions side-by-side ────────────────────────────────────
  const tblW = (CONTENT_W - 10) / 2;
  const rTableLeft = MARGIN + tblW + 10;

  const earnBody = [
    ...earnings.map(e => [e.label, fmt(e.amount)]),
    ['Gross Salary', fmt(totals.gross_salary)],
  ];

  const dedBody = [
    ...deductions.map(d => [d.label, fmt(d.amount)]),
    ['Total Deductions', fmt(totals.total_deductions)],
  ];

  // Dark neutral headers — same color for both columns (professional, non-partisan)
  const tableHeadStyle = { fillColor: [31, 41, 55] as [number, number, number], textColor: 255 as number, fontStyle: 'bold' as const };
  const tableStyles = { fontSize: 8, cellPadding: 3.5 };
  const tableAltRow = { fillColor: [249, 250, 251] as [number, number, number] };

  autoTable(doc, {
    head: [['Earnings', 'Amount']],
    body: earnBody,
    startY: 168,
    margin: { left: MARGIN, right: PAGE_W - MARGIN - tblW },
    styles: tableStyles,
    headStyles: tableHeadStyle,
    alternateRowStyles: tableAltRow,
    columnStyles: { 1: { halign: 'right' } },
  });
  const leftFinalY: number = (doc as any).lastAutoTable.finalY;

  autoTable(doc, {
    head: [['Deductions', 'Amount']],
    body: dedBody,
    startY: 168,
    margin: { left: rTableLeft, right: MARGIN },
    styles: tableStyles,
    headStyles: tableHeadStyle,
    alternateRowStyles: tableAltRow,
    columnStyles: { 1: { halign: 'right' } },
  });
  const rightFinalY: number = (doc as any).lastAutoTable.finalY;

  let curY = Math.max(leftFinalY, rightFinalY) + 12;

  // ── Attendance summary band ───────────────────────────────────────────────
  if (attendance) {
    const attText = [
      'Working Days: ' + attendance.total_working_days,
      'Present: ' + attendance.present_days,
      'Absent: ' + attendance.absent_days,
      'Late: ' + attendance.late_count,
      'Half Day: ' + attendance.half_day_count,
      'OT: ' + Number(attendance.overtime_hours).toFixed(1) + 'h',
    ].join('   |   ');

    doc.setFillColor(249, 250, 251);
    doc.rect(MARGIN, curY, CONTENT_W, 20, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.rect(MARGIN, curY, CONTENT_W, 20, 'S');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(attText, PAGE_W / 2, curY + 13, { align: 'center' });
    curY += 28;
  }

  // ── Net pay — professional box with left accent border ────────────────────
  const netPayH = 54;

  // Box fill
  doc.setFillColor(249, 250, 251);
  doc.rect(MARGIN, curY, CONTENT_W, netPayH, 'F');

  // Outer border
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.5);
  doc.rect(MARGIN, curY, CONTENT_W, netPayH, 'S');

  // Left accent strip (company brand color)
  doc.setFillColor(ar, ag, ab);
  doc.rect(MARGIN, curY, 4, netPayH, 'F');

  // "NET PAY" label
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(107, 114, 128);
  doc.text('NET PAY', MARGIN + 14, curY + 16);

  // In Words
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(156, 163, 175);
  const wordsText = numberToWords(totals.net_salary);
  doc.text(wordsText, MARGIN + 14, curY + 28, { maxWidth: CONTENT_W / 2 - 10 });

  // Net salary amount — large, dark, right-aligned
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text(fmt(totals.net_salary), PAGE_W - MARGIN - 6, curY + 26, { align: 'right' });

  // Gross / Deductions breakdown
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(156, 163, 175);
  doc.text(
    `Gross: ${fmt(totals.gross_salary)}   Deductions: ${fmt(totals.total_deductions)}`,
    PAGE_W - MARGIN - 6,
    curY + 40,
    { align: 'right' },
  );

  curY += netPayH + 12;

  // ── Fine deductions ───────────────────────────────────────────────────────
  if (fines && fines.length > 0) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(55, 65, 81);
    doc.text('Fine Deductions', MARGIN, curY + 10);

    autoTable(doc, {
      head: [['Title', 'Category', 'Amount']],
      body: fines.map(f => [f.title, f.category ?? '', fmt(f.amount)]),
      startY: curY + 14,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 8, cellPadding: 3.5 },
      headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: { 2: { halign: 'right' } },
    });

    curY = (doc as any).lastAutoTable.finalY + 12;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = Math.max(curY + 16, PAGE_H - 44);

  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, footerY, PAGE_W - MARGIN, footerY);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(156, 163, 175);
  doc.text(
    'This is a computer-generated payslip and does not require a physical signature.',
    PAGE_W / 2,
    footerY + 12,
    { align: 'center' },
  );

  if (company.footer_text) {
    doc.text(company.footer_text, PAGE_W / 2, footerY + 22, { align: 'center' });
  }

  const pageCount: number = (doc.internal as any).getNumberOfPages?.() ?? 1;
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175);
    doc.text(`Page ${p} of ${pageCount}`, PAGE_W - MARGIN, footerY + 12, { align: 'right' });
  }

  const filename =
    opts?.filename ??
    `payslip_${period.period_label.replace(/\s/g, '_')}_${employee.employee_code}`;

  const blob = doc.output('blob');
  if (opts?.download !== false) {
    doc.save(filename + '.pdf');
  }
  return blob;
}
