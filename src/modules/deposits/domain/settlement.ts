import {
  type Paise,
  addPaise,
  applyBasisPoints,
  basisPoints,
  paise,
  subtractPaise,
} from "@/shared/domain/money";

export type DepositOutcome = "RELEASED" | "PARTIALLY_WITHHELD" | "FORFEITED";

export interface SettlementInput {
  rentalFeePaise: number;
  depositPaise: number;
  commissionRateBps: number;
  /** F: the part of the rental fee the owner keeps (0 … fee). */
  retainedFeePaise: number;
  /** Late fee withheld from the deposit. */
  lateFeePaise: number;
  /** Damage or other claim withheld from the deposit. */
  damagePaise: number;
}

export interface Settlement {
  refund: { totalPaise: Paise; rentalFeePortionPaise: Paise; depositPortionPaise: Paise };
  commissionPaise: Paise;
  payout: {
    grossRentalPaise: Paise;
    commissionPaise: Paise;
    depositWithheldPaise: Paise;
    netPaise: Paise;
  } | null;
  deposit: { status: DepositOutcome; lateFeePaise: Paise; damagePaise: Paise; withheldPaise: Paise };
}

export class InvalidSettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSettlementError";
  }
}

/**
 * The single settlement function used by every exit from a paid booking (docs/architecture/
 * payment-architecture.md). Conservation holds by construction:
 *   refund + payout net + commission = rental fee + deposit (= captured amount).
 * Commission applies only to the retained rental fee; deposit deductions go to the owner in full.
 */
export function settle(input: SettlementInput): Settlement {
  const fee = paise(input.rentalFeePaise);
  const deposit = paise(input.depositPaise);
  const retained = paise(input.retainedFeePaise);
  const late = paise(input.lateFeePaise);
  const damage = paise(input.damagePaise);
  if (retained > fee) throw new InvalidSettlementError("Retained fee cannot exceed the rental fee");
  const withheld = addPaise(late, damage);
  if (withheld > deposit) throw new InvalidSettlementError("Withheld amount cannot exceed the deposit");

  const commission = applyBasisPoints(retained, basisPoints(input.commissionRateBps));
  const feeRefund = subtractPaise(fee, retained);
  const depositRefund = subtractPaise(deposit, withheld);
  const net = paise(retained - commission + withheld);

  return {
    refund: {
      totalPaise: addPaise(feeRefund, depositRefund),
      rentalFeePortionPaise: feeRefund,
      depositPortionPaise: depositRefund,
    },
    commissionPaise: commission,
    payout:
      retained === 0 && withheld === 0
        ? null
        : {
            grossRentalPaise: retained,
            commissionPaise: commission,
            depositWithheldPaise: withheld,
            netPaise: net,
          },
    deposit: {
      status: withheld === 0 ? "RELEASED" : withheld === deposit ? "FORFEITED" : "PARTIALLY_WITHHELD",
      lateFeePaise: late,
      damagePaise: damage,
      withheldPaise: withheld,
    },
  };
}
