import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function Navbar() {
  const { t } = useTranslation();
  return (
    <nav className="sticky top-0 z-20 bg-beige border-b border-green/10">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
        <div className="text-xl font-extrabold text-green">{t("app_name")}</div>
        <div className="space-x-6 text-green">
          <a href="#home" className="hover:underline">{t("home")}</a>
          <a href="#about" className="hover:underline">{t("about")}</a>
          <a href="#features" className="hover:underline">{t("features")}</a>
          <Link to="/login" className="btn-primary">{t("login")}</Link>
        </div>
      </div>
    </nav>
  );
}
