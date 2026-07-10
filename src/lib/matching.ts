/**
 * Matching Engine — score and rank missions against agent capabilities.
 *
 * Scoring dimensions:
 *  1. Capability overlap (0–50 pts) — how many required caps the agent has
 *  2. Priority weight (0–30 pts) — CRITICAL=30, HIGH=25, MEDIUM=15, LOW=5
 *  3. Recency bonus (0–20 pts) — newer missions score higher (decays over 30 days)
 *
 * Total: 0–100. Missions below 20 are considered poor matches.
 */

export interface MissionScore {
  missionId: string
  slug: string
  title: string
  domain: string
  priority: string
  status: string
  requiredCapabilities: string[]
  matchScore: number        // 0–100
  capabilityOverlap: number // 0–1 (fraction of required caps matched)
  reason: string
}

export interface AgentProfile {
  id: string
  name: string
  capabilities: string[]
  mode: 'AUTO' | 'NOTIFY_FIRST' | 'DOMAIN_LOCKED'
}

/**
 * Calculate match score for a single mission against an agent.
 */
export function scoreMission(
  mission: {
    id: string
    slug: string
    title: string
    domain: string
    priority: string
    status: string
    requiredCapabilities: string
    createdAt: Date
  },
  agent: AgentProfile,
): MissionScore {
  const reqCaps = JSON.parse(mission.requiredCapabilities || '[]')
  const agentCaps = agent.capabilities.map(c => c.toLowerCase())
  const reqCapsLower = reqCaps.map(c => c.toLowerCase())

  // Capability overlap
  const matched = reqCapsLower.filter(c => agentCaps.includes(c))
  const capabilityOverlap = reqCapsLower.length > 0
    ? matched.length / reqCapsLower.length
    : 0

  // Priority weight
  const priorityWeight: Record<string, number> = {
    CRITICAL: 30,
    HIGH: 25,
    MEDIUM: 15,
    LOW: 5,
  }
  const priorityScore = priorityWeight[mission.priority] ?? 10

  // Recency bonus (0–20): newer missions score higher, decay over 30 days
  const daysSinceCreated = Math.max(0, (Date.now() - mission.createdAt.getTime()) / 86400000)
  const recencyScore = Math.max(0, 20 * (1 - daysSinceCreated / 30))

  // Total score (capped at 100)
  const totalScore = Math.min(100, Math.round(
    capabilityOverlap * 50 + priorityScore + recencyScore,
  ))

  // Build reason string
  const reasons: string[] = []
  if (capabilityOverlap >= 0.8) reasons.push('strong capability overlap')
  else if (capabilityOverlap >= 0.5) reasons.push('moderate capability overlap')
  else if (capabilityOverlap > 0) reasons.push('partial capability overlap')
  else reasons.push('no matching capabilities')

  if (priorityScore >= 25) reasons.push('high priority mission')
  else if (priorityScore >= 15) reasons.push('medium priority mission')

  if (recencyScore >= 15) reasons.push('recently posted')
  else if (recencyScore < 5) reasons.push('older mission')

  return {
    missionId: mission.id,
    slug: mission.slug,
    title: mission.title,
    domain: mission.domain,
    priority: mission.priority,
    status: mission.status,
    matchScore: totalScore,
    capabilityOverlap: Math.round(capabilityOverlap * 1000) / 1000,
    reason: reasons.join(', '),
  }
}

/**
 * Check if an agent is allowed to self-assign based on assignment mode.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export function checkAssignmentMode(
  agent: AgentProfile,
  mission: { domain: string; status: string },
): { allowed: true } | { allowed: false; reason: string } {
  if (agent.mode === 'AUTO') {
    return { allowed: true }
  }

  if (agent.mode === 'NOTIFY_FIRST') {
    // Agent can still self-assign, but we flag it as "notify-first" mode
    // The actual notification would be handled by the matching endpoint
    return { allowed: true }
  }

  if (agent.mode === 'DOMAIN_LOCKED') {
    // Check if agent has capabilities matching the mission domain
    const domainKeywords: Record<string, string[]> = {
      climate: ['climate', 'carbon', 'emission', 'weather', 'atmosphere'],
      health: ['health', 'medical', 'epidemiology', 'public-health', 'clinical'],
      agriculture: ['agriculture', 'food', 'farming', 'crop', 'livestock', 'soil'],
      education: ['education', 'literacy', 'learning', 'school', 'curriculum'],
      water: ['water', 'sanitation', 'wastewater', 'hydrology', 'aquifer'],
      energy: ['energy', 'renewable', 'solar', 'wind', 'grid', 'electricity'],
      biodiversity: ['biodiversity', 'wildlife', 'ecosystem', 'species', 'habitat'],
      poverty: ['poverty', 'inequality', 'livelihood', 'economic', 'employment'],
    }

    const agentCapsLower = agent.capabilities.map(c => c.toLowerCase())
    const relevantDomains = Object.entries(domainKeywords).filter(([_, keywords]) =>
      keywords.some(k => agentCapsLower.some(ac => ac.includes(k) || k.includes(ac))),
    )

    if (relevantDomains.length === 0) {
      return {
        allowed: false,
        reason: `Agent capabilities do not match domain "${mission.domain}". DOMAIN_LOCKED agents can only work in domains covered by their capabilities.`,
      }
    }

    // Check if the mission domain is in the agent's relevant domains
    const missionDomainLower = mission.domain.toLowerCase()
    const isRelevant = relevantDomains.some(([domain]) =>
      domain.toLowerCase() === missionDomainLower,
    )

    if (!isRelevant) {
      return {
        allowed: false,
        reason: `Agent is domain-locked to ${relevantDomains.map(([d]) => d).join(', ')}. Mission domain "${mission.domain}" is outside this scope.`,
      }
    }
  }

  return { allowed: true }
}

/**
 * Categorize matches by score threshold.
 */
export function categorizeMatches(matches: MissionScore[]): {
  strong: MissionScore[]
  moderate: MissionScore[]
  weak: MissionScore[]
} {
  return {
    strong: matches.filter(m => m.matchScore >= 60),
    moderate: matches.filter(m => m.matchScore >= 40 && m.matchScore < 60),
    weak: matches.filter(m => m.matchScore < 40),
  }
}
