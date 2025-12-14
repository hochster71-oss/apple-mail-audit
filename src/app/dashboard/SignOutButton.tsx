"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex gap-2" data-testid="sign-out-confirm">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => {
            void signOut({ callbackUrl: "/login" });
          }}
          data-testid="sign-out-confirm-yes"
        >
          Confirm Sign Out
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setConfirming(false)}
          data-testid="sign-out-cancel"
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      type="button"
      onClick={() => setConfirming(true)}
      data-testid="sign-out-button"
    >
      Sign out
    </Button>
  );
}
