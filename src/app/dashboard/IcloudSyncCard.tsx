"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { arc, easeCubic, interpolate, scaleLinear, select, line, curveMonotoneX, extent, scaleTime, axisBottom, axisLeft, pie } from "d3";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Config = {
  enabled: boolean;
  mailbox: string;
  limit: number;
  sinceDays: number;
  lastRunAt?: string | null;
  lastStatus?: string | null;
  lastError?: string | null;
};

type AnalyticsData = {
  spendingTrend: Array<{ date: Date; amount: number }>;
  categoryBreakdown: Array<{ category: string; amount: number; count: number }>;
  recentAnomalies: Array<{ date: Date; amount: number; merchant: string; anomalyScore: number }>;
  monthlyRecurring: number;
  topMerchants: Array<{ merchant: string; amount: number; frequency: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
};

function fmt(d?: string | null) {
  if (!d) return "never";
  const dt = new Date(d);
  if (Number.isNaN(dt.valueOf())) return "unknown";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(dt);
}

function fmtRelative(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.valueOf())) return "unknown";
  const diffMinutes = (Date.now() - dt.getTime()) / 60000;
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${Math.round(diffMinutes)}m ago`;
  const hours = diffMinutes / 60;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function IcloudSyncCard({
  initial,
  hasCreds,
  intervalMinutes,
  analytics,
}: {
  initial: Config | null;
  hasCreds: boolean;
  intervalMinutes: number;
  analytics?: AnalyticsData;
}) {
  const [cfg, setCfg] = useState<Config | null>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"sync" | "spending" | "trends">("sync");
  const gaugeRef = useRef<SVGSVGElement | null>(null);
  const trendChartRef = useRef<SVGSVGElement | null>(null);
  const pieChartRef = useRef<SVGSVGElement | null>(null);

  const enabled = cfg?.enabled ?? false;
  const lastRunIso = cfg?.lastRunAt ?? null;
  const lastRun = lastRunIso ? new Date(lastRunIso) : null;
  
  // Recalculate freshness every second for live updates (client-side only)
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // Initialize on mount to avoid hydration mismatch
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const freshness = useMemo(() => {
    if (!lastRun || !intervalMinutes || now === null) return 0;
    const minutesSince = (now - lastRun.getTime()) / 60000;
    const ratio = Math.max(0, Math.min(1, 1 - minutesSince / intervalMinutes));
    return Number.isFinite(ratio) ? ratio : 0;
  }, [lastRun, intervalMinutes, now]);

  useEffect(() => {
    const svgEl = gaugeRef.current;
    if (!svgEl) return;

    try {
      const size = 180;
      const radius = 68;
      const thickness = 14;
      const startAngle = -Math.PI / 2;
      const fullAngle = Math.PI * 2;
      const targetAngle = startAngle + fullAngle * freshness;

      const svg = select(svgEl);
      svg.selectAll("*").remove();
      svg.attr("viewBox", `0 0 ${size} ${size}`);

      const colorScale = scaleLinear<string>().domain([0, 0.5, 1]).range(["#ef4444", "#f59e0b", "#22c55e"]);
      const track = arc().startAngle(startAngle).endAngle(startAngle + fullAngle).innerRadius(radius - thickness).outerRadius(radius);
      const valueArc = arc().startAngle(startAngle).innerRadius(radius - thickness).outerRadius(radius);

      svg
        .append("path")
        .attr("d", track as any)
        .attr("fill", "#e5e7eb");

      const indicator = svg
        .append("path")
        .datum<{ endAngle: number }>({ endAngle: startAngle })
        .attr("fill", colorScale(freshness))
        .attr("d", valueArc as any);

      indicator
        .transition()
        .duration(650)
        .ease(easeCubic)
        .attrTween("d", function ({ endAngle }) {
          const i = interpolate(endAngle, targetAngle);
          return (t: number) => valueArc({ endAngle: i(t) } as any) as string;
        });

      const center = size / 2;
      svg
        .append("text")
        .attr("x", center)
        .attr("y", center - 6)
        .attr("text-anchor", "middle")
        .attr("class", "fill-foreground text-xl font-semibold")
        .text(`${Math.round(freshness * 100)}%`);

      svg
        .append("text")
        .attr("x", center)
        .attr("y", center + 16)
        .attr("text-anchor", "middle")
        .attr("class", "fill-muted-foreground text-xs")
        .text("recency");
    } catch (error) {
      console.error("Gauge chart render error:", error);
      const svg = select(svgEl);
      svg.selectAll("*").remove();
      svg.append("text")
        .attr("x", 90)
        .attr("y", 90)
        .attr("text-anchor", "middle")
        .attr("class", "fill-red-500 text-xs")
        .text("Chart error");
    }
  }, [freshness]);

  // Spending trend chart
  useEffect(() => {
    if (!trendChartRef.current || !analytics?.spendingTrend.length) return;

    try {
      const margin = { top: 20, right: 30, bottom: 40, left: 60 };
      const width = 500 - margin.left - margin.right;
      const height = 250 - margin.top - margin.bottom;

      const svg = select(trendChartRef.current);
      svg.selectAll("*").remove();
      svg.attr("viewBox", `0 0 500 250`);

      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      const [minDate, maxDate] = extent(analytics.spendingTrend, (d) => d.date) as [Date, Date];
      const maxAmount = Math.max(...analytics.spendingTrend.map((d) => d.amount));

      if (!minDate || !maxDate || !isFinite(maxAmount)) {
        throw new Error("Invalid data for chart");
      }

      const xScale = scaleTime().domain([minDate, maxDate]).range([0, width]);
      const yScale = scaleLinear().domain([0, maxAmount * 1.1]).range([height, 0]);

      // Grid lines
      g.append("g")
        .attr("class", "grid")
        .attr("opacity", 0.1)
        .call(
          axisLeft(yScale)
            .ticks(5)
            .tickSize(-width)
            .tickFormat(() => "")
        );

      // Line
      const lineGenerator = line<{ date: Date; amount: number }>()
        .x((d) => xScale(d.date))
        .y((d) => yScale(d.amount))
        .curve(curveMonotoneX);

      g.append("path")
        .datum(analytics.spendingTrend)
        .attr("fill", "none")
        .attr("stroke", "#3b82f6")
        .attr("stroke-width", 2.5)
        .attr("d", lineGenerator);


      // Axes
      g.append("g")
        .attr("transform", `translate(0,${height})`)
        .attr("class", "text-xs")
        .call(axisBottom(xScale).ticks(5));

      g.append("g").attr("class", "text-xs").call(axisLeft(yScale).ticks(5));

      // Y-axis label
      g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - height / 2)
        .attr("dy", "1em")
        .attr("class", "text-xs fill-muted-foreground")
        .style("text-anchor", "middle")
        .text("Amount ($)");
    } catch (error) {
      console.error("Trend chart render error:", error);
      const svg = select(trendChartRef.current);
      svg.selectAll("*").remove();
      svg.append("text")
        .attr("x", 250)
        .attr("y", 125)
        .attr("text-anchor", "middle")
        .attr("class", "fill-red-500 text-sm")
        .text("Chart render error");
    }
  }, [analytics?.spendingTrend]);

  // Category pie chart
  useEffect(() => {
    if (!pieChartRef.current || !analytics?.categoryBreakdown.length) return;

    try {
      const size = 200;
      const radius = 80;

      const svg = select(pieChartRef.current);
      svg.selectAll("*").remove();
      svg.attr("viewBox", `0 0 ${size} ${size}`);

      const g = svg.append("g").attr("transform", `translate(${size / 2},${size / 2})`);

      const colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4"];
      const colorScale = scaleLinear<string>().domain([0, analytics.categoryBreakdown.length]).range(colors.slice(0, 2));

      const pieGenerator = pie<any>().value((d: any) => d.amount);
      const arcGenerator = arc<any>().innerRadius(radius * 0.5).outerRadius(radius);

      const arcs = g
        .selectAll(".arc")
        .data(pieGenerator(analytics.categoryBreakdown))
        .enter()
        .append("g")
        .attr("class", "arc");

      arcs
        .append("path")
        .attr("d", arcGenerator)
        .attr("fill", (d, i) => colors[i % colors.length])
        .attr("stroke", "white")
        .attr("stroke-width", 2)
        .on("mouseover", function () {
          select(this).attr("opacity", 0.8);
        })
        .on("mouseout", function () {
          select(this).attr("opacity", 1);
        });

      // Center text
      g.append("text")
        .attr("text-anchor", "middle")
        .attr("class", "text-sm font-semibold fill-foreground")
        .text(`${analytics.categoryBreakdown.length}`);

      g.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "1.2em")
        .attr("class", "text-xs fill-muted-foreground")
        .text("categories");
    } catch (error) {
      console.error("Pie chart render error:", error);
      const svg = select(pieChartRef.current);
      svg.selectAll("*").remove();
      svg.append("text")
        .attr("x", 100)
        .attr("y", 100)
        .attr("text-anchor", "middle")
        .attr("class", "fill-red-500 text-xs")
        .text("Chart error");
    }
  }, [analytics?.categoryBreakdown]);

  const hasAnalytics = analytics && (
    analytics.spendingTrend.length > 0 ||
    analytics.categoryBreakdown.length > 0 ||
    analytics.topMerchants.length > 0
  );

  async function toggle() {
    if (pending) return; // Prevent double-click
    setPending(true);
    setError(null);
    const action = enabled ? "disable" : "enable";
    try {
      const res = await fetch("/api/icloud-sync/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const json = await res.json();
      if (!res.ok) {
        const errorMsg = json?.error ?? "Failed to update";
        setError(errorMsg);
        toast.error(`Failed to ${action} sync: ${errorMsg}`);
        return;
      }
      setCfg(json.config ?? null);
      toast.success(`Sync ${action}d successfully`);
    } catch (e: any) {
      const errorMsg = e?.message ?? "Network error";
      setError(errorMsg);
      toast.error(`Failed to ${action} sync: ${errorMsg}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>iCloud IMAP sync</CardTitle>
            <p className="text-xs text-muted-foreground">Server pull into inbound pipeline with live analysis.</p>
          </div>
          <Badge variant={enabled ? "default" : "outline"}>{enabled ? "Enabled" : "Disabled"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        {/* Tab Navigation */}
        {hasAnalytics && (
          <div className="flex gap-2 border-b pb-2">
            <Button
              size="sm"
              variant={activeView === "sync" ? "default" : "outline"}
              onClick={() => setActiveView("sync")}
              data-testid="analytics-tab-sync"
            >
              Sync Status
            </Button>
            <Button
              size="sm"
              variant={activeView === "spending" ? "default" : "outline"}
              onClick={() => setActiveView("spending")}
              data-testid="analytics-tab-spending"
            >
              Spending Analysis
            </Button>
            <Button
              size="sm"
              variant={activeView === "trends" ? "default" : "outline"}
              onClick={() => setActiveView("trends")}
              data-testid="analytics-tab-trends"
            >
              Trends & Insights
            </Button>
          </div>
        )}

        {/* Sync Status View */}
        {activeView === "sync" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">Mailbox: {cfg?.mailbox ?? "INBOX"}</Badge>
                <Badge variant="outline">Limit: {cfg?.limit ?? 250}</Badge>
                <Badge variant="outline">Lookback: {cfg?.sinceDays ?? 365}d</Badge>
                <Badge variant="outline">Interval: {intervalMinutes}m</Badge>
              </div>
              <div className="grid gap-1">
                <div>Last run: <span className="text-foreground">{fmt(cfg?.lastRunAt)}</span> ({fmtRelative(cfg?.lastRunAt)})</div>
                <div className="flex items-center gap-2">
                  <span>Last status:</span>
                  <Badge variant="outline" className="bg-muted text-foreground">
                    {cfg?.lastStatus ?? "—"}
                  </Badge>
                </div>
                {cfg?.lastError && <div className="text-red-500">Error: {cfg.lastError}</div>}
              </div>
              {!hasCreds && <div className="text-xs text-red-500">Set ICLOUD_EMAIL and ICLOUD_APP_PASSWORD in .env</div>}
              {error && <div className="text-red-500 text-xs" data-testid="sync-error">{error}</div>}
              <div className="flex gap-2">
                <Button onClick={toggle} disabled={pending || !hasCreds} variant={enabled ? "outline" : "default"} data-testid="sync-toggle">
                  {pending ? "Saving..." : enabled ? "Disable" : "Enable"}
                </Button>
                <span className="text-xs text-muted-foreground self-center">Runs automatically every {intervalMinutes} minutes.</span>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-2">
              <svg ref={gaugeRef} className="w-full max-w-[220px]" aria-label="Sync recency gauge" />
              <div className="text-xs text-muted-foreground">Recency vs interval; 100% means just ran.</div>
            </div>
          </div>
        )}

        {/* Spending Analysis View */}
        {activeView === "spending" && analytics && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Category Breakdown</h4>
                <svg ref={pieChartRef} className="w-full max-w-[200px] mx-auto" aria-label="Category distribution" />
                <div className="space-y-1 text-xs">
                  {analytics.categoryBreakdown.slice(0, 5).map((cat, i) => (
                    <div key={cat.category} className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"][i] }} />
                        <span className="text-foreground">{cat.category}</span>
                      </div>
                      <span className="text-foreground font-medium">${cat.amount.toFixed(2)} <span className="text-muted-foreground">({cat.count})</span></span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Top Merchants</h4>
                <div className="space-y-2 text-xs">
                  {analytics.topMerchants.slice(0, 5).map((merchant, i) => (
                    <div key={merchant.merchant} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="w-6 h-6 p-0 flex items-center justify-center">{i + 1}</Badge>
                        <span className="text-foreground font-medium">{merchant.merchant}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-foreground font-semibold">${merchant.amount.toFixed(2)}</div>
                        <div className="text-muted-foreground">{merchant.frequency}x/mo</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {analytics.recentAnomalies.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="text-amber-500">⚠</span> Recent Anomalies
                </h4>
                <div className="space-y-1 text-xs">
                  {analytics.recentAnomalies.slice(0, 3).map((anomaly, i) => (
                    <div key={i} className="flex justify-between items-center p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded">
                      <div>
                        <div className="text-foreground font-medium">{anomaly.merchant}</div>
                        <div className="text-muted-foreground">{anomaly.date.toLocaleDateString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-amber-600 dark:text-amber-400 font-semibold">${anomaly.amount.toFixed(2)}</div>
                        <div className="text-amber-600/70 dark:text-amber-400/70">{(anomaly.anomalyScore * 100).toFixed(0)}% unusual</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Trends View */}
        {activeView === "trends" && analytics && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">30-Day Spending Trend</h4>
              <svg ref={trendChartRef} className="w-full" aria-label="Spending trend over time" />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 bg-muted/50 rounded-lg space-y-1">
                <div className="text-xs text-muted-foreground">Monthly Recurring</div>
                <div className="text-2xl font-bold text-foreground">${analytics.monthlyRecurring.toFixed(2)}</div>
                <div className="text-xs text-green-600 dark:text-green-400">Projected</div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg space-y-1">
                <div className="text-xs text-muted-foreground">Active Subscriptions</div>
                <div className="text-2xl font-bold text-foreground">{analytics.statusDistribution.find(s => s.status === "active")?.count ?? 0}</div>
                <div className="text-xs text-blue-600 dark:text-blue-400">Currently active</div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg space-y-1">
                <div className="text-xs text-muted-foreground">Unique Merchants</div>
                <div className="text-2xl font-bold text-foreground">{analytics.topMerchants.length}</div>
                <div className="text-xs text-purple-600 dark:text-purple-400">Tracked</div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Status Distribution</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {analytics.statusDistribution.map((stat) => (
                  <div key={stat.status} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                    <span className="text-foreground capitalize">{stat.status}</span>
                    <Badge variant="outline">{stat.count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="text-[10px] text-muted-foreground text-center pt-2 border-t">UI rev: d3-analytics-enhanced</div>
      </CardContent>
    </Card>
  );
}
