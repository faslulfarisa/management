'use client';

import { DocumentExplorer } from '@/components/compliance/document-explorer';

export default function LicensesCertificationsPage() {
  return (
    <DocumentExplorer
      scope="company"
      groupLabels={['License', 'Certification']}
      title="Licenses & Certifications"
      description="Business licenses, ISO and other certifications — track validity, renewal, and issuing authority"
    />
  );
}
