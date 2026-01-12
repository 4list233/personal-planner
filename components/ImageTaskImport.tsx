'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { Camera, Upload, Loader2, ChevronRight, Type } from 'lucide-react';
import { usePlannerStore, getAuthHeaders } from '@/lib/store';
import { TaskStatus } from '@/lib/types';

interface ParsedTask {
  title: string;
  dueDate?: string;
  status?: TaskStatus;
  notes?: string | null;
}

const COURSE_CODE_REGEX = /\b([A-Za-z]{2,5}-?\d{3,4})\b/;

function normalizeTitleWithCourseCode(title: string): string {
  const trimmed = title.trim();
  const match = trimmed.match(COURSE_CODE_REGEX);
  if (!match) return trimmed;

  const courseCode = match[1].toUpperCase();
  if (trimmed.toUpperCase().startsWith(courseCode)) return trimmed;

  const withoutCode = trimmed.replace(match[0], '').replace(/^[:\-\s]+/, '').trim();
  return withoutCode ? `${courseCode}: ${withoutCode}` : courseCode;
}

export default function ImageTaskImport() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [textInput, setTextInput] = useState('');
  const [taskQueue, setTaskQueue] = useState<ParsedTask[]>([]);
  const [showQueueInfo, setShowQueueInfo] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [queueSource, setQueueSource] = useState<'gemini-image' | 'gemini-text' | null>(null);
  const [queueId, setQueueId] = useState<string | null>(null);
  const { addTask, setIsModalOpen, setSelectedTask, deleteTask } = usePlannerStore();

  useEffect(() => {
    const handleModalAction = (event: Event) => {
      const detail = (event as CustomEvent<{ action: 'submit' | 'cancel'; taskId: string }>).detail;
      if (!detail || !activeTaskId || detail.taskId !== activeTaskId) return;

      handleNextInQueue(detail.action === 'submit' ? 'submitted' : 'skipped');
    };

    window.addEventListener('task-modal-action', handleModalAction as EventListener);
    return () => window.removeEventListener('task-modal-action', handleModalAction as EventListener);
  }, [activeTaskId, queueSource, queueId]);

  const mapTasksFromLLM = (llmTasks: any[]): ParsedTask[] =>
    llmTasks.map((t: any) => ({
      title: normalizeTitleWithCourseCode(t.title || 'Untitled'),
      dueDate: t.dueDate || undefined,
      status: (t.status as TaskStatus) || 'To Do',
      notes: t.notes || null,
    }));

  const enqueueTasks = (llmTasks: any[], source: 'gemini-image' | 'gemini-text') => {
    if (llmTasks.length === 0) {
      alert('No tasks detected');
      return;
    }

    const tasks = mapTasksFromLLM(llmTasks);
    const newQueueId = `queue-${Date.now()}`;

    setQueueId(newQueueId);
    setQueueSource(source);
    setTaskQueue(tasks);
    setShowQueueInfo(true);
    openNextTask(tasks, source, newQueueId);
  };

  const openNextTask = (
    queue: ParsedTask[],
    source: 'gemini-image' | 'gemini-text',
    queueKey: string
  ) => {
    if (queue.length === 0) {
      setShowQueueInfo(false);
      setTaskQueue([]);
      setActiveTaskId(null);
      setQueueId(null);
      setQueueSource(null);
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
      source,
      queueId: queueKey,
      isDraft: true,
    };
    addTask(newTask as any);
    setSelectedTask(newTask as any);
    setIsModalOpen(true);
    setActiveTaskId(newTask.id);
  };

  const handleNextInQueue = (mode: 'submitted' | 'skipped' = 'skipped') => {
    setIsModalOpen(false);
    setSelectedTask(null);

    if (activeTaskId && mode === 'skipped') {
      void deleteTask(activeTaskId);
    }
    if (mode === 'submitted' || mode === 'skipped') {
      setActiveTaskId(null);
    }

    setTaskQueue((prev) => {
      const remaining = prev.slice(1);

      if (!queueSource || !queueId) {
        setShowQueueInfo(false);
        setActiveTaskId(null);
        setQueueSource(null);
        setQueueId(null);
        return [];
      }

      if (remaining.length > 0) {
        setTimeout(() => openNextTask(remaining, queueSource, queueId), 120);
      } else {
        setShowQueueInfo(false);
        setActiveTaskId(null);
        setQueueSource(null);
        setQueueId(null);
      }

      return remaining;
    });
  };

  const handleSkipQueue = () => {
    if (activeTaskId) {
      void deleteTask(activeTaskId);
    }
    setTaskQueue([]);
    setShowQueueInfo(false);
    setActiveTaskId(null);
    setQueueId(null);
    setQueueSource(null);
    setIsModalOpen(false);
    setSelectedTask(null);
  };

  const handleImageUpload = async (file: File) => {
    if (isProcessing) return;
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
      enqueueTasks(data.tasks || [], 'gemini-image');
    } catch (error) {
      console.error('Error:', error);
      alert(`Failed: ${(error as any).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTextSubmit = async (input?: string) => {
    if (isProcessing) return;
    const payload = typeof input === 'string' ? input : textInput;
    if (!payload.trim()) {
      alert('Please paste text to parse');
      return;
    }

    setIsProcessing(true);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/parse-image', {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: payload, instructions }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Text parsing failed');
      }

      const data = await res.json();
      enqueueTasks(data.tasks || [], 'gemini-text');
      setTextInput('');
    } catch (error) {
      console.error('Error:', error);
      alert(`Failed: ${(error as any).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (isProcessing) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    let handled = false;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) handleImageUpload(file);
        handled = true;
        break;
      }
    }

    if (!handled) {
      const text = e.clipboardData?.getData('text/plain');
      if (text?.trim()) {
        handleTextSubmit(text);
        handled = true;
      }
    }
  };

  return (
    <div className="mt-8 p-6 bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl border-2 border-blue-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Camera className="text-blue-600" size={20} />
        Import Tasks with Gemini
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        Upload or paste a screenshot, or send raw text — AI will split everything into individual tasks
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
                Skip current
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

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
          <Type size={16} className="text-purple-600" />
          Paste text to split into tasks
        </label>
        <textarea
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Paste class notes, syllabus items (e.g., RSM-333 assignment 2 due Nov 12), or any checklist text..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          rows={3}
          disabled={isProcessing}
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => handleTextSubmit()}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-70"
          >
            Send to Gemini
          </button>
          <button
            onClick={() => setTextInput('')}
            disabled={isProcessing || !textInput}
            className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg disabled:opacity-50"
          >
            Clear
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Course codes (e.g., RSM-333) will be placed at the front of each task name automatically.
        </p>
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
          <span>Click and press Cmd+V to paste an image or text</span>
        )}
      </div>

      <div className="mt-3 text-xs text-gray-500">
        💡 Each task opens in the Add Task modal. Press Enter to submit, Esc/Cancel to skip, and the next task will load automatically.
      </div>
    </div>
  );
}
