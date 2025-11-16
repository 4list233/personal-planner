# 📋 Personal Planner (Live Notion-Backed)

**Forest's Scrappy Tool 2.0 😁**

Live deployment integrates directly with your Notion database (no mock tasks). Draft workflow: tasks are local until you hit Submit in the modal.

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

### 📸 AI-Powered Screenshot Import

- **Vision LLM Integration** (Google Gemini 2.0 Flash - Free Tier):
  - Upload screenshots or paste images directly
  - AI extracts tasks with title, due date, status, priority, and notes
  - Custom instructions per upload (e.g., "Extract tasks from meeting notes")
  - Batch editing UI: select, bulk apply status/date, inline edit before import
  - Smart parsing handles handwriting, various formats, complex layouts
  - Priority levels (high/medium/low) and additional notes captured automatically
  - Free tier: 15 RPM, 1 million TPM, 200 RPD

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
│   ├── mock-data.ts          # Empty (legacy placeholder)
│   ├── store.ts              # Zustand state management
│   └── types.ts              # TypeScript type definitions
└── package.json
```

## 🔄 Notion Integration Status

- Uses `@notionhq/client` v5 with layered fallbacks (SDK query ➜ REST ➜ search) for reliable fetches.
- Environment variables required:
  - `NOTION_API_KEY` (server) - Notion integration token
  - `NOTION_DATABASE_ID` (server) - Your Notion database ID
  - `NEXT_PUBLIC_NOTION_DATABASE_ID` (optional public link)
  - `GEMINI_API_KEY` (server) - Required for AI screenshot import feature (get free at https://makersuite.google.com/app/apikey)
- API routes implemented:
  - `GET /api/tasks` (supports `?debug=1`)
  - `POST /api/tasks`
  - `PUT /api/tasks/:id` (retry on conflicts)
  - `DELETE /api/tasks/:id`
  - `GET /api/version` (deployment info)
  - `POST /api/parse-image` (Gemini Vision task extraction)
- Draft workflow: Add Task creates a local draft (temp id). Persisted only when Submit is clicked in the modal.

### Required Property Keys for Writing
- `Name` (title)
- `Status` (select; Reminders | Long Term Deadlines | To Do | Doing Today | Doing Tomorrow | Archived)
- `Due Date` (date)
- `Weekdays` (select; No Weekdays + days of week)
- `Todos` (rich_text; newline list with ✓ prefix for completed)

Reads attempt heuristic matching by type if names differ.

## 🧪 Debug & Verification

Endpoints:
```bash
GET /api/tasks?debug=1
GET /api/version
GET /api/health/notion
GET /api/health/notion/raw
```

`/api/version` exposes commit SHA to confirm Vercel deployment freshness.

## 📝 Draft vs Submit Workflow

1. Add Task ➜ creates a local draft (not saved to Notion yet).
2. Edit title/status/due/todos locally (no API calls while typing).
3. Submit ➜ creates or updates the Notion page.
4. Conflicts (409) on update are retried briefly.

## 🚨 Deployment Checklist
1. Verify commit via `/api/version` matches GitHub main.
2. Ensure env vars set in Vercel (& redeploy after changes):
   - `NOTION_API_KEY` (required)
   - `NOTION_DATABASE_ID` (required)
   - `NEXT_PUBLIC_NOTION_DATABASE_ID` (optional)
   - `GEMINI_API_KEY` (required for screenshot import feature - free at https://makersuite.google.com/app/apikey)
3. Use `/api/tasks?debug=1` to confirm server sees tasks.
4. If zero tasks, confirm property names or add required properties.
5. Test screenshot import feature at bottom of Board View.

## 🔐 Security Notes
- `NOTION_API_KEY` never sent to client; only server env.
- Public DB link uses `NEXT_PUBLIC_NOTION_DATABASE_ID`.

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
