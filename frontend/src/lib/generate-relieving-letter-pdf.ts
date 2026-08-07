import type { jsPDF as JsPDFType } from 'jspdf';
import type { ExitRequest } from '@/types/exit';

const PAGE_W = 595;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;

export async function generateRelievingLetterPdf(
  exitRequest: ExitRequest,
  opts?: { download?: boolean; filename?: string },
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const doc: JsPDFType = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  let y = 64;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text('RELIEVING LETTER', PAGE_W / 2, y, { align: 'center' });

  y += 32;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, MARGIN, y);

  y += 36;
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(31, 41, 55);

  const employeeName = `${exitRequest.first_name ?? ''} ${exitRequest.last_name ?? ''}`.trim();
  const lines = [
    `Dear ${employeeName || 'Employee'},`,
    '',
    `This is to confirm that your ${exitRequest.request_type.replace(/_/g, ' ')} from the organization has been accepted, and you have been relieved of your duties effective ${new Date(exitRequest.last_working_date).toLocaleDateString('en-IN')}.`,
    '',
    `Your employee code on record is ${exitRequest.employee_code ?? 'N/A'}. All company assets assigned to you have been returned and accounted for, and all dues have been settled as per the Full & Final settlement process.`,
    '',
    'We thank you for your contributions during your tenure with us and wish you the very best in your future endeavors.',
    '',
    'This is a system-generated relieving letter and does not require a physical signature.',
  ];

  for (const line of lines) {
    if (!line) { y += 14; continue; }
    const wrapped = doc.splitTextToSize(line, CONTENT_W);
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 14 + 4;
  }

  y += 24;
  doc.setFont('helvetica', 'bold');
  doc.text('For and on behalf of the organization', MARGIN, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.text('Human Resources Department', MARGIN, y);

  const filename = opts?.filename ?? `relieving_letter_${exitRequest.employee_code ?? exitRequest.id}`;
  const blob = doc.output('blob');
  if (opts?.download !== false) doc.save(filename + '.pdf');
  return blob;
}
