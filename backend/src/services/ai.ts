import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export interface GeneratedMetadata {
  summary: string;
  tags: string[];
}

export const generateVideoInsights = async (
  title: string,
  userDescription: string
): Promise<GeneratedMetadata> => {
  if (!ai) {
    console.warn('[AI Service] GEMINI_API_KEY not configured. Skipping automated metadata generation.');
    return {
      summary: userDescription || 'No description available.',
      tags: ['video', 'mytube'],
    };
  }

  try {
    const prompt = `
You are an expert video platform SEO and content optimizer.
Analyze this video metadata:
- Title: "${title}"
- Raw Description: "${userDescription}"

Provide a clean JSON response with:
1. "summary": An engaging 2-3 sentence overview suitable for viewers.
2. "tags": An array of 5-8 relevant lowercase search tags (no # symbols).

Return ONLY valid JSON matching this format:
{"summary": "...", "tags": ["tag1", "tag2"]}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text?.trim() || '{}';
    const parsed = JSON.parse(responseText);

    return {
      summary: parsed.summary || userDescription,
      tags: Array.isArray(parsed.tags) ? parsed.tags : ['streaming'],
    };
  } catch (error) {
    console.error('[AI Service] Failed to generate insights:', error);
    return {
      summary: userDescription || '',
      tags: [],
    };
  }
};