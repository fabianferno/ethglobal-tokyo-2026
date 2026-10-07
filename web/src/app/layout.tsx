import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jev OS",
  description: "A desktop where anything you type becomes an app. Interfaces composed live by Jev.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
