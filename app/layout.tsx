import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scar Tissue",
  description: "Every agent failure becomes a tested upgrade to its own harness.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
