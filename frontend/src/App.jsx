import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarDays, RefreshCw, Wind, Zap } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'

const fmt = (n, d = 0) => n == null ? '—' : new Intl.NumberFormat('en-GB', { maximumFractionDigits: d }).format(n)
const ukDate = v => new Date(v).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short' })
const ukTime = v => new Date(v).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })

function Metric({ label, value, unit = '', hint, Icon }) {
  return <article className="metric card"><div className="metric-head">{label}<span className="metric-icon"><Icon size={17}/></span></div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-hint">{hint}</div></article>
}

export default function App() {
  const [start, setStart] = useState('2026-01-01')
  const [end, setEnd] = useState('2026-01-31')
  const [cutoff, setCutoff] = useState('11')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [day, setDay] = useState('all')

  async function load() {
    setLoading(true); setError('')
    try {
      const qs = new URLSearchParams({ start, end, cutoff_hour: cutoff })
      const base = import.meta.env.VITE_API_BASE_URL || ''
      const response = await fetch(`${base}/api/analysis?${qs}`)
      const json = await response.json()
      if (!response.ok) throw new Error(json.detail || 'Request failed')
      setData(json)
    } catch (e) {
      setError(`${e.message}. Ensure the Python backend is running and verify Elexon historical data access.`)
      setData(null)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const intervals = data?.intervals || []
  const days = useMemo(() => [...new Set(intervals.map(r => r.startTime.slice(0, 10)))], [intervals])
  const rows = useMemo(() => day === 'all' ? intervals : intervals.filter(r => r.startTime.slice(0, 10) === day), [intervals, day])
  const summary = data?.summary || {}
  const chartRows = rows.map(r => ({ ...r, label: `${ukDate(r.startTime)} ${ukTime(r.startTime)}` }))

  return <div className="layout">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Wind size={23}/></div><div><b>Northstar</b><small>ENERGY ANALYTICS</small></div></div>
      <div className="side-label">WORKSPACE</div><div className="nav active"><Activity size={17}/> Forecast intelligence</div>
      <div className="sidebar-foot"><span className="status-dot"/><div><b>Data workspace</b><small>UK · National wind</small></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div>Analytics <span>/</span> Wind generation</div><div className="source-tag"><i/> ELEXON DATA SOURCE</div></header>
      <section className="heading"><div><div className="eyebrow">DAY-AHEAD PROCUREMENT · PILOT</div><h1>Wind forecast intelligence</h1><p>Understand forecast performance before the delivery window.</p></div><button className="primary" onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/>{loading ? 'Refreshing…' : 'Refresh analysis'}</button></section>
      <section className="filters card">
        <div className="filter-title"><CalendarDays size={17}/> Analysis period</div>
        <label>FROM<input type="date" value={start} onChange={e => setStart(e.target.value)}/></label>
        <label>TO<input type="date" value={end} onChange={e => setEnd(e.target.value)}/></label>
        <label>FORECAST CUTOFF<select value={cutoff} onChange={e => setCutoff(e.target.value)}><option value="9">09:00 UK</option><option value="10">10:00 UK</option><option value="11">11:00 UK</option><option value="12">12:00 UK</option><option value="16">16:00 UK</option></select></label>
        <button className="secondary" onClick={load} disabled={loading}>Apply filters</button>
      </section>
      {error && <div className="error-banner"><AlertTriangle size={20}/><div><b>Analysis unavailable</b><p>{error}</p></div></div>}
      {data && <div className="notice"><AlertTriangle size={16}/><span>Historical coverage and the forecast cutoff policy must be verified before operational use. Only matched records contribute to metrics.</span></div>}
      <section className="metrics">
        <Metric label="Matched intervals" value={fmt(summary.matchedIntervals)} hint={`${fmt(summary.actualIntervals)} actual intervals found`} Icon={Zap}/>
        <Metric label="Mean absolute error" value={fmt(summary.mae, 1)} unit={summary.mae == null ? '' : ' MW'} hint="Average error magnitude · lower is better" Icon={Activity}/>
        <Metric label="Root mean squared error" value={fmt(summary.rmse, 1)} unit={summary.rmse == null ? '' : ' MW'} hint="More sensitive to large errors" Icon={ArrowUpRight}/>
        <Metric label="Forecast bias" value={fmt(summary.bias, 1)} unit={summary.bias == null ? '' : ' MW'} hint={summary.bias > 0 ? 'Positive means overforecasting' : summary.bias < 0 ? 'Negative means underforecasting' : 'Mean signed forecast error'} Icon={ArrowDownRight}/>
      </section>
      <section className="content-grid">
        <article className="card chart-card">
          <div className="section-heading"><div><h2>Forecast vs actual</h2><p>Generation by half-hour delivery interval</p></div></div>
          {chartRows.length ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartRows} margin={{ top: 10, right: 12, left: 0, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf4"/><XAxis dataKey="label" tick={{ fontSize: 10, fill: '#7c8799' }} minTickGap={48}/><YAxis tick={{ fontSize: 11, fill: '#7c8799' }} width={62} tickFormatter={v => `${(v/1000).toFixed(1)}k`}/><Tooltip formatter={v => [`${fmt(v, 1)} MW`]}/><Legend/><Line type="monotone" dataKey="forecast" name="Forecast" stroke="#4778f5" strokeWidth={2} dot={false}/><Line type="monotone" dataKey="actual" name="Actual" stroke="#15a681" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div> : <div className="empty"><Wind size={27}/><b>No matched intervals</b><span>Load data or choose a different period.</span></div>}
        </article>
        <article className="card distribution-card">
          <div className="section-heading"><div><h2>Error distribution</h2><p>Direction of forecast error</p></div></div>
          {[
            ['Overforecast', summary.overforecastIntervals, 'over'],
            ['Underforecast', summary.underforecastIntervals, 'under'],
            ['Exact match', summary.exactIntervals, 'exact']
          ].map(([label, value, kind]) => <div className="distribution-row" key={kind}><div><span className={`bullet ${kind}`}/><span>{label}</span><b>{fmt(value)}</b></div><div className="track"><div className={`fill ${kind}`} style={{width: `${summary.matchedIntervals ? value / summary.matchedIntervals * 100 : 0}%`}}/></div></div>)}
          <div className="insight"><Zap size={16}/><div><b>How to read this</b><p>Positive bias means forecasts were higher than actual generation on average. Assess this alongside other supply and demand information.</p></div></div>
          <div className="coverage"><div><span>Missing eligible forecast</span><b>{fmt(summary.missingForecastIntervals)}</b></div><div><span>Forecast without actual</span><b>{fmt(summary.forecastIntervalsWithoutActual)}</b></div></div>
        </article>
      </section>
      <section className="card table-card">
        <div className="section-heading table-heading"><div><h2>Delivery interval detail</h2><p>Selected forecast vintage matched to actual generation</p></div><label className="day-filter">DELIVERY DAY<select value={day} onChange={e => setDay(e.target.value)}><option value="all">All available days</option>{days.map(d => <option value={d} key={d}>{d}</option>)}</select></label></div>
        <div className="table-wrap"><table><thead><tr><th>DELIVERY INTERVAL</th><th>FORECAST PUBLISHED</th><th>FORECAST (MW)</th><th>ACTUAL (MW)</th><th>ERROR (MW)</th><th>STATUS</th></tr></thead><tbody>
          {rows.slice(0, 300).map((r, i) => <tr key={`${r.startTime}-${i}`}><td><b>{ukDate(r.startTime)}</b><small>{ukTime(r.startTime)} UK</small></td><td>{new Date(r.publishTime).toLocaleString('en-GB', {timeZone:'Europe/London', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}</td><td>{fmt(r.forecast, 1)}</td><td>{fmt(r.actual, 1)}</td><td className={r.error > 0 ? 'positive' : r.error < 0 ? 'negative' : ''}>{r.error > 0 ? '+' : ''}{fmt(r.error, 1)}</td><td><span className={`pill ${r.error > 0 ? 'pill-over' : r.error < 0 ? 'pill-under' : 'pill-exact'}`}>{r.error > 0 ? 'Overforecast' : r.error < 0 ? 'Underforecast' : 'Exact'}</span></td></tr>)}
          {!rows.length && <tr><td colSpan="6" className="no-rows">No records to display. Check API availability and selected date range.</td></tr>}
        </tbody></table></div>
        <div className="table-footer">Showing {fmt(Math.min(rows.length, 300))} of {fmt(rows.length)} matched intervals · values shown in MW</div>
      </section>
      <footer>Wind Forecast Intelligence <span>Prototype · Elexon national wind data</span></footer>
    </main>
  </div>
}
