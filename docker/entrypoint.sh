#!/bin/sh
set -e

echo "Running migrations..."
./node_modules/.bin/prisma migrate deploy

# Seed demo data once (only if DB is empty)
node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const count = await prisma.user.count();
  await prisma.$disconnect();
  if (count === 0) process.exit(10);
})().catch(async (e) => {
  console.error(e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
NODE
code=$?
if [ "$code" -eq 10 ]; then
  echo "Seeding demo user (empty database)..."
  ./node_modules/.bin/prisma db seed
fi

echo "Starting server..."
exec node node_modules/next/dist/bin/next start -p 3000 -H 0.0.0.0
