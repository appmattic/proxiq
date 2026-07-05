export interface Embedder {
  embed(text: string): Promise<number[]>;
}

type FeaturePipeline = (
  text: string,
  opts: Record<string, unknown>
) => Promise<{ data: Float32Array }>;

export function createEmbedder(): Embedder {
  let pipeline: FeaturePipeline | null = null;

  return {
    async embed(text: string): Promise<number[]> {
      if (!pipeline) {
        // Lazy-load to avoid startup cost when embeddings are disabled
        const { pipeline: createPipeline } = await import(
          "@xenova/transformers"
        );
        const created = await createPipeline(
          "feature-extraction",
          "Xenova/all-MiniLM-L6-v2"
        );
        pipeline = created as unknown as FeaturePipeline;
      }
      const output = await pipeline?.(text, {
        pooling: "mean",
        normalize: true,
      });
      return Array.from(output.data);
    },
  };
}
