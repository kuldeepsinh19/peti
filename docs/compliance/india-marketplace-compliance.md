# Indian compliance for a rental marketplace: what was found and what is open

**Read this first.**

- This is **not legal or tax advice**. It was compiled on 15 November 2026 from public sources by the
  engineering side of the project, to tell the owner what to ask a lawyer and a chartered accountant.
- Nothing here has been reviewed by a professional. **Peti must not take real money until one has.**
- The sources were found through web search and read as summaries. Where a link goes to a regulator's or a
  provider's own page it is marked **Official**; a law-firm, tax-publisher or news summary is marked
  **Secondary**. No statute or notification was read in full.
- Every statement about **how a rule applies to Peti** is an **Assumption** until a professional confirms it.

## Summary: what blocks real transactions

| #   | Area                | Blocker                                                                                                   | Kind                    |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1   | Settlement model    | Collecting renters' money into Peti's own account and paying owners by hand may be payment aggregation.   | Legal; likely redesign  |
| 2   | Razorpay Route      | The compliant split-settlement product needs more than ₹40 lakh turnover, which a new business lacks.     | Commercial              |
| 3   | GST                 | A marketplace that collects payment is an e-commerce operator: registration and TCS are probably due.     | Tax; registration       |
| 4   | Income-tax TDS      | Tax may have to be deducted from owners' payouts; Peti collects no PAN and deducts nothing.               | Tax; code and process   |
| 5   | Consumer protection | Grievance officer, published details and seller information are required of marketplace entities.         | Legal; pages, process   |
| 6   | Data protection     | DPDP obligations (notice, consent, breach reporting, erasure) start in May 2027; nothing is built for it. | Legal; code and process |
| 7   | Contract terms      | The rental terms, the deposit and damage rules and Peti's liability have not been drafted by a lawyer.    | Legal                   |
| 8   | SMS                 | Sending verification codes needs DLT registration; see [sms-otp.md](../development/sms-otp.md).           | Regulatory; lead time   |

Items 1 and 2 decide the architecture of payouts. Settle them before building anything further on payouts.

## 1. Who may hold the renter's money (RBI payment-aggregator rules)

**What the sources say**

| Statement                                                                                                                                             | Level     | Source                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The RBI issued the Reserve Bank of India (Regulation of Payment Aggregators) Directions, 2025 on 15 September 2025.                                   | Official  | [RBI press release](https://www.rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid=61218), [text](https://website.rbi.org.in/documents/d/rbi/finalconsolidatedpadirection15092025_ann)                      |
| Non-bank payment aggregators need RBI authorisation; minimum net worth ₹15 crore at application, ₹25 crore within three years.                        | Secondary | [JSA](https://www.jsalaw.com/?p=55044), [Cyril Amarchand Mangaldas](https://www.cyrilshroff.com/wp-content/uploads/2025/10/Client-Alert-RBI-Introduces-Consolidated-Framework-for-Payment-Aggregators-3.pdf) |
| Funds a payment aggregator collects must be held in an escrow account with a scheduled commercial bank.                                               | Secondary | [Outlook Money](https://outlookmoney.com/banking/payment-aggregator-guidelines-rbi-issues-new-directions-for-payment-aggregators)                                                                            |
| A payment aggregator must ensure a marketplace it onboards does not accept payments for sellers who are not onboarded on that marketplace's platform. | Secondary | [AZB & Partners](https://www.azbpartners.com/?p=87411)                                                                                                                                                       |
| An entity doing payment-aggregator business may not also run a marketplace; the marketplace business must sit in a separate entity.                   | Secondary | [Vinod Kothari Consultants](https://vinodkothari.com/wp-content/uploads/2025/09/Key-Highlights-of-PA-2025-2.pdf)                                                                                             |

**How this applies to Peti (assumptions)**

- Peti's design collects the rental fee and the deposit into **Peti's own merchant account**, then an
  administrator pays the owner by UPI. Receiving money from payers on behalf of sellers and passing it on is
  what a payment aggregator does. **Assumption:** doing this without authorisation is not permitted, however
  small the amounts. This is the most serious open question in the project.
- The usual compliant structure is that an **authorised payment aggregator settles to the sellers directly**
  (split settlement), so the marketplace never holds the sellers' money. Razorpay's product for this is
  Route; other aggregators have equivalents.
- The security deposit raises the same question more sharply: Peti holds a renter's money for the length of
  the rental. **Assumption:** this needs the aggregator's escrow or a different mechanism (for example an
  authorisation hold instead of a charge), not Peti's bank account.

**Questions for a lawyer**

1. Is pooled collection plus manual UPI payouts permitted for a marketplace of Peti's size? If not, which
   structures are?
2. May Peti hold refundable security deposits at all, and where must that money sit?
3. If owners must be onboarded with the aggregator, what KYC does each owner have to complete?

## 2. Razorpay Route (the split-settlement product)

| Statement                                                                                                                                     | Level    | Source                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| Route needs domestic turnover above ₹40 lakh (or export turnover above ₹5 lakh) in FY 2025–26 or FY 2024–25.                                  | Official | [Razorpay Route FAQ](https://razorpay.com/docs/payments/route/faqs.md) |
| Razorpay ties these criteria to the RBI's September 2025 directions, and ended Route on 1 January 2026 for businesses that did not meet them. | Official | [Razorpay Route](https://razorpay.com/docs/payments/route/)            |
| Route pays "linked accounts"; a linked vendor company with turnover above ₹20 lakh must give a GSTIN.                                         | Official | [Razorpay Route docs](https://razorpay.com/docs/payments/route.md)     |

**How this applies to Peti (assumptions)**

- A new business cannot meet the turnover test, so **Route is not available to Peti at launch**.
- Options to raise with a lawyer and with the payment providers: another authorised aggregator's marketplace
  product with different entry criteria; a model in which the renter pays the owner directly and Peti charges
  only its own fee; or operating under a partner that already qualifies.
- **In the code:** payouts stay manual (`/admin/payouts`). No Route integration exists, and none should be
  written until the structure is decided, because the structure decides the data model.

## 3. GST

| Statement                                                                                                                                                                                  | Level     | Source                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An e-commerce operator collects tax at source (TCS) under section 52 of the CGST Act on the net value of taxable supplies made through it by other suppliers, where it collects the money. | Secondary | [ClearTax](https://cleartax.in/s/tcs-under-goods-and-services-tax)                                                                                                                                                                                                                        |
| The TCS rate is 0.5% (0.25% CGST + 0.25% SGST, or 0.5% IGST) from 10 July 2024, under Notification 15/2024-Central Tax. It was 1% before.                                                  | Secondary | [Taxmann](https://www.taxmann.com/post/blog/ecos-to-collect-0-5-tcs-on-net-value-of-taxable-supplies-made-through-it-by-other-suppliers-notification/), [Mondaq](https://www.mondaq.com/india/sales-taxes-vat-gst/1516974/reduction-in-rate-of-gst-collected-by-the-e-commerce-operators) |
| People supplying **services** through an e-commerce operator are exempt from registration while their all-India turnover is at or below ₹20 lakh (₹10 lakh in special-category states).    | Official  | [Notification 65/2017-Central Tax](https://gstcouncil.gov.in/sites/default/files/2024-05/notfctn-65-central-tax-english.pdf)                                                                                                                                                              |

**How this applies to Peti (assumptions)**

- Peti collects the consideration, so Peti is probably an **e-commerce operator that must register for GST
  whatever its turnover** (section 24) and file the TCS return (GSTR-8) monthly.
- Renting out a garment is probably a **supply of services** by the owner. Most owners would then be under
  the ₹20 lakh threshold and need no GST registration. Whether TCS is still due on supplies by unregistered
  owners must be confirmed.
- **Peti's commission** is Peti's own supply of a service to the owner and is probably taxable at 18%, which
  changes either the commission the owner sees or Peti's margin.
- The security deposit is probably not consideration while it is refundable, and becomes consideration for
  the part that is withheld.
- **In the code:** nothing computes, shows or records GST or TCS. Prices are tax-free integers.

**Questions for a chartered accountant**

1. Is Peti an e-commerce operator under section 2(45), and must it register before the first transaction?
2. Is clothing rental a supply of services, at what rate, and is TCS due when the owner is unregistered?
3. How is the commission invoiced to owners, and is GST on it charged on top or absorbed?
4. How are withheld deposits (late fees, damage) treated?

## 4. Income-tax TDS on owners' earnings

| Statement                                                                                                                                                              | Level     | Source                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Income-tax Act, 2025 replaced the 1961 Act from 1 April 2026. The e-commerce TDS rule (section 194-O of the old Act) now sits in the table under section 393(1).   | Secondary | [TDSMAN](https://blog.tdsman.com/2026/11/tds-on-e-commerce-transactions-section-3931-194o/), [ClearTax](https://cleartax.in/s/tds-and-tcs-changes-from-april-2026)                                                                                 |
| An e-commerce operator deducts 0.1% of the gross amount of sales or services it facilitates for a resident participant.                                                | Secondary | [Zoho Books](https://www.zoho.com/in/books/academy/taxes-and-compliance/income-tax-act-tds-tcs-updates-india.html), [India Briefing](https://india-briefing.com/news/section-393-income-tax-act-2025-tds-rules-rates-compliance-guide-44450.html/) |
| No deduction for an individual or HUF participant whose gross amount through the operator is at or below ₹5 lakh in the year, if they have given their PAN or Aadhaar. | Secondary | Same                                                                                                                                                                                                                                               |

The sources disagree on the row number inside the section 393(1) table. The rate without a PAN (5% under the
old Act) was not re-checked under the new Act.

**How this applies to Peti (assumptions)**

- Almost every owner will be an individual earning far less than ₹5 lakh a year through Peti, so **no tax is
  deducted, provided Peti holds their PAN or Aadhaar**. Without it, tax would be deducted at a much higher
  rate on every payout.
- Peti would need a TAN, quarterly TDS returns, and certificates for anyone it deducts from.
- **In the code:** owners give a UPI ID and a name only. There is no PAN field, no yearly running total per
  owner, no deduction on the payout and no certificate.

**Questions for a chartered accountant**

1. Does this rule apply to rentals facilitated by Peti, and from the first rupee?
2. Must Peti collect a PAN from every owner before the first payout?
3. Is the "gross amount" the rental fee, or does it include withheld deposit amounts?

## 5. Consumer protection

The Consumer Protection (E-Commerce) Rules, 2020 apply to marketplace e-commerce entities.

| Statement                                                                                                                  | Level     | Source                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Every e-commerce entity appoints a grievance officer, acknowledges a complaint within 48 hours and resolves it in a month. | Secondary | [Mondaq](https://www.mondaq.com/india/dodd-frank-consumer-protection-act/985606/the-consumer-protection-e-commerce-rules-2020)                |
| The grievance officer's name, contact details and designation are shown on the platform.                                   | Secondary | Same                                                                                                                                          |
| A marketplace shows its legal name, address and customer-care contact, and takes an undertaking from each seller.          | Secondary | [Lakshmikumaran & Sridharan](https://cn.lakshmisri.com/newsroom/news-briefings/e-commerce-consumer-protection-e-commerce-rules-2020-notified) |

**How this applies to Peti (assumptions)**

- Owners who rent out occasionally may or may not be "sellers" under the Rules; this needs an answer.
- **In the code:** `/terms` and `/privacy` exist as pages, a renter's acceptance of the terms is recorded on
  the booking with the terms version, and disputes have a workflow. There is **no** grievance officer, no
  published legal entity or address, no complaint-acknowledgement deadline, and no seller undertaking.

## 6. Personal data (DPDP Act, 2023 and DPDP Rules, 2025)

| Statement                                                                                                                                             | Level     | Source                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The DPDP Rules, 2025 were notified on 13–14 November 2025 (sources differ by a day).                                                                  | Secondary | [AZB & Partners](https://www.azbpartners.com/bank/update-indias-digital-personal-data-protection-framework-comes-into-effect/)                                                                                                                  |
| Commencement is phased: the Data Protection Board at once; consent managers after one year; the main obligations after 18 months (about 13 May 2027). | Secondary | [SCC Online](https://www.scconline.com/blog/post/2025/12/26/digital-personal-data-protection-rules-2025-key-highlights/), [India Briefing](https://www.india-briefing.com/news/dpdp-rules-2025-india-data-protection-law-compliance-40769.html) |
| A personal-data breach is reported to affected people without delay and to the Board within 72 hours of becoming aware of it.                         | Secondary | Same                                                                                                                                                                                                                                            |

**How this applies to Peti (assumptions)**

- Peti is a data fiduciary. It stores names, email addresses, mobile numbers, addresses, UPI IDs, photos of
  garments and of their condition, messages and booking history.
- The main obligations start in about six months. They include a clear notice and consent, the right to
  correct and erase, limits on retention, reasonable security, breach reporting, a grievance route, and
  verifiable parental consent before processing a child's data.
- **In the code:** passwords and verification codes are hashed, payer details are stripped from stored
  webhooks, private photos are served only to the people in the rental, and admin actions are audit-logged.
  There is **no** consent record for the privacy notice, no account deletion or data export, no retention
  schedule, no breach procedure and no age check.

## 7. The rental contract and liability

Not researched; listed so it is not forgotten. A lawyer should draft or review:

- the terms between owner and renter (whose contract it is, and Peti's role as an intermediary);
- the deposit, late-fee and damage rules, including the caps and the evidence standard already implemented
  in the booking workflow;
- Peti's liability for loss, damage, hygiene and misdescription, and what insurance is needed;
- the cancellation and refund policy shown to renters, which the settlement code implements exactly;
- Peti's duties as an online intermediary under the Information Technology Act and its rules (takedown,
  grievance handling);
- whether any stamp duty or registration applies to the rental agreement.

## 8. KYC

- **Assumption:** no law requires Peti itself to verify the identity of renters or owners, but the payment
  aggregator will require it of Peti as a merchant and, under a split-settlement product, of every owner.
- Identity verification of owners is also the practical answer to fraud and to the PAN requirement in
  section 4.
- **In the code:** email and mobile number are verified; there is no identity document check. The audit
  recommended one before launch, and it is still open.

## What the code already assumes

| Assumption in the code                                     | Where                                       | Depends on   |
| ---------------------------------------------------------- | ------------------------------------------- | ------------ |
| Peti collects the fee and the deposit into its own account | `payments`, `security_deposits`             | Section 1    |
| Owners are paid by hand, by UPI, after settlement          | `payouts`, `/admin/payouts`                 | Sections 1–2 |
| Commission is 15% of the retained fee, with no tax         | `config/marketplace-policy.ts`, settlement  | Section 3    |
| A payout is the net amount, with nothing deducted          | `payouts.net_paise`                         | Section 4    |
| A renter accepts the terms when requesting a booking       | `bookings.terms_version`, `policy_snapshot` | Section 7    |

If section 1 changes the settlement model, the tables that hold money change with it. That is why this
review comes before any further payout work.
