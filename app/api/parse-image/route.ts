import { NextRequest, NextResponse } from 'next/server';
import { getGeminiFallbackClient } from '@/lib/gemini-fallback';
import { verifyIdToken } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vision API can be slow

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized - missing token' }, { status: 401 });
    }
    
    const token = authHeader.substring(7);
    const user = await verifyIdToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized - invalid token' }, { status: 401 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured on server' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { image, instructions, text } = body; // image is base64 data URL

    if (!image && !text) {
      return NextResponse.json({ error: 'No image or text provided' }, { status: 400 });
    }

    // Initialize fallback client with multi-modal support
    const geminiClient = getGeminiFallbackClient({ requireMultiModal: true });

    const currentYear = new Date().getFullYear();
    const systemPrompt = `You are a task extraction assistant. You may receive an image (screenshot, photo, handwritten note, etc.) and/or plain text. Extract all tasks/to-dos from whichever inputs are provided.

  TEXT SUPPORT:
  - If text is provided, extract tasks from the text alone even if no image is provided
  - Separate the text into individual actionable tasks

IMPORTANT DATE RULES:
- If a date is mentioned WITHOUT a year (e.g., "Nov 15", "12/25"), automatically assume it's ${currentYear}
- If NO year is specified, use ${currentYear} as the default year
- Format all dates as ISO format: YYYY-MM-DD

TIME HANDLING:
- If a specific time is mentioned (e.g., "3pm", "14:00", "at 9:30"), add it to the "notes" field in this format: "Time: 3:00 PM" or "Time: 14:00"
- Times should ALWAYS be included in the notes field, never in the title

CLASS / COURSE CODES:
- When a course or class code like "RSM-333" or "CSC108" appears, place that code first in the task title followed by a colon or dash (e.g., "RSM-333: Submit assignment 2")

For each task, provide:
- title (string): The main task description (WITHOUT time if mentioned separately)
- dueDate (string | null): ISO date (YYYY-MM-DD). If date mentioned without year, use ${currentYear}. If no date mentioned, use null.
- status (string): One of: "Reminders", "Long Term Deadlines", "To Do", "Doing Today", "Doing Tomorrow", "Archived"
- priority (string | null): "high", "medium", "low", or null
- notes (string | null): Any additional context, subtasks, or details. If a time is mentioned, include it here as "Time: HH:MM AM/PM"

Return a JSON array of tasks. Example:
[
  {
    "title": "Complete project proposal",
    "dueDate": "${currentYear}-11-10",
    "status": "Doing Today",
    "priority": "high",
    "notes": "Include budget and timeline. Time: 5:00 PM"
  },
  {
    "title": "Call dentist",
    "dueDate": "${currentYear}-12-15",
    "status": "Reminders",
    "priority": null,
    "notes": "Time: 9:30 AM"
  }
]

If the image contains no tasks, return an empty array: []

${instructions ? `\nUser instructions: ${instructions}` : ''}

Extract all tasks from the provided image and/or text and return ONLY the JSON array, no additional text. Remember: dates without years default to ${currentYear}, times go in notes field, and any course code must lead the title.`;

    const promptParts: any[] = [systemPrompt];

    // Append user text when present so Gemini can split into individual tasks
    if (text) {
      promptParts.push(`User provided text to parse:\n${text}`);
    }

    // Convert base64 data URL to inline data format for Gemini
    if (image) {
      const base64Match = image.match(/^data:image\/(png|jpg|jpeg|gif|webp);base64,(.+)$/);
      if (!base64Match) {
        return NextResponse.json({ error: 'Invalid image format' }, { status: 400 });
      }
      const mimeType = `image/${base64Match[1]}`;
      const base64Data = base64Match[2];
      promptParts.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
    }

    const result = await geminiClient.generateContent(promptParts);

    const content = result.text.trim();
    const modelUsed = result.modelUsed;
    console.log(`[Parse Image] Used model: ${modelUsed} (${result.attemptsMade} attempts)`);


    // Try to parse JSON from response
    let tasks = [];
    try {
      // Remove markdown code fences if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, content];
      const jsonStr = jsonMatch[1] || content;
      tasks = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('Failed to parse LLM JSON:', content);
      return NextResponse.json(
        {
          error: 'Failed to parse structured response from vision model',
          raw: content,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      tasks, 
      raw: content, 
      success: true,
      modelUsed,
      attemptsMade: result.attemptsMade
    });
  } catch (error: any) {
    console.error('Vision parsing error:', error);
    
    // Check for quota exceeded errors
    if (error.message?.includes('quota') || error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
      return NextResponse.json(
        {
          error: '❌ Gemini API Quota Exceeded',
          message: 'The AI image parsing feature has reached its daily/monthly limit.',
          solutions: [
            '1. Get a new API key at: https://aistudio.google.com/apikey',
            '2. Wait for quota to reset (check: https://ai.dev/usage)',
            '3. Upgrade to paid tier for unlimited usage',
            '4. Or manually enter tasks for now'
          ],
          details: error.message,
          success: false,
        },
        { status: 429 }
      );
    }
    
    // Generic error
    return NextResponse.json(
      {
        error: error.message || 'Failed to parse image',
        success: false,
      },
      { status: 500 }
    );
  }
}
