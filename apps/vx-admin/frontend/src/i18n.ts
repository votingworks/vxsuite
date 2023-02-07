import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

void i18n.use(initReactI18next).init({
  // debug: true,
  keySeparator: false,
  lng: 'en-US',
  react: {
    transKeepBasicHtmlNodesFor: ['br', 'strong', 'em', 'span'],
  },
  resources: {},
});

export { i18n };
