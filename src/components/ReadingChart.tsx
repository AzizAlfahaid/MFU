import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Range, RangeKey, Reading } from '../lib/types'

function rangeFor(ranges: Range[], key: RangeKey) {
  return ranges.find((r) => r.key === key)
}

function Dot(props: { cx?: number; cy?: number; payload?: { out: boolean } }) {
  const { cx, cy, payload } = props
  if (cx === undefined || cy === undefined) return null
  return <circle cx={cx} cy={cy} r={6} fill={payload?.out ? '#b00020' : '#0b5ea8'} stroke="#fff" strokeWidth={2} />
}

/** Last readings as a line; the normal range is shaded; out-of-range points are red. */
export default function ReadingChart({ type, readings, ranges, context }: {
  type: 'sugar' | 'bp' | 'temp'; readings: Reading[]; ranges: Range[]; context?: string | null
}) {
  const data = [...readings].reverse().map((r) => ({ t: new Date(r.taken_at).getTime(), v1: r.value1, v2: r.value2, out: r.out_of_range }))
  if (data.length === 0) return null
  const sys = type === 'bp' ? rangeFor(ranges, 'bp_systolic') : undefined
  const dia = type === 'bp' ? rangeFor(ranges, 'bp_diastolic') : undefined
  const single = type === 'temp' ? rangeFor(ranges, 'temp') : type === 'sugar' && context ? rangeFor(ranges, `sugar_${context}` as RangeKey) : undefined
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} />
          <YAxis domain={['auto', 'auto']} width={44} />
          <Tooltip labelFormatter={(v) => new Date(Number(v)).toLocaleString()} />
          {single && <ReferenceArea y1={single.low} y2={single.high} fill="#1b6e2d" fillOpacity={0.12} />}
          {sys && <ReferenceArea y1={sys.low} y2={sys.high} fill="#1b6e2d" fillOpacity={0.12} />}
          {dia && <ReferenceArea y1={dia.low} y2={dia.high} fill="#0b5ea8" fillOpacity={0.12} />}
          <Line type="monotone" dataKey="v1" stroke="#0b5ea8" strokeWidth={2} dot={<Dot />} isAnimationActive={false} />
          {type === 'bp' && <Line type="monotone" dataKey="v2" stroke="#6a4c93" strokeWidth={2} dot={<Dot />} isAnimationActive={false} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
