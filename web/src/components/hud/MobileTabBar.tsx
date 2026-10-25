import { useSimStore } from '../../store/sim';
import styles from './MobileTabBar.module.css';

export function MobileTabBar() {
  const activeTab = useSimStore((s) => s.activeTab);
  const setActiveTab = useSimStore((s) => s.setActiveTab);

  return (
    <nav className={styles.mobileTabBar}>
      <div className={styles.tabList}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'bodies' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('bodies')}
        >
          Bodies
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'info' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('info')}
        >
          Info
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'time' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('time')}
        >
          Time
        </button>
      </div>
    </nav>
  );
}
