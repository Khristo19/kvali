# Why blockchain, and why drones

The two questions every judge, farmer and investor will ask. Keep these answers short and honest.

## Why blockchain?

**One-line answer:** payments alone don't need a blockchain. A neutral escrow, a bond enforced without a court, and a spray record nobody can quietly edit (including us) do.

### What it makes easier, step by step

| Step of a job | Today (phone + cash) | With Kvali on Solana | Why it needs a chain |
|---|---|---|---|
| Trusting a stranger | Referrals, gut feeling | Operator locks a bond ≥ job value | Collateral enforced by code, not by our promise |
| Holding the money | Cash, or one side trusts the other | Program-owned USDC escrow | Neither side, and not us, can take it |
| Getting paid | Cash on the day, or chase for weeks | Paid automatically 24h after a passing proof; no one's approval needed | Settlement is final and costs under a cent |
| Disputes | Argument; a court costs more than a 300 USD job | Challenge costs 20%; an independent validator panel rules; loser pays | Rules are public, and no single party (including us) decides |
| Proving the spray | Paper log or app screenshot anyone can edit | Manifest on Arweave, hash in the Job account | Exporters, insurers and buyers verify without trusting us |
| Reputation | Word of mouth, lost if the platform closes | Verified job history on-chain; later Solana Attestation Service credentials | The operator owns and carries it |
| Cross-border (later) | Different banks, currencies, FX fees | Same USDC rails across Georgia, Caucasus, Central Asia | One settlement layer for many markets |

### What it unlocks next

- **Drone financing:** a lender can underwrite a $25k drone against the operator's verified earnings history. That sells more drones, which is what the distributor wants.
- **Crop insurance:** insurers can price cover using verified spray records.
- **Export compliance:** EU buyers increasingly ask for chemical-application records; a verifiable record per field per season is the higher-margin product.

### What we don't claim

- Blockchain doesn't prove the drone sprayed. The four signals do (see DECISIONS.md D2). The chain makes the result **binding and checkable**.
- v1 has three permissioned validators (2 of 3), with balanced seats and none held by Kvali. We say so, with the path to permissionless validators.

## Why drones, not tractors?

| | Spray drone | Tractor sprayer |
|---|---|---|
| Soil and crop | No wheel tracks, no compaction, no crushed rows | Wheel tracks compact soil and damage rows |
| After rain | Flies the same day, inside the weather window | Waits until the field can carry it |
| Slopes | Handles hillside vineyards (Kakheti) and hazelnut groves (west Georgia) | Slow and risky on steep ground |
| Water per hectare | Low volume, typically ~10–20 L/ha | Typically ~100–300 L/ha |
| Operator safety | Stands at the field edge | Drives through the spray zone |
| Smallholder fit | Hired per hectare as a service | Must own or borrow machinery |
| To own | The operator owns the drone; the farmer hires by the hectare | Tractor + sprayer: **[₾__, get a dealer quote]**. Never pays back on a 1–3 ha plot |
| To hire | About $10–20/ha in Georgia **[assumption from the vetting report; confirm with operators]** | **[₾__/ha, confirm]**. Reference: pull-type ground spraying costs about $4.60/acre ≈ **$11/ha** on large US farms, including overhead ([farmdoc, University of Illinois, 2021](https://farmdoc.illinois.edu/assets/management/machinery-costs/field_operations.pdf)) |
| Speed | Realistic ~12 ha/h (T50); up to 18 ha/h (T70P) | Depends on field access and turning space |

**Demand already exists:** Georgia's Hazelnut Production Support Programme pays **500 ₾/ha** toward pesticides and agrochemicals for farmers with **0.2–3 ha** of orchard. In 2024 about **95,000 farmers** on **45,000+ ha** benefited; the 2025 budget is **23M ₾** ([CBW, Feb 2025](https://cbw.ge/business/hazelnut-subsidy-program-budget-increased-to-23-million-gel-in-2025); [MEPA](https://mepa.gov.ge/En/News/Details/21375)). That's roughly 0.5 ha per farmer: far too small to justify a tractor sprayer. The state funds the chemicals; nobody has solved how to apply them on plots that small.

**Be honest:** tractors still win on very large, flat fields and heavy loads, and drones have more drift risk in wind. Drones win where most Georgian farms are: small, fragmented, sloped, and often wet in spring.

*Volume ranges are typical industry figures. Confirm per crop and product with the distributor's agronomists before quoting them to judges.*

## Pitch lines

- "You could build the payments with Stripe. You couldn't build the record."
- "The bond is enforced by code, because nobody goes to court over a 300-dollar spray job."
- "Drones don't touch the soil, fly the morning after rain, and use a fraction of the water. That's why Georgia's hillside farms need them."

## Why Georgia first

**Framing:** "Georgia is our test field, not our ceiling." One aviation regulator, one DJI distributor, one season to prove it, then the same playbook in the Caucasus, Central Asia and Turkey.

| Figure | Value | Source |
|---|---|---|
| Farm holdings | 479,500 (2024 census, −25% vs 2014) | [Geostat via 1TV, Jun 2026](https://1tv.ge/lang/en/news/geostat-releases-key-findings-from-georgias-2024-population-and-agricultural-census/) |
| Agricultural land | 809,100 ha | same |
| Average holding | ~1.7 ha (**our calculation**: 809,100 ÷ 479,500) | derived |
| Orchards and vineyards (perennial plantations) | 176,000 ha, +60.6% vs 2014 | same |
| Grapevines | 164.7 million | same |
| Employment in agriculture, forestry, fishing | 16.0% of employed (2024) | [PMC Research labour market overview, citing Geostat](https://www.pmcresearch.org/slider_file/acb76853dc62724f9.pdf) |
| Rural population | 1.485M, 37.8% (early 2025) | [Geostat via Georgia Today, Jun 2026](https://georgiatoday.ge/geostat-agriculture-share-in-economy-falls-to-5-9-in-2025/) |
| Agriculture share of GDP | 5.9% (2025, preliminary); output 8.6B GEL, +6.4% | same |
| Agri-food exports | $1.8B record in 2024, 26% of all exports, 110 countries | [MEPA](https://www.mepa.gov.ge/En/News/Details/22908) |
| Hazelnut world rank | #6 producer, ~37k t, ~3% of world (FAO 2023) | [Nocciolare / FAO data](https://nocciolare.it/wp-content/uploads/2025/12/7-Developments-in-the-world-and-Turkish-Hazelnut-Sector.pdf) |
| Hazelnut exports | 20,000 t, $171.7M (2025); 10,700 t to EU Aug 2025–Mar 2026 (Italy, Spain, Germany, France, Greece) | [MEPA via Georgia Today, Apr 2026](https://georgiatoday.ge/hazelnut-export-value-rises-despite-drop-in-volume-ministry/) |
| Grape harvest | ~340,000 t in 2025, largest in 30 years; ~247,000 t processed in Kakheti | National Wine Agency, via [Wine Industry Advisor](https://wineindustryadvisor.com/2026/05/20/wines-of-georgia-poised-to-expand-despite-turbulent-market-conditions/) and [NWA reports](https://wine.gov.ge/En/Files/Download/15556) |
| Wine exports | 89.7M litres to 71 countries (2025) | [Wine-Intelligence, citing NWA](https://wine-intelligence.com/blogs/wine-analytics-pricing-report-data/georgia-reports-strong-wine-and-spirits-export-performance-in-2025) |
| DJI ag drones in use | 600,000+ in 100+ countries | [DJI Agriculture, Apr 2026](https://www.prnewswire.com/apac/news-releases/dji-agriculture-reveals-global-adoption-of-agricultural-drones-cuts-51mt-in-carbon-emissions-and-saves-410mts-of-water-for-farmers-globally-302757294.html) |

**Still missing (only you can fill):** how many countries the DJI distributor covers, and how many Agras units are working in Georgia today. Ask the distributor (FIELD_VALIDATION.md §1).

**Before judging, check:** the employment share is 16% in Geostat's labour survey but ~35% in ILO modelled estimates, because they define it differently. Quote Geostat's 16% and don't mix the two.

### What the numbers change in the product

The average holding is ~1.7 ha, so one farm is about 10 minutes of T50 flying. Travel and setup would eat the operator's day. The marketplace has to **group neighbouring plots in one village into a single spray day** (a co-op or village batch). That makes aggregation a core feature, not a nice-to-have, and it's a strong answer to "why a marketplace?"
