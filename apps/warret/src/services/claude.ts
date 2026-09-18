import type { ParsedWarranty } from './warrantyParser';

export function isClaudeAvailable(): boolean {
  return false;
}

export async function parseWarrantyWithClaude(_extractedText: string): Promise<ParsedWarranty> {
  throw new Error('AI document parsing must run on a server-side endpoint, not in the client app.');
}
