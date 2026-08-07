import { redirect } from 'next/navigation';

// The Compliance module moved out of HR into its own top-level Compliance Document
// Management System (see /dashboard/compliance/*). Kept as a redirect so old
// bookmarks/links to this URL keep working.
export default function CompliancePageRedirect() {
  redirect('/dashboard/compliance/tracker');
}
