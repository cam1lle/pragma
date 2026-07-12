import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateAdvocacyPDF } from '../src/services/pdf-generator.js'

describe('PDF Generation', () => {
  it('generates a valid PDF with full data', async () => {
    const payload = {
      executiveBrief: {
        mission: {
          title: 'Test Mission',
          slug: 'test-mission',
          domain: 'health',
          priority: 'HIGH',
          description: 'Test description',
          successCondition: 'Test success',
        },
        consensus: {
          solutionSummary: 'Agents converge on vaccine distribution.',
          affirmCount: 4,
          totalVotes: 5,
          threshold: '67%',
        },
        validatedOutputs: [
          { title: 'Output 1', type: 'ANALYSIS', agent: 'Agent A' },
          { title: 'Output 2', type: 'PIPELINE', agent: 'Agent B' },
        ],
        generatedAt: new Date().toISOString(),
      },
      dataAnnex: {
        methodology: {
          framework: 'Pragma',
          consensusMechanism: 'Multi-agent voting',
          affirmationThreshold: '67%',
          validationProcess: 'Human review',
        },
        mission: {
          title: 'Test Mission',
          slug: 'test-mission',
          domain: 'health',
          priority: 'HIGH',
          sdgAlignment: ['SDG 3'],
          requiredCapabilities: ['health'],
          successCondition: 'Test success',
          sourceFramework: 'WHO',
        },
        consensus: {
          solutionSummary: 'Test',
          totalVotes: 5,
          affirmCount: 4,
          disputeCount: 1,
          thresholdMet: true,
          closedAt: new Date().toISOString(),
        },
        validatedOutputs: [
          {
            id: 'out-1',
            title: 'Output 1',
            type: 'ANALYSIS',
            description: 'A test analysis',
            agent: 'Agent A',
            framework: 'openclaw',
            artifactUrl: null,
            submittedAt: new Date().toISOString(),
          },
        ],
        limitations: ['Test limitation'],
        generatedAt: new Date().toISOString(),
      },
      outreachTargets: [
        { targetName: 'Dr. Test', targetRole: 'Director', targetOrg: 'WHO', targetEmail: 'test@who.int', status: 'DRAFT' },
        { targetName: 'Dr. Test2', targetRole: 'VP', targetOrg: 'UNEP', targetEmail: 'test2@unep.org', status: 'DRAFT' },
      ],
      missionId: 'test-mission',
    }

    const pdfBuffer = await generateAdvocacyPDF(payload)
    assert.ok(pdfBuffer instanceof Buffer, 'PDF should be a Buffer')
    assert.ok(pdfBuffer.length > 0, 'PDF buffer should not be empty')
    assert.ok(pdfBuffer.length > 5000, 'PDF should have meaningful content')

    // Verify PDF magic bytes
    const magic = pdfBuffer.slice(0, 5).toString()
    assert.strictEqual(magic, '%PDF-', 'PDF should start with %PDF- magic bytes')
  })

  it('generates a valid PDF with minimal data', async () => {
    const payload = {
      executiveBrief: {
        mission: { title: '', domain: '', priority: '', description: '', successCondition: '' },
        consensus: { solutionSummary: null, affirmCount: 0, totalVotes: 0, threshold: '' },
        validatedOutputs: [],
        generatedAt: new Date().toISOString(),
      },
      dataAnnex: {
        methodology: { framework: '', consensusMechanism: '', affirmationThreshold: '', validationProcess: '' },
        mission: { title: '', slug: '', domain: '', priority: '', sdgAlignment: [], requiredCapabilities: [], successCondition: '', sourceFramework: '' },
        consensus: { solutionSummary: null, totalVotes: 0, affirmCount: 0, disputeCount: 0, thresholdMet: false, closedAt: '' },
        validatedOutputs: [],
        limitations: [],
        generatedAt: new Date().toISOString(),
      },
      outreachTargets: [],
      missionId: 'test',
    }

    const pdfBuffer = await generateAdvocacyPDF(payload)
    assert.ok(pdfBuffer instanceof Buffer, 'Should still produce a buffer for minimal data')
    assert.ok(pdfBuffer.length > 0, 'Buffer should not be empty')

    const magic = pdfBuffer.slice(0, 5).toString()
    assert.strictEqual(magic, '%PDF-', 'PDF should start with %PDF- magic bytes')
  })
})
