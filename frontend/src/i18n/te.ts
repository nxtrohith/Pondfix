// Telugu: a DRAFT, written for the interface chrome, status words and headings only. It has not been reviewed by a native speaker.
// Safety instructions (care.actions.*), measurement explanations (care.measure.*.why) and help steps are deliberately left out: they fall
// back to English until a reviewed translation exists, because a mistranslated instruction can harm fish. Add them here only after review.
import type { PartialDictionary } from './en';

export const te: PartialDictionary = {
  nav: {
    main: 'ప్రధాన మెనూ', home: 'హోమ్', ponds: 'నా చెరువులు', alerts: 'హెచ్చరికలు', health: 'చెరువు ఆరోగ్యం', pondsShort: 'చెరువులు', healthShort: 'ఆరోగ్యం', help: 'సహాయం', more: 'మరిన్ని',
    ask: 'PondFix ని అడగండి', demo: 'డెమో & సిమ్యులేషన్', tests: 'సలహాదారు పరీక్ష', system: 'సిస్టమ్ స్థితి', openMenu: 'మెనూ తెరవండి',
    closeMenu: 'మెనూ మూసివేయండి', menu: 'మెనూ', skip: 'ముఖ్య భాగానికి వెళ్ళండి', searchPonds: 'చెరువులను వెతకండి', refresh: 'రీడింగ్‌లను రిఫ్రెష్ చేయండి',
    alertCount: '{{count}} తెరిచి ఉన్న హెచ్చరికలు', pondDetails: 'చెరువు వివరాలు',
  },
  language: {
    label: 'భాష',
    draftNote: 'తెలుగు అనువాదం ఇంకా సమీక్షించబడలేదు. సమీక్షించిన అనువాదం వచ్చే వరకు భద్రతా సూచనలు ఇంగ్లీషులోనే ఉంటాయి.',
  },
  care: {
    verdict: {
      healthy: { title: 'చెరువు ఆరోగ్యంగా ఉంది', body: 'ప్రస్తుత రీడింగ్‌లన్నీ సురక్షిత పరిధిలో ఉన్నాయి.' },
      attention: { title: 'శ్రద్ధ అవసరం', body: 'ఒక రీడింగ్ సురక్షిత పరిధికి బయట ఉంది. ఈరోజే తనిఖీ చేయండి.' },
      urgent: { title: 'వెంటనే చర్య తీసుకోవాలి', body: 'చేపలు ప్రమాదంలో ఉండవచ్చు. కింది దశలను ఇప్పుడే పాటించండి.' },
      unknown: { title: 'చెరువు స్థితిని నిర్ధారించలేకపోతున్నాం', body: 'ఇటీవలి రీడింగ్ లేదు, కాబట్టి చెరువు సురక్షితమో కాదో చెప్పలేము.' },
      loading: { title: 'మీ చెరువులను తనిఖీ చేస్తున్నాం', body: 'తాజా రీడింగ్‌లు తెస్తున్నాం.' },
    },
    severity: { urgent: 'అత్యవసరం', warning: 'హెచ్చరిక', resolved: 'పరిష్కరించబడింది', forecast: 'త్వరలో రావచ్చు' },
    measure: {
      dissolved_oxygen: { name: 'నీటిలో ఆక్సిజన్', short: 'ఆక్సిజన్' },
      ph: { name: 'pH (ఆమ్లం లేదా క్షారం)', short: 'pH' },
      temperature: { name: 'నీటి ఉష్ణోగ్రత', short: 'ఉష్ణోగ్రత' },
      water_level: { name: 'నీటి మట్టం', short: 'మట్టం' },
      ammonia: { name: 'అమ్మోనియా', short: 'అమ్మోనియా' },
      nitrite: { name: 'నైట్రైట్', short: 'నైట్రైట్' },
      alkalinity: { name: 'క్షారత్వం', short: 'క్షారత్వం' },
      noReading: 'రీడింగ్ లేదు',
    },
    source: { sensor: 'చెరువు సెన్సార్', test: 'పరీక్ష డేటా', historical: 'పాత డేటా', calculated: 'లెక్కించినది' },
    actions: { title: 'ఇప్పుడు ఏమి చేయాలి' },
    connection: {
      connected: { title: 'కనెక్ట్ అయింది', body: 'ప్రస్తుత రీడింగ్‌లు అందుతున్నాయి.' },
      reconnecting: { title: 'మళ్లీ కనెక్ట్ అవుతోంది' },
      noInternet: { title: 'ఇంటర్నెట్ లేదు' },
      serviceDown: { title: 'PondFix అందుబాటులో లేదు' },
      deviceOffline: { title: 'చెరువు పరికరం నుండి రీడింగ్ రావడం లేదు' },
      delayed: { title: 'డేటా ఆలస్యం' },
      unknown: { title: 'స్థితి తెలియదు' },
      help: 'దీన్ని ఎలా సరిచేయాలి',
    },
  },
  home: {
    title: 'హోమ్', description: 'మీ చెరువు ఇప్పుడు సురక్షితంగా ఉందా, మీరు ఏమి చేయాలి?', openAlert: 'పూర్తి సూచనలు చూడండి',
    needsAttention: 'ఇప్పుడు శ్రద్ధ అవసరం', yourPonds: 'మీ చెరువులు', seeAllPonds: 'అన్ని చెరువులు చూడండి', farmMap: 'ఫార్మ్ మ్యాప్',
  },
  help: {
    title: 'సహాయం', emergency: 'అత్యవసర పరిస్థితిలో', colours: 'రంగులు, పదాల అర్థం', measurements: 'ప్రతి రీడింగ్ అర్థం',
    troubleshoot: 'రీడింగ్‌లు రాలేదా లేదా పాతవా?', ask: 'ఇంకా సందేహమా? PondFix ని అడగండి', safeRange: 'సురక్షిత పరిధి',
  },
  ponds: { title: 'నా చెరువులు' },
};
