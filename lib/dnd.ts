import type { CollisionDetection } from '@dnd-kit/core';
import { pointerWithin, rectIntersection } from '@dnd-kit/core';

/**
 * Hybrid collision detection for column-based DnD.
 *
 * Prefer the column whose drop zone literally contains the pointer — that
 * matches user intent best when columns sit side by side. Fall back to
 * rect intersection when the cursor is briefly outside any droppable
 * (e.g. while crossing gutters between columns).
 */
export const columnCollisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) return pointer;
  return rectIntersection(args);
};
