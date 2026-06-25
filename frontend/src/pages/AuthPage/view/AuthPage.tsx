import type { ReactElement } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/shared/auth/useAuth';
import { BasketballIcon } from '@/shared/ui/icons/BasketballIcon';
import styles from './AuthPage.module.css';

const READINESS = [
  { label: 'HRV', value: '38 ms' },
  { label: 'Body Battery', value: '22' },
  { label: 'Sleep', value: '51' },
];

const AGENTS: { name: string; role: string; detail: string }[] = [
  {
    name: 'The Coach',
    role: 'Pushes you forward',
    detail: 'Knows your goals and your plan, and argues for the work that moves you toward them.',
  },
  {
    name: 'The Recovery Agent',
    role: 'Reads your body',
    detail: 'Turns sleep, HRV and Body Battery into an honest readiness read — and flags when to back off.',
  },
  {
    name: 'The Orchestrator',
    role: 'Settles the debate',
    detail: 'Weighs the Coach against the Recovery Agent and decides what today actually becomes.',
  },
  {
    name: 'The Planner',
    role: 'Makes it real',
    detail: 'Rewrites the session and updates your calendar so the decision shows up in your day.',
  },
];

const STEPS: { step: string; title: string; detail: string }[] = [
  {
    step: '01',
    title: 'Connect your Garmin',
    detail: 'Link your watch once. Sleep, HRV, Body Battery and training load flow in automatically.',
  },
  {
    step: '02',
    title: 'The agents debate',
    detail: 'Every morning your AI team weighs recovery against your plan and reaches a verdict.',
  },
  {
    step: '03',
    title: 'Approve & sync',
    detail: 'You get the call. Approve it, and your training and calendar update — never before.',
  },
];

const DEBATE = ['Recovery', 'Coach', 'Orchestrator', 'Planner'];

export function AuthPage(): ReactElement {
  const { user } = useAuth();

  if (user !== null) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.brand}>
            <BasketballIcon className={styles.logoMark} size={30} />
            <span className={styles.brandName}>AgentiCoach</span>
          </div>
          <nav className={styles.navActions}>
            <Link className={styles.navLink} to="/login">
              Log in
            </Link>
            <Link className={styles.navCta} to="/signup">
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ---- Hero ---- */}
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <h1 className={styles.headline}>
              Your watch knows you slept poorly.{' '}
              <span className={styles.accent}>Your calendar just updated.</span>
            </h1>
            <p className={styles.subhead}>
              Connect your Garmin to a team of AI agents that debate your daily readiness, then
              adjust your training and calendar — only after you approve.
            </p>

            <div className={styles.heroCtas}>
              <Link className={styles.ctaPrimary} to="/signup">
                Get started
              </Link>
              <Link className={styles.ctaSecondary} to="/login">
                Log in
              </Link>
            </div>
          </div>

          <div className={styles.heroVisual}>
            <div className={styles.ahaFlow}>
              <div className={styles.ahaCard}>
                <span className={styles.ahaTag}>Recovery flags fatigue</span>
                <div className={styles.ahaMetrics}>
                  {READINESS.map((m) => (
                    <div key={m.label} className={styles.ahaMetric}>
                      <span className={styles.ahaMetricValue}>{m.value}</span>
                      <span className={styles.ahaMetricLabel}>{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <span className={styles.ahaArrow} aria-hidden="true">
                ↓
              </span>
              <div className={styles.ahaCard}>
                <span className={styles.ahaTag}>Orchestrator: active recovery</span>
                <p className={styles.ahaSwap}>
                  <span className={styles.ahaStrike}>Heavy squats</span>
                  <span className={styles.ahaTo}>→ Mobility &amp; Zone-2 flush</span>
                </p>
              </div>
              <span className={styles.ahaArrow} aria-hidden="true">
                ↓
              </span>
              <div className={styles.ahaCardFinal}>You approve the change</div>
            </div>
          </div>
        </section>

        {/* ---- Agent team ---- */}
        <section className={styles.block}>
          <div className={styles.blockHead}>
            <h2 className={styles.blockTitle}>Meet your AI agent team</h2>
            <p className={styles.blockLede}>
              Four specialists with different jobs and different opinions — working the same case
              every morning: you.
            </p>
          </div>
          <div className={styles.agentGrid}>
            {AGENTS.map((agent) => (
              <article key={agent.name} className={styles.agentCard}>
                <span className={styles.agentDot} aria-hidden="true" />
                <h3 className={styles.agentName}>{agent.name}</h3>
                <p className={styles.agentRole}>{agent.role}</p>
                <p className={styles.agentDetail}>{agent.detail}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---- How it works ---- */}
        <section className={styles.block}>
          <div className={styles.blockHead}>
            <h2 className={styles.blockTitle}>How it works</h2>
            <p className={styles.blockLede}>
              From raw watch data to a decision you actually trust — in three steps.
            </p>
          </div>
          <div className={styles.stepGrid}>
            {STEPS.map((s) => (
              <article key={s.step} className={styles.stepCard}>
                <span className={styles.stepNum}>{s.step}</span>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.stepDetail}>{s.detail}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---- Daily debate ---- */}
        <section className={styles.block}>
          <div className={styles.blockHead}>
            <h2 className={styles.blockTitle}>The daily debate</h2>
            <p className={styles.blockLede}>
              Each agent passes the case to the next. Nothing applies until you approve.
            </p>
          </div>
          <div className={styles.pipeline}>
            {DEBATE.map((node, i) => (
              <span key={node} className={styles.pipeWrap}>
                <span className={styles.pipeNode}>{node}</span>
                {i < DEBATE.length - 1 ? (
                  <span className={styles.pipeArrow} aria-hidden="true">
                    →
                  </span>
                ) : null}
              </span>
            ))}
          </div>
          <p className={styles.pipeNote}>Nothing applies until you approve.</p>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.brand}>
            <BasketballIcon className={styles.logoMark} size={30} />
            <span className={styles.brandName}>AgentiCoach</span>
          </div>
          <p className={styles.footerTag}>Ready to hack your potential?</p>
          <Link className={styles.ctaPrimary} to="/signup">
            Get started
          </Link>
          <p className={styles.footerCopy}>© 2026 AgentiCoach. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
