import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="container py-12">
      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Use the seeded demo account after running <span className="font-mono">pnpm db:seed</span>.
            </p>
          </CardHeader>
          <CardContent>
            <LoginForm />
            <div className="mt-4 text-sm text-muted-foreground">
              <Link className="underline" href="/">
                Back to dashboard
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

