import type { Config } from "../config/schema.js";
import type { RelayLogger } from "../utils/logger.js";

interface Message {
  role: string;
  content: unknown;
}

function estimateTokens(messages: Message[]): number {
  // Rough estimate: 4 chars per token
  const text = JSON.stringify(messages);
  return Math.ceil(text.length / 4);
}

export async function compressContext(
  messages: Message[],
  config: Config,
  authHeader: string,
  logger: RelayLogger
): Promise<{ messages: Message[]; compressed: boolean }> {
  const { triggerTokens, retainTurns } = config.optimizer.compression;

  const estimated = estimateTokens(messages);
  if (estimated < triggerTokens) {
    return { messages, compressed: false };
  }

  const keepCount = retainTurns * 2; // each turn = user + assistant
  if (messages.length <= keepCount) {
    return { messages, compressed: false };
  }

  const toSummarize = messages.slice(0, messages.length - keepCount);
  const toKeep = messages.slice(messages.length - keepCount);

  try {
    const summaryPrompt = `Summarize the following conversation in 2-3 concise paragraphs, preserving key facts, decisions, and context:\n\n${JSON.stringify(toSummarize)}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": authHeader.replace(/^Bearer\s+/i, ""),
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{ role: "user", content: summaryPrompt }],
      }),
    });

    if (!response.ok) {
      logger.warn("Context compression failed — passing through unchanged");
      return { messages, compressed: false };
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    const summary = data.content[0]?.text ?? "";

    const compressedMessages: Message[] = [
      {
        role: "user",
        content: `[Previous conversation summary]\n${summary}`,
      },
      {
        role: "assistant",
        content: "Understood. I have the context from the previous conversation.",
      },
      ...toKeep,
    ];

    logger.debug(
      { originalTurns: messages.length, compressedTurns: compressedMessages.length },
      "[optimizer] context compressed"
    );

    return { messages: compressedMessages, compressed: true };
  } catch {
    logger.warn("Context compression failed — passing through unchanged");
    return { messages, compressed: false };
  }
}
