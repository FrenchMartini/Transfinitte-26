import * as Collapsible from '@radix-ui/react-collapsible';
import * as Select from '@radix-ui/react-select';
import { useSimStore } from '../../store/sim';
import { CELESTIAL_LIST, BODIES } from '../../data/bodies';
import styles from './BodiesPanel.module.css';

export function BodiesPanel() {
  const selectedBody = useSimStore((s) => s.selectedBody);
  const cameraFocus = useSimStore((s) => s.cameraFocus);
  const focusBody = useSimStore((s) => s.focusBody);
  const scaleExpanded = useSimStore((s) => s.scaleExpanded);
  const toggleScaleExpanded = useSimStore((s) => s.toggleScaleExpanded);

  return (
    <aside className={styles.bodiesPanel}>
      <div className={styles.sectionTitle}>Celestial Bodies</div>

      {/* Merged Dropdown Selector */}
      <div style={{ padding: '0 12px 8px' }}>
        <Select.Root value={cameraFocus} onValueChange={focusBody}>
          <Select.Trigger
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: '30px',
              padding: '0 8px',
              background: 'var(--bg)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius)',
              color: 'var(--text)',
              fontSize: 'var(--font-size-body)',
              cursor: 'pointer'
            }}
            aria-label="Target Focus Dropdown"
          >
            <Select.Value placeholder="Select Target" />
            <Select.Icon>▼</Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                padding: '4px',
                zIndex: 'var(--z-tooltip)'
              }}
              position="popper"
              sideOffset={4}
            >
              <Select.Viewport>
                <Select.Item
                  value="system"
                  style={{
                    padding: '6px 10px',
                    fontSize: 'var(--font-size-body)',
                    color: 'var(--text)',
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <Select.ItemText>🌌 Solar System</Select.ItemText>
                </Select.Item>
                {CELESTIAL_LIST.map((key) => (
                  <Select.Item
                    key={key}
                    value={key}
                    style={{
                      padding: '6px 10px',
                      fontSize: 'var(--font-size-body)',
                      color: 'var(--text)',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                  >
                    <Select.ItemText>{BODIES[key]?.displayName || key}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>

      {/* Direct Clickable Bodies List */}
      <div className={styles.bodyList}>
        <button
          type="button"
          className={`${styles.bodyBtn} ${cameraFocus === 'system' ? styles.bodyBtnActive : ''}`}
          onClick={() => focusBody('system')}
          title="Zoom to Solar System Overview"
        >
          <span className={`${styles.statusDot} ${cameraFocus === 'system' ? styles.statusDotActive : ''}`} />
          <span>Solar System</span>
        </button>

        {CELESTIAL_LIST.map((key) => {
          const body = BODIES[key];
          const isFocused = cameraFocus === key || (cameraFocus !== 'system' && selectedBody === key);
          return (
            <button
              key={key}
              type="button"
              className={`${styles.bodyBtn} ${isFocused ? styles.bodyBtnActive : ''}`}
              onClick={() => focusBody(key)}
              title={`Zoom into ${body?.displayName || key}`}
            >
              <span className={`${styles.statusDot} ${isFocused ? styles.statusDotActive : ''}`} />
              <span>{body?.displayName || key}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.scaleSection}>
        <Collapsible.Root open={scaleExpanded} onOpenChange={toggleScaleExpanded}>
          <Collapsible.Trigger asChild>
            <button type="button" className={styles.scaleHeaderBtn} id="btn-toggle-matrix">
              <span className={styles.sectionTitle} style={{ padding: 0 }}>Scale Matrix</span>
              <span className={`${styles.chevron} ${scaleExpanded ? styles.chevronOpen : ''}`}>▼</span>
            </button>
          </Collapsible.Trigger>

          <Collapsible.Content className={styles.scaleContent}>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Distance Scale</span>
              <span className={`${styles.rowValue} mono`}>1 AU = 24.0 u</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Sun Radius</span>
              <span className={`${styles.rowValue} mono`}>4.2 u (0.04×)</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Earth Radius</span>
              <span className={`${styles.rowValue} mono`}>0.9 u (211×)</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Moon Radius</span>
              <span className={`${styles.rowValue} mono`}>0.35 u (300×)</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Tug Standoff</span>
              <span className={`${styles.rowValue} mono`}>1.27M km</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Outer Orbits</span>
              <span className={`${styles.rowValue} mono`}>Log-scaled</span>
            </div>
          </Collapsible.Content>
        </Collapsible.Root>
      </div>
    </aside>
  );
}
