import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "DMR Confirmação de Presença",
  description: "Dashboard administrativo para confirmação operacional de presença.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

