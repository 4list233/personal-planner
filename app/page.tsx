'use client';

import dynamic from 'next/dynamic';
import PhoneLists from '@/components/PhoneLists';
import PlannerShell from '@/components/PlannerShell';
import { useIsPhone } from '@/lib/use-board-lanes';

// Lazy load the heavy views to avoid compilation hang
const BoardView = dynamic(() => import('@/components/BoardView'), { ssr: false });

function Board() {
  return useIsPhone() ? <PhoneLists /> : <BoardView />;
}

export default function Home() {
  return (
    <PlannerShell viewName="Board">
      <Board />
    </PlannerShell>
  );
}
