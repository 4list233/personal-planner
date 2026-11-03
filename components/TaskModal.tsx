'use client';

import { usePlannerStore } from '@/lib/store';
import TaskEditor from './TaskEditor';

export default function TaskModal() {
  const { selectedTask, isModalOpen } = usePlannerStore();
  if (!isModalOpen || !selectedTask) return null;
  return <TaskEditor task={selectedTask} variant="modal" />;
}
