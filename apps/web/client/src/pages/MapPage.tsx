import { TopBar } from '../design-system/components/TopBar'
import { ThemeToggle } from '../design-system/components/ThemeToggle'
import { Panel } from '../design-system/components/Panel'

export default function MapPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopBar><ThemeToggle /></TopBar>
      <main style={{ flex: 1, padding: 'var(--space-6)' }}>
        <Panel><p style={{ color: 'var(--text-muted)' }}>MapPage — wiring data next...</p></Panel>
      </main>
    </div>
  )
}
