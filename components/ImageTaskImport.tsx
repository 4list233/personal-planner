'use client';

import { useState, useEffect } from 'react';
import { Camera, Upload, Loader2, ChevronRight } from 'lucide-react';
import { usePlannerStore, getAuthHeaders } from '@/lib/store';
import { TaskStatus } from '@/lib/types';

interface ParsedTask {
  title: string;
  dueDate?: string;
  status?: TaskStatus;
  notes?: string | null;
}

// Global queue manager
let globalTaskQueue: ParsedTask[] = [];
let queueCallback: (() => void) | null = null;

export function processNextInQueue() {
  if (queueCallback) {
    queueCallback();
  }
}

export default function ImageTaskImport() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [taskQueue, setTaskQueue] = useState<ParsedTask[]>([]);
  const [showQueueInfo, setShowQueueInfo] = useState(false);
  const { addTask, setIsModalOpen, setSelectedTask, isModalOpen, tasks } = usePlannerStore();

  // Watch for modal close to auto-open next task OR clear queue if user cancelled
  useEffect(() => {
    if (!isModalOpen && taskQueue.length > 0) {
      // Check if there are any temp tasks left
      const tempTasksExist = tasks.some(t => t.id.startsWith('temp-'));
      
      if (!tempTasksExist) {
        // User cancelled/escaped - clear the queue
        setTaskQueue([]);
        setShowQueueInfo(false);
      } else {
        // Tasks still exist, open next one after a short delay
        const timer = setTimeout(() => {
          handleNextInQueue();
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [isModalOpen, taskQueue.length, tasks]);

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    setIsProcessing(true);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const imageData = await base64Promise;

      const headers = await getAuthHeaders();
      const res = await fetch('/api/parse-image', {
        method: 'POST',
        headers,
        body: JSON.stringify({ image: imageData, instructions }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Vision parsing failed');
      }

      const data = await res.json();
      const llmTasks = data.tasks || [];

      if (llmTasks.length === 0) {
        alert('No tasks detected');
        return;
      }

      const tasks: ParsedTask[] = llmTasks.map((t: any) => ({
        title: t.title || 'Untitled',
        dueDate: t.dueDate || undefined,
        status: (t.status as TaskStatus) || 'To Do',
        notes: t.notes || null,
      }));

      setTaskQueue(tasks);
      setShowQueueInfo(true);
      openNextTask(tasks);
    } catch (error) {
      console.error('Error:', error);
      alert(`Failed: ${(error as any).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const openNextTask = (queue: ParsedTask[]) => {
    if (queue.length === 0) {
      setShowQueueInfo(false);
      setTaskQueue([]);
      return;
    }

    const task = queue[0];
    const now = new Date().toISOString();
    const newTask = {
      id: `temp-${Date.now()}-${Math.random()}`,
      title: task.title,
      dueDate: task.dueDate,
      dateCreated: now,
      status: task.status || 'To Do',
      comments: task.notes ? [task.notes] : [],
    };
    addTask(newTask);
    setSelectedTask(newTask);
    setIsModalOpen(true);
  };

  const handleNextInQueue = () => {
    const remaining = taskQueue.slice(1);
    setTaskQueue(remaining);
    if (remaining.length > 0) {
      openNextTask(remaining);
    } else {
      setShowQueueInfo(false);
    }
  };

  const handleSkipQueue = () => {
    setTaskQueue([]);
    setShowQueueInfo(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) handleImageUpload(file);
        break;
      }
    }
  };

  return (
    <div className="mt-8 p-6 bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl border-2 border-blue-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Camera className="text-blue-600" size={20} />
        Import Tasks from Screenshot
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        Upload or paste a screenshot - AI will extract tasks one by one
      </p>

      {showQueueInfo && taskQueue.length > 0 && (
        <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChevronRight className="text-blue-600" size={18} />
              <span className="text-sm font-medium text-blue-900">
                {taskQueue.length} task{taskQueue.length > 1 ? 's' : ''} remaining
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleNextInQueue}
                className="px-3 py-1 text-xs font-medium text-blue-700 bg-white border border-blue-300 rounded hover:bg-blue-50"
              >
                Next
              </button>
              <button
                onClick={handleSkipQueue}
                className="px-3 py-1 text-xs font-medium text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Optional Instructions for AI
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="e.g., Extract meeting action items"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={2}
          disabled={isProcessing}
        />
      </div>

      <div className="flex gap-3 mb-4">
        <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">
          <Upload size={16} />
          Upload
          <input
            type="file"
            accept="image/*"
            onChange={handleFileInput}
            className="hidden"
            disabled={isProcessing}
          />
        </label>
        <button
          onPaste={handlePaste}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          disabled={isProcessing}
        >
          <Camera size={16} />
          Paste
        </button>
      </div>

      <div
        onPaste={handlePaste}
        tabIndex={0}
        className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center text-sm text-gray-500 hover:border-blue-500 focus:border-blue-500 focus:outline-none"
      >
        {isProcessing ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="animate-spin text-blue-600" size={20} />
            <span className="text-blue-600 font-medium">Processing with AI...</span>
          </div>
        ) : (
          <span>Click and press Cmd+V to paste</span>
        )}
      </div>

      <div className="mt-3 text-xs text-gray-500">
        💡 Each task opens in the Add Task modal. Review and submit, then click Next for the next task in queue.
      </div>
    </div>
  );
}
