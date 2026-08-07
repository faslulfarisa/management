import { exportPdf } from './export-pdf';

export interface ExportData {
  columns: string[];
  rows: string[][];
}

export function exportReportCsv(data: ExportData, filename: string) {
  // BOM for Excel to open UTF-8 CSV correctly
  const bom = '﻿';
  const header = data.columns.map(c => `"${c.replace(/"/g, '""')}"`).join(',');
  const body = data.rows
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([`${bom}${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportReportXlsx(
  data: ExportData,
  filename: string,
  sheetName = 'Report',
  reportTitle?: string,
) {
  const XLSX = await import('xlsx');
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const titleText = reportTitle ?? sheetName;

  // Row 0: title spanning all columns
  // Row 1: headers
  // Row 2+: data
  const titleRow = [titleText, ...Array(Math.max(0, data.columns.length - 1)).fill('')];
  const subRow   = [`Exported: ${today}`, ...Array(Math.max(0, data.columns.length - 1)).fill('')];

  const aoa = [titleRow, subRow, data.columns, ...data.rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Merge title across all columns
  const lastCol = Math.max(0, data.columns.length - 1);
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
  ];

  // Auto-fit column widths (based on header + data, skipping title rows)
  const colWidths = data.columns.map((col, i) => {
    const maxLen = Math.max(
      col.length,
      ...data.rows.map(r => String(r[i] ?? '').length),
    );
    return { wch: Math.min(maxLen + 2, 40) };
  });
  ws['!cols'] = colWidths;

  // Autofilter on the header row (row index 2)
  if (data.columns.length > 0) {
    const headerRef = XLSX.utils.encode_range({
      s: { r: 2, c: 0 },
      e: { r: 2, c: lastCol },
    });
    ws['!autofilter'] = { ref: headerRef };
  }

  // Freeze the header row so data rows scroll underneath
  // SheetJS CE uses the undocumented !freeze or SheetView approach
  // The safest cross-version method is to set row freeze via !sheetview
  (ws as any)['!freeze'] = { xSplit: 0, ySplit: 3 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportReportPdf(title: string, data: ExportData, filename: string) {
  exportPdf({ title, columns: data.columns, rows: data.rows, filename });
}
