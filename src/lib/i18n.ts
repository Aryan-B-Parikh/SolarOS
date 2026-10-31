/**
 * Internationalization (i18n) Layer (A11 / Spec Section 2.4)
 * Supports English default, with Gujarati (gu) and Hindi (hi) ready dictionaries.
 */

export type Locale = 'en' | 'gu' | 'hi';

export const DEFAULT_LOCALE: Locale = 'en';

export const translations = {
  en: {
    stages: {
      NEW: 'New Enquiry',
      CONTACTED: 'Contacted',
      QUALIFIED: 'Qualified',
      SURVEY_SCHEDULED: 'Survey Scheduled',
      SURVEY_APPROVED: 'Survey Approved',
      QUOTED: 'Quoted',
      WON: 'Won',
      LOST: 'Lost',
      DISQUALIFIED: 'Disqualified',
      PENDING_ADVANCE: 'Pending Advance',
      CONFIRMED: 'Order Confirmed',
      READY_TO_DISPATCH: 'Ready to Dispatch',
      DISPATCHED: 'Dispatched',
      DELIVERED: 'Delivered',
      INSTALLED: 'Installed',
      CLOSED: 'Closed',
    },
    systemTypes: {
      ON_GRID: 'On-Grid Solar',
      OFF_GRID: 'Off-Grid Solar',
      HYBRID: 'Hybrid Solar',
    },
    actions: {
      save: 'Save',
      cancel: 'Cancel',
      confirm: 'Confirm',
      submit: 'Submit',
      approve: 'Approve',
      reject: 'Reject',
      reopen: 'Reopen',
      downloadPdf: 'Download PDF',
      viewPortal: 'View Portal',
    },
    common: {
      capacity: 'Capacity',
      annualGeneration: 'Annual Generation',
      annualSavings: 'Annual Savings',
      estimatedPayback: 'Estimated Payback',
      warranty: 'Warranty',
      active: 'Active',
      expired: 'Expired',
      totalCost: 'Total Cost',
      advanceRequired: 'Advance Required (30%)',
    },
  },
  gu: {
    stages: {
      NEW: 'નવી પૂછપરછ',
      CONTACTED: 'સંપર્ક કર્યો',
      QUALIFIED: 'લાયક',
      SURVEY_SCHEDULED: 'સર્વે નિર્ધારિત',
      SURVEY_APPROVED: 'સર્વે મંજૂર',
      QUOTED: 'કોટ આપ્યું',
      WON: 'સફળ',
      LOST: 'ગુમાવ્યું',
      DISQUALIFIED: 'અયોગ્ય',
      PENDING_ADVANCE: 'એડવાન્સ બાકી',
      CONFIRMED: 'ઓર્ડર કન્ફર્મ',
      READY_TO_DISPATCH: 'ડિસ્પેચ માટે તૈયાર',
      DISPATCHED: 'ડિસ્પેચ થયેલ',
      DELIVERED: 'ડિલિવર થયેલ',
      INSTALLED: 'ઇન્સ્ટોલ થયેલ',
      CLOSED: 'પૂર્ણ થયેલ',
    },
    systemTypes: {
      ON_GRID: 'ઓન-ગ્રીડ સોલર',
      OFF_GRID: 'ઓફ-ગ્રીડ સોલર',
      HYBRID: 'હાઇબ્રિડ સોલર',
    },
    actions: {
      save: 'સાચવો',
      cancel: 'રદ કરો',
      confirm: 'ખાતરી કરો',
      submit: 'સબમિટ કરો',
      approve: 'મંજૂર કરો',
      reject: 'અસ્વીકાર કરો',
      reopen: 'ફરી ખોલો',
      downloadPdf: 'પીડીએફ ડાઉનલોડ કરો',
      viewPortal: 'પોર્ટલ જુઓ',
    },
    common: {
      capacity: 'ક્ષમતા',
      annualGeneration: 'વાર્ષિક વીજળી ઉત્પાદન',
      annualSavings: 'વાર્ષિક બચત',
      estimatedPayback: 'અંદાજિત વળતર સમય',
      warranty: 'વોરંટી',
      active: 'સક્રિય',
      expired: 'સમાપ્ત',
      totalCost: 'કુલ ખર્ચ',
      advanceRequired: 'જરૂરી એડવાન્સ (૩૦%)',
    },
  },
  hi: {
    stages: {
      NEW: 'नई पूछताछ',
      CONTACTED: 'संपर्क किया गया',
      QUALIFIED: 'योग्य',
      SURVEY_SCHEDULED: 'सर्वेक्षण निर्धारित',
      SURVEY_APPROVED: 'सर्वेक्षण स्वीकृत',
      QUOTED: 'कोटेशन दिया गया',
      WON: 'सफल',
      LOST: 'खोया हुआ',
      DISQUALIFIED: 'अयोग्य',
      PENDING_ADVANCE: 'अग्रिम भुगतान बाकी',
      CONFIRMED: 'ऑर्डर कन्फर्म',
      READY_TO_DISPATCH: 'डिस्पैच के लिए तैयार',
      DISPATCHED: 'डिस्पैच किया गया',
      DELIVERED: 'वितरित',
      INSTALLED: 'स्थापित',
      CLOSED: 'समाप्त',
    },
    systemTypes: {
      ON_GRID: 'ऑन-ग्रिड सोलर',
      OFF_GRID: 'ऑफ-ग्रिड सोलर',
      HYBRID: 'हाइब्रिड सोलर',
    },
    actions: {
      save: 'सहेजें',
      cancel: 'रद्द करें',
      confirm: 'पुष्टि करें',
      submit: 'जमा करें',
      approve: 'स्वीकार करें',
      reject: 'अस्वीकार करें',
      reopen: 'पुनः खोलें',
      downloadPdf: 'पीडीएफ डाउनलोड करें',
      viewPortal: 'पोर्टल देखें',
    },
    common: {
      capacity: 'क्षमता',
      annualGeneration: 'वार्षिक उत्पादन',
      annualSavings: 'वार्षिक बचत',
      estimatedPayback: 'अनुमानित पेबैक',
      warranty: 'वारंटी',
      active: 'सक्रिय',
      expired: 'समाप्त',
      totalCost: 'कुल लागत',
      advanceRequired: 'आवश्यक अग्रिम (30%)',
    },
  },
} as const;

export function t(keyPath: string, locale: Locale = DEFAULT_LOCALE): string {
  const parts = keyPath.split('.');
  let current: any = translations[locale] || translations.en;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      // Fallback to English
      let fallback: any = translations.en;
      for (const p of parts) {
        if (fallback && typeof fallback === 'object' && p in fallback) {
          fallback = fallback[p];
        } else {
          return keyPath;
        }
      }
      return typeof fallback === 'string' ? fallback : keyPath;
    }
  }
  return typeof current === 'string' ? current : keyPath;
}

