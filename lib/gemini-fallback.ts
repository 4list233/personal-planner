/**
 * Smart Gemini Model Fallback System
 * Automatically falls back to next best model when quota is reached
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

export interface ModelConfig {
  name: string;
  rpm: number;
  tpm: number;
  rpd: number;
  supportsMultiModal: boolean;
  tier: 'S' | 'A' | 'B';
  description: string;
}

/**
 * Model tier list optimized for planner use case
 * Ordered by preference: best quality -> most available
 */
export const MODEL_TIER_LIST: ModelConfig[] = [
  // Tier S - Best Quality
  {
    name: 'gemini-2.5-flash',
    rpm: 5,
    tpm: 250000,
    rpd: 20,
    supportsMultiModal: true,
    tier: 'S',
    description: 'Latest flash model - best balance of speed & quality',
  },
  {
    name: 'gemini-2.5-flash-lite',
    rpm: 10,
    tpm: 250000,
    rpd: 20,
    supportsMultiModal: true,
    tier: 'S',
    description: 'Higher RPM limit - excellent fallback',
  },
  // Tier A - Good Fallbacks
  {
    name: 'gemini-3-flash',
    rpm: 5,
    tpm: 250000,
    rpd: 20,
    supportsMultiModal: true,
    tier: 'A',
    description: 'Experimental but capable',
  },
  {
    name: 'gemini-2.5-flash-tts',
    rpm: 3,
    tpm: 10000,
    rpd: 10,
    supportsMultiModal: true,
    tier: 'A',
    description: 'Multi-modal TTS variant',
  },
  // Tier B - Emergency Text-Only Fallback
  {
    name: 'gemini-1.5-flash',
    rpm: 15,
    tpm: 1000000,
    rpd: 1500,
    supportsMultiModal: true,
    tier: 'B',
    description: 'Older but stable with high limits',
  },
];

export interface GeminiFallbackOptions {
  requireMultiModal?: boolean;
  maxRetries?: number;
  onFallback?: (fromModel: string, toModel: string, error: string) => void;
}

export class GeminiFallbackClient {
  private genAI: GoogleGenerativeAI;
  private currentModelIndex: number = 0;
  private attemptCounts: Map<string, number> = new Map();
  private options: Required<GeminiFallbackOptions>;

  constructor(apiKey: string, options: GeminiFallbackOptions = {}) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.options = {
      requireMultiModal: options.requireMultiModal ?? true,
      maxRetries: options.maxRetries ?? MODEL_TIER_LIST.length,
      onFallback: options.onFallback ?? (() => {}),
    };
  }

  /**
   * Get the current best available model
   */
  private getNextModel(): ModelConfig | null {
    const availableModels = MODEL_TIER_LIST.filter(
      (m) => !this.options.requireMultiModal || m.supportsMultiModal
    );

    if (this.currentModelIndex >= availableModels.length) {
      return null; // All models exhausted
    }

    return availableModels[this.currentModelIndex];
  }

  /**
   * Check if error is quota-related
   */
  private isQuotaError(error: any): boolean {
    const errorStr = error?.message?.toLowerCase() || '';
    return (
      errorStr.includes('quota') ||
      errorStr.includes('429') ||
      errorStr.includes('too many requests') ||
      errorStr.includes('rate limit') ||
      errorStr.includes('resource has been exhausted')
    );
  }

  /**
   * Generate content with automatic fallback on quota errors
   */
  async generateContent(
    prompt: string | any[],
    options?: { multiModal?: boolean }
  ): Promise<{ text: string; modelUsed: string; attemptsMade: number }> {
    let lastError: Error | null = null;
    let attemptsMade = 0;

    // Override multiModal requirement if explicitly specified
    if (options?.multiModal !== undefined) {
      this.options.requireMultiModal = options.multiModal;
    }

    while (this.currentModelIndex < this.options.maxRetries) {
      const modelConfig = this.getNextModel();
      
      if (!modelConfig) {
        throw new Error(
          `All ${this.options.maxRetries} model fallbacks exhausted. Last error: ${lastError?.message}`
        );
      }

      try {
        attemptsMade++;
        const model = this.genAI.getGenerativeModel({ model: modelConfig.name });
        
        console.log(`[Gemini Fallback] Attempting with model: ${modelConfig.name} (Tier ${modelConfig.tier})`);
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Success! Reset for next time
        console.log(`[Gemini Fallback] ✅ Success with ${modelConfig.name}`);
        this.currentModelIndex = 0; // Reset to best model for next request
        
        return {
          text,
          modelUsed: modelConfig.name,
          attemptsMade,
        };
      } catch (error: any) {
        lastError = error;
        console.error(`[Gemini Fallback] ❌ Error with ${modelConfig.name}:`, error.message);

        if (this.isQuotaError(error)) {
          // Quota error - try next model
          const nextModelConfig = MODEL_TIER_LIST[this.currentModelIndex + 1];
          
          if (nextModelConfig) {
            console.log(
              `[Gemini Fallback] 🔄 Quota exceeded for ${modelConfig.name}. Falling back to ${nextModelConfig.name}...`
            );
            
            this.options.onFallback(
              modelConfig.name,
              nextModelConfig.name,
              error.message
            );
          }
          
          this.currentModelIndex++;
          // Continue to next iteration
        } else {
          // Non-quota error - throw immediately
          throw new Error(
            `Model ${modelConfig.name} failed with non-quota error: ${error.message}`
          );
        }
      }
    }

    // All retries exhausted
    throw new Error(
      `All ${this.options.maxRetries} model attempts failed. Last error: ${lastError?.message}`
    );
  }

  /**
   * Get current model info
   */
  getCurrentModelInfo(): ModelConfig | null {
    return this.getNextModel();
  }

  /**
   * Reset to start from best model again
   */
  reset(): void {
    this.currentModelIndex = 0;
    this.attemptCounts.clear();
  }

  /**
   * Get usage statistics
   */
  getStats(): { model: string; attempts: number }[] {
    return Array.from(this.attemptCounts.entries()).map(([model, attempts]) => ({
      model,
      attempts,
    }));
  }
}

/**
 * Singleton instance for easy reuse across API routes
 */
let fallbackClient: GeminiFallbackClient | null = null;

export function getGeminiFallbackClient(options?: GeminiFallbackOptions): GeminiFallbackClient {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  if (!fallbackClient) {
    fallbackClient = new GeminiFallbackClient(apiKey, {
      ...options,
      onFallback: (from, to, error) => {
        console.log(`[Gemini] Model fallback: ${from} → ${to}`);
        console.log(`[Gemini] Reason: ${error}`);
        options?.onFallback?.(from, to, error);
      },
    });
  }

  return fallbackClient;
}

/**
 * Reset the singleton (useful for testing or after config changes)
 */
export function resetGeminiFallbackClient(): void {
  fallbackClient = null;
}
