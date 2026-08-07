'use client';

import { DocumentExplorer } from '@/components/compliance/document-explorer';

export default function CompanyDocumentsPage() {
  return (
    <DocumentExplorer
      scope="company"
      title="Company Documents"
      description="Statutory registrations, licenses, agreements, financial and legal documents for the organization"
    />
  );
}
