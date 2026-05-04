import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StudySpotter",
  description: "Find nearby University of Sydney study spaces with seats available."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
