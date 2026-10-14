import { t } from '@/i18n';

/** "in about 2–4 h", "within an hour": plain-language lead time for a knock-on effect. */
export const leadText = ([min, max]: [number, number]): string =>
  max <= 1 ? t('lead.withinHour') : min === 0 ? t('lead.within', { max }) : min === max ? t('lead.about', { min }) : t('lead.aboutRange', { min, max });
