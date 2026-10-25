import { useSimStore } from '../../store/sim';
import { BODIES } from '../../data/bodies';
import styles from './InfoPanel.module.css';

interface InfoPanelProps {
  isCollapsed?: boolean;
}

export function InfoPanel({ isCollapsed = false }: InfoPanelProps) {
  const selectedBody = useSimStore((s) => s.selectedBody);
  const stats = useSimStore((s) => s.hudAnalytics);
  const setBenchmarksOpen = useSimStore((s) => s.setBenchmarksOpen);
  const setCantingOpen = useSimStore((s) => s.setCantingOpen);
  const toggleRightPanel = useSimStore((s) => s.toggleRightPanel);

  const body = BODIES[selectedBody] || BODIES['Earth'];

  return (
    <aside
      className={`${styles.infoPanel} ${isCollapsed ? styles.infoPanelCollapsed : ''}`}
      aria-hidden={isCollapsed}
    >
      <div className={styles.infoHeader}>
        <div className={styles.infoHeaderMain}>
          <div>
            <div className={styles.title}>{body.displayName}</div>
            <div className={styles.subtitle}>{body.type}</div>
          </div>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={toggleRightPanel}
            title="Collapse Telemetry & Info panel (I)"
            aria-label="Collapse Right Panel"
          >
            ▶
          </button>
        </div>
      </div>

      <div className={styles.infoRows}>
        <div className={styles.dataRow}>
          <span className={styles.rowLabel}>Radius</span>
          <span className={`${styles.rowValue} mono`}>{body.radiusKm.toLocaleString()} km</span>
        </div>

        <div className={styles.dataRow}>
          <span className={styles.rowLabel}>Mass</span>
          <span className={`${styles.rowValue} mono`}>{body.massKg}</span>
        </div>

        {selectedBody === 'Earth' && (
          <>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Orbit Radius</span>
              <span className={`${styles.rowValue} mono`}>{stats.radius_au.toFixed(4)} AU</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Orbital Speed</span>
              <span className={`${styles.rowValue} mono`}>{stats.orbital_speed_km_s.toFixed(2)} km/s</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Orbital Period</span>
              <span className={`${styles.rowValue} mono`}>{stats.orbital_period_yr.toFixed(2)} yr</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Migration Target</span>
              <span className={`${styles.rowValue} mono`}>2.7000 AU</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Migration Progress</span>
              <span className={`${styles.rowValue} ${styles.accentValue} mono`}>
                {stats.migration_progress_pct.toFixed(1)}%
              </span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Ledger Audit</span>
              <span className={`${styles.rowValue} mono`}>
                {stats.ledger_pass ? 'PASS' : 'DRIFT'}
              </span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Waste Heat</span>
              <span className={`${styles.rowValue} mono`}>
                {stats.waste_heat_w_m2 != null ? `${stats.waste_heat_w_m2.toFixed(2)} W/m²` : '< 5.0 W/m²'}
              </span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Moon Distance</span>
              <span className={`${styles.rowValue} mono`}>
                {Math.round(stats.moon_distance_km ?? 384400).toLocaleString()} km
              </span>
            </div>
          </>
        )}

        {selectedBody === 'Tug' && (
          <>
            <div className={styles.missionCard}>
              <div className={styles.missionCardTitle}>Mission Architecture</div>
              <div className={styles.missionCardText}>
                Displaced Ceres-mass asteroid ballast tractor hovering 1.27M km ahead of Earth. Dual relativistic plasma thrusters canted ±5.0° clear the biosphere while continuously delivering 2.33 × 10¹⁷ N tangential gravitational pull.
              </div>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Standoff Distance</span>
              <span className={`${styles.rowValue} mono`}>
                {Math.round(stats.tug_standoff_km).toLocaleString()} km
              </span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Hill Sphere Ratio</span>
              <span className={`${styles.rowValue} mono`}>
                {stats.tug_standoff_hill_ratio.toFixed(3)} R_Hill
              </span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Effective Thrust</span>
              <span className={`${styles.rowValue} mono`}>
                {stats.thrust_n.toExponential(3)} N
              </span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Mass Flow</span>
              <span className={`${styles.rowValue} mono`}>
                {stats.mass_flow_rate_kg_s > 0 ? `${stats.mass_flow_rate_kg_s.toFixed(0)} kg/s` : '0 kg/s'}
              </span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Exhaust Speed</span>
              <span className={`${styles.rowValue} mono`}>0.30c (89,938 km/s)</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Propellant Spent</span>
              <span className={`${styles.rowValue} mono`}>
                {stats.fuel_spent_ceres_pct.toFixed(1)}%
              </span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Beamed Power</span>
              <span className={`${styles.rowValue} mono`}>
                {stats.beam_power_w.toExponential(2)} W
              </span>
            </div>
          </>
        )}

        {selectedBody === 'Moon' && (
          <div className={styles.missionCard}>
            <div className={styles.missionCardTitle}>Hill Sphere Stability</div>
            <div className={styles.missionCardText}>
              Earth-Moon system migrates outwards collaboratively. Moon remains gravitationally bound within Earth's expanding Hill sphere throughout the full 10,000-year spiral.
            </div>
          </div>
        )}

        {selectedBody !== 'Earth' && selectedBody !== 'Tug' && (
          <>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Semi-Major Axis</span>
              <span className={`${styles.rowValue} mono`}>{body.orbitAu.toFixed(3)} AU</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Orbital Period</span>
              <span className={`${styles.rowValue} mono`}>{body.periodYr.toFixed(2)} yr</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Orbital Speed</span>
              <span className={`${styles.rowValue} mono`}>{body.orbitalSpeedKmS.toFixed(1)} km/s</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Known Moons</span>
              <span className={`${styles.rowValue} mono`}>{body.moons}</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.rowLabel}>Day Length</span>
              <span className={`${styles.rowValue} mono`}>{body.dayLength}</span>
            </div>
          </>
        )}

        <div
          className={`${styles.dataRow} ${styles.clickableRow}`}
          onClick={() => setCantingOpen(true)}
          title="Click to view plume canting details (C)"
        >
          <span className={styles.rowLabel}>Plume Canting</span>
          <span className={`${styles.rowValue} ${styles.accentValue} mono`}>
            ±5.0° Out-Ecliptic ↗
          </span>
        </div>

        <div className={styles.dataRow}>
          <span className={styles.rowLabel}>Yaw Trim</span>
          <span className={`${styles.rowValue} mono`}>8.08° In-Ecliptic</span>
        </div>

        <div
          className={`${styles.dataRow} ${styles.clickableRow}`}
          onClick={() => setBenchmarksOpen(true)}
          title="Click to view 10/10 verification benchmarks (B)"
        >
          <span className={styles.rowLabel}>Verification</span>
          <span className={`${styles.rowValue} ${styles.accentValue} mono`}>
            VIEW ↗
          </span>
        </div>
      </div>
    </aside>
  );
}
