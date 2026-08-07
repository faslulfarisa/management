/**
 * OCR utility using Tesseract.js for client-side invoice text extraction.
 * Attempts to parse key invoice fields from raw OCR text.
 */

export interface InvoiceOCRResult {
  rawText: string;
  customer_name?: string;
  customer_email?: string;
  invoice_number?: string;
  issue_date?: string;
  due_date?: string;
  total_amount?: number;
  tax_amount?: number;
  vendor_name?: string;
  line_items: Array<{ description: string; quantity: number; unit_price: number; tax_rate: number }>;
  confidence: number;
}

export async function extractInvoiceData(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<InvoiceOCRResult> {
  // Dynamically import Tesseract to avoid SSR issues
  const Tesseract = (await import('tesseract.js')).default;

  const result = await Tesseract.recognize(file, 'eng', {
    logger: (m: any) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  const rawText = result.data.text;
  const confidence = result.data.confidence;

  return { ...parseInvoiceText(rawText), confidence };
}

function parseInvoiceText(text: string): Omit<InvoiceOCRResult, 'confidence'> {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const fullText = text.toLowerCase();

  /* ── Helpers ── */
  const matchFirst = (patterns: RegExp[]): string | undefined => {
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]?.trim()) return m[1].trim();
    }
  };

  const matchAmount = (patterns: RegExp[]): number | undefined => {
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const raw = m[1]?.replace(/[₹,\s]/g, '').trim();
        const n = parseFloat(raw);
        if (!isNaN(n)) return n;
      }
    }
  };

  const matchDate = (patterns: RegExp[]): string | undefined => {
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) {
        const d = new Date(m[1]);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      }
    }
  };

  /* ── Invoice Number ── */
  const invoice_number = matchFirst([
    /invoice\s*(?:no|number|#)[:\s#]*([A-Z0-9-]+)/i,
    /inv[.\-\s]*([A-Z0-9-]+)/i,
  ]);

  /* ── Dates ── */
  const issue_date = matchDate([
    /(?:invoice|issue|bill)\s*date[:\s]*([\d]{1,2}[\/\-\s][\d]{1,2}[\/\-\s][\d]{2,4})/i,
    /date[:\s]*([\w]+\s+\d{1,2},?\s+\d{4})/i,
  ]);

  const due_date = matchDate([
    /due\s*date[:\s]*([\d]{1,2}[\/\-\s][\d]{1,2}[\/\-\s][\d]{2,4})/i,
    /payment\s*due[:\s]*([\w]+\s+\d{1,2},?\s+\d{4})/i,
  ]);

  /* ── Amounts ── */
  const total_amount = matchAmount([
    /(?:grand\s*)?total[:\s₹]*([\d,]+(?:\.\d+)?)/i,
    /amount\s*due[:\s₹]*([\d,]+(?:\.\d+)?)/i,
    /total\s*amount[:\s₹]*([\d,]+(?:\.\d+)?)/i,
  ]);

  const tax_amount = matchAmount([
    /(?:gst|tax|igst|cgst|sgst)[:\s₹]*([\d,]+(?:\.\d+)?)/i,
    /tax\s*amount[:\s₹]*([\d,]+(?:\.\d+)?)/i,
  ]);

  /* ── Party Names ── */
  const customer_name = matchFirst([
    /(?:bill\s*to|invoice\s*to|customer)[:\s]*([A-Za-z\s&.,]+)/i,
    /(?:to)[:\s]*([A-Za-z\s&.,]{3,50})/i,
  ]);

  const vendor_name = matchFirst([
    /(?:from|vendor|supplier|company)[:\s]*([A-Za-z\s&.,]+)/i,
  ]);

  const customer_email = matchFirst([
    /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/,
  ]);

  /* ── Line Items (best effort) ── */
  const line_items: InvoiceOCRResult['line_items'] = [];
  const linePattern = /^(.{5,40})\s+([\d]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s*([\d]+(?:\.\d+)?)?$/;
  for (const line of lines) {
    const m = line.match(linePattern);
    if (m) {
      const qty = parseFloat(m[2]);
      const price = parseFloat(m[3].replace(',', ''));
      if (!isNaN(qty) && !isNaN(price) && price > 0) {
        line_items.push({
          description: m[1].trim(),
          quantity: qty,
          unit_price: price,
          tax_rate: m[4] ? parseFloat(m[4]) : 18,
        });
      }
    }
  }

  return {
    rawText: text,
    invoice_number,
    issue_date,
    due_date,
    total_amount,
    tax_amount,
    customer_name,
    vendor_name,
    customer_email,
    line_items,
  };
}
