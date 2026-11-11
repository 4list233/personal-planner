'use client';

import dynamic from 'next/dynamic';
import PlannerShell from '@/components/PlannerShell';

const TodayView = dynamic(() => import('@/components/TodayView'), { ssr: false });

export default function TodayPage() {
  return (
    <PlannerShell viewName="Today">
      <TodayView />
    </PlannerShell>
  );
}
