-- CreateEnum
CREATE TYPE "ParsedItemType" AS ENUM ('subscription', 'order', 'membership', 'unknown');

-- CreateEnum
CREATE TYPE "ParsedItemStatus" AS ENUM ('active', 'likely', 'inactive', 'uncertain');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('AUTH_LOGIN_SUCCESS', 'AUTH_LOGIN_FAILURE', 'AUTH_LOGOUT', 'USER_EXPORT', 'USER_DELETE', 'INBOUND_ACCEPTED', 'INBOUND_REJECTED', 'INBOUND_DEDUPED', 'PARSE_SUCCESS', 'PARSE_UNCERTAIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForwardingAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localPart" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ForwardingAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageIdHash" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "snippet" TEXT NOT NULL,
    "rawStored" BOOLEAN NOT NULL DEFAULT false,
    "rawRef" TEXT,

    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawEmailBlob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inboundId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawEmailBlob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParsedItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inboundEmailId" TEXT NOT NULL,
    "type" "ParsedItemType" NOT NULL,
    "status" "ParsedItemStatus" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "merchant" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),
    "isRecurring" BOOLEAN NOT NULL,
    "cancelUrl" TEXT,
    "evidenceJson" JSONB NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParsedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "AuditEventType" NOT NULL,
    "requestId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ForwardingAddress_localPart_key" ON "ForwardingAddress"("localPart");

-- CreateIndex
CREATE INDEX "ForwardingAddress_userId_idx" ON "ForwardingAddress"("userId");

-- CreateIndex
CREATE INDEX "InboundEmail_userId_receivedAt_idx" ON "InboundEmail"("userId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboundEmail_userId_messageIdHash_key" ON "InboundEmail"("userId", "messageIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "RawEmailBlob_inboundId_key" ON "RawEmailBlob"("inboundId");

-- CreateIndex
CREATE INDEX "RawEmailBlob_expiresAt_idx" ON "RawEmailBlob"("expiresAt");

-- CreateIndex
CREATE INDEX "ParsedItem_userId_type_status_idx" ON "ParsedItem"("userId", "type", "status");

-- CreateIndex
CREATE INDEX "ParsedItem_userId_lastSeenAt_idx" ON "ParsedItem"("userId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_key_idx" ON "RateLimitBucket"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_key_windowStart_key" ON "RateLimitBucket"("key", "windowStart");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_type_createdAt_idx" ON "AuditLog"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "ForwardingAddress" ADD CONSTRAINT "ForwardingAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawEmailBlob" ADD CONSTRAINT "RawEmailBlob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawEmailBlob" ADD CONSTRAINT "RawEmailBlob_inboundId_fkey" FOREIGN KEY ("inboundId") REFERENCES "InboundEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParsedItem" ADD CONSTRAINT "ParsedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParsedItem" ADD CONSTRAINT "ParsedItem_inboundEmailId_fkey" FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
