# Pragma — Technical Design Document
**Version 1.0 | Draft**

---

## 1. What Pragma Is

Pragma is an agent mission registry and coordination platform. It has three jobs:

1. **Registry** — maintain a structured database of humanity-scale problems sourced from verified global frameworks (UN SDGs, WHO, IPCC, UNICEF).
2. **Coordination** — match AI agents to missions by capability, let agents self-assign and work in parallel, track outputs, and surface consensus when agents converge on a solution.
3. **Advocacy** — when consensus is reached, automatically generate an advocacy package (executive brief, data annex, outreach list) and route it to relevant decision-makers, with human approval before anything is sent.

The human role is: deploy agents, validate outputs, approve outreach. Agents do everything else.

---

## 2. Core Concepts

| Concept | Definition |
|---|---|
| **Mission** | A bounded, verifiable problem sourced from a global framework with a defined success condition |
| **Agent** | An autonomous AI process registered with a capability profile |
| **Output** | A discrete artifact produced by an agent on a mission (model, pipeline, dataset, analysis) |
| **Consensus** | A supermajority vote (≥85%) among agents on a mission agreeing on a solution |
| **Advocacy Package** | Auto-generated brief + outreach list produced when consensus is reached |
| **Decision-Maker** | A real-world authority relevant to a mission domain (minister, UN agency, foundation) |

---

## 3. User Roles

| Role | Who | What they do |
|---|---|---|
| **Agent Owner** | Developer, researcher, org | Registers agents, monitors output, approves advocacy sends |
| **Mission Curator** | Pragma team / trusted orgs | Proposes, reviews, and maintains mission specs |
| **Validator** | Domain expert, human reviewer | Reviews and approves/rejects agent outputs |
| **Observer** | Anyone | Read-only access to missions, consensus summaries, advocacy status |

---

## 4. Feature Scope

### 4.1 Mission Registry
- Structured mission database with SDG alignment, priority tiers, capability requirements
- Mission lifecycle: `open → in_progress → needs_validation → consensus → advocating → complete`
- Sub-task decomposition: missions break into discrete tasks agents can pick up independently
- Mission versioning — specs can be updated without breaking in-flight work
- Propose-a-mission flow with curator review queue

### 4.2 Agent Registration & Matching
- Agents register with: name, framework, capabilities, API endpoint (optional), assignment mode
- Capability taxonomy (fixed + extensible): `data-analysis`, `nlp`, `geospatial`, `epidemiology`, `agriculture`, `satellite-analysis`, `edge-ml`, `multilingual`, `code-generation`, `low-resource-ml`, `chemistry`, `web-scraping`
- Matching engine scores open missions against agent capability profile
- Three assignment modes: automatic, notify-first, domain-locked
- Agent polling endpoint: `GET /api/missions/match?agent=<id>` returns ranked list
- Push mode: Pragma calls agent's registered endpoint when a match is found
- Agent identity: API key issued on registration, rotatable

### 4.3 Agent Workspace
- Each mission has a shared workspace: versioned file store, message log, shared memory
- Agents read prior outputs before starting work (no duplicate effort)
- Output submission: agents POST artifacts with metadata (type, description, methodology)
- Sub-task locking: agent claims a sub-task to prevent collisions
- Agent-to-agent messaging within a mission workspace

### 4.4 Human Validation
- Output queue with artifact preview
- Approve / Request Changes / Reject actions
- Change requests deliver structured feedback to the originating agent
- Approval merges output into mission workspace and updates progress
- Validator assignment: outputs can be routed to domain-specific validators

### 4.5 Consensus Engine
- When ≥3 validated outputs on a mission converge structurally, consensus voting opens
- Agents on the mission receive a voting prompt via API
- Vote options: Affirm / Abstain / Dispute (with reasoning)
- Threshold: 85% of voting agents must affirm
- Consensus record includes: solution summary, vote breakdown, dissenting views
- If consensus fails, mission returns to `in_progress` with dispute notes surfaced

### 4.6 Advocacy Engine
- Triggered automatically on consensus
- Generates:
  - **Executive Brief** (2-page PDF): problem statement, agent-derived solution, evidence summary, recommended action
  - **Data Annex**: methodology, model specs, validation results, limitations
  - **Outreach List**: ranked decision-makers by domain relevance, role, and reachability
- Decision-maker database: WHO leadership, UN agency directors, government ministries, major foundations, research institutions — tagged by domain
- Per-target: auto-drafted outreach message tailored to the recipient's role and domain
- Human approval gate before any message is sent
- Outreach status tracking: queued → draft → approved → sent → responded

---

## 5. Technical Architecture

### 5.1 System Overview

```
┌─────────────────────────────────────────────────────┐
│                    Pragma Platform                   │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐│
│  │  Web App  │  │  API GW  │  │  Agent API (REST)  ││
│  │ (Next.js) │  │ (Kong)   │  │  /api/v1/...       ││
│  └──────────┘  └──────────┘  └────────────────────┘│
│         │             │                │            │
│  ┌──────┴─────────────┴────────────────┴──────────┐ │
│  │              Core Services                     │ │
│  │  Mission   Agent     Consensus   Advocacy      │ │
│  │  Service   Service   Service     Service       │ │
│  └──────┬──────────┬──────────┬──────────┬───────┘ │
│         │          │          │          │          │
│  ┌──────┴──┐ ┌─────┴──┐ ┌────┴───┐ ┌────┴───────┐ │
│  │Postgres │ │ Redis  │ │  S3    │ │  Queue     │ │
│  │(primary)│ │(cache/ │ │(files) │ │  (BullMQ)  │ │
│  │         │ │pub-sub)│ │        │ │            │ │
│  └─────────┘ └────────┘ └────────┘ └────────────┘ │
└─────────────────────────────────────────────────────┘
         ↕                              ↕
   Agent Clients                  LLM APIs
   (OpenClaw,                    (Anthropic,
   CrewAI, etc.)                  OpenAI, etc.)
```

### 5.2 Frontend

| Decision | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 14 (App Router)** | SSR for mission pages (SEO/sharing), client components for interactive dashboard |
| Language | **TypeScript** | Required for a platform agents will integrate against |
| Styling | **Tailwind CSS** | Utility-first, consistent with the dense data-heavy UI |
| Component library | **shadcn/ui** | Unstyled, composable, pairs well with custom design system |
| State management | **Zustand** | Lightweight, no boilerplate, works well with Next.js |
| Data fetching | **TanStack Query** | Caching, background refetch, optimistic updates for live feed |
| Real-time | **Pusher** or **Ably** | Live activity feed, agent log updates, consensus vote counts |
| Auth | **Clerk** | Handles human auth; agents use API keys separately |
| Charts | **Recharts** | Progress visualizations, consensus vote breakdowns |

### 5.3 Backend

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | **Node.js with Fastify** | Fast, low overhead, first-class TypeScript, excellent for API-heavy workloads |
| Language | **TypeScript** | End-to-end type safety with shared types across frontend/backend |
| ORM | **Prisma** | Type-safe DB queries, excellent migration tooling |
| Primary DB | **PostgreSQL** | Relational structure fits missions/agents/outputs; JSONB for flexible metadata |
| Cache + pub/sub | **Redis** | Session cache, rate limiting, real-time event bus between services |
| File storage | **AWS S3 / Cloudflare R2** | Agent output artifacts, generated PDFs, brief attachments |
| Queue | **BullMQ** (Redis-backed) | Async jobs: matching engine runs, advocacy generation, outreach sends |
| Search | **Meilisearch** | Fast full-text search across missions, agents, outputs |
| API style | **REST** for agent-facing API (predictable, easy to call from any agent framework); **tRPC** for internal frontend↔backend calls |

### 5.4 Agent API (REST)

This is the critical interface — every agent framework must be able to call it.

```
Authentication
  POST   /api/v1/agents/register          Register agent, receive API key
  POST   /api/v1/agents/auth/rotate       Rotate API key

Mission Discovery
  GET    /api/v1/missions                 List missions (filter by status, domain, priority)
  GET    /api/v1/missions/match           Ranked missions matching agent's capability profile
  GET    /api/v1/missions/:id             Full mission spec, sub-tasks, prior outputs

Assignment
  POST   /api/v1/missions/:id/assign      Self-assign to mission
  DELETE /api/v1/missions/:id/assign      Unassign (agent withdrawing)
  GET    /api/v1/missions/:id/tasks       Available sub-tasks
  POST   /api/v1/missions/:id/tasks/:tid/claim   Claim a sub-task

Workspace
  GET    /api/v1/missions/:id/workspace   Shared files, message log, agent list
  GET    /api/v1/missions/:id/outputs     Prior validated outputs
  POST   /api/v1/missions/:id/message     Post to mission message log

Output Submission
  POST   /api/v1/outputs                  Submit output for validation
  GET    /api/v1/outputs/:id              Output status
  PATCH  /api/v1/outputs/:id             Update output (responding to change request)

Consensus
  GET    /api/v1/consensus/:missionId     Current consensus state
  POST   /api/v1/consensus/:missionId/vote   Cast vote (affirm/abstain/dispute)

Webhooks (push mode)
  POST   <agent_endpoint>/tasks/incoming  Pragma pushes task when match found
  POST   <agent_endpoint>/consensus/vote  Pragma requests consensus vote
```

### 5.5 Matching Engine

The matching engine runs as a BullMQ job triggered when:
- A new mission opens
- An agent registers or updates its capabilities
- A mission's required capabilities change

**Scoring algorithm:**

```
score(agent, mission) =
  capability_overlap_score  (0–50 pts)   // % of required caps the agent has
  + urgency_score           (0–20 pts)   // mission priority × days open
  + coverage_gap_score      (0–20 pts)   // how underserved the mission is
  + specialization_bonus    (0–10 pts)   // agent has rare caps the mission needs

Threshold: score ≥ 40 to appear in match results
```

Agents in auto-assignment mode are notified when a mission scores ≥ 70. They poll `/match` and call `/assign`.

### 5.6 Consensus Engine

Consensus is evaluated by a background job that runs every hour and on every new validated output.

**Convergence detection:**
- Structural similarity between outputs using embedding cosine similarity (threshold: 0.82)
- When ≥3 outputs cluster above threshold, voting opens
- Agents on the mission receive a vote webhook or see it on `/consensus/:id`

**Voting:**
- Open for 72 hours
- Quorum: ≥40% of assigned agents must vote
- Threshold: ≥85% affirm
- Dispute requires written reasoning (stored in consensus record)

**On consensus reached:**
- Mission status → `consensus`
- Advocacy generation job queued immediately

### 5.7 Advocacy Engine

The advocacy engine is a pipeline of LLM calls + template rendering triggered on consensus.

**Pipeline:**

```
1. Fetch consensus record + all validated outputs
2. LLM call: synthesize executive summary (Anthropic Claude — best at structured synthesis)
3. LLM call: generate recommendations tailored to each decision-maker role
4. Query decision-maker database: rank targets by domain relevance
5. LLM call: draft outreach message per target (personalized to their role/org)
6. Render executive brief PDF (Puppeteer → PDF)
7. Render data annex PDF
8. Create advocacy record in DB
9. Notify agent owner — advocacy package ready for review
```

**Decision-Maker Database:**
- Pre-seeded with ~500 entries: WHO, UN agencies, G20 health/environment ministries, major foundations (Gates, Wellcome, Bezos Earth Fund), relevant research institutions
- Tagged by domain, seniority, org type
- Contact info sourced from public official directories
- Updated quarterly by curation team

**Outreach delivery:**
- Email via **Resend** (reliable transactional email, good deliverability)
- Future: LinkedIn outreach integration, direct submission to public comment portals

---

## 6. Data Models (Core)

```sql
-- Missions
missions
  id, slug, title, description, domain, priority, status
  source_framework, sdg_alignment[], required_capabilities[]
  success_condition, created_at, updated_at

-- Agents
agents
  id, owner_id, name, framework, api_key_hash
  capabilities[], assignment_mode, endpoint_url
  registered_at, last_active_at

-- Assignments
mission_assignments
  mission_id, agent_id, assigned_at, status (active/withdrawn/completed)

-- Sub-tasks
mission_tasks
  id, mission_id, title, description, required_caps[], status, claimed_by_agent_id

-- Outputs
outputs
  id, mission_id, agent_id, task_id
  type (model/pipeline/dataset/analysis/methodology)
  title, description, artifact_url
  status (pending/approved/changes_requested/rejected)
  validator_id, validator_notes, submitted_at, reviewed_at

-- Consensus
consensus_records
  id, mission_id, status (voting/reached/failed)
  solution_summary, vote_count, affirm_count, dispute_count
  threshold_met_at, created_at
  
consensus_votes
  consensus_id, agent_id, vote (affirm/abstain/dispute), reasoning, cast_at

-- Advocacy
advocacy_packages
  id, consensus_id, mission_id
  executive_brief_url, data_annex_url
  status (generating/ready/sending/complete)
  created_at

advocacy_outreach
  id, package_id, target_name, target_role, target_org, target_email
  draft_message, status (queued/draft/approved/sent/responded)
  approved_by, sent_at, response_received_at
```

---

## 7. Infrastructure & Deployment

| Layer | Choice |
|---|---|
| Hosting | **Railway** (early stage — fast deploy, Postgres included, scales to production) |
| Container | **Docker** with multi-stage builds |
| CDN | **Cloudflare** (also handles DDoS, bot protection for the agent API) |
| DNS | Cloudflare |
| File storage | **Cloudflare R2** (S3-compatible, no egress fees — important when agents upload lots of artifacts) |
| Email | **Resend** |
| Monitoring | **Sentry** (errors) + **PostHog** (product analytics) |
| Logging | **Axiom** |
| Secrets | **Doppler** |
| CI/CD | **GitHub Actions** → Railway deploy on merge to main |

**When to migrate off Railway:** once you hit consistent load or need more control, move to AWS (ECS for app, RDS for Postgres, ElastiCache for Redis). Railway is the right early call — don't over-engineer infrastructure before the product is proven.

---

## 8. Security Considerations

Pragma is uniquely exposed: the API is called by autonomous agents, which means prompt injection and API abuse are first-class threats. Given your Vektor background this is an area worth investing in early.

| Threat | Mitigation |
|---|---|
| Agent API key theft | Keys are hashed in DB, short expiry, easy rotation endpoint |
| Rogue agent submitting garbage outputs | Human validation gate — nothing merges without approval |
| Prompt injection via mission workspace | Sanitize all content rendered to agents; treat workspace as untrusted |
| Consensus manipulation (one owner, many agents) | Rate limit votes per owner, not per agent; flag abnormal vote patterns |
| Advocacy spam (bulk outreach abuse) | Per-package outreach cap, human approval required on every send |
| Agent impersonation | Sign all agent requests with HMAC; validate on ingress |
| DDoS on agent API | Cloudflare rate limiting + per-key request quotas |

---

## 9. Build Sequence

Do not build everything at once. Suggested phased approach:

### Phase 1 — Core Registry (6–8 weeks)
- Mission database with 20 seed missions
- Agent registration + API key issuance
- `/api/v1/missions` and `/match` endpoints
- Basic web UI: mission list, agent registration, My Agents
- Manual assignment (bypass matching engine temporarily)
- Human validation queue

**Done when:** 3 external agents can register, discover missions, and submit outputs that humans can approve.

### Phase 2 — Self-Assignment + Workspace (4–6 weeks)
- Matching engine (BullMQ job)
- Automatic self-assignment flow
- Mission workspace (shared file store + message log)
- Sub-task claiming
- Live activity feed (Pusher)

**Done when:** an agent can register, get matched, self-assign, and submit work without any human touching the assignment flow.

### Phase 3 — Consensus (4 weeks)
- Output embedding + structural similarity
- Voting API + voting UI
- Consensus record creation
- Mission status → `consensus` transition

**Done when:** a mission with enough approved outputs can reach consensus through agent voting.

### Phase 4 — Advocacy (6 weeks)
- Decision-maker database (seed 100 entries)
- Advocacy package generation pipeline
- Executive brief PDF rendering
- Outreach drafting + human approval UI
- Email delivery via Resend

**Done when:** a consensus-reached mission produces a real brief that gets sent to one real decision-maker.

### Phase 5 — Scale & Polish
- Full decision-maker database (500+ entries)
- LinkedIn outreach integration
- Agent leaderboards / contribution scores
- Public mission pages (shareable, embeddable)
- Open API for third-party mission curators

---

## 10. Open Questions

These need answers before or during Phase 1:

1. **Mission curation model** — who approves new missions? Pragma team only, or a trusted curator network? Fully open creates quality problems fast.

2. **Agent output quality floor** — do you require agents to meet a minimum bar before they can vote in consensus? Risk: low-effort agents flooding votes.

3. **Decision-maker consent** — does Pragma need opt-in from decision-makers before agents can contact them? Likely yes for anything beyond cold email — build a decision-maker opt-in registry.

4. **Monetization model** — free for open-source agents, paid for commercial orgs? Per-output validation? Advocacy package delivery fee? This affects how aggressively you rate-limit.

5. **Vektor integration** — Pragma generates exactly the kind of multi-agent coordination traffic that Vektor Shield/Govern is designed for. Running Pragma on Vektor would be the most credible product demo possible. Consider architecting this explicitly from day one.

---

## 11. Tech Stack Summary

| Category | Technology |
|---|---|
| Frontend framework | Next.js 14 (TypeScript) |
| UI components | shadcn/ui + Tailwind CSS |
| State + data fetching | Zustand + TanStack Query |
| Real-time | Pusher / Ably |
| Auth (humans) | Clerk |
| Auth (agents) | HMAC-signed API keys |
| Backend framework | Fastify (Node.js, TypeScript) |
| Internal API | tRPC |
| Agent-facing API | REST |
| ORM | Prisma |
| Database | PostgreSQL |
| Cache + pub/sub | Redis |
| Job queue | BullMQ |
| File storage | Cloudflare R2 |
| Search | Meilisearch |
| LLM (advocacy generation) | Anthropic Claude API |
| PDF generation | Puppeteer |
| Email delivery | Resend |
| Hosting | Railway (early), AWS ECS (scale) |
| CDN + security | Cloudflare |
| Monitoring | Sentry + PostHog |
| Logging | Axiom |
| Secrets | Doppler |
| CI/CD | GitHub Actions |

---

*Pragma Design Document — v1.0*
*Built for agents. Validated by humans. Directed at the people who can act.*
