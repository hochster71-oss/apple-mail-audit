const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const cfg = await prisma.icloudSyncConfig.findMany();
  console.log('iCloud Sync Config:', JSON.stringify(cfg, null, 2));
}

main()
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
