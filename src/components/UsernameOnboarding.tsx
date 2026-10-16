import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { t } from '../locales';
import { checkUsernameAvailability, claimUsername } from '../game/usernameRepository';
import { Button, Dialog } from './ui';

type Availability = 'idle' | 'length' | 'characters' | 'checking' | 'available' | 'taken' | 'reserved' | 'error';
type OnboardingStep = 'choose' | 'confirm';

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

export default function UsernameOnboarding({ onComplete }: { onComplete: () => void }) {
  const [username, setUsername] = useState('');
  const [step, setStep] = useState<OnboardingStep>('choose');
  const [availability, setAvailability] = useState<Availability>('idle');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const displayUsername = username.replace(/^ +| +$/g, '');

  useEffect(() => {
    if (step !== 'choose') return;
    if (displayUsername.length < 3 || displayUsername.length > 16) {
      setAvailability('length');
      return;
    }
    if (!USERNAME_PATTERN.test(displayUsername)) {
      setAvailability('characters');
      return;
    }

    let active = true;
    setAvailability('checking');
    const timer = window.setTimeout(() => {
      checkUsernameAvailability(username)
        .then((status) => {
          if (!active) return;
          if (status === 'AVAILABLE') setAvailability('available');
          else if (status === 'USERNAME_TAKEN') setAvailability('taken');
          else if (status === 'INVALID_USERNAME') setAvailability('reserved');
          else if (status === 'USERNAME_ALREADY_SET') onCompleteRef.current();
          else setAvailability('error');
        })
        .catch(() => {
          if (active) setAvailability('error');
        });
    }, 450);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [displayUsername, step, username]);

  const continueToConfirmation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (availability !== 'available') return;
    setClaimError(null);
    setStep('confirm');
  };

  const confirmUsername = async () => {
    setClaiming(true);
    setClaimError(null);
    try {
      const status = await claimUsername(username);
      if (status === 'SUCCESS' || status === 'USERNAME_ALREADY_SET') {
        onCompleteRef.current();
        return;
      }
      if (status === 'USERNAME_TAKEN') {
        setStep('choose');
        setAvailability('taken');
        setClaimError(t('usernameOnboarding.taken'));
      } else if (status === 'INVALID_USERNAME') {
        setStep('choose');
        setAvailability('reserved');
        setClaimError(t('usernameOnboarding.reserved'));
      } else {
        setClaimError(t('usernameOnboarding.saveError'));
      }
    } catch {
      setClaimError(t('usernameOnboarding.saveError'));
    } finally {
      setClaiming(false);
    }
  };

  const availabilityText = {
    idle: '',
    length: t('usernameOnboarding.lengthHint'),
    characters: t('usernameOnboarding.charactersHint'),
    checking: t('usernameOnboarding.checking'),
    available: t('usernameOnboarding.available'),
    taken: t('usernameOnboarding.taken'),
    reserved: t('usernameOnboarding.reserved'),
    error: t('usernameOnboarding.availabilityError'),
  }[availability];

  const statusTone = availability === 'available' ? ' good' : availability === 'taken' || availability === 'reserved' || availability === 'error' ? ' bad' : '';
  return (
    <div className="auth-screen">
      <Dialog
        inline
        className="auth-dialog username-modal"
        title={step === 'choose' ? t('usernameOnboarding.title') : t('usernameOnboarding.confirmTitle')}
        subtitle={step === 'choose' ? t('usernameOnboarding.description') : t('usernameOnboarding.confirmQuestion', { username: displayUsername })}
        footer={
          step === 'choose' ? (
            <Button type="submit" form="username-form" variant="primary" block disabled={availability !== 'available'}>
              {t('usernameOnboarding.continue')}
            </Button>
          ) : (
            <>
              <Button variant="primary" block onClick={confirmUsername} disabled={claiming}>
                {claiming ? t('usernameOnboarding.saving') : t('usernameOnboarding.confirm')}
              </Button>
              <Button block onClick={() => setStep('choose')} disabled={claiming}>
                {t('usernameOnboarding.back')}
              </Button>
            </>
          )
        }
      >
        {step === 'choose' ? (
          <form className="auth-form username-form" id="username-form" onSubmit={continueToConfirmation}>
            <label className="ui-labelled">
              <span className="ui-labelled-caption">{t('usernameOnboarding.usernameLabel')}</span>
              <span className="ui-field">
                <span className="username-prefix" aria-hidden="true">
                  @
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={32}
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setClaimError(null);
                  }}
                  aria-describedby="username-hint username-status"
                  autoFocus
                />
              </span>
            </label>
            <p className="ui-note" id="username-hint">
              {t('usernameOnboarding.rules')}
            </p>
            <p className={`username-status${statusTone}`} id="username-status" aria-live="polite">
              {claimError ?? availabilityText}
            </p>
          </form>
        ) : (
          <>
            <p className="ui-alert">{t('usernameOnboarding.permanentWarning')}</p>
            {claimError && (
              <p className="ui-alert bad" role="alert">
                {claimError}
              </p>
            )}
          </>
        )}
      </Dialog>
    </div>
  );
}
