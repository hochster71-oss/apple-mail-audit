import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const active = await prisma.parsedItem.findMany({
    where: { status: "active" },
    select: {
      merchant: true,
      amount: true,
      currency: true,
      confidence: true,
      renewalDate: true,
    },
    orderBy: [{ amount: "desc" }],
  });

  console.log(`\n=== ACTIVE MONTHLY RECURRING (${active.length} items) ===\n`);

  const grouped = new Map<string, { item: typeof active[0]; count: number }>();
  for (const item of active) {
    const key = `${item.merchant}|${item.amount}|${item.currency}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count++;
    } else {
      grouped.set(key, { item, count: 1 });
    }
  }

  for (const { item, count } of grouped.values()) {
    const lastSeen = item.renewalDate?.toISOString().split("T")[0] || "N/A";
    console.log(
      `${item.merchant}: ${item.currency} ${item.amount?.toFixed(2)} (${item.confidence}% confidence, seen ${count}x, renewal: ${lastSeen})`
    );
  }

  const totalUSD = active
    .filter((i) => i.currency === "USD")
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  const totalEUR = active
    .filter((i) => i.currency === "EUR")
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  console.log(`\n--- TOTALS ---`);
  if (totalEUR > 0) console.log(`EUR: ${totalEUR.toFixed(2)}/month`);
  if (totalUSD > 0) console.log(`USD: ${totalUSD.toFixed(2)}/month`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
