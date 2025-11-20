// this is the landing page for HearMyHeart
// updated 11/14/2025
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import redPanda from "../assets/red-panda.png";
import hmhIconBlue from "../assets/hmh_icon_blue.png";
import hmhIcon from "../assets/hmh_icon.png";
// topic images
import lettersImg from "../assets/letters.png";
import wordsImg from "../assets/words.png";
import sentencesImg from "../assets/sentences.png";
import speechImg from "../assets/speech.png";
import emotionImg from "../assets/emotion.png";


import {
  Footer,
  FooterBrand,
  FooterCopyright,
  FooterDivider,
  FooterLink,
  FooterLinkGroup,
  FooterTitle,
  FooterIcon,
} from "flowbite-react";


import {
  BsDribbble,
  BsFacebook,
  BsGithub,
  BsInstagram,
  BsTwitter,
  BsList,
} from "react-icons/bs";


// ----------- Custom hook to detect screen size ----------
function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [breakpoint]);
  return isMobile;
}


// ----------------- Custom CSS fix -----------------
const customStyle = `
@media (max-width: 425px) {
  .emotion-mobile-fix, .speech-mobile-fix {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .emotion-mobile-fix h1, .emotion-mobile-fix p,
  .speech-mobile-fix h1, .speech-mobile-fix p {
    margin-left: auto;
    margin-right: auto;
  }
}
`;


export default function LandingPage() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);


  return (
    <div className="min-h-screen w-full bg-[#E9F1FF] text-[#1A1A1A] relative overflow-hidden">
      <style>{customStyle}</style>


      {/* Decorative clouds and leaves */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <svg className="absolute -top-6 left-4 w-44 h-24 animate-float opacity-90" viewBox="0 0 200 100" fill="white">
          <ellipse cx="60" cy="60" rx="60" ry="30" />
          <ellipse cx="120" cy="50" rx="50" ry="25" />
        </svg>
        <svg className="absolute top-24 right-6 w-40 h-24 animate-float-slow opacity-80" viewBox="0 0 200 100" fill="white">
          <ellipse cx="80" cy="50" rx="50" ry="22" />
          <ellipse cx="140" cy="60" rx="40" ry="18" />
        </svg>
        <svg className="absolute top-10 right-1/3 h-6 w-6 animate-leaf" viewBox="0 0 24 24" fill="#6CCB5F">
          <path d="M12 2c5 3 8 7 8 10 0 5-4 9-8 9S4 17 4 12C4 9 7 5 12 2Z" />
        </svg>
        <svg className="absolute top-1/3 left-10 h-5 w-5 animate-leaf-slow" viewBox="0 0 24 24" fill="#86D97B">
          <path d="M12 2c5 3 8 7 8 10 0 5-4 9-8 9S4 17 4 12C4 9 7 5 12 2Z" />
        </svg>
      </div>


      {/* Navbar */}
      <header className="mb-5 mx-auto w-full max-w-6xl px-4 sm:px-6 md:px-8 py-3 md:py-4">
        <div className="flex items-center justify-between px-3 py-2 md:px-5 md:py-3">
          {/* Logo and text */}
          <div className="flex items-center gap-2">
            <img
              src={hmhIconBlue}
              alt="HearMyHeart Icon"
              className="w-auto h-12 object-contain"
            />
            <span className="text-3xl font-bold text-[#2E4BFF]">
              HearMyHeart
            </span>
          </div>


          {/* Nav links */}
          {isMobile ? (
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-md hover:bg-gray-200 transition"
          >
            <BsList size={26} />
          </button>


          {/* ✅ Smooth + full-width dropdown */}
          <div
            className={`fixed top-[80px] left-0 w-full bg-white shadow-lg overflow-hidden z-50 transition-all duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1.05)] ${
              menuOpen ? "max-h-72 opacity-100 py-4" : "max-h-0 opacity-0 py-0"
            }`}
          >
            <div className="flex flex-col gap-3 px-6 transition-opacity duration-500 ease-in-out">
              <Link to="/" className="hover:text-[#2E4BFF]">Home</Link>
              <a href="#about" className="hover:text-[#2E4BFF]">About</a>
              <a href="#contact" className="hover:text-[#2E4BFF]">Contact Us</a>
              <Link
                to="/login"
                className="btn-primary inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold shadow-[0_4px_0_#D9A73A] bg-[#FFC84A] hover:brightness-105 active:translate-y-[1px] active:shadow-[0_3px_0_#D9A73A] transition-transform"
              >
                {t("cta_login")}
              </Link>
            </div>
          </div>
        </div>


          ) : (
            <nav className="flex items-center gap-6 text-md font-medium">
              <Link to="/" className="hover:text-[#2E4BFF]">Home</Link>
              <a href="#about" className="hover:text-[#2E4BFF]">About</a>
              <a href="#contact" className="hover:text-[#2E4BFF]">Contact Us</a>
              <Link
                to="/login"
                className="btn-primary inline-flex items-center justify-center rounded-xl px-4 py-2 text-md font-semibold shadow-[0_4px_0_#D9A73A] bg-[#FFC84A] hover:brightness-105 active:translate-y-[1px] active:shadow-[0_3px_0_#D9A73A] transition-transform"
              >
                {t("cta_login")}
              </Link>
            </nav>
          )}
        </div>
      </header>


      <div
        className="w-full border-b border-gray-300 mt-[-25px]"
        style={{ boxShadow: "0px 2px 6px rgba(0,0,0,0.3)" }}
      ></div>


      {/* Hero Section */}
      <section
        className={`mb-20 mt-8 mx-auto grid w-full max-w-5xl gap-8 px-4 sm:px-6 md:px-8 py-8 sm:py-10 md:py-16 ${
          isMobile ? "grid-cols-1 text-center" : "lg:grid-cols-2 text-left"
        }`}
      >
        <div
          className={`order-2 lg:order-1 flex flex-col justify-center ${
            isMobile ? "items-center" : ""
          }`}
        >
          <h1 className="font-semibold leading-tight text-2xl sm:text-4xl text-[#2E4BFF]">
            Because every smile,
          </h1>
          <h1 className="font-semibold leading-tight text-2xl sm:text-4xl text-[#2E4BFF]">
            tells a story.
          </h1>
          <p
            className={`mt-3 max-w-prose text-base text-[#3B3B3B] ${
              isMobile ? "mx-auto" : ""
            }`}
          >
            HearMyHeart is an AI-powered platform that nurtures the speech and
            emotional growth of children with autism. Through fun, interactive
            exercises, it creates a safe and encouraging space for learning and
            self-expression.
          </p>
          <div className="mt-6">
            <Link
              to="/login"
              className="btn-primary inline-flex items-center justify-center rounded-xl px-5 py-3 text-base font-semibold shadow-[0_5px_0_#D9A73A] bg-[#FFC84A] hover:brightness-105 active:translate-y-[1px] active:shadow-[0_4px_0_#D9A73A] transition-transform"
            >
              Get Started
            </Link>
          </div>
        </div>


        <div className="order-1 lg:order-2 flex justify-center items-center">
          <img
            src={redPanda}
            alt="HMH mascot"
            className="w-[100%] max-w-[420px] h-auto object-contain rounded-2xl"
          />
        </div>
      </section>


      {/* Secondary Band */}
      <section className="mb-10 relative py-20 bg-white text-center">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-[#2E4BFF] relative inline-block">
          Empowering voices. Connecting hearts. Inspiring growth.
          <span className="absolute left-1/2 -bottom-8 h-1 w-5/6 -translate-x-1/2 bg-[#FFC84A] rounded-full"></span>
        </h2>
      </section>


      {/* Speech Recognition */}
      <section className="mb-10 mx-auto w-full max-w-5xl px-4 sm:px-6 md:px-8 py-10 grid grid-cols-1 md:grid-cols-2 gap-6 items-center speech-mobile-fix">
        <div className="flex justify-center md:justify-start mb-4 md:mb-0">
          <div className="rounded-3xl bg-white/80 p-3 flex justify-center shadow-[4px_4px_15px_rgba(0,0,0,0.2)] transition-transform duration-300 hover:scale-105 hover:shadow-lg">
            <img
              src={speechImg}
              alt="Speech Recognition"
              className="w-[80%] max-w-[320px] h-auto object-contain rounded-2xl"
            />
          </div>
        </div>
        <div className="flex flex-col justify-center md:text-left">
          <h1 className="text-3xl font-semibold text-[#2E4BFF] mb-4 px-4 py-1 rounded-full bg-[#FFC84A] inline-flex items-center justify-center shadow-sm w-max">
            Speech Recognition
          </h1>
          <p className="text-[#3B3B3B] text-lg max-w-prose">
            HearMyHeart uses advanced speech recognition to help children
            practice pronunciation, improve articulation, and gain confidence in
            verbal communication through interactive exercises.
          </p>
        </div>
      </section>


      {/* Emotion Recognition */}
      <section className="w-full py-20">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center emotion-mobile-fix">
            <div className="flex justify-center md:order-2">
              <div className="rounded-3xl bg-white p-3 mb-1 flex justify-center shadow-[8px_8px_15px_rgba(0,0,0,0.2)] transition-transform duration-300 hover:scale-105">
                <img
                  src={emotionImg}
                  alt="Emotion Recognition"
                  className="w-[80%] max-w-[320px] h-auto object-contain rounded-2xl"
                />
              </div>
            </div>
            <div className="flex flex-col justify-center md:order-1 md:text-left">
              <h1 className="text-3xl font-semibold text-[#2E4BFF] mb-4 px-4 py-1 rounded-full bg-[#FFC84A] shadow-sm w-max">
                Emotion Recognition
              </h1>
              <p className="text-[#3B3B3B] text-lg max-w-prose">
                HearMyHeart features emotion recognition to teach children to
                identify and express emotions, improving emotional understanding
                in a supportive, game-like environment.
              </p>
            </div>
          </div>
        </div>
      </section>


      {/* Topics Section */}
      <section className="w-full bg-white">
        <section className="mx-auto w-full max-w-5xl px-4 sm:px-6 md:px-8 pt-10 pb-20 mt-10 text-center">
          <h3 className="mb-10 text-2xl sm:text-3xl font-bold text-[#1F2F6B]">
            Topics
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
            {[
              { title: "Letters", img: lettersImg, desc: "Learn the alphabet with fun and interactive activities." },
              { title: "Words", img: wordsImg, desc: "Practice building and pronouncing words to enhance communication skills." },
              { title: "Sentences", img: sentencesImg, desc: "Form simple sentences to improve language fluency and expression." },
            ].map((item) => (
              <article
                key={item.title}
                className="rounded-3xl bg-[#E9F1FF] shadow-md p-6 text-center transition-transform hover:scale-105 hover:shadow-xl duration-300"
              >
                <div className="w-full relative pb-[75%] rounded-2xl overflow-hidden mb-2">
                  <img
                    src={item.img}
                    alt={item.title}
                    className="absolute top-0 left-0 w-full h-full object-cover object-center"
                  />
                </div>
                <h4 className="text-xl font-semibold text-[#2E4BFF] mb-2">{item.title}</h4>
                <p className="text-sm text-[#3B3B3B]">{item.desc}</p>
              </article>
            ))}
          </div>
        </section>
      </section>


      {/* Footer */}
      <Footer container className="bg-[#D7E6FF] rounded-none">
        <div className="w-full">
          <div className="flex flex-col items-center text-center lg:flex-row lg:items-start lg:justify-between lg:text-left">
            <div className="mb-4 lg:mb-0">
              <FooterBrand href="*" src={hmhIcon} alt="HMH Logo" name="HearMyHeart" className="w-full h-auto" />
            </div>
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-6 w-fit lg:mx-0 lg:ml-auto">
              <div className="text-center">
                <FooterTitle title="About" />
                <FooterLinkGroup col>
                  <FooterLink href="#">Our Mission</FooterLink>
                  <FooterLink href="#">Team</FooterLink>
                </FooterLinkGroup>
              </div>
              <div className="text-center">
                <FooterTitle title="Resources" />
                <FooterLinkGroup col>
                  <FooterLink href="https://tailwindcss.com/" target="_blank">
                    Tailwind CSS
                  </FooterLink>
                  <FooterLink href="https://www.flaticon.com/" target="_blank">
                    Flaticon
                  </FooterLink>
                </FooterLinkGroup>
              </div>
              <div className="text-center">
                <FooterTitle title="Legal" />
                <FooterLinkGroup col>
                  <FooterLink href="#">Privacy Policy</FooterLink>
                  <FooterLink href="#">Terms &amp; Conditions</FooterLink>
                </FooterLinkGroup>
              </div>
            </div>
          </div>
          <FooterDivider />
          <div className="w-full sm:flex sm:items-center sm:justify-between">
            <FooterCopyright href="#" by="HearMyHeart™" year={new Date().getFullYear()} />
            <div className="mt-4 flex space-x-6 sm:mt-0 sm:justify-center">
              <FooterIcon href="#" icon={BsFacebook} />
              <FooterIcon href="#" icon={BsInstagram} />
              <FooterIcon href="#" icon={BsTwitter} />
              <FooterIcon href="#" icon={BsGithub} />
              <FooterIcon href="#" icon={BsDribbble} />
            </div>
          </div>
        </div>
      </Footer>
    </div>
  );
}







