import type { FormEvent, ReactElement } from 'react';
import { useLoginForm } from '../hooks/useLoginForm';
import { EmailField } from '../../fields/EmailField/EmailField';
import { PasswordField } from '../../fields/PasswordField/PasswordField';
import { SubmitButton } from '../../fields/SubmitButton/SubmitButton';
import styles from '../../fields/form.module.css';

export function LoginForm(): ReactElement {
  const { values, setEmail, setPassword, submit, submitting, error, canSubmit } = useLoginForm();

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submit();
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <EmailField value={values.email} onChange={setEmail} disabled={submitting} />
      <PasswordField
        value={values.password}
        onChange={setPassword}
        disabled={submitting}
        autoComplete="current-password"
      />
      {error !== null && <p className={styles.error}>{error}</p>}
      <SubmitButton label={submitting ? 'Logging in…' : 'Log in'} disabled={!canSubmit} />
    </form>
  );
}
