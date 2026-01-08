## Gemini API Fallback System

### 🎯 Model Tier List (Optimized for Planner App)

#### **Tier S - Best Quality** ⭐⭐⭐
1. **gemini-2.5-flash** 
   - Limits: 5 RPM, 250K TPM, 20 RPD
   - ✅ Multi-modal (image + text)
   - Best balance of speed & quality
   
2. **gemini-2.5-flash-lite**
   - Limits: 10 RPM, 250K TPM, 20 RPD
   - ✅ Multi-modal
   - Higher RPM - excellent fallback

#### **Tier A - Good Fallbacks** ⭐⭐
3. **gemini-3-flash**
   - Limits: 5 RPM, 250K TPM, 20 RPD
   - ✅ Multi-modal
   - Experimental but capable

4. **gemini-2.5-flash-tts**
   - Limits: 3 RPM, 10K TPM, 10 RPD
   - ✅ Multi-modal
   - Lower limits but still viable

#### **Tier B - Emergency Fallback** ⭐
5. **gemini-1.5-flash**
   - Limits: 15 RPM, 1M TPM, 1500 RPD
   - ✅ Multi-modal
   - Older but stable with high limits

### 🔄 How It Works

The system automatically tries models in order:
```
Request → gemini-2.5-flash (Tier S)
  ↓ (quota exceeded)
→ gemini-2.5-flash-lite (Tier S)
  ↓ (quota exceeded)
→ gemini-3-flash (Tier A)
  ↓ (quota exceeded)
→ gemini-2.5-flash-tts (Tier A)
  ↓ (quota exceeded)
→ gemini-1.5-flash (Tier B)
  ↓ (quota exceeded)
→ Error: All models exhausted
```

### 📊 Features

- **Automatic Fallback**: Seamlessly switches models when quota hit
- **Smart Detection**: Identifies quota errors (429, rate limit, etc.)
- **Logging**: Console logs show which model was used
- **Multi-Modal Support**: Filters models based on image/text requirements
- **Reset Logic**: Resets to best model after successful requests

### 🚀 Usage

The fallback system is already integrated into:
- `/api/parse-image` - Image task extraction (requires multi-modal)
- `/api/ai-edit-tasks` - Batch task editing (text-only mode)

### 📈 Benefits

1. **Higher Availability**: 5x more quota across different models
2. **Cost Efficient**: Uses best model when available, falls back when needed
3. **Transparent**: Returns which model was used in response
4. **Resilient**: Non-quota errors still fail fast (no unnecessary retries)

### 🔍 Response Format

API responses now include:
```json
{
  "tasks": [...],
  "success": true,
  "modelUsed": "gemini-2.5-flash-lite",
  "attemptsMade": 2
}
```

This tells you exactly which model processed your request and how many attempts were needed.
