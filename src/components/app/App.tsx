// SunPower Ops — single-page application shell. Hash routes keep every screen
// inside the one user-visible route: staff app, field app, and public pages
// (enquiry, quote link, customer portal, certificate, public warranty page).

'use client'

import { useEffect, useState } from 'react'
import { api, useHashRoute, nav, fmtPhone } from './lib'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  LayoutDashboard, Users, FileText, ShoppingCart, CalendarDays, Boxes, Truck, Wrench,
  Calculator, Settings, Bell, Sun, Search, LogOut, Menu, X, ClipboardList, ScanLine,
  Wallet, QrCode, Package,
} from 'lucide-react'
import { EnquiryView, HomeView, QuoteView, PortalView, CertificateView, WarrantyPageView } from './views-public'
import { DashboardView, AnalyticsView, SharedDashboardView } from './views-dashboard'
import { LeadBoardView, LeadDetailView } from './views-leads'
import { QuotesView, QuoteDetailView, QuoteBuilderView } from './views-quotes'
import { OrdersView, OrderDetailView, ScheduleView } from './views-orders'
import { StockView, ReceiveView, PurchasingView, UnitsView } from './views-inventory'
import { DispatchQueueView, PickScanView } from './views-dispatch'
import { TodayView, SurveyFormView, JobStepperView, ScanView } from './views-field'
import { ServiceDeskView, CustomersView, CustomerDetailView, TicketDetailView } from './views-service'
import { AccountsView } from './views-finance'
import { SettingsView, NotificationsView } from './views-settings'

export interface SessionUser { id: string; name: string; email: string; role: string; technicianId?: string | null }

const ROLE_LANDING: Record<string, string> = {
  DIRECTOR: 'dash', SALES: 'leads', TECHNICIAN: 'today', WAREHOUSE: 'dispatch',
  SUPPORT: 'service', ACCOUNTS: 'accounts',
}

interface NavItem { key: string; label: string; icon: React.ElementType; roles: string[] }

const NAV: NavItem[] = [
  { key: 'dash', label: 'Dashboard', icon: LayoutDashboard, roles: ['DIRECTOR', 'ACCOUNTS'] },
  { key: 'leads', label: 'Leads', icon: Users, roles: ['DIRECTOR', 'SALES', 'SUPPORT', 'ACCOUNTS'] },
  { key: 'quotes', label: 'Quotes', icon: FileText, roles: ['DIRECTOR', 'SALES'] },
  { key: 'orders', label: 'Orders', icon: ShoppingCart, roles: ['DIRECTOR', 'SALES', 'ACCOUNTS'] },
  { key: 'schedule', label: 'Schedule', icon: CalendarDays, roles: ['DIRECTOR', 'SALES'] },
  { key: 'stock', label: 'Stock', icon: Boxes, roles: ['DIRECTOR', 'WAREHOUSE'] },
  { key: 'receive', label: 'Receive stock', icon: Package, roles: ['DIRECTOR', 'WAREHOUSE'] },
  { key: 'purchasing', label: 'Purchasing', icon: ClipboardList, roles: ['DIRECTOR', 'WAREHOUSE'] },
  { key: 'units', label: 'Units & QR', icon: QrCode, roles: ['DIRECTOR', 'WAREHOUSE'] },
  { key: 'dispatch', label: 'Dispatch', icon: Truck, roles: ['DIRECTOR', 'WAREHOUSE'] },
  { key: 'today', label: 'Today', icon: Sun, roles: ['TECHNICIAN'] },
  { key: 'scan', label: 'Scan', icon: ScanLine, roles: ['TECHNICIAN', 'WAREHOUSE'] },
  { key: 'service', label: 'Service desk', icon: Wrench, roles: ['DIRECTOR', 'SUPPORT', 'ACCOUNTS'] },
  { key: 'customers', label: 'Customers', icon: Users, roles: ['DIRECTOR', 'SALES', 'SUPPORT', 'ACCOUNTS'] },
  { key: 'accounts', label: 'Accounts', icon: Wallet, roles: ['DIRECTOR', 'ACCOUNTS'] },
  { key: 'analytics', label: 'Analytics', icon: Calculator, roles: ['DIRECTOR', 'ACCOUNTS'] },
  { key: 'notifications', label: 'Notifications', icon: Bell, roles: ['DIRECTOR', 'SALES', 'TECHNICIAN', 'WAREHOUSE', 'SUPPORT', 'ACCOUNTS'] },
  { key: 'settings', label: 'Settings', icon: Settings, roles: ['DIRECTOR'] },
]

export default function App() {
  const [parts, refreshRoute] = useHashRoute()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    api('/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null))
  }, [])

  useEffect(() => {
    const onHash = () => setMenuOpen(false)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const root = parts[0] ?? ''

  // public routes first (no session needed)
  if (root === 'home') return <PublicFrame><HomeView /></PublicFrame>
  if (root === 'e') return <PublicFrame><EnquiryView /></PublicFrame>
  if (root === 'q' && parts[1]) return <PublicFrame><QuoteView token={parts[1]} /></PublicFrame>
  if (root === 'p' && parts[1]) return <PublicFrame><PortalView token={parts[1]} /></PublicFrame>
  if (root === 'c' && parts[1]) return <PublicFrame><CertificateView token={parts[1]} /></PublicFrame>
  if (root === 'w' && parts[1]) return <PublicFrame><WarrantyPageView code={decodeURIComponent(parts[1])} /></PublicFrame>
  if (root === 's' && parts[1]) return <PublicFrame><SharedDashboardView token={parts[1]} /></PublicFrame>

  if (user === undefined) {
    return <div className="min-h-screen grid place-items-center bg-slate-50"><div className="animate-pulse flex items-center gap-2 text-slate-400"><Sun className="h-5 w-5 text-amber-500" /> Loading SunPower Ops…</div></div>
  }

  if (!user) return <LoginView onLogin={setUser} />

  const navItems = NAV.filter((n) => n.roles.includes(user.role))
  const landing = ROLE_LANDING[user.role] ?? 'dash'
  const active = root || landing

  const content = renderView(active, parts)
  if (content === null) {
    nav(landing)
    return null
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* top bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 no-print">
        <div className="flex items-center gap-3 h-14 px-4">
          <button className="lg:hidden p-2 -ml-2 text-slate-600" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <a href={`#/${landing}`} className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-700 text-white"><Sun className="h-5 w-5" /></span>
            <span className="hidden sm:inline">SunPower <span className="text-blue-700">Ops</span></span>
          </a>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            <a href="#/notifications" className="relative p-2 text-slate-500 hover:text-slate-800" aria-label="Notifications">
              <Bell className="h-5 w-5" />
            </a>
            <div className="hidden sm:block text-right leading-tight">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-[11px] text-slate-500">{user.role.replace('_', ' ')}</div>
            </div>
            <Button variant="ghost" size="icon" title="Sign out" onClick={async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); nav('') }}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* sidebar */}
        <nav className={cn('w-60 shrink-0 border-r border-slate-200 bg-white overflow-y-auto scroll-thin no-print',
          'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:pt-14 max-lg:shadow-xl',
          menuOpen ? 'max-lg:block' : 'max-lg:hidden', 'lg:block')}>
          <div className="p-3 space-y-1">
            <div className="lg:hidden px-2 pb-2 text-sm font-semibold text-slate-400">Menu</div>
            {navItems.map((n) => {
              const Icon = n.icon
              const isActive = active === n.key
              return (
                <a key={n.key} href={`#/${n.key}`} className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive ? 'bg-blue-50 text-blue-800 border border-blue-100' : 'text-slate-600 hover:bg-slate-100 border border-transparent',
                )}>
                  <Icon className="h-4 w-4" />
                  {n.label}
                </a>
              )
            })}
          </div>
        </nav>

        {/* content */}
        <main className="flex-1 min-w-0 p-4 lg:p-6 max-w-[1440px] w-full mx-auto" onClick={() => menuOpen && setMenuOpen(false)}>
          {content}
        </main>
      </div>
    </div>
  )
}

function renderView(active: string, parts: string[]): React.ReactNode | null {
  switch (active) {
    case 'dash': return <DashboardView />
    case 'analytics': return <AnalyticsView />
    case 'leads': return parts[1] ? <LeadDetailView /> : <LeadBoardView />
    case 'quotes': return parts[1] === 'new' ? <QuoteBuilderView /> : parts[1] ? <QuoteDetailView /> : <QuotesView />
    case 'orders': return parts[1] ? <OrderDetailView /> : <OrdersView />
    case 'schedule': return <ScheduleView />
    case 'stock': return <StockView />
    case 'receive': return <ReceiveView />
    case 'purchasing': return <PurchasingView />
    case 'units': return <UnitsView />
    case 'dispatch': return parts[1] ? <PickScanView /> : <DispatchQueueView />
    case 'today': return <TodayView />
    case 'survey': return parts[1] ? <SurveyFormView /> : null
    case 'job': return parts[1] ? <JobStepperView /> : null
    case 'scan': return <ScanView />
    case 'service': return <ServiceDeskView />
    case 'customers': return <CustomersView />
    case 'customer': return parts[1] ? <CustomerDetailView /> : null
    case 'ticket': return parts[1] ? <TicketDetailView /> : null
    case 'accounts': return <AccountsView />
    case 'settings': return <SettingsView />
    case 'notifications': return <NotificationsView />
    default: return null
  }
}

// ── global search (Ctrl+K, one search box everywhere) ─────────────

function GlobalSearch() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<any>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        document.getElementById('global-search')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) {
        setResults(null)
        return
      }
      try {
        setResults(await api(`/search?q=${encodeURIComponent(q.trim())}`))
        setOpen(true)
      } catch { /* ignore */ }
    }, q.trim().length < 2 ? 0 : 250)
    return () => clearTimeout(t)
  }, [q])

  const go = (path: string) => { setOpen(false); setQ(''); nav(path) }

  return (
    <div className="relative flex-1 max-w-md">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <Input
        id="global-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search phone, name, serial, order, ticket… (Ctrl+K)"
        className="pl-8 h-9 bg-slate-50 border-slate-200"
      />
      {open && results && (
        <div className="absolute top-11 left-0 right-0 rounded-lg border bg-white shadow-lg z-50 max-h-96 overflow-y-auto scroll-thin">
          {results.customers.length === 0 && results.units.length === 0 && results.orders.length === 0 && results.tickets.length === 0 && results.leads.length === 0 && (
            <div className="p-4 text-sm text-slate-500">Nothing found for “{q}”.</div>
          )}
          {results.customers.map((c: any) => (
            <button key={c.id} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left text-sm" onMouseDown={() => go(`customer/${c.id}`)}>
              <Users className="h-4 w-4 text-slate-400" /><span className="font-medium">{c.name}</span><span className="text-slate-400">{fmtPhone(c.phone)}</span>
            </button>
          ))}
          {results.units.map((u: any) => (
            <button key={u.id} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left text-sm" onMouseDown={() => go(`customer/${u.customerId}`)}>
              <QrCode className="h-4 w-4 text-slate-400" /><span className="font-medium">{u.product.name}</span><span className="font-mono text-xs text-slate-500">{u.serialNumber}</span>
            </button>
          ))}
          {results.orders.map((o: any) => (
            <button key={o.id} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left text-sm" onMouseDown={() => go(`orders/${o.id}`)}>
              <ShoppingCart className="h-4 w-4 text-slate-400" /><span className="font-medium">{o.orderNumber}</span><span className="text-slate-400">{o.customer.name}</span>
            </button>
          ))}
          {results.tickets.map((t: any) => (
            <button key={t.id} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left text-sm" onMouseDown={() => go(`ticket/${t.id}`)}>
              <Wrench className="h-4 w-4 text-slate-400" /><span className="font-medium">{t.ticketNumber}</span><span className="text-slate-400">{t.customer.name}</span>
            </button>
          ))}
          {results.leads.map((l: any) => (
            <button key={l.id} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left text-sm" onMouseDown={() => go(`leads/${l.id}`)}>
              <Users className="h-4 w-4 text-slate-400" /><span className="font-medium">{l.leadNumber}</span><span className="text-slate-400">{l.customer.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── login ─────────────────────────────────────────────────────────

const DEMO_ACCOUNTS = [
  { email: 'director@sunpower.example', label: 'Priya Deshmukh', role: 'Director' },
  { email: 'rahul@sunpower.example', label: 'Rahul Mehta', role: 'Sales' },
  { email: 'tech1@sunpower.example', label: 'Vikram Solanki', role: 'Technician · crew lead' },
  { email: 'warehouse@sunpower.example', label: 'Jignesh Patel', role: 'Warehouse' },
  { email: 'support@sunpower.example', label: 'Meera Joshi', role: 'Support' },
  { email: 'accounts@sunpower.example', label: 'Kaushik Bhatt', role: 'Accounts' },
]

function LoginView({ onLogin }: { onLogin: (u: SessionUser) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const doLogin = async (e?: React.FormEvent, preset?: string) => {
    e?.preventDefault()
    setBusy(true)
    try {
      const r = await api('/auth/login', { method: 'POST', json: { email: preset ?? email, password: preset ? 'demo1234' : password } })
      onLogin(r.user)
      toast.success(`Welcome back, ${r.user.name.split(' ')[0]}`)
      nav(ROLE_LANDING[r.user.role] ?? 'dash')
    } catch (err: any) {
      toast.error(err.message ?? 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      <div className="flex-1 bg-gradient-to-br from-blue-800 via-blue-700 to-amber-500 p-8 lg:p-14 text-white flex flex-col min-h-[220px]">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15 backdrop-blur"><Sun className="h-7 w-7" /></span>
          <div>
            <div className="text-lg font-semibold leading-tight">SunPower Ops</div>
            <div className="text-blue-100 text-sm">Solar Installation Management</div>
          </div>
        </div>
        <div className="mt-auto max-w-lg pt-10">
          <h1 className="text-3xl lg:text-4xl font-semibold leading-tight">From first enquiry to the end of a 20-year warranty.</h1>
          <p className="mt-4 text-blue-100 text-base leading-relaxed">
            Every enquiry, part, serial number and rupee tracked in one system: leads and surveys, template quotes with an automatic
            parts list, serial-scanned dispatch, mobile installation sign-off, automatic warranties and a customer portal.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            {['No lost enquiries', 'Correct kits', 'Serial traceability', 'Proof of work', 'Financial visibility'].map((t) => (
              <span key={t} className="rounded-full bg-white/10 border border-white/20 px-3 py-1">{t}</span>
            ))}
          </div>
          <a href="#/home" className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4 hover:text-amber-200">
            Are you a customer? Start here →
          </a>
        </div>
      </div>
      <div className="w-full lg:w-[440px] p-8 lg:p-12 border-l border-slate-100 flex flex-col justify-center bg-slate-50/50">
        <div className="mb-6">
          <h2 className="text-xl font-semibold">Staff sign in</h2>
          <p className="text-sm text-slate-500 mt-1">Demo accounts use the password <code className="bg-slate-100 rounded px-1 py-0.5 text-xs">demo1234</code></p>
        </div>
        <form onSubmit={doLogin} className="space-y-3">
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>
        <div className="mt-8">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">One-click demo</div>
          <div className="grid gap-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.email} onClick={() => doLogin(undefined, a.email)} disabled={busy}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:border-blue-400 hover:bg-blue-50/50 transition text-left">
                <span className="font-medium">{a.label}</span>
                <span className="text-xs text-slate-400">{a.role}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── public frame (customer-facing pages share a light header) ─────

export function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 no-print">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-2">
          <a href="#/home" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-700 text-white"><Sun className="h-5 w-5" /></span>
            SunPower Solar Energy
          </a>
          <span className="ml-auto text-xs text-slate-500 font-medium">Solar EPC &amp; Rooftop Solutions</span>
        </div>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 print:p-0 print:m-0 print:max-w-none">{children}</main>
      <footer className="border-t border-slate-200 bg-white py-4 mt-auto no-print">
        <div className="max-w-3xl mx-auto px-4 text-xs text-slate-400 flex items-center justify-between">
          <span>© 2026 SunPower Solar Energy Pvt Ltd</span>
          <span>Links are private and expire · <a className="underline" href="#/home">Customer home</a></span>
        </div>
      </footer>
    </div>
  )
}
