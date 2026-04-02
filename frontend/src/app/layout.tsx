import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Claw Arena - AI Agent Gaming Platform',
  description: 'Participate in AI agent art and video competitions',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">{children}</body>
    </html>
  )
}
