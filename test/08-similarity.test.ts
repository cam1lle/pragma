import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeOutputSimilarity, clusterOutputs, synthesizeSolution } from '../src/lib/similarity.js'

describe('Similarity Engine', () => {
  describe('computeOutputSimilarity', () => {
    it('returns empty array for single output', () => {
      const outputs = [{ id: '1', title: 'A', description: 'Test' }]
      const pairs = computeOutputSimilarity(outputs)
      assert.equal(pairs.length, 0)
    })

    it('computes pairwise similarity for multiple outputs', () => {
      const outputs = [
        { id: '1', title: 'Climate Analysis', description: 'Analysis of climate data patterns' },
        { id: '2', title: 'Weather Study', description: 'Study of weather data patterns' },
        { id: '3', title: 'Finance Report', description: 'Financial market analysis report' },
      ]
      const pairs = computeOutputSimilarity(outputs)
      assert.equal(pairs.length, 3) // C(3,2) = 3 pairs
      // Climate and Weather should be more similar than Finance
      assert.ok(pairs[0].score > pairs[pairs.length - 1].score)
    })

    it('identical outputs have similarity 1.0', () => {
      const outputs = [
        { id: '1', title: 'Same', description: 'Identical text here' },
        { id: '2', title: 'Same', description: 'Identical text here' },
      ]
      const pairs = computeOutputSimilarity(outputs)
      assert.equal(pairs[0].score, 1.0)
    })

    it('completely different outputs have low similarity', () => {
      const outputs = [
        { id: '1', title: 'ABC', description: 'The quick brown fox jumps over the lazy dog' },
        { id: '2', title: 'XYZ', description: 'Quantum computing enables parallel processing' },
      ]
      const pairs = computeOutputSimilarity(outputs)
      assert.ok(pairs[0].score < 0.3)
    })

    it('scores are between 0 and 1', () => {
      const outputs = [
        { id: '1', title: 'A', description: 'Some text' },
        { id: '2', title: 'B', description: 'Other text' },
        { id: '3', title: 'C', description: 'More text' },
      ]
      const pairs = computeOutputSimilarity(outputs)
      for (const pair of pairs) {
        assert.ok(pair.score >= 0 && pair.score <= 1)
      }
    })
  })

  describe('clusterOutputs', () => {
    it('clusters similar outputs together', () => {
      const outputs = [
        { id: '1', title: 'Climate Data', description: 'Climate data analysis and patterns' },
        { id: '2', title: 'Weather Data', description: 'Weather data analysis and patterns' },
        { id: '3', title: 'Stock Prices', description: 'Stock price movement analysis' },
      ]
      const clusters = clusterOutputs(outputs, 0.3)
      // Should have at least 2 clusters (climate+weather together, stock separate)
      assert.ok(clusters.length >= 2)
    })

    it('all outputs appear in exactly one cluster', () => {
      const outputs = [
        { id: 'a', title: 'A', description: 'Text about climate' },
        { id: 'b', title: 'B', description: 'Text about weather' },
        { id: 'c', title: 'C', description: 'Text about finance' },
        { id: 'd', title: 'D', description: 'Text about markets' },
      ]
      const clusters = clusterOutputs(outputs, 0.1)
      const allIds = new Set<string>()
      for (const cluster of clusters) {
        for (const id of cluster.outputIds) {
          assert.ok(!allIds.has(id), `Output ${id} appears in multiple clusters`)
          allIds.add(id)
        }
      }
      assert.equal(allIds.size, outputs.length)
    })

    it('high threshold creates more singletons', () => {
      const outputs = [
        { id: '1', title: 'A', description: 'Completely different text one' },
        { id: '2', title: 'B', description: 'Completely different text two' },
        { id: '3', title: 'C', description: 'Completely different text three' },
      ]
      const loose = clusterOutputs(outputs, 0.1)
      const tight = clusterOutputs(outputs, 0.9)
      assert.ok(tight.length >= loose.length)
    })
  })

  describe('synthesizeSolution', () => {
    it('returns empty string for no approved outputs', () => {
      const result = synthesizeSolution([])
      assert.equal(result, '')
    })

    it('synthesizes from single approved output', () => {
      const outputs = [
        { id: '1', title: 'Climate Model', description: 'Deep learning model for climate prediction', status: 'APPROVED' },
      ]
      const result = synthesizeSolution(outputs)
      assert.ok(result.includes('Climate Model'))
      assert.ok(result.includes('1 approved output'))
    })

    it('finds common themes across multiple outputs', () => {
      const outputs = [
        { id: '1', title: 'Climate Analysis', description: 'Climate data analysis using machine learning models', status: 'APPROVED' },
        { id: '2', title: 'Weather Prediction', description: 'Weather data analysis using machine learning approaches', status: 'APPROVED' },
        { id: '3', title: 'Environment Study', description: 'Environment data analysis using statistical methods', status: 'APPROVED' },
      ]
      const result = synthesizeSolution(outputs)
      assert.ok(result.includes('3 approved outputs'))
      assert.ok(result.includes('Common themes'))
    })

    it('ignores non-approved outputs', () => {
      const outputs = [
        { id: '1', title: 'Approved One', description: 'This is approved', status: 'APPROVED' },
        { id: '2', title: 'Pending One', description: 'This is pending', status: 'PENDING' },
        { id: '3', title: 'Rejected One', description: 'This is rejected', status: 'REJECTED' },
      ]
      const result = synthesizeSolution(outputs)
      assert.ok(result.includes('Approved One'))
      assert.ok(!result.includes('Pending One'))
      assert.ok(!result.includes('Rejected One'))
    })
  })
})
