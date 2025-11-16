import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
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
    const { image, instructions } = body; // image is base64 data URL

    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' }); // Gemini 2.0 Flash - Free tier: 15 RPM, 1M TPM, 200 RPD

    const currentYear = new Date().getFullYear();
    const systemPrompt = `You are a task extraction assistant. Analyze the provided image (screenshot, photo, handwritten note, etc.) and extract all tasks/to-dos.

IMPORTANT DATE RULES:
- If a date is mentioned WITHOUT a year (e.g., "Nov 15", "12/25"), automatically assume it's ${currentYear}
- If NO year is specified, use ${currentYear} as the default year
- Format all dates as ISO format: YYYY-MM-DD

TIME HANDLING:
- If a specific time is mentioned (e.g., "3pm", "14:00", "at 9:30"), add it to the "notes" field in this format: "Time: 3:00 PM" or "Time: 14:00"
- Times should ALWAYS be included in the notes field, never in the title

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

Extract all tasks from the image and return ONLY the JSON array, no additional text. Remember: dates without years default to ${currentYear}, and times go in notes field.`;

    // Convert base64 data URL to inline data format for Gemini
    const base64Match = image.match(/^data:image\/(png|jpg|jpeg|gif|webp);base64,(.+)$/);
    if (!base64Match) {
      return NextResponse.json({ error: 'Invalid image format' }, { status: 400 });
    }
    const mimeType = `image/${base64Match[1]}`;
    const base64Data = base64Match[2];

    const result = await model.generateContent([
      systemPrompt,
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
    ]);

    const response = await result.response;
    const content = response.text().trim();

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

    return NextResponse.json({ tasks, raw: content, success: true });
  } catch (error: any) {
    console.error('Vision parsing error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to parse image',
        success: false,
      },
      { status: 500 }
    );
  }
}
