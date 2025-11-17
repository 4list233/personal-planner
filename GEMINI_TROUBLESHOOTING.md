# Gemini API Troubleshooting Guide

## Error: Quota Exceeded

If you see this error:
```
Failed: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent: [429 Too Many Requests] You exceeded your current quota
```

### Solutions:

### Option 1: Get a New API Key (Quickest)
1. Visit: https://aistudio.google.com/apikey
2. Click "Create API Key"
3. Copy the new key
4. Update your `.env.local`:
   ```env
   GEMINI_API_KEY=your_new_api_key_here
   ```
5. Restart your dev server: `npm run dev`
6. Redeploy to Vercel (update environment variables)

### Option 2: Check Your Usage
1. Visit: https://ai.google.dev/gemini-api/docs/rate-limits
2. Check your quota at: https://console.cloud.google.com/
3. Free tier limits:
   - **Requests per minute (RPM)**: 15
   - **Tokens per minute (TPM)**: 1,000,000
   - **Requests per day (RPD)**: 1,500

### Option 3: Upgrade to Paid Tier
1. Visit: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com
2. Enable billing for unlimited usage
3. Pay-as-you-go pricing: Very affordable for personal use

### Option 4: Use a Different Model
Edit `app/api/parse-image/route.ts` and change the model:

```typescript
// From:
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

// To (older but stable):
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
```

### Option 5: Temporarily Disable AI Feature
If you don't need the image parsing feature right now, you can manually enter tasks using the "Add Task" button.

## Free Tier Limits

**Gemini 2.0 Flash (Experimental)**
- 15 requests per minute
- 1M tokens per minute  
- 200 requests per day

**Gemini 1.5 Flash (Stable)**
- 15 requests per minute
- 1M tokens per minute
- 1,500 requests per day ← Much higher!

## Best Practices

1. **Cache results** - Don't re-parse the same image
2. **Batch requests** - Parse multiple tasks from one image
3. **Use smaller images** - Compress images before uploading
4. **Monitor usage** - Keep track of daily request count

## Current Setup

Your app uses Gemini for:
- **Image Task Parsing** - Extract tasks from screenshots/photos (`/api/parse-image`)
- **AI Task Editing** - Batch edit tasks with AI (`/api/ai-edit-tasks`)

Both endpoints require Firebase authentication, which helps prevent quota abuse from unauthorized users.

## For Vercel Deployment

Make sure to add the Gemini API key to Vercel:
1. Go to: https://vercel.com/dashboard
2. Select your project
3. Settings → Environment Variables
4. Add: `GEMINI_API_KEY` = `your_api_key`
5. Redeploy

## Support Links

- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Pricing](https://ai.google.dev/pricing)
- [Google AI Studio](https://aistudio.google.com/)
