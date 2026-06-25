import type { FormEvent, ReactElement } from 'react';
import { useSignupForm } from '../hooks/useSignupForm';
import { NameField } from '../../fields/NameField/NameField';
import { EmailField } from '../../fields/EmailField/EmailField';
import { PasswordField } from '../../fields/PasswordField/PasswordField';
import { SubmitButton } from '../../fields/SubmitButton/SubmitButton';
import styles from '../../fields/form.module.css';

export function SignupForm(): ReactElement {
  const { values, setEmail, setPassword, setName, submit, submitting, error, canSubmit } =
    useSignupForm();

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submit();
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <NameField value={values.name} onChange={setName} disabled={submitting} />
      <EmailField value={values.email} onChange={setEmail} disabled={submitting} />
      <PasswordField
        value={values.password}
        onChange={setPassword}
        disabled={submitting}
        autoComplete="new-password"
      />
      {error !== null && <p className={styles.error}>{error}</p>}
      <SubmitButton label={submitting ? 'Creating account…' : 'Sign up'} disabled={!canSubmit} />
    </form>
  );
}
