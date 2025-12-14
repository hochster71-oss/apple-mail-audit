import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "destructive" | "secondary";
  size?: "default" | "sm";
};

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        size === "default" ? "h-10 px-4" : "h-9 px-3",
        variant === "default" && "bg-primary text-primary-foreground hover:opacity-90",
        variant === "outline" && "border border-border bg-transparent hover:bg-muted",
        variant === "destructive" && "bg-destructive text-destructive-foreground hover:opacity-90",
        variant === "secondary" && "bg-secondary text-secondary-foreground hover:opacity-90",
        className
      )}
      {...props}
    />
  );
}
