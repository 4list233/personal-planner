# 📋 Assessment & Deadlines - Personal Planner

**Forest's Scrappy Tool 😁**

A modern, feature-rich personal planner built with Next.js 14 and TypeScript, designed to integrate with Notion as a database backend.

## ✨ Features

### 🎯 Three Powerful Views

1. **Board View** (Kanban)
   - Drag-and-drop tasks between status columns
   - Status columns: Reminders, Long Term Deadlines, To Do, Doing Today, Doing Tomorrow, Archived
   - Visual status indicators with color coding
   - Task counts per column

2. **Weekdays View**
   - Organize tasks by day of the week
   - Color-coded day columns
   - Special "No Weekdays" category for non-scheduled tasks

3. **Calendar View**
   - Monthly calendar with FullCalendar integration
   - Visual task distribution across dates
   - Click events to view task details
   - Color-coded by status

### 📝 Task Management

- **Task Cards** with rich information:
  - Title and description
  - Due dates with countdown
  - Status tracking
  - Weekday assignments
  - To-do checklists within tasks
  
- **Task Modal** for detailed view:
  - All task properties at a glance
  - Interactive to-do list with checkboxes
  - Date created and due date tracking
  - Comment section for notes
  - Status and weekday management

### 🎨 Modern UI

- Clean, Notion-inspired interface
- Smooth transitions and hover states
- Responsive design for all screen sizes
- Color-coded categories and statuses
- Lucide icons for visual clarity

## 🛠️ Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **State Management**: Zustand
- **Drag & Drop**: @dnd-kit
- **Calendar**: FullCalendar React
- **Date Handling**: date-fns
- **Icons**: Lucide React
- **Validation**: Zod (ready for API integration)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- npm, yarn, pnpm, or bun

### Installation

1. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
```

2. Run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

### Build for Production

```bash
npm run build
npm run start
```

## 📁 Project Structure

```
personal-planner/
├── app/
│   ├── globals.css          # Global styles + Tailwind
│   ├── layout.tsx            # Root layout with metadata
│   └── page.tsx              # Main dashboard page
├── components/
│   ├── BoardView.tsx         # Kanban board with drag-drop
│   ├── CalendarView.tsx      # FullCalendar integration
│   ├── DashboardHeader.tsx   # Header with view switcher
│   ├── TaskCard.tsx          # Reusable task card component
│   ├── TaskModal.tsx         # Detailed task view modal
│   ├── ViewSwitcher.tsx      # Toggle between views
│   └── WeekdaysView.tsx      # Week-based organization
├── lib/
│   ├── mock-data.ts          # Sample tasks for development
│   ├── store.ts              # Zustand state management
│   └── types.ts              # TypeScript type definitions
└── package.json
```

## 🔄 Next Steps: Notion Integration

Ready to connect to Notion? Here's what you'll need:

### 1. Setup Notion API

```bash
# Add environment variables
NOTION_API_KEY=your_notion_integration_key
NOTION_DATABASE_ID=your_database_id
```

### 2. Create API Routes

The project is ready for API integration. Create:
- `app/api/tasks/route.ts` - GET all tasks
- `app/api/tasks/[id]/route.ts` - GET/PUT/DELETE single task
- Use `@notionhq/client` already installed

### 3. Update Store

Replace mock data fetching with real API calls in the components.

## 🎨 Customization

### Adding New Status Columns

Edit `components/BoardView.tsx`:
```typescript
const statuses = [
  { status: 'Your New Status', color: 'bg-purple-50' },
  // ...existing statuses
];
```

### Modifying Task Properties

Update `lib/types.ts` to add new task fields, then update components accordingly.

## 📝 Current Data Model

```typescript
interface Task {
  id: string;
  title: string;
  dueDate?: string;
  dateCreated: string;
  status: TaskStatus; // 6 predefined statuses
  daysUntilDue?: number;
  weekday?: Weekday; // 8 options including "No Weekdays"
  todoItems?: TodoItem[];
  comments?: string[];
}
```

## 🤝 Contributing

This is a personal project, but suggestions and improvements are welcome!

## 📄 License

MIT License - feel free to use this project as a starting point for your own planner!

---

Built with ❤️ using Next.js and TypeScript
