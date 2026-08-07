import { BadRequestException, Injectable } from '@nestjs/common';

export interface ParsedImportFile {
  format: 'csv' | 'xlsx' | 'pdf';
  fileName: string;
  sheetName?: string;
  headers: string[];
  rows: Record<string, unknown>[];
  warnings: string[];
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const PREVIEW_ROW_LIMIT = 5000;

@Injectable()
export class ImportParserService {
  async parse(file: Express.Multer.File): Promise<ParsedImportFile> {
    if (!file) {
      throw new BadRequestException('Import file is required');
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('Import file exceeds the 10 MB limit');
    }

    const fileName = file.originalname || 'import';
    const extension = fileName.split('.').pop()?.toLowerCase();

    if (extension === 'csv' || file.mimetype === 'text/csv') {
      return this.parseCsv(file);
    }
    if (extension === 'xlsx' || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      return this.parseXlsx(file);
    }
    if (extension === 'pdf' || file.mimetype === 'application/pdf') {
      return this.parsePdf(file);
    }

    throw new BadRequestException('Unsupported import format. CSV, XLSX, and text-based PDF are supported.');
  }

  private parseCsv(file: Express.Multer.File): ParsedImportFile {
    const text = file.buffer.toString('utf8').replace(/^\uFEFF/, '');
    if (!text.trim()) {
      throw new BadRequestException('Import file is empty');
    }

    const matrix = this.parseCsvRows(text);
    if (matrix.length === 0) {
      throw new BadRequestException('Import file is empty');
    }

    return this.toParsedFile('csv', file.originalname, matrix);
  }

  private async parseXlsx(file: Express.Multer.File): Promise<ParsedImportFile> {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
      if (!workbook.SheetNames.length) {
        throw new BadRequestException('Workbook does not contain any sheets');
      }

      const warnings: string[] = [];
      if (workbook.SheetNames.length > 1) {
        warnings.push('Multiple sheets detected. The first sheet was used for preview.');
      }

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
      const parsed = this.toParsedFile('xlsx', file.originalname, matrix);
      return { ...parsed, sheetName, warnings: [...warnings, ...parsed.warnings] };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('File could not be parsed. It may be corrupted or unsupported.');
    }
  }

  private async parsePdf(file: Express.Multer.File): Promise<ParsedImportFile> {
    let parser: any;
    try {
      const { PDFParse } = await import('pdf-parse');
      parser = new PDFParse({ data: file.buffer });
      const tableResult = await parser.getTable();
      const table = this.pickPdfTable(tableResult);

      if (table.length >= 2) {
        return {
          ...this.toParsedFile('pdf', file.originalname, table),
          warnings: ['PDF import is supported for text-based tabular PDFs. Review detected rows carefully before confirming.'],
        };
      }

      const textResult = await parser.getText();
      const matrix = this.parsePdfTextTable(textResult.text ?? '');
      if (matrix.length >= 2) {
        return {
          ...this.toParsedFile('pdf', file.originalname, matrix),
          warnings: ['PDF text was parsed heuristically. Review detected rows and mappings carefully before confirming.'],
        };
      }

      throw new BadRequestException('No importable table was detected in this PDF');
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('PDF could not be parsed. Scanned/image PDFs are not supported for import.');
    } finally {
      if (parser) {
        await parser.destroy().catch(() => undefined);
      }
    }
  }

  private toParsedFile(format: 'csv' | 'xlsx' | 'pdf', fileName: string, matrix: unknown[][]): ParsedImportFile {
    const [headerRow, ...dataRows] = matrix;
    const headers = (headerRow ?? []).map((value) => String(value ?? '').trim());
    const warnings: string[] = [];

    if (!headers.length || headers.every((h) => !h)) {
      throw new BadRequestException('Import file is missing headers');
    }

    const seen = new Set<string>();
    const duplicateHeaders = headers.filter((header) => {
      const normalized = this.normalizeHeader(header);
      if (!normalized) return false;
      if (seen.has(normalized)) return true;
      seen.add(normalized);
      return false;
    });
    if (duplicateHeaders.length) {
      throw new BadRequestException(`Duplicate headers found: ${duplicateHeaders.join(', ')}`);
    }

    const rows = dataRows
      .slice(0, PREVIEW_ROW_LIMIT)
      .map((row) => this.rowToObject(headers, row))
      .filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));

    if (!rows.length) {
      throw new BadRequestException('Import file does not contain any data rows');
    }
    if (dataRows.length > PREVIEW_ROW_LIMIT) {
      warnings.push(`Preview limited to ${PREVIEW_ROW_LIMIT} rows. Use background processing for larger imports.`);
    }

    return { format, fileName, headers, rows, warnings };
  }

  private rowToObject(headers: string[], row: unknown[]): Record<string, unknown> {
    return headers.reduce<Record<string, unknown>>((acc, header, index) => {
      acc[header] = row[index] ?? '';
      return acc;
    }, {});
  }

  private parseCsvRows(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(value);
        value = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') i += 1;
        row.push(value);
        rows.push(row);
        row = [];
        value = '';
      } else {
        value += char;
      }
    }

    row.push(value);
    rows.push(row);
    return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
  }

  private pickPdfTable(tableResult: any): string[][] {
    const tables = [
      ...(tableResult?.mergedTables ?? []),
      ...((tableResult?.pages ?? []).flatMap((page: any) => page.tables ?? [])),
    ];
    const normalizedTables = tables
      .map((table: unknown[][]) => table
        .map((row) => row.map((cell) => String(cell ?? '').trim()))
        .filter((row) => row.some((cell) => cell !== '')))
      .filter((table) => table.length >= 2);

    return normalizedTables.sort((a, b) => b.length - a.length)[0] ?? [];
  }

  private parsePdfTextTable(text: string): string[][] {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^Generated:/i.test(line));

    const delimited = lines
      .map((line) => {
        if (line.includes('\t')) return line.split('\t');
        if (line.includes('|')) return line.split('|');
        if (line.includes(',')) return this.parseCsvRows(line)[0] ?? [];
        return [];
      })
      .map((row) => row.map((cell) => cell.trim()).filter(Boolean))
      .filter((row) => row.length > 1);

    if (delimited.length >= 2) return delimited;

    const headerIndex = lines.findIndex((line) => /employee|code|name|date|status|email|phone|branch|department/i.test(line));
    if (headerIndex < 0) return [];

    const header = lines[headerIndex].split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
    if (header.length < 2) return [];

    const rows = lines.slice(headerIndex + 1)
      .map((line) => line.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean))
      .filter((row) => row.length === header.length);

    return rows.length ? [header, ...rows] : [];
  }

  private normalizeHeader(header: string): string {
    return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  }
}
