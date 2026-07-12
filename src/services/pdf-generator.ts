// @ts-nocheck
import PDFDocument from 'pdfkit'
import { Buffer } from 'node:buffer'
import { promisify } from 'util'

// ── Types ────────────────────────────────────────────────────────────────

interface ExecutiveBrief {
  mission: {
    title: string
    slug: string
    domain: string
    priority: string
    description: string
    successCondition: string
  }
  consensus: {
    solutionSummary: string | null
    affirmCount: number
    totalVotes: number
    threshold: string
  }
  validatedOutputs: Array<{
    title: string
    type: string
    agent: string
  }>
  generatedAt: string
}

interface DataAnnex {
  methodology: {
    framework: string
    consensusMechanism: string
    affirmationThreshold: string
    validationProcess: string
  }
  mission: {
    title: string
    slug: string
    domain: string
    priority: string
    sdgAlignment: string[]
    requiredCapabilities: string[]
    successCondition: string
    sourceFramework: string
  }
  consensus: {
    solutionSummary: string | null
    totalVotes: number
    affirmCount: number
    disputeCount: number
    thresholdMet: boolean
    closedAt: string
  }
  validatedOutputs: Array<{
    id: string
    title: string
    type: string
    description: string
    agent: string
    framework: string
    artifactUrl: string | null
    submittedAt: string
  }>
  limitations: string[]
  generatedAt: string
}

interface OutreachTarget {
  targetName: string
  targetRole: string
  targetOrg: string
  targetEmail: string
  status: string
  draftMessage: string | null
}

interface AdvocacyPackagePDF {
  executiveBrief: ExecutiveBrief
  dataAnnex: DataAnnex
  outreachTargets: OutreachTarget[]
  missionId: string
}

// ── Helpers ──────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '…' : text
}

function priorityColor(priority: string): string {
  switch (priority) {
    case 'CRITICAL': return '#DC2626'
    case 'HIGH': return '#EA580C'
    case 'MEDIUM': return '#D97706'
    default: return '#059669'
  }
}

function priorityBadge(priority: string): string {
  switch (priority) {
    case 'CRITICAL': return '🔴 CRITICAL'
    case 'HIGH': return '🟠 HIGH'
    case 'MEDIUM': return '🟡 MEDIUM'
    default: return '🟢 STANDARD'
  }
}

function consensusPercent(affirmCount: number, totalVotes: number): string {
  if (totalVotes === 0) return 'N/A'
  return `${Math.round((affirmCount / totalVotes) * 100)}%`
}

function formatDate(iso?: string): string {
  if (!iso) return 'N/A'
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  } catch {
    return iso
  }
}

// ── PDF Builder ──────────────────────────────────────────────────────────

export function generateAdvocacyPDF(data: AdvocacyPackagePDF): Promise<Buffer> {
  const doc = new PDFDocument({
    margin: 60,
    size: 'A4',
  })

  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))
  doc.on('end', () => { /* noop — caller reads chunks */ })

  const { executiveBrief, dataAnnex, outreachTargets, missionId } = data

  // ── Page 1: Cover ────────────────────────────────────────────────────
  doc
    .fillColor('#0F172A')
    .fontSize(32)
    .font('Helvetica-Bold')
    .text('Pragma', 60, 120)
    .fontSize(14)
    .fillColor('#64748B')
    .text('Agent Coordination Platform', 60, 155)

    .fillColor(priorityColor(executiveBrief.mission.priority))
    .fontSize(10)
    .font('Helvetica-Bold')
    .text(priorityBadge(executiveBrief.mission.priority).toUpperCase(), 60, 200)

    .fillColor('#0F172A')
    .fontSize(26)
    .font('Helvetica-Bold')
    .text(executiveBrief.mission.title, 60, 240, { align: 'left' })

    .fillColor('#475569')
    .fontSize(13)
    .font('Helvetica')
    .text('Advocacy Package', 60, 300)

    .fontSize(10)
    .fillColor('#94A3B8')
    .text(`Mission ID: ${missionId}`, 60, 335)
    .text(`Domain: ${executiveBrief.mission.domain}`, 60, 355)
    .text(`Generated: ${formatDate(executiveBrief.generatedAt)}`, 60, 375)

    .fillColor('#0F172A')
    .fontSize(11)
    .font('Helvetica-Bold')
    .text('Consensus Summary', 60, 440)
    .fillColor('#334155')
    .font('Helvetica')
    .fontSize(10)
    .text(`${consensusPercent(executiveBrief.consensus.affirmCount, executiveBrief.consensus.totalVotes)} affirmation rate`, 80, 465)
    .text(`${executiveBrief.consensus.affirmCount} of ${executiveBrief.consensus.totalVotes} agents voted affirm`, 80, 485)
    .text(`Threshold: ${executiveBrief.consensus.threshold}`, 80, 505)

    .fillColor('#94A3B8')
    .fontSize(9)
    .font('Helvetica-Oblique')
    .text('CONFIDENTIAL — For authorized recipients only', 60, 560)

  // ── Page 2: Executive Brief ──────────────────────────────────────────
  doc.addPage()
  doc
    .fillColor('#0F172A')
    .fontSize(22)
    .font('Helvetica-Bold')
    .text('Executive Brief', 60, 60)

    .fillColor('#0F172A')
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('Mission Overview', 60, 110)

    .fillColor('#334155')
    .fontSize(10)
    .font('Helvetica')
    .text(`Title: ${executiveBrief.mission.title}`, 80, 135)
    .text(`Domain: ${executiveBrief.mission.domain}`, 80, 155)
    .text(`Priority: ${executiveBrief.mission.priority}`, 80, 175)
    .text(`Success Condition: ${executiveBrief.mission.successCondition}`, 80, 195)

    .fillColor('#0F172A')
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('Challenge', 60, 240)

    .fillColor('#334155')
    .fontSize(10)
    .font('Helvetica')
    .text(executiveBrief.mission.description, 80, 265, { lineGap: 4 })

    .fillColor('#0F172A')
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('Consensus Solution', 60, 340)

    .fillColor('#334155')
    .fontSize(10)
    .font('Helvetica')
    .text(executiveBrief.consensus.solutionSummary || 'No solution summary available.', 80, 365, { lineGap: 4 })

    .fillColor('#0F172A')
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('Validated Outputs', 60, 440)

    .fillColor('#334155')
    .fontSize(10)
    .font('Helvetica')
    .text(`${executiveBrief.validatedOutputs.length} outputs validated by agents`, 80, 465)

  // ── Page 3: Data Annex ───────────────────────────────────────────────
  doc.addPage()
  doc
    .fillColor('#0F172A')
    .fontSize(22)
    .font('Helvetica-Bold')
    .text('Data Annex', 60, 60)

    .fillColor('#0F172A')
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('Methodology', 60, 110)

    .fillColor('#334155')
    .fontSize(10)
    .font('Helvetica')
    .text(`Framework: ${dataAnnex.methodology.framework}`, 80, 135)
    .text(`Consensus Mechanism: ${dataAnnex.methodology.consensusMechanism}`, 80, 155)
    .text(`Affirmation Threshold: ${dataAnnex.methodology.affirmationThreshold}`, 80, 175)
    .text(`Validation Process: ${dataAnnex.methodology.validationProcess}`, 80, 195)

    .fillColor('#0F172A')
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('Mission Details', 60, 240)

    .fillColor('#334155')
    .fontSize(10)
    .font('Helvetica')
    .text(`Source: ${dataAnnex.mission.sourceFramework}`, 80, 265)
    .text(`SDG Alignment: ${dataAnnex.mission.sdgAlignment.join(', ') || 'None specified'}`, 80, 285)
    .text(`Required Capabilities: ${dataAnnex.mission.requiredCapabilities.join(', ') || 'None specified'}`, 80, 305)

    .fillColor('#0F172A')
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('Consensus Record', 60, 350)

    .fillColor('#334155')
    .fontSize(10)
    .font('Helvetica')
    .text(`Total Votes: ${dataAnnex.consensus.totalVotes}`, 80, 375)
    .text(`Affirm: ${dataAnnex.consensus.affirmCount} | Dispute: ${dataAnnex.consensus.disputeCount}`, 80, 395)
    .text(`Threshold Met: ${dataAnnex.consensus.thresholdMet ? 'Yes' : 'No'}`, 80, 415)
    .text(`Closed: ${formatDate(dataAnnex.consensus.closedAt)}`, 80, 435)

    .fillColor('#0F172A')
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('Validated Outputs', 60, 490)

    dataAnnex.validatedOutputs.forEach((output, i) => {
      const yPos = 515 + i * 50
      doc
        .fillColor('#334155')
        .fontSize(10)
        .font('Helvetica')
        .text(`• ${output.title} (${output.type}) — ${output.agent}`, 80, yPos)
    })

  // ── Page 4: Outreach Targets ─────────────────────────────────────────
  doc.addPage()
  doc
    .fillColor('#0F172A')
    .fontSize(22)
    .font('Helvetica-Bold')
    .text('Outreach Targets', 60, 60)

    .fillColor('#334155')
    .fontSize(10)
    .font('Helvetica')
    .text(`${outreachTargets.length} decision-makers identified for this mission`, 60, 90)

    .fillColor('#0F172A')
    .fontSize(11)
    .font('Helvetica-Bold')
    .text('Targets', 60, 125)

    outreachTargets.forEach((target, i) => {
      const yPos = 150 + i * 80
      doc
        .fillColor('#0F172A')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(`${target.targetName}`, 80, yPos)

      doc
        .fillColor('#334155')
        .fontSize(10)
        .font('Helvetica')
        .text(`${target.targetRole}`, 80, yPos + 20)
        .text(`${target.targetOrg}`, 80, yPos + 35)
        .text(`Status: ${target.status}`, 80, yPos + 50)
    })

  // ── Page 5: Limitations ──────────────────────────────────────────────
  doc.addPage()
  doc
    .fillColor('#0F172A')
    .fontSize(22)
    .font('Helvetica-Bold')
    .text('Limitations & Disclaimers', 60, 60)

    .fillColor('#334155')
    .fontSize(10)
    .font('Helvetica')
    .text('This advocacy package was generated by the Pragma agent coordination platform.', 60, 110)
    .text('The following limitations apply:', 60, 135)

    dataAnnex.limitations.forEach((limitation, i) => {
      doc
        .fillColor('#334155')
        .fontSize(10)
        .font('Helvetica')
        .text(`• ${limitation}`, 80, 160 + i * 25)
    })

    doc
      .fillColor('#94A3B8')
      .fontSize(9)
      .font('Helvetica-Oblique')
      .text(`Generated at: ${formatDate(dataAnnex.generatedAt)}`, 60, 300)
      .text(`Package ID: ${missionId}`, 60, 315)

  doc.end()

  // Return a promise that resolves when the PDF is fully written
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}

// ── Convenience: generate from raw package ──────────────────────────────

export function packageToPDFPayload(pkg: {
  executiveBrief: string | null
  dataAnnex: string | null
  missionId: string
}, outreachTargets: OutreachTarget[]): AdvocacyPackagePDF | null {
  if (!pkg.executiveBrief || !pkg.dataAnnex) return null

  return {
    executiveBrief: JSON.parse(pkg.executiveBrief),
    dataAnnex: JSON.parse(pkg.dataAnnex),
    outreachTargets,
    missionId: pkg.missionId,
  }
}
