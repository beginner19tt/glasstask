import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, type User } from '../lib/api';

function GoogleMark() {
  return (
    <svg className="g-logo" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.09l3.01-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

interface Props {
  open: boolean;
  user: User | null;
  googleConfigured: boolean;
  devAuth: boolean;
  queued: number;
  onClose: () => void;
  onSignedIn: () => void;
  onSignOut: () => void;
  onNotice: (message: string) => void;
}

export function AccountSheet({
  open,
  user,
  googleConfigured,
  devAuth,
  queued,
  onClose,
  onSignedIn,
  onSignOut,
  onNotice,
}: Props) {
  const [plan, setPlan] = useState('');
  const [planning, setPlanning] = useState(false);

  const runPlan = async () => {
    setPlanning(true);
    try {
      const result = await api.plan();
      setPlan(result.plan || '—');
      onNotice(result.source === 'ai' ? 'Workers AI' : 'ローカル順序付け');
    } catch {
      onNotice('サインインが必要です');
    } finally {
      setPlanning(false);
    }
  };

  const devSignIn = async () => {
    try {
      await api.devLogin();
      onSignedIn();
    } catch {
      onNotice('ローカルサインインに失敗');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            data-testid="scrim"
          />
          <motion.div
            className="sheet glass glass--chrome glass--refract"
            role="dialog"
            aria-label="アカウント"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_event, info) => {
              if (info.offset.y > 90 || info.velocity.y > 520) onClose();
            }}
            data-testid="account-sheet"
          >
            <div className="sheet__grip" />

            <div className="sheet__title">Account</div>
            {user ? (
              <div className="sheet__row" style={{ alignItems: 'center', gap: 10 }}>
                {user.picture ? (
                  <img className="avatar" src={user.picture} alt="" />
                ) : (
                  <span className="avatar" />
                )}
                <span data-testid="account-email">{user.email}</span>
              </div>
            ) : (
              <div className="gate">
                <span className="gate__label">
                  {queued > 0
                    ? `${queued} 件はこの端末に保存済み · サインインで同期`
                    : 'サインインすると端末間で同期'}
                </span>
                {googleConfigured ? (
                  <a className="btn btn--primary btn--wide" href="/api/auth/google">
                    <GoogleMark />
                    Google でサインイン
                  </a>
                ) : (
                  <span className="gate__label" data-testid="google-unconfigured">
                    GOOGLE_CLIENT_ID 未設定
                  </span>
                )}
                {devAuth && (
                  <button
                    type="button"
                    className="btn glass"
                    onClick={() => void devSignIn()}
                    data-testid="dev-signin"
                  >
                    ローカルサインイン (dev)
                  </button>
                )}
              </div>
            )}

            <div className="glass-divider" />

            <div className="sheet__title">Workers AI</div>
            <div className="sheet__body" data-testid="plan-body">
              {plan ? plan : <span className="gate__label">—</span>}
            </div>
            <div className="sheet__row">
              <button
                type="button"
                className="btn glass"
                onClick={() => void runPlan()}
                disabled={planning}
                data-testid="plan-run"
              >
                {planning ? '…' : '今日の順番を出す'}
              </button>
              {user && (
                <button
                  type="button"
                  className="btn glass"
                  onClick={onSignOut}
                  data-testid="sign-out"
                >
                  サインアウト
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
