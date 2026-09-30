// The PD2 filter language, described once. Every keyword here drives autocomplete, hover docs,
// the Codex, linting, plain-English explanations and the evaluator's list of known codes.
// Sources: wiki.projectdiablo2.com/wiki/Item_Filtering and Project-Diablo-2/BH ItemDisplay.cpp.

export type CondKind = "flag" | "value" | "param" | "logic";
export type OutKind = "color" | "value" | "notify" | "special";

export interface CondKeyword {
  code: string;
  alt?: string[];
  kind: CondKind;
  cat: string;
  label: string;
  desc: string;
  range?: string;
  example?: string;
  /** Depends on the viewer (character, location, level) rather than the item itself. */
  mutable?: boolean;
  /** Present in PD2's engine source but not on the wiki. */
  undocumented?: boolean;
  /** Can also be printed in output as %CODE%. */
  printable?: boolean;
}

export interface OutKeyword {
  code: string;
  kind: OutKind;
  cat: string;
  label: string;
  desc: string;
  example?: string;
  /** Parameterised as %CODE-xx%. */
  param?: "hex" | "int" | "tier" | "notify";
  undocumented?: boolean;
  hex?: string;
}

const flag = (cat: string, code: string, label: string, desc: string, extra: Partial<CondKeyword> = {}): CondKeyword => ({ code, kind: "flag", cat, label, desc, ...extra });
const value = (cat: string, code: string, label: string, desc: string, extra: Partial<CondKeyword> = {}): CondKeyword => ({ code, kind: "value", cat, label, desc, printable: true, ...extra });

export const COND_CATEGORIES = [
  "Logic",
  "Rarity",
  "Tier",
  "Properties",
  "Item groups",
  "Armor",
  "Weapons",
  "Class items",
  "Character",
  "Location",
  "Item info",
  "Requirements & base",
  "Attributes",
  "Skills",
  "Stats",
  "Affixes",
  "Maps & zones",
  "Filter",
] as const;

export const CONDITIONS: CondKeyword[] = [
  // Logic
  { code: "AND", kind: "logic", cat: "Logic", label: "And", desc: "Both sides must be true. Implied when two conditions sit next to each other. PD2 gives AND and OR the same priority and reads left-to-right, so wrap OR groups in parentheses." },
  { code: "OR", kind: "logic", cat: "Logic", label: "Or", desc: "Either side may be true. PD2 reads AND/OR left-to-right with equal priority: A OR B C means (A OR B) AND C." },
  { code: "!", kind: "logic", cat: "Logic", label: "Not", desc: "Negates the condition or parenthesised group that follows it.", example: "!ETH" },
  { code: "TRUE", kind: "flag", cat: "Logic", label: "Always true", desc: "Always matches. Handy as an alias value for on/off switches.", example: "Alias[SHOW_SUPS]: TRUE" },
  { code: "FALSE", kind: "flag", cat: "Logic", label: "Always false", desc: "Never matches. Handy as an alias value for on/off switches." },

  // Rarity
  flag("Rarity", "NMAG", "Normal quality", "Non-magic items (inferior, normal, superior) and most non-equipment items."),
  flag("Rarity", "MAG", "Magic", "Magic (blue) items."),
  flag("Rarity", "RARE", "Rare", "Rare (yellow) items."),
  flag("Rarity", "SET", "Set", "Set (green) items."),
  flag("Rarity", "UNI", "Unique", "Unique (gold) items."),
  flag("Rarity", "CRAFT", "Crafted", "Crafted (orange) items."),

  // Tier
  flag("Tier", "NORM", "Normal tier", "Normal-tier bases, e.g. Cap."),
  flag("Tier", "EXC", "Exceptional", "Exceptional-tier bases, e.g. War Hat."),
  flag("Tier", "ELT", "Elite", "Elite-tier bases, e.g. Shako."),

  // Properties
  flag("Properties", "ID", "Identified", "The item is identified."),
  flag("Properties", "INF", "Inferior", "Low quality: Crude, Cracked, Damaged, Low Quality."),
  flag("Properties", "SUP", "Superior", "Superior quality."),
  flag("Properties", "ETH", "Ethereal", "Ethereal items."),
  flag("Properties", "RW", "Runeword", "A completed runeword."),
  flag("Properties", "GEMMED", "Socketed with something", "Has at least one gem, rune or jewel in its sockets."),
  flag("Properties", "FOOLS", "Fool's mod", "Has the Fool's affix (AR and max damage per character level)."),

  // Item groups
  flag("Item groups", "ARMOR", "Any armor", "All armor, class-restricted armor included."),
  flag("Item groups", "WEAPON", "Any weapon", "All weapons, class-restricted weapons included."),
  flag("Item groups", "JEWELRY", "Jewelry", "Rings and amulets."),
  flag("Item groups", "CHARM", "Charms", "Small, large and grand charms."),
  flag("Item groups", "QUIVER", "Quivers", "Arrows and bolts."),
  flag("Item groups", "MISC", "Misc items", "Items from Misc.txt: potions, gems, runes, keys, maps, quest items and more."),
  flag("Item groups", "CLASS", "Class-restricted", "Any class-specific item."),

  // Armor
  flag("Armor", "HELM", "Helms", "Head items including barbarian helms and druid pelts. Not circlets — those are CIRC.", { alt: ["EQ1"] }),
  flag("Armor", "CHEST", "Body armor", "Chest armor.", { alt: ["EQ2"] }),
  flag("Armor", "SHIELD", "Shields", "All shields, including paladin and necromancer shields.", { alt: ["EQ3"] }),
  flag("Armor", "GLOVES", "Gloves", "Gloves.", { alt: ["EQ4"] }),
  flag("Armor", "BOOTS", "Boots", "Boots.", { alt: ["EQ5"] }),
  flag("Armor", "BELT", "Belts", "Belts.", { alt: ["EQ6"] }),
  flag("Armor", "CIRC", "Circlets", "Circlets, coronets, tiaras and diadems.", { alt: ["EQ7"] }),

  // Weapons
  flag("Weapons", "AXE", "Axes", "Includes throwing axes.", { alt: ["WP1"] }),
  flag("Weapons", "MACE", "Maces", "Clubs, tipped maces and hammers.", { alt: ["WP2"] }),
  flag("Weapons", "CLUB", "Clubs", "Club subtype of maces."),
  flag("Weapons", "TMACE", "Tipped maces", "Tipped-mace subtype of maces."),
  flag("Weapons", "HAMMER", "Hammers", "Hammer subtype of maces."),
  flag("Weapons", "SWORD", "Swords", "Swords.", { alt: ["WP3"] }),
  flag("Weapons", "DAGGER", "Daggers", "Includes throwing knives.", { alt: ["WP4"] }),
  flag("Weapons", "THROWING", "Throwing weapons", "Throwing knives/axes, javelins and throwing potions.", { alt: ["WP5"] }),
  flag("Weapons", "JAV", "Javelins", "Includes Amazon javelins.", { alt: ["WP6"] }),
  flag("Weapons", "SPEAR", "Spears", "Includes Amazon spears. Not javelins — those are JAV.", { alt: ["WP7"] }),
  flag("Weapons", "POLEARM", "Polearms", "Polearms.", { alt: ["WP8"] }),
  flag("Weapons", "BOW", "Bows", "Includes Amazon bows.", { alt: ["WP9"] }),
  flag("Weapons", "XBOW", "Crossbows", "Crossbows.", { alt: ["WP10"] }),
  flag("Weapons", "STAFF", "Staves", "Staves.", { alt: ["WP11"] }),
  flag("Weapons", "WAND", "Wands", "Wands.", { alt: ["WP12"] }),
  flag("Weapons", "SCEPTER", "Scepters", "Scepters.", { alt: ["WP13"] }),
  flag("Weapons", "1H", "One-handed", "One-handed weapons. Two-handed swords are 2H only."),
  flag("Weapons", "2H", "Two-handed", "Two-handed weapons, including two-handed swords."),

  // Class items
  flag("Class items", "DRU", "Druid pelts", "Druid helms.", { alt: ["CL1"] }),
  flag("Class items", "BAR", "Barbarian helms", "Barbarian helms.", { alt: ["CL2"] }),
  flag("Class items", "DIN", "Paladin shields", "Paladin shields.", { alt: ["CL3"] }),
  flag("Class items", "NEC", "Necromancer heads", "Necromancer shrunken heads.", { alt: ["CL4"] }),
  flag("Class items", "SIN", "Assassin claws", "Assassin katars and claws.", { alt: ["CL5"] }),
  flag("Class items", "SOR", "Sorceress orbs", "Sorceress orbs.", { alt: ["CL6"] }),
  flag("Class items", "ZON", "Amazon weapons", "Amazon bows, spears and javelins.", { alt: ["CL7"] }),

  // Character (mutable)
  flag("Character", "AMAZON", "Playing Amazon", "The current character is an Amazon.", { mutable: true }),
  flag("Character", "ASSASSIN", "Playing Assassin", "The current character is an Assassin.", { mutable: true }),
  flag("Character", "BARBARIAN", "Playing Barbarian", "The current character is a Barbarian.", { mutable: true }),
  flag("Character", "DRUID", "Playing Druid", "The current character is a Druid.", { mutable: true }),
  flag("Character", "NECROMANCER", "Playing Necromancer", "The current character is a Necromancer.", { mutable: true }),
  flag("Character", "PALADIN", "Playing Paladin", "The current character is a Paladin.", { mutable: true }),
  flag("Character", "SORCERESS", "Playing Sorceress", "The current character is a Sorceress.", { mutable: true }),
  value("Character", "CLVL", "Character level", "The level of the character viewing the item.", { mutable: true, range: "1-99", printable: false }),
  value("Character", "DIFF", "Difficulty", "0 = Normal, 1 = Nightmare, 2 = Hell.", { mutable: true, range: "0-2", printable: false }),
  { code: "CHARSTAT", kind: "param", cat: "Character", label: "Character stat", desc: "Like STAT, but checks the character's total instead of the item. CHARSTAT14 = gold carried, CHARSTAT15 = gold in stash.", example: "CHARSTAT15>1000000", mutable: true, printable: true },

  // Location (mutable)
  flag("Location", "GROUND", "On the ground", "The item is lying on the ground.", { mutable: true }),
  flag("Location", "SHOP", "In a shop", "The item is in a vendor's window. A trailing color keyword recolors the price.", { mutable: true }),
  flag("Location", "EQUIPPED", "Equipped", "Equipped by the character.", { mutable: true }),
  flag("Location", "MERC", "On the mercenary", "Equipped by the mercenary.", { mutable: true }),
  flag("Location", "INVENTORY", "In inventory", "In the character's inventory.", { mutable: true }),
  flag("Location", "STASH", "In stash", "In the stash.", { mutable: true }),
  flag("Location", "CUBE", "In the cube", "Inside the Horadric Cube.", { mutable: true }),

  // Item info
  value("Item info", "ILVL", "Item level", "Item level, 1-99.", { range: "1-99" }),
  value("Item info", "ALVL", "Affix level", "Decides which affixes can roll on magic/rare/crafted items.", { range: "1-99" }),
  value("Item info", "CRAFTALVL", "Crafted affix level", "The ALVL a crafted item would get if this character used this item as the base.", { range: "1-99", mutable: true }),
  value("Item info", "REROLLALVL", "Reroll affix level", "The ALVL the item would get if rerolled with the cube recipe.", { mutable: true, range: "1-99" }),
  value("Item info", "QLVL", "Quality level", "The base item's quality level."),
  value("Item info", "QTY", "Quantity", "Stack size (arrows, keys, stackable runes/gems, maps...).", { range: "0-350" }),
  value("Item info", "GOLD", "Gold amount", "Gold pile size. Gold can be hidden but not renamed, and is still auto-picked up.", { printable: false }),
  value("Item info", "PRICE", "Sell price", "What a vendor pays for it.", { mutable: true, alt: ["SELLPRICE"], range: "1-35000" }),
  value("Item info", "BUYPRICE", "Buy price", "What a vendor charges for it."),
  value("Item info", "RUNE", "Rune number", "1 (El) to 33 (Zod).", { range: "1-33", printable: false }),
  value("Item info", "GEMLEVEL", "Gem quality", "1 Chipped, 2 Flawed, 3 Normal, 4 Flawless, 5 Perfect.", { alt: ["GEM"], range: "1-5" }),
  value("Item info", "GEMTYPE", "Gem type", "1 Amethyst, 2 Diamond, 3 Emerald, 4 Ruby, 5 Sapphire, 6 Topaz, 7 Skull.", { range: "1-7" }),
  value("Item info", "MAXSOCKETS", "Max sockets", "Most sockets this base can have at its item level."),
  value("Item info", "WIDTH", "Width", "Inventory width in cells."),
  value("Item info", "HEIGHT", "Height", "Inventory height in cells."),
  value("Item info", "AREA", "Area", "Inventory cells used (width × height)."),

  // Requirements & base
  value("Requirements & base", "LVLREQ", "Level requirement", "Level needed to use the item (affixes included)."),
  value("Requirements & base", "REQLVL", "Base level requirement", "Required character level."),
  value("Requirements & base", "REQSTR", "Required strength", "Strength requirement."),
  value("Requirements & base", "REQDEX", "Required dexterity", "Dexterity requirement."),
  value("Requirements & base", "UPLVL", "Upgraded level req", "Required level after upgrading; 0 if no upgrade exists."),
  value("Requirements & base", "UPSTR", "Upgraded strength req", "Strength needed after upgrading; 0 if no upgrade exists."),
  value("Requirements & base", "UPDEX", "Upgraded dexterity req", "Dexterity needed after upgrading; 0 if no upgrade exists."),
  value("Requirements & base", "BASEMINONEH", "Base min 1H damage", "Base one-hand minimum damage."),
  value("Requirements & base", "BASEMAXONEH", "Base max 1H damage", "Base one-hand maximum damage."),
  value("Requirements & base", "BASEMINTWOH", "Base min 2H damage", "Base two-hand minimum damage."),
  value("Requirements & base", "BASEMAXTWOH", "Base max 2H damage", "Base two-hand maximum damage."),
  value("Requirements & base", "BASEMINTHROW", "Base min throw damage", "Base throw minimum damage."),
  value("Requirements & base", "BASEMAXTHROW", "Base max throw damage", "Base throw maximum damage."),
  value("Requirements & base", "BASEMINKICK", "Base min kick damage", "Base kick minimum damage (boots)."),
  value("Requirements & base", "BASEMAXKICK", "Base max kick damage", "Base kick maximum damage (boots)."),
  value("Requirements & base", "BASEMINSMITE", "Base min smite damage", "Base smite minimum damage (shields)."),
  value("Requirements & base", "BASEMAXSMITE", "Base max smite damage", "Base smite maximum damage (shields)."),
  value("Requirements & base", "BASEBLOCK", "Base block", "Base chance to block."),
  value("Requirements & base", "MAXRES", "Max all resist", "Bonus to maximum of all resistances."),
  value("Requirements & base", "ALLATTRIB", "All attributes", "+X to all attributes."),

  // Attributes (named stats)
  value("Attributes", "SOCKETS", "Sockets", "Total sockets.", { alt: ["SOCK"] }),
  value("Attributes", "DEF", "Defense", "Total defense."),
  value("Attributes", "ED", "Enhanced def/dmg", "Enhanced defense on armor, enhanced damage on weapons. Excludes runeword/socket bonuses."),
  value("Attributes", "EDEF", "Enhanced defense", "Includes runeword and socket bonuses."),
  value("Attributes", "EDAM", "Enhanced damage", "Includes runeword and socket bonuses."),
  value("Attributes", "MAXDUR", "Max durability %", "Increase maximum durability N%.", { printable: false }),
  value("Attributes", "AR", "Attack rating", "+N to attack rating."),
  value("Attributes", "ARPER", "Attack rating %", "N% bonus to attack rating."),
  value("Attributes", "MINDMG", "Min damage", "+N to minimum damage."),
  value("Attributes", "MAXDMG", "Max damage", "+N to maximum damage."),
  value("Attributes", "RES", "All resist", "All resistances +N."),
  value("Attributes", "FRES", "Fire resist", "Fire resist +N%."),
  value("Attributes", "CRES", "Cold resist", "Cold resist +N%."),
  value("Attributes", "LRES", "Lightning resist", "Lightning resist +N%."),
  value("Attributes", "PRES", "Poison resist", "Poison resist +N%."),
  value("Attributes", "FRW", "Faster run/walk", "+N% faster run/walk."),
  value("Attributes", "IAS", "Attack speed", "+N% increased attack speed."),
  value("Attributes", "FCR", "Faster cast rate", "+N% faster cast rate."),
  value("Attributes", "FHR", "Faster hit recovery", "+N% faster hit recovery."),
  value("Attributes", "FBR", "Faster block rate", "+N% faster block rate."),
  value("Attributes", "STR", "Strength", "+N to strength."),
  value("Attributes", "DEX", "Dexterity", "+N to dexterity."),
  value("Attributes", "LIFE", "Life", "+N to life."),
  value("Attributes", "MANA", "Mana", "+N to mana."),
  value("Attributes", "MFIND", "Magic find", "N% better chance of getting magic items."),
  value("Attributes", "GFIND", "Gold find", "N% extra gold from monsters."),
  value("Attributes", "MAEK", "Mana after kill", "+N to mana after each kill."),
  value("Attributes", "DTM", "Damage to mana", "N% damage taken gained as mana."),
  value("Attributes", "REPLIFE", "Replenish life", "Replenish life +N."),
  value("Attributes", "REPAIR", "Self repair", "Repairs 1 durability in 100/N seconds."),
  value("Attributes", "REPQUANT", "Replenish quantity", "Replenishes quantity (throwing weapons).", { undocumented: true }),

  // Skills
  value("Skills", "ALLSK", "All skills", "+N to all skills."),
  { code: "CLSK", kind: "param", cat: "Skills", label: "Class skills", desc: "+N to one class's skills. CLSK0 Amazon, 1 Sorceress, 2 Necromancer, 3 Paladin, 4 Barbarian, 5 Druid, 6 Assassin.", example: "CLSK2>0", printable: true },
  { code: "TABSK", kind: "param", cat: "Skills", label: "Skill tab", desc: "+N to a skill tab. Tab ids go class×8 + 0/1/2, e.g. TABSK25 = Paladin Offensive Auras.", example: "TABSK25>2", printable: true },
  { code: "SK", kind: "param", cat: "Skills", label: "Single skill", desc: "+N to one skill (class-only). SK54 = Teleport.", example: "SK54>0", printable: true },
  { code: "OS", kind: "param", cat: "Skills", label: "Oskill", desc: "+N to a skill usable by any class.", example: "OS74>0", printable: true },
  { code: "CHSK", kind: "param", cat: "Skills", label: "Skill charges", desc: "Level of charges for a skill. Curse charges use proc versions: CHSK445 Life Tap, CHSK447 Lower Resist.", example: "CHSK54>0", printable: true },
  value("Skills", "GOODSK", "Good class skills", "Matches items whose class skills are on PD2's built-in 'good skill' list.", { mutable: true, undocumented: true, printable: false }),
  value("Skills", "GOODTBSK", "Good skill tabs", "Matches items whose skill tabs are on PD2's built-in 'good tab' list.", { mutable: true, undocumented: true, printable: false }),

  // Stats
  { code: "STAT", kind: "param", cat: "Stats", label: "Stat by number", desc: "Any item stat by its ItemStatCost id, e.g. STAT60 life leech, STAT360 corruption. Add stats together with + (STAT60+STAT62>10).", example: "STAT60>5", printable: true },
  { code: "MULTI", kind: "param", cat: "Stats", label: "Multi-layer stat", desc: "Stats with a second layer: MULTIstat,layer. E.g. MULTI107,20=3 (+3 Thunderstorm), MULTI204,5455>0 (charges).", example: "MULTI97,74>0", printable: true },

  // Affixes
  value("Affixes", "PREFIX", "Magic prefix id", "Matches any of the item's prefixes. Use = or ~ (range); < and > do not work here.", { range: "1-805", printable: false }),
  value("Affixes", "SUFFIX", "Magic suffix id", "Matches any of the item's suffixes. Use = or ~ (range).", { range: "1-900", printable: false }),
  value("Affixes", "AUTOMOD", "Automod id", "Automatic class-item modifiers.", { range: "1-44", printable: false }),

  // Maps & zones
  value("Maps & zones", "MAPID", "Current zone", "Zone the character is in (see Codex → Zones).", { mutable: true, range: "1-175", printable: false }),
  value("Maps & zones", "MAPTIER", "Map tier", "0 PvP, 1-3 tiers, 4 dungeon, 5 unique.", { range: "0-5", printable: false }),

  // Filter
  value("Filter", "FILTLVL", "Filter level", "The strictness level selected in-game (0 = Show All Items, 1-12 = your ItemDisplayFilterName entries).", { mutable: true, range: "0-12", printable: false }),
];

export const COLORS: { code: string; label: string; css: string; hex: string; custom?: boolean; use?: string }[] = [
  { code: "WHITE", label: "White", css: "#FFFFFF", hex: "20", use: "Normal items" },
  { code: "GRAY", label: "Gray", css: "#696969", hex: "D0", use: "Ethereal/socketed normal items" },
  { code: "BLUE", label: "Blue", css: "#6969FF", hex: "97", use: "Magic items, descriptions" },
  { code: "YELLOW", label: "Yellow", css: "#FFFF64", hex: "0C", use: "Rare items" },
  { code: "GOLD", label: "Gold", css: "#C7B377", hex: "0D", use: "Unique items, runeword names" },
  { code: "GREEN", label: "Green", css: "#00FF00", hex: "84", use: "Set items" },
  { code: "DARK_GREEN", label: "Dark Green", css: "#008000", hex: "76" },
  { code: "TAN", label: "Tan", css: "#D0C27D", hex: "5A" },
  { code: "BLACK", label: "Black", css: "#000000", hex: "00" },
  { code: "PURPLE", label: "Purple", css: "#AE00FF", hex: "9B" },
  { code: "RED", label: "Red", css: "#FF4D4D", hex: "0A", use: "Unusable items" },
  { code: "ORANGE", label: "Orange", css: "#FFA800", hex: "60", use: "Crafted items, runes" },
  { code: "CORAL", label: "Coral", css: "#E09595", hex: "66", custom: true },
  { code: "SAGE", label: "Sage", css: "#B6E12E", hex: "82", custom: true },
  { code: "TEAL", label: "Teal", css: "#5CA6A4", hex: "CB", custom: true },
  { code: "LIGHT_GRAY", label: "Light Gray", css: "#A9A9B0", hex: "D6", custom: true },
];
export const COLOR_CSS: Record<string, string> = Object.fromEntries(COLORS.map((c) => [c.code, c.css]));

export const OUTPUTS: OutKeyword[] = [
  ...COLORS.map<OutKeyword>((c) => ({
    code: c.code,
    kind: "color",
    cat: "Colors",
    label: c.label,
    desc: `Following text is ${c.label.toLowerCase()}.${c.use ? ` Default for: ${c.use}.` : ""}${c.custom ? " Custom color: only renders in Glide mode; otherwise it falls back to the nearest classic color." : ""}`,
    hex: c.hex,
  })),
  { code: "FULL_TRANS", kind: "color", cat: "Colors", label: "Transparent", desc: "Fully transparent text (HD text only). Found in PD2's engine source.", undocumented: true },
  { code: "THREE_FOURTHS_TRANS", kind: "color", cat: "Colors", label: "75% transparent", desc: "Mostly transparent text (HD text only).", undocumented: true },
  { code: "HALF_TRANS", kind: "color", cat: "Colors", label: "50% transparent", desc: "Half transparent text (HD text only).", undocumented: true },
  { code: "QUARTER_TRANS", kind: "color", cat: "Colors", label: "25% transparent", desc: "Slightly transparent text (HD text only).", undocumented: true },

  { code: "NAME", kind: "value", cat: "Item text", label: "Item name", desc: "The item's name as it would normally appear, or whatever an earlier %CONTINUE% rule stored. Inside {braces} it is the current description." },
  { code: "BASENAME", kind: "value", cat: "Item text", label: "Base name", desc: "Base item name without quality words or color." },
  { code: "CODE", kind: "value", cat: "Item text", label: "Item code", desc: "The 3-4 letter item code." },
  { code: "RUNENAME", kind: "value", cat: "Item text", label: "Rune name", desc: "Rune name without \"Rune\" (Vex)." },
  { code: "RUNENUM", kind: "value", cat: "Item text", label: "Rune number", desc: "Rune number 1-33." },
  { code: "GEMLEVEL", kind: "value", cat: "Item text", label: "Gem quality", desc: "Chipped / Flawed / Normal / Flawless / Perfect." },
  { code: "GEMTYPE", kind: "value", cat: "Item text", label: "Gem type", desc: "Amethyst, Diamond, Emerald, Ruby, Sapphire, Topaz, Skull." },
  { code: "ILVL", kind: "value", cat: "Item values", label: "Item level", desc: "Item level." },
  { code: "ALVL", kind: "value", cat: "Item values", label: "Affix level", desc: "Affix level." },
  { code: "CRAFTALVL", kind: "value", cat: "Item values", label: "Craft ALVL", desc: "ALVL if crafted by this character." },
  { code: "REROLLALVL", kind: "value", cat: "Item values", label: "Reroll ALVL", desc: "ALVL if rerolled." },
  { code: "LVLREQ", kind: "value", cat: "Item values", label: "Level requirement", desc: "Level needed to use it." },
  { code: "PRICE", kind: "value", cat: "Item values", label: "Sell price", desc: "Vendor sell price (also %SELLPRICE%)." },
  { code: "SELLPRICE", kind: "value", cat: "Item values", label: "Sell price", desc: "Same as %PRICE%." },
  { code: "BUYPRICE", kind: "value", cat: "Item values", label: "Buy price", desc: "Vendor buy price." },
  { code: "QTY", kind: "value", cat: "Item values", label: "Quantity", desc: "Stack size." },
  { code: "SOCKETS", kind: "value", cat: "Item values", label: "Sockets", desc: "Number of sockets (also %SOCK%)." },
  { code: "MAXSOCKETS", kind: "value", cat: "Item values", label: "Max sockets", desc: "Max possible sockets." },
  { code: "RANGE", kind: "value", cat: "Item values", label: "Melee range", desc: "Melee range adder." },
  { code: "WPNSPD", kind: "value", cat: "Item values", label: "Weapon speed", desc: "Base weapon speed modifier." },
  { code: "DEF", kind: "value", cat: "Item values", label: "Defense", desc: "Total defense." },
  { code: "ED", kind: "value", cat: "Item values", label: "Enhanced def/dmg", desc: "ED% (armor: defense, weapons: damage)." },
  { code: "EDEF", kind: "value", cat: "Item values", label: "Enhanced defense", desc: "ED% incl. runewords/sockets." },
  { code: "EDAM", kind: "value", cat: "Item values", label: "Enhanced damage", desc: "ED% incl. runewords/sockets." },
  { code: "RES", kind: "value", cat: "Item values", label: "All resist", desc: "All resistances." },
  { code: "REQSTR", kind: "value", cat: "Item values", label: "Required str", desc: "Strength requirement." },
  { code: "REQDEX", kind: "value", cat: "Item values", label: "Required dex", desc: "Dexterity requirement." },
  { code: "REQLVL", kind: "value", cat: "Item values", label: "Required level", desc: "Level requirement." },
  { code: "UPSTR", kind: "value", cat: "Item values", label: "Upgraded str", desc: "Strength needed after upgrade." },
  { code: "UPDEX", kind: "value", cat: "Item values", label: "Upgraded dex", desc: "Dexterity needed after upgrade." },
  { code: "UPLVL", kind: "value", cat: "Item values", label: "Upgraded level", desc: "Level needed after upgrade." },
  { code: "WIDTH", kind: "value", cat: "Item values", label: "Width", desc: "Inventory width." },
  { code: "HEIGHT", kind: "value", cat: "Item values", label: "Height", desc: "Inventory height." },
  { code: "AREA", kind: "value", cat: "Item values", label: "Area", desc: "Inventory cells." },

  { code: "BORDER", kind: "notify", cat: "Notifications", label: "Large map icon", desc: "Drop notification + large minimap icon in palette color xx.", param: "hex", example: "%BORDER-0A%" },
  { code: "MAP", kind: "notify", cat: "Notifications", label: "Medium map icon", desc: "Drop notification + medium minimap icon. Without -xx it uses the current text color.", param: "hex", example: "%MAP-0B%" },
  { code: "DOT", kind: "notify", cat: "Notifications", label: "Small map icon", desc: "Drop notification + small minimap icon.", param: "hex", example: "%DOT-97%" },
  { code: "PX", kind: "notify", cat: "Notifications", label: "Tiny map icon", desc: "Drop notification + 1-pixel minimap icon.", param: "hex", example: "%PX-1F%" },
  { code: "LINE", kind: "notify", cat: "Notifications", label: "Map line", desc: "Parsed by PD2's engine as a minimap line color, but the open-source engine never draws it — may do nothing.", param: "hex", example: "%LINE-0A%", undocumented: true },
  { code: "SOUNDID", kind: "notify", cat: "Notifications", label: "Drop sound", desc: "Plays sound n from sounds.txt when it drops (needs Drop Sounds on). Looping/music sounds and unknown ids don't play. 4714-4729 are the PoE-style drop sounds. Test in-game with .playsound n.", param: "int", example: "%SOUNDID-4714%" },
  { code: "TIER", kind: "notify", cat: "Notifications", label: "Notification tier", desc: "The rule only notifies at filter levels 0..n (a single digit, 0–9). Above that the notification pass skips it, and the next matching icon/sound rule notifies instead.", param: "tier", example: "%TIER-2%" },
  { code: "NOTIFY", kind: "notify", cat: "Notifications", label: "Notify color", desc: "Parsed but ignored by PD2 (the code that used it is commented out). Use %TIER-n% instead.", param: "notify", example: "%NOTIFY-DEAD%" },

  { code: "CONTINUE", kind: "special", cat: "Flow", label: "Continue", desc: "Saves this rule's output into %NAME% and keeps checking rules below. Works outside braces only; applies to both name and description." },
  { code: "NL", kind: "special", cat: "Layout", label: "New line", desc: "New line. Lines stack upward. Works in descriptions, and in names of identified magic+ items, runewords and shop items." },
  { code: "CL", kind: "special", cat: "Layout", label: "Clean new line", desc: "New line only if not already at the start of one; never makes blank lines." },
  { code: "CS", kind: "special", cat: "Layout", label: "Clean space", desc: "A space only if one is needed to separate text." },
  { code: "LBRACE", kind: "special", cat: "Layout", label: "{ character", desc: "A literal {.", undocumented: true },
  { code: "RBRACE", kind: "special", cat: "Layout", label: "} character", desc: "A literal }.", undocumented: true },
  { code: "PERCENT", kind: "special", cat: "Layout", label: "% character", desc: "A literal %.", undocumented: true },
];

export const DIRECTIVES = [
  { code: "ItemDisplay", label: "Rule", desc: "ItemDisplay[conditions]: output. Rules run top to bottom; the first match wins unless it has %CONTINUE%." },
  { code: "ItemDisplayFilterName", label: "Filter level", desc: "ItemDisplayFilterName[]: Name. Each one adds an in-game strictness level, numbered in file order (max 12)." },
  { code: "Alias", label: "Alias", desc: "Alias[NAME]: text. Plain find-and-replace applied to every rule when the filter loads. Use NAME in conditions or %NAME% in output." },
  { code: "Formula", label: "Formula", desc: "Formula[KEY]: expression. Reference as FORMULAKEY in conditions or %FORMULAKEY% in output. Keys use only A-Z and _." },
];

export const FORMULA_FUNCTIONS: { name: string; arity: string; desc: string; example: string }[] = [
  { name: "IF", arity: "3", desc: "Second argument if the first is true, otherwise the third.", example: "IF(STAT3>100,TRUE,FALSE)" },
  { name: "AND", arity: "1+", desc: "True if all arguments are true.", example: "AND(STAT3>100,STAT0>100)" },
  { name: "OR", arity: "1+", desc: "True if any argument is true.", example: "OR(STAT3>100,STAT0>100)" },
  { name: "XOR", arity: "1+", desc: "True if an odd number of arguments are true.", example: "XOR(1,0)" },
  { name: "MIN", arity: "1+", desc: "Smallest value.", example: "MIN(STAT2,50)" },
  { name: "MAX", arity: "1+", desc: "Largest value.", example: "MAX(STAT2,50)" },
  { name: "AVERAGE", arity: "1+", desc: "Average of the arguments.", example: "AVERAGE(FRES,CRES,LRES)" },
  { name: "COUNT", arity: "1+", desc: "How many arguments are true.", example: "COUNT(FRES>0,CRES>0,LRES>0,PRES>0)" },
  { name: "COUNTIF", arity: "2+", desc: "How many arguments equal the last one.", example: "COUNTIF(1,0,1)" },
  { name: "ABS", arity: "1", desc: "Absolute value.", example: "ABS(-1)" },
  { name: "SIGN", arity: "1", desc: "-1, 0 or 1.", example: "SIGN(-5)" },
  { name: "FLOOR", arity: "1", desc: "Round down.", example: "FLOOR(1.5)" },
  { name: "CEIL", arity: "1", desc: "Round up.", example: "CEIL(1.49)" },
  { name: "ROUND", arity: "1", desc: "Round to nearest.", example: "ROUND(1.5)" },
  { name: "MOD", arity: "2", desc: "Remainder of A/B.", example: "MOD(-17,5)" },
  { name: "POW", arity: "2", desc: "A to the power of B.", example: "POW(2,2)" },
  { name: "SQRT", arity: "1", desc: "Square root.", example: "SQRT(4)" },
  { name: "EXP", arity: "1", desc: "e to a power.", example: "EXP(1)" },
  { name: "LN", arity: "1", desc: "Natural logarithm.", example: "LN(STAT2)" },
];

export const CLASS_NAMES = ["Amazon", "Sorceress", "Necromancer", "Paladin", "Barbarian", "Druid", "Assassin"];
export const TAB_NAMES: Record<number, string> = {
  0: "Amazon: Bow and Crossbow", 1: "Amazon: Passive and Magic", 2: "Amazon: Javelin and Spear",
  8: "Sorceress: Fire", 9: "Sorceress: Lightning", 10: "Sorceress: Cold",
  16: "Necromancer: Curses", 17: "Necromancer: Poison and Bone", 18: "Necromancer: Summoning",
  24: "Paladin: Combat", 25: "Paladin: Offensive Auras", 26: "Paladin: Defensive Auras",
  32: "Barbarian: Combat", 33: "Barbarian: Masteries", 34: "Barbarian: Warcries",
  40: "Druid: Summoning", 41: "Druid: Shape Shifting", 42: "Druid: Elemental",
  48: "Assassin: Traps", 49: "Assassin: Shadow Disciplines", 50: "Assassin: Martial Arts",
};
export const MAPTIER_NAMES = ["PvP arena", "Tier 1", "Tier 2", "Tier 3", "Dungeon", "Unique"];
export const DIFF_NAMES = ["Normal", "Nightmare", "Hell"];

// ---- lookup tables built from the lists above
export const COND_BY_CODE = new Map<string, CondKeyword>();
for (const k of CONDITIONS) {
  COND_BY_CODE.set(k.code, k);
  for (const a of k.alt ?? []) COND_BY_CODE.set(a, k);
}
export const PARAM_PREFIXES = ["CHARSTAT", "TABSK", "CLSK", "CHSK", "MULTI", "STAT", "SK", "OS"]; // longest first
export const OUT_BY_CODE = new Map<string, OutKeyword>();
for (const k of OUTPUTS) OUT_BY_CODE.set(k.code, k);
OUT_BY_CODE.set("SOCK", OUT_BY_CODE.get("SOCKETS")!);

/** Condition codes that can also be printed with %CODE% (named stats and item values). */
export const PRINTABLE_CONDS = new Set(CONDITIONS.filter((k) => k.printable && k.kind === "value").flatMap((k) => [k.code, ...(k.alt ?? [])]));

export const NAME_DISPLAY_LIMIT = 56;
export const NAME_INTERNAL_LIMIT = 125;
export const DESC_LIMIT = 500;
export const MAX_FILTER_LEVELS = 12;

/** PoE-style drop sounds PD2 added to sounds.txt. */
export const POE_SOUNDS = Array.from({ length: 16 }, (_, i) => 4714 + i);
