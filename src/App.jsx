import React, { useEffect, useMemo, useState } from 'react'

const GIST_RAW = 'https://gist.githubusercontent.com/xdoomx/5cd331c11ca2bbd9d7eed0e7f5b366c3/raw/dashboard_snapshot.json'
const REFRESH_MS = 30000
const SWAG_TOTAL = 257

const fmtMoney = (v) => '$' + Math.round(v ?? 0).toLocaleString('en-AU')
const fmtInt = (v) => (v ?? 0).toLocaleString('en-AU')
const fmtPct = (v) => Math.round((v ?? 0) * 10) / 10 + '%'

function Sparkline({ values, color = '#4C6FFF', height = 44, label }) {
  const v = useMemo(() => (values || []).filter((x) => x !== null && x !== undefined), [values])
  if (v.length < 2) {
    return <div className="spark-empty" style={{ height }}>{label ? 'collecting data…' : '—'}</div>
  }
  const W = 240
  const H = height
  const min = Math.min(...v)
  const max = Math.max(...v)
  const span = max - min || 1
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * W},${H - 4 - ((x - min) / span) * (H - 10)}`)
  const area = `0,${H} ${pts.join(' ')} ${W},${H}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height }} aria-label={label}>
      <polygon points={area} fill={color} opacity="0.14" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={W} cy={H - 4 - ((v[v.length - 1] - min) / span) * (H - 10)} r="3" fill={color} />
    </svg>
  )
}

function SwagBar({ sold, pct, status }) {
  const milestones = [50, 75, 90, 100]
  return (
    <div className="swag">
      <div className="swag-head">
        <span className="swag-title">Swag sell-through</span>
        <span className="swag-count">
          {fmtInt(sold)} <span className="dim">/ {SWAG_TOTAL} units</span>
        </span>
      </div>
      <div className="swag-track">
        <div className="swag-fill" style={{ width: Math.min(100, pct || 0) + '%' }} />
        {milestones.map((m) => (
          <div key={m} className="swag-tick" style={{ left: m + '%' }} title={`${m}%`} />
        ))}
      </div>
      <div className="swag-meta">
        <span className={status === 'soldout' ? 'swag-flag soldout' : 'swag-flag'}>
          {status === 'soldout' ? '● SOLD OUT' : status === 'live' ? '● LIVE' : '○ Awaiting launch — 8am Aug 19'}
        </span>
        <span className="dim">{fmtPct(pct)}</span>
      </div>
    </div>
  )
}

function Card({ label, value, sub, children }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className="card-value">{value}</div>
      {sub && <div className="card-sub">{sub}</div>}
      {children}
    </div>
  )
}

export default function App() {
  const [snap, setSnap] = useState(null)
  const [hist, setHist] = useState([])
  const [err, setErr] = useState(null)
  const [clock, setClock] = useState(new Date())

  useEffect(() => {
    const tick = () => setClock(new Date())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch(GIST_RAW + '?v=' + Date.now(), { cache: 'no-store' })
        if (!r.ok) throw new Error('HTTP ' + r.status)
        const d = await r.json()
        if (!alive) return
        const h = (d.history || []).filter(Boolean)
        // dedupe by minute, keep order
        const seen = new Set()
        const clean = []
        for (const p of h) {
          const k = (p.ts || '').slice(0, 16)
          if (!seen.has(k)) { seen.add(k); clean.push(p) }
        }
        setHist(clean)
        setSnap(clean[clean.length - 1] || null)
        setErr(null)
      } catch (e) {
        if (alive) setErr('Data bus unreachable — retrying')
      }
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const series = useMemo(() => {
    const rev = [], ord = [], active = []
    for (const p of hist) {
      if (typeof p.revenue === 'number') rev.push(p.revenue)
      if (typeof p.orders === 'number') ord.push(p.orders)
      if (typeof p.active_users === 'number') active.push(p.active_users)
    }
    return { rev, ord, active }
  }, [hist])

  const fiveMinAgo = useMemo(() => {
    if (hist.length < 2) return null
    const last = hist[hist.length - 1]
    const target = new Date(last.ts).getTime() - 5 * 60000
    let prev = hist[0]
    for (const p of hist) {
      if (new Date(p.ts).getTime() <= target) prev = p
      else break
    }
    return { last, prev }
  }, [hist])

  const revDelta = fiveMinAgo && fiveMinAgo.last.revenue != null && fiveMinAgo.prev.revenue != null
    ? fiveMinAgo.last.revenue - fiveMinAgo.prev.revenue : null
  const ordDelta = fiveMinAgo && fiveMinAgo.last.orders != null && fiveMinAgo.prev.orders != null
    ? fiveMinAgo.last.orders - fiveMinAgo.prev.orders : null

  const fresh = snap ? Math.max(0, Math.round((Date.now() - new Date(snap.ts).getTime()) / 1000)) : null
  const stale = fresh !== null && fresh > 240

  const goKiosk = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.()
  }

  return (
    <div className="app">
      <header className="hdr">
        <div className="brand">
          <div className="logo">G</div>
          <div>
            <div className="brand-name">GAP <span>AUSTRALIA</span></div>
            <div className="brand-sub">Live Command Center</div>
          </div>
        </div>
        <div className="hdr-right">
          <div className="clock">{clock.toLocaleTimeString('en-AU', { hour12: false })} <span className="dim">AEST</span></div>
          <button className="kiosk" onClick={goKiosk}>⛶ Kiosk</button>
        </div>
      </header>

      <main>
        <section className="hero">
          <Card label="Revenue today" value={fmtMoney(snap?.revenue)}
            sub={revDelta !== null ? <span className={revDelta >= 0 ? 'up' : 'down'}>{revDelta >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(revDelta))} / 5 min</span> : '—'}>
            <Sparkline values={series.rev.slice(-90)} color="#4C6FFF" label="revenue" />
          </Card>
          <Card label="Orders today" value={fmtInt(snap?.orders)}
            sub={ordDelta !== null ? <span className={ordDelta >= 0 ? 'up' : 'down'}>{ordDelta >= 0 ? '▲' : '▼'} {fmtInt(Math.abs(ordDelta))} / 5 min</span> : '—'}>
            <Sparkline values={series.ord.slice(-90)} color="#8FA3E8" label="orders" />
          </Card>
          <Card label="Average order value" value={fmtMoney(snap?.aov)} sub="paid orders · AEST" />
          <Card label="People on site now" value={snap?.ga4_ready ? fmtInt(snap.active_users) : '—'}
            sub={snap?.ga4_ready ? 'last 30 min window' : 'GA4 setup pending — 2-min re-auth'}>
            <Sparkline values={series.active.slice(-90)} color="#7CE0A3" label="active users" />
          </Card>
        </section>

        <section className="row">
          <div className="card wide">
            <SwagBar sold={snap?.swag_sold ?? 0} pct={snap?.swag_pct ?? 0} status={snap?.swag_status || 'pending'} />
          </div>
          <Card label="Email & SMS list" value={fmtInt(snap?.list_count)} sub="subscribers · 15,500 target" />
          <div className="card">
            <div className="card-label">Funnel · 30 min</div>
            <div className="funnel">
              <div><span>Add to cart</span><b>{snap?.ga4_ready ? fmtInt(snap.atc_30m) : '—'}</b></div>
              <div><span>Checkout started</span><b>{snap?.ga4_ready ? fmtInt(snap.begin_checkout_30m) : '—'}</b></div>
              <div><span>Purchases</span><b>{snap?.ga4_ready ? fmtInt(snap.purchases_30m) : '—'}</b></div>
            </div>
          </div>
        </section>

        <footer className="ftr">
          <span className={stale ? 'dot bad' : 'dot' + (fresh !== null && fresh < 90 ? ' good' : '')} />
          <span>{err ? err : snap ? `Updated ${new Date(snap.ts).toLocaleTimeString('en-AU', { hour12: false })} · ${fmtInt(hist.length)} snapshots · refreshing every 30s` : 'Connecting to data bus…'}</span>
          <span className="srcs">Shopify · Google Analytics 4 · Klaviyo</span>
        </footer>
      </main>
    </div>
  )
}
