# Regulatory checklist (Georgia)

The vetting report's highest risk. Nothing here is confirmed yet. **Verify each line with the authority before relying on it.**

## What we believe today

| Area | Understanding (unverified) | Who confirms |
|---|---|---|
| Drone category | GCAA uses the EU-style Open / Specific / Certified framework. Open excludes operations that drop material, and tops out at 25 kg. Spraying therefore needs the **Specific** category: a declaration under a standard scenario, or an operational authorisation with a risk assessment. | GCAA, UAS-GA@gcaa.ge |
| Operators | Each operator needs registration and commercial certification. | GCAA |
| Pesticides | Chemical application licensing is separate from aviation. | National Food Agency (NFA) |
| Farmer payments | Holding or converting farmer money may fall under the National Bank of Georgia's virtual-asset service provider rules. | NBG / a lawyer |
| Liability | Drift onto a neighbour's crop: who pays? Our v1 position: operators carry liability and insurance; we coordinate and verify, not warrant. | Lawyer, insurer |

## Tasks

- [ ] Send the GCAA email below
- [ ] Ask the NFA which licence the operator and the chemical need for aerial application
- [ ] Ask the distributor which of its customers already hold Specific-category authorisation
- [ ] Keep every reply; a screenshot of the GCAA answer goes in the deck
- [ ] One hour of legal advice on payments and liability before the Season 1 pilot

## Draft email to GCAA

> **To:** UAS-GA@gcaa.ge
> **Subject:** Agricultural spraying with UAS: which Specific-category path applies?
>
> Dear GCAA UAS team,
>
> My name is Khristo, and I am building a platform in Tbilisi that connects farmers with certified agricultural drone operators (DJI Agras T50 class, above 25 kg loaded). Operators would spray crop-protection products on agricultural fields, mainly in Kakheti.
>
> I understand this is outside the Open category because it drops material. Could you please advise:
>
> 1. Is there a standard scenario that operators can declare against for agricultural spraying, or is an operational authorisation with a risk assessment required?
> 2. What certification and registration does each remote pilot and each operator need?
> 3. Are there any additional rules for spraying near settlements, roads or neighbouring fields?
> 4. For a demonstration flight on a single private field in the coming weeks, what is the minimum we need in place?
>
> We only plan to work with operators who hold the required authorisations. Thank you for your guidance.
>
> Kind regards,
> Khristo
> [phone] · [email]

*Consider sending a Georgian-language version too.*

## Findings, 8 Oct 2026 (web research; confirm with GCAA)

- **Categories:** Georgia uses the EU-style **Open / Specific / Certified** UAS categories ([uas.gov.ge](https://uas.gov.ge/EN)). Open is limited to aircraft under 25 kg in visual line of sight, so a loaded spray drone (e.g. Agras T50) is outside it.
- **Specific category, two routes:**
  1. **Operational authorisation:** the operator submits a **risk assessment (SORA method)** with mitigation measures; GCAA authorises if risks are adequately mitigated ([airspace.gov.ge](https://airspace.gov.ge/)). For aircraft **over 25 kg**, the application also needs a **technical service programme** for the aircraft.
  2. **Electronic declaration against a GCAA standard scenario**, where the operation fits one (GCAA announcement on the new rules; exact scenarios not confirmed).
  3. A third-party guide says a **Light UAS Operator Certificate (LUC)**, for legal entities only, can replace both ([SkyBit](https://skybit.ge/en/rules)); not confirmed against the regulation.
- **Spraying:** described as a higher-risk operation that needs the agency's permission ([SkyBit](https://skybit.ge/en/rules)).
- **Commercial work:** also needs an operating licence for aerial work / commercial purposes ([airspace.gov.ge](https://airspace.gov.ge/)).
- **Who decides:** GCAA's **Unmanned Aircraft Systems and General Aviation Department**: registers UAS, issues authorisations, certifies operators, issues remote-pilot certificates ([gcaa.ge](https://gcaa.ge/en/unmanned-aircraft-systems-and-general-aviation-department/)).
- **Registration:** online platform at [uas.gov.ge](https://uas.gov.ge/EN) (use type "agriculture" exists).

**Open questions for the GCAA email:** Is there a standard scenario that covers agricultural spraying? Which route (authorisation, declaration or LUC) applies to a >25 kg spray drone? Fees and timelines? Rules near settlements and neighbouring fields?

**Kvali design implication:** Kvali only onboards operators who already hold the authorisation (or LUC); the calibration certificate is separate and in addition.
