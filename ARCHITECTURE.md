# 🎨 Component Architecture

## Overview

The Personal Planner frontend is built with a modular component architecture using Next.js 14 App Router and TypeScript.

## Component Hierarchy

```
App (page.tsx)
├── DashboardHeader
│   └── ViewSwitcher
│
├── Main Content (conditional rendering based on view)
│   ├── BoardView
│   │   └── TaskCard (multiple, with drag-drop)
│   │
│   ├── WeekdaysView
│   │   └── TaskCard (multiple, grouped by day)
│   │
│   └── CalendarView
│       └── FullCalendar (with custom event rendering)
│
└── TaskModal (conditional, overlay)
    └── Task details with interactive elements
```

## Component Details

### 📄 page.tsx
- **Type**: Client Component (`'use client'`)
- **Purpose**: Main entry point and orchestrator
- **State**: None (delegates to Zustand)
- **Key Features**:
  - Initializes app with mock data
  - Renders appropriate view based on state
  - Manages TaskModal visibility

### 🎯 DashboardHeader
- **Type**: Client Component
- **Props**: None (uses Zustand)
- **Responsibilities**:
  - Displays app title and subtitle
  - Houses the ViewSwitcher
  - Contains action buttons (Search, Filter, Sort, New)
  - Responsive layout

### 🔀 ViewSwitcher
- **Type**: Client Component
- **Props**: 
  - `currentView: ViewType`
  - `onViewChange: (view: ViewType) => void`
- **Features**:
  - Three view buttons with icons
  - Active state indication
  - Smooth transitions

### 📊 BoardView
- **Type**: Client Component
- **Props**: None (uses Zustand)
- **Features**:
  - Horizontal scrolling layout
  - 6 status columns
  - Drag-and-drop powered by @dnd-kit
  - SortableContext for each column
  - DragOverlay for smooth dragging
  - Task count badges

### 📅 WeekdaysView
- **Type**: Client Component
- **Props**: None (uses Zustand)
- **Features**:
  - Grid layout (responsive: 1/2/4 columns)
  - 8 day categories (including "No Weekdays")
  - Color-coded day headers
  - Grouped task display

### 🗓️ CalendarView
- **Type**: Client Component
- **Props**: None (uses Zustand)
- **Features**:
  - FullCalendar integration
  - Month/Week views
  - Color-coded events by status
  - Custom event rendering
  - Click handlers for task details

### 🃏 TaskCard
- **Type**: Client Component
- **Props**:
  - `task: Task`
  - `onClick?: () => void`
- **Features**:
  - Displays task title, dates, status
  - Shows days until due with color coding
  - Displays weekday tags
  - Shows to-do items (if any)
  - Hover effects

### 📝 TaskModal
- **Type**: Client Component
- **Props**: None (uses Zustand for selected task)
- **Features**:
  - Full-screen overlay
  - Click outside to close
  - ESC key to close
  - Displays all task properties
  - Interactive to-do checklist
  - Comment input
  - Smooth animations

## State Management (Zustand)

### Store Structure
```typescript
{
  tasks: Task[]              // All tasks
  currentView: ViewType      // 'board' | 'weekdays' | 'calendar'
  selectedTask: Task | null  // For modal
  isModalOpen: boolean       // Modal visibility
  
  // Actions
  setTasks()
  addTask()
  updateTask()
  deleteTask()
  setCurrentView()
  setSelectedTask()
  setIsModalOpen()
}
```

## Data Flow

1. **Initialization**:
   - `page.tsx` loads mock data into store on mount
   - Store notifies all subscribed components

2. **View Switching**:
   - User clicks view button → `ViewSwitcher` calls `setCurrentView()`
   - Store updates → `page.tsx` re-renders with new view

3. **Task Interaction**:
   - User clicks task → Component calls `setSelectedTask()` + `setIsModalOpen(true)`
   - Store updates → `TaskModal` appears with task details

4. **Drag & Drop (Board View)**:
   - User drags task → `@dnd-kit` handles drag state
   - Drop → `onDragEnd` calls `updateTask()` with new status
   - Store updates → Components re-render

5. **To-Do Toggle**:
   - User clicks checkbox → Modal updates task via `updateTask()`
   - Store updates → All views reflect change

## Styling Strategy

- **Tailwind CSS**: Utility-first approach
- **Color Palette**:
  - Status colors: purple, pink, orange, green, yellow, gray
  - Weekday colors: Varied for visual distinction
  - UI colors: Gray scale with blue accents
- **Responsive**: Mobile-first with breakpoints
- **Animations**: Hover states, transitions, drag effects

## Performance Considerations

- **Client-side rendering**: All components marked `'use client'`
- **Memoization**: Can add React.memo to TaskCard if needed
- **Virtual scrolling**: Consider for large task lists
- **Lazy loading**: FullCalendar loads on-demand

## Future Enhancements

1. **Search & Filter**:
   - Add search store state
   - Filter tasks in view components
   - Debounce search input

2. **Optimistic Updates**:
   - Update UI immediately
   - Sync to Notion in background
   - Rollback on error

3. **Real-time Sync**:
   - WebSocket or polling
   - Update store when Notion changes
   - Conflict resolution

4. **Accessibility**:
   - ARIA labels
   - Keyboard navigation
   - Screen reader support

5. **Animations**:
   - Framer Motion for smooth transitions
   - Stagger animations for task lists
   - Page transitions
