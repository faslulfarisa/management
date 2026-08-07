'use client';

import { DocumentExplorer } from '@/components/compliance/document-explorer';

export default function GovernmentRegistrationsPage() {
  return (
    <DocumentExplorer
      scope="company"
      groupLabels={['Government Registration', 'Statutory Registration']}
      title="Government Registrations"
      description="Fire safety, pollution control, and other statutory government registrations"
    />
  );
}
