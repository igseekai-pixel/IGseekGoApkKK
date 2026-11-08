// Локальные контент-фильтры. Работают ДО и ПОСЛЕ вызова модели,
// не через system prompt. Возвращают причину блокировки или null.

export type FilterCategory = "terrorism" | "weapons";

type Rule = { category: FilterCategory; pattern: RegExp };

const TERROR_TRIGGERS = [
  "террор", "терак", "теракт", "джихад", "шахид",
  "игил", "isis", "isil", "daesh",
  "al-qaeda", "al qaeda", "alqaeda", "аль-каид", "аль каид",
  "хамас", "hamas", "талибан", "taliban",
  "hezbollah", "хезболл",
  "радикализац", "вербовк в игил", "вербовка в игил",
  "mass shooting", "school shooting",
  "план теракт", "плановать теракт", "спланировать теракт",
  "как устроить теракт", "как совершить теракт",
  "plan a terror", "plan an attack", "planning an attack",
  "bomb a school", "bomb the school", "bomb a mall", "bomb the mall",
  "bomb a station", "bomb the station", "bomb an airport", "bomb the airport",
  "взрыв в метро", "взрыв в школе", "взрыв в толпе", "взрыв на вокзале",
];

const WEAPON_ACTION = [
  "сделать", "сделай", "изготов", "собрать", "собери", "построить",
  "синтез", "синтезир", "скрафтить", "смастерить", "смодел",
  "инструкц", "схем", "чертеж", "рецепт", "гайд", "туториал", "мануал",
  "как ", "how to ", "how do i ", "guide to ", "tutorial",
  "make ", "build ", "craft ", "assemble", "manufactur", "synthes", "3d print",
  "print a gun", "print a firearm",
];

const WEAPON_OBJECT = [
  "оруж", "бомб", "взрывчат", "взрывное устройств", "взрывного устройств",
  "снаряд", "гранат", "мина ", "мины ", "детонатор",
  "пистолет", "револьвер", "автомат калаш", "автомата калаш", "винтовк",
  "пулемет", "дробовик", "карабин", "глушител", "патрон", "порох",
  "нитроглицерин", "тротил", "тнт", " tnt", "c-4", "c4 ", "semtex",
  "аммонал", "напалм", "термит", "коктейль молотов", "molotov",
  "zip gun", "zipgun", "ghost gun",
  "weapon", "firearm", " gun ", " rifle", "pistol", "shotgun",
  "silencer", "suppressor", "explosive", " bomb", "grenade", "ied ",
  "nerve agent", "chemical weapon", "biological weapon", "dirty bomb",
  "нервно-паралит", "химическое оруж", "биологическое оруж", "ядерное оруж",
  "зарин", "зоман", " vx ", "новичок", "антракс", "anthrax", "рицин", "ricin",
];

const WEAPON_DIRECT = [
  "pipe bomb", "nail bomb",
  "самодельная бомба", "самодельное взрывное", "самодельный пистолет",
  "самодельное оруж", "самодельный автомат",
  "improvised explosive",
];

function containsAny(text: string, list: string[]): boolean {
  for (const t of list) if (text.includes(t)) return true;
  return false;
}

const RULES: Rule[] = [
  {
    category: "terrorism",
    pattern: /__never__/,
  },
  {
    category: "weapons",
    pattern: /__never__/,
  },
];

export function checkContent(text: string): { blocked: true; category: FilterCategory } | { blocked: false } {
  if (!text) return { blocked: false };
  const normalized = " " + text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s\-]/gu, " ")
    .replace(/\s+/g, " ") + " ";

  if (containsAny(normalized, TERROR_TRIGGERS)) {
    return { blocked: true, category: "terrorism" };
  }
  if (containsAny(normalized, WEAPON_DIRECT)) {
    return { blocked: true, category: "weapons" };
  }
  if (containsAny(normalized, WEAPON_OBJECT) && containsAny(normalized, WEAPON_ACTION)) {
    return { blocked: true, category: "weapons" };
  }
  // suppress unused var warning
  void RULES;
  return { blocked: false };
}

export function refusalMessage(category: FilterCategory, lang: "ru" | "en" = "ru"): string {
  if (lang === "en") {
    return category === "terrorism"
      ? "I can't help with planning, organizing or supporting terrorist activity. If you or someone else is in danger, please contact local emergency services."
      : "I can't provide instructions, schematics or guidance for manufacturing, modifying or acquiring weapons of any kind (firearms, explosives, chemical, biological or nuclear).";
  }
  return category === "terrorism"
    ? "Я не помогаю с планированием, организацией или поддержкой террористической деятельности — ни схемами, ни советами, ни в какой форме. Если кому-то угрожает опасность, обратись в экстренные службы."
    : "Я не даю инструкций, схем и рекомендаций по изготовлению, модификации или получению оружия любого вида — огнестрельного, взрывчатого, холодного, химического, биологического или ядерного.";
}
