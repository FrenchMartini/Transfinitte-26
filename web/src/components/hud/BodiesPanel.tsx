import * as Collapsible from '@radix-ui/react-collapsible';
import { useSimStore } from '../../store/sim';
import { CELESTIAL_LIST, BODIES } from '../../data/bodies';
import styles from './BodiesPanel.module.css';

interface BodiesPanelProps {
  isCollapsed?: boolean;
}

export function BodiesPanel({ isCollapsed = false }: BodiesPanelProps) {
  const selectedBody = useSimStore((s) => s.selectedBody);
  const cameraFocus = useSimStore((s) => s.cameraFocus);
  const focusBody = useSimStore((s) => s.focusBody);
  const scaleExpanded = useSimStore((s) => s.scaleExpanded);
  const toggleScaleExpanded = useSimStore((s) => s.toggleScaleExpanded);
  const toggleLeftPanel = useSimStore((s) => s.toggleLeftPanel);

  return (
    <aside
      className={`${styles.bodiesPanel} ${isCollapsed ? styles.bodiesPanelCollapsed : ''}`}
      aria-hidden={isCollapsed}
    >
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Celestial Bodies</span>
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={toggleLeftPanel}
          title="Collapse Bodies Panel (B)"
          aria-label="Collapse Left Panel"
        >
          ◀
        </button>
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
              <span className={styles.scaleHeaderTitle}>Scale Matrix</span>
              <div className={styles.scaleHeaderRight}>
                <span className={styles.scaleTag}>Reference</span>
                <span className={`${styles.chevron} ${scaleExpanded ? styles.chevronOpen : ''}`}>▼</span>
              </div>
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
