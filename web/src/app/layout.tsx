import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Suica OS",
  description: "A fully hallucinated operating system where every app is an agent with an ENS name and a Sui wallet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
