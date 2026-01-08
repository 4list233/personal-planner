/**
 * Test script for Gemini Fallback System
 * Run with: npm run test:gemini-fallback
 */

import { getGeminiFallbackClient, MODEL_TIER_LIST } from '../lib/gemini-fallback';
import * as dotenv from 'dotenv';

dotenv.config();

async function testFallbackSystem() {
  console.log('🧪 Testing Gemini Fallback System\n');
  console.log('=' .repeat(60));
  
  // Display model tier list
  console.log('\n📊 Available Models (in priority order):\n');
  MODEL_TIER_LIST.forEach((model, index) => {
    console.log(`${index + 1}. [Tier ${model.tier}] ${model.name}`);
    console.log(`   Limits: ${model.rpm} RPM, ${model.tpm} TPM, ${model.rpd} RPD`);
    console.log(`   Multi-Modal: ${model.supportsMultiModal ? '✅' : '❌'}`);
    console.log(`   ${model.description}\n`);
  });

  console.log('=' .repeat(60));
  console.log('\n🔄 Testing Text Generation (text-only mode):\n');

  try {
    const client = getGeminiFallbackClient({ 
      requireMultiModal: false,
      onFallback: (from, to, error) => {
        console.log(`⚠️  Fallback triggered: ${from} → ${to}`);
        console.log(`   Reason: ${error}\n`);
      }
    });

    const testPrompt = 'Write a simple task for a planner app in JSON format with title, dueDate, and status fields.';
    
    const result = await client.generateContent(testPrompt);
    
    console.log('✅ Success!');
    console.log(`   Model Used: ${result.modelUsed}`);
    console.log(`   Attempts: ${result.attemptsMade}`);
    console.log(`   Response Length: ${result.text.length} characters\n`);
    console.log('   Response Preview:');
    console.log('   ' + result.text.substring(0, 200) + '...\n');
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
  }

  console.log('=' .repeat(60));
  console.log('\n💡 How to use in your code:\n');
  console.log(`
import { getGeminiFallbackClient } from '@/lib/gemini-fallback';

// For image processing (requires multi-modal)
const client = getGeminiFallbackClient({ requireMultiModal: true });
const result = await client.generateContent([prompt, imageData]);

// For text-only tasks
const client = getGeminiFallbackClient({ requireMultiModal: false });
const result = await client.generateContent(textPrompt);

// Access results
console.log('Model used:', result.modelUsed);
console.log('Attempts:', result.attemptsMade);
console.log('Response:', result.text);
  `);
  
  console.log('=' .repeat(60));
}

testFallbackSystem().catch(console.error);
