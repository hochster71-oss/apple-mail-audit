import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mail Audit",
  description: "Local-first subscription and order audit from forwarded emails",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">
        <div className="min-h-screen flex flex-col">
          <main className="flex-1">{children}</main>
          <footer className="border-t border-border bg-card">
            <div className="container py-4 text-sm text-muted-foreground">Developed by Michael Hoch</div>
          </footer>
        </div>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
