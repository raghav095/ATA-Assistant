import { Outfit, Inter } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-heading-next",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body-next",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata = {
  title: "Aegis - AI Clinical Triage & Safety Override System",
  description: "A premium HealthTech assistant for symptom intake, adaptive clinical questioning, safety overrides, and structured clinical handovers.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
export { outfit, inter };
