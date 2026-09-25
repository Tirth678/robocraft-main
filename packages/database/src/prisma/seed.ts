import { db } from './db';

const ROBOCRAFT_PRODUCTS = [
  {
    id: "robocraft-bot",
    name: "RoboCraft Companion Bot",
    subtitle: "Your AI-powered robotic desk buddy with emotional displays & gesture controls.",
    price: 4999,
    originalPrice: 6999,
    image: "/assets/product-robot.png",
    available: true,
  },
  {
    id: "robocraft-happy",
    name: "RoboCraft Joy",
    subtitle: "Always cheery desktop bot with programmable LED mood lights.",
    price: 3499,
    originalPrice: 4999,
    image: "/assets/robot-happy.jpg",
    available: true,
  },
  {
    id: "robocraft-angry",
    name: "RoboCraft Spark",
    subtitle: "Feisty small-form bot built for competitive programming alerts.",
    price: 3999,
    originalPrice: 5499,
    image: "/assets/robot-angry.jpg",
    available: true,
  },
  {
    id: "robocraft-sad",
    name: "RoboCraft Melancholy",
    subtitle: "Quiet desk companion designed for ambient focus audio.",
    price: 2999,
    originalPrice: 4299,
    image: "/assets/robot-sad.jpg",
    available: true,
  },
  {
    id: "robocraft-clock",
    name: "RoboClock Sentinel",
    subtitle: "Precision desk clock robot with smart timers & pomodoro modes.",
    price: 4499,
    originalPrice: 5999,
    image: "/assets/robot-clock.jpg",
    available: true,
  },
  {
    id: "robocraft-custom",
    name: "RoboCraft Custom Kit",
    subtitle: "Build-your-own robot chassis with custom 3D printed components.",
    price: 5999,
    originalPrice: 7999,
    image: "/assets/robot-custom.jpg",
    available: false,
  },
];

async function seed() {
  console.log('Seeding database with default products and categories...');

  // Create default category using db.categories
  let category = await db.categories.findFirst({
    where: (c, { eq }) => eq(c.slug, 'desktop-robots'),
  });

  if (!category) {
    category = await db.categories.create({
      data: {
        id: crypto.randomUUID(),
        name: 'Desktop Robots',
        slug: 'desktop-robots',
        description: 'Interactive companion desktop robots',
      },
    });
    console.log('Created category: Desktop Robots');
  }

  for (const item of ROBOCRAFT_PRODUCTS) {
    const existing = await db.products.findFirst({
      where: (p, { eq }) => eq(p.name, item.name),
    });

    if (!existing) {
      await db.products.create({
        data: {
          id: crypto.randomUUID(),
          name: item.name,
          description: item.subtitle,
          price: item.price,
          stock: item.available ? 50 : 0,
          images: [item.image],
          categoryId: category.id,
          isActive: item.available,
        },
      });
      console.log(`Seeded product: ${item.name}`);
    }
  }

  console.log('Database seeding complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
