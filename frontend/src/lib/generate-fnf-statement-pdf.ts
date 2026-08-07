import type { jsPDF as JsPDFType } from 'jspdf';
import { numberToWords } from './pdf-utils';
import type { FinalSettlement, ExitRequest } from '@/types/exit';

const PAGE_W = 595;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;

function fmt(n: number): string {
  return 'Rs. ' + Math.round(n).toLocaleString('en-IN');
}

export async function generateFnfStatementPdf(
  settlement: FinalSettlement,
  exitRequest: ExitRequest,
  opts?: { download?: boolean; filename?: string },
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc: JsPDFType = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text('FULL & FINAL SETTLEMENT STATEMENT', PAGE_W / 2, 40, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  const employeeName = `${exitRequest.first_name ?? ''} ${exitRequest.last_name ?? ''}`.trim();
  doc.text(`Employee: ${employeeName} (${exitRequest.employee_code ?? ''})`, MARGIN, 64);
  doc.text(`Last Working Day: ${new Date(exitRequest.last_working_date).toLocaleDateString('en-IN')}`, MARGIN, 78);
  doc.text(`Statement Date: ${new Date().toLocaleDateString('en-IN')}`, PAGE_W - MARGIN, 64, { align: 'right' });

  const payableBody = [
    ['Basic Salary / Pending Salary', fmt(settlement.basic_salary)],
    ['Allowances', fmt(settlement.allowances)],
    ['Gratuity', fmt(settlement.gratuity)],
    ['Leave Encashment', fmt(settlement.leave_encashment)],
    ['Bonus', fmt(settlement.bonus)],
    ['Gross Payable', fmt(settlement.total_payable)],
  ];

  const deductionBody = [
    ['Notice Pay Recovery', fmt(settlement.notice_pay_recovery)],
    ['Asset Recovery', fmt(settlement.asset_recovery)],
    ['Tax Deduction', fmt(settlement.tax_deduction ?? 0)],
    ['Loan Recovery', fmt(settlement.loan_recovery ?? 0)],
    ['Other Deductions', fmt(settlement.deductions)],
    ['Total Deductions', fmt(settlement.total_deductions)],
  ];

  const tblW = (CONTENT_W - 10) / 2;
  autoTable(doc, {
    head: [['Earnings', 'Amount']],
    body: payableBody,
    startY: 100,
    margin: { left: MARGIN, right: PAGE_W - MARGIN - tblW },
    styles: { fontSize: 8, cellPadding: 3.5 },
    headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: { 1: { halign: 'right' } },
  });
  const leftFinalY: number = (doc as any).lastAutoTable.finalY;

  autoTable(doc, {
    head: [['Deductions', 'Amount']],
    body: deductionBody,
    startY: 100,
    margin: { left: MARGIN + tblW + 10, right: MARGIN },
    styles: { fontSize: 8, cellPadding: 3.5 },
    headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: { 1: { halign: 'right' } },
  });
  const rightFinalY: number = (doc as any).lastAutoTable.finalY;

  let y = Math.max(leftFinalY, rightFinalY) + 24;

  doc.setFillColor(249, 250, 251);
  doc.rect(MARGIN, y, CONTENT_W, 54, 'F');
  doc.setDrawColor(209, 213, 219);
  doc.rect(MARGIN, y, CONTENT_W, 54, 'S');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(107, 114, 128);
  doc.text('NET PAYABLE', MARGIN + 12, y + 16);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(numberToWords(settlement.net_payable), MARGIN + 12, y + 30, { maxWidth: CONTENT_W / 2 });

  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text(fmt(settlement.net_payable), PAGE_W - MARGIN - 8, y + 32, { align: 'right' });

  y += 70;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(156, 163, 175);
  doc.text(`Payment Status: ${settlement.payment_status.replace(/_/g, ' ')}`, MARGIN, y);
  if (settlement.payment_date) doc.text(`Payment Date: ${new Date(settlement.payment_date).toLocaleDateString('en-IN')}`, PAGE_W - MARGIN, y, { align: 'right' });

  y += 20;
  doc.text('This is a system-generated settlement statement and does not require a physical signature.', PAGE_W / 2, y, { align: 'center' });

  const filename = opts?.filename ?? `fnf_statement_${exitRequest.employee_code ?? exitRequest.id}`;
  const blob = doc.output('blob');
  if (opts?.download !== false) doc.save(filename + '.pdf');
  return blob;
}
