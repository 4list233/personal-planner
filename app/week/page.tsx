'use client';

import dynamic from 'next/dynamic';
import PlannerShell from '@/components/PlannerShell';

const WeekView = dynamic(() => import('@/components/WeekView'), { ssr: false });

export default function WeekPage() {
  return (
    <PlannerShell viewName="Week">
      <WeekView />
    </PlannerShell>
  );
}
