// Similarity utilities for consensus engine
// Uses cosine similarity on TF-IDF-style term frequency vectors
// No external ML dependency needed — good enough for output comparison

interface TermFreqs {
  [term: string]: number
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2) // drop 1-2 char tokens
}

function termFrequencies(tokens: string[]): TermFreqs {
  const tf: TermFreqs = {}
  for (const t of tokens) {
    tf[t] = (tf[t] || 0) + 1
  }
  return tf
}

function cosineSimilarity(a: TermFreqs, b: TermFreqs): number {
  const allTerms = new Set([...Object.keys(a), ...Object.keys(b)])
  let dotProduct = 0
  let magA = 0
  let magB = 0

  for (const term of allTerms) {
    const va = a[term] || 0
    const vb = b[term] || 0
    dotProduct += va * vb
    magA += va * va
    magB += vb * vb
  }

  magA = Math.sqrt(magA)
  magB = Math.sqrt(magB)

  if (magA === 0 || magB === 0) return 0
  return dotProduct / (magA * magB)
}

export interface SimilarityPair {
  outputA: string // id
  outputB: string // id
  score: number   // 0-1
}

/**
 * Compute pairwise similarity between output descriptions.
 * Returns sorted list of pairs (most similar first).
 */
export function computeOutputSimilarity(
  outputs: Array<{ id: string; description: string; title: string }>
): SimilarityPair[] {
  const pairs: SimilarityPair[] = []

  for (let i = 0; i < outputs.length; i++) {
    for (let j = i + 1; j < outputs.length; j++) {
      const textA = `${outputs[i].title} ${outputs[i].description}`
      const textB = `${outputs[j].title} ${outputs[j].description}`

      const tfA = termFrequencies(tokenize(textA))
      const tfB = termFrequencies(tokenize(textB))

      const score = Math.round(cosineSimilarity(tfA, tfB) * 1000) / 1000

      pairs.push({ outputA: outputs[i].id, outputB: outputs[j].id, score })
    }
  }

  return pairs.sort((a, b) => b.score - a.score)
}

/**
 * Group outputs into clusters based on similarity threshold.
 * Outputs with similarity >= threshold are considered aligned.
 */
export function clusterOutputs(
  outputs: Array<{ id: string; description: string; title: string }>,
  threshold: number = 0.3
): Array<{ clusterId: number; outputIds: string[]; avgScore: number }> {
  const pairs = computeOutputSimilarity(outputs)
  const clusters: Array<{ ids: Set<string>; scores: number[] }> = []

  for (const pair of pairs) {
    if (pair.score < threshold) continue

    // Find existing cluster containing either output
    let merged = false
    for (const cluster of clusters) {
      if (cluster.ids.has(pair.outputA) || cluster.ids.has(pair.outputB)) {
        cluster.ids.add(pair.outputA)
        cluster.ids.add(pair.outputB)
        cluster.scores.push(pair.score)
        merged = true
        break
      }
    }

    if (!merged) {
      clusters.push({
        ids: new Set([pair.outputA, pair.outputB]),
        scores: [pair.score],
      })
    }
  }

  // Add unclustered outputs as singletons
  const clustered = new Set<string>()
  for (const c of clusters) {
    for (const id of c.ids) clustered.add(id)
  }

  for (const o of outputs) {
    if (!clustered.has(o.id)) {
      clusters.push({ ids: new Set([o.id]), scores: [1.0] })
    }
  }

  return clusters.map((c, i) => ({
    clusterId: i + 1,
    outputIds: [...c.ids],
    avgScore: c.scores.length > 0
      ? Math.round((c.scores.reduce((a, b) => a + b, 0) / c.scores.length) * 1000) / 1000
      : 0,
  }))
}

/**
 * Generate a solution summary from a set of approved outputs.
 * Finds common themes and synthesizes them.
 */
export function synthesizeSolution(
  outputs: Array<{ id: string; title: string; description: string; status: string }>
): string {
  const approved = outputs.filter((o) => o.status === 'APPROVED')
  if (approved.length === 0) return ''

  // Collect all tokens across approved outputs
  const globalTf: TermFreqs = {}
  for (const o of approved) {
    const tokens = tokenize(`${o.title} ${o.description}`)
    for (const t of tokens) {
      globalTf[t] = (globalTf[t] || 0) + 1
    }
  }

  // Find terms appearing in multiple outputs (consensus terms)
  let termsInOutput: { [term: string]: number } = {}
  for (const o of approved) {
    const tokens = new Set(tokenize(`${o.title} ${o.description}`))
    for (const t of tokens) {
      termsInOutput[t] = (termsInOutput[t] || 0) + 1
    }
  }

  const consensusTerms = Object.entries(termsInOutput)
    .filter(([, count]) => count >= Math.min(2, Math.ceil(approved.length * 0.5)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term]) => term)

  const titles = approved.map((o) => o.title).join(', ')

  let summary = `Synthesized from ${approved.length} approved output${approved.length > 1 ? 's' : ''}: ${titles}`

  if (consensusTerms.length > 0) {
    summary += `\n\nCommon themes: ${consensusTerms.join(', ')}`
  }

  return summary
}
