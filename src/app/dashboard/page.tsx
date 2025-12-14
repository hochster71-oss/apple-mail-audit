import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "./SignOutButton";
import { IcloudSyncCard } from "./IcloudSyncCard";

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(d);
}

function currencyTotals(items: Array<{ amount: number | null; currency: string; isRecurring: boolean; confidence: number | null }>) {
  const map = new Map<string, number>();
  for (const it of items) {
    if (!it.isRecurring) continue;
    if (it.amount === null) continue;
    // Only include high-confidence items (>80%)
    if (!it.confidence || it.confidence < 0.8) continue;
    const cur = it.currency || "unknown";
    map.set(cur, (map.get(cur) ?? 0) + it.amount);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

type DashboardSearchParams = { tab?: string; q?: string; status?: string };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<DashboardSearchParams>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const sp: DashboardSearchParams = await (searchParams ?? Promise.resolve<DashboardSearchParams>({}));
  const tab = (sp.tab ?? "subscriptions").toLowerCase();
  const q = (sp.q ?? "").trim();
  const status = (sp.status ?? "").trim();

  const typeFilter =
    tab === "subscriptions"
      ? "subscription"
      : tab === "orders"
        ? "order"
        : tab === "memberships"
          ? "membership"
          : tab === "uncertain"
            ? "unknown"
            : "subscription";

  const where: any = {
    userId,
    type: typeFilter,
  };
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { merchant: { contains: q, mode: "insensitive" } },
      { product: { contains: q, mode: "insensitive" } },
    ];
  }

  const [items, totalCount, recurringForTotals, syncConfig, allItemsForAnalytics] = await Promise.all([
    prisma.parsedItem.findMany({
      where,
      orderBy: [{ lastSeenAt: "desc" }],
      take: 200,
      select: {
        id: true,
        type: true,
        status: true,
        confidence: true,
        merchant: true,
        product: true,
        amount: true,
        currency: true,
        isRecurring: true,
        lastSeenAt: true,
      },
    }),
    prisma.parsedItem.count({ where }),
    prisma.parsedItem.findMany({
      where: {
        userId,
        isRecurring: true,
        status: { in: ["active", "likely"] },
        type: { in: ["subscription", "membership"] },
        confidence: { gte: 0.8 }, // Only high-confidence items
      },
      select: { amount: true, currency: true, isRecurring: true, confidence: true },
    }),
    prisma.icloudSyncConfig.findUnique({
      where: { userId },
      select: {
        enabled: true,
        mailbox: true,
        limit: true,
        sinceDays: true,
        lastRunAt: true,
        lastStatus: true,
        lastError: true,
      },
    }),
    // Fetch last 90 days for analytics (high-confidence only)
    prisma.parsedItem.findMany({
      where: {
        userId,
        lastSeenAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        confidence: { gte: 0.8 }, // Only high-confidence items for analytics
      },
      select: {
        merchant: true,
        amount: true,
        currency: true,
        type: true,
        status: true,
        lastSeenAt: true,
        isRecurring: true,
        confidence: true,
      },
    }),
  ]);

  const totals = currencyTotals(recurringForTotals);

  const intervalMinutes = env.ICLOUD_SYNC_INTERVAL_MINUTES;

  const syncConfigForClient = syncConfig
    ? {
        ...syncConfig,
        lastRunAt: syncConfig.lastRunAt?.toISOString() ?? null,
        lastStatus: syncConfig.lastStatus ?? null,
        lastError: syncConfig.lastError ?? null,
      }
    : null;

  // Build analytics
  const analyticsData = (() => {
    if (!allItemsForAnalytics.length) return undefined;

    // Spending trend (last 30 days, daily buckets)
    const dayBuckets = new Map<string, number>();
    const now = Date.now();
    for (let i = 0; i < 30; i++) {
      const date = new Date(now - i * 24 * 60 * 60 * 1000);
      dayBuckets.set(date.toISOString().split("T")[0], 0);
    }

    allItemsForAnalytics.forEach((item) => {
      if (item.amount && item.lastSeenAt) {
        const key = item.lastSeenAt.toISOString().split("T")[0];
        if (dayBuckets.has(key)) {
          dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + item.amount);
        }
      }
    });

    const spendingTrend = Array.from(dayBuckets.entries())
      .map(([date, amount]) => ({ date: new Date(date), amount }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // Category breakdown
    const categoryMap = new Map<string, { amount: number; count: number }>();
    allItemsForAnalytics.forEach((item) => {
      const cat = item.type || "unknown";
      const existing = categoryMap.get(cat) ?? { amount: 0, count: 0 };
      categoryMap.set(cat, {
        amount: existing.amount + (item.amount ?? 0),
        count: existing.count + 1,
      });
    });
    const categoryBreakdown = Array.from(categoryMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.amount - a.amount);

    // Top merchants by total amount
    const merchantMap = new Map<string, { amount: number; count: number }>();
    allItemsForAnalytics.forEach((item) => {
      if (!item.merchant) return;
      const existing = merchantMap.get(item.merchant) ?? { amount: 0, count: 0 };
      merchantMap.set(item.merchant, {
        amount: existing.amount + (item.amount ?? 0),
        count: existing.count + 1,
      });
    });
    const topMerchants = Array.from(merchantMap.entries())
      .map(([merchant, data]) => ({
        merchant,
        amount: data.amount,
        frequency: Math.round(data.count / 3), // Estimate per month over 90 days
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // Anomaly detection (charges 2x higher than merchant average)
    const recentAnomalies: Array<{ date: Date; amount: number; merchant: string; anomalyScore: number }> = [];
    const merchantAvg = new Map<string, number>();
    allItemsForAnalytics.forEach((item) => {
      if (item.merchant && item.amount) {
        const existing = merchantAvg.get(item.merchant);
        if (!existing) {
          merchantAvg.set(item.merchant, item.amount);
        } else {
          merchantAvg.set(item.merchant, (existing + item.amount) / 2);
        }
      }
    });

    allItemsForAnalytics.forEach((item) => {
      if (item.merchant && item.amount && item.lastSeenAt) {
        const avg = merchantAvg.get(item.merchant);
        if (avg && item.amount > avg * 2) {
          recentAnomalies.push({
            date: item.lastSeenAt,
            amount: item.amount,
            merchant: item.merchant,
            anomalyScore: item.amount / avg - 1,
          });
        }
      }
    });
    recentAnomalies.sort((a, b) => b.date.getTime() - a.date.getTime());

    // Monthly recurring estimate (high-confidence only)
    const monthlyRecurring = recurringForTotals
      .filter((item) => item.confidence && item.confidence >= 0.8)
      .reduce((sum, item) => sum + (item.amount ?? 0), 0);

    // Status distribution
    const statusMap = new Map<string, number>();
    allItemsForAnalytics.forEach((item) => {
      const status = item.status || "unknown";
      statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
    });
    const statusDistribution = Array.from(statusMap.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    return {
      spendingTrend,
      categoryBreakdown,
      recentAnomalies: recentAnomalies.slice(0, 5),
      monthlyRecurring,
      topMerchants,
      statusDistribution,
    };
  })();
  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mail Audit</h1>
          <p className="text-sm text-muted-foreground">Evidence-based view of subscriptions, orders, and memberships.</p>
        </div>
        <SignOutButton />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Estimated monthly recurring (estimate)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            {totals.length === 0 ? (
              <div>No recurring totals yet.</div>
            ) : (
              totals.map(([cur, total]) => (
                <div key={cur} className="flex items-center justify-between">
                  <span>{cur}</span>
                  <span className="text-foreground">{total.toFixed(2)}</span>
                </div>
              ))
            )}
            <div className="text-xs text-muted-foreground">
              Based on active/likely recurring items; may be incomplete.
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Counts</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <div className="flex items-center justify-between">
              <span>Results (showing / total)</span>
              <span className="text-foreground">{items.length} / {totalCount}</span>
            </div>
            <div className="flex items-center justify-between"><span>Tab</span><span className="text-foreground">{tab}</span></div>
            <div className="flex items-center justify-between"><span>Status filter</span><span className="text-foreground">{status || "(any)"}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tools</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <a className="underline" href="/api/user/export" target="_blank" rel="noreferrer">Export my data</a>
            <div>Inbound endpoint: <span className="font-mono">/api/inbound/email</span></div>
            <div>Demo ingest: <span className="font-mono">pnpm demo:ingest</span></div>
          </CardContent>
        </Card>
        <IcloudSyncCard
          initial={syncConfigForClient}
          hasCreds={!!env.ICLOUD_EMAIL && !!env.ICLOUD_APP_PASSWORD}
          intervalMinutes={intervalMinutes}
          analytics={analyticsData}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {[
                { key: "subscriptions", label: "Subscriptions" },
                { key: "orders", label: "Orders" },
                { key: "memberships", label: "Memberships" },
                { key: "uncertain", label: "Uncertain" },
              ].map((t) => (
                <Link
                  key={t.key}
                  className={
                    "text-sm rounded-md border px-3 py-1.5 " +
                    (tab === t.key ? "border-border bg-muted" : "border-border bg-transparent")
                  }
                  href={{ pathname: "/dashboard", query: { ...sp, tab: t.key } }}
                  data-testid={`tab-${t.key}`}
                >
                  {t.label}
                </Link>
              ))}
            </div>

            <form className="flex gap-2" action="/dashboard" method="GET" data-testid="search-form">
              <input type="hidden" name="tab" value={tab} />
              <Input name="q" defaultValue={q} placeholder="Search merchant/product" data-testid="search-merchant" />
              <Input name="status" defaultValue={status} placeholder="Status (active|likely|inactive|uncertain)" data-testid="search-status" />
              <Button variant="outline" type="submit" data-testid="search-submit">Apply</Button>
            </form>
          </div>

          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground border border-border rounded-md p-4">
              Empty state. Run <span className="font-mono">pnpm demo:ingest</span> to ingest sample emails.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-medium">Merchant</th>
                    <th className="text-left py-2 pr-4 font-medium">Status</th>
                    <th className="text-left py-2 pr-4 font-medium">Confidence</th>
                    <th className="text-left py-2 pr-4 font-medium">Amount</th>
                    <th className="text-left py-2 pr-4 font-medium">Last seen</th>
                    <th className="text-right py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-border/50">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-foreground">{it.merchant}</div>
                        <div className="text-xs text-muted-foreground">{it.product}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge>{it.status}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{Math.round(it.confidence * 100)}%</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {it.amount !== null ? `${it.amount} ${it.currency}` : "—"}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{fmtDate(it.lastSeenAt)}</td>
                      <td className="py-3 text-right">
                        <Link className="underline text-muted-foreground" href={`/items/${it.id}`}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
