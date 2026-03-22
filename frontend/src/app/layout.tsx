'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '◈' },
  { href: '/agents', label: 'Agents', icon: '⬡' },
  { href: '/tasks', label: 'Tasks', icon: '◎' },
  { href: '/demo', label: 'Live Demo', icon: '▶' },
  { href: '/about', label: 'About', icon: 'ℹ' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="w-64 bg-gray-900/80 border-r border-gray-800 flex flex-col fixed h-full z-10">
            {/* Logo */}
            <div className="p-6 border-b border-gray-800">
              <Link href="/" className="flex items-center gap-3">
                <span className="text-3xl mandala-glow text-cyan-400">✦</span>
                <div>
                  <h1 className="text-xl font-bold text-white tracking-wide">Mandala</h1>
                  <p className="text-xs text-gray-500 tracking-widest uppercase">Protocol</p>
                </div>
              </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1">
              {navItems.map((item) => {
                const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                    }`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-gray-800">
              <div className="text-xs text-gray-600 space-y-1">
                <p>Anvil Local Chain</p>
                <p className="font-mono text-gray-500">127.0.0.1:8545</p>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 ml-64 p-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
