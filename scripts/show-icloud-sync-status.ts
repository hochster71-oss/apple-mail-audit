import { prisma } from '@/lib/db';

async function main() {
  const cfg = await prisma.icloudSyncConfig.findMany();
  console.log(JSON.stringify(cfg, null, 2));
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
