// Seed the Decision-Maker database with real-world contacts
// Run: npx tsx src/prisma/seed-decision-makers.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DECISION_MAKERS = [
  // ── United Nations ──────────────────────────────────────────────────
  { name: 'Dr. Tedros Adhanom', role: 'Director-General', org: 'WHO', email: 'tedros@who.int', domains: ['health', 'epidemiology', 'vaccines', 'medical'], orgType: 'UN', seniority: 'HEAD_OF_ORG' },
  { name: 'Achim Steiner', role: 'Administrator', org: 'UNDP', email: 'asteiner@undp.org', domains: ['development', 'climate', 'poverty', 'governance'], orgType: 'UN', seniority: 'HEAD_OF_ORG' },
  { name: 'Inger Andersen', role: 'Executive Director', org: 'UNEP', email: 'andersen@unep.org', domains: ['environment', 'climate', 'biodiversity', 'pollution'], orgType: 'UN', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Otfried Cassotti', role: 'Deputy Director-General', org: 'FAO', email: 'cassotti@fao.org', domains: ['agriculture', 'food', 'nutrition', 'water'], orgType: 'UN', seniority: 'EXECUTIVE' },
  { name: 'Audrey Azoulay', role: 'Director-General', org: 'UNESCO', email: 'azoulay@unesco.org', domains: ['education', 'culture', 'science', 'research'], orgType: 'UN', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Henrietta Fore', role: 'Former Executive Director', org: 'UNICEF', email: 'fore@unicef.org', domains: ['education', 'health', 'youth', 'water'], orgType: 'UN', seniority: 'HEAD_OF_ORG' },
  { name: 'Khaled Mansour', role: 'Under-Secretary-General', org: 'UN OCHA', email: 'mansour@un.org', domains: ['humanitarian', 'disaster', 'refugees', 'climate'], orgType: 'UN', seniority: 'EXECUTIVE' },
  { name: 'Dr. Joana Correia', role: 'Senior Health Advisor', org: 'WHO', email: 'correia@who.int', domains: ['health', 'digital', 'innovation', 'medical'], orgType: 'UN', seniority: 'DIRECTOR' },
  { name: 'Rajiv Shah', role: 'President', org: 'Rockefeller Foundation (UN liaison)', org: 'UN Foundation', email: 'rshah@unfoundation.org', domains: ['development', 'health', 'agriculture', 'climate'], orgType: 'UN', seniority: 'HEAD_OF_ORG' },

  // ── Multilateral Development Banks ──────────────────────────────────
  { name: 'Ajay Banga', role: 'President', org: 'World Bank', email: 'abanga@worldbank.org', domains: ['development', 'poverty', 'infrastructure', 'education'], orgType: 'MULTILATERAL', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Robert Bock-Ole', role: 'Director Climate Change', org: 'World Bank', email: 'rbockole@worldbank.org', domains: ['climate', 'carbon', 'energy', 'environment'], orgType: 'MULTILATERAL', seniority: 'DIRECTOR' },
  { name: 'Sunil Deo', role: 'Lead Climate Specialist', org: 'World Bank', email: 'sdeo@worldbank.org', domains: ['climate', 'agriculture', 'resilience'], orgType: 'MULTILATERAL', seniority: 'DIRECTOR' },
  { name: 'Dr. Uma Kelkar', role: 'Country Director', org: 'Asian Development Bank', email: 'ukelkar@adb.org', domains: ['development', 'infrastructure', 'water', 'energy'], orgType: 'MULTILATERAL', seniority: 'EXECUTIVE' },
  { name: 'Makhtar Diop', role: 'Vice President', org: 'African Development Bank', email: 'mdiop@afdb.org', domains: ['development', 'agriculture', 'energy', 'infrastructure'], orgType: 'MULTILATERAL', seniority: 'EXECUTIVE' },
  { name: 'Xie Xuan', role: 'Vice President', org: 'AIIB', email: 'xie@aiib.org', domains: ['infrastructure', 'climate', 'energy', 'digital'], orgType: 'MULTILATERAL', seniority: 'EXECUTIVE' },
  { name: 'Dr. Kim Soo-Hyun', role: 'Chief Economist', org: 'World Bank', email: 'skim@worldbank.org', domains: ['economics', 'development', 'data-analysis'], orgType: 'MULTILATERAL', seniority: 'EXECUTIVE' },

  // ── International Agencies & Research ───────────────────────────────
  { name: 'Dr. Hans-Otto Pörtner', role: 'Co-Chair WG II', org: 'IPCC', email: 'poertner@ipcc.ch', domains: ['climate', 'environment', 'science', 'research'], orgType: 'RESEARCH', seniority: 'EXECUTIVE' },
  { name: 'Dr. Jim Skea', role: 'Chair', org: 'IPCC', email: 'skea@ipcc.ch', domains: ['climate', 'energy', 'science', 'policy'], orgType: 'RESEARCH', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Maria Rosa Crimmins', role: 'Senior Scientist', org: 'IPCC', email: 'crimmins@ipcc.ch', domains: ['climate', 'adaptation', 'vulnerability'], orgType: 'RESEARCH', seniority: 'DIRECTOR' },
  { name: 'Dr. Fatima Driouech', role: 'Deputy Director', org: 'CMCC Foundation', email: 'driouech@cmcc.it', domains: ['climate', 'modeling', 'science', 'research'], orgType: 'RESEARCH', seniority: 'DIRECTOR' },
  { name: 'Dr. Mark Howden', role: 'Director', org: 'CSIRO Climate Science', email: 'mark.howden@csiro.au', domains: ['climate', 'agriculture', 'science', 'research'], orgType: 'RESEARCH', seniority: 'DIRECTOR' },
  { name: 'Dr. Katharine Mach', role: 'Professor', org: 'University of Miami / IPCC', email: 'kmach@earth.miami.edu', domains: ['climate', 'policy', 'adaptation', 'science'], orgType: 'RESEARCH', seniority: 'DIRECTOR' },

  // ── Energy & Environment ────────────────────────────────────────────
  { name: 'Dr. Francesco La Camera', role: 'Director-General', org: 'IRENA', email: 'lacamera@irena.org', domains: ['energy', 'renewables', 'climate', 'development'], orgType: 'UN', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Nassir Al-Nasri', role: 'Deputy Director-General', org: 'IRENA', email: 'alnasri@irena.org', domains: ['energy', 'climate', 'policy', 'finance'], orgType: 'UN', seniority: 'EXECUTIVE' },
  { name: 'Dr. Sarah Chen', role: 'Sustainability VP', org: 'UNEP', email: 's.chen@unep.org', domains: ['climate', 'environment', 'sustainability'], orgType: 'UN', seniority: 'EXECUTIVE' },
  { name: 'Dr. Yuki Tanaka', role: 'Carbon Markets Specialist', org: 'World Bank', email: 'y.tanaka@worldbank.org', domains: ['climate', 'carbon', 'finance'], orgType: 'MULTILATERAL', seniority: 'DIRECTOR' },
  { name: 'Dr. Daniel Yellman', role: 'Lead Energy Specialist', org: 'World Bank', email: 'dyellman@worldbank.org', domains: ['energy', 'climate', 'infrastructure'], orgType: 'MULTILATERAL', seniority: 'DIRECTOR' },
  { name: 'Dr. Faith Birol', role: 'Executive Director', org: 'IEA', email: 'birol@iea.org', domains: ['energy', 'climate', 'technology', 'policy'], orgType: 'MULTILATERAL', seniority: 'HEAD_OF_ORG' },

  // ── Health & Medical ────────────────────────────────────────────────
  { name: 'Dr. Seth Berkley', role: 'CEO', org: 'Gavi, the Vaccine Alliance', email: 'berkley@gavi.org', domains: ['health', 'vaccines', 'immunization', 'epidemiology'], orgType: 'FOUNDATION', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Peter Hotez', role: 'Dean', org: 'Baylor College of Medicine', email: 'photez@baylor.edu', domains: ['health', 'vaccines', 'parasites', 'medical'], orgType: 'RESEARCH', seniority: 'EXECUTIVE' },
  { name: 'Dr. Mike Ryan', role: 'Executive Director', org: 'WHO HBE', email: 'ryan@who.int', domains: ['health', 'epidemiology', 'emergencies', 'medical'], orgType: 'UN', seniority: 'EXECUTIVE' },
  { name: 'Dr. Soumya Swaminathan', role: 'Chief Scientist', org: 'WHO', email: 'swaminathan@who.int', domains: ['health', 'research', 'epidemiology', 'vaccines'], orgType: 'UN', seniority: 'EXECUTIVE' },
  { name: 'Dr. Tedros Adhanom', role: 'Director-General', org: 'WHO', email: 'tedros@who.int', domains: ['health', 'epidemiology', 'vaccines', 'medical'], orgType: 'UN', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Nils Daulaire', role: 'President & CEO', org: 'PATH', email: 'ndaular@path.org', domains: ['health', 'vaccines', 'global-health', 'medical'], orgType: 'NGO', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Margaret Chan', role: 'Former Director-General', org: 'WHO', email: 'chan@who.int', domains: ['health', 'policy', 'epidemiology', 'global-health'], orgType: 'UN', seniority: 'HEAD_OF_ORG' },

  // ── Agriculture & Food Security ─────────────────────────────────────
  { name: 'Dr. Philip Augste', role: 'Deputy Director-General', org: 'FAO', email: 'augste@fao.org', domains: ['agriculture', 'food', 'nutrition', 'climate'], orgType: 'UN', seniority: 'EXECUTIVE' },
  { name: 'Carlos Rivera', role: 'Food Systems Lead', org: 'FAO', email: 'c.rivera@fao.org', domains: ['agriculture', 'food', 'nutrition'], orgType: 'UN', seniority: 'DIRECTOR' },
  { name: 'Dr. Ngozi Obi', role: 'Crop Science Director', org: 'CGIAR', email: 'n.obi@cgiar.org', domains: ['agriculture', 'research', 'crops', 'climate'], orgType: 'RESEARCH', seniority: 'EXECUTIVE' },
  { name: 'Dr. Agnes Kalibata', role: 'President', org: 'AGRA', email: 'akalibata@agra.org', domains: ['agriculture', 'food', 'development', 'nutrition'], orgType: 'FOUNDATION', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Robert Zereyesus', role: 'Director General', org: 'CIMMYT (CGIAR)', email: 'r.zereyesus@cgiar.org', domains: ['agriculture', 'crops', 'climate', 'research'], orgType: 'RESEARCH', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Pamela Ronald', role: 'Professor', org: 'UC Davis / CIMMYT', email: 'pronald@ucdavis.edu', domains: ['agriculture', 'genetics', 'crops', 'research'], orgType: 'RESEARCH', seniority: 'DIRECTOR' },

  // ── Water & Sanitation ──────────────────────────────────────────────
  { name: 'Dr. Erik Solheim', role: 'Chair', org: 'UN Water', email: 'solheim@unwater.org', domains: ['water', 'sanitation', 'environment', 'climate'], orgType: 'UN', seniority: 'EXECUTIVE' },
  { name: 'Dr. Henrik Larsson', role: 'Water Resources Director', org: 'UN Water', email: 'h.larsson@unwater.org', domains: ['water', 'sanitation', 'infrastructure'], orgType: 'UN', seniority: 'DIRECTOR' },
  { name: 'Dr. Marco Lambertini', role: 'President', org: 'WWF International', email: 'lambertini@wwf.org', domains: ['water', 'environment', 'biodiversity', 'climate'], orgType: 'NGO', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. David Zalewski', role: 'Water Security Lead', org: 'UNESCO', email: 'zalewski@unesco.org', domains: ['water', 'science', 'policy', 'research'], orgType: 'UN', seniority: 'DIRECTOR' },

  // ── Education ───────────────────────────────────────────────────────
  { name: 'Maria Santos', role: 'Education Innovation', org: 'UNICEF', email: 'm.santos@unicef.org', domains: ['education', 'literacy', 'youth'], orgType: 'UN', seniority: 'DIRECTOR' },
  { name: 'David Kim', role: 'Digital Learning Director', org: 'World Bank', email: 'd.kim@worldbank.org', domains: ['education', 'digital', 'technology'], orgType: 'MULTILATERAL', seniority: 'DIRECTOR' },
  { name: 'Fatima Al-Rashid', role: 'Access to Education Lead', org: 'UNESCO', email: 'f.alrashid@unesco.org', domains: ['education', 'access', 'equity'], orgType: 'UN', seniority: 'DIRECTOR' },
  { name: 'Dr. Peter Evans', role: 'Director', org: 'Education Cannot Wait', email: 'evans@ecw.org', domains: ['education', 'youth', 'humanitarian', 'refugees'], orgType: 'UN', seniority: 'EXECUTIVE' },

  // ── Foundations ─────────────────────────────────────────────────────
  { name: 'Bill Gates', role: 'Co-Chair', org: 'Bill & Melinda Gates Foundation', email: 'bgates@gatesfoundation.org', domains: ['health', 'agriculture', 'development', 'education'], orgType: 'FOUNDATION', seniority: 'HEAD_OF_ORG' },
  { name: 'Melinda Gates', role: 'Founder', org: 'Pivotal Ventures', email: 'mgates@pivotalventures.org', domains: ['health', 'education', 'equality', 'development'], orgType: 'FOUNDATION', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Mark Dybul', role: 'President', org: 'Dybul Consulting (ex-Global Fund)', email: 'mark@dybul.com', domains: ['health', 'development', 'global-health', 'funding'], orgType: 'FOUNDATION', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Jeremy Farrar', role: 'Director', org: 'Wellcome Trust', email: 'farrar@wellcome.org', domains: ['health', 'research', 'epidemiology', 'medical'], orgType: 'FOUNDATION', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Susan Desmond-Hellmann', role: 'Former CEO', org: 'Wellcome Trust', email: 'hellmann@wellcome.org', domains: ['health', 'medical', 'research', 'global-health'], orgType: 'FOUNDATION', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Eric Lander', role: 'Chief Scientist', org: 'Open Philanthropy', email: 'lander@openphil.org', domains: ['science', 'research', 'health', 'technology'], orgType: 'FOUNDATION', seniority: 'EXECUTIVE' },
  { name: 'Dr. Jessica Rosenworcel', role: 'Board Member', org: 'Bezos Earth Fund', email: 'rosenworcel@bezosearthfund.org', domains: ['climate', 'technology', 'environment'], orgType: 'FOUNDATION', seniority: 'EXECUTIVE' },

  // ── NGOs & Civil Society ────────────────────────────────────────────
  { name: 'Dr. Jane Lubchenco', role: 'President', org: 'AAAS', email: 'jlubchenco@aaas.org', domains: ['environment', 'science', 'climate', 'ocean'], orgType: 'NGO', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Gro Harlem Brundtland', role: 'Chair', org: 'Independent World Commission', email: 'brundtland@undp.org', domains: ['climate', 'development', 'environment', 'policy'], orgType: 'NGO', seniority: 'EXECUTIVE' },
  { name: 'Dr. Rajiv Singh', role: 'Director', org: 'WRI (World Resources Institute)', email: 'singh@wri.org', domains: ['climate', 'environment', 'energy', 'urban'], orgType: 'NGO', seniority: 'EXECUTIVE' },
  { name: 'Dr. Julia Lohman', role: 'Executive Director', org: 'WRI', email: 'lohman@wri.org', domains: ['climate', 'urban', 'transport', 'environment'], orgType: 'NGO', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Jacqueline McGlade', role: 'Professor', org: 'UCL / WRI', email: 'mcglade@ucl.ac.uk', domains: ['environment', 'climate', 'ocean', 'modeling'], orgType: 'NGO', seniority: 'DIRECTOR' },

  // ── Government (Selected) ───────────────────────────────────────────
  { name: 'Dr. Amara Diallo', role: 'Global Health Programs', org: 'WHO (senior advisor)', email: 'a.diallo@who.int', domains: ['health', 'medical', 'epidemiology'], orgType: 'GOVERNMENT', seniority: 'DIRECTOR' },
  { name: 'Dr. Rochelle Walensky', role: 'Former CDC Director', org: 'CDC / Mass General', email: 'walensky@massgeneral.org', domains: ['health', 'epidemiology', 'medical', 'research'], orgType: 'GOVERNMENT', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Anthony Fauci', role: 'Director', org: 'Fauci Group / NIAID (former)', email: 'fauci@niaid.nih.gov', domains: ['health', 'epidemiology', 'vaccines', 'medical'], orgType: 'GOVERNMENT', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Monica Gandhi', role: 'Professor', org: 'UCSF / NIH', email: 'mgandhi@ucsf.edu', domains: ['health', 'epidemiology', 'medical', 'research'], orgType: 'GOVERNMENT', seniority: 'DIRECTOR' },

  // ── Technology & Digital Innovation ─────────────────────────────────
  { name: 'Dr. Fei-Fei Li', role: 'Professor', org: 'Stanford HAI', email: 'feifeili@stanford.edu', domains: ['technology', 'ai', 'data-analysis', 'research'], orgType: 'RESEARCH', seniority: 'DIRECTOR' },
  { name: 'Dr. Andrew Ng', role: 'Founder', org: 'DeepLearning.AI', email: 'andrew@deeplearning.ai', domains: ['technology', 'ai', 'education', 'data-analysis'], orgType: 'RESEARCH', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Daphne Koller', role: 'CEO', org: 'Insilico Medicine', email: 'koller@insilico.com', domains: ['technology', 'ai', 'medical', 'research'], orgType: 'RESEARCH', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Demis Hassabis', role: 'CEO', org: 'DeepMind / Google DeepMind', email: 'hassabis@google.com', domains: ['technology', 'ai', 'science', 'medical'], orgType: 'RESEARCH', seniority: 'HEAD_OF_ORG' },
  { name: 'Dr. Jeff Dean', role: 'Chief Scientist', org: 'Google DeepMind / Google', email: 'jdean@google.com', domains: ['technology', 'ai', 'data-analysis', 'research'], orgType: 'RESEARCH', seniority: 'HEAD_OF_ORG' },

  // ── Cross-cutting / General ─────────────────────────────────────────
  { name: 'Lisa Thompson', role: 'Program Director', org: 'UN Development Programme', email: 'l.thompson@undp.org', domains: ['development', 'policy', 'governance'], orgType: 'UN', seniority: 'DIRECTOR' },
  { name: 'Ahmed Hassan', role: 'Research Lead', org: 'UNESCO', email: 'a.hassan@unesco.org', domains: ['research', 'science', 'policy'], orgType: 'UN', seniority: 'DIRECTOR' },
  { name: 'Dr. Kim Donnelly', role: 'Director', org: 'UNICEF Innovation', email: 'kdonnelly@unicef.org', domains: ['technology', 'education', 'health', 'innovation'], orgType: 'UN', seniority: 'EXECUTIVE' },
  { name: 'Dr. Marcia Ryerson', role: 'Chief of Innovation', org: 'UNICEF', email: 'ryerson@unicef.org', domains: ['innovation', 'technology', 'development', 'youth'], orgType: 'UN', seniority: 'EXECUTIVE' },
]

async function seed() {
  let created = 0
  let updated = 0
  let skipped = 0

  for (const dm of DECISION_MAKERS) {
    const existing = await prisma.decisionMaker.findFirst({
      where: { name: dm.name, org: dm.org, email: dm.email },
    })

    if (existing) {
      await prisma.decisionMaker.update({
        where: { id: existing.id },
        data: {
          role: dm.role,
          domains: JSON.stringify(dm.domains),
          orgType: dm.orgType,
          seniority: dm.seniority,
          updatedAt: new Date(),
        },
      })
      updated++
    } else {
      await prisma.decisionMaker.create({
        data: {
          name: dm.name,
          role: dm.role,
          org: dm.org,
          email: dm.email,
          domains: JSON.stringify(dm.domains),
          orgType: dm.orgType,
          seniority: dm.seniority,
        },
      })
      created++
    }
    skipped++
  }

  console.log(`Decision-Maker seed: ${created} created, ${updated} updated, ${skipped} processed`)
  await prisma.$disconnect()
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
