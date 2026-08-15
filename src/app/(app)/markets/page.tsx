import LiveTicker from "@/components/live/LiveTicker";
import LiveChart from "@/components/live/LiveChart";
import MarketMovers from "@/components/live/MarketMovers";
import OrderPanel from "@/components/live/OrderPanel";
import { LiveDot } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Live Markets terminal — the ProTrader Terminal layout from landing.html,
 * rebuilt with real-time data: index ticker cards, a live SPY chart, an
 * order calculator, and a live market-movers table.
 */
export default function MarketsPage() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-on-surface">Live Markets</h1>
        <span className="flex items-center gap-2 font-mono text-[12px] text-on-surface-variant">
          <LiveDot /> real-time · auto-refresh
        </span>
      </div>

      <LiveTicker />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <LiveChart symbol="SPY" />
        </div>
        <div className="lg:col-span-4">
          <OrderPanel />
        </div>
      </div>

      <MarketMovers />
    </div>
  );
}
