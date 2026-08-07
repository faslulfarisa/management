'use client';

import { DocumentExplorer } from '@/components/compliance/document-explorer';

export default function DocumentTemplatesPage() {
  return (
    <DocumentExplorer
      scope="company"
      groupLabels={['Template']}
      title="Document Templates"
      description="Reusable reference templates (NDA, offer letter, agreements) for HR and admin use"
    />
  );
}
