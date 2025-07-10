import ollama from 'ollama'

export const getEmbedding = async (prompt: string) => {
  const response = await ollama.embeddings({
    model: 'llama3',
    prompt,
  })
  return response.embedding
} 