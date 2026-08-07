import { redirect } from 'next/navigation';

export default function SchedulesIndexPage() {
  redirect('/dashboard/schedules/overview');
}
