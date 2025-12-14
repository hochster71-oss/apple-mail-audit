import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(d);
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const item = await prisma.parsedItem.findFirst({
    where: { id: p.id, userId },
    include: { inboundEmail: true },
  });

  if (!item) redirect("/dashboard");

  const evidence = item.evidenceJson as any;
  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Item detail</h1>
          <p className="text-sm text-muted-foreground">Traceable evidence tied to the source email.</p>
        </div>
        <Link className="text-sm underline text-muted-foreground" href="/dashboard">
          Back
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{item.merchant}</span>
            <Badge>{item.type}</Badge>
            <Badge variant="outline">{item.status}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <div className="text-muted-foreground">Product</div>
            <div>{item.product}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Confidence</div>
            <div>{Math.round(item.confidence * 100)}%</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Amount</div>
            <div>
              {item.amount !== null ? `${item.amount} ${item.currency}` : "—"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Recurring</div>
            <div>{item.isRecurring ? "Yes" : "No"}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Transaction date</div>
            <div>{fmtDate(item.transactionDate)}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Renewal date</div>
            <div>{fmtDate(item.renewalDate)}</div>
          </div>
          <div className="md:col-span-2 space-y-1">
            <div className="text-muted-foreground">Action hint</div>
            <div>
              {item.cancelUrl ? (
                <a className="underline" href={item.cancelUrl} target="_blank" rel="noreferrer">
                  Cancel / manage subscription
                </a>
              ) : (
                <span>Search the provider account settings to cancel/manage.</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evidence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="text-muted-foreground">Reason</div>
            <div>{evidence?.reason ?? "—"}</div>
            <div className="text-muted-foreground mt-1">Status rationale</div>
            <div>{evidence?.statusReason ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Snippets</div>
            <ul className="mt-2 space-y-2">
              {(evidence?.snippets ?? []).map((s: string, i: number) => (
                <li key={i} className="border border-border rounded-md p-3 bg-background">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>View source</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div>
            <span className="text-muted-foreground">From:</span> {item.inboundEmail.from}
          </div>
          <div>
            <span className="text-muted-foreground">Subject:</span> {item.inboundEmail.subject}
          </div>
          <div>
            <span className="text-muted-foreground">Date:</span> {fmtDate(item.inboundEmail.date)}
          </div>
          <div>
            <span className="text-muted-foreground">Snippet:</span>
            <div className="mt-2 border border-border rounded-md p-3 bg-background text-muted-foreground">
              {item.inboundEmail.snippet}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
