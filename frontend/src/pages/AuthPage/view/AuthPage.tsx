import type { ReactElement, ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/shared/auth/useAuth';
import { BasketballIcon } from '@/shared/ui/icons/BasketballIcon';
import styles from './AuthPage.module.css';

const READINESS = [
  { label: 'HRV', value: '38', unit: ' ms' },
  { label: 'Body battery', value: '22' },
  { label: 'Sleep', value: '51' },
];

function CoachIcon(): ReactElement {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M21 7v5M21 7h-5" />
    </svg>
  );
}

function RecoveryIcon(): ReactElement {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2-5 3 9 2-4h7" />
    </svg>
  );
}

function OrchestratorIcon(): ReactElement {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="12" r="2" />
      <path d="M7 6h4a4 4 0 0 1 4 4v0M7 18h4a4 4 0 0 0 4-4v0" />
    </svg>
  );
}

function PlannerIcon(): ReactElement {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="15" rx="2.5" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </svg>
  );
}

const AGENTS: { name: string; role: string; detail: string; icon: ReactNode; highlight?: boolean }[] = [
  {
    name: 'The Coach',
    role: 'Pushes you forward',
    detail: 'Knows your goals and your plan, and fights for the work that actually moves you toward them.',
    icon: <CoachIcon />,
  },
  {
    name: 'The Recovery Agent',
    role: 'Reads your body',
    detail:
      'Turns sleep, HRV and Body Battery into an honest readiness read — and calls it when you need to back off.',
    icon: <RecoveryIcon />,
  },
  {
    name: 'The Orchestrator',
    role: 'Settles the debate',
    detail: 'Weighs ambition against recovery and decides what today actually becomes.',
    icon: <OrchestratorIcon />,
    highlight: true,
  },
  {
    name: 'The Planner',
    role: 'Makes it real',
    detail: 'Rewrites the session and updates your calendar so the decision shows up in your day.',
    icon: <PlannerIcon />,
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
    detail: 'You make the call. Approve it, and your training and calendar update — never before.',
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
            <div className={styles.badge}>
              <span className={styles.badgeDot} aria-hidden="true" />
              <span className={styles.badgeText}>Agentic coaching for athletes</span>
            </div>
            <h1 className={styles.headline}>
              Your watch knows you slept poorly.{' '}
              <span className={styles.accent}>Your calendar just updated.</span>
            </h1>
            <p className={styles.subhead}>
              Connect your Garmin and a team of AI specialists debates your daily readiness — then
              rewrites your training and calendar. Nothing moves until you approve.
            </p>

            <div className={styles.heroCtas}>
              <Link className={styles.ctaPrimary} to="/signup">
                Get started free
              </Link>
              <a className={styles.ctaSecondary} href="#how-it-works">
                See how it works
              </a>
            </div>
          </div>

          <div className={styles.heroVisual}>
            <div className={styles.ahaFlow}>
              <div className={styles.ahaCard}>
                <span className={styles.ahaTag}>Recovery flags fatigue</span>
                <div className={styles.ahaMetrics}>
                  {READINESS.map((m) => (
                    <div key={m.label} className={styles.ahaMetric}>
                      <span className={styles.ahaMetricValue}>
                        {m.value}
                        {m.unit !== undefined && <span className={styles.ahaMetricUnit}>{m.unit}</span>}
                      </span>
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
                  <span className={styles.ahaStrike}>Heavy squats</span>{' '}
                  <span className={styles.ahaSwapArrow}>→</span> <strong>Mobility &amp; Zone-2 flush</strong>
                </p>
              </div>
              <span className={styles.ahaArrow} aria-hidden="true">
                ↓
              </span>
              <div className={styles.ahaCardFinal}>You approve the change</div>
            </div>
          </div>
        </section>

        <div className={styles.divider}>
          <div className={styles.dividerLine} />
        </div>

        {/* ---- Agent team ---- */}
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Meet your AI agent team</h2>
          <p className={styles.blockLede}>
            Four specialists. Four opinions. One job every morning — you.
          </p>
          <div className={styles.agentGrid}>
            {AGENTS.map((agent) => (
              <article
                key={agent.name}
                className={`${styles.agentCard} ${agent.highlight === true ? styles.agentCardHighlight : ''}`}
              >
                <span className={styles.agentIcon} aria-hidden="true">
                  {agent.icon}
                </span>
                <h3 className={styles.agentName}>{agent.name}</h3>
                <p className={styles.agentRole}>{agent.role}</p>
                <p className={styles.agentDetail}>{agent.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <div className={styles.divider}>
          <div className={styles.dividerLine} />
        </div>

        {/* ---- How it works ---- */}
        <section id="how-it-works" className={`${styles.block} ${styles.blockGlow}`}>
          <h2 className={styles.blockTitle}>How it works</h2>
          <p className={styles.blockLede}>
            From raw watch data to a call you actually trust — in three steps.
          </p>
          <div className={styles.stepGrid}>
            {STEPS.map((s) => (
              <div key={s.step}>
                <div className={styles.stepHead}>
                  <span className={styles.stepNum}>{s.step}</span>
                  <span className={styles.stepLine} aria-hidden="true" />
                </div>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.stepDetail}>{s.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Daily debate ---- */}
        <section className={styles.debate}>
          <div className={styles.debateInner}>
            <h2 className={styles.blockTitle}>The daily debate</h2>
            <p className={styles.blockLede}>
              Each agent hands the case to the next. Nothing changes until you approve.
            </p>
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
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <BasketballIcon className={styles.logoMark} size={30} />
            <span className={styles.brandName}>AgentiCoach</span>
          </div>
          <h3 className={styles.footerTag}>Ready to train on evidence, not guesswork?</h3>
          <Link className={styles.ctaPrimary} to="/signup">
            Get started free
          </Link>
          <p className={styles.footerCopy}>© 2026 AgentiCoach. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
