'use client';

import dynamic from 'next/dynamic';
import PlannerShell from '@/components/PlannerShell';

const PeopleView = dynamic(() => import('@/components/PeopleView'), { ssr: false });

export default function PeoplePage() {
  return (
    <PlannerShell viewName="People">
      <PeopleView />
    </PlannerShell>
  );
}
