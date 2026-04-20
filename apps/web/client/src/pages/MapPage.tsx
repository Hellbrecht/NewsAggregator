// MapPage — Leaflet map with hydrology station markers and river-path tracing.
// Uses raw Leaflet (not react-leaflet) via useRef to control the map instance directly.

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { TopBar }      from '../design-system/components/TopBar'
import { ThemeToggle } from '../design-system/components/ThemeToggle'
import { api, type HydrologyItem } from '../lib/api'

// Fix Leaflet's default icon paths (Vite moves assets, so we override them)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const RIVER_RUNNER_API = 'https://merit.internetofwater.app/processes/river-runner/execution'

// Station object used in the sidebar
interface Station extends HydrologyItem {
  lat: number
  lng: number
}

// ── Main page ────────────────────────────────────────────────────────
export default function MapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<L.Map | null>(null)
  const stationLayerRef = useRef<L.LayerGroup | null>(null)
  const riverLayerRef   = useRef<L.LayerGroup | null>(null)
  const clickMarkerRef  = useRef<L.Marker | null>(null)

  const [mode,     setModeState] = useState<'browse' | 'trace'>('browse')
  const [selected, setSelected]  = useState<Station | null>(null)
  const [status,   setStatus]    = useState<string>('')
  const [tracing,  setTracing]   = useState(false)
  const modeRef = useRef<'browse' | 'trace'>('browse')

  function setMode(m: 'browse' | 'trace') {
    setModeState(m)
    modeRef.current = m
    if (mapRef.current) {
      mapRef.current.getContainer().style.cursor =
        m === 'trace' ? 'crosshair' : ''
    }
  }

  // ── Map init (runs once on mount) ──────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [38.5, -95],
      zoom:   4,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      maxZoom: 19,
    }).addTo(map)

    stationLayerRef.current = L.layerGroup().addTo(map)
    riverLayerRef.current   = L.layerGroup().addTo(map)
    mapRef.current = map

    // Click to trace a river path
    map.on('click', async (e: L.LeafletMouseEvent) => {
      if (modeRef.current !== 'trace') return
      const { lat, lng } = e.latlng
      await traceRiver(lat, lng)
    })

    // Load hydrology stations
    void loadStations()

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Load hydrology stations ────────────────────────────────────────
  async function loadStations() {
    setStatus('Loading stations…')
    try {
      const data = await api.getHydrology()
      const layer = stationLayerRef.current
      if (!layer) return

      let count = 0
      for (const provider of (data.providers ?? [])) {
        for (const item of (provider.items ?? [])) {
          const lat = (item as HydrologyItem & { latitude?: number }).latitude
          const lng = (item as HydrologyItem & { longitude?: number }).longitude
          if (lat == null || lng == null) continue

          const station: Station = { ...item, lat, lng }

          const marker = L.circleMarker([lat, lng], {
            radius:      6,
            fillColor:   '#3b82f6',
            fillOpacity: 0.8,
            color:       '#1e40af',
            weight:      1,
          })

          marker.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e)
            setSelected(station)
          })

          marker.bindTooltip(
            `<strong>${item.location}</strong><br/>${item.metric}: ${item.value ?? '—'} ${item.unit ?? ''}`,
            { sticky: true }
          )

          layer.addLayer(marker)
          count++
        }
      }
      setStatus(`${count} station${count !== 1 ? 's' : ''} loaded`)
    } catch (e) {
      setStatus('Failed to load stations')
      console.error('[MapPage] loadStations error:', e)
    }
  }

  // ── River runner trace ─────────────────────────────────────────────
  async function traceRiver(lat: number, lng: number) {
    if (tracing) return
    setTracing(true)
    setStatus('Tracing river path…')

    // Drop a marker at the clicked point
    if (clickMarkerRef.current) clickMarkerRef.current.remove()
    clickMarkerRef.current = L.marker([lat, lng])
      .addTo(mapRef.current!)
      .bindPopup(`Tracing from ${lat.toFixed(4)}, ${lng.toFixed(4)}`)
      .openPopup()

    // Clear previous river layer
    riverLayerRef.current?.clearLayers()

    try {
      const res = await fetch(
        `${RIVER_RUNNER_API}?lat=${lat}&lng=${lng}`
      )

      if (!res.ok) throw new Error(`River runner: ${res.status}`)

      const data = await res.json()

      // API wraps the FeatureCollection in { value: {...} }
      const featureCollection = data?.value ?? data
      const features = featureCollection?.features ?? []

      if (features.length === 0 || data?.code === 'InvalidParameterValue') {
        setStatus('No river path found — try clicking on a river or stream')
        setTracing(false)
        return
      }

      L.geoJSON(featureCollection, {
        style: { color: '#3b82f6', weight: 2, opacity: 0.8 },
      }).addTo(riverLayerRef.current!)

      setStatus(`River path: ${features.length} segment${features.length !== 1 ? 's' : ''}`)
    } catch (e) {
      console.error('[MapPage] traceRiver error:', e)
      setStatus('River trace failed — point may be outside MERIT network')
    } finally {
      setTracing(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <TopBar><ThemeToggle /></TopBar>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <aside style={{
          width:       260,
          flexShrink:  0,
          borderRight: '1px solid var(--border)',
          display:     'flex',
          flexDirection: 'column',
          padding:     'var(--space-4)',
          overflowY:   'auto',
          gap:         'var(--space-4)',
          background:  'var(--bg-panel)',
        }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
              Hydrology Map
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6 }}>
              Blue circles = monitoring stations. Click a station to inspect it. Switch to Trace mode to follow a river downstream.
            </p>
          </div>

          {/* Mode buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Mode</p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <ModeBtn active={mode === 'browse'} onClick={() => setMode('browse')}>Browse</ModeBtn>
              <ModeBtn active={mode === 'trace'}  onClick={() => setMode('trace')}>Trace River</ModeBtn>
            </div>
          </div>

          {/* Status */}
          {status && (
            <p style={{ color: tracing ? 'var(--accent)' : 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6 }}>
              {status}
            </p>
          )}

          {/* Selected station detail */}
          {selected && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-4)' }}>
              <p style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-medium)', marginBottom: 'var(--space-2)' }}>
                {selected.location}
              </p>
              <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--space-1) var(--space-3)' }}>
                <Dt>Metric</Dt>  <Dd>{selected.metric}</Dd>
                <Dt>Value</Dt>   <Dd>{selected.value != null ? `${selected.value} ${selected.unit ?? ''}` : '—'}</Dd>
                <Dt>Observed</Dt><Dd>{selected.observedAt ? new Date(selected.observedAt).toLocaleString() : '—'}</Dd>
                <Dt>Lat</Dt>     <Dd>{selected.lat.toFixed(4)}</Dd>
                <Dt>Lng</Dt>     <Dd>{selected.lng.toFixed(4)}</Dd>
              </dl>
              {mode === 'trace' && (
                <button
                  onClick={() => void traceRiver(selected.lat, selected.lng)}
                  disabled={tracing}
                  style={{
                    marginTop:    'var(--space-3)',
                    padding:      'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-sm)',
                    border:       '1px solid var(--border)',
                    background:   'var(--bg-panel-alt)',
                    color:        'var(--text-primary)',
                    fontSize:     'var(--text-xs)',
                    cursor:       tracing ? 'default' : 'pointer',
                    width:        '100%',
                  }}
                >
                  Trace from this station
                </button>
              )}
            </div>
          )}
        </aside>

        {/* ── Map container ── */}
        <div
          ref={mapContainerRef}
          style={{ flex: 1, position: 'relative' }}
        />
      </div>
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────
function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex:         1,
        padding:      'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-sm)',
        border:       '1px solid var(--border)',
        background:   active ? 'var(--accent)' : 'var(--bg-panel-alt)',
        color:        active ? '#fff' : 'var(--text-muted)',
        fontSize:     'var(--text-xs)',
        cursor:       'pointer',
      }}
    >
      {children}
    </button>
  )
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{children}</dt>
}

function Dd({ children }: { children: React.ReactNode }) {
  return <dd style={{ color: 'var(--text-primary)', fontSize: 'var(--text-xs)' }}>{children}</dd>
}
