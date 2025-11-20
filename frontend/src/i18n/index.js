import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en/common.json";
import tl from "./tl/common.json";

const saved = localStorage.getItem("hmh_lang") || "en";

i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, tl: { translation: tl } },
    lng: saved,             // << start from saved language
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

export default i18n;