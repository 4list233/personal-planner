import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { verifyIdToken } from '@/lib/firebase-admin';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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

    const { tasks, prompt } = await request.json();

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json({ error: 'No tasks provided' }, { status: 400 });
    }

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'No prompt provided' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const systemPrompt = `You are a task management AI assistant. The user has multiple tasks and wants to batch edit them.

USER INSTRUCTION: "${prompt}"

CURRENT TASKS:
${tasks.map((t: any, i: number) => `
Task ${i + 1}:
- ID: ${t.id}
- Title: ${t.title}
- Due Date: ${t.dueDate || 'Not set'}
- Status: ${t.status}
- Notes: ${t.comments?.join(', ') || 'None'}
`).join('\n')}

Apply the user's instruction to ALL tasks and return a JSON array with the edited tasks.

RULES:
1. Keep the same ID for each task
2. Preserve information not mentioned in the instruction
3. If adding text, be smart about placement (e.g., course codes go at the start)
4. Return valid JSON only

Return format:
{
  "editedTasks": [
    {
      "id": "original-id",
      "title": "edited title",
      "dueDate": "yyyy-mm-dd or null",
      "status": "status",
      "comments": ["array", "of", "notes"]
    }
  ]
}`;

    const result = await model.generateContent(systemPrompt);
    const text = result.response.text();
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI did not return valid JSON');
    }

    const aiResponse = JSON.parse(jsonMatch[0]);

    if (!aiResponse.editedTasks || !Array.isArray(aiResponse.editedTasks)) {
      throw new Error('Invalid AI response format');
    }

    return NextResponse.json(aiResponse);
  } catch (error: any) {
    console.error('AI edit error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process AI edit' },
      { status: 500 }
    );
  }
}
