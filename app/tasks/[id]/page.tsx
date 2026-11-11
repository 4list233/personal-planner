import { redirect } from 'next/navigation';

// Older links pointed here. A task now opens as a popup over the current view.
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/?task=${encodeURIComponent(id)}`);
}
