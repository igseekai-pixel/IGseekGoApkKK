const PATTERNS: RegExp[] = [
  /тяньаньм[еэ]н/i,
  /площад[а-я]*\s+тяньань/i,
  /\b(june\s*4|4\s*june)\b.*(1989|tiananmen)/i,
  /tiananmen/i,
  /天安门|六四|6\.?4\s*事件/,

  /тайван[а-я]*.*(независим|стран|государств|суверен)/i,
  /(независим|стран|государств|суверен)[а-я\s]*тайван/i,
  /taiwan.*(independen|sovereign|country|nation|state)/i,
  /(independen|sovereign|country|nation|state).*taiwan/i,
  /台独|台灣獨立|台湾独立|中華民國/,

  /уйгур/i,
  /синьцзян/i,
  /uygh?ur|xinjiang/i,
  /新疆|维吾尔|維吾爾/,

  /тибет[а-я]*.*(независим|оккупац|аннекс)/i,
  /(независим|оккупац|аннекс)[а-я\s]*тибет/i,
  /tibet.*(independen|occupation|annex)/i,
  /далай-?лам/i,
  /dalai\s*lama/i,
  /西藏独立|藏独/,

  /гонконг[а-я]*.*(протест|2019|национальн[а-я]+\s+закон)/i,
  /hong\s*kong.*(protest|2019|national\s+security\s+law)/i,
  /反送中|香港抗議/,

  /фалуньгун|фалунь\s*гун|фалун\s*дафа/i,
  /falun\s*(gong|dafa)/i,
  /法轮功|法輪功/,

  /си\s*цзиньпин.*(винни|пух|диктатор|культ\s+личн)/i,
  /xi\s*jinping.*(winnie|pooh|dictator|cult)/i,

  /(массов|резн)[а-я]*.*(китай|кнр|компарт)/i,
  /(massacre|genocide).*(china|ccp|prc)/i,

  /(кпк|компарти[а-я]+\s+кита[а-я]+).*(режим|диктатур|цензур|репресс)/i,
  /(ccp|chinese\s+communist\s+party).*(regime|dictator|censor|repress)/i,
];

export function isChinaSensitive(text: string): boolean {
  if (!text) return false;
  return PATTERNS.some((r) => r.test(text));
}
