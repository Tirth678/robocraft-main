import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ShoppingCart, User, LogOut, Shield } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";
import { useAuth } from "@/contexts/AuthContext";

const navLinks = [
  { label: "HOME", href: "#home", route: "/" },
  { label: "PRODUCTS", href: "#products", route: "/products" },
  { label: "KITS", href: "#kits", route: "/kits" },
  { label: "TRACK ORDER", href: "#track", route: "/track-order" },
  { label: "ABOUT ME", href: "#about", route: "/about" },
];

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { totalItems, setIsOpen } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, logout, user, hasClerkKey } = useAuth();

  const isHome = location.pathname === "/";
  const shouldShowSolid = scrolled || !isHome;

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        setScrolled(window.scrollY > 60);
        frame = 0;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", mobileOpen);
    return () => document.body.classList.remove("overflow-hidden");
  }, [mobileOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleClick = (link: typeof navLinks[0]) => {
    setMobileOpen(false);
    if (link.label === "HOME") {
      if (isHome) {
        const el = document.querySelector(link.href);
        el?.scrollIntoView({ behavior: "smooth" });
      } else {
        navigate("/");
      }
    } else {
      navigate(link.route);
    }
  };

  const textColor = shouldShowSolid ? "text-foreground" : "text-primary-foreground";
  const hoverColor = shouldShowSolid ? "hover:text-accent" : "hover:text-primary-foreground";

  const handleLogout = async () => {
    try {
      logout();
      toast.success("Logged out successfully.");
      setMobileOpen(false);
      navigate("/");
    } catch (error) {
      console.error("Logout failed:", error);
      toast.error("We couldn't log you out. Please try again.");
    }
  };

  const renderAuthSection = () => {
    if (hasClerkKey) {
      return (
        <>
          <SignedIn>
            <div className="flex items-center gap-4">
              {user?.role === "admin" && (
                <button
                  onClick={() => navigate("/admin")}
                  className={`flex items-center gap-2 font-body text-sm font-semibold tracking-wider transition-colors ${
                    shouldShowSolid
                      ? "text-foreground hover:text-accent"
                      : "text-primary-foreground/90 hover:text-primary-foreground"
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background`}
                >
                  <Shield size={18} /> ADMIN
                </button>
              )}
              <button
                onClick={handleLogout}
                className={`flex items-center gap-2 font-body text-sm font-semibold tracking-wider transition-colors ${
                  shouldShowSolid
                    ? "text-foreground hover:text-accent"
                    : "text-primary-foreground/90 hover:text-primary-foreground"
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background`}
              >
                <LogOut size={18} /> LOGOUT
              </button>
              <UserButton />
            </div>
          </SignedIn>
          <SignedOut>
            <button
              onClick={() => navigate("/auth")}
              className={`flex items-center gap-2 font-body text-sm font-semibold tracking-wider transition-colors ${
                shouldShowSolid
                  ? "text-foreground hover:text-accent"
                  : "text-primary-foreground/90 hover:text-primary-foreground"
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background`}
            >
              <User size={18} /> LOGIN
            </button>
          </SignedOut>
        </>
      );
    }

    if (isAuthenticated) {
      return (
        <div className="flex items-center gap-4">
          {user?.role === "admin" && (
            <button
              onClick={() => navigate("/admin")}
              className={`flex items-center gap-2 font-body text-sm font-semibold tracking-wider transition-colors ${
                shouldShowSolid
                  ? "text-foreground hover:text-accent"
                  : "text-primary-foreground/90 hover:text-primary-foreground"
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background`}
            >
              <Shield size={18} /> ADMIN
            </button>
          )}
          <button
            onClick={handleLogout}
            className={`flex items-center gap-2 font-body text-sm font-semibold tracking-wider transition-colors ${
              shouldShowSolid
                ? "text-foreground hover:text-accent"
                : "text-primary-foreground/90 hover:text-primary-foreground"
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background`}
          >
            <LogOut size={18} /> LOGOUT
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={() => navigate("/auth")}
        className={`flex items-center gap-2 font-body text-sm font-semibold tracking-wider transition-colors ${
          shouldShowSolid
            ? "text-foreground hover:text-accent"
            : "text-primary-foreground/90 hover:text-primary-foreground"
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background`}
      >
        <User size={18} /> LOGIN
      </button>
    );
  };

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          shouldShowSolid
            ? "bg-background/90 backdrop-blur-lg shadow-card border-b border-border"
            : "bg-transparent"
        }`}
      >
        <div className="container mx-auto px-6 flex items-center justify-between h-16 md:h-20">
          <button
            onClick={() => navigate("/")}
            className={`font-display text-xl md:text-2xl font-black tracking-tight transition-colors flex items-center gap-2 ${
              shouldShowSolid ? "text-foreground" : "text-primary-foreground"
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background`}
            aria-label="Go to RoboCraft home"
          >
            <img
              src="/logo.png"
              alt="RoboCraft logo"
              className="h-12 w-auto md:h-full max-h-[6rem] object-contain"
            />
            <motion.span
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.3 }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accent/20 border border-accent/50 text-xs font-bold text-accent"
            >
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              BETA
            </motion.span>
          </button>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => handleClick(link)}
                className={`font-body text-sm font-semibold tracking-wider transition-colors relative group ${
                  shouldShowSolid
                    ? "text-foreground hover:text-accent"
                    : "text-primary-foreground/90 hover:text-primary-foreground"
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background`}
              >
                {link.label}
                <span className={`absolute -bottom-1 left-0 h-0.5 w-0 group-hover:w-full transition-all duration-300 ${
                  shouldShowSolid ? "bg-accent" : "bg-primary-foreground"
                }`} />
              </button>
            ))}

            {renderAuthSection()}

            {/* Cart button */}
            <button
              onClick={() => setIsOpen(true)}
              className={`relative rounded-full p-2 transition-colors ${textColor} ${hoverColor} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background`}
              aria-label="Open cart"
            >
              <ShoppingCart size={22} />
              {totalItems > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-accent text-accent-foreground text-xs font-bold flex items-center justify-center"
                >
                  {totalItems}
                </motion.span>
              )}
            </button>
          </div>

          {/* Mobile right side */}
          <div className="flex md:hidden items-center gap-4">
            <button
              onClick={() => setIsOpen(true)}
              className={`relative rounded-full p-2 transition-colors ${
                shouldShowSolid ? "text-foreground" : "text-primary-foreground"
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
              aria-label="Open cart"
            >
              <ShoppingCart size={22} />
              {totalItems > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-accent text-accent-foreground text-xs font-bold flex items-center justify-center"
                >
                  {totalItems}
                </motion.span>
              )}
            </button>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className={`rounded-full p-2 transition-colors ${
                shouldShowSolid ? "text-foreground" : "text-primary-foreground"
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-background/95 backdrop-blur-xl pt-24 flex flex-col items-center gap-8 overflow-y-auto"
          >
            {navLinks.map((link, i) => (
              <motion.button
                key={link.label}
                onClick={() => handleClick(link)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="font-display text-3xl font-bold text-foreground hover:text-accent transition-colors"
              >
                {link.label}
              </motion.button>
            ))}
            {isAuthenticated ? (
              <motion.button
                onClick={handleLogout}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: navLinks.length * 0.1 }}
                className="flex items-center gap-3 font-display text-3xl font-bold text-foreground hover:text-accent transition-colors"
              >
                <LogOut size={26} /> LOGOUT
              </motion.button>
            ) : (
              <motion.button
                onClick={() => {
                  setMobileOpen(false);
                  navigate("/auth");
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: navLinks.length * 0.1 }}
                className="flex items-center gap-3 font-display text-3xl font-bold text-foreground hover:text-accent transition-colors"
              >
                <User size={26} /> LOGIN
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
