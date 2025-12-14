-- CreateTable
CREATE TABLE "IcloudSyncConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mailbox" TEXT NOT NULL DEFAULT 'INBOX',
    "limit" INTEGER NOT NULL DEFAULT 250,
    "sinceDays" INTEGER NOT NULL DEFAULT 365,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,

    CONSTRAINT "IcloudSyncConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IcloudSyncConfig_userId_key" ON "IcloudSyncConfig"("userId");

-- CreateIndex
CREATE INDEX "IcloudSyncConfig_enabled_idx" ON "IcloudSyncConfig"("enabled");

-- AddForeignKey
ALTER TABLE "IcloudSyncConfig" ADD CONSTRAINT "IcloudSyncConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
