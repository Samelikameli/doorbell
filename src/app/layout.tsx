// app/layout.tsx
"use client";

import "./globals.css";
import { Montserrat } from "next/font/google";
//import { ThemeProvider } from "@/context/ThemeContext";
//import ThemeClientWrapper from "@/components/ThemeClientWrapper";
import { UserProvider } from '../context/UserContext';
const montserrat = Montserrat({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fi" className="dark">
      <head>
        <meta name="viewport" content="width=device-width" />
        <title>Doorbell</title>
      </head>
      <body className={montserrat.className}>
        {process.env.NEXT_PUBLIC_ENVIRONMENT === 'development' && (
          <div className="bg-red-800 fixed bottom-10 left-10 p-4 z-[10000] rounded-lg text-white">
            <h1 className="font-bold text-lg">DEV</h1>
          </div>
        )}
          <UserProvider>
            {/* <ThemeProvider>
              <ThemeClientWrapper>{children}</ThemeClientWrapper>
            </ThemeProvider> */}
            {children}
          </UserProvider>
      </body>
    </html>
  );
}
