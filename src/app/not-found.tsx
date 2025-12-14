import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="container py-10">
      <Card>
        <CardHeader>
          <CardTitle>Page not found</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>The page you requested does not exist.</p>
          <Link className="underline" href="/dashboard">
            Go to dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
