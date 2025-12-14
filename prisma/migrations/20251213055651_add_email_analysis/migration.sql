-- CreateTable
CREATE TABLE "EmailAnalysis" (
    "id" TEXT NOT NULL,
    "inboundEmailId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "risks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailAnalysis_inboundEmailId_key" ON "EmailAnalysis"("inboundEmailId");

-- CreateIndex
CREATE INDEX "EmailAnalysis_createdAt_idx" ON "EmailAnalysis"("createdAt");

-- AddForeignKey
ALTER TABLE "EmailAnalysis" ADD CONSTRAINT "EmailAnalysis_inboundEmailId_fkey" FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;
