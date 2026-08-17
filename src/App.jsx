import React, { useEffect, useMemo, useRef, useState } from 'react'

const GIST_RAW = 'https://gist.githubusercontent.com/xdoomx/5cd331c11ca2bbd9d7eed0e7f5b366c3/raw/dashboard_snapshot.json'
const REFRESH_MS = 30000
const ORDER_KEY = 'gapau_tile_order'
const AUTH_KEY = 'gapau_authed'
const DASH_PASSWORD = 'OX12VJ49X6'
const SECTIONS = ['hero', 'sales', 'support', 'ig', 'top']

const fmtMoney = (v) => '$' + Math.round(v ?? 0).toLocaleString('en-AU')
const fmtInt = (v) => (v ?? 0).toLocaleString('en-AU')
const fmtPct = (v) => Math.round((v ?? 0) * 10) / 10 + '%'

const cookieGet = (name) => {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}
const cookieSet = (name, value, days = 365) => {
  const d = new Date()
  d.setTime(d.getTime() + days * 864e5)
  document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + d.toUTCString() + '; path=/'
}

function Sparkline({ values, labels = [], color = '#4C6FFF', height = 44, label, fmt = fmtInt }) {
  const [hIdx, setHIdx] = useState(null)
  const wrapRef = useRef(null)
  const pairs = useMemo(() => {
    const out = []
    const vs = values || []
    const ls = labels || []
    for (let i = 0; i < vs.length; i++) {
      if (vs[i] !== null && vs[i] !== undefined) out.push([vs[i], ls[i] || ''])
    }
    return out
  }, [values, labels])
  const v = pairs.map((p) => p[0])
  const l = pairs.map((p) => p[1])
  if (v.length < 2) {
    return <div className="spark-empty" style={{ height }}>{label ? 'collecting data…' : '—'}</div>
  }
  const W = 240
  const H = height
  const min = Math.min(...v)
  const max = Math.max(...v)
  const span = max - min || 1
  const yAt = (i) => H - 4 - ((v[i] - min) / span) * (H - 10)
  const xAt = (i) => (i / (v.length - 1)) * W
  const pts = v.map((x, i) => `${xAt(i)},${yAt(i)}`)
  const area = `0,${H} ${pts.join(' ')} ${W},${H}`
  const onMove = (e) => {
    const rect = wrapRef.current.getBoundingClientRect()
    const xFrac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    setHIdx(Math.round(xFrac * (v.length - 1)))
  }
  const tipLeft = hIdx != null ? Math.max(10, Math.min(90, (hIdx / (v.length - 1)) * 100)) : 0
  const tipTop = hIdx != null ? yAt(hIdx) : 0
  return (
    <div className="spark-wrap" style={{ height }} ref={wrapRef} onMouseMove={onMove} onMouseLeave={() => setHIdx(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height }} aria-label={label}>
        <polygon points={area} fill={color} opacity="0.14" />
        <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hIdx != null && <line x1={xAt(hIdx)} y1={0} x2={xAt(hIdx)} y2={H} stroke="var(--dim)" strokeWidth="1" strokeDasharray="3 3" />}
        {hIdx != null && <circle cx={xAt(hIdx)} cy={yAt(hIdx)} r="4" fill={color} stroke="var(--navy)" strokeWidth="1.5" />}
        <circle cx={W} cy={yAt(v.length - 1)} r="3" fill={color} />
      </svg>
      {hIdx != null && (
        <div
          className="spark-tip"
          style={{ left: tipLeft + '%', top: tipTop + 8, transform: tipTop < 26 ? 'translate(-50%, 0)' : 'translate(-50%, -100%)' }}
        >
          <div className="spark-tip-v">{fmt(v[hIdx])}</div>
          <div className="spark-tip-t">{l[hIdx]}</div>
        </div>
      )}
    </div>
  )
}

function SwagBar({ sold, pct, status, total, tracked }) {
  const milestones = [50, 75, 90, 100]
  return (
    <div className="swag">
      <div className="swag-head">
        <span className="swag-title">Swag sell-through</span>
        <span className="swag-count">
          {fmtInt(sold)} <span className="dim">/ {fmtInt(total)} units</span>
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
          {status === 'soldout' ? '● SOLD OUT' : status === 'live' ? '● LIVE' : tracked ? '○ Awaiting launch — 8am Aug 20' : '○ Drop product not set up — add "swag" tag in Shopify'}
        </span>
        <span className="dim">{fmtPct(pct)}</span>
      </div>
    </div>
  )
}

function Card({ label, value, sub, delta, wide, children }) {
  let deltaEl = null
  if (delta != null) {
    const up = delta >= 0
    deltaEl = <span className={'delta ' + (up ? 'up' : 'down')}>{up ? '▲' : '▼'} {fmtPct(Math.abs(delta))}</span>
  }
  return (
    <div className={'card' + (wide ? ' span' : '')}>
      <div className="card-label">{label}</div>
      <div className="card-value">{value}</div>
      {sub && <div className="card-sub">{sub} {deltaEl}</div>}
      {children}
    </div>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === '1')
  const [pass, setPass] = useState('')
  const [passErr, setPassErr] = useState(false)
  const [snap, setSnap] = useState(null)
  const [hist, setHist] = useState([])
  const [err, setErr] = useState(null)
  const [clock, setClock] = useState(new Date())
  const [dragOver, setDragOver] = useState(null)
  const [order, setOrder] = useState(() => {
    const saved = cookieGet(ORDER_KEY)
    if (saved) {
      const arr = saved.split(',')
      return [...arr.filter((id) => SECTIONS.includes(id)), ...SECTIONS.filter((id) => !arr.includes(id))]
    }
    return SECTIONS
  })
  const dragIdx = useRef(null)

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
    const mk = () => ({ v: [], l: [] })
    const rev = mk(), ord = mk(), active = mk(), pv24 = mk(), nf24 = mk(), reach24 = mk(), foll = mk(), dms = mk()
    for (const p of hist) {
      const lab = p.ts_local || (p.ts ? new Date(p.ts).toLocaleTimeString('en-AU', { hour12: false }) : '')
      if (typeof p.revenue === 'number') { rev.v.push(p.revenue); rev.l.push(lab) }
      if (typeof p.orders === 'number') { ord.v.push(p.orders); ord.l.push(lab) }
      if (typeof p.active_users === 'number') { active.v.push(p.active_users); active.l.push(lab) }
      const pv = p.ig?.profile_views_24h
      if (typeof pv === 'number') { pv24.v.push(pv); pv24.l.push(lab) }
      const nf = p.ig?.new_followers_24h
      if (typeof nf === 'number') { nf24.v.push(nf); nf24.l.push(lab) }
      const rc = p.ig?.reach_24h
      if (typeof rc === 'number') { reach24.v.push(rc); reach24.l.push(lab) }
      const fl = p.ig?.followers
      if (typeof fl === 'number') { foll.v.push(fl); foll.l.push(lab) }
      const dm = p.ig?.dms_60m
      if (typeof dm === 'number') { dms.v.push(dm); dms.l.push(lab) }
    }
    return { rev, ord, active, pv24, nf24, reach24, foll, dms }
  }, [hist])

  const support = snap?.support
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
  const tryUnlock = (e) => {
    e.preventDefault()
    if (pass === DASH_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, '1')
      setAuthed(true)
      setPassErr(false)
    } else {
      setPassErr(true)
    }
  }
  const lock = () => {
    sessionStorage.removeItem(AUTH_KEY)
    setAuthed(false)
    setPass('')
  }

  const handleDragStart = (e, i) => {
    dragIdx.current = i
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(i))
  }
  const handleDragEnter = (e, to) => {
    e.preventDefault()
    const from = dragIdx.current
    if (from == null || from === to) return
    setOrder((prev) => {
      const next = [...prev]
      const [m] = next.splice(from, 1)
      next.splice(to, 0, m)
      cookieSet(ORDER_KEY, next.join(','))
      return next
    })
    dragIdx.current = to
  }
  const endDrag = () => {
    dragIdx.current = null
    setDragOver(null)
  }
  const sec = (id, cls, children) => {
    const i = order.indexOf(id)
    return (
      <section
        key={id}
        className={cls + (dragOver === id ? ' drag-over' : '')}
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={(e) => handleDragEnter(e, i)}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => e.preventDefault()}
      >
        <div className="drag-handle" draggable onDragStart={(e) => handleDragStart(e, i)} onDragEnd={endDrag} title="Drag to reorder">
          <span className="grip">⠿</span>
        </div>
        {children}
      </section>
    )
  }

  if (!authed) {
    return (
      <div className="gate">
        <form className="gate-card" onSubmit={tryUnlock}>
          <div className="gate-logo">G</div>
          <div className="gate-title">GAP <span>AUSTRALIA</span></div>
          <div className="gate-sub">Live Command Center</div>
          <input type="password" className="gate-input" placeholder="Password" value={pass}
            onChange={(e) => { setPass(e.target.value); setPassErr(false) }} autoFocus />
          {passErr && <div className="gate-err">Incorrect password</div>}
          <button type="submit" className="gate-btn">Unlock</button>
        </form>
      </div>
    )
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
          <button className="kiosk" onClick={lock} title="Lock dashboard">🔒</button>
        </div>
      </header>

      <main>
        {order.map((id) => {
          switch (id) {
            case 'hero':
              return sec('hero', 'hero', (
                <>
                  <Card label="Revenue today" value={fmtMoney(snap?.revenue)}
                    sub={revDelta !== null ? <span className={revDelta >= 0 ? 'up' : 'down'}>{revDelta >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(revDelta))} / 5 min</span> : '—'}>
                    <Sparkline values={series.rev.v.slice(-90)} labels={series.rev.l.slice(-90)} color="#4C6FFF" label="revenue" fmt={fmtMoney} />
                  </Card>
                  <Card label="Orders today" value={fmtInt(snap?.orders)}
                    sub={ordDelta !== null ? <span className={ordDelta >= 0 ? 'up' : 'down'}>{ordDelta >= 0 ? '▲' : '▼'} {fmtInt(Math.abs(ordDelta))} / 5 min</span> : '—'}>
                    <Sparkline values={series.ord.v.slice(-90)} labels={series.ord.l.slice(-90)} color="#8FA3E8" label="orders" />
                  </Card>
                  <Card label="Average order value" value={fmtMoney(snap?.aov)} sub="paid orders · AEST" />
                  <Card label="People on site now" value={snap?.ga4_ready ? fmtInt(snap.active_users) : '—'}
                    sub={snap?.ga4_ready ? 'live · refreshes every 60s' : 'GA4 setup pending — 2-min re-auth'}>
                    <Sparkline values={series.active.v.slice(-90)} labels={series.active.l.slice(-90)} color="#7CE0A3" label="active users" />
                    {(snap?.pages?.length ?? 0) > 0 && (
                      <div className="pages">
                        {snap.pages.slice(0, 5).map((p) => (
                          <div key={p.path} className="page-row">
                            <span className="page-path">{p.path}</span>
                            <span className="page-users">{p.users}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </>
              ))
            case 'sales':
              return sec('sales', 'row', (
                <>
                  <div className="card wide">
                    <SwagBar sold={snap?.swag_sold ?? 0} total={snap?.swag_total ?? 241} tracked={snap?.swag_tracked !== false} pct={snap?.swag_pct ?? 0} status={snap?.swag_status || 'pending'} />
                  </div>
                  <Card label="Email & SMS list" value={fmtInt(snap?.list_count)} sub="subscribers · 10,000 target">
                    <Sparkline
                      values={(snap?.list_7d || []).map((d) => d.count)}
                      labels={(snap?.list_7d || []).map((d) => d.date.slice(5).replace('-', '/'))}
                      color="#8FA3E8" label="list growth 7d" height={28} />
                  </Card>
                  <div className="card">
                    <div className="card-label">Funnel · 30 min</div>
                    <div className="funnel">
                      <div><span>Add to cart</span><b>{snap?.ga4_ready ? fmtInt(snap.atc_30m) : '—'}</b></div>
                      <div><span>Checkout started</span><b>{snap?.ga4_ready ? fmtInt(snap.begin_checkout_30m) : '—'}</b></div>
                      <div><span>Purchases</span><b>{snap?.ga4_ready ? fmtInt(snap.purchases_30m) : '—'}</b></div>
                    </div>
                  </div>
                </>
              ))
            case 'support':
              return sec('support', 'row support', (
                <>
                  <Card label="Help Desk queue" value={support?.klaviyo?.counts?.['All tickets'] != null ? fmtInt(support.klaviyo.counts['All tickets']) : '—'}
                    sub={support?.klaviyo?.counts ? `Unassigned ${fmtInt(support.klaviyo.counts.Unassigned ?? 0)} · Spam ${fmtInt(support.klaviyo.counts.Spam ?? 0)}` : '5-min CDP feed · needs browser open'} />
                  <Card label="Instagram DMs" value={snap?.ig?.unread_threads != null ? fmtInt(snap.ig.unread_threads) : '—'}
                    sub={snap?.ig ? `${fmtInt(snap.ig.new_messages ?? 0)} new msgs · IG API` : 'IG API — token pending'} />
                  <Card label="Last checked" value={support?.ts ? new Date(support.ts).toLocaleTimeString('en-AU', { hour12: false }) : '—'} sub={support?.cached ? 'Klaviyo Helpdesk · cached (scraper offline)' : 'Klaviyo · every 5 min'} />
                </>
              ))
            case 'ig':
              return sec('ig', 'hero', (
                <>
                  <Card label="IG followers" value={snap?.ig?.followers != null ? fmtInt(snap.ig.followers) : '—'} sub={snap?.ig ? `@gapaustralia · ${fmtInt(snap.ig.media_count ?? 0)} posts` : 'IG API — token pending'} wide>
                    <Sparkline values={series.foll.v.slice(-90)} labels={series.foll.l.slice(-90)} color="#C2A675" label="followers" height={64} />
                  </Card>
                  <Card label="New followers" value={snap?.ig?.new_followers_24h != null ? fmtInt(snap.ig.new_followers_24h) : '—'} sub="IG API · 5 min">
                    <div className="nf-grid">
                      <div className="nf-row"><span>28d</span><b>{snap?.ig?.new_followers_28d != null ? fmtInt(snap.ig.new_followers_28d) : '—'}</b></div>
                      <div className="nf-row"><span>7d</span><b>{snap?.ig?.new_followers_7d != null ? fmtInt(snap.ig.new_followers_7d) : '—'}</b></div>
                      <div className="nf-row"><span>24h</span><b>{snap?.ig?.new_followers_24h != null ? fmtInt(snap.ig.new_followers_24h) : '—'}</b></div>
                    </div>
                    <Sparkline values={series.nf24.v.slice(-90)} labels={series.nf24.l.slice(-90)} color="#8FA3E8" label="new followers 24h" height={28} />
                  </Card>
                  <Card label="Profile views" value={snap?.ig?.profile_views_24h != null ? fmtInt(snap.ig.profile_views_24h) : '—'} sub="IG API · 5 min">
                    <div className="nf-grid">
                      <div className="nf-row"><span>28d</span><b>{snap?.ig?.profile_views_28d != null ? fmtInt(snap.ig.profile_views_28d) : '—'}</b></div>
                      <div className="nf-row"><span>7d</span><b>{snap?.ig?.profile_views_7d != null ? fmtInt(snap.ig.profile_views_7d) : '—'}</b></div>
                      <div className="nf-row"><span>24h</span><b>{snap?.ig?.profile_views_24h != null ? fmtInt(snap.ig.profile_views_24h) : '—'}</b></div>
                    </div>
                    <Sparkline values={series.pv24.v.slice(-90)} labels={series.pv24.l.slice(-90)} color="#4C6FFF" label="profile views 24h" height={28} />
                  </Card>
                  <Card label="Reach" value={snap?.ig?.reach_24h != null ? fmtInt(snap.ig.reach_24h) : '—'} sub="IG API · 5 min" wide>
                    <div className="nf-grid">
                      <div className="nf-row"><span>28d</span><b>{snap?.ig?.reach_28d != null ? fmtInt(snap.ig.reach_28d) : '—'}</b></div>
                      <div className="nf-row"><span>7d</span><b>{snap?.ig?.reach_7d != null ? fmtInt(snap.ig.reach_7d) : '—'}</b></div>
                      <div className="nf-row"><span>24h</span><b>{snap?.ig?.reach_24h != null ? fmtInt(snap.ig.reach_24h) : '—'}</b></div>
                    </div>
                    <Sparkline values={series.reach24.v.slice(-90)} labels={series.reach24.l.slice(-90)} color="#7CE0A3" label="reach 24h" height={64} />
                  </Card>
                  <Card label="DMs" value={snap?.ig?.dms_60m != null ? fmtInt(snap.ig.dms_60m) : '—'} sub="inbound · last 60 min" delta={snap?.ig?.dms_60m_pct} wide>
                    <div className="nf-grid">
                      <div className="nf-row"><span>4 hrs</span><b>{snap?.ig?.dms_4h != null ? fmtInt(snap.ig.dms_4h) : '—'} <small className="dim">{snap?.ig?.dms_4h_pct != null ? (snap.ig.dms_4h_pct >= 0 ? '▲' : '▼') + ' ' + fmtPct(Math.abs(snap.ig.dms_4h_pct)) : ''}</small></b></div>
                      <div className="nf-row"><span>unread</span><b>{snap?.ig?.unread_threads != null ? fmtInt(snap.ig.unread_threads) : '—'}</b></div>
                      <div className="nf-row"><span>new msgs</span><b>{snap?.ig?.new_messages != null ? fmtInt(snap.ig.new_messages) : '—'}</b></div>
                    </div>
                    <Sparkline values={series.dms.v.slice(-90)} labels={series.dms.l.slice(-90)} color="#C2A675" label="dms 60m" height={64} />
                  </Card>
                </>
              ))
            default:
              return sec('top', 'row two', (
                <>
                  <div className="card">
                    <div className="card-label">Top products · today</div>
                    <div className="rank-list">
                      {(snap?.top_products || []).map((p, i) => (
                        <div key={p.title} className="rank-row">
                          <span className="rank-idx">{i + 1}</span>
                          <span className="rank-name" title={p.title}>{p.title}</span>
                          <span className="rank-val">{fmtInt(p.units)}</span>
                        </div>
                      ))}
                      {!(snap?.top_products || []).length && <div className="rank-empty">No sales yet — site opens Aug 19</div>}
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-label">Top sizes · today</div>
                    <div className="rank-list">
                      {(snap?.top_sizes || []).map((s, i) => (
                        <div key={s.size} className="rank-row">
                          <span className="rank-idx">{i + 1}</span>
                          <span className="rank-name">{s.size}</span>
                          <span className="rank-val">{fmtInt(s.units)}</span>
                        </div>
                      ))}
                      {!(snap?.top_sizes || []).length && <div className="rank-empty">No sales yet — site opens Aug 19</div>}
                    </div>
                  </div>
                </>
              ))
          }
        })}

        <footer className="ftr">
          <span className={stale ? 'dot bad' : 'dot' + (fresh !== null && fresh < 90 ? ' good' : '')} />
          <span>{err ? err : snap ? `Updated ${new Date(snap.ts).toLocaleTimeString('en-AU', { hour12: false })} · ${fmtInt(hist.length)} snapshots · refreshing every 30s` : 'Connecting to data bus…'}</span>
          <span className="srcs">Shopify · Google Analytics 4 · Klaviyo</span>
        </footer>
      </main>
    </div>
  )
}
