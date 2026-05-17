export type Source = {
  name: string;
  rss_url: string;
  region: "CN" | "US" | "EU" | "INTL";
  focus: string[];
};

export const SOURCES: Source[] = [
  // Tier 1 — Confirmed working RSS
  {
    name: "NBER",
    rss_url: "https://back.nber.org/rss/new.xml",
    region: "US",
    focus: ["Trade", "Finance", "Investment"],
  },
  {
    name: "BIS",
    rss_url: "https://www.bis.org/doclist/wppubls.rss",
    region: "INTL",
    focus: ["Finance", "Policy"],
  },
  {
    name: "Bruegel",
    rss_url: "https://www.bruegel.org/rss.xml",
    region: "EU",
    focus: ["Trade", "Finance", "Technology"],
  },
  {
    name: "Rhodium Group",
    rss_url: "https://rhg.com/feed",
    region: "US",
    focus: ["Investment", "Trade", "Technology"],
  },
  {
    name: "MERICS",
    rss_url: "https://merics.org/en/rss",
    region: "EU",
    focus: ["Trade", "Technology", "Policy"],
  },
  {
    name: "PIIE",
    rss_url: "https://www.piie.com/rss/update.xml",
    region: "US",
    focus: ["Trade", "Finance", "Policy"],
  },
  {
    name: "ECFR",
    rss_url: "https://ecfr.eu/feed/",
    region: "EU",
    focus: ["Policy", "Trade"],
  },
  {
    name: "Atlantic Council GCH",
    rss_url: "https://www.atlanticcouncil.org/programs/global-china-hub/feed/",
    region: "US",
    focus: ["Policy", "Technology", "Leverage"],
  },
  {
    name: "RAND",
    rss_url: "https://www.rand.org/pubs/commentary.xml",
    region: "US",
    focus: ["Policy", "Technology"],
  },
  {
    name: "CF40 Research",
    rss_url: "https://cf40research.substack.com/feed",
    region: "CN",
    focus: ["Finance", "Policy", "Trade"],
  },
  {
    name: "ECIPE",
    rss_url: "https://ecipe.org/feed/",
    region: "EU",
    focus: ["Trade", "Technology"],
  },
  // CEPS, Carnegie, Chatham House, Brookings, ITIF — RSS broken, will add via scraping later
];
