"use client";

import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="container py-10">
      <Card>
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">An unexpected error occurred.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="text-xs whitespace-pre-wrap text-muted-foreground border border-border rounded-md p-3 bg-background">
            {error.message}
          </pre>
          <button
            className="text-sm underline text-muted-foreground"
            onClick={() => reset()}
            type="button"
          >
            Try again
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
