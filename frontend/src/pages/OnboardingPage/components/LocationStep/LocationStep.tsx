import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { COUNTRIES, countryByCode, detectCountry, flagFor } from '../../domain/countries';
import {
  localTimeIn,
  prettyZone,
  zonesWith,
} from '../../domain/timezones';
import type { ProfileDraft } from '../../state/onboardingDraft';
import { Dropdown } from '../Dropdown/Dropdown';
import controls from '../controls.module.css';
import styles from './LocationStep.module.css';

interface LocationStepProps {
  value: ProfileDraft;
  onChange: (patch: Partial<ProfileDraft>) => void;
  disabled: boolean;
}

function SearchIcon(): ReactElement {
  return (
    <svg
      className={controls.searchIcon}
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" />
    </svg>
  );
}

function CheckIcon(): ReactElement {
  return (
    <svg
      className={controls.menuCheck}
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12l5 5 9-11" />
    </svg>
  );
}

export function LocationStep({ value, onChange, disabled }: LocationStepProps): ReactElement {
  const [countryQuery, setCountryQuery] = useState('');
  const [tzOpen, setTzOpen] = useState(false);
  const [tzQuery, setTzQuery] = useState('');
  // Live clock — refresh local times every 30s while the step is shown.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const detected = useMemo(() => detectCountry(), []);
  const selectedCountry = countryByCode(value.country);

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (q === '') {
      return COUNTRIES;
    }
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [countryQuery]);

  const zones = useMemo(() => zonesWith(value.timezone), [value.timezone]);
  const filteredZones = useMemo(() => {
    const q = tzQuery.trim().toLowerCase();
    if (q === '') {
      return zones;
    }
    return zones.filter((z) => prettyZone(z).toLowerCase().includes(q));
  }, [zones, tzQuery]);

  const pickCountry = (code: string, close: () => void): void => {
    onChange({ country: code });
    setCountryQuery('');
    close();
  };

  const showDetected =
    detected !== null && countryQuery.trim() === '' && detected.code !== value.country;

  return (
    <div className={controls.card}>
      <div className={controls.fieldGroup}>
        <span className={controls.fieldLabel}>Country</span>
        <Dropdown
          ariaLabel="Country"
          disabled={disabled}
          placeholder={selectedCountry === null}
          label={
            selectedCountry === null ? (
              <span className={styles.triggerLabel}>
                <span className={styles.flag}>🌐</span> Select your country
              </span>
            ) : (
              <span className={styles.triggerLabel}>
                <span className={styles.flag}>{flagFor(selectedCountry.code)}</span>
                {selectedCountry.name}
              </span>
            )
          }
        >
          {(close) => (
            <>
              <div className={controls.search}>
                <SearchIcon />
                <input
                  className={controls.searchInput}
                  value={countryQuery}
                  onChange={(e) => setCountryQuery(e.target.value)}
                  placeholder="Search countries"
                  autoFocus
                />
              </div>
              <div className={styles.list}>
                {showDetected && (
                  <button
                    type="button"
                    className={`${controls.menuRow} ${styles.detected}`}
                    onClick={() => pickCountry(detected.code, close)}
                  >
                    <span className={styles.flag}>{flagFor(detected.code)}</span>
                    <span className={styles.detectedText}>
                      <span className={styles.detectedName}>{detected.name}</span>
                      <span className={styles.detectedHint}>Detected from your location</span>
                    </span>
                  </button>
                )}
                {filteredCountries.length === 0 ? (
                  <p className={controls.menuEmpty}>No countries match “{countryQuery}”</p>
                ) : (
                  filteredCountries.map((c) => {
                    const selected = c.code === value.country;
                    return (
                      <button
                        key={c.code}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`${controls.menuRow} ${selected ? controls.menuRowSelected : ''}`}
                        onClick={() => pickCountry(c.code, close)}
                      >
                        <span className={styles.flag}>{flagFor(c.code)}</span>
                        {c.name}
                        {selected && <CheckIcon />}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </Dropdown>
      </div>

      <div className={controls.fieldGroup}>
        <span className={controls.labelRow}>
          <span className={controls.fieldLabel}>Time zone</span>
          <span className={controls.labelMuted}>auto-detected</span>
        </span>
        <div className={styles.tzWrap}>
          <div className={styles.tzRow}>
            <span className={styles.tzIcon} aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3.5 2" />
              </svg>
            </span>
            <span className={styles.tzText}>
              <span className={styles.tzName}>{prettyZone(value.timezone)}</span>
              <span className={styles.tzLocal}>Local time {localTimeIn(value.timezone, now)}</span>
            </span>
            <button
              type="button"
              className={styles.changeBtn}
              onClick={() => setTzOpen((v) => !v)}
              disabled={disabled}
              aria-expanded={tzOpen}
            >
              Change
            </button>
          </div>
          {tzOpen && (
            <>
              <button
                type="button"
                className={controls.backdrop}
                aria-hidden="true"
                onClick={() => setTzOpen(false)}
              />
              <div className={`${controls.popover} ${controls.popoverWide}`} role="listbox">
                <div className={controls.search}>
                  <SearchIcon />
                  <input
                    className={controls.searchInput}
                    value={tzQuery}
                    onChange={(e) => setTzQuery(e.target.value)}
                    placeholder="Search time zones"
                    autoFocus
                  />
                </div>
                <div className={styles.list}>
                  {filteredZones.length === 0 ? (
                    <p className={controls.menuEmpty}>No time zones match “{tzQuery}”</p>
                  ) : (
                    filteredZones.map((zone) => {
                      const selected = zone === value.timezone;
                      return (
                        <button
                          key={zone}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`${controls.menuRow} ${controls.menuRowSpread} ${
                            selected ? controls.menuRowSelected : ''
                          }`}
                          onClick={() => {
                            onChange({ timezone: zone });
                            setTzQuery('');
                            setTzOpen(false);
                          }}
                        >
                          <span>{prettyZone(zone)}</span>
                          <span className={controls.menuMeta}>{localTimeIn(zone, now)}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
