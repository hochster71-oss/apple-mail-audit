"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setPending(true);

        const form = e.currentTarget;
        const formData = new FormData(form);
        const email = String(formData.get("email") ?? "");
        const password = String(formData.get("password") ?? "");

        const res = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });

        setPending(false);

        if (res?.error) {
          setError("Invalid email or password.");
          return;
        }

        window.location.href = "/dashboard";
      }}
    >
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground" htmlFor="email">
          Email
        </label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground" htmlFor="password">
          Password
        </label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error ? <div className="text-sm text-destructive">{error}</div> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
