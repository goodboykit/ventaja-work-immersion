import type { GeminiClient } from "../../src/services/gemini-client.ts";

export class FakeGeminiClient implements GeminiClient {
  lastPrompt = "";
  cannedAnswer = "You have 5 pending invoices.";

  async generateAnswer(prompt: string): Promise<string> {
    this.lastPrompt = prompt;
    return this.cannedAnswer;
  }
}
