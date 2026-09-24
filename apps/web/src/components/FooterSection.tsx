const FooterSection = () => {
  return (
    <footer className="bg-primary text-primary-foreground py-12">
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h3 className="font-display text-lg font-bold mb-4">Contact</h3>
          <p className="font-body text-sm text-primary-foreground/70">
            Email: <a href="mailto:support@robocraft.com" className="underline">support@robocraft.com</a>
          </p>
          <p className="font-body text-sm text-primary-foreground/70 mt-1">
            We aim to reply within 24 hours on weekdays.
          </p>
        </div>

        <div>
          <h3 className="font-display text-lg font-bold mb-4">Company</h3>
          <ul className="space-y-2 font-body text-sm text-primary-foreground/70">
            <li><a href="#" className="hover:text-primary-foreground transition-colors">About Us</a></li>
            <li><a href="#" className="hover:text-primary-foreground transition-colors">FAQ's</a></li>
            <li><a href="#" className="hover:text-primary-foreground transition-colors">Product</a></li>
          </ul>
        </div>

        <div>
          <h3 className="font-display text-lg font-bold mb-4">Legal</h3>
          <ul className="space-y-2 font-body text-sm text-primary-foreground/70">
            <li><a href="#" className="hover:text-primary-foreground transition-colors">Terms & Conditions</a></li>
            <li><a href="#" className="hover:text-primary-foreground transition-colors">Privacy Policy</a></li>
            <li><a href="#" className="hover:text-primary-foreground transition-colors">Refund Policy</a></li>
            <li><a href="#" className="hover:text-primary-foreground transition-colors">Shipping Policy</a></li>
          </ul>
        </div>
      </div>

      <div className="container mx-auto px-4 mt-10 pt-6 border-t border-primary-foreground/20 text-center">
        <h2 className="font-display text-3xl font-black">ROBOCRAFT</h2>
        <p className="font-body text-xs text-primary-foreground/50 mt-2">
          TM 2025 RoboCraft. All rights Reserved
        </p>
      </div>
    </footer>
  );
};

export default FooterSection;
