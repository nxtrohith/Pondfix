'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Translate } from '@phosphor-icons/react/dist/ssr';
import { LANGUAGES, LANG_COOKIE, isLang } from '@/i18n';
import { useLang, useT } from '@/i18n/client';
import { cx } from '../ui/cx';

/** Native <select>: works with a keyboard, a screen reader and a phone's own picker. The choice is kept for a year in a cookie. */
export function LanguageSelect({ className, id = 'language-select' }: { className?: string; id?: string }) {
  const lang = useLang();
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className={cx('relative flex items-center', className)}>
      <label htmlFor={id} className="sr-only">{t('language.label')}</label>
      <Translate size={18} aria-hidden="true" className="pointer-events-none absolute left-2.5 text-ink-soft" />
      <select
        id={id}
        value={lang}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          if (!isLang(next)) return;
          document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
          document.documentElement.lang = next;
          start(() => router.refresh());
        }}
        className="h-10 appearance-none rounded-lg border border-line bg-card pl-8 pr-3 text-sm text-ink hover:bg-surface pointer-coarse:h-11"
      >
        {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
      </select>
    </div>
  );
}
