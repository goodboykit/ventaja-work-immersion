import { GoogleGenerativeAI } from "@google/generative-ai";
import { AppError } from "../domain/errors.ts";

export interface GeminiClient {
  generateAnswer(prompt: string): Promise<string>;
}

const MODELS = ["gemini-2.5-flash", "gemini-3.8-flash"];

export class GoogleGeminiClient implements GeminiClient {
  private readonly genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateAnswer(prompt: string): Promise<string> {
    for (const modelName of MODELS) {
      try {
        const model = this.genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if (status === 503 || status === 429) continue;
        throw new AppError(502, "ai_error", "The AI assistant is temporarily unavailable. Please try again.");
      }
    }
    throw new AppError(503, "ai_busy", "The AI assistant is busy right now. Please try again in a moment.");
  }
}
