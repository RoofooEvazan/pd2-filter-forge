// Built-in starting points: a blank filter and a well-organised starter that shows off the
// language (levels, aliases, %CONTINUE% tags, notifications, sounds, formulas).

const banner = (title: string, blurb?: string) =>
  ["", "//==========================================================", `// ${title}`, "//==========================================================", ...(blurb ? [`// ${blurb}`] : [])].join("\n");

export function blankFilter(name = "My Filter") {
  return [
    `// ${name}`,
    "// Made with PD2 Filter Forge.",
    "",
    "ItemDisplayFilterName[]: Standard",
    banner("RULES", "Rules run top to bottom; the first one that matches decides how an item looks."),
    "",
    banner("SHOW EVERYTHING ELSE"),
    "ItemDisplay[]: %NAME%",
    "",
  ].join("\n");
}

export function starterFilter(name = "My Filter") {
  return [
    `// ${name}`,
    "// Made with PD2 Filter Forge from the built-in starter.",
    "// Filter levels are chosen in-game: Options > PD2 Options > Filter Level.",
    "",
    "ItemDisplayFilterName[]: Relaxed (show more)",
    "ItemDisplayFilterName[]: Standard",
    "ItemDisplayFilterName[]: Strict",
    "ItemDisplayFilterName[]: Very strict (endgame)",

    banner("SETTINGS", "Flip TRUE/FALSE to switch features on or off."),
    "Alias[SHOW_ITEM_LEVEL]: TRUE",
    "Alias[SOUNDS_ON]: TRUE",
    "Alias[HIGHRUNE]: RUNE>22",
    "Alias[CURRENCY]: (imma OR imrn OR imra OR rera OR scou OR upma OR upmp OR fort OR scrb OR lbox)",
    "Alias[UBERPART]: (pk1 OR pk2 OR pk3 OR dhn OR bey OR mbr OR tes OR ceh OR bet OR fed OR toa)",
    "Formula[TOTALRES]: FRES+CRES+LRES+PRES",

    banner("TAGS", "These rules add info then %CONTINUE% so later rules still style the item."),
    "ItemDisplay[ETH (ARMOR OR WEAPON)]: %GRAY%Eth %NAME%%CONTINUE%",
    "ItemDisplay[SOCKETS>0 (ARMOR OR WEAPON) !RW]: %NAME% %GRAY%[%SOCKETS%]%CONTINUE%",
    "ItemDisplay[SHOW_ITEM_LEVEL (ARMOR OR WEAPON OR JEWELRY OR CHARM OR jew)]: %NAME%{%NAME%%CL%%GRAY%Item Level: %WHITE%%ILVL%}%CONTINUE%",
    "ItemDisplay[RARE ID JEWELRY FORMULATOTALRES>59]: %NAME% %TEAL%(%FORMULATOTALRES% res)%CONTINUE%",

    banner("RUNES"),
    "ItemDisplay[HIGHRUNE SOUNDS_ON]: %RED%*** %ORANGE%%RUNENAME% %RED%***%BORDER-55%%SOUNDID-4714%",
    "ItemDisplay[HIGHRUNE]: %RED%*** %ORANGE%%RUNENAME% %RED%***%BORDER-55%",
    "ItemDisplay[RUNE>14]: %ORANGE%%RUNENAME% Rune %GRAY%(#%RUNENUM%)%MAP-0B%",
    "ItemDisplay[RUNE>9]: %ORANGE%%RUNENAME% %GRAY%(#%RUNENUM%)%DOT-0B%%TIER-2%",
    "ItemDisplay[RUNE>0 FILTLVL>3]: %ORANGE%%RUNENAME%",
    "ItemDisplay[RUNE>0]: %ORANGE%%RUNENAME% %GRAY%(#%RUNENUM%)",

    banner("PD2 CURRENCY, MAPS & UBERS"),
    "ItemDisplay[CURRENCY]: %GOLD%%NAME%%MAP-D3%%TIER-3%",
    "ItemDisplay[wss OR cwss OR iwss]: %PURPLE%%NAME%%MAP-9B%",
    "ItemDisplay[UBERPART]: %ORANGE%%NAME%%BORDER-0B%",
    "ItemDisplay[(ivea OR ivez OR iveb OR ived OR iven OR ivep OR ives)]: %PURPLE%%NAME%%MAP-9B%%SOUNDID-4714%",
    "ItemDisplay[MAPTIER=3 !UNI]: %WHITE%%NAME% %GRAY%[T3]%DOT-1F%%TIER-2%",
    "ItemDisplay[MAPTIER>0 !UNI]: %WHITE%%NAME%%DOT-1F%%TIER-1%",
    "ItemDisplay[MAPTIER>0 UNI]: %GOLD%%NAME%%MAP-D3%",
    "ItemDisplay[jewf]: %NAME%%DOT-1F%%TIER-1%",

    banner("UNIQUES & SETS"),
    "ItemDisplay[UNI !ID ELT]: %GOLD%%NAME%%BORDER-D3%",
    "ItemDisplay[UNI !ID (JEWELRY OR CHARM OR jew)]: %GOLD%%NAME%%BORDER-D3%",
    "ItemDisplay[UNI]: %GOLD%%NAME%%MAP-D3%%TIER-3%",
    "ItemDisplay[SET]: %GREEN%%NAME%%MAP-7D%%TIER-2%",

    banner("GEMS, JEWELS & CHARMS"),
    "ItemDisplay[GEMLEVEL=5]: %NAME%%DOT-1F%%TIER-2%",
    "ItemDisplay[GEMLEVEL<4 FILTLVL>1]:",
    "ItemDisplay[(jew OR cm1 OR cm2 OR cm3) (MAG OR RARE)]: %NAME%%DOT-94%%TIER-2%",

    banner("RUNEWORD BASES", "White/grey bases with good socket counts."),
    "ItemDisplay[NMAG !INF !RW ELT (ARMOR OR WEAPON) SOCKETS>2]: %WHITE%%NAME%%DOT-1F%%TIER-2%",
    "ItemDisplay[NMAG !INF !RW SOCKETS=0 ELT (ARMOR OR WEAPON) FILTLVL<3]: %WHITE%%NAME%",

    banner("CONSUMABLES", "Hidden more aggressively as filter level rises."),
    "ItemDisplay[(hp1 OR hp2 OR mp1 OR mp2 OR yps OR vps OR wms) FILTLVL>1]:",
    "ItemDisplay[(hp3 OR mp3) FILTLVL>2]:",
    "ItemDisplay[(tsc OR isc) FILTLVL>2]:",
    "ItemDisplay[(aqv OR cqv) NMAG FILTLVL>1]:",
    "ItemDisplay[rvl]: %PURPLE%Full Rejuv",
    "ItemDisplay[rvs]: %PURPLE%Rejuv",
    "ItemDisplay[key FILTLVL>2]:",

    banner("GOLD"),
    "ItemDisplay[GOLD<2000 FILTLVL>2]:",
    "ItemDisplay[GOLD<500 FILTLVL>1]:",

    banner("JUNK", "Low-value normal and magic gear."),
    "ItemDisplay[INF FILTLVL>0]:",
    "ItemDisplay[NMAG !ETH SOCKETS=0 (ARMOR OR WEAPON) !ELT FILTLVL>2]:",
    "ItemDisplay[MAG (ARMOR OR WEAPON) !CLASS !CIRC FILTLVL>3]:",

    banner("SHOW EVERYTHING ELSE"),
    "ItemDisplay[]: %NAME%",
    "",
  ].join("\n");
}
