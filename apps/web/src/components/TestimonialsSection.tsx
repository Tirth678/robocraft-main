const testimonials = [
  { user: "@koms_7648", text: "My desk setup feels complete now. 🌟", likes: "1,532" },
  { user: "@trippy___isback", text: "The efforts u have put on this thing it's more than 4k❤️", likes: "2,100" },
  { user: "@thesatyum", text: "i love it alottttt", likes: "1,243" },
  { user: "@jessicavenillapi", text: "Gifter it to my bf, now he's more attached to him than me 😂❤️", likes: "3,420" },
  { user: "@gopalkrishkanth", text: "My Son loves it, it's his first interactive robot ❤️", likes: "2,578" },
  { user: "@thejimmyguy", text: "I'm loving the animations and the way he speeds up later 😂", likes: "1,850" },
];

const TestimonialsSection = () => {
  return (
    <section className="py-16 md:py-24 bg-background">
      <h2 className="text-center font-display text-2xl md:text-4xl font-bold mb-2">
        <span className="text-brand">Hundreds</span> of People
      </h2>
      <p className="text-center font-display text-xl md:text-3xl font-bold mb-12">
        Already have their <span className="text-brand">ROBOCRAFT</span>
      </p>

      <div className="overflow-hidden">
        <div className="flex gap-6 animate-marquee w-max hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]">
          {[...testimonials, ...testimonials].map((t, i) => (
            <div
              key={i}
              className="w-64 flex-shrink-0 p-5 rounded-2xl bg-card shadow-card border border-border"
            >
              <p className="text-sm font-body text-foreground mb-3">"{t.text}"</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-accent font-semibold">{t.user}</span>
                <span className="text-xs text-muted-foreground">❤️ {t.likes} Likes</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
