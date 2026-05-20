-- CreateTable
CREATE TABLE "mission_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "agentId" TEXT,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" INTEGER,
    "mimeType" TEXT,
    "checksum" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "mission_files_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "mission_files_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mission_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "agentId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mission_messages_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "mission_messages_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiredCapabilities" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "claimedByAgentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tasks_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tasks_claimedByAgentId_fkey" FOREIGN KEY ("claimedByAgentId") REFERENCES "agents" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_tasks" ("claimedByAgentId", "createdAt", "description", "id", "missionId", "requiredCapabilities", "status", "title", "updatedAt") SELECT "claimedByAgentId", "createdAt", "description", "id", "missionId", "requiredCapabilities", "status", "title", "updatedAt" FROM "tasks";
DROP TABLE "tasks";
ALTER TABLE "new_tasks" RENAME TO "tasks";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
