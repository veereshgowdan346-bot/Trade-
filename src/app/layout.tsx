import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "OmniTradePro Apex Terminal",
  description: "3-broker (Angel One, Shoonya, Groww) autonomous trading cockpit with risk sentinel and Gmail audit.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
