import { useEffect } from "react";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ProductSection from "@/components/ProductSection";
import WhySpecialSection from "@/components/WhySpecialSection";
import DescriptionSection from "@/components/DescriptionSection";
import CreativitySection from "@/components/CreativitySection";
import RoboLinkSection from "@/components/RoboLinkSection";
import ExperienceSection from "@/components/ExperienceSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import BottomCTASection from "@/components/BottomCTASection";
import ComingSoonSection from "@/components/ComingSoonSection";
import BetaFeedbackSection from "@/components/BetaFeedbackSection";
import FooterSection from "@/components/FooterSection";

const Index = () => {
  useEffect(() => {
    document.title = "RoboCraft Studio - Your Tiny Desk Companion";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        "Welcome to RoboCraft Studio. Design, customize and buy your own tiny desk companion robot featuring 40+ expressions, 5 moods, Pomodoro timer, clock mode and desktop widgets."
      );
    }
  }, []);

  return (
    <div className="min-h-screen scroll-smooth">
      <Navbar />
      <HeroSection />
      <ProductSection />
      <WhySpecialSection />
      <DescriptionSection />
      <CreativitySection />
      <RoboLinkSection />
      <ExperienceSection />
      <TestimonialsSection />
      <BottomCTASection />
      <ComingSoonSection />
      <BetaFeedbackSection />
      <FooterSection />
    </div>
  );
};

export default Index;
