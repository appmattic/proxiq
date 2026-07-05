export interface Embedder {
  embed(text: string): Promise<number[]>;
}

export function createEmbedder(): Embedder {
  let pipeline: ((text: string, opts: Record<string, unknown>) => Promise<{ data: Float32Array }>) | null = null;

  return {
    async embed(text: string): Promise<number[]> {
      if (!pipeline) {
        // Lazy-load to avoid startup cost when embeddings are disabled
        const { pipeline: createPipeline } = await import("@xenova/transformers");
        pipeline = await createPipeline(
          "feature-extraction",
          "Xenova/all-MiniLM-L6-v2"
        ) as typeof pipeline;
      }
      const output = await pipeline!(text, { pooling: "mean", normalize: true });
      return Array.from(output.data);
    },
  };
}
