import { priceMap } from "./prices";
import { valueSandbox, type PaperSandbox, type PaperTrade, type PaperValuation } from "./sandbox";

/** The one shape both the sandbox pages and the paper API hand to the UI. */
export interface SandboxView {
  valuation: PaperValuation;
  /** Newest first — this is the tester's own trade log. */
  trades: PaperTrade[];
  marks: Array<[number, number]>;
}

export async function buildSandboxView(
  sb: PaperSandbox,
  extraSymbols: string[] = []
): Promise<SandboxView> {
  const prices = await priceMap([...sb.positions.map((p) => p.symbol), ...extraSymbols]);
  return {
    valuation: valueSandbox(sb, prices),
    trades: [...sb.trades].reverse(),
    marks: sb.marks,
  };
}
